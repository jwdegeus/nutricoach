'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import {
  getStoreProductLink,
  getStoreProductLinksForStore,
  upsertStoreProductLink,
  deleteStoreProductLink,
  runAutoMatchByTitle,
  type AutoMatchResult,
} from '@/src/lib/shopping/storeProductLinks.service';
import { searchStoreProducts } from '@/src/lib/stores/storeProducts.service';
import type {
  StoreProductLinkResult,
  StoreProductDisplay,
} from '@/src/lib/shopping/storeProductLinks.types';
import {
  searchCanonicalIngredients,
  getCanonicalIngredientById,
} from '@/src/lib/ingredients/canonicalIngredients.service';
import type { CanonicalIngredient } from '@/src/lib/ingredients/canonicalIngredients.types';
import { getStoreProductById } from '@/src/lib/stores/storeProducts.service';
import { searchAlbertHeijnProducts } from '@/src/lib/pantry/sources/albert-heijn.adapter';

const MAX_CANONICAL_INGREDIENT_IDS = 200;

/** AH-zoekresultaat voor tonen in koppel-modal (geen koppeling mogelijk, alleen referentie). */
export type AhProductSuggestion = {
  name: string;
  brand: string;
  productUrl: string | null;
};

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * Get store product link for current user (ingredient + store).
 */
export async function getStoreProductLinkAction(options: {
  canonicalIngredientId: string;
  storeId: string;
}): Promise<ActionResult<StoreProductLinkResult | null>> {
  try {
    const data = await getStoreProductLink(options);
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getStoreProductLinkAction error', msg);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Kon link niet ophalen.' },
    };
  }
}

/**
 * Batch: get store product links for a store and many canonical ingredients (current user).
 * Dedupes and limits to 200 ids. Empty ids → [] without query.
 */
export async function getStoreProductLinksForStoreAction(options: {
  storeId: string;
  canonicalIngredientIds: string[];
}): Promise<ActionResult<StoreProductLinkResult[]>> {
  try {
    const ids = [...new Set(options.canonicalIngredientIds)]
      .filter((id) => typeof id === 'string' && id.trim() !== '')
      .slice(0, MAX_CANONICAL_INGREDIENT_IDS);
    if (ids.length === 0) return { ok: true, data: [] };
    const data = await getStoreProductLinksForStore({
      storeId: options.storeId,
      canonicalIngredientIds: ids,
    });
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getStoreProductLinksForStoreAction error', msg);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Links ophalen mislukt.' },
    };
  }
}

/**
 * Search store products by query (for "Kies product" modal).
 */
export async function searchStoreProductsAction(options: {
  storeId: string;
  q: string;
  limit?: number;
}): Promise<ActionResult<StoreProductDisplay[]>> {
  try {
    const data = await searchStoreProducts(options);
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('searchStoreProductsAction error', msg);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Zoeken mislukt.' },
    };
  }
}

/**
 * Zoek producten via Albert Heijn API (tweede bron in koppel-modal).
 * Alleen als referentie; koppelen kan alleen met geïmporteerde store_products.
 */
export async function searchAhProductsAction(
  q: string,
  limit = 10,
): Promise<ActionResult<AhProductSuggestion[]>> {
  const trimmed = q?.trim() ?? '';
  if (trimmed.length < 3) return { ok: true, data: [] };
  try {
    const result = await searchAlbertHeijnProducts(
      trimmed,
      Math.min(limit, 20),
    );
    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: 'AH_SEARCH',
          message: result.message ?? 'AH-zoekopdracht mislukt.',
        },
      };
    }
    const data: AhProductSuggestion[] = result.products.map((p) => ({
      name: p.name,
      brand: p.brand ?? '',
      productUrl: p.productUrl ?? null,
    }));
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('searchAhProductsAction error', msg);
    return { ok: false, error: { code: 'INTERNAL_ERROR', message: msg } };
  }
}

/**
 * Save user's product choice for an ingredient at a store.
 */
export async function upsertStoreProductLinkAction(options: {
  canonicalIngredientId: string;
  storeId: string;
  storeProductId: string;
}): Promise<ActionResult<StoreProductLinkResult | null>> {
  try {
    const data = await upsertStoreProductLink(options);
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('upsertStoreProductLinkAction error', msg);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Opslaan mislukt.' },
    };
  }
}

/**
 * Remove store product link for current user (ingredient + store).
 */
export async function deleteStoreProductLinkAction(options: {
  canonicalIngredientId: string;
  storeId: string;
}): Promise<ActionResult<boolean>> {
  try {
    const ok = await deleteStoreProductLink(options);
    return { ok: true, data: ok };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('deleteStoreProductLinkAction error', msg);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Verwijderen mislukt.' },
    };
  }
}

/**
 * Search canonical ingredients by name/slug (for admin ingredient–product links).
 */
export async function searchCanonicalIngredientsAction(options: {
  q: string;
  limit?: number;
}): Promise<ActionResult<CanonicalIngredient[]>> {
  try {
    const data = await searchCanonicalIngredients({
      q: options.q?.trim() ?? '',
      limit: options.limit ?? 25,
    });
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('searchCanonicalIngredientsAction error', msg);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Zoeken mislukt.' },
    };
  }
}

/**
 * Get one canonical ingredient by id (for pre-selection from ingredient page).
 */
export async function getCanonicalIngredientByIdAction(
  id: string,
): Promise<ActionResult<CanonicalIngredient | null>> {
  try {
    const data = await getCanonicalIngredientById(id?.trim() ?? '');
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getCanonicalIngredientByIdAction error', msg);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Ophalen mislukt.' },
    };
  }
}

/**
 * Get one store product by id (for pre-selection from store page).
 */
export async function getStoreProductByIdAction(
  productId: string,
): Promise<ActionResult<StoreProductDisplay | null>> {
  try {
    const data = await getStoreProductById(productId?.trim() ?? '');
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getStoreProductByIdAction error', msg);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Ophalen mislukt.' },
    };
  }
}

/**
 * List stores for current user (id + name) for shopping list "Kopen bij" scope.
 */
/**
 * Auto-match: create links where ingredient name and product title are the same.
 * Admin only. Returns { created, skipped }; one ingredient can get multiple links (per store).
 */
export async function runAutoMatchAction(): Promise<
  ActionResult<AutoMatchResult>
> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin)
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Geen rechten' } };
  const result = await runAutoMatchByTitle();
  if (result.error) {
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: result.error },
    };
  }
  return {
    ok: true,
    data: { created: result.created, skipped: result.skipped },
  };
}

export async function getStoresForShoppingAction(): Promise<
  ActionResult<{ id: string; name: string }[]>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Niet ingelogd.' },
      };
    }
    const { data, error } = await supabase
      .from('stores')
      .select('id, name')
      .eq('owner_id', user.id)
      .order('name');
    if (error) {
      console.error('getStoresForShopping error', error.message);
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: 'Winkels ophalen mislukt.' },
      };
    }
    const list = (data ?? []).map((r) => ({
      id: r.id as string,
      name: (r as { name: string }).name,
    }));
    return { ok: true, data: list };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getStoresForShoppingAction error', msg);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Winkels ophalen mislukt.' },
    };
  }
}
