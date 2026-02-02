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
import {
  createMealPlanInputSchema,
  regenerateMealPlanInputSchema,
} from './mealPlans.schemas';
import { getMealPlannerConfig } from './mealPlans.config';
import { getSlotStylePromptLabels } from '@/src/lib/messages.server';

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
  'id,name,meal_slot,meal_data,consumption_count,updated_at';

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
      const scaledRefs = (meal.ingredientRefs ?? []).map((ref) => ({
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
   * @returns Plan ID
   */
  async createPlanForUser(
    userId: string,
    input: CreateMealPlanInput,
    supabaseAdmin?: SupabaseClient,
  ): Promise<{ planId: string }> {
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
      const request: MealPlanRequest & {
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

      // Derive rules
      const rules = deriveDietRuleSet(profile);

      // Try to reuse meals from history before generating new ones
      // This reduces Gemini API calls and costs
      let plan: MealPlanResponse;
      let reusedMealsCount = 0;

      try {
        const { MealHistoryService } =
          await import('@/src/lib/meal-history/mealHistory.service');
        const historyService = new MealHistoryService();

        // Try to build plan from history
        const reuseResult = await this.tryReuseMealsFromHistory(
          userId,
          request,
          profile.dietKey,
          historyService,
        );

        if (reuseResult.canReuse) {
          // Use reused plan (partially or fully from history)
          plan = reuseResult.plan;
          reusedMealsCount = reuseResult.reusedCount;
          console.log(
            `Reused ${reusedMealsCount} meals from history for user ${userId}`,
          );
        } else {
          // Generate new plan with prefilled candidates (~80% from DB)
          const prefilledBySlot = await this.loadPrefilledBySlot(
            userId,
            request,
            profile.dietKey,
            supabase,
          );
          const agentService = new MealPlannerAgentService();
          plan = await agentService.generateMealPlan(request, userLanguage, {
            prefilledBySlot,
          });
        }
      } catch (reuseError) {
        // If reuse fails, fall back to generation (with prefilled if available)
        console.warn(
          'Meal reuse failed, generating new plan:',
          reuseError instanceof Error ? reuseError.message : 'Unknown error',
        );
        const prefilledBySlot = await this.loadPrefilledBySlot(
          userId,
          request,
          profile.dietKey,
          supabase,
        );
        const agentService = new MealPlannerAgentService();
        plan = await agentService.generateMealPlan(request, userLanguage, {
          prefilledBySlot,
        });
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
        typeof (prefsRow as { household_id?: string | null }).household_id ===
          'string' &&
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

      return { planId: data.id };
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
        if (errorMessage.includes('validation')) {
          errorCode = 'VALIDATION_ERROR';
        } else if (errorMessage.includes('Gemini')) {
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
        if (errorMessage.includes('validation')) {
          errorCode = 'VALIDATION_ERROR';
        } else if (errorMessage.includes('Gemini')) {
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
      };
    };

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

    for (const row of historyRows) {
      const slot = row.meal_slot as MealSlot;
      if (!slots.includes(slot) || !result[slot]) continue;
      const meal = toMeal(
        row.meal_data,
        (row.meal_id as string) ?? row.id,
        (row.meal_name as string) ?? '',
        slot,
      );
      if (
        meal &&
        result[slot]!.length < perSlotLimit &&
        !isMealBlockedByHouseholdRules(meal, meal.name, blockRules) &&
        !isMealBlockedByAllergiesOrDislikes(
          meal,
          request.profile.allergies ?? [],
          request.profile.dislikes ?? [],
        )
      ) {
        result[slot]!.push(meal);
      }
    }

    // Collect custom_meals per slot; then enrich meal_data from recipe_ingredients where ingredientRefs is empty (imported recipes)
    type CustomRow = {
      id: string;
      name: string;
      meal_slot: string;
      meal_data: Record<string, unknown>;
    };
    const customBySlot: { slot: MealSlot; rows: CustomRow[] }[] = [];

    for (const slot of slots) {
      if (result[slot]!.length >= perSlotLimit) continue;
      const need = perSlotLimit - result[slot]!.length;
      // Fetch more than need so we have spare after filtering (empty ingredientRefs, block rules)
      const fetchLimit = Math.max(
        need,
        Math.min(need * 2, config.prefillFetchLimitMax),
      );
      const { data: customRowsRaw } = await supabase
        .from('custom_meals')
        .select(CUSTOM_MEALS_CANDIDATE_COLUMNS)
        .eq('user_id', userId)
        .eq('meal_slot', slot)
        .order('consumption_count', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(fetchLimit);

      const rows = (customRowsRaw ?? []).slice().sort((a, b) => {
        const aIdx = favoriteOrder.get(a.id as string) ?? Infinity;
        const bIdx = favoriteOrder.get(b.id as string) ?? Infinity;
        return aIdx - bIdx;
      }) as CustomRow[];
      customBySlot.push({ slot: slot as MealSlot, rows });
    }

    // Recipe IDs that have empty ingredientRefs (e.g. imported recipes store ingredients in recipe_ingredients only)
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
        );
        if (
          meal &&
          !isMealBlockedByHouseholdRules(meal, meal.name, blockRules) &&
          !isMealBlockedByAllergiesOrDislikes(
            meal,
            request.profile.allergies ?? [],
            request.profile.dislikes ?? [],
          )
        ) {
          result[slot]!.push(meal);
        }
      }
    }

    return result;
  }

  /**
   * Try to reuse meals from history instead of generating new ones
   *
   * This reduces Gemini API calls by reusing rated meals.
   * Only reuses if we can fill at least 50% of slots from history.
   *
   * @param userId - User ID
   * @param request - Meal plan request
   * @param dietKey - Diet key
   * @param historyService - Meal history service
   * @returns Reuse result with plan and count
   */
  private async tryReuseMealsFromHistory(
    userId: string,
    request: MealPlanRequest,
    dietKey: DietKey,
    historyService: import('@/src/lib/meal-history/mealHistory.service').MealHistoryService,
  ): Promise<{
    canReuse: boolean;
    plan: MealPlanResponse;
    reusedCount: number;
  }> {
    const { dateRange, slots } = request;

    // Calculate total number of meal slots needed
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    const numDays =
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;
    const totalSlots = numDays * slots.length;

    // Minimum threshold: need at least 50% of slots from history to reuse
    const minReuseThreshold = Math.ceil(totalSlots * 0.5);

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
          daysSinceLastUse: 7, // Prefer meals not used in last 7 days
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
