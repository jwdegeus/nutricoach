/**
 * Meal Planner Shopping Schemas
 *
 * Zod validation schemas for pantry coverage and shopping list types.
 */

import { z } from 'zod';

/**
 * Pantry availability schema
 */
export const pantryAvailabilitySchema = z.object({
  nevoCode: z.string(),
  availableG: z.number().min(0).optional(),
  isAvailable: z.boolean().optional(),
});

export type PantryAvailabilityInput = z.infer<typeof pantryAvailabilitySchema>;

/**
 * Shopping list item schema
 */
export const shoppingListItemSchema = z.object({
  nevoCode: z.string(),
  name: z.string(),
  requiredG: z.number().min(0),
  availableG: z.number().min(0),
  missingG: z.number().min(0),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type ShoppingListItemInput = z.infer<typeof shoppingListItemSchema>;

/**
 * Shopping list group schema
 */
export const shoppingListGroupSchema = z.object({
  category: z.string(),
  items: z.array(shoppingListItemSchema),
});

export type ShoppingListGroupInput = z.infer<typeof shoppingListGroupSchema>;

/**
 * Meal ingredient coverage schema
 */
export const mealIngredientCoverageSchema = z.object({
  nevoCode: z.string(),
  name: z.string(),
  requiredG: z.number().min(0),
  availableG: z.number().min(0),
  missingG: z.number().min(0),
  inPantry: z.boolean(),
  tags: z.array(z.string()).optional(),
});

export type MealIngredientCoverageInput = z.infer<
  typeof mealIngredientCoverageSchema
>;

/**
 * Meal coverage schema
 */
export const mealCoverageSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO date format
  mealSlot: z.string(),
  mealTitle: z.string().optional(),
  ingredients: z.array(mealIngredientCoverageSchema),
});

export type MealCoverageInput = z.infer<typeof mealCoverageSchema>;

/**
 * Meal plan coverage schema
 */
export const mealPlanCoverageSchema = z.object({
  days: z.array(mealCoverageSchema),
  totals: z.object({
    requiredG: z.number().min(0),
    missingG: z.number().min(0),
    coveragePct: z.number().min(0).max(100),
  }),
});

export type MealPlanCoverageInput = z.infer<typeof mealPlanCoverageSchema>;

/**
 * Shopping list response schema
 */
export const shoppingListResponseSchema = z.object({
  groups: z.array(shoppingListGroupSchema),
  totals: z.object({
    items: z.number().min(0),
    requiredG: z.number().min(0),
    missingG: z.number().min(0),
  }),
});

export type ShoppingListResponseInput = z.infer<
  typeof shoppingListResponseSchema
>;
