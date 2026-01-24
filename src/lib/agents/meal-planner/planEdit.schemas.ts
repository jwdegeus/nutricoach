/**
 * Plan Edit Schemas
 * 
 * Zod schemas for validating plan edits and chat messages.
 * Also exports JSON schemas for Gemini structured output.
 */

import { z } from "zod";

/**
 * Plan edit constraints schema
 */
const planEditConstraintsSchema = z.object({
  maxPrepMinutes: z.number().min(0).optional(),
  targetCalories: z.number().min(0).optional(),
  highProtein: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  avoidIngredients: z.array(z.string()).optional(),
});

/**
 * Pantry update item schema
 */
const planEditPantryUpdateSchema = z.object({
  nevoCode: z.string(),
  availableG: z.number().min(0).nullable().optional(),
  isAvailable: z.boolean().optional(),
});

/**
 * Plan edit action enum
 */
const planEditActionSchema = z.enum([
  "REPLACE_MEAL",
  "REGENERATE_DAY",
  "ADD_SNACK",
  "REMOVE_MEAL",
  "UPDATE_PANTRY",
]);

/**
 * Plan edit schema
 * 
 * Validates plan edits with conditional requirements:
 * - REPLACE_MEAL/REMOVE_MEAL/ADD_SNACK: date + mealSlot required
 * - REGENERATE_DAY: date required
 * - UPDATE_PANTRY: pantryUpdates required (min 1)
 */
export const planEditSchema = z
  .object({
    action: planEditActionSchema,
    planId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    mealSlot: z.string().optional(),
    userIntentSummary: z.string().min(1).max(200),
    constraints: planEditConstraintsSchema.optional(),
    pantryUpdates: z.array(planEditPantryUpdateSchema).optional(),
    notes: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      // REPLACE_MEAL, REMOVE_MEAL, ADD_SNACK require date + mealSlot
      if (
        data.action === "REPLACE_MEAL" ||
        data.action === "REMOVE_MEAL" ||
        data.action === "ADD_SNACK"
      ) {
        return !!data.date && !!data.mealSlot;
      }
      return true;
    },
    {
      message:
        "date and mealSlot are required for REPLACE_MEAL, REMOVE_MEAL, and ADD_SNACK actions",
      path: ["date"],
    }
  )
  .refine(
    (data) => {
      // REGENERATE_DAY requires date
      if (data.action === "REGENERATE_DAY") {
        return !!data.date;
      }
      return true;
    },
    {
      message: "date is required for REGENERATE_DAY action",
      path: ["date"],
    }
  )
  .refine(
    (data) => {
      // UPDATE_PANTRY requires pantryUpdates (min 1)
      if (data.action === "UPDATE_PANTRY") {
        return data.pantryUpdates && data.pantryUpdates.length > 0;
      }
      return true;
    },
    {
      message: "pantryUpdates (min 1) is required for UPDATE_PANTRY action",
      path: ["pantryUpdates"],
    }
  );

export type PlanEditInput = z.infer<typeof planEditSchema>;

/**
 * Chat message schema
 */
export const planChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export type PlanChatMessage = z.infer<typeof planChatMessageSchema>;

/**
 * Chat request schema
 */
export const planChatRequestSchema = z.object({
  planId: z.string().uuid(),
  messages: z.array(planChatMessageSchema).min(1),
});

export type PlanChatRequest = z.infer<typeof planChatRequestSchema>;
