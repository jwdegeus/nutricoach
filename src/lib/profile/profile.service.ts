/**
 * Profile Service
 *
 * Server-side service for loading user diet profiles from database.
 * Maps database schema (user_preferences + user_diet_profiles) to DietProfile type.
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import type { DietProfile } from '@/src/lib/diets';
import { dietProfileSchema } from '@/src/lib/diets';
import type { DietKey } from '@/src/lib/diets';
import {
  mapNumberToStrictness,
  mapDaysToVarietyLevel,
} from '@/src/app/(app)/onboarding/onboarding.types';

/**
 * Profile Service
 */
export class ProfileService {
  /**
   * Load DietProfile for a user
   *
   * Combines data from user_preferences and user_diet_profiles tables
   * to build a complete DietProfile.
   *
   * @param userId - User ID
   * @returns DietProfile
   * @throws Error if profile not found or incomplete
   */
  async loadDietProfileForUser(userId: string): Promise<DietProfile> {
    const supabase = await createClient();

    // Load user preferences
    const { data: preferences, error: prefsError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (prefsError || !preferences) {
      throw new Error(
        'Diet profile not found for user; complete onboarding first.',
      );
    }

    // Check if onboarding is completed
    if (!preferences.onboarding_completed) {
      throw new Error(
        'Onboarding not completed; please complete onboarding first.',
      );
    }

    // Load active diet profile
    const { data: dietProfile, error: profileError } = await supabase
      .from('user_diet_profiles')
      .select('*, diet_types(name)')
      .eq('user_id', userId)
      .is('ends_on', null) // Active profile
      .maybeSingle();

    if (profileError || !dietProfile) {
      throw new Error(
        'Active diet profile not found for user; complete onboarding first.',
      );
    }

    // Map diet_type.name to DietKey
    // diet_types.name should match DietKey values (e.g., "balanced", "keto")
    let dietKey: DietKey = 'balanced'; // Fallback
    if (dietProfile.diet_type_id && dietProfile.diet_types) {
      const dietTypeName = (dietProfile.diet_types as { name: string }).name;
      // Map common names to DietKey
      const nameToKey: Record<string, DietKey> = {
        balanced: 'balanced',
        keto: 'keto',
        ketogenic: 'keto',
        mediterranean: 'mediterranean',
        vegan: 'vegan',
        wahls_paleo_plus: 'wahls_paleo_plus',
        'wahls-paleo-plus': 'wahls_paleo_plus',
        'wahls paleo plus': 'wahls_paleo_plus',
      };
      dietKey = nameToKey[dietTypeName.toLowerCase()] || 'balanced';
    }

    // Map strictness (1-10) to "strict" | "flexible"
    const strictness = mapNumberToStrictness(dietProfile.strictness);

    // Map variety_window_days to varietyLevel
    const varietyLevel = mapDaysToVarietyLevel(preferences.variety_window_days);

    // Build DietProfile
    const profile: DietProfile = {
      dietKey,
      allergies: preferences.allergies || [],
      dislikes: preferences.dislikes || [],
      calorieTarget: preferences.kcal_target
        ? { target: preferences.kcal_target }
        : {},
      prepPreferences: {
        maxPrepMinutes: preferences.max_prep_minutes,
      },
      servingsDefault: preferences.servings_default,
      varietyLevel,
      strictness,
      ...((Array.isArray(preferences.breakfast_preference) &&
        preferences.breakfast_preference.length > 0) ||
      (Array.isArray(preferences.lunch_preference) &&
        preferences.lunch_preference.length > 0) ||
      (Array.isArray(preferences.dinner_preference) &&
        preferences.dinner_preference.length > 0) ||
      (typeof preferences.breakfast_preference === 'string' &&
        preferences.breakfast_preference.trim()) ||
      (typeof preferences.lunch_preference === 'string' &&
        preferences.lunch_preference.trim()) ||
      (typeof preferences.dinner_preference === 'string' &&
        preferences.dinner_preference.trim())
        ? {
            mealPreferences: {
              breakfast:
                Array.isArray(preferences.breakfast_preference) &&
                preferences.breakfast_preference.length > 0
                  ? preferences.breakfast_preference
                  : typeof preferences.breakfast_preference === 'string' &&
                      preferences.breakfast_preference.trim()
                    ? [preferences.breakfast_preference.trim()]
                    : undefined,
              lunch:
                Array.isArray(preferences.lunch_preference) &&
                preferences.lunch_preference.length > 0
                  ? preferences.lunch_preference
                  : typeof preferences.lunch_preference === 'string' &&
                      preferences.lunch_preference.trim()
                    ? [preferences.lunch_preference.trim()]
                    : undefined,
              dinner:
                Array.isArray(preferences.dinner_preference) &&
                preferences.dinner_preference.length > 0
                  ? preferences.dinner_preference
                  : typeof preferences.dinner_preference === 'string' &&
                      preferences.dinner_preference.trim()
                    ? [preferences.dinner_preference.trim()]
                    : undefined,
            },
          }
        : {}),
    };

    // Validate with Zod schema
    const validated = dietProfileSchema.parse(profile);

    return validated;
  }

  /**
   * Get user language preference
   *
   * @param userId - User ID
   * @returns Language code ('nl' or 'en'), defaults to 'nl'
   */
  async getUserLanguage(userId: string): Promise<'nl' | 'en'> {
    const supabase = await createClient();

    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .select('language')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !preferences) {
      // Default to Dutch if not found
      return 'nl';
    }

    // Validate language is 'nl' or 'en'
    if (preferences.language === 'nl' || preferences.language === 'en') {
      return preferences.language;
    }

    // Default to Dutch
    return 'nl';
  }
}
