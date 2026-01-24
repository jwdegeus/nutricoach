/**
 * Diet Module - Barrel exports
 * 
 * Central export point for all diet-related types, schemas, and functions.
 * This module provides the foundation for the meal planning agent.
 */

// Types
export type {
  DietKey,
  DietProfile,
  DietRuleSet,
  MealPlanRequest,
  MealPlanResponse,
  MealPlanDay,
  Meal,
  MealSlot,
  MealIngredientRef,
  ConstraintType,
  MacroRange,
  PrepTimePreference,
  BatchCookingPreference,
  BudgetPreference,
  PantryPreference,
  IngredientConstraint,
  RequiredCategoryConstraint,
  PerMealConstraint,
  WeeklyVarietyConstraint,
  MacroConstraint,
  MealStructureConstraint,
} from "./diet.types";

// Schemas
export {
  dietProfileSchema,
  dietRuleSetSchema,
  mealPlanRequestSchema,
  mealPlanResponseSchema,
  mealPlanDayResponseSchema,
  mealResponseSchema,
} from "./diet.schemas";

export type {
  DietProfileInput,
  DietRuleSetInput,
  MealPlanRequestInput,
  MealPlanResponseInput,
  MealPlanDayResponse,
  MealResponse,
} from "./diet.schemas";

// Functions
export { deriveDietRuleSet } from "./diet-rules";
