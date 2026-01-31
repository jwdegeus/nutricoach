'use server';

import { createClient } from '@/src/lib/supabase/server';
import { searchNevoFoods } from '@/src/lib/nevo/nutrition-calculator';
import { PantryService } from '@/src/lib/pantry/pantry.service';
import type { PantryItem } from '@/src/lib/pantry/pantry.types';
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
      nevoCode: item.nevo_code,
      availableG: item.available_g !== null ? Number(item.available_g) : null,
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
