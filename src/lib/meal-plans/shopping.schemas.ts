/**
 * Meal Plan Shopping Schemas
 */

import { z } from 'zod';

export const pantryAvailabilitySchema = z.object({
  nevoCode: z.string(),
  availableG: z.number().min(0).optional(),
  isAvailable: z.boolean().optional(),
});

export const shoppingListItemSchema = z.object({
  nevoCode: z.string(),
  name: z.string(),
  requiredG: z.number().min(0),
  availableG: z.number().min(0),
  missingG: z.number().min(0),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  canonicalIngredientId: z.string().uuid().optional(),
});

export const shoppingListGroupSchema = z.object({
  category: z.string(),
  items: z.array(shoppingListItemSchema),
});

export const mealIngredientCoverageSchema = z.object({
  nevoCode: z.string(),
  name: z.string(),
  requiredG: z.number().min(0),
  availableG: z.number().min(0),
  missingG: z.number().min(0),
  inPantry: z.boolean(),
  tags: z.array(z.string()).optional(),
});

export const mealCoverageSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealSlot: z.string(),
  mealTitle: z.string().optional(),
  ingredients: z.array(mealIngredientCoverageSchema),
});

export const mealPlanCoverageSchema = z.object({
  days: z.array(mealCoverageSchema),
  totals: z.object({
    requiredG: z.number().min(0),
    missingG: z.number().min(0),
    coveragePct: z.number().min(0).max(100),
  }),
});

export const shoppingListResponseSchema = z.object({
  groups: z.array(shoppingListGroupSchema),
  totals: z.object({
    items: z.number().min(0),
    requiredG: z.number().min(0),
    missingG: z.number().min(0),
  }),
  missingCanonicalIngredientNevoCodes: z.array(z.string()).default([]),
});
