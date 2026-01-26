/**
 * Recipe Import Finalize Service
 * 
 * Service for finalizing recipe imports by writing to custom_meals and recipe_ingredients.
 * Uses Postgres RPC function for atomic transaction.
 */

import "server-only";
import { createClient } from "@/src/lib/supabase/server";
import type { MealSlot } from "@/src/lib/diets";

/**
 * Finalize recipe import by calling Postgres RPC function
 * 
 * All writes (custom_meals, recipe_ingredients, recipe_imports update) happen
 * atomically in a single database transaction via the RPC function.
 * 
 * @param args - Finalization arguments
 * @returns Created recipe ID
 */
export async function finalizeRecipeImport(args: {
  userId: string;
  jobId: string;
  mealSlot?: MealSlot;
}): Promise<{ recipeId: string }> {
  const supabase = await createClient();
  const { jobId, mealSlot = "dinner" } = args;

  // Call Postgres RPC function for atomic finalization
  const { data: recipeId, error } = await supabase.rpc("finalize_recipe_import", {
    p_job_id: jobId,
    p_meal_slot: mealSlot,
  });

  if (error) {
    // Parse error message to determine error code
    const errorMessage = error.message || "Unknown error";
    
    // Log full error details for debugging
    console.error("[finalizeRecipeImport] RPC error:", {
      error,
      errorMessage,
      errorCode: error.code,
      errorDetails: error.details,
      errorHint: error.hint,
      jobId: args.jobId,
    });
    
    // Map Postgres exceptions to error types
    if (errorMessage.includes("AUTH_ERROR")) {
      throw new Error(`AUTH_ERROR: ${errorMessage}`);
    } else if (errorMessage.includes("NOT_FOUND")) {
      throw new Error(`NOT_FOUND: ${errorMessage}`);
    } else if (errorMessage.includes("FORBIDDEN")) {
      throw new Error(`FORBIDDEN: ${errorMessage}`);
    } else if (errorMessage.includes("VALIDATION_ERROR")) {
      throw new Error(`VALIDATION_ERROR: ${errorMessage}`);
    } else {
      throw new Error(`DB_ERROR: ${errorMessage}`);
    }
  }

  if (!recipeId) {
    throw new Error("DB_ERROR: RPC function returned no recipe_id");
  }

  return { recipeId: recipeId as string };
}
