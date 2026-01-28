/**
 * Meal Preference Matcher
 *
 * Checks if a meal matches user meal preferences.
 * Uses fuzzy matching on meal name and ingredient names.
 */

import type { Meal } from '@/src/lib/diets';
import type { MealSlot } from '@/src/lib/diets';

/**
 * Check if a meal matches meal preferences for a slot
 *
 * Uses case-insensitive substring matching on:
 * - Meal name
 * - Ingredient display names
 * - Ingredient tags
 *
 * @param meal - Meal to check
 * @param mealSlot - Meal slot (breakfast, lunch, dinner)
 * @param preferences - Array of preference strings (e.g., ["eiwit shake", "groene smoothie"])
 * @returns true if meal matches at least one preference
 */
export function mealMatchesPreferences(
  meal: Meal,
  mealSlot: MealSlot,
  preferences: string[],
): boolean {
  if (!preferences || preferences.length === 0) {
    return true; // No preferences = always matches
  }

  const mealText = [
    meal.name.toLowerCase(),
    ...(meal.ingredientRefs || []).map((ref) => {
      const parts: string[] = [];
      if (ref.displayName) parts.push(ref.displayName.toLowerCase());
      if (ref.tags) parts.push(...ref.tags.map((t) => t.toLowerCase()));
      return parts.join(' ');
    }),
  ].join(' ');

  // Check if any preference matches
  return preferences.some((pref) => {
    const prefLower = pref.toLowerCase();

    // Direct match in meal name
    if (meal.name.toLowerCase().includes(prefLower)) {
      return true;
    }

    // Check if preference keywords appear in meal text
    const prefWords = prefLower.split(/\s+/).filter((w) => w.length > 2);
    if (prefWords.length > 0) {
      // All words must appear (AND logic)
      const allWordsMatch = prefWords.every((word) => mealText.includes(word));
      if (allWordsMatch) {
        return true;
      }
    }

    // Special cases for common preferences
    if (prefLower.includes('shake') || prefLower.includes('smoothie')) {
      // For shake/smoothie preferences, check if meal name contains these terms
      if (
        meal.name.toLowerCase().includes('shake') ||
        meal.name.toLowerCase().includes('smoothie')
      ) {
        // Also check if it's the right type (e.g., "eiwit shake" should have protein)
        if (prefLower.includes('eiwit') || prefLower.includes('protein')) {
          // Check for protein-related ingredients
          const hasProtein =
            mealText.includes('eiwit') ||
            mealText.includes('protein') ||
            mealText.includes('poeder');
          return hasProtein;
        }
        if (prefLower.includes('groen') || prefLower.includes('green')) {
          // Check for green vegetables/fruits
          const hasGreen =
            mealText.includes('groen') ||
            mealText.includes('spinazie') ||
            mealText.includes('spirulina') ||
            mealText.includes('kale');
          return hasGreen;
        }
        return true; // Generic shake/smoothie match
      }
    }

    return false;
  });
}
