/**
 * Meal Plans Types
 *
 * Types for meal plan persistence and management.
 */

import type {
  MealPlanRequest,
  MealPlanResponse,
  DietRuleSet,
  MealIngredientRef,
} from '@/src/lib/diets';
import type { MealPlanEnrichmentResponse } from '@/src/lib/meal-plans/enrichment.types';

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
 * DB-first plan settings (optional; only used when MEAL_PLANNER_DB_FIRST=true).
 */
export type CreateMealPlanDbFirstSettings = {
  repeatWindowDays?: number;
  aiFillMode?: 'strict' | 'normal';
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
  /** DB-first only: variatie-venster en AI strict/normal (defaults server-side). */
  dbFirstSettings?: CreateMealPlanDbFirstSettings;
};

/**
 * Input for regenerating a meal plan
 */
export type RegenerateMealPlanInput = {
  planId: string;
  // Optional: regenerate only one day
  onlyDate?: string; // YYYY-MM-DD
};

// ---------------------------------------------------------------------------
// Recipe-first generator (toekomst) — Candidate Query Contract
// ---------------------------------------------------------------------------
// Types-only contract for querying recipe candidates per slot. No runtime
// behaviour; used to define the API that a future recipe-first path will
// implement. See docs/meal-planner-weekmenu-nulmeting.md § Recipe-first.

/** Slot identifier for recipe-first planning (breakfast, lunch, dinner, snack). */
export type RecipeCandidateSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * Single recipe candidate for placement in a meal plan slot.
 * Mirrors available signals from current DB (custom_meals, meal_history)
 * and future recipe catalog.
 */
export type RecipeCandidate = {
  id: string;
  title: string;
  mealSlot: RecipeCandidateSlot;
  /** NEVO-based refs; may be empty if requireIngredientRefs was false or coverage incomplete. */
  ingredientRefs?: MealIngredientRef[];
  /** From meal_data / NEVO rollup; optional. */
  estimatedMacros?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    saturatedFat?: number;
  };
  /** User rating 1–5 (e.g. from meal_history.user_rating). */
  rating?: number;
  /** Prep time in minutes (e.g. custom_meals.total_minutes). */
  prepTime?: number;
  /** Source label (e.g. 'custom_meals', 'meal_history', 'recipe_book'). */
  source?: string;
  /** Diet this candidate was stored/validated for (e.g. meal_history.diet_key). */
  dietKey?: string;
};

/**
 * Query input for fetching recipe candidates per slot.
 * All filters are optional except dietKey; slots and dateRange define scope.
 */
export type RecipeCandidateQuery = {
  /** Required: diet context for compliance and scoring. */
  dietKey: string;
  /** Slots to fetch candidates for (default all four). */
  slots: RecipeCandidateSlot[];
  /** Date range for plan (e.g. for usage/recency weighting). */
  dateRange: { from: string; to: string };
  /** Hard-block terms (user + guardrails); exclude recipes matching these. */
  excludeTerms: string[];
  /** Max candidates returned per slot (default 50). */
  maxCandidatesPerSlot?: number;
  /** If true, only return recipes that have ingredientRefs (NEVO). */
  requireIngredientRefs?: boolean;
  /** Optional: min share of expected slots with NEVO refs (0–1). */
  minCoverageScore?: number;
  /** If true, only return candidates that pass diet/guardrails compliance (default true). */
  includeOnlyCompliant?: boolean;
};

/**
 * Result of a recipe candidate query: candidates grouped by slot and optional stats.
 */
export type RecipeCandidateResult = {
  candidatesBySlot: Partial<Record<RecipeCandidateSlot, RecipeCandidate[]>>;
  stats: {
    totalFound: number;
    perSlotFound: Partial<Record<RecipeCandidateSlot, number>>;
    /** Count excluded by compliance check (if includeOnlyCompliant was true). */
    filteredByCompliance?: number;
    /** Count excluded by excludeTerms. */
    filteredByExcludeTerms?: number;
    /** Count skipped due to missing/incomplete ingredientRefs. */
    missingIngredientRefs?: number;
  };
};
