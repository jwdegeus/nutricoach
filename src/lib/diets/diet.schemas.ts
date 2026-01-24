/**
 * Diet Schemas - Zod validation schemas for diet types
 * 
 * Provides runtime validation for diet profiles, rule sets, and agent contracts.
 */

import { z } from "zod";

// ============================================================================
// Base Schemas
// ============================================================================

const dietKeySchema = z.enum([
  "wahls_paleo_plus",
  "keto",
  "mediterranean",
  "vegan",
  "balanced",
]);

const constraintTypeSchema = z.enum(["hard", "soft"]);

export const mealSlotSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);

// ============================================================================
// Macro Range Schema
// ============================================================================

const macroRangeSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  target: z.number().optional(),
});

// ============================================================================
// Prep Preferences Schemas
// ============================================================================

const prepTimePreferenceSchema = z.object({
  breakfast: z.number().min(0).optional(),
  lunch: z.number().min(0).optional(),
  dinner: z.number().min(0).optional(),
  snack: z.number().min(0).optional(),
});

const batchCookingPreferenceSchema = z.object({
  enabled: z.boolean(),
  preferredDays: z.array(z.string()).optional(),
  maxBatchSize: z.number().min(1).optional(),
});

// ============================================================================
// Budget & Pantry Schemas
// ============================================================================

const budgetPreferenceSchema = z.object({
  level: z.enum(["low", "medium", "high", "unlimited"]),
  maxPerMeal: z.number().min(0).optional(),
});

const pantryPreferenceSchema = z.object({
  prioritizeExisting: z.boolean(),
  allowedCategories: z.array(z.string()).optional(),
});

// ============================================================================
// Diet Profile Schema
// ============================================================================

const prepPreferencesSchema = z.object({
  maxPrepMinutes: z.number().min(0).optional(),
  perMeal: prepTimePreferenceSchema.optional(),
  batchCooking: batchCookingPreferenceSchema.optional(),
});

export const dietProfileSchema = z.object({
  dietKey: dietKeySchema,
  allergies: z.array(z.string()),
  dislikes: z.array(z.string()),
  calorieTarget: z.object({
    min: z.number().min(0).optional(),
    max: z.number().min(0).optional(),
    target: z.number().min(0).optional(),
  }),
  macroTargets: z
    .object({
      protein: macroRangeSchema.optional(),
      carbs: macroRangeSchema.optional(),
      fat: macroRangeSchema.optional(),
    })
    .optional(),
  prepPreferences: prepPreferencesSchema,
  budgetPreference: budgetPreferenceSchema.optional(),
  pantryUsage: pantryPreferenceSchema.optional(),
  servingsDefault: z.number().min(1).max(10).optional(),
  varietyLevel: z.enum(["low", "std", "high"]).optional(),
  strictness: z.enum(["strict", "flexible"]).optional(),
  mealPreferences: z
    .object({
      breakfast: z.array(z.string()).optional(),
      lunch: z.array(z.string()).optional(),
      dinner: z.array(z.string()).optional(),
    })
    .optional(),
});

export type DietProfileInput = z.infer<typeof dietProfileSchema>;

// ============================================================================
// Diet Rule Set Schemas
// ============================================================================

const ingredientConstraintSchema = z.object({
  type: z.enum(["allowed", "forbidden"]),
  items: z.array(z.string()),
  categories: z.array(z.string()).optional(),
  constraintType: constraintTypeSchema,
});

const requiredCategoryConstraintSchema = z.object({
  category: z.string(),
  minPerDay: z.number().min(0).optional(),
  minPerWeek: z.number().min(0).optional(),
  items: z.array(z.string()).optional(),
  constraintType: constraintTypeSchema,
});

const perMealConstraintSchema = z.object({
  mealSlot: mealSlotSchema,
  minProtein: z.number().min(0).optional(),
  minCarbs: z.number().min(0).optional(),
  minFat: z.number().min(0).optional(),
  maxCalories: z.number().min(0).optional(),
  requiredCategories: z.array(z.string()).optional(),
  constraintType: constraintTypeSchema,
});

const weeklyVarietyConstraintSchema = z.object({
  maxRepeats: z.number().min(0).optional(),
  minUniqueMeals: z.number().min(0).optional(),
  excludeSimilar: z.boolean().optional(),
  constraintType: constraintTypeSchema,
});

const macroConstraintSchema = z.object({
  scope: z.enum(["daily", "per_meal"]),
  maxCarbs: z.number().min(0).optional(),
  maxSaturatedFat: z.number().min(0).optional(),
  minProtein: z.number().min(0).optional(),
  minFat: z.number().min(0).optional(),
  allowedTypes: z.array(z.string()).optional(),
  forbiddenTypes: z.array(z.string()).optional(),
  constraintType: constraintTypeSchema,
});

const mealStructureConstraintSchema = z.object({
  type: z.enum(["vegetable_cups", "meal_timing", "meal_count"]),
  vegetableCupsRequirement: z
    .object({
      totalCups: z.number().min(0),
      leafyCups: z.number().min(0),
      sulfurCups: z.number().min(0),
      coloredCups: z.number().min(0),
      leafyVegetables: z.array(z.string()).optional(),
      sulfurVegetables: z.array(z.string()).optional(),
      coloredVegetables: z.array(z.string()).optional(),
    })
    .optional(),
  mealTiming: z
    .object({
      breakfast: z
        .object({
          min: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
          max: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
        })
        .optional(),
      lunch: z
        .object({
          min: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
          max: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
        })
        .optional(),
      dinner: z
        .object({
          min: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
          max: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
        })
        .optional(),
    })
    .optional(),
  mealCount: z
    .object({
      minPerDay: z.number().min(1).optional(),
      maxPerDay: z.number().min(1).optional(),
      requiredSlots: z.array(z.string()).optional(),
    })
    .optional(),
  constraintType: constraintTypeSchema,
});

export const dietRuleSetSchema = z.object({
  dietKey: dietKeySchema,
  ingredientConstraints: z.array(ingredientConstraintSchema),
  requiredCategories: z.array(requiredCategoryConstraintSchema),
  perMealConstraints: z.array(perMealConstraintSchema),
  weeklyVariety: weeklyVarietyConstraintSchema,
  macroConstraints: z.array(macroConstraintSchema),
  mealStructure: z.array(mealStructureConstraintSchema),
  calorieTarget: z.object({
    min: z.number().min(0).optional(),
    max: z.number().min(0).optional(),
    target: z.number().min(0).optional(),
  }),
  prepTimeConstraints: z.object({
    globalMax: z.number().min(0).optional(),
    perMeal: prepTimePreferenceSchema.optional(),
    batchCooking: batchCookingPreferenceSchema.optional(),
  }),
  budgetConstraints: budgetPreferenceSchema.optional(),
  pantryUsage: pantryPreferenceSchema.optional(),
});

export type DietRuleSetInput = z.infer<typeof dietRuleSetSchema>;

// ============================================================================
// Meal Plan Request Schema
// ============================================================================

export const mealPlanRequestSchema = z.object({
  dateRange: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO date format
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  slots: z.array(mealSlotSchema).min(1),
  profile: dietProfileSchema, // Diet profile from onboarding (source of truth)
  excludeIngredients: z.array(z.string()).optional(),
  preferIngredients: z.array(z.string()).optional(),
  maxPrepTime: z.number().min(0).optional(),
});

export type MealPlanRequestInput = z.infer<typeof mealPlanRequestSchema>;

// ============================================================================
// Meal Plan Response Schema
// ============================================================================

// Meal ingredient reference schema (primary contract)
const mealIngredientRefSchema = z.object({
  nevoCode: z.string(), // NEVO code as string
  quantityG: z.number().min(1), // Amount in grams (min 1)
  displayName: z.string().optional(), // Optional display name
  tags: z.array(z.string()).optional(), // Optional tags for categorization
});

// Legacy ingredient schema (optional, for backward compatibility)
const ingredientSchema = z.object({
  name: z.string(),
  amount: z.number().min(0),
  unit: z.string(),
  tags: z.array(z.string()).optional(), // Optional tags for ingredient categorization
});

// Estimated macros schema (informative only - actual calculation happens server-side)
const estimatedMacrosSchema = z.object({
  calories: z.number().min(0).optional(),
  protein: z.number().min(0).optional(),
  carbs: z.number().min(0).optional(),
  fat: z.number().min(0).optional(),
  saturatedFat: z.number().min(0).optional(),
});

// Legacy nutrition schema (optional, for backward compatibility)
const nutritionSchema = z.object({
  calories: z.number().min(0).optional(),
  protein: z.number().min(0).optional(),
  carbs: z.number().min(0).optional(),
  fat: z.number().min(0).optional(),
  saturatedFat: z.number().min(0).optional(),
});

const mealSchema = z.object({
  id: z.string(),
  name: z.string(),
  slot: mealSlotSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Primary ingredient references (required)
  ingredientRefs: z.array(mealIngredientRefSchema).min(1),
  // Legacy ingredients field (optional, for backward compatibility)
  ingredients: z.array(ingredientSchema).optional(),
  // Estimated macros (informative only)
  estimatedMacros: estimatedMacrosSchema.optional(),
  // Legacy nutrition field (optional, for backward compatibility)
  nutrition: nutritionSchema.optional(),
  prepTime: z.number().min(0).optional(),
  servings: z.number().min(1).optional(),
});

const mealPlanDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meals: z.array(mealSchema),
  // Legacy totalNutrition field (optional, for backward compatibility)
  totalNutrition: nutritionSchema.optional(),
  // Estimated total macros (informative only - actual calculation happens server-side)
  estimatedTotalMacros: estimatedMacrosSchema.optional(),
});

// Schema for single day generation (used in partial regenerate)
export const mealPlanDayResponseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meals: z.array(mealSchema),
  // Estimated total macros (informative only - actual calculation happens server-side)
  estimatedTotalMacros: estimatedMacrosSchema.optional(),
});

// Schema for single meal generation (used in slot-only replace/add)
export const mealResponseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal: mealSchema,
});

export const mealPlanResponseSchema = z.object({
  requestId: z.string(),
  days: z.array(mealPlanDaySchema),
  metadata: z
    .object({
      generatedAt: z.string(), // ISO timestamp
      dietKey: dietKeySchema,
      totalDays: z.number().min(1),
      totalMeals: z.number().min(1),
    })
    .optional(),
});

export type MealPlanResponseInput = z.infer<typeof mealPlanResponseSchema>;
export type MealPlanDayResponse = z.infer<typeof mealPlanDayResponseSchema>;
export type MealResponse = z.infer<typeof mealResponseSchema>;
