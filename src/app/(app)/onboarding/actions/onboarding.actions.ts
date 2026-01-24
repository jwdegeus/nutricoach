"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  OnboardingInput,
  OnboardingStatus,
  DietStrictness,
  VarietyLevel,
} from "../onboarding.types";
import {
  mapVarietyLevelToDays,
  mapStrictnessToNumber,
  mapNumberToStrictness,
  mapDaysToVarietyLevel,
} from "../onboarding.types";
import { validateDietType } from "../queries/diet-rules.queries";

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
async function validateOnboardingInput(input: OnboardingInput): Promise<string | null> {
  // Validate dietTypeId exists and is active
  if (!input.dietTypeId) {
    return "dietTypeId is verplicht";
  }

  const isValidDietType = await validateDietType(input.dietTypeId);
  if (!isValidDietType) {
    return "Geselecteerd dieettype is niet geldig of niet beschikbaar";
  }

  // Validate maxPrepMinutes
  const validPrepMinutes = [15, 30, 45, 60];
  if (!validPrepMinutes.includes(input.maxPrepMinutes)) {
    return `maxPrepMinutes moet een van de volgende waarden zijn: ${validPrepMinutes.join(", ")}`;
  }

  // Validate servingsDefault
  if (input.servingsDefault < 1 || input.servingsDefault > 6) {
    return "servingsDefault moet tussen 1 en 6 liggen";
  }

  // Validate kcalTarget (if provided)
  if (input.kcalTarget !== null && input.kcalTarget !== undefined) {
    if (input.kcalTarget < 800 || input.kcalTarget > 6000) {
      return "kcalTarget moet tussen 800 en 6000 liggen (of null zijn)";
    }
  }

  // Validate arrays (max 50 items)
  if (input.allergies.length > 50) {
    return "allergies mag maximaal 50 items bevatten";
  }
  if (input.dislikes.length > 50) {
    return "dislikes mag maximaal 50 items bevatten";
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
      error: "Je moet ingelogd zijn om je onboarding status te bekijken",
    };
  }

  // Load user preferences
  const { data: preferences, error: prefsError } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (prefsError) {
    return {
      error: `Fout bij ophalen voorkeuren: ${prefsError.message}`,
    };
  }

  // Load active diet profile (ends_on is null)
  const { data: activeProfile, error: profileError } = await supabase
    .from("user_diet_profiles")
    .select("*")
    .eq("user_id", user.id)
    .is("ends_on", null)
    .maybeSingle();

  if (profileError) {
    return {
      error: `Fout bij ophalen dieetprofiel: ${profileError.message}`,
    };
  }

  // Build status response
  const status: OnboardingStatus = {
    completed: preferences?.onboarding_completed ?? false,
    completedAt: preferences?.onboarding_completed_at ?? null,
    summary: {
      maxPrepMinutes: preferences?.max_prep_minutes,
      servingsDefault: preferences?.servings_default,
      kcalTarget: preferences?.kcal_target ?? null,
      dietTypeId: activeProfile?.diet_type_id ?? undefined,
      strictness: activeProfile?.strictness
        ? mapNumberToStrictness(activeProfile.strictness)
        : undefined,
      varietyLevel: preferences?.variety_window_days
        ? mapDaysToVarietyLevel(preferences.variety_window_days)
        : undefined,
      allergies: preferences?.allergies ?? [],
      dislikes: preferences?.dislikes ?? [],
      mealPreferences: (() => {
        // Normalize to arrays, handling both string (legacy) and array values
        const normalizeToArray = (value: string | string[] | null | undefined): string[] | undefined => {
          if (!value) return undefined;
          if (Array.isArray(value)) return value.length > 0 ? value : undefined;
          if (typeof value === 'string' && value.trim()) return [value.trim()];
          return undefined;
        };
        
        const breakfast = normalizeToArray(preferences?.breakfast_preference);
        const lunch = normalizeToArray(preferences?.lunch_preference);
        const dinner = normalizeToArray(preferences?.dinner_preference);
        
        // Only include mealPreferences if at least one has values
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
  input: OnboardingInput
): Promise<ActionResult<OnboardingStatus>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Je moet ingelogd zijn om je onboarding op te slaan",
    };
  }

  // Validate input
  const validationError = await validateOnboardingInput(input);
  if (validationError) {
    return {
      error: validationError,
    };
  }

  // Map variety level to days
  const varietyWindowDays =
    input.varietyLevel !== undefined
      ? mapVarietyLevelToDays(input.varietyLevel)
      : 7; // Default to standard

  // Map strictness to number
  const strictnessNumber = mapStrictnessToNumber(input.strictness);

  // Upsert user_preferences
  const preferencesData = {
    user_id: user.id,
    max_prep_minutes: input.maxPrepMinutes,
    servings_default: input.servingsDefault,
    kcal_target: input.kcalTarget ?? null,
    allergies: input.allergies,
    dislikes: input.dislikes,
    variety_window_days: varietyWindowDays,
    breakfast_preference: input.mealPreferences?.breakfast || [],
    lunch_preference: input.mealPreferences?.lunch || [],
    dinner_preference: input.mealPreferences?.dinner || [],
    onboarding_completed: true,
    onboarding_completed_at: new Date().toISOString(),
  };

  const { error: prefsError } = await supabase
    .from("user_preferences")
    .upsert(preferencesData, {
      onConflict: "user_id",
    });

  if (prefsError) {
    return {
      error: `Fout bij opslaan voorkeuren: ${prefsError.message}`,
    };
  }

  // Handle diet profile: update existing active profile or create new one
  const { data: existingActiveProfile, error: checkError } = await supabase
    .from("user_diet_profiles")
    .select("id")
    .eq("user_id", user.id)
    .is("ends_on", null)
    .maybeSingle();

  if (checkError) {
    return {
      error: `Fout bij controleren dieetprofiel: ${checkError.message}`,
    };
  }

  if (existingActiveProfile) {
    // Update existing active profile
    const { error: updateError } = await supabase
      .from("user_diet_profiles")
      .update({
        diet_type_id: input.dietTypeId || null,
        strictness: strictnessNumber,
      })
      .eq("id", existingActiveProfile.id);

    if (updateError) {
      return {
        error: `Fout bij bijwerken dieetprofiel: ${updateError.message}`,
      };
    }
  } else {
    // Create new active profile
    const { error: insertError } = await supabase
      .from("user_diet_profiles")
      .insert({
        user_id: user.id,
        starts_on: new Date().toISOString().split("T")[0], // Current date as YYYY-MM-DD
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

  // Revalidate paths to ensure middleware picks up the new onboarding status
  revalidatePath("/onboarding");
  revalidatePath("/account");
  revalidatePath("/", "layout");

  // Return updated status (construct directly to avoid another query)
  const status: OnboardingStatus = {
    completed: true,
    completedAt: preferencesData.onboarding_completed_at,
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
