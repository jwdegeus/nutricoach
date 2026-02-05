'use server';

import { createClient } from '@/src/lib/supabase/server';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import { applyPlanEdit } from '@/src/lib/agents/meal-planner/planEdit.apply';
import { AppError, type AppErrorCode } from '@/src/lib/errors/app-error';
import type { PlanEdit } from '@/src/lib/agents/meal-planner/planEdit.types';

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
      };
    };

/**
 * Map plan edit action to run type
 */
function getRunType(
  action: PlanEdit['action'],
): 'generate' | 'regenerate' | 'enrich' {
  switch (action) {
    case 'REGENERATE_DAY':
      return 'regenerate';
    case 'REPLACE_MEAL':
    case 'ADD_SNACK':
    case 'REMOVE_MEAL':
      return 'generate';
    default:
      return 'generate';
  }
}

/**
 * Apply a direct plan edit (without chat) - runs asynchronously
 */
export async function applyDirectPlanEditAction(
  edit: PlanEdit,
): Promise<ActionResult<{ runId: string; planId: string }>> {
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
          message: 'Je moet ingelogd zijn om een plan edit toe te passen',
        },
      };
    }

    // Log "running" status at start (model from GEMINI_MODEL_PLAN / GEMINI_MODEL in .env.local)
    const model = getGeminiClient().getModelName('plan');
    const runType = getRunType(edit.action);
    const { data: runData, error: runError } = await supabase
      .from('meal_plan_runs')
      .insert({
        user_id: user.id,
        meal_plan_id: edit.planId,
        run_type: runType,
        model,
        status: 'running',
        duration_ms: 0,
      })
      .select('id')
      .single();

    if (runError || !runData) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message:
            'Fout bij starten edit: ' + (runError?.message || 'Unknown error'),
        },
      };
    }

    const runId = runData.id;

    // Start edit asynchronously (don't await)
    const startTime = Date.now();
    applyPlanEdit({
      userId: user.id,
      edit,
      runId, // Pass runId so apply function doesn't log duplicate runs
    })
      .then(async (_result) => {
        // Update run status to success
        const duration = Date.now() - startTime;
        await supabase
          .from('meal_plan_runs')
          .update({
            status: 'success',
            duration_ms: duration,
          })
          .eq('id', runId);
      })
      .catch(async (error) => {
        // Update run status to error
        const duration = Date.now() - startTime;
        const errorCode =
          error instanceof AppError ? error.code : 'AGENT_ERROR';
        const errorMessage =
          error instanceof AppError
            ? error.safeMessage
            : error instanceof Error
              ? error.message
              : 'Unknown error';

        await supabase
          .from('meal_plan_runs')
          .update({
            status: 'error',
            duration_ms: duration,
            error_code: errorCode,
            error_message: errorMessage,
          })
          .eq('id', runId);
      });

    return {
      ok: true,
      data: {
        runId,
        planId: edit.planId,
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
 * Check status of a plan edit run
 */
export async function checkPlanEditStatusAction(runId: string): Promise<
  ActionResult<{
    status: 'running' | 'success' | 'error';
    errorMessage?: string;
  }>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om de status te checken',
        },
      };
    }

    const { data: run, error } = await supabase
      .from('meal_plan_runs')
      .select('status, error_message')
      .eq('id', runId)
      .eq('user_id', user.id)
      .single();

    if (error || !run) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Run niet gevonden',
        },
      };
    }

    return {
      ok: true,
      data: {
        status: run.status as 'running' | 'success' | 'error',
        errorMessage: run.error_message || undefined,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Get active running edits for a plan
 */
export async function getActivePlanEditsAction(
  planId: string,
): Promise<
  ActionResult<Array<{ runId: string; runType: string; createdAt: string }>>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const { data: runs, error } = await supabase
      .from('meal_plan_runs')
      .select('id, run_type, created_at')
      .eq('user_id', user.id)
      .eq('meal_plan_id', planId)
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: (runs || []).map((run) => ({
        runId: run.id,
        runType: run.run_type,
        createdAt: run.created_at,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}
