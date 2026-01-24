/**
 * Meal Scoring Service
 * 
 * Calculates combined scores for meals based on:
 * - User rating (1-5 stars)
 * - Nutrition score (0-100)
 * - Variety score (0-100, based on usage frequency and recency)
 * 
 * Updates combined_score in meal_history for sorting and selection.
 */

import "server-only";
import { createClient } from "@/src/lib/supabase/server";

/**
 * Scoring weights (can be adjusted)
 */
const SCORING_WEIGHTS = {
  userRating: 0.4, // 40% weight
  nutritionScore: 0.35, // 35% weight
  varietyScore: 0.25, // 25% weight
};

/**
 * Meal Scoring Service
 */
export class MealScoringService {
  /**
   * Calculate variety score for a meal (0-100)
   * 
   * Higher score = more variety (less used, more time since last use)
   * 
   * @param usageCount - Number of times meal has been used
   * @param lastUsedAt - Last used timestamp (null if never used)
   * @returns Variety score (0-100)
   */
  calculateVarietyScore(
    usageCount: number,
    lastUsedAt: string | null
  ): number {
    let score = 100; // Start at 100

    // Penalize based on usage count
    // Each usage reduces score by 5 points (max 50 point penalty)
    const usagePenalty = Math.min(usageCount * 5, 50);
    score -= usagePenalty;

    // Bonus for recency (if not used recently, higher variety)
    if (lastUsedAt) {
      const daysSinceLastUse =
        (Date.now() - new Date(lastUsedAt).getTime()) / (1000 * 60 * 60 * 24);
      
      // Bonus: +2 points per day since last use (max 30 points)
      const recencyBonus = Math.min(daysSinceLastUse * 2, 30);
      score += recencyBonus;
    } else {
      // Never used = max variety bonus
      score += 30;
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate combined score for a meal (0-100)
   * 
   * @param userRating - User rating (1-5, or null)
   * @param nutritionScore - Nutrition score (0-100, or null)
   * @param varietyScore - Variety score (0-100)
   * @returns Combined score (0-100)
   */
  calculateCombinedScore(
    userRating: number | null,
    nutritionScore: number | null,
    varietyScore: number
  ): number {
    // Normalize user rating to 0-100 scale (1-5 -> 0-100)
    const normalizedRating = userRating
      ? ((userRating - 1) / 4) * 100
      : 50; // Default to 50 if no rating

    // Use nutrition score or default to 50
    const nutrition = nutritionScore ?? 50;

    // Calculate weighted average
    const combined =
      normalizedRating * SCORING_WEIGHTS.userRating +
      nutrition * SCORING_WEIGHTS.nutritionScore +
      varietyScore * SCORING_WEIGHTS.varietyScore;

    return Math.round(combined * 100) / 100; // Round to 2 decimals
  }

  /**
   * Update scores for a meal in history
   * 
   * Recalculates variety score and combined score, then updates database.
   * 
   * @param userId - User ID
   * @param mealId - Meal ID
   */
  async updateMealScores(userId: string, mealId: string): Promise<void> {
    const supabase = await createClient();

    // Load meal history record
    const { data: mealHistory, error: fetchError } = await supabase
      .from("meal_history")
      .select("user_rating, nutrition_score, usage_count, last_used_at")
      .eq("user_id", userId)
      .eq("meal_id", mealId)
      .single();

    if (fetchError || !mealHistory) {
      throw new Error(
        `Failed to load meal history: ${fetchError?.message || "Not found"}`
      );
    }

    // Calculate variety score
    const varietyScore = this.calculateVarietyScore(
      mealHistory.usage_count,
      mealHistory.last_used_at
    );

    // Calculate combined score
    const combinedScore = this.calculateCombinedScore(
      mealHistory.user_rating,
      mealHistory.nutrition_score,
      varietyScore
    );

    // Update database
    const { error: updateError } = await supabase
      .from("meal_history")
      .update({
        variety_score: varietyScore,
        combined_score: combinedScore,
      })
      .eq("user_id", userId)
      .eq("meal_id", mealId);

    if (updateError) {
      throw new Error(
        `Failed to update meal scores: ${updateError.message}`
      );
    }
  }

  /**
   * Batch update scores for all meals of a user
   * 
   * Useful for periodic recalculation (e.g., daily cron job).
   * 
   * @param userId - User ID
   */
  async updateAllUserMealScores(userId: string): Promise<void> {
    const supabase = await createClient();

    // Load all meal history records for user
    const { data: meals, error: fetchError } = await supabase
      .from("meal_history")
      .select("meal_id, user_rating, nutrition_score, usage_count, last_used_at")
      .eq("user_id", userId);

    if (fetchError) {
      throw new Error(
        `Failed to load meal history: ${fetchError.message}`
      );
    }

    // Update each meal
    for (const meal of meals || []) {
      const varietyScore = this.calculateVarietyScore(
        meal.usage_count,
        meal.last_used_at
      );

      const combinedScore = this.calculateCombinedScore(
        meal.user_rating,
        meal.nutrition_score,
        varietyScore
      );

      await supabase
        .from("meal_history")
        .update({
          variety_score: varietyScore,
          combined_score: combinedScore,
        })
        .eq("user_id", userId)
        .eq("meal_id", meal.meal_id);
    }
  }
}
