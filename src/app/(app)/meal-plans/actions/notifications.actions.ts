'use server';

import { createClient } from '@/src/lib/supabase/server';
import type { Notification } from '@/src/components/app/NotificationsIndicator';

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR';
        message: string;
      };
    };

/**
 * Get notifications for the current user (last 50 runs from last 7 days)
 */
export async function getNotificationsAction(): Promise<
  ActionResult<Notification[]>
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
          message: 'Je moet ingelogd zijn om notificaties te bekijken',
        },
      };
    }

    // Get runs from last 7 days, limit to 50 most recent
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: runs, error } = await supabase
      .from('meal_plan_runs')
      .select('id, meal_plan_id, run_type, status, error_message, created_at')
      .eq('user_id', user.id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    const notifications: Notification[] = (runs || []).map((run) => ({
      id: run.id,
      planId: run.meal_plan_id || '',
      runType: run.run_type,
      status: run.status as 'running' | 'success' | 'error',
      createdAt: run.created_at,
      errorMessage: run.error_message || undefined,
    }));

    return {
      ok: true,
      data: notifications,
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
