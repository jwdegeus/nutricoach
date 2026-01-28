/**
 * Meal Planner Enrichment Types
 *
 * Types for enriching meal plans with titles, instructions, and cook plans.
 * This is a presentation layer that adds cooking instructions without adding new ingredients.
 */

import type { MealSlot } from '@/src/lib/diets';

/**
 * Enriched meal with title, instructions, and timing
 */
export type EnrichedMeal = {
  date: string; // ISO date (YYYY-MM-DD)
  mealSlot: MealSlot | string; // "breakfast" | "lunch" | "dinner" | "snack"
  title: string; // Meal title/name
  instructions: string[]; // Cooking instructions (max ~8-12 steps)
  prepTimeMin: number; // Preparation time in minutes
  cookTimeMin: number; // Cooking time in minutes
  servings?: number; // Number of servings (optional)
  kitchenNotes?: string[]; // Optional kitchen notes/tips
  ingredientNevoCodesUsed: string[]; // NEVO codes referenced in instructions (for validation)
};

/**
 * Cook plan for a day (batch suggestions, order, prep ahead)
 */
export type CookPlanDay = {
  date: string; // ISO date (YYYY-MM-DD)
  steps: string[]; // Batch cooking suggestions, order, prep ahead tips
  estimatedTotalTimeMin: number; // Estimated total time for the day
};

/**
 * Enrichment response for entire meal plan
 */
export type MealPlanEnrichmentResponse = {
  meals: EnrichedMeal[]; // One enriched meal per meal in plan
  cookPlanDays: CookPlanDay[]; // Cook plan per day
};

/**
 * Options for meal enrichment
 */
export type MealEnrichmentOptions = {
  allowPantryStaples?: boolean; // Allow generic pantry items (water, salt, pepper) - default false
  maxInstructionSteps?: number; // Maximum number of instruction steps - default 8
};
