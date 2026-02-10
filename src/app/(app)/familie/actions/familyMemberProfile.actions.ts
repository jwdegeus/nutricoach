'use server';

import { createClient } from '@/src/lib/supabase/server';
import { AppError } from '@/src/lib/errors/app-error';
import { revalidatePath } from 'next/cache';
import {
  mapVarietyLevelToDays,
  mapStrictnessToNumber,
  mapNumberToStrictness,
  mapDaysToVarietyLevel,
  type DietStrictness,
  type VarietyLevel,
} from '@/src/app/(app)/onboarding/onboarding.types';
import { validateDietType } from '@/src/app/(app)/onboarding/queries/diet-rules.queries';

export type FamilyMemberProfileSummary = {
  dietTypeId?: string;
  maxPrepMinutes?: number;
  servingsDefault?: number;
  kcalTarget?: number | null;
  strictness?: DietStrictness;
  varietyLevel?: VarietyLevel;
  allergies?: string[];
  dislikes?: string[];
  mealPreferences?: {
    breakfast?: string[];
    lunch?: string[];
    dinner?: string[];
  };
  isInflamed?: boolean;
};

export type FamilyMemberProfileInput = {
  /** Optional: when omitted, family diet from user_preferences is used (Gezinsdieet in Instellingen). */
  dietTypeId?: string;
  strictness?: DietStrictness;
  allergies: string[];
  dislikes: string[];
  maxPrepMinutes: number;
  servingsDefault: number;
  kcalTarget?: number | null;
  varietyLevel?: VarietyLevel;
  mealPreferences?: {
    breakfast?: string[];
    lunch?: string[];
    dinner?: string[];
  };
  isInflamed?: boolean;
};

async function ensureFamilyMemberOwnership(memberId: string): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError('UNAUTHORIZED', 'Je moet ingelogd zijn.');

  const { data: member, error } = await supabase
    .from('family_members')
    .select('id')
    .eq('id', memberId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw new AppError('DB_ERROR', error.message);
  if (!member)
    throw new AppError('VALIDATION_ERROR', 'Familielid niet gevonden.');
  return { supabase, userId: user.id };
}

/**
 * Load preferences and active diet profile for a family member.
 */
export async function loadFamilyMemberProfileAction(memberId: string): Promise<{
  ok: true;
  summary: FamilyMemberProfileSummary;
}> {
  const { supabase } = await ensureFamilyMemberOwnership(memberId);

  const { data: prefs, error: prefsError } = await supabase
    .from('family_member_preferences')
    .select('*')
    .eq('family_member_id', memberId)
    .maybeSingle();

  if (prefsError) throw new AppError('DB_ERROR', prefsError.message);

  const { data: dietProfile, error: dietError } = await supabase
    .from('family_member_diet_profiles')
    .select('*')
    .eq('family_member_id', memberId)
    .is('ends_on', null)
    .maybeSingle();

  if (dietError) throw new AppError('DB_ERROR', dietError.message);

  const varietyLevel = prefs?.variety_window_days
    ? mapDaysToVarietyLevel(prefs.variety_window_days)
    : undefined;
  const strictness = dietProfile?.strictness
    ? mapNumberToStrictness(dietProfile.strictness)
    : undefined;

  const normalize = (
    v: string | string[] | null | undefined,
  ): string[] | undefined => {
    if (!v) return undefined;
    if (Array.isArray(v)) return v.length > 0 ? v : undefined;
    if (typeof v === 'string' && v.trim()) return [v.trim()];
    return undefined;
  };

  const summary: FamilyMemberProfileSummary = {
    maxPrepMinutes: prefs?.max_prep_minutes,
    servingsDefault: prefs?.servings_default,
    kcalTarget: prefs?.kcal_target ?? null,
    dietTypeId: dietProfile?.diet_type_id ?? undefined,
    strictness,
    varietyLevel,
    allergies: prefs?.allergies ?? [],
    dislikes: prefs?.dislikes ?? [],
    isInflamed: dietProfile?.is_inflamed ?? false,
    mealPreferences:
      normalize(prefs?.breakfast_preference) ||
      normalize(prefs?.lunch_preference) ||
      normalize(prefs?.dinner_preference)
        ? {
            breakfast: normalize(prefs?.breakfast_preference),
            lunch: normalize(prefs?.lunch_preference),
            dinner: normalize(prefs?.dinner_preference),
          }
        : undefined,
  };

  return { ok: true, summary };
}

/**
 * Save preferences and active diet profile for a family member.
 * When dietTypeId is omitted, family diet from user_preferences is used (Gezinsdieet in Instellingen).
 */
export async function saveFamilyMemberProfileAction(
  memberId: string,
  input: FamilyMemberProfileInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, userId } = await ensureFamilyMemberOwnership(memberId);
  let dietTypeId = input.dietTypeId;
  if (!dietTypeId) {
    const { data: up } = await supabase
      .from('user_preferences')
      .select('diet_type_id')
      .eq('user_id', userId)
      .maybeSingle();
    dietTypeId =
      (up as { diet_type_id?: string | null } | null)?.diet_type_id ??
      undefined;
  }
  if (dietTypeId) {
    const isValidDietType = await validateDietType(dietTypeId);
    if (!isValidDietType) {
      return { ok: false, error: 'Geselecteerd dieettype is niet geldig.' };
    }
  }

  const validPrepMinutes = [15, 30, 45, 60];
  if (!validPrepMinutes.includes(input.maxPrepMinutes)) {
    return {
      ok: false,
      error: `Bereidingstijd moet een van zijn: ${validPrepMinutes.join(', ')}`,
    };
  }
  if (input.servingsDefault < 1 || input.servingsDefault > 6) {
    return { ok: false, error: 'Porties moet tussen 1 en 6 liggen.' };
  }
  if (
    input.kcalTarget != null &&
    (input.kcalTarget < 800 || input.kcalTarget > 6000)
  ) {
    return { ok: false, error: 'Calorieën moet tussen 800 en 6000 liggen.' };
  }

  const varietyWindowDays =
    input.varietyLevel !== undefined
      ? mapVarietyLevelToDays(input.varietyLevel)
      : 7;
  const strictnessNumber = mapStrictnessToNumber(input.strictness);

  const { error: prefsError } = await supabase
    .from('family_member_preferences')
    .upsert(
      {
        family_member_id: memberId,
        max_prep_minutes: input.maxPrepMinutes,
        servings_default: input.servingsDefault,
        kcal_target: input.kcalTarget ?? null,
        allergies: input.allergies ?? [],
        dislikes: input.dislikes ?? [],
        variety_window_days: varietyWindowDays,
        breakfast_preference: input.mealPreferences?.breakfast ?? [],
        lunch_preference: input.mealPreferences?.lunch ?? [],
        dinner_preference: input.mealPreferences?.dinner ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'family_member_id' },
    );

  if (prefsError) return { ok: false, error: prefsError.message };

  const { data: existingActive } = await supabase
    .from('family_member_diet_profiles')
    .select('id')
    .eq('family_member_id', memberId)
    .is('ends_on', null)
    .maybeSingle();

  if (existingActive) {
    const { error: updateError } = await supabase
      .from('family_member_diet_profiles')
      .update({
        diet_type_id: dietTypeId || null,
        strictness: strictnessNumber,
        is_inflamed: input.isInflamed ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', (existingActive as { id: string }).id);

    if (updateError) return { ok: false, error: updateError.message };
  } else if (dietTypeId) {
    const { error: insertError } = await supabase
      .from('family_member_diet_profiles')
      .insert({
        family_member_id: memberId,
        starts_on: new Date().toISOString().split('T')[0],
        ends_on: null,
        diet_type_id: dietTypeId,
        strictness: strictnessNumber,
        is_inflamed: input.isInflamed ?? false,
      });

    if (insertError) return { ok: false, error: insertError.message };
  }

  revalidatePath('/familie');
  revalidatePath(`/familie/${memberId}`);
  return { ok: true };
}
