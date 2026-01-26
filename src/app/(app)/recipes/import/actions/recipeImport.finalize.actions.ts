"use server";

import { createClient } from "@/src/lib/supabase/server";
import { finalizeRecipeImport } from "../services/recipeImportFinalize.service";
import { z } from "zod";
import type { MealSlot } from "@/src/lib/diets";

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: "AUTH_ERROR" | "VALIDATION_ERROR" | "DB_ERROR" | "NOT_FOUND" | "FORBIDDEN";
        message: string;
      };
    };

/**
 * Finalize recipe import input schema
 */
const finalizeRecipeImportInputSchema = z.object({
  jobId: z.string().uuid("jobId must be a valid UUID"),
  mealSlot: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
});

/**
 * Finalize recipe import by writing to custom_meals and recipe_ingredients
 * 
 * This action:
 * 1. Validates job ownership and status
 * 2. Validates extracted_recipe_json
 * 3. Writes recipe to custom_meals
 * 4. Writes ingredients to recipe_ingredients
 * 5. Updates recipe_imports with recipe_id and finalized status
 * 
 * Idempotent: if job is already finalized, returns existing recipeId.
 * 
 * @param raw - Raw input (will be validated)
 * @returns Recipe ID
 */
export async function finalizeRecipeImportAction(
  raw: unknown
): Promise<ActionResult<{ recipeId: string }>> {
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
          message: "Je moet ingelogd zijn om recipe imports te finaliseren",
        },
      };
    }

    // Validate input
    let input: z.infer<typeof finalizeRecipeImportInputSchema>;
    try {
      input = finalizeRecipeImportInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Ongeldige input voor finalize recipe import",
        },
      };
    }

    // Load job to check source_image_meta before finalizing
    const { data: jobData, error: jobLoadError } = await supabase
      .from("recipe_imports")
      .select("source_image_meta")
      .eq("id", input.jobId)
      .eq("user_id", user.id)
      .single();

    if (jobData) {
      console.log("[finalizeRecipeImportAction] Job source_image_meta before finalize:", JSON.stringify(jobData.source_image_meta, null, 2));
    }

    // Finalize recipe import (RPC handles all validation, ownership checks, and writes atomically)
    try {
      const result = await finalizeRecipeImport({
        userId: user.id,
        jobId: input.jobId,
        mealSlot: input.mealSlot || "dinner",
      });

      // Verify the recipe was created with image URL
      if (result.recipeId) {
        const { data: createdMeal, error: mealLoadError } = await supabase
          .from("custom_meals")
          .select("source_image_url, source_image_path")
          .eq("id", result.recipeId)
          .eq("user_id", user.id)
          .single();

        if (createdMeal) {
          console.log("[finalizeRecipeImportAction] Created meal image data:", {
            recipeId: result.recipeId,
            source_image_url: createdMeal.source_image_url,
            source_image_path: createdMeal.source_image_path,
          });
        } else if (mealLoadError) {
          console.error("[finalizeRecipeImportAction] Error loading created meal:", mealLoadError);
        }
      }

      return {
        ok: true,
        data: result,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Log full error for debugging
      console.error("[finalizeRecipeImportAction] Error details:", {
        errorMessage,
        error,
        jobId: input.jobId,
      });

      // Parse error code from error message (set by RPC function)
      let code: "AUTH_ERROR" | "VALIDATION_ERROR" | "DB_ERROR" | "NOT_FOUND" | "FORBIDDEN" = "DB_ERROR";
      if (errorMessage.startsWith("AUTH_ERROR:")) {
        code = "AUTH_ERROR";
      } else if (errorMessage.startsWith("NOT_FOUND:")) {
        code = "NOT_FOUND";
      } else if (errorMessage.startsWith("FORBIDDEN:")) {
        code = "FORBIDDEN";
      } else if (errorMessage.startsWith("VALIDATION_ERROR:")) {
        code = "VALIDATION_ERROR";
      }

      // Extract message without error code prefix
      const message = errorMessage.includes(":") 
        ? errorMessage.split(":").slice(1).join(":").trim()
        : `Fout bij finaliseren recipe import: ${errorMessage}`;

      return {
        ok: false,
        error: {
          code,
          message,
        },
      };
    }
  } catch (error) {
    console.error("Unexpected error in finalizeRecipeImportAction:", error);
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Onbekende fout bij finaliseren recipe import",
      },
    };
  }
}
