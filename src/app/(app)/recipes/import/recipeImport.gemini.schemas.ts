/**
 * Recipe Import Gemini Schemas
 *
 * Zod validation schemas for Gemini Vision API output.
 */

import { z } from 'zod';

/**
 * Ingredient schema from Gemini
 */
export const geminiIngredientSchema = z.object({
  original_line: z
    .string()
    .describe('Original ingredient line as it appears in the image'),
  quantity: z
    .number()
    .nullable()
    .describe('Numeric quantity if extractable, null otherwise'),
  unit: z
    .string()
    .nullable()
    .describe(
      "Unit of measurement if extractable (e.g., 'g', 'ml', 'cups'), null otherwise",
    ),
  name: z.string().describe('Ingredient name (normalized)'),
  note: z
    .string()
    .nullable()
    .describe('Optional note or additional information about the ingredient'),
});

/**
 * Instruction step schema from Gemini
 */
export const geminiInstructionStepSchema = z.object({
  step: z.number().int().min(1).describe('Step number (1-indexed)'),
  text: z.string().describe('Instruction text for this step'),
});

/**
 * Times schema from Gemini
 */
export const geminiTimesSchema = z.object({
  prep_minutes: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe('Preparation time in minutes'),
  cook_minutes: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe('Cooking time in minutes'),
  total_minutes: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe('Total time in minutes (prep + cook)'),
});

/**
 * Confidence schema from Gemini
 */
export const geminiConfidenceSchema = z.object({
  overall: z
    .number()
    .min(0)
    .max(100)
    .nullable()
    .describe('Overall confidence score (0-100)'),
  fields: z
    .record(z.string(), z.number().min(0).max(100))
    .optional()
    .describe('Field-specific confidence scores'),
});

/**
 * Gemini extracted recipe schema (strict output format)
 */
export const geminiExtractedRecipeSchema = z.object({
  title: z.string().min(1).describe('Recipe title/name'),
  language_detected: z
    .string()
    .nullable()
    .describe("Detected source language code (e.g., 'en', 'nl', 'de')"),
  translated_to: z
    .string()
    .nullable()
    .describe(
      'Target language code for translation (null if not translated yet)',
    ),
  servings: z.number().int().min(1).nullable().describe('Number of servings'),
  times: geminiTimesSchema.describe('Time information'),
  ingredients: z
    .array(geminiIngredientSchema)
    .min(1)
    .describe('List of ingredients (at least one required)'),
  instructions: z
    .array(geminiInstructionStepSchema)
    .min(1)
    .describe('List of cooking instructions (at least one required)'),
  confidence: geminiConfidenceSchema.optional().describe('Confidence scores'),
  warnings: z
    .array(z.string())
    .optional()
    .describe(
      'Optional warnings about extraction quality or missing information',
    ),
});

export type GeminiExtractedRecipe = z.infer<typeof geminiExtractedRecipeSchema>;
export type GeminiIngredient = z.infer<typeof geminiIngredientSchema>;
export type GeminiInstructionStep = z.infer<typeof geminiInstructionStepSchema>;
export type GeminiTimes = z.infer<typeof geminiTimesSchema>;
export type GeminiConfidence = z.infer<typeof geminiConfidenceSchema>;
