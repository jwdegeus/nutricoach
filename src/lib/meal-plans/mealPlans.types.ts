/**
 * Meal Plans Types
 *
 * Types for meal plan persistence and management.
 */

import type {
  MealPlanRequest,
  MealPlanResponse,
  DietRuleSet,
} from '@/src/lib/diets';
import type { MealPlanEnrichmentResponse } from '@/src/lib/agents/meal-planner';

/**
 * Meal plan record from database (snake_case)
 */
export type MealPlanRecord = {
  id: string;
  userId: string;
  dietKey: string;
  dateFrom: string; // YYYY-MM-DD
  days: number;
  requestSnapshot: MealPlanRequest;
  rulesSnapshot: DietRuleSet;
  planSnapshot: MealPlanResponse;
  enrichmentSnapshot: MealPlanEnrichmentResponse | null;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
};

/**
 * Input for creating a new meal plan
 */
export type CreateMealPlanInput = {
  dateFrom: string; // YYYY-MM-DD
  days: number;
  // Optional overrides (if not provided, uses profile defaults)
  calorieTarget?: {
    min?: number;
    max?: number;
    target?: number;
  };
};

/**
 * Input for regenerating a meal plan
 */
export type RegenerateMealPlanInput = {
  planId: string;
  // Optional: regenerate only one day
  onlyDate?: string; // YYYY-MM-DD
};
