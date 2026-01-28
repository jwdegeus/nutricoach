'use server';

import { createClient } from '@/src/lib/supabase/server';

/**
 * Meal plan run record (from database)
 */
export type MealPlanRunRecord = {
  id: string;
  userId: string;
  mealPlanId: string | null;
  runType: 'generate' | 'regenerate' | 'enrich';
  model: string;
  status: 'running' | 'success' | 'error';
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'DB_ERROR';
        message: string;
      };
    };

/**
 * List meal plan runs for current user
 */
export async function listRunsAction(
  limit: number = 50,
): Promise<ActionResult<MealPlanRunRecord[]>> {
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
          message: 'Je moet ingelogd zijn om runs te bekijken',
        },
      };
    }

    // Query runs
    const { data, error } = await supabase
      .from('meal_plan_runs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Fout bij ophalen runs: ${error.message}`,
        },
      };
    }

    // Map snake_case to camelCase
    const runs: MealPlanRunRecord[] = (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      mealPlanId: row.meal_plan_id,
      runType: row.run_type,
      model: row.model,
      status: row.status,
      durationMs: row.duration_ms,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    }));

    return {
      ok: true,
      data: runs,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij ophalen runs',
      },
    };
  }
}

/**
 * Get the latest running meal plan run for current user
 */
export async function getLatestRunningRunAction(): Promise<
  ActionResult<MealPlanRunRecord | null>
> {
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
          message: 'Je moet ingelogd zijn om runs te bekijken',
        },
      };
    }

    // Query latest running run
    const { data, error } = await supabase
      .from('meal_plan_runs')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'running')
      .in('run_type', ['generate', 'regenerate'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Fout bij ophalen run: ${error.message}`,
        },
      };
    }

    if (!data) {
      return {
        ok: true,
        data: null,
      };
    }

    // Map snake_case to camelCase
    const run: MealPlanRunRecord = {
      id: data.id,
      userId: data.user_id,
      mealPlanId: data.meal_plan_id,
      runType: data.run_type,
      model: data.model,
      status: data.status,
      durationMs: data.duration_ms,
      errorCode: data.error_code,
      errorMessage: data.error_message,
      createdAt: data.created_at,
    };

    return {
      ok: true,
      data: run,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij ophalen run',
      },
    };
  }
}

/**
 * Cancel a running meal plan run
 * Marks the run as "error" with "CANCELLED" error code
 */
export async function cancelRunAction(
  runId: string,
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
          message: 'Je moet ingelogd zijn om runs te annuleren',
        },
      };
    }

    // Check if run exists and belongs to user
    const { data: existingRun, error: fetchError } = await supabase
      .from('meal_plan_runs')
      .select('id, status, user_id')
      .eq('id', runId)
      .single();

    if (fetchError || !existingRun) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Run niet gevonden',
        },
      };
    }

    if (existingRun.user_id !== user.id) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je hebt geen toegang tot deze run',
        },
      };
    }

    if (existingRun.status !== 'running') {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Alleen running runs kunnen worden geannuleerd',
        },
      };
    }

    // Calculate duration
    const { data: runData } = await supabase
      .from('meal_plan_runs')
      .select('created_at')
      .eq('id', runId)
      .single();

    const durationMs = runData
      ? Date.now() - new Date(runData.created_at).getTime()
      : 0;

    // Update run status to error
    const { error: updateError } = await supabase
      .from('meal_plan_runs')
      .update({
        status: 'error',
        duration_ms: durationMs,
        error_code: 'CANCELLED',
        error_message: 'Run geannuleerd door gebruiker',
      })
      .eq('id', runId)
      .eq('user_id', user.id);

    if (updateError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Fout bij annuleren run: ${updateError.message}`,
        },
      };
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij annuleren run',
      },
    };
  }
}

/**
 * Delete a meal plan run
 */
export async function deleteRunAction(
  runId: string,
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
          message: 'Je moet ingelogd zijn om runs te verwijderen',
        },
      };
    }

    // Check if run exists and belongs to user
    const { data: existingRun, error: fetchError } = await supabase
      .from('meal_plan_runs')
      .select('id, user_id')
      .eq('id', runId)
      .single();

    if (fetchError || !existingRun) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Run niet gevonden',
        },
      };
    }

    if (existingRun.user_id !== user.id) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je hebt geen toegang tot deze run',
        },
      };
    }

    // Delete run
    // Note: Supabase delete() returns the deleted rows when using .select()
    const { data: deletedData, error: deleteError } = await supabase
      .from('meal_plan_runs')
      .delete()
      .eq('id', runId)
      .eq('user_id', user.id)
      .select();

    if (deleteError) {
      console.error('Delete error details:', {
        message: deleteError.message,
        code: deleteError.code,
        details: deleteError.details,
        hint: deleteError.hint,
      });

      // Check if it's a policy/permission error
      if (
        deleteError.code === '42501' ||
        deleteError.message?.includes('policy') ||
        deleteError.message?.includes('permission')
      ) {
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message:
              "Geen toestemming om runs te verwijderen. De DELETE policy is mogelijk nog niet toegepast. Voer 'supabase db push' uit om de migratie toe te passen.",
          },
        };
      }

      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Fout bij verwijderen run: ${deleteError.message} (Code: ${deleteError.code || 'unknown'})`,
        },
      };
    }

    // Check if anything was actually deleted
    // Supabase returns deleted rows in data array when using .select()
    if (!deletedData || deletedData.length === 0) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message:
            'Run kon niet worden verwijderd. Mogelijk bestaat de run niet meer, is deze al verwijderd, of heb je geen toestemming (DELETE policy ontbreekt mogelijk).',
        },
      };
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij verwijderen run',
      },
    };
  }
}
