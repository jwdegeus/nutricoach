/**
 * Meal Plan Enrichment Types
 *
 * Types for enriched meal plans (titles, instructions, cook plans).
 * Used when displaying plan_snapshot/enrichment_snapshot from database.
 */

import type { MealSlot } from '@/src/lib/diets';

export type EnrichedMeal = {
  date: string;
  mealSlot: MealSlot | string;
  title: string;
  instructions: string[];
  prepTimeMin: number;
  cookTimeMin: number;
  servings?: number;
  kitchenNotes?: string[];
  ingredientNevoCodesUsed: string[];
};

export type CookPlanDay = {
  date: string;
  steps: string[];
  estimatedTotalTimeMin: number;
};

export type MealPlanEnrichmentResponse = {
  meals: EnrichedMeal[];
  cookPlanDays: CookPlanDay[];
};
