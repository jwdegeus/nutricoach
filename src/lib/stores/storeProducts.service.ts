/**
 * Store Products Service
 *
 * Server-only: search store_products per store for "choose product" flows.
 * Minimal columns; no SELECT *; errors return [] and log (no PII).
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import type { StoreProductDisplay } from '@/src/lib/shopping/storeProductLinks.types';
import { mapStoreProductRowToDisplay } from '@/src/lib/shopping/storeProductLinks.types';

const STORE_PRODUCTS_TABLE = 'store_products';
const STORE_PRODUCTS_SELECT =
  'id, title, brand, product_url, price_cents, gtin, category_path, is_active';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** Sanitize query for ILIKE: remove wildcards so pattern is literal (avoids full scan). */
function patternForIlike(q: string): string {
  const sanitized = q.replace(/%/g, '').replace(/_/g, '');
  return `%${sanitized}%`;
}

/**
 * Search store products by title and brand (ILIKE).
 * Two queries merged and deduped by id; same pattern as canonical ingredient search.
 */
export async function searchStoreProducts(options: {
  storeId: string;
  q: string;
  limit?: number;
  includeInactive?: boolean;
}): Promise<StoreProductDisplay[]> {
  const trimmed = options.q?.trim() ?? '';
  if (!trimmed) return [];

  const limit = Math.min(
    Math.max(1, options.limit ?? DEFAULT_LIMIT),
    MAX_LIMIT,
  );
  const storeId = options.storeId?.trim();
  if (!storeId) return [];

  const pattern = patternForIlike(trimmed);
  const includeInactive = options.includeInactive === true;

  try {
    const supabase = await createClient();
    const base = supabase
      .from(STORE_PRODUCTS_TABLE)
      .select(STORE_PRODUCTS_SELECT)
      .eq('store_id', storeId);
    const withActive = includeInactive ? base : base.eq('is_active', true);

    const byBrandBuilder = supabase
      .from(STORE_PRODUCTS_TABLE)
      .select(STORE_PRODUCTS_SELECT)
      .eq('store_id', storeId)
      .ilike('brand', pattern)
      .limit(limit);
    const byBrandWithActive = includeInactive
      ? byBrandBuilder
      : byBrandBuilder.eq('is_active', true);

    const [byTitle, byBrand] = await Promise.all([
      withActive.ilike('title', pattern).limit(limit),
      byBrandWithActive,
    ]);

    if (byTitle.error) {
      console.error(
        'Store products search (title) failed',
        byTitle.error.message,
      );
      return [];
    }
    if (byBrand.error) {
      console.error(
        'Store products search (brand) failed',
        byBrand.error.message,
      );
      return [];
    }

    const byId = new Map<string, StoreProductDisplay>();
    for (const row of (byTitle.data ?? []) as Record<string, unknown>[]) {
      const id = row.id as string;
      if (!byId.has(id)) byId.set(id, mapStoreProductRowToDisplay(row));
    }
    for (const row of (byBrand.data ?? []) as Record<string, unknown>[]) {
      const id = row.id as string;
      if (!byId.has(id)) byId.set(id, mapStoreProductRowToDisplay(row));
    }
    return Array.from(byId.values()).slice(0, limit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Store products search error', msg);
    return [];
  }
}

/**
 * Get one store product by id (for display when linking from store page).
 */
export async function getStoreProductById(
  productId: string,
): Promise<StoreProductDisplay | null> {
  if (!productId?.trim()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from(STORE_PRODUCTS_TABLE)
      .select(STORE_PRODUCTS_SELECT)
      .eq('id', productId.trim())
      .maybeSingle();
    if (error) {
      console.error('Store product getById failed', error.message);
      return null;
    }
    if (!data) return null;
    return mapStoreProductRowToDisplay(data as Record<string, unknown>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Store product getById error', msg);
    return null;
  }
}
