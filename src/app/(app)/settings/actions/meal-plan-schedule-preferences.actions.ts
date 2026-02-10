'use server';

import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { scheduleNextMealPlanJobAction } from '@/src/app/(app)/meal-plans/jobs/actions/mealPlanJobSchedule.actions';
import type { MealSlot } from '@/src/lib/diets';

/** Minimal columns for schedule prefs (no SELECT *) */
const SCHEDULE_PREFS_COLUMNS =
  'shopping_day,meal_plan_lead_time_hours,favorite_meal_ids';

/** Explicit columns for custom_meals search (no SELECT *) */
const CUSTOM_MEALS_SEARCH_COLUMNS = 'id,name,meal_slot,updated_at';

const updateSchedulePrefsSchema = z.object({
  shoppingDay: z.number().int().min(0).max(6),
  leadTimeHours: z.union([z.literal(24), z.literal(48), z.literal(72)]),
  favoriteMealIds: z
    .array(z.string().trim())
    .max(10, 'Max 10 favorieten')
    .transform((arr) => arr.slice(0, 10))
    .optional(),
});

export type MealPlanSchedulePrefs = {
  shoppingDay: number;
  leadTimeHours: 24 | 48 | 72;
  favoriteMealIds: string[];
};

/** Result of update: prefs + optional reschedule status (best-effort). */
export type MealPlanSchedulePrefsUpdateResult = MealPlanSchedulePrefs & {
  scheduled?: boolean;
  scheduleWarning?: string;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Load meal plan schedule preferences for the current user.
 * Returns defaults (Friday, 48h) if row missing or columns null.
 */
export async function getMealPlanSchedulePreferencesAction(): Promise<
  ActionResult<MealPlanSchedulePrefs>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: 'Je moet ingelogd zijn' };
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .select(SCHEDULE_PREFS_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }

    const row = data as {
      shopping_day: number;
      meal_plan_lead_time_hours: number;
      favorite_meal_ids: string[] | null;
    } | null;
    const shoppingDay =
      row?.shopping_day != null &&
      row.shopping_day >= 0 &&
      row.shopping_day <= 6
        ? row.shopping_day
        : 5;
    const leadTimeHours =
      row?.meal_plan_lead_time_hours === 24 ||
      row?.meal_plan_lead_time_hours === 48 ||
      row?.meal_plan_lead_time_hours === 72
        ? (row.meal_plan_lead_time_hours as 24 | 48 | 72)
        : 48;
    const favoriteMealIds = Array.isArray(row?.favorite_meal_ids)
      ? row.favorite_meal_ids.slice(0, 10)
      : [];

    return {
      ok: true,
      data: { shoppingDay, leadTimeHours, favoriteMealIds },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Fout bij ophalen voorkeuren',
    };
  }
}

/**
 * Update meal plan schedule preferences. RLS: user-context, update scoped on user_id.
 */
export async function updateMealPlanSchedulePreferencesAction(
  raw: unknown,
): Promise<ActionResult<MealPlanSchedulePrefsUpdateResult>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: 'Je moet ingelogd zijn' };
    }

    const parsed = updateSchedulePrefsSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error:
          parsed.error.message ??
          'Ongeldige waarden (dag 0–6, lead time 24/48/72)',
      };
    }

    const { shoppingDay, leadTimeHours, favoriteMealIds } = parsed.data;

    let favoriteIds: string[] = favoriteMealIds ?? [];
    if (favoriteMealIds === undefined) {
      const { data: current } = await supabase
        .from('user_preferences')
        .select('favorite_meal_ids')
        .eq('user_id', user.id)
        .maybeSingle();
      favoriteIds = Array.isArray(
        (current as { favorite_meal_ids?: string[] })?.favorite_meal_ids,
      )
        ? (current as { favorite_meal_ids: string[] }).favorite_meal_ids.slice(
            0,
            10,
          )
        : [];
    }

    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: user.id,
        shopping_day: shoppingDay,
        meal_plan_lead_time_hours: leadTimeHours,
        favorite_meal_ids: favoriteIds,
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath('/settings');
    revalidatePath('/familie/edit');
    revalidatePath('/familie');

    // Best-effort reschedule: preferences save stays ok if scheduling fails
    try {
      const scheduleResult = await scheduleNextMealPlanJobAction();
      if (scheduleResult.ok) {
        return {
          ok: true,
          data: {
            shoppingDay,
            leadTimeHours,
            favoriteMealIds: favoriteIds,
            scheduled: true,
          },
        };
      }
      return {
        ok: true,
        data: {
          shoppingDay,
          leadTimeHours,
          favoriteMealIds: favoriteIds,
          scheduled: false,
          scheduleWarning:
            'Voorkeuren opgeslagen; planning kon niet worden bijgewerkt.',
        },
      };
    } catch {
      return {
        ok: true,
        data: {
          shoppingDay,
          leadTimeHours,
          favoriteMealIds: favoriteIds,
          scheduled: false,
          scheduleWarning:
            'Voorkeuren opgeslagen; planning kon niet worden bijgewerkt.',
        },
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Fout bij opslaan voorkeuren',
    };
  }
}

/** Valid meal_slot values for defensive filter */
const VALID_MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_SLOT_SET = new Set<string>(VALID_MEAL_SLOTS);

/** Search result item for favorites picker (typed contract). */
export type MealCandidate = {
  id: string;
  name: string;
  mealSlot: MealSlot;
};

/** @deprecated Use MealCandidate */
export type FavoriteMealCandidate = MealCandidate;

export type SearchCandidatesErrorCode =
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'DB_ERROR';

export type SearchCandidatesActionResult =
  | { ok: true; data: MealCandidate[] }
  | { ok: false; error: string; code: SearchCandidatesErrorCode };

const searchCandidatesSchema = z.object({
  q: z.string().trim().max(80, 'q max 80').optional().default(''),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

/**
 * Search custom_meals for favorites picker. RLS: user_id. No SELECT *.
 * Returns typed MealCandidate[]; filters rows with valid id, name, mealSlot.
 */
export async function searchFavoriteMealCandidatesAction(
  raw: unknown,
): Promise<SearchCandidatesActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: 'Je moet ingelogd zijn',
        code: 'AUTH_ERROR',
      };
    }

    const parsed = searchCandidatesSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.message ?? 'Ongeldige zoekparameters',
        code: 'VALIDATION_ERROR',
      };
    }

    const { q, limit } = parsed.data;

    let query = supabase
      .from('custom_meals')
      .select(CUSTOM_MEALS_SEARCH_COLUMNS)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (q !== '') {
      query = query.ilike('name', `%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      return { ok: false, error: error.message, code: 'DB_ERROR' };
    }

    const rows = (data ?? []) as Array<{
      id: string;
      name: string;
      meal_slot: string;
    }>;

    const candidates: MealCandidate[] = rows
      .filter(
        (row) =>
          !!row.id &&
          !!row.name &&
          typeof row.meal_slot === 'string' &&
          MEAL_SLOT_SET.has(row.meal_slot),
      )
      .map((row) => ({
        id: row.id,
        name: row.name,
        mealSlot: row.meal_slot as MealSlot,
      }));

    return { ok: true, data: candidates };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Fout bij zoeken',
      code: 'DB_ERROR',
    };
  }
}
