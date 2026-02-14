/**
 * Plan Edit Types
 *
 * Types for editing meal plans via chat/composer interface.
 */

export type PlanEditAction =
  | 'REPLACE_MEAL'
  | 'REGENERATE_DAY'
  | 'ADD_SNACK'
  | 'REMOVE_MEAL'
  | 'UPDATE_PANTRY';

export type PlanEditConstraints = {
  maxPrepMinutes?: number;
  targetCalories?: number;
  highProtein?: boolean;
  vegetarian?: boolean;
  avoidIngredients?: string[];
};

export type PlanEditPantryUpdate = {
  nevoCode: string;
  availableG?: number | null;
  isAvailable?: boolean;
};

export type PlanEdit = {
  action: PlanEditAction;
  planId: string;
  date?: string;
  mealSlot?: string;
  userIntentSummary: string;
  constraints?: PlanEditConstraints;
  pantryUpdates?: PlanEditPantryUpdate[];
  notes?: string[];
};
