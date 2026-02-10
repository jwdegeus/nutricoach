'use server';

import { createClient } from '@/src/lib/supabase/server';
import type { PantryLocation } from '@/src/lib/pantry/pantry.types';

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
 * List pantry locations for the current user, ordered by sort_order.
 */
export async function listUserPantryLocationsAction(): Promise<
  ActionResult<PantryLocation[]>
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
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const { data, error } = await supabase
      .from('user_pantry_locations')
      .select('id, user_id, name, sort_order')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    const locations: PantryLocation[] = (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      sortOrder: row.sort_order,
    }));

    return { ok: true, data: locations };
  } catch (err) {
    console.error('listUserPantryLocationsAction:', err);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          err instanceof Error ? err.message : 'Fout bij ophalen locaties',
      },
    };
  }
}

/**
 * Create a new pantry location. sort_order defaults to max+1.
 */
export async function createUserPantryLocationAction(raw: {
  name: string;
}): Promise<ActionResult<PantryLocation>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    const name = (raw.name ?? '').trim();
    if (!name) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Naam is verplicht',
        },
      };
    }

    const { data: existing } = await supabase
      .from('user_pantry_locations')
      .select('sort_order')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder =
      existing?.sort_order != null ? existing.sort_order + 1 : 0;

    const { data: inserted, error } = await supabase
      .from('user_pantry_locations')
      .insert({
        user_id: user.id,
        name,
        sort_order: nextOrder,
      })
      .select('id, user_id, name, sort_order')
      .single();

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    return {
      ok: true,
      data: {
        id: inserted.id,
        userId: inserted.user_id,
        name: inserted.name,
        sortOrder: inserted.sort_order,
      },
    };
  } catch (err) {
    console.error('createUserPantryLocationAction:', err);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          err instanceof Error ? err.message : 'Fout bij aanmaken locatie',
      },
    };
  }
}

/**
 * Update a pantry location (name and/or sort_order).
 */
export async function updateUserPantryLocationAction(raw: {
  id: string;
  name?: string;
  sortOrder?: number;
}): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    if (!raw.id?.trim()) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Id is verplicht' },
      };
    }

    const updates: { name?: string; sort_order?: number } = {};
    if (raw.name !== undefined) {
      const name = raw.name.trim();
      if (name === '') {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Naam mag niet leeg zijn',
          },
        };
      }
      updates.name = name;
    }
    if (raw.sortOrder !== undefined) {
      updates.sort_order = raw.sortOrder;
    }

    if (Object.keys(updates).length === 0) {
      return { ok: true, data: undefined };
    }

    const { error } = await supabase
      .from('user_pantry_locations')
      .update(updates)
      .eq('id', raw.id.trim())
      .eq('user_id', user.id);

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    return { ok: true, data: undefined };
  } catch (err) {
    console.error('updateUserPantryLocationAction:', err);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          err instanceof Error ? err.message : 'Fout bij bijwerken locatie',
      },
    };
  }
}

/**
 * Delete a pantry location. Pantry items with this location will have storage_location_id set to NULL (ON DELETE SET NULL).
 */
export async function deleteUserPantryLocationAction(
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
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    if (!id?.trim()) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Id is verplicht' },
      };
    }

    const { error } = await supabase
      .from('user_pantry_locations')
      .delete()
      .eq('id', id.trim())
      .eq('user_id', user.id);

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    return { ok: true, data: undefined };
  } catch (err) {
    console.error('deleteUserPantryLocationAction:', err);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          err instanceof Error ? err.message : 'Fout bij verwijderen locatie',
      },
    };
  }
}

/**
 * Ensure the current user has the four default locations (Koelkast, Vriezer, Lade, Kast).
 * Idempotent: only inserts missing sort_orders 0–3.
 */
export async function seedDefaultPantryLocationsAction(): Promise<
  ActionResult<PantryLocation[]>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    const { data: existing } = await supabase
      .from('user_pantry_locations')
      .select('sort_order')
      .eq('user_id', user.id);
    const existingOrders = new Set((existing ?? []).map((r) => r.sort_order));

    const defaults = [
      { name: 'Koelkast', sort_order: 0 },
      { name: 'Vriezer', sort_order: 1 },
      { name: 'Lade', sort_order: 2 },
      { name: 'Kast', sort_order: 3 },
    ];

    for (const d of defaults) {
      if (existingOrders.has(d.sort_order)) continue;
      await supabase.from('user_pantry_locations').insert({
        user_id: user.id,
        name: d.name,
        sort_order: d.sort_order,
      });
    }

    const result = await listUserPantryLocationsAction();
    if (!result.ok) return result;
    return { ok: true, data: result.data };
  } catch (err) {
    console.error('seedDefaultPantryLocationsAction:', err);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Fout bij aanmaken standaardlocaties',
      },
    };
  }
}
