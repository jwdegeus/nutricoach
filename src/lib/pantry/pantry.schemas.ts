/**
 * Pantry Schemas
 *
 * Zod validation schemas for pantry types.
 */

import { z } from 'zod';

const pantryItemSourceSchema = z.enum(['openfoodfacts', 'albert_heijn']);

/**
 * Pantry item schema (DB shape: nevo_code nullable, storage_location_id from user_pantry_locations)
 */
export const pantryItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  nevoCode: z.string().nullable(),
  barcode: z.string().nullable().optional(),
  source: pantryItemSourceSchema.nullable().optional(),
  displayName: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  productUrl: z.string().nullable().optional(),
  storageLocationId: z.string().uuid().nullable().optional(),
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
 * Upsert pantry item input schema.
 * Either nevoCode (NEVO) or barcode + source + displayName (external).
 */
export const upsertPantryItemInputSchema = z
  .object({
    nevoCode: z.string().nullable().optional(),
    barcode: z.string().nullable().optional(),
    source: z.enum(['openfoodfacts', 'albert_heijn']).nullable().optional(),
    displayName: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional().or(z.literal('')),
    productUrl: z.string().nullable().optional().or(z.literal('')),
    storageLocationId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .or(z.literal('')),
    preferredStoreId: z.string().uuid().nullable().optional().or(z.literal('')),
    availableG: z.number().min(0).nullable().optional(),
    isAvailable: z.boolean().optional(),
  })
  .transform((data) => ({
    ...data,
    preferredStoreId:
      data.preferredStoreId && data.preferredStoreId.trim() !== ''
        ? data.preferredStoreId.trim()
        : null,
    storageLocationId:
      data.storageLocationId && data.storageLocationId.trim() !== ''
        ? data.storageLocationId.trim()
        : null,
    imageUrl:
      data.imageUrl && data.imageUrl.trim() !== ''
        ? data.imageUrl.trim()
        : null,
    productUrl:
      data.productUrl && data.productUrl.trim() !== ''
        ? data.productUrl.trim()
        : null,
  }))
  .refine(
    (data) => {
      const hasNevo = data.nevoCode != null && data.nevoCode.trim() !== '';
      const hasExternal =
        data.barcode != null &&
        data.barcode.trim() !== '' &&
        data.source != null &&
        data.displayName != null &&
        data.displayName.trim() !== '';
      return (hasNevo && !hasExternal) || (!hasNevo && hasExternal);
    },
    {
      message:
        'Geef nevoCode (NEVO) of barcode + source + displayName (extern)',
    },
  );

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
