/**
 * Meal Plans Service
 *
 * Server-side service for meal plan persistence, loading, and regeneration.
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/src/lib/supabase/server';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import { ProfileService } from '@/src/lib/profile/profile.service';
import { AppError } from '@/src/lib/errors/app-error';
import type {
  MealPlanRequest,
  MealPlanResponse,
  Meal,
  MealPlanDay,
  DietRuleSet,
} from '@/src/lib/diets';
import type { TherapeuticSupplementsSummary } from '@/src/lib/diets/diet.types';
import type { MealPlanEnrichmentResponse } from '@/src/lib/meal-plans/enrichment.types';
import {
  translateMeals,
  translateEnrichment,
} from '@/src/lib/meal-history/mealTranslation.service';
import type {
  MealPlanRecord,
  CreateMealPlanInput,
  RegenerateMealPlanInput,
} from './mealPlans.types';
import {
  getActiveTherapeuticProfileForUser,
  getProtocolSupplements,
  getApplicableProtocolSupplementRules,
  getHealthProfileForUser,
  getActiveTherapeuticOverridesForUser,
  ageYearsFromBirthDate,
} from '@/src/lib/therapeutic/therapeuticProfile.service';
/** Explicit columns for meal_plans list (overview) — keeps return shape compatible with MealPlanRecord */
const MEAL_PLAN_LIST_COLUMNS =
  'id,user_id,diet_key,date_from,days,request_snapshot,rules_snapshot,plan_snapshot,enrichment_snapshot,status,draft_plan_snapshot,draft_created_at,applied_at,created_at,updated_at';

/** Explicit columns for meal_plans load (detail) — snapshots + metadata */
const MEAL_PLAN_DETAIL_COLUMNS =
  'id,user_id,diet_key,date_from,days,request_snapshot,rules_snapshot,plan_snapshot,enrichment_snapshot,status,draft_plan_snapshot,draft_created_at,applied_at,created_at,updated_at';

/** Explicit columns for meal_history (recipe candidates for prefilledBySlot) — no SELECT * */
const _MEAL_HISTORY_CANDIDATE_COLUMNS =
  'id,meal_id,meal_name,meal_slot,meal_data,combined_score,user_rating,last_used_at,updated_at';

/** Explicit columns for custom_meals (recipe candidates for prefilledBySlot) — no SELECT * */
const _CUSTOM_MEALS_CANDIDATE_COLUMNS =
  'id,name,meal_slot,weekmenu_slots,meal_data,consumption_count,updated_at';

/** Columns for recipe_ingredients when building ingredientRefs for prefill (imported recipes have empty meal_data.ingredientRefs) */
const _RECIPE_INGREDIENTS_NEVO_COLUMNS =
  'recipe_id,nevo_food_id,quantity,unit,name';

/** Explicit columns for user_preferences (no SELECT *) */
const _USER_PREFS_FAVORITES_AND_HOUSEHOLD_COLUMNS =
  'favorite_meal_ids,household_id';

/** Explicit columns for household_avoid_rules (no SELECT *) */
const _HOUSEHOLD_AVOID_RULES_COLUMNS =
  'rule_type,match_mode,match_value,strictness';

/** Minimal columns for user_preferences when resolving household for servings scaling */
const _USER_PREFS_HOUSEHOLD_COLUMN = 'household_id';

/** Minimal columns for households servings (no SELECT *) */
const _HOUSEHOLDS_SERVINGS_COLUMNS = 'household_size,servings_policy';

/** Minimal columns for user_preferences meal-slot style prefs (no SELECT *) */
const _USER_PREFS_SLOT_STYLE_COLUMNS =
  'preferred_breakfast_style,preferred_lunch_style,preferred_dinner_style';

/** Minimal columns for user_preferences weekend dinner override (no SELECT *) */
const _USER_PREFS_WEEKEND_OVERRIDE_COLUMNS =
  'preferred_weekend_dinner_style,weekend_days';

/** Normalize slot style: null/empty/'any' → no preference (undefined). */
function _normalizeSlotStyle(v: string | null | undefined): string | undefined {
  if (v == null || typeof v !== 'string') return undefined;
  const t = v.trim();
  if (t === '' || t === 'any') return undefined;
  return t;
}

/** Normalize weekend days: only 0 (Sun) and/or 6 (Sat); default [0, 6] if empty/invalid. */
function _normalizeWeekendDays(v: number[] | null | undefined): number[] {
  if (!Array.isArray(v) || v.length === 0) return [0, 6];
  const allowed = v.filter((d) => d === 0 || d === 6);
  const unique = [...new Set(allowed)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : [0, 6];
}

/** Hard-block rulesets for prefill filtering (household_avoid_rules strictness='hard') */
type HouseholdBlockRules = {
  blockedNevoCodes: Set<string>;
  blockedTerms: Set<string>;
};

/** Per-slot provenance: source and reason when AI was used (DB-first flow only). */
export type SlotProvenanceReason =
  | 'no_candidates'
  | 'repeat_window_blocked'
  | 'missing_ingredient_refs'
  | 'all_candidates_blocked_by_constraints'
  | 'ai_candidate_blocked_by_constraints';

export type SlotProvenanceEntry = {
  source: 'db' | 'ai' | 'history';
  reason?: SlotProvenanceReason;
};

/**
 * Minimal settings for DB-first plan generation. Template/pool/naming config is never read or passed.
 * Future: may be loaded from DB (admin); for now defaults only.
 */
export type DbFirstPlanSettings = {
  /** Same meal not repeated within this many days for the same slot (default 7). */
  repeatWindowDays: number;
  /** 'strict': no AI fill — throw MEAL_PLAN_INSUFFICIENT_CANDIDATES when any slot is missing. 'normal': AI fills missing slots (default). */
  aiFillMode: 'strict' | 'normal';
};

const _DEFAULT_DB_FIRST_SETTINGS: DbFirstPlanSettings = {
  repeatWindowDays: 7,
  aiFillMode: 'normal',
};

/**
 * True if meal is blocked by household hard rules (NEVO code or term in name).
 */
function _isMealBlockedByHouseholdRules(
  meal: Meal,
  mealName: string,
  rules: HouseholdBlockRules,
): boolean {
  if (rules.blockedNevoCodes.size > 0 && meal.ingredientRefs?.length) {
    for (const ref of meal.ingredientRefs) {
      const code = String(ref?.nevoCode ?? '').trim();
      if (code && rules.blockedNevoCodes.has(code)) return true;
    }
  }
  if (rules.blockedTerms.size > 0 && mealName) {
    const nameLower = mealName.toLowerCase();
    for (const term of rules.blockedTerms) {
      if (term && nameLower.includes(term.toLowerCase())) return true;
    }
  }
  return false;
}

/**
 * True if meal contains an allergen or disliked ingredient (for prefill filtering).
 * Checks ingredient displayNames and meal name against allergies (block) and dislikes (block).
 */
function _isMealBlockedByAllergiesOrDislikes(
  meal: Meal,
  allergies: string[],
  dislikes: string[],
): boolean {
  const terms = [...allergies, ...dislikes]
    .map((t) => t?.trim().toLowerCase())
    .filter(Boolean);
  if (terms.length === 0) return false;
  const nameLower = (meal.name ?? '').toLowerCase();
  for (const term of terms) {
    if (term && nameLower.includes(term)) return true;
  }
  for (const ref of meal.ingredientRefs ?? []) {
    if (ref == null) continue;
    const displayLower = (ref.displayName ?? '').toLowerCase();
    for (const term of terms) {
      if (term && displayLower.includes(term)) return true;
    }
  }
  return false;
}

/**
 * Scale meal plan to household size: clone days/meals/ingredientRefs immutably,
 * set meal.servings = householdSize and scale each ingredientRef.quantityG by factor.
 * Adds plan.metadata.servings = { householdSize, policy }.
 */
function _scaleMealPlanToHousehold(
  plan: MealPlanResponse,
  householdSize: number,
  policy: string,
): MealPlanResponse {
  const scaledDays: MealPlanDay[] = plan.days.map((day) => ({
    ...day,
    meals: day.meals.map((meal) => {
      const baseServings = meal.servings ?? 1;
      const factor = baseServings > 0 ? householdSize / baseServings : 1;
      const scaledRefs = (meal.ingredientRefs ?? [])
        .filter((ref): ref is NonNullable<typeof ref> => ref != null)
        .map((ref) => ({
          ...ref,
          quantityG: Math.max(1, Math.round((ref.quantityG ?? 0) * factor)),
        }));
      return {
        ...meal,
        servings: householdSize,
        ingredientRefs: scaledRefs,
      };
    }),
  }));

  const metadata = {
    ...(plan.metadata ?? {}),
    servings: { householdSize, policy },
  };

  return {
    ...plan,
    days: scaledDays,
    metadata: metadata as MealPlanResponse['metadata'],
  };
}

const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 } as const;

/**
 * Build therapeutic supplements summary for plan metadata (agent path only).
 * Uses active profile + applicable rules; no when_json in output, only counts + max 3 message_nl.
 */
async function _buildTherapeuticSupplementsSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<TherapeuticSupplementsSummary | null> {
  const active = await getActiveTherapeuticProfileForUser(supabase, userId);
  if (!active) return null;

  const protocolId = active.profile.protocol_id;
  const protocolRow = active.protocol;

  const [supplements, healthRow, overrides] = await Promise.all([
    getProtocolSupplements(supabase, protocolId),
    getHealthProfileForUser(supabase, userId),
    getActiveTherapeuticOverridesForUser(supabase, userId),
  ]);

  const rawVersion =
    protocolRow.version != null && protocolRow.version !== ''
      ? protocolRow.version
      : null;
  const protocolVersion =
    rawVersion != null
      ? (() => {
          const n = Number(rawVersion);
          return Number.isNaN(n) ? undefined : n;
        })()
      : undefined;
  const sex =
    healthRow?.sex &&
    ['female', 'male', 'other', 'unknown'].includes(healthRow.sex)
      ? (healthRow.sex as 'female' | 'male' | 'other' | 'unknown')
      : undefined;
  const ctx = {
    sex,
    ageYears: ageYearsFromBirthDate(healthRow?.birth_date ?? null),
    heightCm: healthRow?.height_cm ?? undefined,
    weightKg:
      healthRow?.weight_kg != null ? Number(healthRow.weight_kg) : undefined,
    overrides: overrides ?? undefined,
    dietKey: undefined as string | undefined,
    protocolKey: protocolRow.protocol_key ?? undefined,
    protocolVersion,
  };

  const { rules: applicableRules } = await getApplicableProtocolSupplementRules(
    supabase,
    protocolId,
    ctx,
  );

  const totalSupplements = supplements.length;
  const totalApplicableRules = applicableRules.length;
  const warnCount = applicableRules.filter((r) => r.severity === 'warn').length;
  const errorCount = applicableRules.filter(
    (r) => r.severity === 'error',
  ).length;

  const sortedBySeverity = [...applicableRules].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity as keyof typeof SEVERITY_ORDER] ?? 3) -
      (SEVERITY_ORDER[b.severity as keyof typeof SEVERITY_ORDER] ?? 3),
  );
  const topMessagesNl = sortedBySeverity
    .slice(0, 3)
    .map((r) =>
      typeof r.message_nl === 'string' && r.message_nl.trim() !== ''
        ? r.message_nl.trim()
        : null,
    )
    .filter((m): m is string => m != null);

  return {
    totalSupplements,
    totalApplicableRules,
    warnCount,
    errorCount,
    topMessagesNl,
  };
}

/** Guardrails meta from plan.metadata.guardrails (no PII, for run logging). */
function _getGuardrailsRunMeta(plan: MealPlanResponse): {
  constraintsInPrompt: boolean;
  guardrailsContentHash: string | null;
  guardrailsVersion: string | null;
} {
  const guardrails = (plan.metadata as Record<string, unknown> | undefined)
    ?.guardrails as
    | {
        constraintsInPrompt?: boolean;
        contentHash?: string | null;
        version?: string | null;
      }
    | undefined;
  if (!guardrails) {
    return {
      constraintsInPrompt: false,
      guardrailsContentHash: null,
      guardrailsVersion: null,
    };
  }
  return {
    constraintsInPrompt: guardrails.constraintsInPrompt === true,
    guardrailsContentHash:
      typeof guardrails.contentHash === 'string'
        ? guardrails.contentHash
        : null,
    guardrailsVersion:
      typeof guardrails.version === 'string' ? guardrails.version : null,
  };
}

/**
 * Log a meal plan run. Model is resolved from runType via GEMINI_MODEL_* env (see gemini.client.ts).
 * When supabaseAdmin is provided (system/cron path), uses that client instead of createClient().
 * Optional guardrails meta (no PII) for observability.
 */
async function _logMealPlanRun(
  args: {
    userId: string;
    mealPlanId: string | null;
    runType: 'generate' | 'regenerate' | 'enrich';
    status: 'running' | 'success' | 'error';
    durationMs: number;
    errorCode?: string;
    errorMessage?: string;
    constraintsInPrompt?: boolean;
    guardrailsContentHash?: string | null;
    guardrailsVersion?: string | null;
  },
  supabaseAdmin?: SupabaseClient,
): Promise<void> {
  const supabase = supabaseAdmin ?? (await createClient());
  const model = getGeminiClient().getModelName(
    args.runType === 'enrich' ? 'enrich' : 'plan',
  );

  await supabase.from('meal_plan_runs').insert({
    user_id: args.userId,
    meal_plan_id: args.mealPlanId,
    run_type: args.runType,
    model,
    status: args.status,
    duration_ms: args.durationMs,
    error_code: args.errorCode ?? null,
    error_message: args.errorMessage ?? null,
    constraints_in_prompt: args.constraintsInPrompt ?? false,
    guardrails_content_hash: args.guardrailsContentHash ?? null,
    guardrails_version: args.guardrailsVersion ?? null,
  });
}

/**
 * Meal Plans Service
 */
export class MealPlansService {
  /**
   * Check if user is within quota (10 runs per hour)
   *
   * @param userId - User ID
   * @param supabaseAdmin - Optional; when provided (system path) uses this client
   * @throws AppError with RATE_LIMIT code if quota exceeded
   */
  private async assertWithinQuota(
    userId: string,
    supabaseAdmin?: SupabaseClient,
  ): Promise<void> {
    const supabase = supabaseAdmin ?? (await createClient());

    // Count runs in last hour (excluding "running" status to avoid counting incomplete runs)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from('meal_plan_runs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('run_type', ['generate', 'regenerate'])
      .in('status', ['success', 'error']) // Only count completed runs
      .gte('created_at', oneHourAgo);

    if (error) {
      // If query fails, allow operation (fail open for quota)
      console.error('Error checking quota:', error);
      return;
    }

    const runCount = count || 0;
    if (runCount >= 10) {
      throw new AppError(
        'RATE_LIMIT',
        'Too many requests. You can generate or regenerate up to 10 meal plans per hour. Please try again later.',
      );
    }
  }

  /**
   * Clean up stale "running" runs (older than 10 minutes)
   *
   * @param userId - User ID
   * @param supabaseAdmin - Optional; when provided (system path) uses this client
   */
  private async cleanupStaleRuns(
    userId: string,
    supabaseAdmin?: SupabaseClient,
  ): Promise<void> {
    const supabase = supabaseAdmin ?? (await createClient());

    // Find runs with "running" status older than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('meal_plan_runs')
      .update({
        status: 'error',
        error_code: 'TIMEOUT',
        error_message: 'Run timed out or was abandoned',
      })
      .eq('user_id', userId)
      .eq('status', 'running')
      .in('run_type', ['generate', 'regenerate'])
      .lt('created_at', tenMinutesAgo);

    if (error) {
      // Log but don't fail - cleanup is best effort
      console.error('Error cleaning up stale runs:', error);
    }
  }

  /**
   * Check if there's an active run for the user (concurrency lock)
   *
   * @param userId - User ID
   * @param mealPlanId - Optional meal plan ID (for regenerate)
   * @param supabaseAdmin - Optional; when provided (system path) uses this client
   * @throws AppError with CONFLICT code if active run exists
   */
  private async assertNoActiveRun(
    userId: string,
    mealPlanId?: string,
    supabaseAdmin?: SupabaseClient,
  ): Promise<void> {
    const supabase = supabaseAdmin ?? (await createClient());

    // First, clean up stale runs
    await this.cleanupStaleRuns(userId, supabaseAdmin);

    // Check for runs with "running" status in last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    let query = supabase
      .from('meal_plan_runs')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'running')
      .in('run_type', ['generate', 'regenerate'])
      .gte('created_at', tenMinutesAgo);

    // If mealPlanId provided, also check for that specific plan
    if (mealPlanId) {
      query = query.or(`meal_plan_id.is.null,meal_plan_id.eq.${mealPlanId}`);
    }

    const { data, error } = await query.limit(1);

    if (error) {
      // If query fails, allow operation (fail open for concurrency)
      console.error('Error checking active run:', error);
      return;
    }

    if (data && data.length > 0) {
      throw new AppError(
        'CONFLICT',
        'A generation is already in progress. Please wait for it to complete.',
      );
    }
  }
  /**
   * Create a new meal plan for a user.
   * When supabaseAdmin is provided (e.g. system/cron runner), uses that client for all DB access.
   *
   * @param userId - User ID
   * @param input - Create meal plan input
   * @param supabaseAdmin - Optional service-role client for server-only/system runs
   * @returns Plan ID and optional dbCoverage/dbCoverageBelowTarget/fallbackReasons from plan metadata
   */
  async createPlanForUser(
    _userId: string,
    _input: CreateMealPlanInput,
    _supabaseAdmin?: SupabaseClient,
  ): Promise<{
    planId: string;
    dbCoverage?: {
      dbSlots: number;
      totalSlots: number;
      percent: number;
    };
    dbCoverageBelowTarget?: boolean;
    fallbackReasons?: { reason: string; count: number }[];
    debug?: { runId: string; logFileRelativePath?: string };
  }> {
    throw new AppError(
      'FEATURE_DISABLED',
      'Meal plan generatie is tijdelijk uitgeschakeld.',
    );
  }

  /**
   * Load a meal plan for a user
   *
   * @param userId - User ID
   * @param planId - Plan ID
   * @param translateToUserLanguage - If true, translate meals to user's language preference (default: false to avoid blocking)
   * @returns Meal plan record
   */
  async loadPlanForUser(
    userId: string,
    planId: string,
    translateToUserLanguage: boolean = false,
  ): Promise<MealPlanRecord> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('meal_plans')
      .select(MEAL_PLAN_DETAIL_COLUMNS)
      .eq('id', planId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new Error(
        `Meal plan not found: ${error?.message || 'Unknown error'}`,
      );
    }

    let planSnapshot = data.plan_snapshot as MealPlanResponse;
    let enrichmentSnapshot = data.enrichment_snapshot as Record<
      string,
      unknown
    >;

    // Translate meals and enrichment to user's language if requested
    // NOTE: Translation is disabled by default to avoid blocking page loads and quota issues
    // New meals are already generated in the correct language via prompts
    if (translateToUserLanguage) {
      try {
        const profileService = new ProfileService();
        const userLanguage = await profileService.getUserLanguage(userId);

        // Extract all meals from plan
        const allMeals: import('@/src/lib/diets').Meal[] = [];
        for (const day of planSnapshot.days) {
          allMeals.push(...day.meals);
        }

        // Translate meals (with error handling for quota)
        try {
          const translatedMeals = await translateMeals(allMeals, userLanguage);

          // Create a map for quick lookup
          const translatedMap = new Map(translatedMeals.map((m) => [m.id, m]));

          // Update plan with translated meals
          planSnapshot = {
            ...planSnapshot,
            days: planSnapshot.days.map((day) => ({
              ...day,
              meals: day.meals.map(
                (meal) => translatedMap.get(meal.id) || meal,
              ),
            })),
          };
        } catch (mealTranslationError) {
          // Skip translation if quota exceeded - use original meals
          if (
            mealTranslationError instanceof Error &&
            mealTranslationError.message.includes('quota')
          ) {
            // Silently skip - quota exceeded
          } else {
            console.warn(
              'Failed to translate meals, using original:',
              mealTranslationError,
            );
          }
        }

        // Translate enrichment if present (with error handling for quota)
        if (enrichmentSnapshot) {
          try {
            enrichmentSnapshot = await translateEnrichment(
              enrichmentSnapshot as MealPlanEnrichmentResponse,
              userLanguage,
            );
          } catch (enrichmentTranslationError) {
            // Skip translation if quota exceeded - use original enrichment
            if (
              enrichmentTranslationError instanceof Error &&
              enrichmentTranslationError.message.includes('quota')
            ) {
              // Silently skip - quota exceeded
            } else {
              console.warn(
                'Failed to translate enrichment, using original:',
                enrichmentTranslationError,
              );
            }
          }
        }
      } catch (translationError) {
        // Catch-all for any other translation errors
        // Don't log quota errors - they're expected and handled above
        if (
          !(
            translationError instanceof Error &&
            translationError.message.includes('quota')
          )
        ) {
          console.warn(
            'Translation failed, using original plan:',
            translationError,
          );
        }
      }
    }

    // Map snake_case to camelCase (status/draft fields: robust when columns missing or null)
    const rawStatus = (data as { status?: string }).status;
    const status: MealPlanRecord['status'] | undefined =
      rawStatus === 'draft' ||
      rawStatus === 'applied' ||
      rawStatus === 'archived'
        ? rawStatus
        : undefined;
    return {
      id: data.id,
      userId: data.user_id,
      dietKey: data.diet_key,
      dateFrom: data.date_from,
      days: data.days,
      requestSnapshot: data.request_snapshot as MealPlanRequest,
      rulesSnapshot: data.rules_snapshot as DietRuleSet,
      planSnapshot,
      enrichmentSnapshot:
        enrichmentSnapshot as MealPlanEnrichmentResponse | null,
      status,
      draftPlanSnapshot:
        (data as { draft_plan_snapshot?: MealPlanResponse | null })
          .draft_plan_snapshot ?? null,
      draftCreatedAt:
        (data as { draft_created_at?: string | null }).draft_created_at ?? null,
      appliedAt: (data as { applied_at?: string | null }).applied_at ?? null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Delete a meal plan for a user
   *
   * @param userId - User ID
   * @param planId - Plan ID to delete
   * @throws if no row was deleted (plan not found or RLS blocked)
   */
  async deletePlanForUser(userId: string, planId: string): Promise<void> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('meal_plans')
      .delete()
      .eq('id', planId)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      throw new Error(`Failed to delete meal plan: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error(
        'Weekmenu niet gevonden of je hebt geen rechten om het te verwijderen.',
      );
    }
  }

  /**
   * List meal plans for a user
   *
   * @param userId - User ID
   * @param limit - Maximum number of plans to return
   * @returns Array of meal plan records
   */
  async listPlansForUser(
    userId: string,
    limit: number = 20,
  ): Promise<MealPlanRecord[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('meal_plans')
      .select(MEAL_PLAN_LIST_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list meal plans: ${error.message}`);
    }

    // Map snake_case to camelCase (status/draft fields: robust when columns missing or null)
    return (data || []).map((row) => {
      const rowStatus = (row as { status?: string }).status;
      const status =
        rowStatus === 'draft' ||
        rowStatus === 'applied' ||
        rowStatus === 'archived'
          ? (rowStatus as MealPlanRecord['status'])
          : undefined;
      return {
        id: row.id,
        userId: row.user_id,
        dietKey: row.diet_key,
        dateFrom: row.date_from,
        days: row.days,
        requestSnapshot: row.request_snapshot as MealPlanRequest,
        rulesSnapshot: row.rules_snapshot as DietRuleSet,
        planSnapshot: row.plan_snapshot as MealPlanResponse,
        enrichmentSnapshot:
          row.enrichment_snapshot as MealPlanEnrichmentResponse | null,
        status,
        draftPlanSnapshot:
          (row as { draft_plan_snapshot?: MealPlanResponse | null })
            .draft_plan_snapshot ?? null,
        draftCreatedAt:
          (row as { draft_created_at?: string | null }).draft_created_at ??
          null,
        appliedAt: (row as { applied_at?: string | null }).applied_at ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  /**
   * Regenerate a meal plan (full or single day)
   *
   * @param userId - User ID
   * @param input - Regenerate input
   * @returns Plan ID (same plan, updated)
   */
  async regeneratePlanForUser(
    _userId: string,
    _input: RegenerateMealPlanInput,
  ): Promise<{ planId: string }> {
    throw new AppError(
      'FEATURE_DISABLED',
      'Meal plan regeneratie is tijdelijk uitgeschakeld.',
    );
  }
}
