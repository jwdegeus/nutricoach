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
import { MealPlannerAgentService } from '@/src/lib/agents/meal-planner';
import { MealPlannerEnrichmentService } from '@/src/lib/agents/meal-planner';
import { AppError } from '@/src/lib/errors/app-error';
import type {
  MealPlanRequest,
  MealPlanResponse,
  MealSlot,
  DietKey,
  Meal,
  MealPlanDay,
  DietRuleSet,
  MealIngredientRef,
} from '@/src/lib/diets';
import type { TherapeuticSupplementsSummary } from '@/src/lib/diets/diet.types';
import { deriveDietRuleSet, mealPlanResponseSchema } from '@/src/lib/diets';
import type { MealPlanEnrichmentResponse } from '@/src/lib/agents/meal-planner';
import {
  translateMeals,
  translateEnrichment,
} from '@/src/lib/meal-history/mealTranslation.service';
import type {
  MealPlanRecord,
  CreateMealPlanInput,
  RegenerateMealPlanInput,
} from './mealPlans.types';
import { buildTherapeuticTargetsSnapshot } from '@/src/lib/therapeutic/buildTherapeuticTargetsSnapshot';
import {
  getActiveTherapeuticProfileForUser,
  getProtocolSupplements,
  getApplicableProtocolSupplementRules,
  getHealthProfileForUser,
  getActiveTherapeuticOverridesForUser,
  ageYearsFromBirthDate,
} from '@/src/lib/therapeutic/therapeuticProfile.service';
import {
  createMealPlanInputSchema,
  regenerateMealPlanInputSchema,
} from './mealPlans.schemas';
import { getMealPlannerConfig } from './mealPlans.config';
import { validateHardConstraints } from '@/src/lib/agents/meal-planner';
import { getSlotStylePromptLabels } from '@/src/lib/messages.server';
import { loadMealPlanGeneratorDbConfig } from '@/src/lib/meal-planner/config/mealPlanGeneratorDbConfig';
import {
  buildMealPlanVarietyScorecard,
  throwIfVarietyTargetsNotMet,
  scaleVarietyTargetsForPlanDays,
} from '@/src/lib/meal-planner/metrics/mealPlanVarietyScorecard';
import {
  createRunLogger,
  type SlotSummaryData,
  type StageCountsEntry,
  type TopReasonEntry,
  type RunDiagnosisData,
} from '@/src/lib/agents/meal-planner/mealPlannerDebugLogger.server';
import { fetchDbHealthSnapshot } from '@/src/lib/agents/meal-planner/mealPlannerDbHealth.server';

const RUN_DIAGNOSIS_TOP_CODES = 10;
const DOMINANT_BLOCKERS_MAX = 5;

function buildRunDiagnosis(summaries: SlotSummaryData[]): RunDiagnosisData {
  const slotsFromDb = summaries.filter((s) => s.finalSource === 'db').length;
  const slotsFromHistory = summaries.filter(
    (s) => s.finalSource === 'history',
  ).length;
  const slotsFromAi = summaries.filter((s) => s.finalSource === 'ai').length;
  const slotsFromAiFailed = summaries.filter(
    (s) => s.finalSource === 'ai_failed',
  ).length;
  const reasonsHistogram = summaries
    .filter(
      (s) =>
        s.finalReasonKey &&
        (s.finalSource === 'ai' || s.finalSource === 'ai_failed'),
    )
    .reduce((acc, s) => {
      const r = s.finalReasonKey!;
      acc.set(r, (acc.get(r) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  const reasonsList = Array.from(reasonsHistogram.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
  const issueCodesHistogram: Record<
    string,
    Array<{ code: string; count: number }>
  > = {};
  for (const s of summaries) {
    for (const [stage, topReasons] of Object.entries(s.topReasonsByStage)) {
      if (!issueCodesHistogram[stage]) issueCodesHistogram[stage] = [];
      for (const { code, count } of topReasons) {
        const arr = issueCodesHistogram[stage];
        const existing = arr.find((x) => x.code === code);
        if (existing) existing.count += count;
        else arr.push({ code, count });
      }
    }
  }
  for (const stage of Object.keys(issueCodesHistogram)) {
    issueCodesHistogram[stage] = issueCodesHistogram[stage]
      .sort((a, b) => b.count - a.count)
      .slice(0, RUN_DIAGNOSIS_TOP_CODES);
  }
  const dominantBlockers: Array<{
    stage: string;
    code: string;
    count: number;
    share: number;
  }> = [];
  for (const [stage, entries] of Object.entries(issueCodesHistogram)) {
    const totalRejected = entries.reduce((s, e) => s + e.count, 0);
    for (const { code, count } of entries) {
      dominantBlockers.push({
        stage,
        code,
        count,
        share: totalRejected > 0 ? count / totalRejected : 0,
      });
    }
  }
  dominantBlockers.sort((a, b) => b.count - a.count);
  const topDominant = dominantBlockers.slice(0, DOMINANT_BLOCKERS_MAX);
  return {
    slotsTotal: summaries.length,
    slotsFromDb,
    slotsFromHistory,
    slotsFromAi,
    slotsFromAiFailed,
    reasonsHistogram: reasonsList,
    issueCodesHistogram,
    dominantBlockers: topDominant,
  };
}

/** Explicit columns for meal_plans list (overview) — keeps return shape compatible with MealPlanRecord */
const MEAL_PLAN_LIST_COLUMNS =
  'id,user_id,diet_key,date_from,days,request_snapshot,rules_snapshot,plan_snapshot,enrichment_snapshot,status,draft_plan_snapshot,draft_created_at,applied_at,created_at,updated_at';

/** Explicit columns for meal_plans load (detail) — snapshots + metadata */
const MEAL_PLAN_DETAIL_COLUMNS =
  'id,user_id,diet_key,date_from,days,request_snapshot,rules_snapshot,plan_snapshot,enrichment_snapshot,status,draft_plan_snapshot,draft_created_at,applied_at,created_at,updated_at';

/** Explicit columns for meal_history (recipe candidates for prefilledBySlot) — no SELECT * */
const MEAL_HISTORY_CANDIDATE_COLUMNS =
  'id,meal_id,meal_name,meal_slot,meal_data,combined_score,user_rating,last_used_at,updated_at';

/** Explicit columns for custom_meals (recipe candidates for prefilledBySlot) — no SELECT * */
const CUSTOM_MEALS_CANDIDATE_COLUMNS =
  'id,name,meal_slot,weekmenu_slots,meal_data,consumption_count,updated_at';

/** Columns for recipe_ingredients when building ingredientRefs for prefill (imported recipes have empty meal_data.ingredientRefs) */
const RECIPE_INGREDIENTS_NEVO_COLUMNS =
  'recipe_id,nevo_food_id,quantity,unit,name';

/** Explicit columns for user_preferences (no SELECT *) */
const USER_PREFS_FAVORITES_AND_HOUSEHOLD_COLUMNS =
  'favorite_meal_ids,household_id';

/** Explicit columns for household_avoid_rules (no SELECT *) */
const HOUSEHOLD_AVOID_RULES_COLUMNS =
  'rule_type,match_mode,match_value,strictness';

/** Minimal columns for user_preferences when resolving household for servings scaling */
const USER_PREFS_HOUSEHOLD_COLUMN = 'household_id';

/** Minimal columns for households servings (no SELECT *) */
const HOUSEHOLDS_SERVINGS_COLUMNS = 'household_size,servings_policy';

/** Minimal columns for user_preferences meal-slot style prefs (no SELECT *) */
const USER_PREFS_SLOT_STYLE_COLUMNS =
  'preferred_breakfast_style,preferred_lunch_style,preferred_dinner_style';

/** Minimal columns for user_preferences weekend dinner override (no SELECT *) */
const USER_PREFS_WEEKEND_OVERRIDE_COLUMNS =
  'preferred_weekend_dinner_style,weekend_days';

/** Normalize slot style: null/empty/'any' → no preference (undefined). */
function normalizeSlotStyle(v: string | null | undefined): string | undefined {
  if (v == null || typeof v !== 'string') return undefined;
  const t = v.trim();
  if (t === '' || t === 'any') return undefined;
  return t;
}

/** Normalize weekend days: only 0 (Sun) and/or 6 (Sat); default [0, 6] if empty/invalid. */
function normalizeWeekendDays(v: number[] | null | undefined): number[] {
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

const DEFAULT_DB_FIRST_SETTINGS: DbFirstPlanSettings = {
  repeatWindowDays: 7,
  aiFillMode: 'normal',
};

/**
 * True if meal is blocked by household hard rules (NEVO code or term in name).
 */
function isMealBlockedByHouseholdRules(
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
function isMealBlockedByAllergiesOrDislikes(
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
function scaleMealPlanToHousehold(
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
async function buildTherapeuticSupplementsSummary(
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
function getGuardrailsRunMeta(plan: MealPlanResponse): {
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
async function logMealPlanRun(
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
    userId: string,
    input: CreateMealPlanInput,
    supabaseAdmin?: SupabaseClient,
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
    const startTime = Date.now();
    let runId: string | null = null;
    const supabase = supabaseAdmin ?? (await createClient());
    const planModel = getGeminiClient().getModelName('plan');

    try {
      // Validate input
      const validated = createMealPlanInputSchema.parse(input);

      // Load user profile
      const profileService = new ProfileService();
      let profile = await profileService.loadDietProfileForUser(
        userId,
        supabaseAdmin,
      );

      // Get user language preference
      const userLanguage = await profileService.getUserLanguage(
        userId,
        supabaseAdmin,
      );

      // Apply calorie target override if provided
      if (validated.calorieTarget) {
        profile = {
          ...profile,
          calorieTarget: validated.calorieTarget,
        };
      }

      // Calculate end date
      const startDate = new Date(validated.dateFrom);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + validated.days - 1);
      const endDateStr = endDate.toISOString().split('T')[0];

      // Load meal-slot style + weekend override preferences (one query, no SELECT *)
      const { data: slotPrefsRow } = await supabase
        .from('user_preferences')
        .select(
          `${USER_PREFS_SLOT_STYLE_COLUMNS},${USER_PREFS_WEEKEND_OVERRIDE_COLUMNS}`,
        )
        .eq('user_id', userId)
        .maybeSingle();
      const slotPrefs = slotPrefsRow as {
        preferred_breakfast_style?: string | null;
        preferred_lunch_style?: string | null;
        preferred_dinner_style?: string | null;
        preferred_weekend_dinner_style?: string | null;
        weekend_days?: number[] | null;
      } | null;
      const preferredBreakfastStyle = normalizeSlotStyle(
        slotPrefs?.preferred_breakfast_style ?? null,
      );
      const preferredLunchStyle = normalizeSlotStyle(
        slotPrefs?.preferred_lunch_style ?? null,
      );
      const preferredDinnerStyle = normalizeSlotStyle(
        slotPrefs?.preferred_dinner_style ?? null,
      );
      const preferredWeekendDinnerStyle = normalizeSlotStyle(
        slotPrefs?.preferred_weekend_dinner_style ?? null,
      );
      const weekendDays = normalizeWeekendDays(slotPrefs?.weekend_days ?? null);

      const slotStyleLabels = getSlotStylePromptLabels(userLanguage);
      const weekendDinnerLabel = preferredWeekendDinnerStyle
        ? (slotStyleLabels[preferredWeekendDinnerStyle] ??
          preferredWeekendDinnerStyle)
        : null;

      // Merge slot styles into profile.mealPreferences for prompt (soft guidance)
      const dinnerPrefs = [
        ...(profile.mealPreferences?.dinner ?? []),
        ...(preferredDinnerStyle
          ? [slotStyleLabels[preferredDinnerStyle] ?? preferredDinnerStyle]
          : []),
        ...(weekendDinnerLabel
          ? [`Diner (weekend): ${weekendDinnerLabel}`]
          : []),
      ].filter(Boolean);

      const profileWithSlotPrefs: typeof profile = {
        ...profile,
        mealPreferences: {
          ...profile.mealPreferences,
          breakfast: [
            ...(profile.mealPreferences?.breakfast ?? []),
            ...(preferredBreakfastStyle
              ? [
                  slotStyleLabels[preferredBreakfastStyle] ??
                    preferredBreakfastStyle,
                ]
              : []),
          ].filter(Boolean),
          lunch: [
            ...(profile.mealPreferences?.lunch ?? []),
            ...(preferredLunchStyle
              ? [slotStyleLabels[preferredLunchStyle] ?? preferredLunchStyle]
              : []),
          ].filter(Boolean),
          dinner: dinnerPrefs,
        },
      };

      // slotPreferences for request_snapshot + agent (weekend override only when style set)
      const slotPreferences: {
        breakfast?: string;
        lunch?: string;
        dinner?: string;
        weekendDinnerStyle?: string;
        weekendDays?: number[];
      } = {};
      if (preferredBreakfastStyle)
        slotPreferences.breakfast = preferredBreakfastStyle;
      if (preferredLunchStyle) slotPreferences.lunch = preferredLunchStyle;
      if (preferredDinnerStyle) slotPreferences.dinner = preferredDinnerStyle;
      if (preferredWeekendDinnerStyle) {
        slotPreferences.weekendDinnerStyle = preferredWeekendDinnerStyle;
        slotPreferences.weekendDays = weekendDays;
      }

      // Build meal plan request
      let request: MealPlanRequest & {
        slotPreferences?: {
          breakfast?: string;
          lunch?: string;
          dinner?: string;
          weekendDinnerStyle?: string;
          weekendDays?: number[];
        };
      } = {
        dateRange: {
          start: validated.dateFrom,
          end: endDateStr,
        },
        slots: ['breakfast', 'lunch', 'dinner'],
        profile: profileWithSlotPrefs,
        ...(Object.keys(slotPreferences).length > 0 && { slotPreferences }),
      };

      if (!supabaseAdmin) {
        const therapeuticTargets = await buildTherapeuticTargetsSnapshot(
          supabase,
          userId,
          userLanguage === 'nl' ? 'nl' : 'en',
        ).catch(() => undefined);
        if (therapeuticTargets) {
          request = { ...request, therapeuticTargets };
        }
      }

      // Idempotency check: check if plan with same parameters already exists
      const { data: existingPlan } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('user_id', userId)
        .eq('date_from', validated.dateFrom)
        .eq('days', validated.days)
        .eq('diet_key', profile.dietKey)
        .single();

      if (existingPlan) {
        // Return existing plan (idempotent behavior)
        // Log a "generate" run with status success but duration 0 to indicate reuse
        await logMealPlanRun(
          {
            userId,
            mealPlanId: existingPlan.id,
            runType: 'generate',
            status: 'success',
            durationMs: 0, // Indicates idempotent reuse
          },
          supabaseAdmin,
        );
        return { planId: existingPlan.id };
      }

      // Check quota
      await this.assertWithinQuota(userId, supabaseAdmin);

      // Check concurrency lock
      await this.assertNoActiveRun(userId, undefined, supabaseAdmin);

      // Log "running" status at start
      const { data: runData } = await supabase
        .from('meal_plan_runs')
        .insert({
          user_id: userId,
          meal_plan_id: null,
          run_type: 'generate',
          model: planModel,
          status: 'running',
          duration_ms: 0,
        })
        .select('id')
        .single();

      if (runData) {
        runId = runData.id;
      }

      const debugMetaCollector =
        process.env.MEAL_PLANNER_DEBUG_LOG === 'true'
          ? {
              runId: runId ?? '',
              logFileRelativePath: undefined as string | undefined,
            }
          : undefined;

      // Derive rules
      const rules = deriveDietRuleSet(profile);

      // Load DB-configured generator settings once (reuse + AI cap); RLS: user context
      const generatorDbConfig = await loadMealPlanGeneratorDbConfig(
        supabase,
        profile.dietKey,
      );

      // Try to reuse meals from history before generating new ones; max 1 retry on variety-targets fail
      let plan: MealPlanResponse;
      let reusedMealsCount = 0;

      retryLoop: for (let attempt = 1; attempt <= 2; attempt++) {
        const isRetry = attempt === 2;
        if (isRetry) {
          console.log({
            attempt: 2,
            retryReason: 'variety_targets_not_met',
          });
        }

        try {
          if (!isRetry) {
            try {
              const { MealHistoryService } =
                await import('@/src/lib/meal-history/mealHistory.service');
              const historyService = new MealHistoryService();

              // Try to build plan from history (uses min_history_reuse_ratio + recency_window_days)
              const reuseResult = await this.tryReuseMealsFromHistory(
                userId,
                request,
                profile.dietKey,
                historyService,
                {
                  minHistoryReuseRatio:
                    generatorDbConfig.settings.min_history_reuse_ratio,
                  recencyWindowDays:
                    generatorDbConfig.settings.recency_window_days,
                },
              );

              if (reuseResult.canReuse) {
                // Use reused plan (partially or fully from history)
                plan = reuseResult.plan;
                reusedMealsCount = reuseResult.reusedCount;
                const useDbFirst =
                  generatorDbConfig.settings.use_db_first ||
                  process.env.MEAL_PLANNER_DB_FIRST === 'true';
                if (useDbFirst) {
                  // History meals may have been AI-generated before; don't claim as "database"
                  const slotProv: Record<string, SlotProvenanceEntry> = {};
                  for (const day of plan.days) {
                    for (const meal of day.meals) {
                      slotProv[`${day.date}-${meal.slot}`] = {
                        source:
                          meal.recipeSource === 'custom_meals'
                            ? 'db'
                            : 'history',
                      };
                    }
                  }
                  const meta = (plan.metadata ?? {}) as Record<string, unknown>;
                  meta.slotProvenance = slotProv;
                  const total = Object.keys(slotProv).length;
                  const dbSlots = Object.values(slotProv).filter(
                    (e) => e.source === 'db',
                  ).length;
                  meta.dbCoverage = {
                    dbSlots,
                    totalSlots: total,
                    percent:
                      total > 0 ? Math.round((dbSlots / total) * 100) : 0,
                  };
                  meta.fallbackReasons = [];
                  plan.metadata = meta as MealPlanResponse['metadata'];
                }
                console.log(
                  `Reused ${reusedMealsCount} meals from history for user ${userId}`,
                );
              } else {
                // Generate new plan: DB-first (when flag) or prefilled + AI with cap
                const prefilledBySlot = await this.loadPrefilledBySlot(
                  userId,
                  request,
                  profile.dietKey,
                  supabase,
                );
                const useDbFirst =
                  generatorDbConfig.settings.use_db_first ||
                  process.env.MEAL_PLANNER_DB_FIRST === 'true';
                if (useDbFirst) {
                  plan = await this.generatePlanDbFirst(
                    request,
                    userLanguage,
                    prefilledBySlot,
                    rules,
                    {
                      culinaryRules: generatorDbConfig.culinaryRules,
                      dbFirstSettings: validated.dbFirstSettings,
                      debugContext: {
                        userId,
                        planId: null,
                        runId: runId ?? undefined,
                        debugMetaCollector,
                        supabase,
                      },
                    },
                  );
                } else {
                  const totalSlots = validated.days * request.slots.length;
                  const maxAiSlotsForPlan = Math.min(
                    generatorDbConfig.settings.max_ai_generated_slots_per_week,
                    totalSlots,
                  );
                  const agentService = new MealPlannerAgentService();
                  plan = await agentService.generateMealPlan(
                    request,
                    userLanguage,
                    {
                      prefilledBySlot,
                      maxAiSlotsForPlan,
                      culinaryRules: generatorDbConfig.culinaryRules,
                      minDbRecipeCoverageRatio:
                        generatorDbConfig.settings.min_db_recipe_coverage_ratio,
                      allowDbCoverageFallback: true,
                    },
                  );
                }
              }
            } catch (reuseError) {
              // No retry for structural/config errors: same options would fail again.
              const noRetryCodes = [
                'MEAL_PLAN_DB_COVERAGE_TOO_LOW',
                'MEAL_PLAN_AI_BUDGET_EXCEEDED',
                'MEAL_PLAN_INSUFFICIENT_CANDIDATES',
                'MEAL_PLAN_CONFIG_INVALID',
              ] as const;
              if (
                reuseError instanceof AppError &&
                noRetryCodes.includes(
                  reuseError.code as (typeof noRetryCodes)[number],
                )
              ) {
                throw reuseError;
              }
              // No retry when agent threw validation error (FORBIDDEN_IN_SHAKE_SMOOTHIE etc.) – fail fast.
              const msg = reuseError instanceof Error ? reuseError.message : '';
              if (msg.includes('FORBIDDEN_IN_SHAKE_SMOOTHIE')) {
                throw reuseError;
              }
              // Reuse path threw (rare) or first generateMealPlan failed (e.g. validation/repair); retry once.
              console.warn(
                'Plan generation failed, retrying:',
                reuseError instanceof Error
                  ? reuseError.message
                  : 'Unknown error',
              );
              const prefilledBySlot = await this.loadPrefilledBySlot(
                userId,
                request,
                profile.dietKey,
                supabase,
              );
              const useDbFirstRetry =
                generatorDbConfig.settings.use_db_first ||
                process.env.MEAL_PLANNER_DB_FIRST === 'true';
              if (useDbFirstRetry) {
                plan = await this.generatePlanDbFirst(
                  request,
                  userLanguage,
                  prefilledBySlot,
                  rules,
                  {
                    culinaryRules: generatorDbConfig.culinaryRules,
                    dbFirstSettings: validated.dbFirstSettings,
                    debugContext: {
                      userId,
                      planId: null,
                      runId: runId ?? undefined,
                      debugMetaCollector,
                      supabase,
                    },
                  },
                );
              } else {
                const totalSlots = validated.days * request.slots.length;
                const maxAiSlotsForPlan = Math.min(
                  generatorDbConfig.settings.max_ai_generated_slots_per_week,
                  totalSlots,
                );
                const agentService = new MealPlannerAgentService();
                plan = await agentService.generateMealPlan(
                  request,
                  userLanguage,
                  {
                    prefilledBySlot,
                    maxAiSlotsForPlan,
                    culinaryRules: generatorDbConfig.culinaryRules,
                    minDbRecipeCoverageRatio:
                      generatorDbConfig.settings.min_db_recipe_coverage_ratio,
                    allowDbCoverageFallback: true,
                  },
                );
              }
            }
          } else {
            // Retry (attempt 2): skip history-only path; DB-first or generate with variety targets
            const prefilledBySlot = await this.loadPrefilledBySlot(
              userId,
              request,
              profile.dietKey,
              supabase,
            );
            const useDbFirstAttempt2 =
              generatorDbConfig.settings.use_db_first ||
              process.env.MEAL_PLANNER_DB_FIRST === 'true';
            if (useDbFirstAttempt2) {
              plan = await this.generatePlanDbFirst(
                request,
                userLanguage,
                prefilledBySlot,
                rules,
                {
                  culinaryRules: generatorDbConfig.culinaryRules,
                  dbFirstSettings: validated.dbFirstSettings,
                  debugContext: {
                    userId,
                    planId: null,
                    runId: runId ?? undefined,
                    debugMetaCollector,
                    supabase,
                  },
                },
              );
            } else {
              const totalSlots = validated.days * request.slots.length;
              const maxAiSlotsForPlan = Math.min(
                generatorDbConfig.settings.max_ai_generated_slots_per_week,
                totalSlots,
              );
              const scaledVariety = scaleVarietyTargetsForPlanDays(
                validated.days,
                generatorDbConfig.varietyTargets,
              );
              const agentService = new MealPlannerAgentService();
              plan = await agentService.generateMealPlan(
                request,
                userLanguage,
                {
                  prefilledBySlot,
                  maxAiSlotsForPlan,
                  culinaryRules: generatorDbConfig.culinaryRules,
                  minDbRecipeCoverageRatio:
                    generatorDbConfig.settings.min_db_recipe_coverage_ratio,
                  allowDbCoverageFallback: true,
                  varietyTargetsForPrompt: {
                    unique_veg_min: scaledVariety.unique_veg_min,
                    unique_fruit_min: scaledVariety.unique_fruit_min,
                    protein_rotation_min_categories:
                      scaledVariety.protein_rotation_min_categories,
                    max_repeat_same_recipe_within_days:
                      scaledVariety.max_repeat_same_recipe_within_days,
                  },
                },
              );
            }
          }
          // Supplement-advies samenvatting in metadata wanneer gebruiker een actief therapeutisch profiel heeft
          // (onafhankelijk van request.therapeuticTargets, zodat het blok altijd verschijnt bij actief protocol)
          const summary = await buildTherapeuticSupplementsSummary(
            supabase,
            userId,
          ).catch(() => null);
          if (summary) {
            plan = {
              ...plan,
              metadata: {
                ...plan.metadata,
                therapeuticSupplementsSummary: summary,
              },
            } as MealPlanResponse;
          }

          // Try to enrich plan (pragmatic: if enrichment fails, keep plan without enrichment)
          let enrichment = null;
          const enrichmentStartTime = Date.now();
          try {
            const enrichmentService = new MealPlannerEnrichmentService();
            enrichment = await enrichmentService.enrichPlan(
              plan,
              {
                allowPantryStaples: false,
              },
              userLanguage,
            );
            const enrichmentDurationMs = Date.now() - enrichmentStartTime;

            // Log successful enrichment
            await logMealPlanRun(
              {
                userId,
                mealPlanId: null, // Will be set after insert
                runType: 'enrich',
                status: 'success',
                durationMs: enrichmentDurationMs,
              },
              supabaseAdmin,
            );
          } catch (enrichmentError) {
            // Enrichment failed - log error but continue with plan
            const enrichmentDurationMs = Date.now() - enrichmentStartTime;
            const enrichmentErrorMessage =
              enrichmentError instanceof Error
                ? enrichmentError.message
                : 'Unknown enrichment error';

            await logMealPlanRun(
              {
                userId,
                mealPlanId: null,
                runType: 'enrich',
                status: 'error',
                durationMs: enrichmentDurationMs,
                errorCode: 'AGENT_ERROR',
                errorMessage: enrichmentErrorMessage.substring(0, 500),
              },
              supabaseAdmin,
            );

            // Continue without enrichment
            console.warn(
              'Enrichment failed, continuing with plan:',
              enrichmentErrorMessage,
            );
          }

          // Scale plan to household size when policy is scale_to_household
          let planToPersist = plan;
          const { data: prefsRow } = await supabase
            .from('user_preferences')
            .select(USER_PREFS_HOUSEHOLD_COLUMN)
            .eq('user_id', userId)
            .maybeSingle();
          const householdId =
            prefsRow != null &&
            typeof (prefsRow as { household_id?: string | null })
              .household_id === 'string' &&
            (prefsRow as { household_id: string }).household_id.trim() !== ''
              ? (prefsRow as { household_id: string }).household_id.trim()
              : null;

          if (householdId) {
            const { data: householdRow } = await supabase
              .from('households')
              .select(HOUSEHOLDS_SERVINGS_COLUMNS)
              .eq('id', householdId)
              .maybeSingle();

            const row = householdRow as {
              household_size?: number;
              servings_policy?: string;
            } | null;
            const policy = row?.servings_policy ?? 'scale_to_household';
            const rawSize = row?.household_size;

            const householdSize =
              typeof rawSize === 'number' &&
              Number.isInteger(rawSize) &&
              rawSize >= 1 &&
              rawSize <= 12
                ? rawSize
                : null;

            if (
              policy === 'scale_to_household' &&
              householdSize != null &&
              householdSize >= 2
            ) {
              planToPersist = scaleMealPlanToHousehold(
                planToPersist,
                householdSize,
                policy,
              );
            }
          }

          // Variety scorecard (metrics + targets) for UI/debug; enforce targets before persist
          planToPersist = {
            ...planToPersist,
            metadata: {
              ...planToPersist.metadata,
              varietyScorecard: buildMealPlanVarietyScorecard(
                planToPersist,
                generatorDbConfig.varietyTargets,
              ),
            },
          } as MealPlanResponse;
          throwIfVarietyTargetsNotMet(planToPersist.metadata!.varietyScorecard);

          // Persist to database
          const { data, error } = await supabase
            .from('meal_plans')
            .insert({
              user_id: userId,
              diet_key: profile.dietKey,
              date_from: validated.dateFrom,
              days: validated.days,
              request_snapshot: request,
              rules_snapshot: rules,
              plan_snapshot: planToPersist,
              enrichment_snapshot: enrichment,
            })
            .select('id')
            .single();

          if (error || !data) {
            throw new Error(
              `Failed to persist meal plan: ${error?.message || 'Unknown error'}`,
            );
          }

          const durationMs = Date.now() - startTime;

          // Extract and store meals in history (for reuse and rating)
          try {
            const { MealHistoryService } =
              await import('@/src/lib/meal-history/mealHistory.service');
            const historyService = new MealHistoryService();
            await historyService.extractAndStoreMeals(
              userId,
              planToPersist,
              profile.dietKey,
            );
          } catch (historyError) {
            // Log but don't fail - meal history is optional
            console.warn(
              'Failed to store meals in history:',
              historyError instanceof Error
                ? historyError.message
                : 'Unknown error',
            );
          }

          // Update run status to success (with guardrails meta from plan, no PII)
          const guardrailsMeta = getGuardrailsRunMeta(planToPersist);
          if (runId) {
            await supabase
              .from('meal_plan_runs')
              .update({
                status: 'success',
                meal_plan_id: data.id,
                duration_ms: durationMs,
                constraints_in_prompt: guardrailsMeta.constraintsInPrompt,
                guardrails_content_hash: guardrailsMeta.guardrailsContentHash,
                guardrails_version: guardrailsMeta.guardrailsVersion,
              })
              .eq('id', runId)
              .eq('user_id', userId);
          } else {
            // Fallback: log new run if update failed
            await logMealPlanRun(
              {
                userId,
                mealPlanId: data.id,
                runType: 'generate',
                status: 'success',
                durationMs,
                ...guardrailsMeta,
              },
              supabaseAdmin,
            );
          }

          const meta = planToPersist.metadata as
            | {
                dbCoverage?: {
                  dbSlots: number;
                  totalSlots: number;
                  percent: number;
                };
                dbCoverageBelowTarget?: boolean;
                provenance?: {
                  reusedRecipeCount?: number;
                  generatedRecipeCount?: number;
                };
                fallbackReasons?: { reason: string; count: number }[];
              }
            | undefined;
          let dbCoverage = meta?.dbCoverage;
          if (!dbCoverage && meta?.provenance) {
            const totalMeals = planToPersist.days.reduce(
              (s, d) => s + (d.meals?.length ?? 0),
              0,
            );
            const dbSlots = meta.provenance.reusedRecipeCount ?? 0;
            const totalSlots =
              totalMeals ||
              dbSlots + (meta.provenance.generatedRecipeCount ?? 0);
            dbCoverage =
              totalSlots > 0
                ? {
                    dbSlots,
                    totalSlots,
                    percent: Math.round((dbSlots / totalSlots) * 100),
                  }
                : undefined;
          }
          return {
            planId: data.id,
            dbCoverage,
            dbCoverageBelowTarget: meta?.dbCoverageBelowTarget,
            fallbackReasons: meta?.fallbackReasons,
            ...(debugMetaCollector &&
              process.env.MEAL_PLANNER_DEBUG_LOG === 'true' && {
                debug: {
                  runId: debugMetaCollector.runId,
                  ...(debugMetaCollector.logFileRelativePath && {
                    logFileRelativePath: debugMetaCollector.logFileRelativePath,
                  }),
                },
              }),
          };
        } catch (e) {
          if (
            !isRetry &&
            e instanceof AppError &&
            e.code === 'MEAL_PLAN_VARIETY_TARGETS_NOT_MET'
          ) {
            continue retryLoop;
          }
          throw e;
        }
      }
      throw new Error('createPlanForUser: unreachable');
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Determine error code
      let errorCode: string = 'DB_ERROR';
      let errorMessage = 'Unknown error';

      if (error instanceof AppError) {
        errorCode = error.code;
        errorMessage = error.safeMessage;
      } else if (error instanceof Error) {
        errorMessage = error.message;
        if (
          errorMessage.includes('validation') ||
          errorMessage.includes('Invalid')
        ) {
          errorCode = 'VALIDATION_ERROR';
        } else if (
          errorMessage.includes('Gemini') ||
          errorMessage.includes('agent') ||
          errorMessage.includes('Meal plan generation failed after repair') ||
          errorMessage.includes('MEAL_PREFERENCE_MISS') ||
          errorMessage.includes('ALLERGEN_PRESENT') ||
          errorMessage.includes('FORBIDDEN_IN_SHAKE_SMOOTHIE')
        ) {
          errorCode = 'AGENT_ERROR';
        }
      }

      // Update run status to error
      if (runId) {
        await supabase
          .from('meal_plan_runs')
          .update({
            status: 'error',
            duration_ms: durationMs,
            error_code: errorCode,
            error_message: errorMessage.substring(0, 500),
          })
          .eq('id', runId)
          .eq('user_id', userId);
      } else {
        // Fallback: log new run if update failed
        await logMealPlanRun(
          {
            userId,
            mealPlanId: null,
            runType: 'generate',
            status: 'error',
            durationMs,
            errorCode,
            errorMessage: errorMessage.substring(0, 500),
          },
          supabaseAdmin,
        );
      }

      // Re-throw AppError as-is, wrap others
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        errorCode as 'VALIDATION_ERROR' | 'DB_ERROR' | 'AGENT_ERROR',
        errorMessage,
      );
    }
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
    userId: string,
    input: RegenerateMealPlanInput,
  ): Promise<{ planId: string }> {
    const startTime = Date.now();
    let runId: string | null = null;
    const supabase = await createClient();
    const planModel = getGeminiClient().getModelName('plan');

    try {
      // Validate input
      const validated = regenerateMealPlanInputSchema.parse(input);

      // Check quota
      await this.assertWithinQuota(userId);

      // Check concurrency lock
      await this.assertNoActiveRun(userId, validated.planId);

      // Log "running" status at start
      const { data: runData } = await supabase
        .from('meal_plan_runs')
        .insert({
          user_id: userId,
          meal_plan_id: validated.planId,
          run_type: 'regenerate',
          model: planModel,
          status: 'running',
          duration_ms: 0,
        })
        .select('id')
        .single();

      if (runData) {
        runId = runData.id;
      }

      // Load existing plan
      const existingPlan = await this.loadPlanForUser(userId, validated.planId);

      // Get user language preference
      const profileService = new ProfileService();
      const userLanguage = await profileService.getUserLanguage(userId);

      if (validated.onlyDate) {
        // Single day regenerate - use new day-only generation
        const agentService = new MealPlannerAgentService();

        // Find existing day for minimal-change objective
        const existingDay = existingPlan.planSnapshot.days.find(
          (d) => d.date === validated.onlyDate,
        );

        // Generate only the specified day (not full plan)
        const { day: newDay, adjustments } =
          await agentService.generateMealPlanDay({
            request: existingPlan.requestSnapshot,
            date: validated.onlyDate,
            existingDay,
            language: userLanguage,
          });

        // Replace only the specified day in plan_snapshot
        const updatedDays = existingPlan.planSnapshot.days.map((day) => {
          if (day.date === validated.onlyDate) {
            return newDay;
          }
          return day;
        });

        // Validate updated plan
        const updatedPlan: MealPlanResponse = {
          ...existingPlan.planSnapshot,
          days: updatedDays,
        };
        mealPlanResponseSchema.parse(updatedPlan);

        // Log adjustments if any (for observability - can be added to run log in future)
        if (adjustments && adjustments.length > 0) {
          console.log(
            `Day regenerate adjustments for ${validated.onlyDate}: ${adjustments.length} quantity changes`,
          );
        }

        // Try to enrich updated plan
        let enrichment = existingPlan.enrichmentSnapshot;
        const enrichmentStartTime = Date.now();
        try {
          const enrichmentService = new MealPlannerEnrichmentService();
          enrichment = await enrichmentService.enrichPlan(
            updatedPlan,
            {
              allowPantryStaples: false,
            },
            userLanguage,
          );
          const enrichmentDurationMs = Date.now() - enrichmentStartTime;

          await logMealPlanRun({
            userId,
            mealPlanId: validated.planId,
            runType: 'enrich',
            status: 'success',
            durationMs: enrichmentDurationMs,
          });
        } catch (enrichmentError) {
          const enrichmentDurationMs = Date.now() - enrichmentStartTime;
          const enrichmentErrorMessage =
            enrichmentError instanceof Error
              ? enrichmentError.message
              : 'Unknown enrichment error';

          await logMealPlanRun({
            userId,
            mealPlanId: validated.planId,
            runType: 'enrich',
            status: 'error',
            durationMs: enrichmentDurationMs,
            errorCode: 'AGENT_ERROR',
            errorMessage: enrichmentErrorMessage.substring(0, 500),
          });

          console.warn(
            'Enrichment failed during regenerate, keeping existing enrichment:',
            enrichmentErrorMessage,
          );
        }

        // Persist updated plan
        const { error } = await supabase
          .from('meal_plans')
          .update({
            plan_snapshot: updatedPlan,
            enrichment_snapshot: enrichment,
            updated_at: new Date().toISOString(),
          })
          .eq('id', validated.planId)
          .eq('user_id', userId);

        if (error) {
          throw new Error(`Failed to update meal plan: ${error.message}`);
        }

        const durationMs = Date.now() - startTime;

        // Update run status to success
        if (runId) {
          await supabase
            .from('meal_plan_runs')
            .update({
              status: 'success',
              duration_ms: durationMs,
            })
            .eq('id', runId)
            .eq('user_id', userId);
        } else {
          await logMealPlanRun({
            userId,
            mealPlanId: validated.planId,
            runType: 'regenerate',
            status: 'success',
            durationMs,
          });
        }

        return { planId: validated.planId };
      } else {
        // Full regenerate
        // Reuse request snapshot (or reload profile - we reuse for consistency)
        const agentService = new MealPlannerAgentService();
        const newPlan = await agentService.generateMealPlan(
          existingPlan.requestSnapshot,
          userLanguage,
        );

        // Try to enrich new plan
        let enrichment = null;
        const enrichmentStartTime = Date.now();
        try {
          const enrichmentService = new MealPlannerEnrichmentService();
          enrichment = await enrichmentService.enrichPlan(
            newPlan,
            {
              allowPantryStaples: false,
            },
            userLanguage,
          );
          const enrichmentDurationMs = Date.now() - enrichmentStartTime;

          await logMealPlanRun({
            userId,
            mealPlanId: validated.planId,
            runType: 'enrich',
            status: 'success',
            durationMs: enrichmentDurationMs,
          });
        } catch (enrichmentError) {
          const enrichmentDurationMs = Date.now() - enrichmentStartTime;
          const enrichmentErrorMessage =
            enrichmentError instanceof Error
              ? enrichmentError.message
              : 'Unknown enrichment error';

          await logMealPlanRun({
            userId,
            mealPlanId: validated.planId,
            runType: 'enrich',
            status: 'error',
            durationMs: enrichmentDurationMs,
            errorCode: 'AGENT_ERROR',
            errorMessage: enrichmentErrorMessage.substring(0, 500),
          });

          console.warn(
            'Enrichment failed during regenerate, continuing without enrichment:',
            enrichmentErrorMessage,
          );
        }

        // Persist updated plan
        const { error } = await supabase
          .from('meal_plans')
          .update({
            plan_snapshot: newPlan,
            enrichment_snapshot: enrichment,
            updated_at: new Date().toISOString(),
          })
          .eq('id', validated.planId)
          .eq('user_id', userId);

        if (error) {
          throw new Error(`Failed to update meal plan: ${error.message}`);
        }

        const durationMs = Date.now() - startTime;
        const regenGuardrailsMeta = getGuardrailsRunMeta(newPlan);

        // Update run status to success (with guardrails meta from plan, no PII)
        if (runId) {
          await supabase
            .from('meal_plan_runs')
            .update({
              status: 'success',
              duration_ms: durationMs,
              constraints_in_prompt: regenGuardrailsMeta.constraintsInPrompt,
              guardrails_content_hash:
                regenGuardrailsMeta.guardrailsContentHash,
              guardrails_version: regenGuardrailsMeta.guardrailsVersion,
            })
            .eq('id', runId)
            .eq('user_id', userId);
        } else {
          await logMealPlanRun({
            userId,
            mealPlanId: validated.planId,
            runType: 'regenerate',
            status: 'success',
            durationMs,
            ...regenGuardrailsMeta,
          });
        }

        return { planId: validated.planId };
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Determine error code
      let errorCode: string = 'DB_ERROR';
      let errorMessage = 'Unknown error';

      if (error instanceof AppError) {
        errorCode = error.code;
        errorMessage = error.safeMessage;
      } else if (error instanceof Error) {
        errorMessage = error.message;
        if (
          errorMessage.includes('validation') ||
          errorMessage.includes('Invalid')
        ) {
          errorCode = 'VALIDATION_ERROR';
        } else if (
          errorMessage.includes('Gemini') ||
          errorMessage.includes('agent') ||
          errorMessage.includes('Meal plan generation failed after repair') ||
          errorMessage.includes('MEAL_PREFERENCE_MISS') ||
          errorMessage.includes('ALLERGEN_PRESENT') ||
          errorMessage.includes('FORBIDDEN_IN_SHAKE_SMOOTHIE')
        ) {
          errorCode = 'AGENT_ERROR';
        }
      }

      // Update run status to error
      const planId = input.planId || null;
      if (runId) {
        await supabase
          .from('meal_plan_runs')
          .update({
            status: 'error',
            duration_ms: durationMs,
            error_code: errorCode,
            error_message: errorMessage.substring(0, 500),
          })
          .eq('id', runId)
          .eq('user_id', userId);
      } else {
        await logMealPlanRun({
          userId,
          mealPlanId: planId,
          runType: 'regenerate',
          status: 'error',
          durationMs,
          errorCode,
          errorMessage: errorMessage.substring(0, 500),
        });
      }

      // Re-throw AppError as-is, wrap others
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        errorCode as 'VALIDATION_ERROR' | 'DB_ERROR' | 'AGENT_ERROR',
        errorMessage,
      );
    }
  }

  /**
   * True if meal is a placeholder (empty name and no ingredientRefs). Used to never return placeholders from DB-first.
   */
  private static isPlaceholderMeal(meal: Meal): boolean {
    const nameEmpty = meal.name == null || String(meal.name).trim() === '';
    const noRefs =
      !Array.isArray(meal.ingredientRefs) || meal.ingredientRefs.length === 0;
    return nameEmpty && noRefs;
  }

  /**
   * DB-first orchestrator: build skeleton, fill from DB per (day, slot), then call AI only for missing slots (unless aiFillMode='strict').
   * Does not read or pass template/pool/naming config; only culinaryRules and DbFirstPlanSettings apply.
   */
  private async generatePlanDbFirst(
    request: MealPlanRequest,
    userLanguage: 'nl' | 'en',
    prefilledBySlot: Partial<Record<MealSlot, Meal[]>>,
    rules: DietRuleSet,
    options: {
      /** Only DB-first-relevant: culinary rules for AI fill validation. No template/pool config. */
      culinaryRules: Awaited<
        ReturnType<typeof loadMealPlanGeneratorDbConfig>
      >['culinaryRules'];
      dbFirstSettings?: Partial<DbFirstPlanSettings>;
      /** Optional debug context for structured logging (env: MEAL_PLANNER_DEBUG_LOG). */
      debugContext?: {
        userId: string;
        planId?: string | null;
        runId?: string;
        /** Mutable collector for debug metadata to include in API response. */
        debugMetaCollector?: { runId: string; logFileRelativePath?: string };
        /** Supabase client (user-context) for db_health_snapshot when debug enabled. */
        supabase?: SupabaseClient;
      };
    },
  ): Promise<MealPlanResponse> {
    const settings: DbFirstPlanSettings = {
      ...DEFAULT_DB_FIRST_SETTINGS,
      ...options.dbFirstSettings,
    };
    const slots = request.slots;
    const debug = options.debugContext
      ? createRunLogger({
          planId: options.debugContext.planId ?? null,
          userId: options.debugContext.userId,
          runId: options.debugContext.runId,
        })
      : null;
    if (debug && options.debugContext?.debugMetaCollector) {
      options.debugContext.debugMetaCollector.runId = debug.runId;
    }
    const runStartTs = debug ? Date.now() : 0;
    const STAGES = [
      'variety_window',
      'hasRefs_filter',
      'hard_constraints',
    ] as const;
    const emptyStageCounts: StageCountsEntry = {
      before: 0,
      after: 0,
      rejected: 0,
    };
    const allSlotSummaries: SlotSummaryData[] = [];
    const deferredSlotStats = new Map<
      string,
      {
        countsByStage: Record<string, StageCountsEntry>;
        topReasonsByStage: Record<string, TopReasonEntry[]>;
        candidateSample?: string[];
      }
    >();
    const startDate = new Date(request.dateRange.start);
    const endDate = new Date(request.dateRange.end);
    const numDays =
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    // 1) Build skeleton plan: all days/slots with placeholder meals
    const days: MealPlanDay[] = [];
    for (let dayIndex = 0; dayIndex < numDays; dayIndex++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + dayIndex);
      const dateStr = d.toISOString().split('T')[0];
      const meals: Meal[] = slots.map((slot) => ({
        id: `placeholder-${dateStr}-${slot}`,
        name: '',
        slot,
        date: dateStr,
        ingredientRefs: [],
      }));
      days.push({ date: dateStr, meals });
    }
    const plan: MealPlanResponse = {
      requestId: `db-first-${Date.now()}`,
      days,
    };

    const usedPerDay = new Map<number, Set<string>>();
    const baseIdByDayAndSlot = new Map<string, string>();
    const slotProvenance: Record<string, SlotProvenanceEntry> = {};
    const missingSlots: {
      dayIndex: number;
      slotIndex: number;
      date: string;
      slot: MealSlot;
      reason: SlotProvenanceReason;
    }[] = [];
    let reusedRecipeCount = 0;

    function clonePlan(p: MealPlanResponse): MealPlanResponse {
      return JSON.parse(JSON.stringify(p)) as MealPlanResponse;
    }

    if (debug) {
      debug.emitFileWriteSkipped();
      debug.event('run_start', {
        configSnapshot: {
          repeat_window_days: settings.repeatWindowDays,
          target_reuse_ratio: getMealPlannerConfig().targetReuseRatio,
          db_first: true,
          ai_fill_mode: settings.aiFillMode,
        },
        numDays,
        slots: [...slots],
      });
      if (options.debugContext?.supabase && options.debugContext?.userId) {
        try {
          const snapshot = await fetchDbHealthSnapshot(
            options.debugContext.supabase,
            options.debugContext.userId,
            debug.runId,
            options.debugContext.planId ?? null,
          );
          debug.event('db_health_snapshot', {
            bySlot: snapshot.bySlot,
            totals: snapshot.totals,
          });
        } catch (err) {
          debug.event('db_health_snapshot', {
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
      }
      const poolCounts = Object.fromEntries(
        slots.map((s) => [
          s,
          {
            total: (prefilledBySlot[s] ?? []).length,
            withRefs: (prefilledBySlot[s] ?? []).filter(
              (m) =>
                Array.isArray(m.ingredientRefs) && m.ingredientRefs.length > 0,
            ).length,
          },
        ]),
      );
      debug.event('pool_loaded', { counts: poolCounts });
    }

    // 2) Fill each (day, slot) from DB where a candidate passes hard constraints
    for (let dayIndex = 0; dayIndex < numDays; dayIndex++) {
      const dateStr = plan.days[dayIndex].date;
      if (!usedPerDay.has(dayIndex)) {
        usedPerDay.set(dayIndex, new Set<string>());
      }
      const usedOnDay = usedPerDay.get(dayIndex)!;

      for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        const slot = slots[slotIndex];
        const key = `${dateStr}-${slot}`;
        const pool = prefilledBySlot[slot] ?? [];
        const slotStartTs = debug ? Date.now() : 0;

        if (debug) debug.event('slot_start', { slotKey: key });

        // repeatWindowDays: same meal not used in last N days for this slot
        const usedInWindow = (mealId: string): boolean => {
          const windowStart = Math.max(0, dayIndex - settings.repeatWindowDays);
          for (let d = dayIndex - 1; d >= windowStart; d--) {
            if (baseIdByDayAndSlot.get(`${d}-${slot}`) === mealId) return true;
          }
          return false;
        };

        const hasRefs = (m: Meal): boolean =>
          Array.isArray(m.ingredientRefs) && m.ingredientRefs.length > 0;
        const available = pool.filter(
          (m) => !usedOnDay.has(m.id) && !usedInWindow(m.id),
        );
        const availableWithRefs = available.filter(hasRefs);

        if (debug) {
          debug.stage(
            key,
            'variety_window',
            {
              before: pool.length,
              after: available.length,
              rejected: pool.length - available.length,
            },
            Date.now() - slotStartTs,
          );
          if (available.length > 0) {
            debug.slotSurvivors(
              key,
              'variety_window',
              available,
              available.length,
            );
          }
          debug.stage(key, 'hasRefs_filter', {
            before: available.length,
            after: availableWithRefs.length,
            rejected: available.length - availableWithRefs.length,
          });
          if (availableWithRefs.length > 0) {
            debug.slotSurvivors(
              key,
              'hasRefs_filter',
              availableWithRefs,
              availableWithRefs.length,
            );
          }
        }

        if (pool.length === 0) {
          if (debug) {
            const countsByStage = Object.fromEntries(
              STAGES.map((s) => [s, { ...emptyStageCounts }]),
            ) as Record<string, StageCountsEntry>;
            const topReasonsByStage = Object.fromEntries(
              STAGES.map((s) => [s, [] as TopReasonEntry[]]),
            );
            deferredSlotStats.set(key, {
              countsByStage,
              topReasonsByStage,
            });
          }
          missingSlots.push({
            dayIndex,
            slotIndex,
            date: dateStr,
            slot,
            reason: 'no_candidates',
          });
          slotProvenance[key] = { source: 'ai', reason: 'no_candidates' };
          continue;
        }
        if (available.length === 0) {
          if (debug) {
            debug.topRejectReasons(
              key,
              'variety_window',
              new Map([['repeat_window_blocked', pool.length]]),
            );
            const countsByStage = Object.fromEntries(
              STAGES.map((s) => [s, { ...emptyStageCounts }]),
            ) as Record<string, StageCountsEntry>;
            countsByStage.variety_window = {
              before: pool.length,
              after: 0,
              rejected: pool.length,
            };
            const topReasonsByStage = Object.fromEntries(
              STAGES.map((s) => [s, [] as TopReasonEntry[]]),
            );
            topReasonsByStage.variety_window = [
              { code: 'repeat_window_blocked', count: pool.length },
            ].slice(0, 3);
            deferredSlotStats.set(key, {
              countsByStage,
              topReasonsByStage,
            });
          }
          missingSlots.push({
            dayIndex,
            slotIndex,
            date: dateStr,
            slot,
            reason: 'repeat_window_blocked',
          });
          slotProvenance[key] = {
            source: 'ai',
            reason: 'repeat_window_blocked',
          };
          continue;
        }
        if (availableWithRefs.length === 0) {
          if (debug) {
            debug.topRejectReasons(
              key,
              'hasRefs_filter',
              new Map([['missing_ingredient_refs', available.length]]),
            );
            const countsByStage = Object.fromEntries(
              STAGES.map((s) => [s, { ...emptyStageCounts }]),
            ) as Record<string, StageCountsEntry>;
            countsByStage.variety_window = {
              before: pool.length,
              after: available.length,
              rejected: pool.length - available.length,
            };
            countsByStage.hasRefs_filter = {
              before: available.length,
              after: 0,
              rejected: available.length,
            };
            const topReasonsByStage = Object.fromEntries(
              STAGES.map((s) => [s, [] as TopReasonEntry[]]),
            );
            topReasonsByStage.hasRefs_filter = [
              { code: 'missing_ingredient_refs', count: available.length },
            ].slice(0, 3);
            const candidateSample = available
              .map((m) => `${m.recipeSource ?? 'unknown'}:${m.id}`)
              .slice(0, 10);
            deferredSlotStats.set(key, {
              countsByStage,
              topReasonsByStage,
              candidateSample,
            });
          }
          missingSlots.push({
            dayIndex,
            slotIndex,
            date: dateStr,
            slot,
            reason: 'missing_ingredient_refs',
          });
          slotProvenance[key] = {
            source: 'ai',
            reason: 'missing_ingredient_refs',
          };
          continue;
        }

        let placed = false;
        let chosenCandidate: Meal | null = null;
        const hardConstraintReasonCounts = new Map<string, number>();
        const hardConstraintsStartTs = debug ? Date.now() : 0;
        for (const candidate of availableWithRefs) {
          const replacedMeal: Meal = {
            ...candidate,
            date: dateStr,
            id: `${candidate.id}-${dateStr}-${slot}`,
          };
          const candidatePlan = clonePlan(plan);
          candidatePlan.days[dayIndex].meals[slotIndex] = replacedMeal;
          const issues = await validateHardConstraints({
            plan: candidatePlan,
            rules,
            request,
          });
          if (issues.length === 0) {
            plan.days[dayIndex].meals[slotIndex] = replacedMeal;
            usedOnDay.add(candidate.id);
            baseIdByDayAndSlot.set(`${dayIndex}-${slot}`, candidate.id);
            // Only custom_meals count as "database"; meal_history is reused past meals, often AI-generated
            const fromRecipeDb = candidate.recipeSource === 'custom_meals';
            slotProvenance[key] = {
              source: fromRecipeDb ? 'db' : 'history',
            };
            if (fromRecipeDb) reusedRecipeCount++;
            placed = true;
            chosenCandidate = candidate;
            if (debug) {
              debug.slotSurvivors(key, 'hard_constraints', [candidate], 1);
              debug.event('slot_selected', {
                slotKey: key,
                source: fromRecipeDb ? 'db' : 'history',
                candidateKey: `${candidate.recipeSource ?? 'unknown'}:${candidate.id}`,
                name: (candidate.name ?? '').slice(0, 80),
              });
              const hcCounts = {
                before: availableWithRefs.length,
                after: 1,
                rejected: availableWithRefs.length - 1,
              };
              const topHc = Array.from(hardConstraintReasonCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([code, count]) => ({ code, count }));
              const countsByStage: Record<string, StageCountsEntry> = {
                variety_window: {
                  before: pool.length,
                  after: available.length,
                  rejected: pool.length - available.length,
                },
                hasRefs_filter: {
                  before: available.length,
                  after: availableWithRefs.length,
                  rejected: available.length - availableWithRefs.length,
                },
                hard_constraints: hcCounts,
              };
              const topReasonsByStage: Record<string, TopReasonEntry[]> = {
                variety_window: [],
                hasRefs_filter: [],
                hard_constraints: topHc,
              };
              const candidateSample = available
                .map((m) => `${m.recipeSource ?? 'unknown'}:${m.id}`)
                .slice(0, 10);
              const summary: SlotSummaryData = {
                slotKey: key,
                finalSource: fromRecipeDb ? 'db' : 'history',
                countsByStage,
                topReasonsByStage,
                candidateSample,
              };
              debug.slotSummary(summary);
              allSlotSummaries.push(summary);
            }
            break;
          }
          if (debug) {
            const issueEntries = issues.map((i) => ({
              code: i.code,
              detail: i.detail ?? i.message?.slice(0, 120),
            }));
            debug.candidateReject(
              key,
              'hard_constraints',
              candidate,
              issueEntries,
            );
            const firstCode = issues[0]?.code ?? 'UNKNOWN';
            hardConstraintReasonCounts.set(
              firstCode,
              (hardConstraintReasonCounts.get(firstCode) ?? 0) + 1,
            );
          }
        }
        if (debug) {
          debug.slotRanking(
            key,
            availableWithRefs.length,
            availableWithRefs.slice(0, 10),
            placed && chosenCandidate
              ? {
                  candidateKey: `${chosenCandidate.recipeSource ?? 'unknown'}:${chosenCandidate.id}`,
                  name:
                    (chosenCandidate.name ?? '').trim().slice(0, 60) ||
                    '(unnamed)',
                  reason:
                    'first_valid_in_prefill_order (prefill: favorite > consumption_count/combined_score > recency)',
                }
              : undefined,
            !placed && availableWithRefs.length > 0
              ? 'none_passed_hard_constraints'
              : undefined,
          );
          const hcCounts = {
            before: availableWithRefs.length,
            after: placed ? 1 : 0,
            rejected: placed
              ? availableWithRefs.length - 1
              : availableWithRefs.length,
          };
          const topHc = Array.from(hardConstraintReasonCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([code, count]) => ({ code, count }));
          debug.stage(
            key,
            'hard_constraints',
            hcCounts,
            Date.now() - hardConstraintsStartTs,
            topHc.length > 0 ? { topRejectReasons: topHc } : undefined,
          );
          if (!placed) {
            const countsByStage: Record<string, StageCountsEntry> = {
              variety_window: {
                before: pool.length,
                after: available.length,
                rejected: pool.length - available.length,
              },
              hasRefs_filter: {
                before: available.length,
                after: availableWithRefs.length,
                rejected: available.length - availableWithRefs.length,
              },
              hard_constraints: hcCounts,
            };
            const topReasonsByStage: Record<string, TopReasonEntry[]> = {
              variety_window: [],
              hasRefs_filter: [],
              hard_constraints: topHc.slice(0, 3),
            };
            const candidateSample = available
              .map((m) => `${m.recipeSource ?? 'unknown'}:${m.id}`)
              .slice(0, 10);
            deferredSlotStats.set(key, {
              countsByStage,
              topReasonsByStage,
              candidateSample,
            });
          }
        }
        if (!placed) {
          missingSlots.push({
            dayIndex,
            slotIndex,
            date: dateStr,
            slot,
            reason: 'all_candidates_blocked_by_constraints',
          });
          slotProvenance[key] = {
            source: 'ai',
            reason: 'all_candidates_blocked_by_constraints',
          };
        }
      }
    }

    // 3) strict: no AI fill — throw when any slot is missing. normal: AI fills missing slots
    if (missingSlots.length > 0 && settings.aiFillMode === 'strict') {
      if (debug) {
        for (const m of missingSlots) {
          const key = `${m.date}-${m.slot}`;
          const deferred = deferredSlotStats.get(key);
          const {
            countsByStage = {},
            topReasonsByStage = {},
            candidateSample,
          } = deferred ?? {};
          const counts = Object.fromEntries(
            STAGES.map((s) => [s, countsByStage[s] ?? emptyStageCounts]),
          ) as Record<string, StageCountsEntry>;
          const topReasons = Object.fromEntries(
            STAGES.map((s) => [s, topReasonsByStage[s] ?? []]),
          );
          const summary: SlotSummaryData = {
            slotKey: key,
            finalSource: 'ai_failed',
            finalReasonKey: m.reason,
            countsByStage: counts,
            topReasonsByStage: topReasons,
            candidateSample,
          };
          debug.slotSummary(summary);
          allSlotSummaries.push(summary);
        }
        const diagnosis = buildRunDiagnosis(allSlotSummaries);
        debug.runDiagnosis(diagnosis);
      }
      throw new AppError(
        'MEAL_PLAN_INSUFFICIENT_CANDIDATES',
        'Het weekmenu kon niet volledig worden gevuld binnen je dieet-/huisregels. Voeg meer recepten toe of versoepel je regels.',
        { unfilledSlotsCount: missingSlots.length },
      );
    }

    if (missingSlots.length > 0) {
      const agentService = new MealPlannerAgentService();
      const onlySlots = missingSlots.map((m) => ({
        date: m.date,
        slot: m.slot,
      }));
      const aiPlan = await agentService.generateMealPlan(
        request,
        userLanguage,
        {
          dbFirstFillMissing: true,
          onlySlots,
          culinaryRules: options.culinaryRules,
        },
      );
      for (const m of missingSlots) {
        const aiMeal = aiPlan.days[m.dayIndex]?.meals[m.slotIndex];
        const key = `${m.date}-${m.slot}`;
        const deferred = debug ? deferredSlotStats.get(key) : null;
        if (!aiMeal || MealPlansService.isPlaceholderMeal(aiMeal)) {
          slotProvenance[key] = {
            source: 'ai',
            reason: 'ai_candidate_blocked_by_constraints',
          };
          if (debug) {
            debug.event('slot_fallback_failed', {
              slotKey: key,
              fallbackReasonKey: 'ai_candidate_blocked_by_constraints',
              note: 'ai_returned_no_meal_or_placeholder',
            });
            const {
              countsByStage = {},
              topReasonsByStage = {},
              candidateSample,
            } = deferred ?? {};
            const counts = Object.fromEntries(
              STAGES.map((s) => [s, countsByStage[s] ?? emptyStageCounts]),
            ) as Record<string, StageCountsEntry>;
            const topReasons = Object.fromEntries(
              STAGES.map((s) => [s, topReasonsByStage[s] ?? []]),
            );
            const summary: SlotSummaryData = {
              slotKey: key,
              finalSource: 'ai_failed',
              finalReasonKey: 'ai_candidate_blocked_by_constraints',
              countsByStage: counts,
              topReasonsByStage: topReasons,
              candidateSample,
            };
            debug.slotSummary(summary);
            allSlotSummaries.push(summary);
          }
          continue;
        }
        const candidatePlan = clonePlan(plan);
        candidatePlan.days[m.dayIndex].meals[m.slotIndex] = aiMeal;
        const issues = await validateHardConstraints({
          plan: candidatePlan,
          rules,
          request,
        });
        if (issues.length > 0) {
          slotProvenance[key] = {
            source: 'ai',
            reason: 'ai_candidate_blocked_by_constraints',
          };
          if (debug) {
            const issueEntries = issues.map((i) => ({
              code: i.code,
              detail: i.detail ?? i.message?.slice(0, 120),
            }));
            debug.candidateReject(
              key,
              'hard_constraints',
              aiMeal,
              issueEntries,
            );
            debug.event('slot_fallback_failed', {
              slotKey: key,
              fallbackReasonKey: 'ai_candidate_blocked_by_constraints',
              topIssueCodes: issues.map((i) => i.code).slice(0, 5),
            });
            const {
              countsByStage = {},
              topReasonsByStage = {},
              candidateSample,
            } = deferred ?? {};
            const counts = Object.fromEntries(
              STAGES.map((s) => [s, countsByStage[s] ?? emptyStageCounts]),
            ) as Record<string, StageCountsEntry>;
            const topReasons = Object.fromEntries(
              STAGES.map((s) => [s, topReasonsByStage[s] ?? []]),
            );
            const hcTop = issues
              .map((i) => i.code)
              .reduce((acc, code) => {
                acc.set(code, (acc.get(code) ?? 0) + 1);
                return acc;
              }, new Map<string, number>());
            const topHc = Array.from(hcTop.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([code, count]) => ({ code, count }));
            topReasons.hard_constraints = topHc;
            const summary: SlotSummaryData = {
              slotKey: key,
              finalSource: 'ai_failed',
              finalReasonKey: 'ai_candidate_blocked_by_constraints',
              countsByStage: counts,
              topReasonsByStage: topReasons,
              candidateSample,
            };
            debug.slotSummary(summary);
            allSlotSummaries.push(summary);
          }
          continue;
        }
        plan.days[m.dayIndex].meals[m.slotIndex] = aiMeal;
        slotProvenance[key] = { source: 'ai', reason: m.reason };
        if (debug) {
          debug.event('slot_fallback', {
            slotKey: key,
            fallbackReasonKey: m.reason,
            source: 'ai',
            candidateKey: `ai:${aiMeal.id}`,
            name: (aiMeal.name ?? '').slice(0, 80),
          });
          const {
            countsByStage = {},
            topReasonsByStage = {},
            candidateSample,
          } = deferred ?? {};
          const counts = Object.fromEntries(
            STAGES.map((s) => [s, countsByStage[s] ?? emptyStageCounts]),
          ) as Record<string, StageCountsEntry>;
          const topReasons = Object.fromEntries(
            STAGES.map((s) => [s, topReasonsByStage[s] ?? []]),
          );
          const summary: SlotSummaryData = {
            slotKey: key,
            finalSource: 'ai',
            finalReasonKey: m.reason,
            countsByStage: counts,
            topReasonsByStage: topReasons,
            candidateSample,
          };
          debug.slotSummary(summary);
          allSlotSummaries.push(summary);
        }
      }

      // 4) No placeholders in output: if any slot is still a placeholder, throw controlled error
      let unfilledSlotsCount = 0;
      for (const day of plan.days) {
        for (const meal of day.meals) {
          if (MealPlansService.isPlaceholderMeal(meal)) {
            unfilledSlotsCount++;
          }
        }
      }
      if (unfilledSlotsCount > 0) {
        throw new AppError(
          'MEAL_PLAN_INSUFFICIENT_CANDIDATES',
          'Het weekmenu kon niet volledig worden gevuld binnen je dieet-/huisregels. Voeg meer recepten toe of versoepel je regels.',
          { unfilledSlotsCount },
        );
      }
    }

    const totalMeals = plan.days.reduce((s, d) => s + d.meals.length, 0);
    const meta = (plan.metadata ?? {}) as Record<string, unknown>;
    meta.provenance = {
      reusedRecipeCount,
      generatedRecipeCount: totalMeals - reusedRecipeCount,
    };
    meta.slotProvenance = slotProvenance;

    const totalSlots = totalMeals;
    const entries = Object.values(slotProvenance);
    const dbSlots = entries.filter((e) => e.source === 'db').length;
    const percent =
      totalSlots > 0 ? Math.round((dbSlots / totalSlots) * 100) : 0;
    meta.dbCoverage = { dbSlots, totalSlots, percent };

    const aiWithReason = entries.filter(
      (e): e is SlotProvenanceEntry & { reason: SlotProvenanceReason } =>
        e.source === 'ai' && e.reason != null,
    );
    const reasonCounts = new Map<SlotProvenanceReason, number>();
    for (const e of aiWithReason) {
      reasonCounts.set(e.reason, (reasonCounts.get(e.reason) ?? 0) + 1);
    }
    meta.fallbackReasons = Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    if (debug) {
      const entries = Object.values(slotProvenance);
      const dbSlots = entries.filter((e) => e.source === 'db').length;
      const historySlots = entries.filter((e) => e.source === 'history').length;
      const aiSlots = entries.filter((e) => e.source === 'ai').length;
      debug.event('run_summary', {
        durationMs: Date.now() - runStartTs,
        dbSlots,
        historySlots,
        aiSlots,
        totalSlots: entries.length,
        reasonCounts: Array.from(reasonCounts.entries()).map(
          ([reason, count]) => ({
            reason,
            count,
          }),
        ),
      });
      const diagnosis = buildRunDiagnosis(allSlotSummaries);
      debug.runDiagnosis(diagnosis);
      if (options.debugContext?.debugMetaCollector && debug.getDebugMeta) {
        const dm = debug.getDebugMeta();
        options.debugContext.debugMetaCollector.runId = dm.runId;
        if (dm.logFileRelativePath) {
          options.debugContext.debugMetaCollector.logFileRelativePath =
            dm.logFileRelativePath;
        }
      }
    }

    plan.metadata = meta as MealPlanResponse['metadata'];
    return plan;
  }

  /**
   * Load recipe candidates from meal_history and custom_meals to build prefilledBySlot (~80% reuse target).
   * Uses explicit column lists (no SELECT *). RLS applies via user_id.
   */
  private async loadPrefilledBySlot(
    userId: string,
    request: MealPlanRequest,
    dietKey: DietKey,
    supabase: SupabaseClient,
  ): Promise<Partial<Record<MealSlot, Meal[]>>> {
    const slots = request.slots;
    const endDate = new Date(request.dateRange.end);
    const startDate = new Date(request.dateRange.start);
    const numDays =
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;
    const totalMeals = numDays * slots.length;
    const config = getMealPlannerConfig();
    const targetPrefill = Math.round(totalMeals * config.targetReuseRatio);
    const perSlotLimit = Math.max(1, Math.ceil(targetPrefill / slots.length));

    const result: Partial<Record<MealSlot, Meal[]>> = {};
    for (const slot of slots) {
      result[slot] = [];
    }

    const { data: prefsRow } = await supabase
      .from('user_preferences')
      .select(USER_PREFS_FAVORITES_AND_HOUSEHOLD_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();
    const prefs = prefsRow as {
      favorite_meal_ids?: string[];
      household_id?: string | null;
    } | null;
    const favoriteIds = Array.isArray(prefs?.favorite_meal_ids)
      ? prefs.favorite_meal_ids.slice(0, 10)
      : [];
    const favoriteOrder = new Map(
      favoriteIds.map((id, i) => [id, i] as [string, number]),
    );

    const householdId = prefs?.household_id ?? null;
    const blockRules: HouseholdBlockRules = {
      blockedNevoCodes: new Set(),
      blockedTerms: new Set(),
    };
    if (householdId) {
      const { data: rulesRows } = await supabase
        .from('household_avoid_rules')
        .select(HOUSEHOLD_AVOID_RULES_COLUMNS)
        .eq('household_id', householdId)
        .eq('strictness', 'hard');
      const rows = (rulesRows ?? []) as Array<{
        rule_type: string;
        match_mode: string;
        match_value: string;
        strictness: string;
      }>;
      for (const r of rows) {
        if (r.match_mode === 'nevo_code' && r.match_value?.trim()) {
          blockRules.blockedNevoCodes.add(r.match_value.trim());
        }
        if (r.match_mode === 'term' && r.match_value?.trim()) {
          blockRules.blockedTerms.add(r.match_value.trim());
        }
      }
    }

    const toMeal = (
      mealData: unknown,
      fallbackId: string,
      fallbackName: string,
      slot: MealSlot,
      recipeSource?: 'custom_meals' | 'meal_history',
    ): Meal | null => {
      if (!mealData || typeof mealData !== 'object') return null;
      const m = mealData as Record<string, unknown>;
      const id = (m.id as string) ?? fallbackId;
      const name = (m.name as string) ?? fallbackName;
      const ingredientRefs = Array.isArray(m.ingredientRefs)
        ? (m.ingredientRefs as Meal['ingredientRefs'])
        : [];
      if (!id || !name || ingredientRefs.length === 0) return null;
      return {
        id,
        name,
        slot,
        date: '',
        ingredientRefs,
        ...(recipeSource && { recipeSource }),
      };
    };

    // Prefer user's recipe database (custom_meals) over meal_history. Pool per slot by weekmenu_slots (or meal_slot fallback).
    type CustomRow = {
      id: string;
      name: string;
      meal_slot: string;
      weekmenu_slots: string[] | null;
      meal_data: Record<string, unknown>;
      consumption_count: number | null;
      updated_at: string | null;
    };
    const fetchLimitTotal = Math.max(
      perSlotLimit * slots.length,
      Math.min(
        perSlotLimit * slots.length * 2,
        config.prefillFetchLimitMax * slots.length,
      ),
    );
    const { data: customRowsRaw } = await supabase
      .from('custom_meals')
      .select(CUSTOM_MEALS_CANDIDATE_COLUMNS)
      .eq('user_id', userId)
      .or('meal_slot.in.(breakfast,lunch,dinner),weekmenu_slots.not.is.null')
      .order('consumption_count', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(fetchLimitTotal);

    const allCustomRows = (customRowsRaw ?? []).slice().sort((a, b) => {
      const aIdx = favoriteOrder.get(a.id as string) ?? Infinity;
      const bIdx = favoriteOrder.get(b.id as string) ?? Infinity;
      return aIdx - bIdx;
    }) as CustomRow[];

    const belongsToSlot = (row: CustomRow, slot: MealSlot): boolean => {
      const wm = row.weekmenu_slots;
      if (Array.isArray(wm) && wm.length > 0) return wm.includes(slot);
      return row.meal_slot === slot;
    };
    const customBySlot: { slot: MealSlot; rows: CustomRow[] }[] = slots.map(
      (slot) => ({
        slot: slot as MealSlot,
        rows: allCustomRows
          .filter((row) => belongsToSlot(row, slot as MealSlot))
          .slice(
            0,
            Math.max(
              perSlotLimit,
              Math.min(perSlotLimit * 2, config.prefillFetchLimitMax),
            ),
          ),
      }),
    );

    const recipeIdsNeedingRefs = customBySlot
      .flatMap(({ rows }) =>
        rows.filter((row) => {
          const refs = row.meal_data?.ingredientRefs;
          return !Array.isArray(refs) || refs.length === 0;
        }),
      )
      .map((row) => row.id);

    const ingredientRefsByRecipeId = new Map<string, MealIngredientRef[]>();
    if (recipeIdsNeedingRefs.length > 0) {
      const { data: ingRows } = await supabase
        .from('recipe_ingredients')
        .select(RECIPE_INGREDIENTS_NEVO_COLUMNS)
        .in('recipe_id', recipeIdsNeedingRefs)
        .not('nevo_food_id', 'is', null);

      const rows = (ingRows ?? []) as Array<{
        recipe_id: string;
        nevo_food_id: number | null;
        quantity: number | null;
        unit: string | null;
        name: string | null;
      }>;
      for (const r of rows) {
        if (r.nevo_food_id == null) continue;
        const qty = r.quantity != null && r.quantity > 0 ? r.quantity : 100;
        const quantityG =
          r.unit?.toLowerCase() === 'g' ? qty : r.unit ? 100 : qty;
        const ref: MealIngredientRef = {
          nevoCode: String(r.nevo_food_id),
          quantityG: Math.max(1, Math.round(quantityG)),
          displayName: r.name ?? undefined,
        };
        const list = ingredientRefsByRecipeId.get(r.recipe_id) ?? [];
        list.push(ref);
        ingredientRefsByRecipeId.set(r.recipe_id, list);
      }
    }

    // 1) Fill each slot from custom_meals first (user's recipe database)
    for (const { slot, rows } of customBySlot) {
      for (const row of rows) {
        if (result[slot]!.length >= perSlotLimit) break;
        let mealData: Record<string, unknown> = row.meal_data;
        const existingRefs = mealData.ingredientRefs;
        if (
          (!Array.isArray(existingRefs) || existingRefs.length === 0) &&
          ingredientRefsByRecipeId.has(row.id)
        ) {
          mealData = {
            ...mealData,
            ingredientRefs: ingredientRefsByRecipeId.get(row.id),
          };
        }
        const meal = toMeal(
          mealData,
          (row.id as string) ?? (mealData.id as string),
          (row.name as string) ?? (mealData.name as string) ?? '',
          slot,
          'custom_meals',
        );
        const id = (row.id as string) ?? (mealData.id as string);
        const name = (row.name as string) ?? (mealData.name as string) ?? '';
        const stub: Meal = {
          id,
          name,
          slot,
          date: '',
          ingredientRefs: [],
          recipeSource: 'custom_meals',
        };
        const toPush = meal ?? stub;
        if (
          !isMealBlockedByHouseholdRules(toPush, toPush.name, blockRules) &&
          !isMealBlockedByAllergiesOrDislikes(
            toPush,
            request.profile.allergies ?? [],
            request.profile.dislikes ?? [],
          )
        ) {
          result[slot]!.push(toPush);
        }
      }
    }

    // 2) Top up from meal_history so we still hit perSlotLimit when user has few custom recipes
    const { data: historyRowsRaw } = await supabase
      .from('meal_history')
      .select(MEAL_HISTORY_CANDIDATE_COLUMNS)
      .eq('user_id', userId)
      .eq('diet_key', dietKey)
      .in('meal_slot', slots)
      .order('combined_score', { ascending: false, nullsFirst: false })
      .order('user_rating', { ascending: false, nullsFirst: false })
      .order('last_used_at', { ascending: false, nullsFirst: true })
      .limit(perSlotLimit * slots.length);

    const historyRows = (historyRowsRaw ?? []).slice().sort((a, b) => {
      const aId = (a.meal_id as string) ?? (a.id as string);
      const bId = (b.meal_id as string) ?? (b.id as string);
      const aIdx = favoriteOrder.get(aId) ?? Infinity;
      const bIdx = favoriteOrder.get(bId) ?? Infinity;
      return aIdx - bIdx;
    });

    const usedIdsBySlot = new Map<MealSlot, Set<string>>();
    for (const slot of slots) {
      usedIdsBySlot.set(slot, new Set(result[slot]!.map((m) => m.id)));
    }

    for (const row of historyRows) {
      const slot = row.meal_slot as MealSlot;
      if (!slots.includes(slot) || !result[slot]) continue;
      if (result[slot]!.length >= perSlotLimit) continue;
      const mealId = (row.meal_id as string) ?? row.id;
      if (usedIdsBySlot.get(slot)?.has(mealId)) continue;
      const meal = toMeal(
        row.meal_data,
        mealId,
        (row.meal_name as string) ?? '',
        slot,
        'meal_history',
      );
      const stub: Meal = {
        id: mealId,
        name: (row.meal_name as string) ?? '',
        slot,
        date: '',
        ingredientRefs: [],
        recipeSource: 'meal_history',
      };
      const toPush = meal ?? stub;
      if (
        !isMealBlockedByHouseholdRules(toPush, toPush.name, blockRules) &&
        !isMealBlockedByAllergiesOrDislikes(
          toPush,
          request.profile.allergies ?? [],
          request.profile.dislikes ?? [],
        )
      ) {
        result[slot]!.push(toPush);
        usedIdsBySlot.get(slot)?.add(mealId);
      }
    }

    // Diagnostic logging when MEAL_PLANNER_PREFILL_DEBUG=true (dev/diagnosis)
    if (process.env.MEAL_PLANNER_PREFILL_DEBUG === 'true') {
      const customTotal = allCustomRows.length;
      const customWithRefs = allCustomRows.filter((r) => {
        const refs = r.meal_data?.ingredientRefs;
        const fromDb = ingredientRefsByRecipeId.has(r.id);
        return (Array.isArray(refs) && refs.length > 0) || fromDb;
      }).length;
      const slotCounts = Object.fromEntries(
        slots.map((slot) => [
          slot,
          {
            custom: customBySlot.find((c) => c.slot === slot)?.rows.length ?? 0,
            inResult: result[slot]?.length ?? 0,
          },
        ]),
      );
      console.debug('[loadPrefilledBySlot]', {
        custom_meals_total: customTotal,
        custom_with_ingredientRefs: customWithRefs,
        recipeIds_needing_refs: recipeIdsNeedingRefs.length,
        refs_from_recipe_ingredients: ingredientRefsByRecipeId.size,
        meal_history_rows: historyRows.length,
        slots: slotCounts,
        dietKey,
      });
    }

    return result;
  }

  /**
   * Try to reuse meals from history instead of generating new ones.
   * History-only path when filledSlots/totalSlots >= minHistoryReuseRatio (DB-configured).
   * Recency filter uses recencyWindowDays (DB-configured); 0 = no recency restriction.
   *
   * @param userId - User ID
   * @param request - Meal plan request
   * @param dietKey - Diet key
   * @param historyService - Meal history service
   * @param historyReuseConfig - minHistoryReuseRatio and recencyWindowDays from loadMealPlanGeneratorDbConfig
   * @returns Reuse result with plan and count
   */
  private async tryReuseMealsFromHistory(
    userId: string,
    request: MealPlanRequest,
    dietKey: DietKey,
    historyService: import('@/src/lib/meal-history/mealHistory.service').MealHistoryService,
    historyReuseConfig: {
      minHistoryReuseRatio: number;
      recencyWindowDays: number;
    },
  ): Promise<{
    canReuse: boolean;
    plan: MealPlanResponse;
    reusedCount: number;
  }> {
    const { dateRange, slots } = request;
    const { minHistoryReuseRatio, recencyWindowDays } = historyReuseConfig;

    // Calculate total number of meal slots needed
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    const numDays =
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;
    const totalSlots = numDays * slots.length;

    // DB-configured threshold: history-only when filledSlots/totalSlots >= minHistoryReuseRatio
    const minReuseThreshold = Math.ceil(totalSlots * minHistoryReuseRatio);

    // Collect meals from history for each day/slot
    const reusedMeals: Meal[] = [];
    const usedMealIds = new Set<string>();

    for (let dayOffset = 0; dayOffset < numDays; dayOffset++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + dayOffset);
      const dateStr = currentDate.toISOString().split('T')[0];

      for (const slot of slots) {
        // Get meal preferences for this slot
        const slotPreferences =
          request.profile.mealPreferences?.[
            slot as keyof typeof request.profile.mealPreferences
          ] || [];

        // Find suitable meal from history
        const candidates = await historyService.findMeals({
          userId,
          dietKey,
          mealSlot: slot,
          minRating: 3, // Only reuse meals rated 3+ stars
          minCombinedScore: 60, // Minimum combined score
          excludeMealIds: Array.from(usedMealIds),
          limit: 20, // Get more candidates to filter by preferences
          maxUsageCount: 10, // Don't reuse meals used more than 10 times
          // DB-configured recency window; 0 = no recency filter
          daysSinceLastUse:
            recencyWindowDays > 0 ? recencyWindowDays : undefined,
        });

        // Filter candidates by meal preferences if preferences exist
        let filteredCandidates = candidates;
        if (slotPreferences.length > 0) {
          const { mealMatchesPreferences } =
            await import('@/src/lib/meal-history/mealPreferenceMatcher');
          filteredCandidates = candidates.filter(
            (candidate: { mealData: Meal }) =>
              mealMatchesPreferences(
                candidate.mealData,
                slot as MealSlot,
                slotPreferences,
              ),
          );
        }

        if (filteredCandidates.length > 0) {
          // Use the best candidate (first in sorted list)
          const meal = filteredCandidates[0].mealData;
          // Update date to match current day
          const reusedMeal: Meal = {
            ...meal,
            date: dateStr,
            id: `${meal.id}-${dateStr}`, // New ID for this instance
          };

          reusedMeals.push(reusedMeal);
          usedMealIds.add(meal.id);

          // Update usage count
          await historyService.updateMealUsage(userId, meal.id);
        }
      }
    }

    // Check if we have enough meals to reuse
    if (reusedMeals.length < minReuseThreshold) {
      // Not enough meals - return false to trigger generation
      return {
        canReuse: false,
        plan: {
          requestId: `reuse-attempt-${Date.now()}`,
          days: [],
        },
        reusedCount: 0,
      };
    }

    // Group meals by date
    const mealsByDate = new Map<string, Meal[]>();
    for (const meal of reusedMeals) {
      if (!mealsByDate.has(meal.date)) {
        mealsByDate.set(meal.date, []);
      }
      mealsByDate.get(meal.date)!.push(meal);
    }

    // Build plan from reused meals
    const planDays: MealPlanDay[] = [];
    for (let dayOffset = 0; dayOffset < numDays; dayOffset++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + dayOffset);
      const dateStr = currentDate.toISOString().split('T')[0];

      const dayMeals = mealsByDate.get(dateStr) || [];
      planDays.push({
        date: dateStr,
        meals: dayMeals,
      });
    }

    const plan: MealPlanResponse = {
      requestId: `reused-${Date.now()}`,
      days: planDays,
      metadata: {
        generatedAt: new Date().toISOString(),
        dietKey,
        totalDays: planDays.length,
        totalMeals: reusedMeals.length,
      },
    };

    return {
      canReuse: true,
      plan,
      reusedCount: reusedMeals.length,
    };
  }
}
