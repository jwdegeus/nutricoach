'use server';

import { createClient } from '@/src/lib/supabase/server';

const TIMEZONE = 'Europe/Amsterdam';
const JOB_SCHEDULE_COLUMNS = 'id,status,scheduled_for';
const JOB_INSERT_SELECT_COLUMNS = 'id,scheduled_for';

/** Defaults when user_preferences row missing (0=Sun … 6=Sat). */
const DEFAULT_SHOPPING_DAY = 5;
const DEFAULT_LEAD_TIME_HOURS = 48;
const SHOPPING_TIME = '09:00';

/** Minimal columns from user_preferences (no SELECT *) */
const USER_PREFS_SCHEDULE_COLUMNS = 'shopping_day,meal_plan_lead_time_hours';

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'DB_ERROR' | 'VALIDATION_ERROR';
        message: string;
      };
    };

export type ScheduleNextMealPlanJobResult = {
  jobId: string;
  scheduledFor: string;
  weekStart: string;
};

/**
 * Get today’s date (Y, M, D) in Europe/Amsterdam.
 */
function todayInAmsterdam(): { y: number; m: number; d: number } {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(d);
  const y = Number(parts.find((p) => p.type === 'year')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'month')?.value ?? 1);
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? 1);
  return { y, m, d: day };
}

/**
 * Next Monday 00:00 in Europe/Amsterdam as YYYY-MM-DD.
 */
function nextMondayWeekStart(): string {
  const { y, m, d } = todayInAmsterdam();
  const weekDay = new Date(y, m - 1, d).getDay();
  const mondayOffset = (weekDay + 6) % 7;
  const daysToNextMonday = mondayOffset === 0 ? 7 : 7 - mondayOffset;
  const nextMon = new Date(y, m - 1, d + daysToNextMonday);
  const y2 = nextMon.getFullYear();
  const m2 = nextMon.getMonth() + 1;
  const d2 = nextMon.getDate();
  return `${y2}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
}

/**
 * Shopping day date (YYYY-MM-DD) for the week that starts on weekStart (Monday).
 * shoppingDay: 0=Sun … 5=Fri … 6=Sat.
 */
function shoppingDateForWeek(
  weekStart: string,
  shoppingDay: number,
): { y: number; m: number; d: number } {
  const [y, m, d] = weekStart.split('-').map(Number);
  const mondayOffset = 1;
  const dayOffset = shoppingDay - mondayOffset;
  if (dayOffset < 0) {
    const prev = new Date(y, m - 1, d + dayOffset);
    return {
      y: prev.getFullYear(),
      m: prev.getMonth() + 1,
      d: prev.getDate(),
    };
  }
  const next = new Date(y, m - 1, d + dayOffset);
  return {
    y: next.getFullYear(),
    m: next.getMonth() + 1,
    d: next.getDate(),
  };
}

/**
 * Converts a "wall clock" time in a timezone to the corresponding UTC instant (ISO string).
 * DST-correct: uses Intl.DateTimeFormat with timeZone so summer/winter and switch dates are right.
 * No external libs: iterative correction from a naive UTC guess.
 *
 * Self-check: 09:00 on 2026-07-15 in Europe/Amsterdam → 07:00 UTC (CEST).
 *             09:00 on 2026-01-15 in Europe/Amsterdam → 08:00 UTC (CET).
 *             Last Sun Mar/Oct switch dates must still yield correct local 09:00.
 */
function zonedTimeToUtcIso(params: {
  date: string;
  time: string;
  timeZone: string;
}): string {
  const { date, time, timeZone } = params;
  const [targetH, targetM] = time.split(':').map(Number);
  const [ty, tm, td] = date.split('-').map(Number);

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  let candidate = new Date(`${date}T${time}:00.000Z`);
  for (let i = 0; i < 2; i++) {
    const parts = fmt.formatToParts(candidate);
    const get = (t: string) =>
      Number(parts.find((p) => p.type === t)?.value ?? 0);
    const fy = get('year');
    const fm = get('month');
    const fd = get('day');
    const fh = get('hour');
    const fmin = get('minute');

    const diffMin =
      (td - fd) * 24 * 60 + (targetH - fh) * 60 + (targetM - fmin);
    if (diffMin === 0) break;
    candidate = new Date(candidate.getTime() + diffMin * 60 * 1000);
  }
  return candidate.toISOString();
}

/**
 * Schedule (or reschedule) the next week’s meal plan generation job.
 * Uses user-context; reads diet from user_diet_profiles + diet_types.
 * Shopping day / lead time: defaults (Friday, 48h) until user_preferences has them.
 */
export async function scheduleNextMealPlanJobAction(): Promise<
  ActionResult<ScheduleNextMealPlanJobResult>
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
          message: 'Je moet ingelogd zijn om een weekmenu-job te plannen',
        },
      };
    }

    const { data: prefsRow, error: prefsError } = await supabase
      .from('user_preferences')
      .select(USER_PREFS_SCHEDULE_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle();

    if (prefsError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Voorkeuren ophalen mislukt: ${prefsError.message}`,
        },
      };
    }

    const prefs = prefsRow as {
      shopping_day: number;
      meal_plan_lead_time_hours: number;
    } | null;
    const shoppingDay =
      prefs?.shopping_day != null &&
      prefs.shopping_day >= 0 &&
      prefs.shopping_day <= 6
        ? prefs.shopping_day
        : DEFAULT_SHOPPING_DAY;
    const leadTimeHours =
      prefs?.meal_plan_lead_time_hours === 24 ||
      prefs?.meal_plan_lead_time_hours === 48 ||
      prefs?.meal_plan_lead_time_hours === 72
        ? (prefs.meal_plan_lead_time_hours as 24 | 48 | 72)
        : DEFAULT_LEAD_TIME_HOURS;

    const weekStart = nextMondayWeekStart();
    const { y: sy, m: sm, d: sd } = shoppingDateForWeek(weekStart, shoppingDay);
    const shoppingDate = `${sy}-${String(sm).padStart(2, '0')}-${String(sd).padStart(2, '0')}`;
    const shoppingUtcIso = zonedTimeToUtcIso({
      date: shoppingDate,
      time: SHOPPING_TIME,
      timeZone: TIMEZONE,
    });
    const scheduledFor = new Date(
      new Date(shoppingUtcIso).getTime() - leadTimeHours * 3600 * 1000,
    ).toISOString();

    const { data: profile, error: profileError } = await supabase
      .from('user_diet_profiles')
      .select('diet_types(name)')
      .eq('user_id', user.id)
      .is('ends_on', null)
      .maybeSingle();

    if (profileError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Voorkeuren ophalen mislukt: ${profileError.message}`,
        },
      };
    }

    const dietTypesRow = profile?.diet_types as
      | { name: string }
      | { name: string }[]
      | null
      | undefined;
    const dietKey =
      (Array.isArray(dietTypesRow)
        ? dietTypesRow[0]?.name
        : (dietTypesRow as { name: string } | null)?.name) ?? 'balanced';

    const requestSnapshot = {
      week_start: weekStart,
      days: 7,
      shopping_day: shoppingDay,
      lead_time_hours: leadTimeHours,
      diet_key: dietKey,
    };

    const { data: existing, error: selectError } = await supabase
      .from('meal_plan_generation_jobs')
      .select(JOB_SCHEDULE_COLUMNS)
      .eq('user_id', user.id)
      .filter('request_snapshot->>week_start', 'eq', weekStart)
      .maybeSingle();

    if (selectError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Bestaande job ophalen mislukt: ${selectError.message}`,
        },
      };
    }

    if (existing) {
      const row = existing as {
        id: string;
        status: string;
        scheduled_for: string;
      };
      if (row.status === 'scheduled') {
        const { data: updated, error: updateError } = await supabase
          .from('meal_plan_generation_jobs')
          .update({
            scheduled_for: scheduledFor,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .eq('status', 'scheduled')
          .select(JOB_INSERT_SELECT_COLUMNS)
          .single();

        if (updateError) {
          return {
            ok: false,
            error: {
              code: 'DB_ERROR',
              message: `Job bijwerken mislukt: ${updateError.message}`,
            },
          };
        }
        const u = updated as { id: string; scheduled_for: string };
        return {
          ok: true,
          data: {
            jobId: u.id,
            scheduledFor: u.scheduled_for,
            weekStart,
          },
        };
      }
      return {
        ok: true,
        data: {
          jobId: row.id,
          scheduledFor: row.scheduled_for,
          weekStart,
        },
      };
    }

    const { data: inserted, error: insertError } = await supabase
      .from('meal_plan_generation_jobs')
      .insert({
        user_id: user.id,
        status: 'scheduled',
        scheduled_for: scheduledFor,
        request_snapshot: requestSnapshot,
      })
      .select(JOB_INSERT_SELECT_COLUMNS)
      .single();

    if (insertError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Job aanmaken mislukt: ${insertError.message}`,
        },
      };
    }

    const row = inserted as { id: string; scheduled_for: string };
    return {
      ok: true,
      data: {
        jobId: row.id,
        scheduledFor: row.scheduled_for,
        weekStart,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij plannen weekmenu-job',
      },
    };
  }
}
