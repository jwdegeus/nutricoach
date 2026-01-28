'use server';

import { createClient } from '@/src/lib/supabase/server';
import { MealHistoryService } from '@/src/lib/meal-history';
import { MealScoringService } from '@/src/lib/meal-history';
import { revalidatePath } from 'next/cache';

/**
 * Extract original meal ID from potentially reused meal ID
 *
 * Reused meals have format: {originalId}-{date}
 * This function extracts the original ID.
 */
function extractOriginalMealId(mealId: string): string {
  // Check if mealId matches pattern: {id}-YYYY-MM-DD
  const datePattern = /-\d{4}-\d{2}-\d{2}$/;
  if (datePattern.test(mealId)) {
    // Extract original ID by removing the date suffix
    return mealId.replace(datePattern, '');
  }
  // Not a reused meal, return as-is
  return mealId;
}

/**
 * Rate a meal
 *
 * @param mealId - Meal ID from meal plan (may be reused format: {originalId}-{date})
 * @param rating - Rating (1-5)
 * @param comment - Optional comment
 */
export async function rateMealAction(
  mealId: string,
  rating: number,
  comment?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: 'Je moet ingelogd zijn om een maaltijd te beoordelen',
    };
  }

  // Validate rating
  if (rating < 1 || rating > 5) {
    return {
      ok: false,
      error: 'Rating moet tussen 1 en 5 zijn',
    };
  }

  // Extract original meal ID (in case this is a reused meal)
  const originalMealId = extractOriginalMealId(mealId);

  try {
    const historyService = new MealHistoryService();
    await historyService.rateMeal(user.id, originalMealId, rating, comment);

    // Update scores after rating
    const scoringService = new MealScoringService();
    await scoringService.updateMealScores(user.id, originalMealId);

    // Revalidate meal plan pages
    revalidatePath('/meal-plans');

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Fout bij opslaan van rating',
    };
  }
}

/**
 * Get rating for a meal
 *
 * @param mealId - Meal ID from meal plan (may be reused format: {originalId}-{date})
 * @returns Rating (1-5) or null if not rated
 */
export async function getMealRatingAction(
  mealId: string,
): Promise<{ ok: true; rating: number | null } | { ok: false; error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: 'Je moet ingelogd zijn',
    };
  }

  // Extract original meal ID (in case this is a reused meal)
  const originalMealId = extractOriginalMealId(mealId);

  try {
    const { data, error } = await supabase
      .from('meal_history')
      .select('user_rating')
      .eq('user_id', user.id)
      .eq('meal_id', originalMealId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: `Fout bij ophalen rating: ${error.message}`,
      };
    }

    return {
      ok: true,
      rating: data?.user_rating || null,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Fout bij ophalen van rating',
    };
  }
}
