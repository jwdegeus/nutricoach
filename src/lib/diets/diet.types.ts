/**
 * Diet Types - Foundation for Meal Planning Agent
 * 
 * Defines the core types for diet profiles, rule sets, and agent contracts.
 * This is the source of truth for the meal planning agent's guard rails.
 */

/**
 * DietKey - String identifiers for diet types
 * These map to database diet_types.name but provide a stable API key
 */
export type DietKey =
  | "wahls_paleo_plus" // Wahls Paleo (therapeutic)
  | "keto" // Ketogenic diet
  | "mediterranean" // Mediterranean diet
  | "vegan" // Vegan diet
  | "balanced"; // Generic balanced diet (fallback)

/**
 * Constraint type - distinguishes hard rules from soft preferences
 */
export type ConstraintType = "hard" | "soft";

/**
 * Macro target range (for flexible calorie/macro planning)
 */
export type MacroRange = {
  min?: number;
  max?: number;
  target?: number; // Preferred target within range
};

/**
 * Prep time preference per meal slot
 */
export type PrepTimePreference = {
  breakfast?: number; // minutes
  lunch?: number;
  dinner?: number;
  snack?: number;
};

/**
 * Batch cooking preference
 */
export type BatchCookingPreference = {
  enabled: boolean;
  preferredDays?: string[]; // e.g., ["sunday", "wednesday"]
  maxBatchSize?: number; // number of servings to prep at once
};

/**
 * Budget preference (optional, for future use)
 */
export type BudgetPreference = {
  level: "low" | "medium" | "high" | "unlimited";
  maxPerMeal?: number; // optional max cost per meal
};

/**
 * Pantry usage preference
 */
export type PantryPreference = {
  prioritizeExisting: boolean; // Use pantry items first
  allowedCategories?: string[]; // Categories to prioritize
};

/**
 * Diet Profile - Input from onboarding
 * This is what the user fills in during onboarding
 */
export type DietProfile = {
  dietKey: DietKey;
  allergies: string[];
  dislikes: string[];
  calorieTarget: {
    min?: number;
    max?: number;
    target?: number;
  };
  macroTargets?: {
    protein?: MacroRange;
    carbs?: MacroRange;
    fat?: MacroRange;
  };
  prepPreferences: {
    maxPrepMinutes?: number; // Global max (fallback)
    perMeal?: PrepTimePreference; // Per-meal preferences
    batchCooking?: BatchCookingPreference;
  };
  budgetPreference?: BudgetPreference;
  pantryUsage?: PantryPreference;
  // Additional preferences that might affect meal planning
  servingsDefault?: number; // Default number of servings per meal
  varietyLevel?: "low" | "std" | "high"; // Affects weekly variety constraints
  strictness?: "strict" | "flexible"; // How strictly to enforce rules
  // Meal preferences per slot (as tags for multiple preferences)
  mealPreferences?: {
    breakfast?: string[]; // e.g., ["eiwit shake", "groene smoothie"]
    lunch?: string[]; // e.g., ["groene smoothie", "salade"]
    dinner?: string[]; // e.g., ["kip met groente", "vis"]
  };
};

/**
 * Ingredient constraint (for allowed/forbidden lists)
 */
export type IngredientConstraint = {
  type: "allowed" | "forbidden";
  items: string[]; // Ingredient names or tags
  categories?: string[]; // Ingredient categories
  constraintType: ConstraintType; // hard or soft
};

/**
 * Required category constraint (e.g., "veg_groups" for Wahls)
 */
export type RequiredCategoryConstraint = {
  category: string; // e.g., "veg_groups", "protein_sources"
  minPerDay?: number;
  minPerWeek?: number;
  items?: string[]; // Specific items that satisfy this category
  constraintType: ConstraintType;
};

/**
 * Per-meal constraint (e.g., min protein per meal slot)
 */
export type PerMealConstraint = {
  mealSlot: "breakfast" | "lunch" | "dinner" | "snack";
  minProtein?: number; // grams
  minCarbs?: number;
  minFat?: number;
  maxCalories?: number;
  requiredCategories?: string[]; // Categories that must be present
  constraintType: ConstraintType;
};

/**
 * Weekly variety constraint
 */
export type WeeklyVarietyConstraint = {
  maxRepeats?: number; // Max times same meal can appear in a week
  minUniqueMeals?: number; // Min unique meals per week
  excludeSimilar?: boolean; // Exclude similar meals (same base ingredients)
  constraintType: ConstraintType;
};

/**
 * Macro constraint (daily or per-meal)
 */
export type MacroConstraint = {
  scope: "daily" | "per_meal";
  maxCarbs?: number;
  maxSaturatedFat?: number;
  minProtein?: number;
  minFat?: number;
  allowedTypes?: string[]; // e.g., ["monosaccharides"] for SCD
  forbiddenTypes?: string[]; // e.g., ["polysaccharides"]
  constraintType: ConstraintType;
};

/**
 * Meal structure constraint (e.g., Wahls vegetable cups)
 */
export type MealStructureConstraint = {
  type: "vegetable_cups" | "meal_timing" | "meal_count";
  // For vegetable_cups (Wahls)
  vegetableCupsRequirement?: {
    totalCups: number;
    leafyCups: number;
    sulfurCups: number;
    coloredCups: number;
    leafyVegetables?: string[];
    sulfurVegetables?: string[];
    coloredVegetables?: string[];
  };
  // For meal_timing
  mealTiming?: {
    breakfast?: { min?: string; max?: string }; // HH:MM
    lunch?: { min?: string; max?: string };
    dinner?: { min?: string; max?: string };
  };
  // For meal_count
  mealCount?: {
    minPerDay?: number;
    maxPerDay?: number;
    requiredSlots?: string[];
  };
  constraintType: ConstraintType;
};

/**
 * Diet Rule Set - Guard rails for the agent
 * This is derived from DietProfile and contains all constraints
 * the agent must enforce when generating meal plans
 */
export type DietRuleSet = {
  dietKey: DietKey;
  
  // Ingredient constraints
  ingredientConstraints: IngredientConstraint[];
  
  // Category requirements
  requiredCategories: RequiredCategoryConstraint[];
  
  // Per-meal constraints
  perMealConstraints: PerMealConstraint[];
  
  // Weekly variety constraints
  weeklyVariety: WeeklyVarietyConstraint;
  
  // Macro constraints
  macroConstraints: MacroConstraint[];
  
  // Meal structure constraints
  mealStructure: MealStructureConstraint[];
  
  // Calorie target (from profile)
  calorieTarget: {
    min?: number;
    max?: number;
    target?: number;
  };
  
  // Prep time constraints
  prepTimeConstraints: {
    globalMax?: number;
    perMeal?: PrepTimePreference;
    batchCooking?: BatchCookingPreference;
  };
  
  // Budget constraints (optional)
  budgetConstraints?: BudgetPreference;
  
  // Pantry usage (optional)
  pantryUsage?: PantryPreference;
};

/**
 * Meal slot type
 */
export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

/**
 * Meal ingredient reference with NEVO code
 * This is the primary contract for ingredient selection - ingredients must come from NEVO database
 */
export type MealIngredientRef = {
  nevoCode: string; // NEVO code as string (for JSON schema compatibility)
  quantityG: number; // Amount in grams (min 1)
  displayName?: string; // Optional display name for UI
  tags?: string[]; // Optional tags for ingredient categorization (e.g., ["grains", "dairy"])
};

/**
 * Meal plan request - Input to the agent
 */
export type MealPlanRequest = {
  dateRange: {
    start: string; // ISO date string
    end: string; // ISO date string
  };
  slots: MealSlot[]; // Which meal slots to plan (e.g., ["breakfast", "lunch", "dinner"])
  profile: DietProfile; // User's diet profile from onboarding (source of truth)
  // Optional overrides
  excludeIngredients?: string[]; // Additional exclusions for this request
  preferIngredients?: string[]; // Preferred ingredients for this request
  maxPrepTime?: number; // Override global prep time
};

/**
 * Meal in a meal plan
 */
export type Meal = {
  id: string; // Unique identifier for this meal
  name: string; // Meal name
  slot: MealSlot;
  date: string; // ISO date string
  // Primary ingredient references (required) - must use NEVO codes from candidate pool
  ingredientRefs: MealIngredientRef[];
  // Legacy ingredients field (optional, for backward compatibility during migration)
  ingredients?: {
    name: string;
    amount: number;
    unit: string;
    tags?: string[]; // Optional tags for ingredient categorization (e.g., ["grains", "dairy"])
  }[];
  // Estimated nutrition (informative only - actual calculation happens server-side via NEVO)
  estimatedMacros?: {
    calories?: number;
    protein?: number; // grams
    carbs?: number; // grams
    fat?: number; // grams
    saturatedFat?: number; // grams
  };
  // Legacy nutrition field (optional, for backward compatibility)
  nutrition?: {
    calories?: number;
    protein?: number; // grams
    carbs?: number; // grams
    fat?: number; // grams
    saturatedFat?: number; // grams
  };
  prepTime?: number; // minutes
  servings?: number;
};

/**
 * Day in a meal plan
 */
export type MealPlanDay = {
  date: string; // ISO date string
  meals: Meal[];
  totalNutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    saturatedFat?: number;
  };
};

/**
 * Guard Rails vNext diagnostics (shadow mode)
 * Re-exported from recipe-ai.types for consistency
 */
export type GuardrailsVNextDiagnostics = {
  rulesetVersion: number;
  contentHash: string;
  outcome: 'allowed' | 'blocked' | 'warned';
  ok: boolean;
  reasonCodes: string[];
  counts: {
    matches: number;
    applied: number;
  };
};

/**
 * Meal plan response - Output from the agent
 */
export type MealPlanResponse = {
  requestId: string; // Reference to the request
  days: MealPlanDay[];
  metadata?: {
    generatedAt: string; // ISO timestamp
    dietKey: DietKey;
    totalDays: number;
    totalMeals: number;
    /** Guard Rails vNext diagnostics (shadow mode, optional) */
    guardrailsVnext?: GuardrailsVNextDiagnostics;
  };
};
