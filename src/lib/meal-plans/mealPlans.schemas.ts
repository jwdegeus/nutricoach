/**
 * Meal Plans Schemas
 *
 * Zod schemas for meal plan persistence.
 */

import { z } from 'zod';
import {
  mealPlanRequestSchema,
  mealPlanResponseSchema,
  dietRuleSetSchema,
} from '@/src/lib/diets';
import type { MealPlanEnrichmentResponse } from '@/src/lib/agents/meal-planner';
import { mealPlanEnrichmentResponseSchema } from '@/src/lib/agents/meal-planner';

/**
 * Schema for create meal plan input
 */
export const createMealPlanInputSchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int().min(1).max(30),
  calorieTarget: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      target: z.number().optional(),
    })
    .optional(),
});

/**
 * Schema for regenerate meal plan input
 */
export const regenerateMealPlanInputSchema = z.object({
  planId: z.string().uuid(),
  onlyDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
