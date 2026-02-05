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

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: AppErrorCode;
        message: string;
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
export async function createMealPlanAction(
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
          message: 'Je moet ingelogd zijn om een meal plan aan te maken',
        },
      };
    }

    // Validate input
    let input: CreateMealPlanInput;
    try {
      input = createMealPlanInputSchema.parse(raw);
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

    // Create plan
    const service = new MealPlansService();
    const result = await service.createPlanForUser(user.id, input);

    return {
      ok: true,
      data: result,
    };
  } catch (error) {
    type ErrorPayload = NonNullable<
      Extract<ActionResult<{ planId: string }>, { ok: false }>['error']
    >;
    let err: ErrorPayload;
    if (error instanceof AppError) {
      err = {
        code: error.code,
        message: error.safeMessage,
        ...(error.guardrailsDetails && { details: error.guardrailsDetails }),
        ...(error.details &&
          !error.guardrailsDetails && { details: error.details }),
      };
    } else {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
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
      err = { code, message: errorMessage };
    }

    try {
      await createInboxNotificationAction({
        type: 'meal_plan_generation_failed',
        title: 'Weekmenu generatie mislukt',
        message: 'Open het weekmenu en probeer opnieuw.',
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
    let input: RegenerateMealPlanInput;
    try {
      input = regenerateMealPlanInputSchema.parse(raw);
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

    // Regenerate plan
    const service = new MealPlansService();
    const result = await service.regeneratePlanForUser(user.id, input);

    return {
      ok: true,
      data: result,
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
