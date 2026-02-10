'use server';

import { createClient } from '@/src/lib/supabase/server';
import { searchNevoFoods } from '@/src/lib/nevo/nutrition-calculator';
import { PantryService } from '@/src/lib/pantry/pantry.service';
import type { PantryItem } from '@/src/lib/pantry/pantry.types';
import { storageService } from '@/src/lib/storage/storage.service';
import {
  lookupProductByBarcode,
  searchProducts,
  type ExternalProduct,
} from '@/src/lib/pantry/sources';
import {
  upsertPantryItemAction,
  bulkUpsertPantryItemsAction,
} from './pantry.actions';

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR';
        message: string;
      };
    };

/**
 * Look up product by barcode via Open Food Facts.
 * Used after barcode scan or manual barcode entry.
 *
 * @param barcode - EAN/GTIN barcode string
 * @returns Product if found, or error/not_found
 */
export async function lookupProductByBarcodeAction(
  barcode: string,
): Promise<
  ActionResult<
    | { found: true; product: ExternalProduct }
    | { found: false; message: string }
  >
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om producten op te zoeken',
        },
      };
    }

    if (!barcode || barcode.trim().length === 0) {
      return {
        ok: true,
        data: { found: false, message: 'Geen barcode opgegeven' },
      };
    }

    const result = await lookupProductByBarcode(barcode.trim());

    if (result.found) {
      return { ok: true, data: { found: true, product: result.product } };
    }

    const message =
      result.reason === 'not_found'
        ? 'Product niet gevonden voor deze barcode'
        : (result.message ?? 'Lookup mislukt');
    return { ok: true, data: { found: false, message } };
  } catch (error) {
    console.error('Error looking up barcode:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij opzoeken product',
      },
    };
  }
}

/**
 * Search external product sources (currently Open Food Facts only).
 * Rate limit OFF: 10 req/min – trigger only on explicit button click, not on type.
 *
 * @param query - Search term
 * @returns Products or rate_limited/error
 */
export async function searchExternalProductsAction(
  query: string,
): Promise<
  | ActionResult<{ products: ExternalProduct[] }>
  | ActionResult<{ rateLimited: true; message: string }>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om te zoeken',
        },
      };
    }

    const result = await searchProducts(query.trim(), 10);
    if (result.ok) {
      return { ok: true, data: { products: result.products } };
    }
    if (result.reason === 'rate_limited') {
      return {
        ok: true,
        data: {
          rateLimited: true,
          message:
            result.message ??
            'Te veel zoekverzoeken. Probeer over een minuut opnieuw.',
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: result.message ?? 'Zoeken mislukt',
      },
    };
  } catch (error) {
    console.error('Error searching external products:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Fout bij zoeken',
      },
    };
  }
}

/**
 * Search NEVO foods by query
 *
 * @param query - Search term
 * @returns Array of NEVO foods with nevoCode and name
 */
export async function searchNevoFoodsAction(
  query: string,
): Promise<ActionResult<Array<{ nevoCode: string; name: string }>>> {
  try {
    // Get authenticated user (for consistency, though search doesn't require auth)
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om te zoeken',
        },
      };
    }

    if (!query || query.trim().length === 0) {
      return {
        ok: true,
        data: [],
      };
    }

    // Search NEVO foods (limit 15)
    const results = await searchNevoFoods(query.trim(), 15);

    // Format results
    const formatted = results.map((food: Record<string, unknown>) => ({
      nevoCode: String(food.nevo_code ?? ''),
      name:
        String(food.name_nl ?? '').trim() ||
        String(food.name_en ?? '').trim() ||
        `NEVO ${food.nevo_code ?? ''}`,
    }));

    return {
      ok: true,
      data: formatted,
    };
  } catch (error) {
    console.error('Error searching NEVO foods:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij zoeken naar voedingsmiddelen',
      },
    };
  }
}

/** Format NEVO search row to { nevoCode, name } */
function formatNevoResult(food: Record<string, unknown>): {
  nevoCode: string;
  name: string;
} {
  return {
    nevoCode: String(food.nevo_code ?? ''),
    name:
      String(food.name_nl ?? '').trim() ||
      String(food.name_en ?? '').trim() ||
      `NEVO ${food.nevo_code ?? ''}`,
  };
}

/**
 * Suggest NEVO matches for a scanned external product.
 * Uses multiple search phrases (full name, first words) and merges/dedupes
 * so the best matches appear first.
 */
export async function suggestNevoMatchesForScannedProductAction(
  productName: string,
  brand?: string,
): Promise<ActionResult<Array<{ nevoCode: string; name: string }>>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om te zoeken',
        },
      };
    }

    const name = productName.trim();
    if (!name) {
      return { ok: true, data: [] };
    }

    // Build search phrases: full name, then first 3/2/1 words (unique, non-empty)
    const words = name.split(/\s+/).filter(Boolean);
    const phrases: string[] = [name];
    if (words.length > 1) {
      const first3 = words.slice(0, 3).join(' ');
      if (first3 !== name) phrases.push(first3);
    }
    if (words.length > 2) {
      const first2 = words.slice(0, 2).join(' ');
      if (!phrases.includes(first2)) phrases.push(first2);
    }
    if (words.length > 1) {
      const first1 = words[0];
      if (!phrases.includes(first1)) phrases.push(first1);
    }
    // Optional: add brand + first word for branded products
    if (brand?.trim() && words.length > 0) {
      const brandFirst = `${brand.trim()} ${words[0]}`.trim();
      if (brandFirst.length > 2 && !phrases.includes(brandFirst)) {
        phrases.push(brandFirst);
      }
    }

    const limitPerPhrase = 6;
    const seen = new Set<string>();
    const merged: Array<{ nevoCode: string; name: string }> = [];

    for (const phrase of phrases.slice(0, 4)) {
      if (merged.length >= 18) break;
      const results = await searchNevoFoods(phrase, limitPerPhrase);
      for (const row of results) {
        const code = String((row as Record<string, unknown>).nevo_code ?? '');
        if (seen.has(code)) continue;
        seen.add(code);
        merged.push(formatNevoResult(row as Record<string, unknown>));
        if (merged.length >= 18) break;
      }
    }

    return { ok: true, data: merged };
  } catch (error) {
    console.error('Error suggesting NEVO matches:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij zoeken naar voedingsmiddelen',
      },
    };
  }
}

/**
 * Load all pantry items for current user
 *
 * @returns Array of pantry items
 */
export async function loadUserPantryAction(): Promise<
  ActionResult<PantryItem[]>
> {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om pantry data op te halen',
        },
      };
    }

    // Load all pantry items for user
    const _service = new PantryService();
    const supabaseClient = await createClient();

    const { data, error } = await supabaseClient
      .from('pantry_items')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error loading pantry items:', error);
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Fout bij ophalen pantry: ${error.message}`,
        },
      };
    }

    // Convert to PantryItem format
    const items: PantryItem[] = (data || []).map((item) => ({
      id: item.id,
      userId: item.user_id,
      nevoCode: item.nevo_code ?? null,
      barcode: item.barcode ?? null,
      source: item.source ?? null,
      displayName: item.display_name ?? null,
      imageUrl: item.image_url ?? null,
      productUrl: item.product_url ?? null,
      storageLocationId:
        (item as { storage_location_id?: string | null }).storage_location_id ??
        null,
      preferredStoreId:
        (item as { grocery_store_id?: string | null }).grocery_store_id ?? null,
      availableG: item.available_g !== null ? Number(item.available_g) : null,
      availablePieces:
        item.available_pieces != null ? Number(item.available_pieces) : null,
      isAvailable: item.is_available,
      updatedAt: item.updated_at,
    }));

    return {
      ok: true,
      data: items,
    };
  } catch (error) {
    console.error('Error loading user pantry:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij ophalen pantry data',
      },
    };
  }
}

/**
 * Upsert a single pantry item (wrapper)
 */
export async function upsertUserPantryItemAction(
  raw: unknown,
): Promise<ActionResult<void>> {
  return upsertPantryItemAction(raw);
}

/**
 * Bulk upsert pantry items (wrapper)
 */
export async function bulkUpsertUserPantryItemsAction(
  raw: unknown,
): Promise<ActionResult<void>> {
  return bulkUpsertPantryItemsAction(raw);
}

/**
 * Delete a single pantry item
 *
 * @param nevoCode - NEVO code of item to delete
 */
export async function deletePantryItemAction(
  nevoCode: string,
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om pantry items te verwijderen',
        },
      };
    }

    if (!nevoCode || nevoCode.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'NEVO code is vereist',
        },
      };
    }

    const service = new PantryService();
    await service.deleteItem(user.id, nevoCode.trim());

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error('Error deleting pantry item:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij verwijderen pantry item',
      },
    };
  }
}

/**
 * Delete a single pantry item by id (works for NEVO and external items).
 */
export async function deletePantryItemByIdAction(
  id: string,
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om pantry items te verwijderen',
        },
      };
    }

    if (!id || id.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Item-id is vereist',
        },
      };
    }

    const service = new PantryService();
    await service.deleteItemById(user.id, id.trim());

    return { ok: true, data: undefined };
  } catch (error) {
    console.error('Error deleting pantry item:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij verwijderen pantry item',
      },
    };
  }
}

/**
 * Delete all pantry items for current user
 */
export async function deleteAllPantryItemsAction(): Promise<
  ActionResult<void>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om pantry items te verwijderen',
        },
      };
    }

    const service = new PantryService();
    await service.deleteAllItems(user.id);

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error('Error deleting all pantry items:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij leegmaken pantry',
      },
    };
  }
}

/**
 * Update a pantry item by id (patch image, location, quantity, availability, preferred store).
 * When preferredStoreId is set and the item has a source (external product), we remember
 * that source→store so new products from that source get this store by default.
 */
export async function updatePantryItemByIdAction(raw: {
  id: string;
  imageUrl?: string | null;
  storageLocationId?: string | null;
  availableG?: number | null;
  availablePieces?: number | null;
  isAvailable?: boolean;
  preferredStoreId?: string | null;
}): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om pantry items te bewerken',
        },
      };
    }

    if (!raw.id || raw.id.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Item-id is vereist',
        },
      };
    }

    const service = new PantryService();
    await service.updateItemById(user.id, raw.id.trim(), {
      imageUrl: raw.imageUrl,
      storageLocationId: raw.storageLocationId,
      availableG: raw.availableG,
      availablePieces: raw.availablePieces,
      isAvailable: raw.isAvailable,
      groceryStoreId: raw.preferredStoreId,
    });

    // Remember source→store for auto-link: when user links a product with a source to a store
    if (raw.preferredStoreId != null && raw.preferredStoreId.trim() !== '') {
      const { data: item } = await supabase
        .from('pantry_items')
        .select('source')
        .eq('id', raw.id.trim())
        .eq('user_id', user.id)
        .maybeSingle();
      const source = (item as { source?: string | null } | null)?.source;
      if (source && (source === 'openfoodfacts' || source === 'albert_heijn')) {
        await supabase.from('user_product_source_store').upsert(
          {
            user_id: user.id,
            source,
            grocery_store_id: raw.preferredStoreId.trim(),
          },
          { onConflict: 'user_id,source' },
        );
      }
    }

    return { ok: true, data: undefined };
  } catch (error) {
    console.error('Error updating pantry item:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij bijwerken pantry item',
      },
    };
  }
}

const PANTRY_IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PANTRY_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Upload a product image for a pantry item. Stores in Vercel Blob and updates pantry_items.image_url.
 */
export async function uploadPantryItemImageAction(
  formData: FormData,
): Promise<ActionResult<{ imageUrl: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om afbeeldingen te uploaden',
        },
      };
    }

    const pantryItemId = formData.get('pantryItemId');
    if (!pantryItemId || typeof pantryItemId !== 'string') {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'pantryItemId is vereist',
        },
      };
    }

    const file = formData.get('image');
    if (!file || !(file instanceof File)) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Selecteer een afbeelding',
        },
      };
    }

    if (!PANTRY_IMAGE_ALLOWED_TYPES.includes(file.type)) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Alleen JPEG, PNG of WebP zijn toegestaan',
        },
      };
    }
    if (file.size > PANTRY_IMAGE_MAX_BYTES) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Afbeelding mag maximaal 2 MB zijn',
        },
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = `product.${ext}`;

    const uploadResult = await storageService.uploadPantryImageToBlob(
      buffer,
      filename,
      user.id,
      pantryItemId.trim(),
    );

    const service = new PantryService();
    await service.updateItemById(user.id, pantryItemId.trim(), {
      imageUrl: uploadResult.url,
    });

    return { ok: true, data: { imageUrl: uploadResult.url } };
  } catch (error) {
    console.error('Error uploading pantry image:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij uploaden afbeelding',
      },
    };
  }
}
