"use server";

import { createClient } from "@/src/lib/supabase/server";
import { z } from "zod";
import type { GeminiExtractedRecipe } from "../recipeImport.gemini.schemas";

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
 * Update recipe import input schema
 */
const updateRecipeImportInputSchema = z.object({
  jobId: z.string().uuid("jobId must be a valid UUID"),
  updates: z.object({
    title: z.string().min(1).optional(),
    servings: z.number().positive().nullable().optional(),
    ingredients: z.array(z.object({
      name: z.string().min(1),
      quantity: z.number().nullable().optional(),
      unit: z.string().nullable().optional(),
      note: z.string().nullable().optional(),
    })).optional(),
    instructions: z.array(z.object({
      step: z.number().positive(),
      text: z.string().min(1),
    })).optional(),
  }),
});

/**
 * Update recipe import extracted data
 * 
 * Allows users to edit the extracted recipe before finalizing
 */
export async function updateRecipeImportAction(
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
          message: "Je moet ingelogd zijn om recipe imports bij te werken",
        },
      };
    }

    // Validate input
    let input: z.infer<typeof updateRecipeImportInputSchema>;
    try {
      input = updateRecipeImportInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Ongeldige input voor recipe import update",
        },
      };
    }

    // Load job to check ownership and get current data
    const { data: job, error: loadError } = await supabase
      .from("recipe_imports")
      .select("extracted_recipe_json, status")
      .eq("id", input.jobId)
      .eq("user_id", user.id)
      .single();

    if (loadError || !job) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Recipe import job niet gevonden of geen toegang",
        },
      };
    }

    // Check status - only allow updates when ready_for_review
    if (job.status !== "ready_for_review") {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Recept kan alleen worden bewerkt wanneer het klaar is voor review",
        },
      };
    }

    // Get current extracted recipe
    const currentRecipe = job.extracted_recipe_json as GeminiExtractedRecipe;

    if (!currentRecipe) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Geen geëxtraheerd recept gevonden",
        },
      };
    }

    // Apply updates
    const updatedRecipe: GeminiExtractedRecipe = { ...currentRecipe };

    if (input.updates.title !== undefined) {
      updatedRecipe.title = input.updates.title;
    }

    if (input.updates.servings !== undefined) {
      updatedRecipe.servings = input.updates.servings;
    }

    if (input.updates.ingredients !== undefined) {
      updatedRecipe.ingredients = input.updates.ingredients.map((ing, idx) => {
        // Preserve original_line from current recipe if available, otherwise use name
        const currentIng = currentRecipe.ingredients?.[idx];
        return {
          original_line: currentIng?.original_line || ing.name,
          name: ing.name,
          quantity: ing.quantity ?? null,
          unit: ing.unit ?? null,
          note: ing.note ?? null,
        };
      });
    }

    if (input.updates.instructions !== undefined) {
      updatedRecipe.instructions = input.updates.instructions.map((inst) => ({
        step: inst.step,
        text: inst.text,
      }));
    }

    // Update job with modified recipe
    const { error: updateError } = await supabase
      .from("recipe_imports")
      .update({
        extracted_recipe_json: updatedRecipe,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.jobId)
      .eq("user_id", user.id);

    if (updateError) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: `Fout bij bijwerken recipe import: ${updateError.message}`,
        },
      };
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Unexpected error in updateRecipeImportAction:", error);
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Onbekende fout bij bijwerken recipe import",
      },
    };
  }
}
