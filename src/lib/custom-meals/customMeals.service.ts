/**
 * Custom Meals Service
 * 
 * Manages custom meals that users add via photo/screenshot upload.
 */

import "server-only";
import { createClient } from "@/src/lib/supabase/server";
import type { Meal } from "@/src/lib/diets";
import type { MealSlot, DietKey } from "@/src/lib/diets";

/**
 * Custom meal record from database
 */
export type CustomMealRecord = {
  id: string;
  userId: string;
  name: string;
  mealSlot: MealSlot;
  dietKey: DietKey | null;
  sourceType: "photo" | "screenshot" | "file" | "gemini";
  sourceImageUrl: string | null;
  sourceImagePath: string | null;
  source: string | null;
  aiAnalysis: any | null;
  originalLanguage: string | null;
  translatedContent: any | null;
  mealData: Meal;
  consumptionCount: number;
  firstConsumedAt: string | null;
  lastConsumedAt: string | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
};

/**
 * Input for creating a custom meal
 */
export type CreateCustomMealInput = {
  userId: string;
  name: string;
  mealSlot: MealSlot;
  dietKey?: DietKey;
  sourceType: "photo" | "screenshot" | "file" | "gemini";
  sourceImageUrl?: string;
  sourceImagePath?: string;
  aiAnalysis?: any;
  originalLanguage?: string;
  translatedContent?: any;
  mealData: Meal;
};

/**
 * Custom Meals Service
 */
export class CustomMealsService {
  /**
   * Create a new custom meal
   */
  async createMeal(input: CreateCustomMealInput): Promise<CustomMealRecord> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("custom_meals")
      .insert({
        user_id: input.userId,
        name: input.name,
        meal_slot: input.mealSlot,
        diet_key: input.dietKey || null,
        source_type: input.sourceType,
        source_image_url: input.sourceImageUrl || null,
        source_image_path: input.sourceImagePath || null,
        ai_analysis: input.aiAnalysis || null,
        original_language: input.originalLanguage || null,
        translated_content: input.translatedContent || null,
        meal_data: input.mealData as any,
        consumption_count: 0,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create custom meal: ${error.message}`);
    }

    return this.mapToRecord(data);
  }

  /**
   * Get all custom meals for a user
   */
  async getUserMeals(userId: string): Promise<CustomMealRecord[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("custom_meals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch custom meals: ${error.message}`);
    }

    return (data || []).map((row) => this.mapToRecord(row));
  }

  /**
   * Get a single custom meal by ID
   */
  async getMealById(mealId: string, userId: string): Promise<CustomMealRecord | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("custom_meals")
      .select("*")
      .eq("id", mealId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch custom meal: ${error.message}`);
    }

    return data ? this.mapToRecord(data) : null;
  }

  /**
   * Get top consumed meals for a user
   */
  async getTopConsumedMeals(userId: string, limit: number = 5): Promise<CustomMealRecord[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("custom_meals")
      .select("*")
      .eq("user_id", userId)
      .order("consumption_count", { ascending: false })
      .order("last_consumed_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch top consumed meals: ${error.message}`);
    }

    return (data || []).map((row) => this.mapToRecord(row));
  }

  /**
   * Log meal consumption
   */
  async logConsumption(args: {
    userId: string;
    customMealId?: string;
    mealHistoryId?: string;
    mealName: string;
    mealSlot: MealSlot;
    notes?: string;
  }): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from("meal_consumption_log")
      .insert({
        user_id: args.userId,
        custom_meal_id: args.customMealId || null,
        meal_history_id: args.mealHistoryId || null,
        meal_name: args.mealName,
        meal_slot: args.mealSlot,
        notes: args.notes || null,
      });

    if (error) {
      throw new Error(`Failed to log meal consumption: ${error.message}`);
    }
  }

  /**
   * Get consumption count for a meal (combines custom_meals and meal_history)
   */
  async getMealConsumptionCount(args: {
    userId: string;
    customMealId?: string;
    mealHistoryId?: string;
  }): Promise<number> {
    const supabase = await createClient();

    if (args.customMealId) {
      const { data } = await supabase
        .from("custom_meals")
        .select("consumption_count")
        .eq("id", args.customMealId)
        .eq("user_id", args.userId)
        .single();

      return data?.consumption_count || 0;
    }

    if (args.mealHistoryId) {
      const { data } = await supabase
        .from("meal_history")
        .select("usage_count")
        .eq("id", args.mealHistoryId)
        .eq("user_id", args.userId)
        .single();

      return data?.usage_count || 0;
    }

    return 0;
  }

  /**
   * Map database row to CustomMealRecord
   */
  private mapToRecord(row: any): CustomMealRecord {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      mealSlot: row.meal_slot,
      dietKey: row.diet_key,
      sourceType: row.source_type,
      sourceImageUrl: row.source_image_url,
      sourceImagePath: row.source_image_path,
      source: row.source || null,
      aiAnalysis: row.ai_analysis,
      originalLanguage: row.original_language,
      translatedContent: row.translated_content,
      mealData: row.meal_data as Meal,
      consumptionCount: row.consumption_count,
      firstConsumedAt: row.first_consumed_at,
      lastConsumedAt: row.last_consumed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      notes: row.notes || null,
    };
  }
}
