/**
 * Pantry Schemas
 *
 * Zod validation schemas for pantry types.
 */

import { z } from 'zod';

/**
 * Pantry item schema
 */
export const pantryItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  nevoCode: z.string(),
  availableG: z.number().min(0).nullable(),
  isAvailable: z.boolean(),
  updatedAt: z.string(),
});

export type PantryItemInput = z.infer<typeof pantryItemSchema>;

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
 * Upsert pantry item input schema
 */
export const upsertPantryItemInputSchema = z.object({
  nevoCode: z.string(),
  availableG: z.number().min(0).nullable().optional(),
  isAvailable: z.boolean().optional(),
});

export type UpsertPantryItemInputSchema = z.infer<
  typeof upsertPantryItemInputSchema
>;

/**
 * Bulk upsert pantry items input schema
 */
export const bulkUpsertPantryItemsInputSchema = z.object({
  items: z.array(upsertPantryItemInputSchema).min(1),
});

export type BulkUpsertPantryItemsInputSchema = z.infer<
  typeof bulkUpsertPantryItemsInputSchema
>;
