/**
 * Product source types
 *
 * Normalized types for products from external sources (Open Food Facts,
 * Albert Heijn, etc.) so the pantry UI is source-agnostic.
 */

/** Known product source identifiers (for admin config and display) */
export type ProductSourceId = 'openfoodfacts' | 'albert_heijn';

/**
 * Normalized product from any external source.
 * Used after barcode lookup or search.
 */
export type ExternalProduct = {
  /** Source of the data */
  source: ProductSourceId;
  /** Barcode (EAN/GTIN) when available */
  barcode: string | null;
  /** Display name */
  name: string;
  /** Brand(s), may be empty */
  brand: string;
  /** Nutri-Score grade A–E (uppercase), or null if unknown */
  nutriscoreGrade: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  /** Small image URL for thumbnails */
  imageUrl: string | null;
  /** Quantity string if on pack (e.g. "400 g") */
  quantity: string | null;
  /** Product page URL (e.g. AH webshop to order, OFF product page) */
  productUrl: string | null;
};

/**
 * Result of a product lookup (e.g. by barcode).
 * Either a product or a reason it was not found.
 */
export type ProductLookupResult =
  | { found: true; product: ExternalProduct }
  | {
      found: false;
      reason: 'not_found' | 'rate_limited' | 'error';
      message?: string;
    };

/**
 * Result of a product search (query).
 * List of products; may be empty due to no results or rate limit.
 */
export type ProductSearchResult =
  | { ok: true; products: ExternalProduct[] }
  | { ok: false; reason: 'rate_limited' | 'error'; message?: string };
