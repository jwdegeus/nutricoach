/**
 * Recipe Import Schemas
 *
 * Zod validation schemas for recipe import types.
 */

import { z } from 'zod';

/**
 * Recipe import status schema
 */
export const recipeImportStatusSchema = z.enum([
  'uploaded',
  'processing',
  'ready_for_review',
  'failed',
  'finalized',
]);

/**
 * Source image metadata schema
 */
export const sourceImageMetaSchema = z.object({
  filename: z.string().optional(),
  size: z.number().int().min(0).optional(),
  mimetype: z.string().optional(),
  width: z.number().int().min(0).optional(),
  height: z.number().int().min(0).optional(),
});

/**
 * Create recipe import input schema
 */
export const createRecipeImportInputSchema = z.object({
  sourceImagePath: z.string().optional(),
  sourceImageMeta: sourceImageMetaSchema.optional(),
  sourceLocale: z.string().nullable().optional(),
  targetLocale: z.string().nullable().optional(),
});

/**
 * Load recipe import input schema
 */
export const loadRecipeImportInputSchema = z.object({
  jobId: z.string().uuid('jobId must be a valid UUID'),
});

/**
 * Update recipe import status input schema
 */
export const updateRecipeImportStatusInputSchema = z.object({
  jobId: z.string().uuid('jobId must be a valid UUID'),
  status: recipeImportStatusSchema,
  errorMessage: z.string().optional(),
});

/**
 * Import recipe from URL input schema
 */
export const importRecipeFromUrlInputSchema = z.object({
  url: z
    .string()
    .min(1, 'URL is verplicht')
    .max(2048, 'URL mag maximaal 2048 tekens lang zijn')
    .refine(
      (url) => {
        const trimmed = url.trim();
        return trimmed.startsWith('http://') || trimmed.startsWith('https://');
      },
      {
        message: 'URL moet beginnen met http:// of https://',
      },
    )
    .transform((url) => url.trim()),
});
