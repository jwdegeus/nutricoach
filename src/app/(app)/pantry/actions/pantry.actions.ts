"use server";

import { createClient } from "@/src/lib/supabase/server";
import { PantryService } from "@/src/lib/pantry/pantry.service";
import type { PantryAvailability } from "@/src/lib/pantry/pantry.types";
import {
  upsertPantryItemInputSchema,
  bulkUpsertPantryItemsInputSchema,
} from "@/src/lib/pantry/pantry.schemas";

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: "AUTH_ERROR" | "VALIDATION_ERROR" | "DB_ERROR";
        message: string;
      };
    };

/**
 * Load pantry availability for given NEVO codes
 * 
 * @param nevoCodes - Array of NEVO codes to check
 * @returns Pantry availability array
 */
export async function loadPantryAvailabilityAction(
  nevoCodes: string[]
): Promise<ActionResult<PantryAvailability[]>> {
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
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn om pantry data op te halen",
        },
      };
    }

    // Load pantry availability
    const service = new PantryService();
    const availability = await service.loadAvailabilityByNevoCodes(
      user.id,
      nevoCodes
    );

    return {
      ok: true,
      data: availability,
    };
  } catch (error) {
    console.error("Error loading pantry availability:", error);
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Fout bij ophalen pantry data",
      },
    };
  }
}

/**
 * Upsert a single pantry item
 * 
 * @param raw - Raw input (will be validated)
 * @returns Success or error
 */
export async function upsertPantryItemAction(
  raw: unknown
): Promise<ActionResult<void>> {
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
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn om pantry items te bewerken",
        },
      };
    }

    // Validate input
    let input;
    try {
      input = upsertPantryItemInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Ongeldige pantry item data",
        },
      };
    }

    // Upsert item
    const service = new PantryService();
    await service.upsertItem(user.id, input);

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error upserting pantry item:", error);
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Fout bij opslaan pantry item",
      },
    };
  }
}

/**
 * Bulk upsert pantry items
 * 
 * @param raw - Raw input (will be validated)
 * @returns Success or error
 */
export async function bulkUpsertPantryItemsAction(
  raw: unknown
): Promise<ActionResult<void>> {
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
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn om pantry items te bewerken",
        },
      };
    }

    // Validate input
    let input;
    try {
      input = bulkUpsertPantryItemsInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Ongeldige pantry items data",
        },
      };
    }

    // Bulk upsert items
    const service = new PantryService();
    await service.bulkUpsert(user.id, input);

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error bulk upserting pantry items:", error);
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Fout bij opslaan pantry items",
      },
    };
  }
}
