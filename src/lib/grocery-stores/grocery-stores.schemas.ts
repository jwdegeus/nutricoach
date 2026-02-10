/**
 * Grocery Stores Schemas
 *
 * Zod validation for create/update inputs.
 */

import { z } from 'zod';

const NAME_MAX = 200;
const ADDRESS_MAX = 500;
const NOTES_MAX = 1000;
const URL_MAX = 500;
const CUTOFF_MAX = 500;

export const createGroceryStoreInputSchema = z
  .object({
    name: z.string().min(1, 'Naam is verplicht').max(NAME_MAX).trim(),
    address: z.string().max(ADDRESS_MAX).trim().optional().or(z.literal('')),
    notes: z.string().max(NOTES_MAX).trim().optional().or(z.literal('')),
    websiteUrl: z.string().max(URL_MAX).trim().optional().or(z.literal('')),
    cutoffTimes: z.string().max(CUTOFF_MAX).trim().optional().or(z.literal('')),
  })
  .transform((data) => ({
    name: data.name,
    address:
      data.address && data.address.trim() !== '' ? data.address.trim() : null,
    notes: data.notes && data.notes.trim() !== '' ? data.notes.trim() : null,
    websiteUrl:
      data.websiteUrl && data.websiteUrl.trim() !== ''
        ? data.websiteUrl.trim()
        : null,
    cutoffTimes:
      data.cutoffTimes && data.cutoffTimes.trim() !== ''
        ? data.cutoffTimes.trim()
        : null,
  }));

export type CreateGroceryStoreInput = z.infer<
  typeof createGroceryStoreInputSchema
>;

export const updateGroceryStoreInputSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht').max(NAME_MAX).trim().optional(),
  address: z.string().max(ADDRESS_MAX).trim().optional().nullable(),
  notes: z.string().max(NOTES_MAX).trim().optional().nullable(),
  websiteUrl: z.string().max(URL_MAX).trim().optional().nullable(),
  cutoffTimes: z.string().max(CUTOFF_MAX).trim().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateGroceryStoreInput = z.infer<
  typeof updateGroceryStoreInputSchema
>;

export const orderStatusSchema = z.enum(['active', 'completed', 'cancelled']);
export type OrderStatusInput = z.infer<typeof orderStatusSchema>;

export const createGroceryStoreOrderInputSchema = z.object({
  storeId: z.string().uuid(),
  orderDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum formaat: YYYY-MM-DD'),
  deliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable()
    .or(z.literal('')),
  status: orderStatusSchema.default('active'),
  notes: z
    .string()
    .max(NOTES_MAX)
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
});

export type CreateGroceryStoreOrderInput = z.infer<
  typeof createGroceryStoreOrderInputSchema
>;

export const updateGroceryStoreOrderInputSchema = z.object({
  orderDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  deliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  status: orderStatusSchema.optional(),
  notes: z.string().max(NOTES_MAX).trim().optional().nullable(),
});

export type UpdateGroceryStoreOrderInput = z.infer<
  typeof updateGroceryStoreOrderInputSchema
>;
