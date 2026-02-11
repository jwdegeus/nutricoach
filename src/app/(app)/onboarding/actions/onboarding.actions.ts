'use server';

import { createClient } from '@/src/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getDefaultFamilyMemberId } from '@/src/lib/family/defaultFamilyMember';
import type { OnboardingInput, OnboardingStatus } from '../onboarding.types';
import {
  mapVarietyLevelToDays,
  mapStrictnessToNumber,
  mapNumberToStrictness,
  mapDaysToVarietyLevel,
} from '../onboarding.types';
import { validateDietType } from '../queries/diet-rules.queries';

/**
 * Validation error response type
 */
type ActionError = {
  error: string;
};

/**
 * Success response type
 */
type ActionSuccess<T> = {
  data: T;
};

type ActionResult<T> = ActionError | ActionSuccess<T>;

/**
 * Validates onboarding input data
 */
async function validateOnboardingInput(
  input: OnboardingInput,
): Promise<string | null> {
  // Validate dietTypeId exists and is active
  if (!input.dietTypeId) {
    return 'dietTypeId is verplicht';
  }

  const isValidDietType = await validateDietType(input.dietTypeId);
  if (!isValidDietType) {
    return 'Geselecteerd dieettype is niet geldig of niet beschikbaar';
  }

  // Validate maxPrepMinutes
  const validPrepMinutes = [15, 30, 45, 60];
  if (!validPrepMinutes.includes(input.maxPrepMinutes)) {
    return `maxPrepMinutes moet een van de volgende waarden zijn: ${validPrepMinutes.join(', ')}`;
  }

  // Validate servingsDefault
  if (input.servingsDefault < 1 || input.servingsDefault > 6) {
    return 'servingsDefault moet tussen 1 en 6 liggen';
  }

  // Validate kcalTarget (if provided)
  if (input.kcalTarget !== null && input.kcalTarget !== undefined) {
    if (input.kcalTarget < 800 || input.kcalTarget > 6000) {
      return 'kcalTarget moet tussen 800 en 6000 liggen (of null zijn)';
    }
  }

  // Validate arrays (max 50 items)
  if (input.allergies.length > 50) {
    return 'allergies mag maximaal 50 items bevatten';
  }
  if (input.dislikes.length > 50) {
    return 'dislikes mag maximaal 50 items bevatten';
  }

  return null;
}

/**
 * Loads the current onboarding status for the authenticated user
 */
export async function loadOnboardingStatusAction(): Promise<
  ActionResult<OnboardingStatus>
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: 'Je moet ingelogd zijn om je onboarding status te bekijken',
    };
  }

  const familyMemberId = await getDefaultFamilyMemberId(supabase, user.id);

  let preferences: Record<string, unknown> | null = null;
  let activeProfile: Record<string, unknown> | null = null;

  if (familyMemberId) {
    const { data: fmPrefs } = await supabase
      .from('family_member_preferences')
      .select('*')
      .eq('family_member_id', familyMemberId)
      .maybeSingle();
    const { data: fmDiet } = await supabase
      .from('family_member_diet_profiles')
      .select('*')
      .eq('family_member_id', familyMemberId)
      .is('ends_on', null)
      .maybeSingle();
    if (fmPrefs) preferences = fmPrefs as Record<string, unknown>;
    if (fmDiet) activeProfile = fmDiet as Record<string, unknown>;
  }

  if (!preferences || !activeProfile) {
    const { data: userPrefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: userDiet } = await supabase
      .from('user_diet_profiles')
      .select('*')
      .eq('user_id', user.id)
      .is('ends_on', null)
      .maybeSingle();
    if (userPrefs) preferences = userPrefs as Record<string, unknown>;
    if (userDiet) activeProfile = userDiet as Record<string, unknown>;
  }

  const userPrefsRow = await supabase
    .from('user_preferences')
    .select('onboarding_completed, onboarding_completed_at')
    .eq('user_id', user.id)
    .maybeSingle();
  const completed =
    (userPrefsRow.data as { onboarding_completed?: boolean } | null)
      ?.onboarding_completed ?? false;
  const completedAt =
    (userPrefsRow.data as { onboarding_completed_at?: string | null } | null)
      ?.onboarding_completed_at ?? null;

  const normalizeToArray = (
    value: string | string[] | null | undefined,
  ): string[] | undefined => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value.length > 0 ? value : undefined;
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return undefined;
  };

  const status: OnboardingStatus = {
    completed,
    completedAt,
    summary: {
      maxPrepMinutes: preferences?.max_prep_minutes as number | undefined,
      servingsDefault: preferences?.servings_default as number | undefined,
      kcalTarget: (preferences?.kcal_target ?? null) as number | null,
      dietTypeId: activeProfile?.diet_type_id as string | undefined,
      strictness: activeProfile?.strictness
        ? mapNumberToStrictness(activeProfile.strictness as number)
        : undefined,
      varietyLevel: preferences?.variety_window_days
        ? mapDaysToVarietyLevel(preferences.variety_window_days as number)
        : undefined,
      allergies: (preferences?.allergies ?? []) as string[],
      dislikes: (preferences?.dislikes ?? []) as string[],
      mealPreferences: (() => {
        const breakfast = normalizeToArray(
          preferences?.breakfast_preference as
            | string
            | string[]
            | null
            | undefined,
        );
        const lunch = normalizeToArray(
          preferences?.lunch_preference as string | string[] | null | undefined,
        );
        const dinner = normalizeToArray(
          preferences?.dinner_preference as
            | string
            | string[]
            | null
            | undefined,
        );
        if (breakfast || lunch || dinner) {
          return { breakfast, lunch, dinner };
        }
        return undefined;
      })(),
    },
  };

  return { data: status };
}

/**
 * Saves onboarding data for the authenticated user
 */
export async function saveOnboardingAction(
  input: OnboardingInput,
): Promise<ActionResult<OnboardingStatus>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: 'Je moet ingelogd zijn om je onboarding op te slaan',
    };
  }

  // Validate input
  const validationError = await validateOnboardingInput(input);
  if (validationError) {
    return {
      error: validationError,
    };
  }

  const varietyWindowDays =
    input.varietyLevel !== undefined
      ? mapVarietyLevelToDays(input.varietyLevel)
      : 7;
  const strictnessNumber = mapStrictnessToNumber(input.strictness);
  const onboardingCompletedAt = new Date().toISOString();

  // 1) Family as source of truth: ensure "Ik" exists and write preferences + diet there
  let familyMemberId = await getDefaultFamilyMemberId(supabase, user.id);

  if (!familyMemberId) {
    const { data: newMember, error: insertMemberError } = await supabase
      .from('family_members')
      .insert({
        user_id: user.id,
        name: 'Ik',
        is_self: true,
        sort_order: 0,
      })
      .select('id')
      .single();

    if (insertMemberError) {
      return {
        error: `Fout bij aanmaken familielid: ${insertMemberError.message}`,
      };
    }
    familyMemberId = (newMember as { id: string }).id;
  }

  const { error: prefsError } = await supabase
    .from('family_member_preferences')
    .upsert(
      {
        family_member_id: familyMemberId,
        max_prep_minutes: input.maxPrepMinutes,
        servings_default: input.servingsDefault,
        kcal_target: input.kcalTarget ?? null,
        allergies: input.allergies,
        dislikes: input.dislikes,
        variety_window_days: varietyWindowDays,
        breakfast_preference: input.mealPreferences?.breakfast || [],
        lunch_preference: input.mealPreferences?.lunch || [],
        dinner_preference: input.mealPreferences?.dinner || [],
        updated_at: onboardingCompletedAt,
      },
      { onConflict: 'family_member_id' },
    );

  if (prefsError) {
    return {
      error: `Fout bij opslaan voorkeuren: ${prefsError.message}`,
    };
  }

  const { data: existingFmDiet } = await supabase
    .from('family_member_diet_profiles')
    .select('id')
    .eq('family_member_id', familyMemberId)
    .is('ends_on', null)
    .maybeSingle();

  if (existingFmDiet) {
    const { error: updateError } = await supabase
      .from('family_member_diet_profiles')
      .update({
        diet_type_id: input.dietTypeId || null,
        strictness: strictnessNumber,
        updated_at: onboardingCompletedAt,
      })
      .eq('id', (existingFmDiet as { id: string }).id);

    if (updateError) {
      return {
        error: `Fout bij bijwerken dieetprofiel: ${updateError.message}`,
      };
    }
  } else {
    const { error: insertError } = await supabase
      .from('family_member_diet_profiles')
      .insert({
        family_member_id: familyMemberId,
        starts_on: new Date().toISOString().split('T')[0],
        ends_on: null,
        diet_type_id: input.dietTypeId || null,
        strictness: strictnessNumber,
      });

    if (insertError) {
      return {
        error: `Fout bij aanmaken dieetprofiel: ${insertError.message}`,
      };
    }
  }

  // 2) user_preferences: only set onboarding_completed so middleware/redirects work
  const { error: userPrefsError } = await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: user.id,
        onboarding_completed: true,
        onboarding_completed_at: onboardingCompletedAt,
        updated_at: onboardingCompletedAt,
      },
      { onConflict: 'user_id' },
    );

  if (userPrefsError) {
    return {
      error: `Fout bij opslaan onboarding-status: ${userPrefsError.message}`,
    };
  }

  // 3) user_metadata: so middleware can read onboarding status without DB call
  supabase.auth
    .updateUser({ data: { onboarding_completed: true } })
    .catch(() => {});

  revalidatePath('/onboarding');
  revalidatePath('/account');
  revalidatePath('/familie');
  revalidatePath('/', 'layout');

  const status: OnboardingStatus = {
    completed: true,
    completedAt: onboardingCompletedAt,
    summary: {
      dietTypeId: input.dietTypeId || undefined,
      maxPrepMinutes: input.maxPrepMinutes,
      servingsDefault: input.servingsDefault,
      kcalTarget: input.kcalTarget ?? null,
      strictness: input.strictness,
      varietyLevel: input.varietyLevel,
      allergies: input.allergies,
      dislikes: input.dislikes,
      mealPreferences: input.mealPreferences,
    },
  };

  return { data: status };
}
