/**
 * Plan Edit Apply Engine
 *
 * Applies plan edits to meal plans in a safe, deterministic way.
 * Validates all mutations and persists changes to the database.
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import { MealPlannerAgentService } from './mealPlannerAgent.service';
import { MealPlannerEnrichmentService } from './mealPlannerEnrichment.service';
import { MealPlansService } from '@/src/lib/meal-plans/mealPlans.service';
import { PantryService } from '@/src/lib/pantry/pantry.service';
import { MealPlanEditabilityService } from '@/src/lib/meal-plans/mealPlanEditability.service';
import { AppError } from '@/src/lib/errors/app-error';
import { mealPlanResponseSchema } from '@/src/lib/diets';
import type {
  MealPlanResponse,
  MealPlanDay,
  Meal,
  MealSlot,
} from '@/src/lib/diets';
import type { PlanEdit } from './planEdit.types';

/**
 * Guard Rails vNext diagnostics (shadow mode)
 */
export type GuardrailsVNextDiagnostics = {
  rulesetVersion: number;
  contentHash: string;
  outcome: 'allowed' | 'blocked' | 'warned';
  ok: boolean;
  reasonCodes: string[];
  counts: {
    matches: number;
    applied: number;
  };
};

/**
 * Result of applying a plan edit
 */
export type ApplyPlanEditResult = {
  planId: string;
  changed: {
    type: 'PLAN' | 'DAY' | 'MEAL' | 'PANTRY';
    date?: string;
    mealSlot?: string;
  };
  summary: string;
  /** Guard Rails vNext diagnostics (shadow mode, optional) */
  diagnostics?: {
    guardrailsVnext?: GuardrailsVNextDiagnostics;
  };
};

/**
 * Log a meal plan run
 */
async function logMealPlanRun(args: {
  userId: string;
  mealPlanId: string;
  runType: 'generate' | 'regenerate' | 'enrich';
  model: string;
  status: 'running' | 'success' | 'error';
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  const supabase = await createClient();

  await supabase.from('meal_plan_runs').insert({
    user_id: args.userId,
    meal_plan_id: args.mealPlanId,
    run_type: args.runType,
    model: args.model,
    status: args.status,
    duration_ms: args.durationMs,
    error_code: args.errorCode ?? null,
    error_message: args.errorMessage ?? null,
  });
}

/**
 * Apply a plan edit to a meal plan
 *
 * @param args - Apply arguments
 * @returns Result of applying the edit
 * @throws AppError if edit cannot be applied
 */
export async function applyPlanEdit(args: {
  userId: string;
  edit: PlanEdit;
  runId?: string; // Optional run ID to update status instead of logging new run
}): Promise<ApplyPlanEditResult> {
  const { userId, edit, runId } = args;

  // Load plan
  const mealPlansService = new MealPlansService();
  const plan = await mealPlansService.loadPlanForUser(userId, edit.planId);

  const request = plan.requestSnapshot;
  const planSnapshot = plan.planSnapshot;
  const supabase = await createClient();
  const model = getGeminiClient().getModelName('plan');
  const editabilityService = new MealPlanEditabilityService();

  let updatedPlan: MealPlanResponse;
  let result: ApplyPlanEditResult;

  try {
    switch (edit.action) {
      case 'REGENERATE_DAY': {
        if (!edit.date) {
          throw new AppError(
            'VALIDATION_ERROR',
            'date is required for REGENERATE_DAY action',
          );
        }

        // Check if day can be edited (business logic)
        const dayEditability = await editabilityService.checkDayEditability(
          userId,
          edit.planId,
          edit.date,
        );

        if (!dayEditability.canEdit) {
          throw new AppError(
            'MEAL_LOCKED',
            dayEditability.reason ||
              'Day cannot be regenerated because products are already purchased',
          );
        }

        // Find existing day
        const existingDay = planSnapshot.days.find((d) => d.date === edit.date);

        if (!existingDay) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Day ${edit.date} not found in plan`,
          );
        }

        // Generate new day
        const agentService = new MealPlannerAgentService();
        const { day: newDay } = await agentService.generateMealPlanDay({
          request,
          date: edit.date,
          existingDay,
        });

        // Replace day in plan
        updatedPlan = {
          ...planSnapshot,
          days: planSnapshot.days.map((day) =>
            day.date === edit.date ? newDay : day,
          ),
        };

        // Validate updated plan
        mealPlanResponseSchema.parse(updatedPlan);

        // Record change
        await editabilityService.recordChange({
          userId,
          mealPlanId: edit.planId,
          changeType: 'day_regenerated',
          date: edit.date,
          changeReason: edit.userIntentSummary,
        });

        // Persist
        const { error } = await supabase
          .from('meal_plans')
          .update({
            plan_snapshot: updatedPlan,
            updated_at: new Date().toISOString(),
          })
          .eq('id', edit.planId)
          .eq('user_id', userId);

        if (error) {
          throw new AppError(
            'DB_ERROR',
            `Failed to update meal plan: ${error.message}`,
          );
        }

        // Update run status if runId provided, otherwise log new run
        if (runId) {
          // Status will be updated by the calling action
        } else {
          await logMealPlanRun({
            userId,
            mealPlanId: edit.planId,
            runType: 'regenerate',
            model,
            status: 'success',
            durationMs: 0, // Duration not tracked in apply engine
          });
        }

        result = {
          planId: edit.planId,
          changed: {
            type: 'DAY',
            date: edit.date,
          },
          summary: `Day ${edit.date} regenerated`,
        };
        break;
      }

      case 'REPLACE_MEAL': {
        if (!edit.date || !edit.mealSlot) {
          throw new AppError(
            'VALIDATION_ERROR',
            'date and mealSlot are required for REPLACE_MEAL action',
          );
        }

        // Find existing day and meal
        const existingDay = planSnapshot.days.find((d) => d.date === edit.date);

        if (!existingDay) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Day ${edit.date} not found in plan`,
          );
        }

        const existingMeal = existingDay.meals.find(
          (m) => m.slot === edit.mealSlot,
        );

        if (!existingMeal) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Meal ${edit.mealSlot} not found for date ${edit.date}`,
          );
        }

        // Check if meal can be edited (business logic)
        const mealEditability = await editabilityService.checkMealEditability(
          userId,
          edit.planId,
          edit.date,
          edit.mealSlot as MealSlot,
          existingMeal.id,
        );

        if (!mealEditability.canEdit) {
          throw new AppError(
            'MEAL_LOCKED',
            mealEditability.reason ||
              'Meal cannot be replaced because products are already purchased',
          );
        }

        // Stap 15: Slot-only generation
        const agentService = new MealPlannerAgentService();
        const { meal: newMeal } = await agentService.generateMeal({
          request,
          date: edit.date,
          mealSlot: edit.mealSlot as MealSlot,
          existingMeal,
          constraints: edit.constraints,
        });

        // Replace only this meal in the day
        const updatedDay = {
          ...existingDay,
          meals: existingDay.meals.map((meal) =>
            meal.slot === edit.mealSlot ? newMeal : meal,
          ),
        };

        // Replace day in plan
        updatedPlan = {
          ...planSnapshot,
          days: planSnapshot.days.map((day) =>
            day.date === edit.date ? updatedDay : day,
          ),
        };

        // Validate updated plan
        mealPlanResponseSchema.parse(updatedPlan);

        // Persist plan_snapshot
        const { error } = await supabase
          .from('meal_plans')
          .update({
            plan_snapshot: updatedPlan,
            updated_at: new Date().toISOString(),
          })
          .eq('id', edit.planId)
          .eq('user_id', userId);

        if (error) {
          throw new AppError(
            'DB_ERROR',
            `Failed to update meal plan: ${error.message}`,
          );
        }

        // Stap 15: Enrichment refresh (meal-scoped)
        // Update enrichment_snapshot if it exists
        const currentPlan = await mealPlansService.loadPlanForUser(
          userId,
          edit.planId,
        );
        if (currentPlan.enrichmentSnapshot) {
          const enrichmentService = new MealPlannerEnrichmentService();
          const enrichedMeal = await enrichmentService.enrichMeal({
            date: edit.date,
            mealSlot: edit.mealSlot,
            meal: newMeal,
          });

          // Update enrichment snapshot: replace matching meal entry
          const updatedEnrichment = {
            ...currentPlan.enrichmentSnapshot,
            meals: currentPlan.enrichmentSnapshot.meals.map((em) =>
              em.date === edit.date && em.mealSlot === edit.mealSlot
                ? enrichedMeal
                : em,
            ),
          };

          // If meal didn't exist in enrichment, add it
          const existingEnrichedMeal =
            currentPlan.enrichmentSnapshot.meals.find(
              (em) => em.date === edit.date && em.mealSlot === edit.mealSlot,
            );
          if (!existingEnrichedMeal) {
            updatedEnrichment.meals.push(enrichedMeal);
          }

          // Persist enrichment_snapshot
          const { error: enrichmentError } = await supabase
            .from('meal_plans')
            .update({
              enrichment_snapshot: updatedEnrichment,
              updated_at: new Date().toISOString(),
            })
            .eq('id', edit.planId)
            .eq('user_id', userId);

          if (enrichmentError) {
            console.warn(
              'Failed to update enrichment snapshot:',
              enrichmentError,
            );
            // Don't throw - enrichment is optional
          }
        }

        // Update run status if runId provided, otherwise log new run
        if (!runId) {
          await logMealPlanRun({
            userId,
            mealPlanId: edit.planId,
            runType: 'regenerate',
            model,
            status: 'success',
            durationMs: 0,
          });
        }

        result = {
          planId: edit.planId,
          changed: {
            type: 'MEAL',
            date: edit.date,
            mealSlot: edit.mealSlot,
          },
          summary: `Meal ${edit.mealSlot} replaced on ${edit.date}`,
        };
        break;
      }

      case 'ADD_SNACK': {
        if (!edit.date || !edit.mealSlot) {
          throw new AppError(
            'VALIDATION_ERROR',
            'date and mealSlot are required for ADD_SNACK action',
          );
        }

        // Find existing day
        const existingDay = planSnapshot.days.find((d) => d.date === edit.date);

        if (!existingDay) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Day ${edit.date} not found in plan`,
          );
        }

        // Stap 15: Slot-only generation (no existing meal)
        const agentService = new MealPlannerAgentService();
        const { meal: newMeal } = await agentService.generateMeal({
          request,
          date: edit.date,
          mealSlot: edit.mealSlot,
          existingMeal: undefined, // New meal
          constraints: edit.constraints,
        });

        // Insert meal in day (append)
        const updatedDay = {
          ...existingDay,
          meals: [...existingDay.meals, newMeal],
        };

        // Replace day in plan
        updatedPlan = {
          ...planSnapshot,
          days: planSnapshot.days.map((day) =>
            day.date === edit.date ? updatedDay : day,
          ),
        };

        // Validate updated plan
        mealPlanResponseSchema.parse(updatedPlan);

        // Persist plan_snapshot
        const { error } = await supabase
          .from('meal_plans')
          .update({
            plan_snapshot: updatedPlan,
            updated_at: new Date().toISOString(),
          })
          .eq('id', edit.planId)
          .eq('user_id', userId);

        if (error) {
          throw new AppError(
            'DB_ERROR',
            `Failed to update meal plan: ${error.message}`,
          );
        }

        // Stap 15: Enrichment refresh (meal-scoped)
        // Update enrichment_snapshot if it exists
        const currentPlan = await mealPlansService.loadPlanForUser(
          userId,
          edit.planId,
        );
        if (currentPlan.enrichmentSnapshot) {
          const enrichmentService = new MealPlannerEnrichmentService();
          const enrichedMeal = await enrichmentService.enrichMeal({
            date: edit.date,
            mealSlot: edit.mealSlot,
            meal: newMeal,
          });

          // Add enriched meal to enrichment snapshot
          const updatedEnrichment = {
            ...currentPlan.enrichmentSnapshot,
            meals: [...currentPlan.enrichmentSnapshot.meals, enrichedMeal],
          };

          // Persist enrichment_snapshot
          const { error: enrichmentError } = await supabase
            .from('meal_plans')
            .update({
              enrichment_snapshot: updatedEnrichment,
              updated_at: new Date().toISOString(),
            })
            .eq('id', edit.planId)
            .eq('user_id', userId);

          if (enrichmentError) {
            console.warn(
              'Failed to update enrichment snapshot:',
              enrichmentError,
            );
            // Don't throw - enrichment is optional
          }
        }

        // Update run status if runId provided, otherwise log new run
        if (!runId) {
          await logMealPlanRun({
            userId,
            mealPlanId: edit.planId,
            runType: 'regenerate',
            model,
            status: 'success',
            durationMs: 0,
          });
        }

        result = {
          planId: edit.planId,
          changed: {
            type: 'MEAL',
            date: edit.date,
            mealSlot: edit.mealSlot,
          },
          summary: `Snack ${edit.mealSlot} added to ${edit.date}`,
        };
        break;
      }

      case 'REMOVE_MEAL': {
        if (!edit.date || !edit.mealSlot) {
          throw new AppError(
            'VALIDATION_ERROR',
            'date and mealSlot are required for REMOVE_MEAL action',
          );
        }

        // Find existing day
        const existingDay = planSnapshot.days.find((d) => d.date === edit.date);

        if (!existingDay) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Day ${edit.date} not found in plan`,
          );
        }

        const existingMeal = existingDay.meals.find(
          (m) => m.slot === edit.mealSlot,
        );

        if (!existingMeal) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Meal ${edit.mealSlot} not found for date ${edit.date}`,
          );
        }

        // Check if meal can be deleted (business logic)
        const mealEditability = await editabilityService.checkMealEditability(
          userId,
          edit.planId,
          edit.date,
          edit.mealSlot as MealSlot,
          existingMeal.id,
        );

        if (!mealEditability.canDelete) {
          throw new AppError(
            'MEAL_LOCKED',
            mealEditability.reason ||
              'Meal cannot be removed because products are already purchased',
          );
        }

        // Remove meal with matching slot
        const updatedDay: MealPlanDay = {
          ...existingDay,
          meals: existingDay.meals.filter(
            (meal) => meal.slot !== edit.mealSlot,
          ),
        };

        // Ensure at least one meal remains
        if (updatedDay.meals.length === 0) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Cannot remove last meal from a day',
          );
        }

        // Replace day in plan
        updatedPlan = {
          ...planSnapshot,
          days: planSnapshot.days.map((day) =>
            day.date === edit.date ? updatedDay : day,
          ),
        };

        // Validate updated plan
        mealPlanResponseSchema.parse(updatedPlan);

        // Record change
        await editabilityService.recordChange({
          userId,
          mealPlanId: edit.planId,
          changeType: 'meal_deleted',
          date: edit.date,
          mealSlot: edit.mealSlot as MealSlot | undefined,
          mealId: existingMeal.id,
          oldMealData: existingMeal,
          changeReason: edit.userIntentSummary,
        });

        // Persist plan_snapshot
        const { error } = await supabase
          .from('meal_plans')
          .update({
            plan_snapshot: updatedPlan,
            updated_at: new Date().toISOString(),
          })
          .eq('id', edit.planId)
          .eq('user_id', userId);

        if (error) {
          throw new AppError(
            'DB_ERROR',
            `Failed to update meal plan: ${error.message}`,
          );
        }

        // Stap 15: Update enrichment_snapshot to remove meal if it exists
        const currentPlan = await mealPlansService.loadPlanForUser(
          userId,
          edit.planId,
        );
        if (currentPlan.enrichmentSnapshot) {
          const updatedEnrichment = {
            ...currentPlan.enrichmentSnapshot,
            meals: currentPlan.enrichmentSnapshot.meals.filter(
              (em) => !(em.date === edit.date && em.mealSlot === edit.mealSlot),
            ),
          };

          // Persist enrichment_snapshot
          const { error: enrichmentError } = await supabase
            .from('meal_plans')
            .update({
              enrichment_snapshot: updatedEnrichment,
              updated_at: new Date().toISOString(),
            })
            .eq('id', edit.planId)
            .eq('user_id', userId);

          if (enrichmentError) {
            console.warn(
              'Failed to update enrichment snapshot:',
              enrichmentError,
            );
            // Don't throw - enrichment is optional
          }
        }

        result = {
          planId: edit.planId,
          changed: {
            type: 'MEAL',
            date: edit.date,
            mealSlot: edit.mealSlot as MealSlot | undefined,
          },
          summary: `Meal ${edit.mealSlot} removed from ${edit.date}`,
        };
        break;
      }

      case 'UPDATE_PANTRY': {
        if (!edit.pantryUpdates || edit.pantryUpdates.length === 0) {
          throw new AppError(
            'VALIDATION_ERROR',
            'pantryUpdates (min 1) is required for UPDATE_PANTRY action',
          );
        }

        // Update pantry via PantryService
        const pantryService = new PantryService();
        await pantryService.bulkUpsert(userId, {
          items: edit.pantryUpdates.map((update) => ({
            nevoCode: update.nevoCode,
            availableG: update.availableG ?? undefined,
            isAvailable: update.isAvailable ?? true,
          })),
        });

        result = {
          planId: edit.planId,
          changed: {
            type: 'PANTRY',
          },
          summary: `Pantry updated: ${edit.pantryUpdates.length} item(s)`,
        };
        break;
      }

      default: {
        // TypeScript exhaustive check
        const _exhaustive: never = edit as never;
        throw new AppError(
          'VALIDATION_ERROR',
          `Unknown action: ${(edit as PlanEdit).action}`,
        );
      }
    }

    // TODO: Re-enrich plan asynchronously / on demand
    // For Stap 14, we skip enrichment refresh to keep chat MVP lightweight

    return result;
  } catch (error) {
    // Re-throw AppError as-is
    if (error instanceof AppError) {
      throw error;
    }

    // Wrap other errors
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // Determine error code
    let code: 'VALIDATION_ERROR' | 'DB_ERROR' | 'AGENT_ERROR' = 'DB_ERROR';
    if (
      errorMessage.includes('validation') ||
      errorMessage.includes('Invalid')
    ) {
      code = 'VALIDATION_ERROR';
    } else if (
      errorMessage.includes('Gemini') ||
      errorMessage.includes('agent')
    ) {
      code = 'AGENT_ERROR';
    }

    throw new AppError(code, errorMessage, error);
  }
}
