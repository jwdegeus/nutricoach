/**
 * Meal History Service
 *
 * Manages meal history: extraction, storage, retrieval, and scoring.
 * Enables reuse of rated meals to reduce Gemini API calls.
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import type { Meal, MealPlanResponse } from '@/src/lib/diets';
import { calcMealMacros } from '@/src/lib/agents/meal-planner/mealPlannerAgent.tools';
import type { DietKey, MealSlot } from '@/src/lib/diets';

/**
 * Meal history record from database
 */
export type MealHistoryRecord = {
  id: string;
  userId: string;
  mealId: string;
  mealName: string;
  mealSlot: MealSlot;
  dietKey: DietKey;
  mealData: Meal;
  userRating: number | null; // 1-5
  nutritionScore: number | null; // 0-100
  varietyScore: number | null; // 0-100
  combinedScore: number | null; // 0-100
  usageCount: number;
  firstUsedAt: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Input for storing a meal in history
 */
export type StoreMealInput = {
  userId: string;
  meal: Meal;
  dietKey: DietKey;
};

/**
 * Query options for finding meals
 */
export type FindMealsOptions = {
  userId: string;
  dietKey: DietKey;
  mealSlot: MealSlot;
  minRating?: number; // Minimum user rating (1-5)
  minCombinedScore?: number; // Minimum combined score (0-100)
  excludeMealIds?: string[]; // Exclude these meal IDs (for variety)
  limit?: number; // Max results (default: 10)
  maxUsageCount?: number; // Don't reuse meals used more than this
  daysSinceLastUse?: number; // Minimum days since last use (for variety)
};

/**
 * Meal History Service
 */
export class MealHistoryService {
  /**
   * Extract all meals from a meal plan and store them in history
   *
   * @param userId - User ID
   * @param plan - Meal plan response
   * @param dietKey - Diet key
   */
  async extractAndStoreMeals(
    userId: string,
    plan: MealPlanResponse,
    dietKey: DietKey,
  ): Promise<void> {
    const _supabase = await createClient();

    // Extract all meals from plan
    const meals: Meal[] = [];
    for (const day of plan.days) {
      for (const meal of day.meals) {
        meals.push(meal);
      }
    }

    // Store each meal (upsert based on meal_id to prevent duplicates)
    for (const meal of meals) {
      await this.storeMeal({
        userId,
        meal,
        dietKey,
      });
    }
  }

  /**
   * Store a single meal in history
   *
   * Calculates nutrition score and stores meal with metadata.
   * Uses upsert to prevent duplicates (based on user_id + meal_id).
   *
   * @param input - Store meal input
   */
  async storeMeal(input: StoreMealInput): Promise<void> {
    const { userId, meal, dietKey } = input;
    const supabase = await createClient();

    // Calculate nutrition score
    const nutritionScore = await this.calculateNutritionScore(meal);

    // Check if meal already exists
    const { data: existing } = await supabase
      .from('meal_history')
      .select('id, usage_count, last_used_at')
      .eq('user_id', userId)
      .eq('meal_id', meal.id)
      .maybeSingle();

    if (existing) {
      // Meal already exists, just update last_used_at if needed
      // Don't overwrite existing rating or scores
      return;
    }

    // Insert new meal
    const { error } = await supabase.from('meal_history').insert({
      user_id: userId,
      meal_id: meal.id,
      meal_name: meal.name,
      meal_slot: meal.slot,
      diet_key: dietKey,
      meal_data: meal as Record<string, unknown>, // JSONB
      nutrition_score: nutritionScore,
      usage_count: 0,
      first_used_at: new Date().toISOString(),
      last_used_at: null,
    });

    if (error) {
      throw new Error(`Failed to store meal in history: ${error.message}`);
    }
  }

  /**
   * Calculate nutrition score for a meal (0-100)
   *
   * Score based on:
   * - Balanced macros (protein, carbs, fat ratios)
   * - Adequate protein
   * - Not too high in saturated fat
   * - Adequate fiber
   *
   * @param meal - Meal to score
   * @returns Nutrition score (0-100)
   */
  private async calculateNutritionScore(meal: Meal): Promise<number> {
    if (!meal.ingredientRefs || meal.ingredientRefs.length === 0) {
      return 50; // Default score if no ingredients
    }

    try {
      // Calculate macros
      const macros = await calcMealMacros(
        meal.ingredientRefs.map((ref) => ({
          nevoCode: ref.nevoCode,
          quantityG: ref.quantityG,
        })),
      );

      const { calories, proteinG, carbsG, fatG } = macros;

      if (calories === 0) {
        return 50; // Default if no calories
      }

      let score = 50; // Base score

      // Protein score (0-20 points)
      // Target: 20-30% of calories from protein
      const proteinCalories = proteinG * 4;
      const proteinPct = (proteinCalories / calories) * 100;
      if (proteinPct >= 20 && proteinPct <= 30) {
        score += 20;
      } else if (proteinPct >= 15 && proteinPct < 20) {
        score += 15;
      } else if (proteinPct > 30 && proteinPct <= 35) {
        score += 15;
      } else if (proteinPct >= 10 && proteinPct < 15) {
        score += 10;
      } else if (proteinPct > 35 && proteinPct <= 40) {
        score += 10;
      } else {
        score += 5;
      }

      // Fat score (0-15 points)
      // Target: 25-35% of calories from fat
      const fatCalories = fatG * 9;
      const fatPct = (fatCalories / calories) * 100;
      if (fatPct >= 25 && fatPct <= 35) {
        score += 15;
      } else if (fatPct >= 20 && fatPct < 25) {
        score += 10;
      } else if (fatPct > 35 && fatPct <= 40) {
        score += 10;
      } else {
        score += 5;
      }

      // Carbs score (0-15 points)
      // Target: 35-50% of calories from carbs (for balanced diet)
      const carbsCalories = carbsG * 4;
      const carbsPct = (carbsCalories / calories) * 100;
      if (carbsPct >= 35 && carbsPct <= 50) {
        score += 15;
      } else if (carbsPct >= 30 && carbsPct < 35) {
        score += 10;
      } else if (carbsPct > 50 && carbsPct <= 55) {
        score += 10;
      } else {
        score += 5;
      }

      // Clamp to 0-100
      return Math.max(0, Math.min(100, score));
    } catch (error) {
      console.error('Error calculating nutrition score:', error);
      return 50; // Default on error
    }
  }

  /**
   * Find meals from history matching criteria
   *
   * @param options - Find meals options
   * @returns Array of meal history records
   */
  async findMeals(options: FindMealsOptions): Promise<MealHistoryRecord[]> {
    const {
      userId,
      dietKey,
      mealSlot,
      minRating,
      minCombinedScore,
      excludeMealIds = [],
      limit = 10,
      maxUsageCount,
      daysSinceLastUse,
    } = options;

    const supabase = await createClient();

    // Build query
    let query = supabase
      .from('meal_history')
      .select('*')
      .eq('user_id', userId)
      .eq('diet_key', dietKey)
      .eq('meal_slot', mealSlot)
      .order('combined_score', { ascending: false, nullsFirst: false })
      .limit(limit);

    // Apply filters
    if (minRating !== undefined) {
      query = query.gte('user_rating', minRating);
    }

    if (minCombinedScore !== undefined) {
      query = query.gte('combined_score', minCombinedScore);
    }

    if (excludeMealIds.length > 0) {
      query = query.not('meal_id', 'in', `(${excludeMealIds.join(',')})`);
    }

    if (maxUsageCount !== undefined) {
      query = query.lte('usage_count', maxUsageCount);
    }

    if (daysSinceLastUse !== undefined) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastUse);
      query = query.or(
        `last_used_at.is.null,last_used_at.lt.${cutoffDate.toISOString()}`,
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to find meals from history: ${error.message}`);
    }

    // Map to MealHistoryRecord
    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      mealId: row.meal_id,
      mealName: row.meal_name,
      mealSlot: row.meal_slot as MealSlot,
      dietKey: row.diet_key as DietKey,
      mealData: row.meal_data as Meal,
      userRating: row.user_rating,
      nutritionScore: row.nutrition_score,
      varietyScore: row.variety_score,
      combinedScore: row.combined_score,
      usageCount: row.usage_count,
      firstUsedAt: row.first_used_at,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Update meal usage (increment usage count and set last_used_at)
   *
   * @param userId - User ID
   * @param mealId - Meal ID
   */
  async updateMealUsage(userId: string, mealId: string): Promise<void> {
    const supabase = await createClient();

    // Fetch current usage_count then increment (Supabase client has no .raw())
    const { data: row } = await supabase
      .from('meal_history')
      .select('usage_count')
      .eq('user_id', userId)
      .eq('meal_id', mealId)
      .single();
    const nextCount = (row?.usage_count ?? 0) + 1;
    const { error } = await supabase
      .from('meal_history')
      .update({
        usage_count: nextCount,
        last_used_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('meal_id', mealId);

    if (error) {
      throw new Error(`Failed to update meal usage: ${error.message}`);
    }
  }

  /**
   * Rate a meal
   *
   * @param userId - User ID
   * @param mealId - Meal ID
   * @param rating - Rating (1-5)
   * @param comment - Optional comment
   */
  async rateMeal(
    userId: string,
    mealId: string,
    rating: number,
    comment?: string,
  ): Promise<void> {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const supabase = await createClient();

    // Find meal_history_id
    const { data: mealHistory } = await supabase
      .from('meal_history')
      .select('id')
      .eq('user_id', userId)
      .eq('meal_id', mealId)
      .single();

    if (!mealHistory) {
      throw new Error('Meal not found in history');
    }

    // Insert rating (trigger will update meal_history.user_rating)
    const { error } = await supabase.from('meal_ratings').insert({
      user_id: userId,
      meal_history_id: mealHistory.id,
      rating,
      comment: comment || null,
    });

    if (error) {
      throw new Error(`Failed to rate meal: ${error.message}`);
    }
  }
}
