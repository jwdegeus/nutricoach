'use server';

import { createClient } from '@/src/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  mapNumberToStrictness,
  mapStrictnessToNumber,
  mapDaysToVarietyLevel,
  mapVarietyLevelToDays,
  type DietStrictness,
  type VarietyLevel,
} from '@/src/app/(app)/onboarding/onboarding.types';

function normalizeMealPref(v: string[] | string | null | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v))
    return v.filter((s) => typeof s === 'string' && s.trim());
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

export type FamilyDietPrefs = {
  dietTypeId: string | null;
  dietStrictness: number | null;
  dietIsInflamed: boolean;
  maxPrepMinutes: number;
  servingsDefault: number;
  varietyWindowDays: number;
  strictness: DietStrictness;
  varietyLevel: VarietyLevel;
  mealPreferences: {
    breakfast: string[];
    lunch: string[];
    dinner: string[];
  };
};

/**
 * Load family-level diet and preferences from user_preferences (Gezinsdieet + praktische voorkeuren + doelen).
 */
export async function getFamilyDietPrefsAction(): Promise<
  { ok: true; prefs: FamilyDietPrefs } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Je moet ingelogd zijn.' };

  const { data, error } = await supabase
    .from('user_preferences')
    .select(
      'diet_type_id, diet_strictness, diet_is_inflamed, max_prep_minutes, servings_default, variety_window_days, breakfast_preference, lunch_preference, dinner_preference',
    )
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  const row = data as {
    diet_type_id: string | null;
    diet_strictness: number | null;
    diet_is_inflamed: boolean | null;
    max_prep_minutes: number | null;
    servings_default: number | null;
    variety_window_days: number | null;
    breakfast_preference?: string[] | string | null;
    lunch_preference?: string[] | string | null;
    dinner_preference?: string[] | string | null;
  } | null;

  const maxPrepMinutes = row?.max_prep_minutes ?? 30;
  const servingsDefault = row?.servings_default ?? 2;
  const varietyWindowDays = row?.variety_window_days ?? 7;
  const strictnessNum = row?.diet_strictness ?? 5;

  return {
    ok: true,
    prefs: {
      dietTypeId: row?.diet_type_id ?? null,
      dietStrictness: row?.diet_strictness ?? null,
      dietIsInflamed: row?.diet_is_inflamed ?? false,
      maxPrepMinutes,
      servingsDefault,
      varietyWindowDays,
      strictness: mapNumberToStrictness(strictnessNum),
      varietyLevel: mapDaysToVarietyLevel(varietyWindowDays),
      mealPreferences: {
        breakfast: normalizeMealPref(row?.breakfast_preference),
        lunch: normalizeMealPref(row?.lunch_preference),
        dinner: normalizeMealPref(row?.dinner_preference),
      },
    },
  };
}

const VALID_PREP_MINUTES = [15, 30, 45, 60];

/**
 * Save family-level diet and preferences to user_preferences.
 */
export async function updateFamilyDietPrefsAction(input: {
  dietTypeId: string | null;
  dietStrictness?: number | null;
  dietIsInflamed?: boolean;
  maxPrepMinutes?: number;
  servingsDefault?: number;
  varietyLevel?: VarietyLevel;
  strictness?: DietStrictness;
  mealPreferences?: {
    breakfast?: string[];
    lunch?: string[];
    dinner?: string[];
  };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Je moet ingelogd zijn.' };

  if (
    input.maxPrepMinutes != null &&
    !VALID_PREP_MINUTES.includes(input.maxPrepMinutes)
  ) {
    return {
      ok: false,
      error: `Bereidingstijd moet een van zijn: ${VALID_PREP_MINUTES.join(', ')}`,
    };
  }
  if (
    input.servingsDefault != null &&
    (input.servingsDefault < 1 || input.servingsDefault > 6)
  ) {
    return { ok: false, error: 'Porties moet tussen 1 en 6 liggen.' };
  }

  const updates: Record<string, unknown> = {
    diet_type_id: input.dietTypeId || null,
    diet_is_inflamed: input.dietIsInflamed ?? false,
  };
  if (input.dietStrictness !== undefined) {
    updates.diet_strictness =
      input.dietStrictness == null ||
      input.dietStrictness < 1 ||
      input.dietStrictness > 10
        ? null
        : input.dietStrictness;
  }
  if (input.strictness !== undefined) {
    updates.diet_strictness = mapStrictnessToNumber(input.strictness);
  }
  if (input.maxPrepMinutes !== undefined) {
    updates.max_prep_minutes = input.maxPrepMinutes;
  }
  if (input.servingsDefault !== undefined) {
    updates.servings_default = input.servingsDefault;
  }
  if (input.varietyLevel !== undefined) {
    updates.variety_window_days = mapVarietyLevelToDays(input.varietyLevel);
  }
  if (input.mealPreferences !== undefined) {
    updates.breakfast_preference = input.mealPreferences.breakfast ?? [];
    updates.lunch_preference = input.mealPreferences.lunch ?? [];
    updates.dinner_preference = input.mealPreferences.dinner ?? [];
  }

  const { error } = await supabase
    .from('user_preferences')
    .update(updates)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/familie/edit');
  revalidatePath('/familie');
  revalidatePath('/meal-plans');
  return { ok: true };
}
