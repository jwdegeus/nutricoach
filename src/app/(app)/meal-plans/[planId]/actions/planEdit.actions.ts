'use server';

import type { PlanEdit } from '@/src/lib/meal-plans/planEdit.types';

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'DB_ERROR' | 'FEATURE_DISABLED';
        message: string;
      };
    };

/**
 * Plan edit is temporarily disabled (meal generator removed).
 */
export async function applyDirectPlanEditAction(
  _edit: PlanEdit,
): Promise<ActionResult<{ runId: string; planId: string }>> {
  return {
    ok: false,
    error: {
      code: 'FEATURE_DISABLED',
      message:
        'Plan bewerken is tijdelijk uitgeschakeld. Deze functie komt binnenkort weer beschikbaar.',
    },
  };
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
  const { createClient } = await import('@/src/lib/supabase/server');
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
  const { createClient } = await import('@/src/lib/supabase/server');
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
