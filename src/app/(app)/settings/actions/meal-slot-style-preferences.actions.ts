'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/src/lib/supabase/server';

/** Minimal columns for meal-slot style prefs (no SELECT *) — 5 columns total */
const MEAL_SLOT_STYLE_COLUMNS =
  'preferred_breakfast_style,preferred_lunch_style,preferred_dinner_style,preferred_weekend_dinner_style,weekend_days';

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR';
        message: string;
      };
    };

/** Meal-slot style preferences (camelCase). Null = no preference (treat as 'any'). */
export type MealSlotStylePreferences = {
  preferredBreakfastStyle: string | null;
  preferredLunchStyle: string | null;
  preferredDinnerStyle: string | null;
  preferredWeekendDinnerStyle: string | null;
  weekendDays: number[];
};

const BREAKFAST_STYLES = ['any', 'shake', 'eggs', 'yogurt', 'oatmeal'] as const;
const LUNCH_STYLES = ['any', 'salad', 'smoothie', 'leftovers', 'soup'] as const;
const DINNER_STYLES = ['any', 'quick', 'family', 'high_protein'] as const;
const WEEKEND_DINNER_STYLES = [
  'any',
  'quick',
  'family',
  'high_protein',
  'special',
] as const;

function toNull(s: string | null | undefined): string | null {
  if (s == null || s === '') return null;
  return s;
}

/**
 * Get meal-slot style preferences for the current user.
 * Returns all nulls if row is missing (ok: true).
 */
export async function getMealSlotStylePreferencesAction(): Promise<
  ActionResult<MealSlotStylePreferences>
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

    const { data, error } = await supabase
      .from('user_preferences')
      .select(MEAL_SLOT_STYLE_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    const row = data as {
      preferred_breakfast_style?: string | null;
      preferred_lunch_style?: string | null;
      preferred_dinner_style?: string | null;
      preferred_weekend_dinner_style?: string | null;
      weekend_days?: number[] | null;
    } | null;

    const rawWeekendDays = row?.weekend_days;
    const weekendDays =
      Array.isArray(rawWeekendDays) && rawWeekendDays.length >= 1
        ? [...rawWeekendDays]
            .filter((d) => typeof d === 'number' && d >= 0 && d <= 6)
            .sort((a, b) => a - b)
        : [0, 6];

    return {
      ok: true,
      data: {
        preferredBreakfastStyle: toNull(row?.preferred_breakfast_style ?? null),
        preferredLunchStyle: toNull(row?.preferred_lunch_style ?? null),
        preferredDinnerStyle: toNull(row?.preferred_dinner_style ?? null),
        preferredWeekendDinnerStyle: toNull(
          row?.preferred_weekend_dinner_style ?? null,
        ),
        weekendDays: weekendDays.length >= 1 ? weekendDays : [0, 6],
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: err instanceof Error ? err.message : 'Onbekende fout',
      },
    };
  }
}

const weekendDaysSchema = z.array(z.number().int().min(0).max(6)).min(1).max(2);

const updateMealSlotStylePreferencesSchema = z.object({
  preferredBreakfastStyle: z.enum(BREAKFAST_STYLES).nullable(),
  preferredLunchStyle: z.enum(LUNCH_STYLES).nullable(),
  preferredDinnerStyle: z.enum(DINNER_STYLES).nullable(),
  preferredWeekendDinnerStyle: z.enum(WEEKEND_DINNER_STYLES).nullable(),
  weekendDays: weekendDaysSchema,
});

/** Result of update: same shape as preferences. */
export type MealSlotStylePreferencesUpdateResult = MealSlotStylePreferences;

/**
 * Update meal-slot style preferences. Upserts on user_id.
 */
export async function updateMealSlotStylePreferencesAction(
  raw: z.infer<typeof updateMealSlotStylePreferencesSchema>,
): Promise<ActionResult<MealSlotStylePreferencesUpdateResult>> {
  try {
    const parsed = updateMealSlotStylePreferencesSchema.safeParse(raw);
    if (!parsed.success) {
      const msg =
        parsed.error.errors.map((e) => e.message).join('; ') ||
        'Ongeldige invoer';
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: msg },
      };
    }

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

    const {
      preferredBreakfastStyle,
      preferredLunchStyle,
      preferredDinnerStyle,
      preferredWeekendDinnerStyle,
      weekendDays,
    } = parsed.data;

    const weekendDaysSorted =
      weekendDays.length >= 1 ? [...weekendDays].sort((a, b) => a - b) : [0, 6];

    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: user.id,
        preferred_breakfast_style: preferredBreakfastStyle ?? null,
        preferred_lunch_style: preferredLunchStyle ?? null,
        preferred_dinner_style: preferredDinnerStyle ?? null,
        preferred_weekend_dinner_style: preferredWeekendDinnerStyle ?? null,
        weekend_days: weekendDaysSorted,
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    revalidatePath('/familie/edit');
    revalidatePath('/familie');
    return {
      ok: true,
      data: {
        preferredBreakfastStyle: preferredBreakfastStyle ?? null,
        preferredLunchStyle: preferredLunchStyle ?? null,
        preferredDinnerStyle: preferredDinnerStyle ?? null,
        preferredWeekendDinnerStyle: preferredWeekendDinnerStyle ?? null,
        weekendDays: weekendDaysSorted,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: err instanceof Error ? err.message : 'Onbekende fout',
      },
    };
  }
}
