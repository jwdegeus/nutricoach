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

/** DB: status — draft | applied | archived */
export type MealPlanStatus = 'draft' | 'applied' | 'archived';

/**
 * Meal plan record (application shape; DB columns are snake_case).
 * New plans default to status 'applied'; draft fields used for review → apply flow.
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
  /** DB: status */
  status?: MealPlanStatus;
  /** DB: draft_plan_snapshot — draft version during review, before apply */
  draftPlanSnapshot?: MealPlanResponse | null;
  /** DB: draft_created_at */
  draftCreatedAt?: string | null;
  /** DB: applied_at — when plan was last applied */
  appliedAt?: string | null;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
};

/**
 * View-model helper: which plan snapshot to show in review context (draft takes precedence).
 * No runtime logic — use in UI/selectors to type "current" snapshot source.
 */
export type MealPlanCurrentSnapshot = {
  snapshot: MealPlanResponse;
  source: 'draft' | 'applied';
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
