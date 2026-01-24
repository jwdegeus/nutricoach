/**
 * Diet Rules Types
 * Definieert de structuur van dieetregels voor mealplanning
 */

/**
 * Rule types die ondersteund worden
 */
export type DietRuleType =
  | "exclude_ingredient" // Uitsluiten van specifieke ingrediënten of categorieën
  | "require_ingredient" // Vereisen van specifieke ingrediënten
  | "macro_constraint" // Macro nutriënt constraints (carbs, fats, proteins)
  | "meal_structure"; // Structuur regels (aantal maaltijden, timing, etc.)

/**
 * Basis dieetregel structuur
 */
export type DietRule = {
  id: string;
  dietTypeId: string;
  ruleType: DietRuleType;
  ruleKey: string;
  ruleValue: unknown; // JSONB value - type depends on ruleType
  description: string | null;
  priority: number;
};

/**
 * Exclude ingredient rule value
 */
export type ExcludeIngredientRule = {
  excludedCategories?: string[]; // Bijv. ["vlees", "vis", "grains", "dairy"]
  excludedIngredients?: string[]; // Bijv. ["tarwe", "gluten", "tomato", "potato"]
};

/**
 * Require ingredient rule value
 */
export type RequireIngredientRule = {
  requiredIngredients?: string[]; // Bijv. ["liver", "heart", "flaxseed_oil"]
  frequency?: "daily" | "weekly" | "2x_weekly" | "monthly";
  minimumAmount?: number | string; // Amount required
  minAmountMl?: number; // Minimum amount in ml (for oils)
  maxAmountMl?: number; // Maximum amount in ml (for oils)
  recommendedIngredients?: string[]; // Recommended but not strictly required
  focus?: string; // Focus area (e.g., "high_nutrient_density")
  allowedSweeteners?: string[]; // SCD: ["honey"]
  forbiddenSweeteners?: string[]; // SCD: ["sugar", "maple_syrup"]
};

/**
 * Macro constraint rule value
 */
export type MacroConstraintRule = {
  maxCarbsPer100g?: number; // Max koolhydraten per 100g product
  dailyCarbLimit?: number; // Max koolhydraten per dag
  minFatPercentage?: number; // Min vet percentage van totale calorieën
  maxProteinPerKg?: number; // Max eiwit per kg lichaamsgewicht
  maxSaturatedFatGrams?: number; // Max verzadigd vet per dag (OMS: < 10g)
  allowedTypes?: string[]; // Toegestane koolhydraat types (SCD: ["monosaccharides"])
  forbiddenTypes?: string[]; // Verboden koolhydraat types
};

/**
 * Meal structure rule value
 */
export type MealStructureRule = {
  minMealsPerDay?: number;
  maxMealsPerDay?: number;
  requiredMealTypes?: string[]; // Bijv. ["ontbijt", "lunch", "diner"]
  mealTiming?: {
    breakfast?: { min?: string; max?: string }; // HH:MM format
    lunch?: { min?: string; max?: string };
    dinner?: { min?: string; max?: string };
  };
  // Wahls Paleo: Vegetable cups requirement
  vegetableCupsRequirement?: {
    totalCups: number;
    leafyCups: number;
    sulfurCups: number;
    coloredCups: number;
    leafyVegetables?: string[];
    sulfurVegetables?: string[];
    coloredVegetables?: string[];
  };
  // Low Histamine: Freshness requirement
  freshnessRequirement?: {
    maxLeftoverHours: number; // Leftovers > 24h forbidden
    meatRequirement: "fresh_or_flash_frozen" | "any";
    forbiddenStates?: string[]; // ["leftover_over_24h", "aged", "cured"]
  };
  // SCD: Permitted foods
  permittedFoods?: {
    permittedCategories?: string[];
    forbiddenCategories?: string[];
  };
};

/**
 * Helper type voor type-safe rule values
 */
export type DietRuleValue<T extends DietRuleType> = T extends "exclude_ingredient"
  ? ExcludeIngredientRule
  : T extends "require_ingredient"
  ? RequireIngredientRule
  : T extends "macro_constraint"
  ? MacroConstraintRule
  : T extends "meal_structure"
  ? MealStructureRule
  : unknown;
