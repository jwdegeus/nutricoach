/**
 * Plan Edit Types
 * 
 * Types for editing meal plans via chat/composer interface.
 * Uses structured output from Gemini to ensure deterministic edits.
 */

/**
 * Plan edit action types
 */
export type PlanEditAction =
  | "REPLACE_MEAL" // Replace one meal in a plan
  | "REGENERATE_DAY" // Regenerate one day
  | "ADD_SNACK" // Add snack/smoothie to a day
  | "REMOVE_MEAL" // Remove a meal slot/snack
  | "UPDATE_PANTRY"; // Mark items as available / set availableG

/**
 * Plan edit constraints (optional overrides)
 */
export type PlanEditConstraints = {
  maxPrepMinutes?: number;
  targetCalories?: number;
  highProtein?: boolean;
  vegetarian?: boolean;
  avoidIngredients?: string[]; // Extra ad-hoc exclusions
};

/**
 * Pantry update item
 */
export type PlanEditPantryUpdate = {
  nevoCode: string;
  availableG?: number | null;
  isAvailable?: boolean;
};

/**
 * Plan edit - Structured edit instruction from chat
 * 
 * This is the output from Gemini's structured generation.
 * It's a strict object, not a freeform command.
 */
export type PlanEdit = {
  action: PlanEditAction;
  planId: string;
  date?: string; // YYYY-MM-DD (required for REPLACE_MEAL, REMOVE_MEAL, ADD_SNACK, REGENERATE_DAY)
  mealSlot?: string; // breakfast|lunch|dinner|snack|smoothie (required for REPLACE_MEAL, REMOVE_MEAL, ADD_SNACK)
  userIntentSummary: string; // 1 sentence summary for UI
  constraints?: PlanEditConstraints;
  pantryUpdates?: PlanEditPantryUpdate[]; // Required for UPDATE_PANTRY
  notes?: string[]; // Short rationale bullets
};
