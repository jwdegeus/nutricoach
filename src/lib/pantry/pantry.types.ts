/**
 * Pantry Types
 *
 * Types for pantry/inventory items stored per user on NEVO code level.
 */

/**
 * Pantry item stored in database
 */
export type PantryItem = {
  id: string;
  userId: string;
  nevoCode: string;
  availableG: number | null; // NULL means "binary available" (optional), otherwise quantity in grams
  isAvailable: boolean; // For binary pantry (can be used together with availableG)
  updatedAt: string; // ISO timestamp
};

/**
 * Pantry availability (used by shopping service)
 *
 * Supports both binary (isAvailable) and quantity-based (availableG) pantry models.
 * - If availableG is provided: use exact quantity
 * - Else if isAvailable === true: treat as "sufficient" (missingG = 0)
 * - Else: availableG = 0
 */
export type PantryAvailability = {
  nevoCode: string;
  availableG?: number;
  isAvailable?: boolean;
};

/**
 * Input for upserting a single pantry item
 */
export type UpsertPantryItemInput = {
  nevoCode: string;
  availableG?: number | null;
  isAvailable?: boolean;
};

/**
 * Input for bulk upserting pantry items
 */
export type BulkUpsertPantryItemsInput = {
  items: UpsertPantryItemInput[];
};
