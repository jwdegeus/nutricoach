/**
 * Meal Plans Service
 *
 * Server-side service for meal plan persistence, loading, and regeneration.
 */

import 'server-only';
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
} from '@/src/lib/diets';
import { deriveDietRuleSet, mealPlanResponseSchema } from '@/src/lib/diets';
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

/**
 * Log a meal plan run. Model is resolved from runType via GEMINI_MODEL_* env (see gemini.client.ts).
 */
async function logMealPlanRun(args: {
  userId: string;
  mealPlanId: string | null;
  runType: 'generate' | 'regenerate' | 'enrich';
  status: 'running' | 'success' | 'error';
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  const supabase = await createClient();
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
   * @throws AppError with RATE_LIMIT code if quota exceeded
   */
  private async assertWithinQuota(userId: string): Promise<void> {
    const supabase = await createClient();

    // Count runs in last hour (excluding "running" status to avoid counting incomplete runs)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from('meal_plan_runs')
      .select('*', { count: 'exact', head: true })
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
   * Marks old "running" runs as "error" to prevent blocking new generations
   *
   * @param userId - User ID
   */
  private async cleanupStaleRuns(userId: string): Promise<void> {
    const supabase = await createClient();

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
   * @throws AppError with CONFLICT code if active run exists
   */
  private async assertNoActiveRun(
    userId: string,
    mealPlanId?: string,
  ): Promise<void> {
    const supabase = await createClient();

    // First, clean up stale runs
    await this.cleanupStaleRuns(userId);

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
   * Create a new meal plan for a user
   *
   * Loads profile, generates plan, persists snapshots, and logs run.
   * Implements idempotency: if a plan with same user_id, date_from, days, diet_key exists, returns existing planId.
   *
   * @param userId - User ID
   * @param input - Create meal plan input
   * @returns Plan ID
   */
  async createPlanForUser(
    userId: string,
    input: CreateMealPlanInput,
  ): Promise<{ planId: string }> {
    const startTime = Date.now();
    let runId: string | null = null;
    const supabase = await createClient();
    const planModel = getGeminiClient().getModelName('plan');

    try {
      // Validate input
      const validated = createMealPlanInputSchema.parse(input);

      // Load user profile
      const profileService = new ProfileService();
      let profile = await profileService.loadDietProfileForUser(userId);

      // Get user language preference
      const userLanguage = await profileService.getUserLanguage(userId);

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

      // Build meal plan request
      const request: MealPlanRequest = {
        dateRange: {
          start: validated.dateFrom,
          end: endDateStr,
        },
        slots: ['breakfast', 'lunch', 'dinner'], // Default slots
        profile,
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
        await logMealPlanRun({
          userId,
          mealPlanId: existingPlan.id,
          runType: 'generate',
          status: 'success',
          durationMs: 0, // Indicates idempotent reuse
        });
        return { planId: existingPlan.id };
      }

      // Check quota
      await this.assertWithinQuota(userId);

      // Check concurrency lock
      await this.assertNoActiveRun(userId);

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
          // Generate new plan
          const agentService = new MealPlannerAgentService();
          plan = await agentService.generateMealPlan(request, userLanguage);
        }
      } catch (reuseError) {
        // If reuse fails, fall back to generation
        console.warn(
          'Meal reuse failed, generating new plan:',
          reuseError instanceof Error ? reuseError.message : 'Unknown error',
        );
        const agentService = new MealPlannerAgentService();
        plan = await agentService.generateMealPlan(request, userLanguage);
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
        await logMealPlanRun({
          userId,
          mealPlanId: null, // Will be set after insert
          runType: 'enrich',
          status: 'success',
          durationMs: enrichmentDurationMs,
        });
      } catch (enrichmentError) {
        // Enrichment failed - log error but continue with plan
        const enrichmentDurationMs = Date.now() - enrichmentStartTime;
        const enrichmentErrorMessage =
          enrichmentError instanceof Error
            ? enrichmentError.message
            : 'Unknown enrichment error';

        await logMealPlanRun({
          userId,
          mealPlanId: null,
          runType: 'enrich',
          status: 'error',
          durationMs: enrichmentDurationMs,
          errorCode: 'AGENT_ERROR',
          errorMessage: enrichmentErrorMessage.substring(0, 500),
        });

        // Continue without enrichment
        console.warn(
          'Enrichment failed, continuing with plan:',
          enrichmentErrorMessage,
        );
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
          plan_snapshot: plan,
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
          plan,
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

      // Update run status to success
      if (runId) {
        await supabase
          .from('meal_plan_runs')
          .update({
            status: 'success',
            meal_plan_id: data.id,
            duration_ms: durationMs,
          })
          .eq('id', runId)
          .eq('user_id', userId);
      } else {
        // Fallback: log new run if update failed
        await logMealPlanRun({
          userId,
          mealPlanId: data.id,
          runType: 'generate',
          status: 'success',
          durationMs,
        });
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
        await logMealPlanRun({
          userId,
          mealPlanId: null,
          runType: 'generate',
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
      .select('*')
      .eq('id', planId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new Error(
        `Meal plan not found: ${error?.message || 'Unknown error'}`,
      );
    }

    let planSnapshot = data.plan_snapshot as MealPlanResponse;
    let enrichmentSnapshot = data.enrichment_snapshot as any;

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
              enrichmentSnapshot,
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

    // Map snake_case to camelCase
    return {
      id: data.id,
      userId: data.user_id,
      dietKey: data.diet_key,
      dateFrom: data.date_from,
      days: data.days,
      requestSnapshot: data.request_snapshot as MealPlanRequest,
      rulesSnapshot: data.rules_snapshot as any,
      planSnapshot,
      enrichmentSnapshot,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Delete a meal plan for a user
   *
   * @param userId - User ID
   * @param planId - Plan ID to delete
   */
  async deletePlanForUser(userId: string, planId: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('meal_plans')
      .delete()
      .eq('id', planId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete meal plan: ${error.message}`);
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
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list meal plans: ${error.message}`);
    }

    // Map snake_case to camelCase
    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      dietKey: row.diet_key,
      dateFrom: row.date_from,
      days: row.days,
      requestSnapshot: row.request_snapshot as MealPlanRequest,
      rulesSnapshot: row.rules_snapshot as any,
      planSnapshot: row.plan_snapshot as MealPlanResponse,
      enrichmentSnapshot: row.enrichment_snapshot as any,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
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
