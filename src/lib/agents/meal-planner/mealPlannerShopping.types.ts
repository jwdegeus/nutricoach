/**
 * Meal Planner Shopping Types
 *
 * Types for pantry coverage and shopping list generation based on meal plan ingredientRefs.
 */

/**
 * Pantry availability for an ingredient
 *
 * Supports both binary (isAvailable) and quantity-based (availableG) pantry models.
 * - If availableG is provided: use exact quantity
 * - Else if isAvailable === true: treat as "sufficient" (missingG = 0)
 * - Else: availableG = 0
 */
export type PantryAvailability = {
  nevoCode: string;
  availableG?: number; // Available quantity in grams (if quantity-based pantry)
  isAvailable?: boolean; // Binary availability (if binary pantry)
};

/**
 * Shopping list item (aggregated over all meals/days)
 */
export type ShoppingListItem = {
  nevoCode: string;
  name: string; // Display name from NEVO
  requiredG: number; // Total required quantity across all meals
  availableG: number; // Available quantity in pantry
  missingG: number; // Missing quantity (max(requiredG - availableG, 0))
  category?: string; // Category for grouping (e.g., "Groente", "Eiwit")
  tags?: string[]; // Optional tags from NEVO
  /** Canonical ingredient id (canonical_ingredients.id) when known; for pantry/store linking */
  canonicalIngredientId?: string;
};

/**
 * Shopping list grouped by category
 */
export type ShoppingListGroup = {
  category: string; // Category name (e.g., "Groente", "Eiwit", "Overig")
  items: ShoppingListItem[]; // Items in this category
};

/**
 * Ingredient coverage for a single ingredient in a meal
 */
export type MealIngredientCoverage = {
  nevoCode: string;
  name: string; // Display name from NEVO
  requiredG: number; // Required quantity for this meal
  availableG: number; // Available quantity in pantry
  missingG: number; // Missing quantity
  inPantry: boolean; // Whether ingredient is (partially) available
  tags?: string[]; // Optional tags from NEVO
};

/**
 * Coverage for a single meal
 */
export type MealCoverage = {
  date: string; // ISO date (YYYY-MM-DD)
  mealSlot: string; // "breakfast" | "lunch" | "dinner" | "snack"
  mealTitle?: string; // Optional meal name
  ingredients: MealIngredientCoverage[]; // Coverage per ingredient
};

/**
 * Coverage for entire meal plan
 */
export type MealPlanCoverage = {
  days: MealCoverage[]; // Coverage per day/meal
  totals: {
    requiredG: number; // Total required quantity across all ingredients
    missingG: number; // Total missing quantity
    coveragePct: number; // Coverage percentage (0-100, rounded to 1 decimal)
  };
};

/**
 * Shopping list response (aggregated and grouped)
 */
export type ShoppingListResponse = {
  groups: ShoppingListGroup[]; // Groups sorted alphabetically by category
  totals: {
    items: number; // Total number of unique items
    requiredG: number; // Total required quantity
    missingG: number; // Total missing quantity
  };
  /** NEVO codes that have no canonical_ingredients mapping yet (for admin backfill workflow) */
  missingCanonicalIngredientNevoCodes: string[];
};
