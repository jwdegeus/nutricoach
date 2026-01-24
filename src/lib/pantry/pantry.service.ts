/**
 * Pantry Service
 * 
 * Server-side service for reading and writing pantry items.
 * This service is read-only from the perspective of meal planning (no writes from agent).
 */

import "server-only";
import { createClient } from "@/src/lib/supabase/server";
import type {
  PantryAvailability,
  UpsertPantryItemInput,
  BulkUpsertPantryItemsInput,
} from "./pantry.types";
import {
  upsertPantryItemInputSchema,
  bulkUpsertPantryItemsInputSchema,
} from "./pantry.schemas";

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
    nevoCodes: string[]
  ): Promise<PantryAvailability[]> {
    if (nevoCodes.length === 0) {
      return [];
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("pantry_items")
      .select("nevo_code, available_g, is_available")
      .eq("user_id", userId)
      .in("nevo_code", nevoCodes);

    if (error) {
      console.error("Error loading pantry availability:", error);
      throw new Error(
        `Failed to load pantry availability: ${error.message}`
      );
    }

    // Convert to PantryAvailability format
    return (data || []).map((item) => ({
      nevoCode: item.nevo_code,
      availableG: item.available_g !== null ? Number(item.available_g) : undefined,
      isAvailable: item.is_available,
    }));
  }

  /**
   * Upsert a single pantry item
   * 
   * Idempotent: if item exists for (userId, nevoCode), it will be updated.
   * 
   * @param userId - User ID
   * @param input - Pantry item input
   */
  async upsertItem(
    userId: string,
    input: UpsertPantryItemInput
  ): Promise<void> {
    // Validate input
    const validated = upsertPantryItemInputSchema.parse(input);

    const supabase = await createClient();

    const { error } = await supabase
      .from("pantry_items")
      .upsert(
        {
          user_id: userId,
          nevo_code: validated.nevoCode,
          available_g: validated.availableG ?? null,
          is_available: validated.isAvailable ?? true,
        },
        {
          onConflict: "user_id,nevo_code",
        }
      );

    if (error) {
      console.error("Error upserting pantry item:", error);
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
    input: BulkUpsertPantryItemsInput
  ): Promise<void> {
    // Validate input
    const validated = bulkUpsertPantryItemsInputSchema.parse(input);

    const supabase = await createClient();

    // Prepare items for upsert
    const items = validated.items.map((item) => ({
      user_id: userId,
      nevo_code: item.nevoCode,
      available_g: item.availableG ?? null,
      is_available: item.isAvailable ?? true,
    }));

    // Upsert in batches (Supabase has a limit, typically 1000 rows)
    const batchSize = 100;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const { error } = await supabase
        .from("pantry_items")
        .upsert(batch, {
          onConflict: "user_id,nevo_code",
        });

      if (error) {
        console.error("Error bulk upserting pantry items:", error);
        throw new Error(
          `Failed to bulk upsert pantry items: ${error.message}`
        );
      }
    }
  }

  /**
   * Delete a single pantry item
   * 
   * @param userId - User ID
   * @param nevoCode - NEVO code of item to delete
   */
  async deleteItem(
    userId: string,
    nevoCode: string
  ): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from("pantry_items")
      .delete()
      .eq("user_id", userId)
      .eq("nevo_code", nevoCode);

    if (error) {
      console.error("Error deleting pantry item:", error);
      throw new Error(`Failed to delete pantry item: ${error.message}`);
    }
  }

  /**
   * Delete all pantry items for a user
   * 
   * @param userId - User ID
   */
  async deleteAllItems(userId: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from("pantry_items")
      .delete()
      .eq("user_id", userId);

    if (error) {
      console.error("Error deleting all pantry items:", error);
      throw new Error(`Failed to delete all pantry items: ${error.message}`);
    }
  }
}
