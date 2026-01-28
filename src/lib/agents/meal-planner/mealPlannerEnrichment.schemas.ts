/**
 * Meal Planner Enrichment Schemas
 *
 * Zod validation schemas for meal enrichment types.
 */

import { z } from 'zod';
import { mealSlotSchema } from '@/src/lib/diets/diet.schemas';

/**
 * Enriched meal schema
 */
export const enrichedMealSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO date format
  mealSlot: mealSlotSchema.or(z.string()), // Allow string for flexibility
  title: z.string().min(3).max(80),
  instructions: z.array(z.string()).min(2).max(12),
  prepTimeMin: z.number().min(0).max(240),
  cookTimeMin: z.number().min(0).max(240),
  servings: z.number().min(1).optional(),
  kitchenNotes: z.array(z.string()).optional(),
  ingredientNevoCodesUsed: z.array(z.string()),
});

export type EnrichedMealInput = z.infer<typeof enrichedMealSchema>;

/**
 * Cook plan day schema
 */
export const cookPlanDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO date format
  steps: z.array(z.string()).min(1),
  estimatedTotalTimeMin: z.number().min(0).max(480), // Max 8 hours
});

export type CookPlanDayInput = z.infer<typeof cookPlanDaySchema>;

/**
 * Meal enrichment options schema
 */
export const mealEnrichmentOptionsSchema = z.object({
  allowPantryStaples: z.boolean().optional().default(false),
  maxInstructionSteps: z.number().min(2).max(12).optional().default(8),
});

export type MealEnrichmentOptionsInput = z.infer<
  typeof mealEnrichmentOptionsSchema
>;

/**
 * Meal plan enrichment response schema
 */
export const mealPlanEnrichmentResponseSchema = z.object({
  meals: z.array(enrichedMealSchema),
  cookPlanDays: z.array(cookPlanDaySchema),
});

export type MealPlanEnrichmentResponseInput = z.infer<
  typeof mealPlanEnrichmentResponseSchema
>;
