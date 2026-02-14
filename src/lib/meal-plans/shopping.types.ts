/**
 * Meal Plan Shopping Types
 *
 * Types for pantry coverage and shopping list generation based on meal plan ingredientRefs.
 */

export type PantryAvailability = {
  nevoCode: string;
  availableG?: number;
  isAvailable?: boolean;
};

export type ShoppingListItem = {
  nevoCode: string;
  name: string;
  requiredG: number;
  availableG: number;
  missingG: number;
  category?: string;
  tags?: string[];
  canonicalIngredientId?: string;
};

export type ShoppingListGroup = {
  category: string;
  items: ShoppingListItem[];
};

export type MealIngredientCoverage = {
  nevoCode: string;
  name: string;
  requiredG: number;
  availableG: number;
  missingG: number;
  inPantry: boolean;
  tags?: string[];
};

export type MealCoverage = {
  date: string;
  mealSlot: string;
  mealTitle?: string;
  ingredients: MealIngredientCoverage[];
};

export type MealPlanCoverage = {
  days: MealCoverage[];
  totals: {
    requiredG: number;
    missingG: number;
    coveragePct: number;
  };
};

export type ShoppingListResponse = {
  groups: ShoppingListGroup[];
  totals: {
    items: number;
    requiredG: number;
    missingG: number;
  };
  missingCanonicalIngredientNevoCodes: string[];
};
