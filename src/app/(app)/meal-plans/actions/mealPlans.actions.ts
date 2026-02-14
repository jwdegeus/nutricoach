'use server';

import { createClient } from '@/src/lib/supabase/server';
import { MealPlansService } from '@/src/lib/meal-plans/mealPlans.service';
import { AppError, type AppErrorCode } from '@/src/lib/errors/app-error';
import { createInboxNotificationAction } from '@/src/app/(app)/inbox/actions/inboxNotifications.actions';
import type {
  CreateMealPlanInput,
  RegenerateMealPlanInput,
  MealPlanRecord,
} from '@/src/lib/meal-plans/mealPlans.types';
import {
  createMealPlanInputSchema,
  regenerateMealPlanInputSchema,
} from '@/src/lib/meal-plans/mealPlans.schemas';
import {
  presentMealPlanError,
  buildActionableInboxMessage,
} from '@/src/lib/meal-plans/mealPlanErrorPresenter';

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: AppErrorCode | 'UNKNOWN';
        message: string;
        /** NL user message (same as message when from presenter). */
        userMessageNl?: string;
        /** Max 3 suggested follow-up steps. */
        userActionHints?: string[];
        /** Safe diagnostics (counts, ratios, codes; no PII). */
        diagnostics?: Record<string, unknown>;
        details?:
          | {
              outcome: 'blocked';
              reasonCodes: string[];
              contentHash: string;
              rulesetVersion?: number;
              forceDeficits?: Array<{
                categoryCode: string;
                categoryNameNl: string;
                minPerDay?: number;
                minPerWeek?: number;
              }>;
            }
          | {
              issues?: Array<{
                code: string;
                message: string;
                mealId?: string;
                date?: string;
              }>;
            };
      };
    };

/**
 * Create a new meal plan
 */
export type CreateMealPlanResult = {
  planId: string;
  dbCoverageBelowTarget?: boolean;
  debug?: { runId: string; logFileRelativePath?: string };
};

export async function createMealPlanAction(
  raw: unknown,
): Promise<ActionResult<CreateMealPlanResult>> {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om een meal plan aan te maken',
        },
      };
    }

    // Validate input
    let _input: CreateMealPlanInput;
    try {
      _input = createMealPlanInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input voor meal plan',
        },
      };
    }

    // Meal plan generatie is tijdelijk uitgeschakeld
    return {
      ok: false,
      error: {
        code: 'FEATURE_DISABLED',
        message:
          'Meal plan generatie is tijdelijk uitgeschakeld. Deze functie komt binnenkort weer beschikbaar.',
      },
    };
  } catch (error) {
    const presentation = presentMealPlanError(error);
    if (
      (presentation.code === 'DB_ERROR' || presentation.code === 'UNKNOWN') &&
      error instanceof Error
    ) {
      console.error(
        `[createMealPlanAction] ${presentation.code}:`,
        error.message,
      );
    }
    type ErrorPayload = NonNullable<
      Extract<ActionResult<CreateMealPlanResult>, { ok: false }>['error']
    >;
    const err: ErrorPayload = {
      code: presentation.code,
      message: presentation.userMessageNl,
      ...(presentation.userActionHints.length > 0 && {
        userActionHints: presentation.userActionHints,
      }),
      ...(presentation.diagnostics && {
        diagnostics: presentation.diagnostics,
      }),
      ...(error instanceof AppError &&
        error.guardrailsDetails && { details: error.guardrailsDetails }),
    };

    try {
      const inboxMessage = buildActionableInboxMessage({
        code: presentation.code,
        userMessageNl: presentation.userMessageNl,
        userActionHints: presentation.userActionHints,
        diagnostics: presentation.diagnostics,
      });
      await createInboxNotificationAction({
        type: 'meal_plan_generation_failed',
        title: 'Weekmenu generatie mislukt',
        message: inboxMessage,
        details: { errorCode: err.code },
      });
    } catch {
      // Non-blocking: keep original error response
    }

    return { ok: false, error: err };
  }
}

/**
 * Regenerate a meal plan
 */
export async function regenerateMealPlanAction(
  raw: unknown,
): Promise<ActionResult<{ planId: string }>> {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om een meal plan te regenereren',
        },
      };
    }

    // Validate input
    let _input: RegenerateMealPlanInput;
    try {
      _input = regenerateMealPlanInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input voor regenerate',
        },
      };
    }

    // Meal plan regeneratie is tijdelijk uitgeschakeld
    return {
      ok: false,
      error: {
        code: 'FEATURE_DISABLED',
        message:
          'Meal plan regeneratie is tijdelijk uitgeschakeld. Deze functie komt binnenkort weer beschikbaar.',
      },
    };
  } catch (error) {
    // Handle AppError directly
    if (error instanceof AppError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.safeMessage,
          ...(error.guardrailsDetails && { details: error.guardrailsDetails }),
          ...(error.details &&
            !error.guardrailsDetails && { details: error.details }),
        },
      };
    }

    // Fallback for other errors
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

    return {
      ok: false,
      error: {
        code,
        message: errorMessage,
      },
    };
  }
}

/**
 * List meal plans for current user
 */
export async function listMealPlansAction(
  limit: number = 20,
): Promise<ActionResult<MealPlanRecord[]>> {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om meal plans op te halen',
        },
      };
    }

    // List plans
    const service = new MealPlansService();
    const plans = await service.listPlansForUser(user.id, limit);

    return {
      ok: true,
      data: plans,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij ophalen meal plans',
      },
    };
  }
}

/**
 * Load a specific meal plan
 */
export async function loadMealPlanAction(
  planId: string,
): Promise<ActionResult<MealPlanRecord>> {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om een meal plan op te halen',
        },
      };
    }

    // Load plan
    const service = new MealPlansService();
    const plan = await service.loadPlanForUser(user.id, planId);

    return {
      ok: true,
      data: plan,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij ophalen meal plan',
      },
    };
  }
}

/**
 * Delete a meal plan
 */
export async function deleteMealPlanAction(
  planId: string,
): Promise<ActionResult<void>> {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om een meal plan te verwijderen',
        },
      };
    }

    // Delete plan
    const service = new MealPlansService();
    await service.deletePlanForUser(user.id, planId);

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    // Handle AppError directly
    if (error instanceof AppError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.safeMessage,
          ...(error.guardrailsDetails && { details: error.guardrailsDetails }),
        },
      };
    }

    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij verwijderen meal plan',
      },
    };
  }
}
