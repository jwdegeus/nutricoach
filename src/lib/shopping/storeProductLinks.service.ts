/**
 * Store Product Links Service
 *
 * Server-only: get/upsert/delete ingredient ↔ store product link for current user.
 * Uses canonical_ingredient_id; no SELECT *; errors return null/false and log (no PII).
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import {
  type StoreProductLinkResult,
  mapStoreProductRowToDisplay,
} from './storeProductLinks.types';

const LINKS_TABLE = 'ingredient_store_product_links';
const LINKS_SELECT = 'id, store_product_id';
const LINKS_BATCH_SELECT = 'canonical_ingredient_id, store_product_id';
const STORE_PRODUCTS_TABLE = 'store_products';
const STORE_PRODUCTS_SELECT =
  'id, title, brand, product_url, price_cents, gtin, category_path, is_active';

const BATCH_IN_SIZE = 100;

/**
 * Get current user id; returns null if not authenticated.
 */
async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Resolve link row to full result with product display fields (second query).
 */
async function resolveLinkToResult(
  storeId: string,
  canonicalIngredientId: string,
  storeProductId: string,
): Promise<StoreProductLinkResult | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(STORE_PRODUCTS_TABLE)
    .select(STORE_PRODUCTS_SELECT)
    .eq('id', storeProductId)
    .maybeSingle();

  if (error) {
    console.error('Store product link: fetch product failed', error.message);
    return null;
  }
  if (!data) return null;
  const storeProduct = mapStoreProductRowToDisplay(
    data as Record<string, unknown>,
  );
  return {
    storeId,
    canonicalIngredientId,
    storeProduct,
  };
}

/**
 * Batch: get all store product links for current user + store and given canonical ingredient ids.
 * 1) Query links (canonical_ingredient_id, store_product_id); chunk .in() by BATCH_IN_SIZE.
 * 2) Query store_products for those ids; chunk .in() by BATCH_IN_SIZE.
 * Returns array of { canonicalIngredientId, storeProduct }; no SELECT *; uses mapStoreProductRowToDisplay.
 */
export async function getStoreProductLinksForStore(options: {
  storeId: string;
  canonicalIngredientIds: string[];
}): Promise<StoreProductLinkResult[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { storeId, canonicalIngredientIds } = options;
  const ids = [...new Set(canonicalIngredientIds)].filter(
    (id) => typeof id === 'string' && id.trim() !== '',
  );
  if (ids.length === 0) return [];

  const trimmedStoreId = storeId.trim();
  const results: StoreProductLinkResult[] = [];

  try {
    const supabase = await createClient();

    // 1) Fetch links in chunks
    const linkRows: {
      canonical_ingredient_id: string;
      store_product_id: string;
    }[] = [];
    for (let i = 0; i < ids.length; i += BATCH_IN_SIZE) {
      const batch = ids.slice(i, i + BATCH_IN_SIZE);
      const { data, error } = await supabase
        .from(LINKS_TABLE)
        .select(LINKS_BATCH_SELECT)
        .eq('store_id', trimmedStoreId)
        .eq('user_id', userId)
        .in('canonical_ingredient_id', batch);

      if (error) {
        console.error(
          'Store product links batch: links query failed',
          error.message,
        );
        return results;
      }
      for (const row of data ?? []) {
        const cid = row?.canonical_ingredient_id;
        const pid = row?.store_product_id;
        if (cid && pid)
          linkRows.push({
            canonical_ingredient_id: cid,
            store_product_id: pid,
          });
      }
    }

    const productIds = [...new Set(linkRows.map((r) => r.store_product_id))];
    if (productIds.length === 0) return results;

    // 2) Fetch products in chunks
    const productMap = new Map<
      string,
      ReturnType<typeof mapStoreProductRowToDisplay>
    >();
    for (let i = 0; i < productIds.length; i += BATCH_IN_SIZE) {
      const batch = productIds.slice(i, i + BATCH_IN_SIZE);
      const { data, error } = await supabase
        .from(STORE_PRODUCTS_TABLE)
        .select(STORE_PRODUCTS_SELECT)
        .in('id', batch);

      if (error) {
        console.error(
          'Store product links batch: products query failed',
          error.message,
        );
        return results;
      }
      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        const display = mapStoreProductRowToDisplay(r);
        productMap.set(display.id, display);
      }
    }

    for (const link of linkRows) {
      const storeProduct = productMap.get(link.store_product_id);
      if (storeProduct) {
        results.push({
          storeId: trimmedStoreId,
          canonicalIngredientId: link.canonical_ingredient_id,
          storeProduct,
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Store product links batch error', msg);
  }
  return results;
}

/**
 * Get store product link for current user (user_id = auth).
 * Returns null when not found, not logged in, or on error.
 */
export async function getStoreProductLink(options: {
  canonicalIngredientId: string;
  storeId: string;
}): Promise<StoreProductLinkResult | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { canonicalIngredientId, storeId } = options;
  if (!canonicalIngredientId?.trim() || !storeId?.trim()) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from(LINKS_TABLE)
      .select(LINKS_SELECT)
      .eq('canonical_ingredient_id', canonicalIngredientId.trim())
      .eq('store_id', storeId.trim())
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Store product link: get failed', error.message);
      return null;
    }
    if (!data?.store_product_id) return null;

    return resolveLinkToResult(
      storeId.trim(),
      canonicalIngredientId.trim(),
      data.store_product_id as string,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Store product link: get error', msg);
    return null;
  }
}

/**
 * Upsert store product link for current user.
 * Returns resolved link (same shape as get) or null on error.
 */
export async function upsertStoreProductLink(options: {
  canonicalIngredientId: string;
  storeId: string;
  storeProductId: string;
}): Promise<StoreProductLinkResult | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { canonicalIngredientId, storeId, storeProductId } = options;
  if (
    !canonicalIngredientId?.trim() ||
    !storeId?.trim() ||
    !storeProductId?.trim()
  ) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from(LINKS_TABLE).upsert(
      {
        user_id: userId,
        store_id: storeId.trim(),
        canonical_ingredient_id: canonicalIngredientId.trim(),
        store_product_id: storeProductId.trim(),
      },
      {
        onConflict: 'user_id,store_id,canonical_ingredient_id',
      },
    );

    if (error) {
      console.error('Store product link: upsert failed', error.message);
      return null;
    }

    return resolveLinkToResult(
      storeId.trim(),
      canonicalIngredientId.trim(),
      storeProductId.trim(),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Store product link: upsert error', msg);
    return null;
  }
}

/**
 * Delete store product link for current user.
 * Returns true on success, false when not logged in or on error.
 */
export async function deleteStoreProductLink(options: {
  canonicalIngredientId: string;
  storeId: string;
}): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const { canonicalIngredientId, storeId } = options;
  if (!canonicalIngredientId?.trim() || !storeId?.trim()) return false;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from(LINKS_TABLE)
      .delete()
      .eq('canonical_ingredient_id', canonicalIngredientId.trim())
      .eq('store_id', storeId.trim())
      .eq('user_id', userId);

    if (error) {
      console.error('Store product link: delete failed', error.message);
      return false;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Store product link: delete error', msg);
    return false;
  }
}

const CANONICAL_INGREDIENTS_TABLE = 'canonical_ingredients';
const STORES_TABLE = 'stores';

function normalizeTitle(s: string): string {
  return s.trim().toLowerCase();
}

export type AutoMatchResult = {
  created: number;
  skipped: number;
  error?: string;
};

/**
 * Auto-match: create ingredient ↔ product links when ingredient name and product title
 * are the same (after trim + toLowerCase). Only considers user's stores; only creates
 * links where none exist yet. One ingredient can get multiple links (one per store).
 */
export async function runAutoMatchByTitle(): Promise<AutoMatchResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { created: 0, skipped: 0, error: 'Niet ingelogd' };

  try {
    const supabase = await createClient();

    const { data: storeRows, error: storesErr } = await supabase
      .from(STORES_TABLE)
      .select('id')
      .eq('owner_id', userId);
    if (storesErr) {
      console.error('Auto-match: stores query failed', storesErr.message);
      return { created: 0, skipped: 0, error: storesErr.message };
    }
    const storeIds = (storeRows ?? [])
      .map((r) => (r as { id: string }).id)
      .filter(Boolean);
    if (storeIds.length === 0) return { created: 0, skipped: 0 };

    const { data: ingredientRows, error: ingErr } = await supabase
      .from(CANONICAL_INGREDIENTS_TABLE)
      .select('id, name');
    if (ingErr) {
      console.error('Auto-match: ingredients query failed', ingErr.message);
      return { created: 0, skipped: 0, error: ingErr.message };
    }
    const ingredients = (ingredientRows ?? []).map((r) => ({
      id: (r as { id: string }).id,
      name: (r as { name: string }).name,
    }));

    const { data: productRows, error: prodErr } = await supabase
      .from(STORE_PRODUCTS_TABLE)
      .select('id, store_id, title')
      .eq('is_active', true)
      .in('store_id', storeIds);
    if (prodErr) {
      console.error('Auto-match: products query failed', prodErr.message);
      return { created: 0, skipped: 0, error: prodErr.message };
    }
    const products = (productRows ?? []).map((r) => ({
      id: (r as { id: string }).id,
      store_id: (r as { store_id: string }).store_id,
      title: (r as { title: string }).title,
    }));

    const normToIngredient = new Map<string, { id: string }[]>();
    for (const ing of ingredients) {
      const n = normalizeTitle(ing.name);
      if (!n) continue;
      if (!normToIngredient.has(n)) normToIngredient.set(n, []);
      normToIngredient.get(n)!.push({ id: ing.id });
    }

    const candidates: {
      canonical_ingredient_id: string;
      store_id: string;
      store_product_id: string;
    }[] = [];
    const seenKey = new Set<string>();
    for (const p of products) {
      const n = normalizeTitle(p.title);
      if (!n) continue;
      const ings = normToIngredient.get(n);
      if (!ings?.length) continue;
      for (const ing of ings) {
        const key = `${ing.id}:${p.store_id}`;
        if (seenKey.has(key)) continue;
        seenKey.add(key);
        candidates.push({
          canonical_ingredient_id: ing.id,
          store_id: p.store_id,
          store_product_id: p.id,
        });
      }
    }

    const { data: existingRows, error: existErr } = await supabase
      .from(LINKS_TABLE)
      .select('canonical_ingredient_id, store_id')
      .eq('user_id', userId);
    if (existErr) {
      console.error(
        'Auto-match: existing links query failed',
        existErr.message,
      );
      return { created: 0, skipped: 0, error: existErr.message };
    }
    const existingKeys = new Set(
      (existingRows ?? []).map(
        (r) =>
          `${(r as { canonical_ingredient_id: string }).canonical_ingredient_id}:${(r as { store_id: string }).store_id}`,
      ),
    );

    const toInsert = candidates.filter(
      (c) => !existingKeys.has(`${c.canonical_ingredient_id}:${c.store_id}`),
    );
    let created = 0;
    for (const row of toInsert) {
      const { error: insErr } = await supabase.from(LINKS_TABLE).insert({
        user_id: userId,
        canonical_ingredient_id: row.canonical_ingredient_id,
        store_id: row.store_id,
        store_product_id: row.store_product_id,
      });
      if (insErr) {
        if (insErr.code === '23505') {
          existingKeys.add(`${row.canonical_ingredient_id}:${row.store_id}`);
          continue;
        }
        console.error('Auto-match: insert failed', insErr.message);
        continue;
      }
      created++;
    }
    const skipped = candidates.length - created;
    return { created, skipped };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Auto-match error', msg);
    return { created: 0, skipped: 0, error: msg };
  }
}
