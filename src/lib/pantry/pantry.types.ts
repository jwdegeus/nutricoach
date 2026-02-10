/**
 * Pantry Types
 *
 * Types for pantry/inventory items: NEVO-based or external (barcode + source).
 */

/** Product source for external pantry items */
export type PantryItemSource = 'openfoodfacts' | 'albert_heijn';

/** User-defined pantry storage location (from user_pantry_locations) */
export type PantryLocation = {
  id: string;
  userId: string;
  name: string;
  sortOrder: number;
};

/**
 * Pantry item stored in database.
 * Either NEVO (nevoCode set) or external (barcode + source + displayName).
 */
export type PantryItem = {
  id: string;
  userId: string;
  /** NEVO code when item is linked to NEVO */
  nevoCode: string | null;
  /** Barcode (EAN/GTIN) for external items */
  barcode: string | null;
  /** Source for external items */
  source: PantryItemSource | null;
  /** Display name for external items (no NEVO lookup) */
  displayName: string | null;
  /** Product image URL (Vercel Blob or external) */
  imageUrl: string | null;
  /** Shop/product page URL for external items (e.g. Albert Heijn, Open Food Facts) */
  productUrl: string | null;
  /** User-defined storage location id (references user_pantry_locations) */
  storageLocationId: string | null;
  /** User-chosen grocery store where they buy this product */
  preferredStoreId: string | null;
  availableG: number | null;
  /** Number of pieces/items in stock (user-facing) */
  availablePieces: number | null;
  isAvailable: boolean;
  updatedAt: string;
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
 * Input for upserting a single pantry item.
 * Either nevoCode (NEVO item) or barcode + source + displayName (external item).
 */
export type UpsertPantryItemInput =
  | {
      nevoCode: string;
      barcode?: null;
      source?: null;
      displayName?: null;
      imageUrl?: string | null;
      productUrl?: string | null;
      storageLocationId?: string | null;
      preferredStoreId?: string | null;
      availableG?: number | null;
      isAvailable?: boolean;
    }
  | {
      nevoCode?: null;
      barcode: string;
      source: PantryItemSource;
      displayName: string;
      imageUrl?: string | null;
      productUrl?: string | null;
      storageLocationId?: string | null;
      preferredStoreId?: string | null;
      availableG?: number | null;
      isAvailable?: boolean;
    };

/**
 * Input for bulk upserting pantry items
 */
export type BulkUpsertPantryItemsInput = {
  items: UpsertPantryItemInput[];
};
