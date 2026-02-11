/**
 * Profile Service
 *
 * Server-side service for loading user diet profiles from database.
 * - Diet: family-level (user_preferences.diet_type_id) so one diet for the whole household.
 * - Allergies/dislikes: merged from all family members for generator warnings/exclusions.
 * - Other prefs: from default family member or user_preferences.
 * See docs/settings-user-vs-family.md.
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/src/lib/supabase/server';
import { getDefaultFamilyMemberId } from '@/src/lib/family/defaultFamilyMember';
import type { DietProfile } from '@/src/lib/diets';
import { dietProfileSchema } from '@/src/lib/diets';
import type { DietKey } from '@/src/lib/diets';
import {
  mapNumberToStrictness,
  mapDaysToVarietyLevel,
} from '@/src/app/(app)/onboarding/onboarding.types';

const DIET_NAME_TO_KEY: Record<string, DietKey> = {
  balanced: 'balanced',
  keto: 'keto',
  ketogenic: 'keto',
  mediterranean: 'mediterranean',
  vegan: 'vegan',
  wahls_paleo_plus: 'wahls_paleo_plus',
  'wahls-paleo-plus': 'wahls_paleo_plus',
  'wahls paleo plus': 'wahls_paleo_plus',
};

function dietTypeNameToKey(name: string | null | undefined): DietKey {
  if (!name || typeof name !== 'string') return 'balanced';
  return DIET_NAME_TO_KEY[name.toLowerCase()] ?? 'balanced';
}

/** Preferences-like row (user_preferences or family_member_preferences shape). */
type PrefsRow = {
  max_prep_minutes?: number;
  servings_default?: number;
  kcal_target?: number | null;
  variety_window_days?: number;
  allergies?: string[] | null;
  dislikes?: string[] | null;
  breakfast_preference?: string[] | string | null;
  lunch_preference?: string[] | string | null;
  dinner_preference?: string[] | string | null;
};

/** Diet profile row with optional diet_types join. */
type DietProfileRow = {
  strictness: number;
  diet_type_id?: string | null;
  diet_types?: { name: string } | null;
};

/** user_preferences with optional family diet columns. */
type UserPrefsRow = PrefsRow & {
  diet_type_id?: string | null;
  diet_strictness?: number | null;
  diet_is_inflamed?: boolean | null;
};

function mapPrefsAndDietToProfile(
  prefs: PrefsRow,
  dietProfile: DietProfileRow,
  mergedAllergies?: string[],
  mergedDislikes?: string[],
): DietProfile {
  const dietKey =
    dietProfile.diet_type_id && dietProfile.diet_types
      ? dietTypeNameToKey((dietProfile.diet_types as { name: string }).name)
      : 'balanced';
  const strictness = mapNumberToStrictness(dietProfile.strictness);
  const varietyLevel = mapDaysToVarietyLevel(prefs.variety_window_days ?? 7);

  const norm = (
    v: string | string[] | null | undefined,
  ): string[] | undefined => {
    if (!v) return undefined;
    if (Array.isArray(v)) return v.length > 0 ? v : undefined;
    if (typeof v === 'string' && v.trim()) return [v.trim()];
    return undefined;
  };

  const profile: DietProfile = {
    dietKey,
    allergies: mergedAllergies ?? prefs.allergies ?? [],
    dislikes: mergedDislikes ?? prefs.dislikes ?? [],
    calorieTarget: prefs.kcal_target ? { target: prefs.kcal_target } : {},
    prepPreferences: {
      maxPrepMinutes: prefs.max_prep_minutes ?? 30,
    },
    servingsDefault: prefs.servings_default ?? 1,
    varietyLevel,
    strictness,
    ...(norm(prefs.breakfast_preference) ||
    norm(prefs.lunch_preference) ||
    norm(prefs.dinner_preference)
      ? {
          mealPreferences: {
            breakfast: norm(prefs.breakfast_preference),
            lunch: norm(prefs.lunch_preference),
            dinner: norm(prefs.dinner_preference),
          },
        }
      : {}),
  };

  return dietProfileSchema.parse(profile);
}

/**
 * Profile Service
 */
export class ProfileService {
  /**
   * Load DietProfile for a user.
   * - Family diet: user_preferences.diet_type_id (one diet for the whole household).
   * - Allergies/dislikes: merged from all family members for generator warnings.
   * - Other prefs: default family member or user_preferences.
   */
  async loadDietProfileForUser(
    userId: string,
    supabaseAdmin?: SupabaseClient,
  ): Promise<DietProfile> {
    const supabase = supabaseAdmin ?? (await createClient());

    const { data: userPrefs, error: userPrefsError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!userPrefsError && userPrefs) {
      const up = userPrefs as UserPrefsRow & { onboarding_completed?: boolean };
      if (up.diet_type_id) {
        const { data: dietType, error: dtError } = await supabase
          .from('diet_types')
          .select('name')
          .eq('id', up.diet_type_id)
          .maybeSingle();
        if (!dtError && dietType?.name) {
          const _dietKey = dietTypeNameToKey(
            (dietType as { name: string }).name,
          );
          const _strictness =
            up.diet_strictness != null
              ? mapNumberToStrictness(up.diet_strictness)
              : 'flexible';
          const _varietyLevel = mapDaysToVarietyLevel(
            up.variety_window_days ?? 7,
          );
          const merged = await this.mergeAllFamilyMemberAllergiesAndDislikes(
            supabase,
            userId,
          );
          const prefs: PrefsRow = {
            max_prep_minutes: up.max_prep_minutes,
            servings_default: up.servings_default,
            kcal_target: up.kcal_target,
            variety_window_days: up.variety_window_days,
            breakfast_preference: up.breakfast_preference,
            lunch_preference: up.lunch_preference,
            dinner_preference: up.dinner_preference,
          };
          const dietProfileRow: DietProfileRow & {
            diet_types?: { name: string } | null;
          } = {
            strictness: up.diet_strictness ?? 5,
            diet_type_id: up.diet_type_id,
            diet_types: { name: (dietType as { name: string }).name },
          };
          return mapPrefsAndDietToProfile(
            prefs,
            dietProfileRow,
            merged.allergies,
            merged.dislikes,
          );
        }
      }
    }

    const familyMemberId = await getDefaultFamilyMemberId(supabase, userId);
    if (familyMemberId) {
      const { data: prefs, error: prefsError } = await supabase
        .from('family_member_preferences')
        .select('*')
        .eq('family_member_id', familyMemberId)
        .maybeSingle();

      const { data: dietProfile, error: profileError } = await supabase
        .from('family_member_diet_profiles')
        .select('*, diet_types(name)')
        .eq('family_member_id', familyMemberId)
        .is('ends_on', null)
        .maybeSingle();

      if (!prefsError && prefs && !profileError && dietProfile) {
        const merged = await this.mergeAllFamilyMemberAllergiesAndDislikes(
          supabase,
          userId,
        );
        return mapPrefsAndDietToProfile(
          prefs as PrefsRow,
          dietProfile as DietProfileRow & {
            diet_types?: { name: string } | null;
          },
          merged.allergies,
          merged.dislikes,
        );
      }
    }

    if (!userPrefs) {
      throw new Error(
        'Diet profile not found for user; add a family member or set Gezinsdieet in Familie → Bewerken.',
      );
    }

    const prefs = userPrefs as PrefsRow & { onboarding_completed?: boolean };
    if (prefs.onboarding_completed === false) {
      throw new Error(
        'Onboarding not completed; complete onboarding or set Gezinsdieet in Familie → Bewerken.',
      );
    }

    const { data: dietProfile, error: profileError } = await supabase
      .from('user_diet_profiles')
      .select('*, diet_types(name)')
      .eq('user_id', userId)
      .is('ends_on', null)
      .maybeSingle();

    if (profileError || !dietProfile) {
      throw new Error(
        'Active diet not found; set Gezinsdieet in Familie → Bewerken or add a family member with diet.',
      );
    }

    return mapPrefsAndDietToProfile(
      prefs,
      dietProfile as DietProfileRow & { diet_types?: { name: string } | null },
    );
  }

  /** Merge allergies and dislikes from all family members (for generator exclusions/warnings). */
  private async mergeAllFamilyMemberAllergiesAndDislikes(
    supabase: SupabaseClient,
    userId: string,
  ): Promise<{ allergies: string[]; dislikes: string[] }> {
    const { data: members } = await supabase
      .from('family_members')
      .select('id')
      .eq('user_id', userId);
    if (!members?.length) return { allergies: [], dislikes: [] };

    const memberIds = members.map((m) => (m as { id: string }).id);
    const { data: prefsList } = await supabase
      .from('family_member_preferences')
      .select('allergies, dislikes')
      .in('family_member_id', memberIds);

    const allergySet = new Set<string>();
    const dislikeSet = new Set<string>();
    for (const row of prefsList ?? []) {
      const r = row as {
        allergies?: string[] | null;
        dislikes?: string[] | null;
      };
      for (const a of r.allergies ?? [])
        if (a?.trim()) allergySet.add(a.trim().toLowerCase());
      for (const d of r.dislikes ?? [])
        if (d?.trim()) dislikeSet.add(d.trim().toLowerCase());
    }
    return {
      allergies: [...allergySet],
      dislikes: [...dislikeSet],
    };
  }

  /**
   * Get user language preference (stays on user_preferences – user-level).
   */
  async getUserLanguage(
    userId: string,
    supabaseAdmin?: SupabaseClient,
  ): Promise<'nl' | 'en'> {
    const supabase = supabaseAdmin ?? (await createClient());

    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .select('language')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !preferences) {
      return 'nl';
    }

    if (preferences.language === 'nl' || preferences.language === 'en') {
      return preferences.language;
    }

    return 'nl';
  }
}
