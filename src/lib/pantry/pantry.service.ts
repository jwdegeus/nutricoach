/**
 * Pantry Service
 *
 * Server-side service for reading and writing pantry items.
 * This service is read-only from the perspective of meal planning (no writes from agent).
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import type {
  PantryAvailability,
  UpsertPantryItemInput,
  BulkUpsertPantryItemsInput,
} from './pantry.types';
import {
  upsertPantryItemInputSchema,
  bulkUpsertPantryItemsInputSchema,
} from './pantry.schemas';

/**
 * Pantry Service
 */
export class PantryService {
  /**
   * Load pantry availability for given NEVO codes
   *
   * @param userId - User ID
   * @param nevoCodes - Array of NEVO codes to check
   * @returns Array of pantry availability (only items that exist in pantry)
   */
  async loadAvailabilityByNevoCodes(
    userId: string,
    nevoCodes: string[],
  ): Promise<PantryAvailability[]> {
    if (nevoCodes.length === 0) {
      return [];
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('pantry_items')
      .select('nevo_code, available_g, is_available')
      .eq('user_id', userId)
      .in('nevo_code', nevoCodes);

    if (error) {
      console.error('Error loading pantry availability:', error);
      throw new Error(`Failed to load pantry availability: ${error.message}`);
    }

    // Convert to PantryAvailability format
    return (data || []).map((item) => ({
      nevoCode: item.nevo_code,
      availableG:
        item.available_g !== null ? Number(item.available_g) : undefined,
      isAvailable: item.is_available,
    }));
  }

  /**
   * Upsert a single pantry item (NEVO or external).
   * Uses select-then-insert-or-update (no ON CONFLICT) because the table has
   * partial unique indexes that Supabase upsert does not match.
   *
   * @param userId - User ID
   * @param input - Pantry item input
   */
  async upsertItem(
    userId: string,
    input: UpsertPantryItemInput,
  ): Promise<void> {
    const validated = upsertPantryItemInputSchema.parse(input);
    const supabase = await createClient();

    const isNevo =
      validated.nevoCode != null && validated.nevoCode.trim() !== '';

    const imageUrl =
      validated.imageUrl && validated.imageUrl.trim() !== ''
        ? validated.imageUrl.trim()
        : null;
    const productUrl =
      validated.productUrl && validated.productUrl.trim() !== ''
        ? validated.productUrl.trim()
        : null;
    const storageLocationId =
      validated.storageLocationId && validated.storageLocationId.trim() !== ''
        ? validated.storageLocationId.trim()
        : null;

    // Use select-then-insert-or-update because the table has partial unique indexes
    // (WHERE nevo_code IS NOT NULL / WHERE barcode IS NOT NULL) which Supabase
    // .upsert(onConflict) does not match.
    if (isNevo) {
      const nevoCode = validated.nevoCode!.trim();
      const { data: existing } = await supabase
        .from('pantry_items')
        .select('id')
        .eq('user_id', userId)
        .eq('nevo_code', nevoCode)
        .maybeSingle();

      const row = {
        user_id: userId,
        nevo_code: nevoCode,
        barcode: null,
        source: null,
        display_name: null,
        image_url: imageUrl,
        product_url: null,
        storage_location_id: storageLocationId,
        available_g: validated.availableG ?? null,
        is_available: validated.isAvailable ?? true,
      };

      if (existing?.id) {
        const { error } = await supabase
          .from('pantry_items')
          .update(row)
          .eq('id', existing.id);
        if (error)
          throw new Error(`Failed to upsert pantry item: ${error.message}`);
      } else {
        const { error } = await supabase.from('pantry_items').insert(row);
        if (error)
          throw new Error(`Failed to upsert pantry item: ${error.message}`);
      }
      return;
    }

    const barcode = (validated.barcode ?? '').trim();
    const source = (validated.source ?? 'openfoodfacts').trim();
    const displayName = (validated.displayName ?? '').trim();

    const { data: existing } = await supabase
      .from('pantry_items')
      .select('id')
      .eq('user_id', userId)
      .eq('barcode', barcode)
      .eq('source', source)
      .maybeSingle();

    const preferredStoreId =
      (validated as { preferredStoreId?: string | null }).preferredStoreId ??
      null;
    let groceryStoreId: string | null = preferredStoreId;
    if (!existing?.id && !groceryStoreId) {
      const { data: defaultStore } = await supabase
        .from('user_product_source_store')
        .select('grocery_store_id')
        .eq('user_id', userId)
        .eq('source', source)
        .maybeSingle();
      groceryStoreId =
        (defaultStore as { grocery_store_id: string } | null)
          ?.grocery_store_id ?? null;
    }

    const baseRow = {
      user_id: userId,
      nevo_code: null,
      barcode,
      source,
      display_name: displayName,
      image_url: imageUrl,
      product_url: productUrl,
      storage_location_id: storageLocationId,
      available_g: validated.availableG ?? null,
      is_available: validated.isAvailable ?? true,
    };

    if (existing?.id) {
      // Update: do not overwrite grocery_store_id here; use edit form / updateItemById for that
      const { error } = await supabase
        .from('pantry_items')
        .update(baseRow)
        .eq('id', existing.id);
      if (error)
        throw new Error(`Failed to upsert pantry item: ${error.message}`);
    } else {
      const { error } = await supabase.from('pantry_items').insert({
        ...baseRow,
        grocery_store_id: groceryStoreId,
      });
      if (error)
        throw new Error(`Failed to upsert pantry item: ${error.message}`);
    }
  }

  /**
   * Bulk upsert pantry items
   *
   * Idempotent: existing items will be updated, new items will be inserted.
   *
   * @param userId - User ID
   * @param input - Bulk upsert input
   */
  async bulkUpsert(
    userId: string,
    input: BulkUpsertPantryItemsInput,
  ): Promise<void> {
    // Validate input
    const validated = bulkUpsertPantryItemsInputSchema.parse(input);

    const supabase = await createClient();

    // Bulk upsert: NEVO items only (e.g. from shopping list). No .upsert(onConflict)
    // because table uses partial unique indexes; do select then insert/update.
    const nevoItems = validated.items.filter(
      (item): item is typeof item & { nevoCode: string } =>
        item.nevoCode != null && String(item.nevoCode).trim() !== '',
    );
    if (nevoItems.length === 0) return;

    const nevoCodes = [...new Set(nevoItems.map((i) => i.nevoCode.trim()))];
    const { data: existing } = await supabase
      .from('pantry_items')
      .select('id, nevo_code')
      .eq('user_id', userId)
      .in('nevo_code', nevoCodes);

    const byNevo = new Map<string, string>(
      (existing ?? []).map((r) => [r.nevo_code, r.id]),
    );
    const toInsert: typeof nevoItems = [];
    const toUpdate: { id: string; item: (typeof nevoItems)[number] }[] = [];

    for (const item of nevoItems) {
      const code = item.nevoCode.trim();
      const id = byNevo.get(code);
      if (id) toUpdate.push({ id, item });
      else toInsert.push(item);
    }

    if (toInsert.length > 0) {
      const rows = toInsert.map((item) => ({
        user_id: userId,
        nevo_code: item.nevoCode.trim(),
        barcode: null,
        source: null,
        display_name: null,
        available_g: item.availableG ?? null,
        is_available: item.isAvailable ?? true,
      }));
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const { error } = await supabase
          .from('pantry_items')
          .insert(rows.slice(i, i + batchSize));
        if (error)
          throw new Error(
            `Failed to bulk upsert pantry items: ${error.message}`,
          );
      }
    }

    for (const { id, item } of toUpdate) {
      const { error } = await supabase
        .from('pantry_items')
        .update({
          available_g: item.availableG ?? null,
          is_available: item.isAvailable ?? true,
        })
        .eq('id', id);
      if (error)
        throw new Error(`Failed to bulk upsert pantry items: ${error.message}`);
    }
  }

  /**
   * Update a pantry item by id (patch image_url, storage_location_id, available_g, is_available, grocery_store_id).
   */
  async updateItemById(
    userId: string,
    id: string,
    patch: {
      imageUrl?: string | null;
      storageLocationId?: string | null;
      availableG?: number | null;
      availablePieces?: number | null;
      isAvailable?: boolean;
      groceryStoreId?: string | null;
    },
  ): Promise<void> {
    const supabase = await createClient();
    const updates: Record<string, unknown> = {};
    if (patch.imageUrl !== undefined) {
      updates.image_url =
        patch.imageUrl && patch.imageUrl.trim() !== ''
          ? patch.imageUrl.trim()
          : null;
    }
    if (patch.storageLocationId !== undefined) {
      updates.storage_location_id =
        patch.storageLocationId && patch.storageLocationId.trim() !== ''
          ? patch.storageLocationId.trim()
          : null;
    }
    if (patch.availableG !== undefined) {
      updates.available_g = patch.availableG;
    }
    if (patch.availablePieces !== undefined) {
      updates.available_pieces = patch.availablePieces;
    }
    if (patch.isAvailable !== undefined) {
      updates.is_available = patch.isAvailable;
    }
    if (patch.groceryStoreId !== undefined) {
      updates.grocery_store_id =
        patch.groceryStoreId && patch.groceryStoreId.trim() !== ''
          ? patch.groceryStoreId.trim()
          : null;
    }
    if (Object.keys(updates).length === 0) return;

    const { error } = await supabase
      .from('pantry_items')
      .update(updates)
      .eq('user_id', userId)
      .eq('id', id);
    if (error)
      throw new Error(`Failed to update pantry item: ${error.message}`);
  }

  /**
   * Delete a single pantry item by id (works for both NEVO and external).
   */
  async deleteItemById(userId: string, id: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('pantry_items')
      .delete()
      .eq('user_id', userId)
      .eq('id', id);
    if (error)
      throw new Error(`Failed to delete pantry item: ${error.message}`);
  }

  /**
   * Delete a single pantry item by NEVO code (NEVO items only).
   *
   * @param userId - User ID
   * @param nevoCode - NEVO code of item to delete
   */
  async deleteItem(userId: string, nevoCode: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('pantry_items')
      .delete()
      .eq('user_id', userId)
      .eq('nevo_code', nevoCode);
    if (error)
      throw new Error(`Failed to delete pantry item: ${error.message}`);
  }

  /**
   * Delete all pantry items for a user
   *
   * @param userId - User ID
   */
  async deleteAllItems(userId: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('pantry_items')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting all pantry items:', error);
      throw new Error(`Failed to delete all pantry items: ${error.message}`);
    }
  }
}
