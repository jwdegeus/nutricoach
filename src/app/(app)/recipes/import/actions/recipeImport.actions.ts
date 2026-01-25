"use server";

import { createClient } from "@/src/lib/supabase/server";
import type {
  RecipeImportJob,
  CreateRecipeImportInput,
  LoadRecipeImportInput,
  UpdateRecipeImportStatusInput,
  RecipeImportStatus,
} from "../recipeImport.types";
import {
  createRecipeImportInputSchema,
  loadRecipeImportInputSchema,
  updateRecipeImportStatusInputSchema,
} from "../recipeImport.schemas";

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
 * Valid status transitions
 */
const VALID_STATUS_TRANSITIONS: Record<RecipeImportStatus, RecipeImportStatus[]> = {
  uploaded: ["processing", "failed"],
  processing: ["ready_for_review", "failed"],
  ready_for_review: ["finalized", "failed"],
  failed: ["uploaded", "processing"], // Allow retry
  finalized: [], // Finalized is terminal
};

/**
 * Validate status transition
 */
function isValidStatusTransition(
  currentStatus: RecipeImportStatus,
  newStatus: RecipeImportStatus
): boolean {
  // Allow same status (no-op update)
  if (currentStatus === newStatus) {
    return true;
  }

  // Check if transition is valid
  const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
  return allowedTransitions.includes(newStatus);
}

/**
 * Create a new recipe import job
 * 
 * @param raw - Raw input (will be validated)
 * @returns Job ID and initial status
 */
export async function createRecipeImportAction(
  raw: unknown
): Promise<ActionResult<{ jobId: string; status: RecipeImportStatus }>> {
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
          message: "Je moet ingelogd zijn om een recept te importeren",
        },
      };
    }

    // Validate input
    let input: CreateRecipeImportInput;
    try {
      input = createRecipeImportInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Ongeldige input voor recipe import",
        },
      };
    }

    // Insert recipe import job
    const { data, error } = await supabase
      .from("recipe_imports")
      .insert({
        user_id: user.id, // Set server-side, not from client
        status: "uploaded",
        source_image_path: input.sourceImagePath || null,
        source_image_meta: input.sourceImageMeta || null,
        source_locale: input.sourceLocale || null,
        target_locale: input.targetLocale || null,
      })
      .select("id, status")
      .single();

    if (error) {
      console.error("Error creating recipe import:", error);
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: `Fout bij aanmaken recipe import: ${error.message}`,
        },
      };
    }

    return {
      ok: true,
      data: {
        jobId: data.id,
        status: data.status as RecipeImportStatus,
      },
    };
  } catch (error) {
    console.error("Unexpected error in createRecipeImportAction:", error);
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Onbekende fout bij aanmaken recipe import",
      },
    };
  }
}

/**
 * Load a recipe import job by ID
 * 
 * @param raw - Raw input (will be validated)
 * @returns Recipe import job data
 */
export async function loadRecipeImportAction(
  raw: unknown
): Promise<ActionResult<RecipeImportJob>> {
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
          message: "Je moet ingelogd zijn om recipe imports te bekijken",
        },
      };
    }

    // Validate input
    let input: LoadRecipeImportInput;
    try {
      input = loadRecipeImportInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Ongeldige input voor load recipe import",
        },
      };
    }

    // Load recipe import job
    const { data, error } = await supabase
      .from("recipe_imports")
      .select("*")
      .eq("id", input.jobId)
      .eq("user_id", user.id) // Ensure user can only access own jobs
      .maybeSingle();

    if (error) {
      console.error("Error loading recipe import:", error);
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: `Fout bij ophalen recipe import: ${error.message}`,
        },
      };
    }

    if (!data) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Recipe import niet gevonden of geen toegang",
        },
      };
    }

    // Map database record to type
    const job: RecipeImportJob = {
      id: data.id,
      userId: data.user_id,
      status: data.status as RecipeImportStatus,
      sourceImagePath: data.source_image_path,
      sourceImageMeta: data.source_image_meta,
      sourceLocale: data.source_locale,
      targetLocale: data.target_locale,
      rawOcrText: data.raw_ocr_text,
      geminiRawJson: data.gemini_raw_json,
      extractedRecipeJson: data.extracted_recipe_json,
      validationErrorsJson: data.validation_errors_json,
      confidenceOverall: data.confidence_overall
        ? parseFloat(data.confidence_overall.toString())
        : null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      finalizedAt: data.finalized_at,
      recipeId: data.recipe_id || null,
    };

    return {
      ok: true,
      data: job,
    };
  } catch (error) {
    console.error("Unexpected error in loadRecipeImportAction:", error);
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Onbekende fout bij ophalen recipe import",
      },
    };
  }
}

/**
 * Update recipe import status
 * 
 * @param raw - Raw input (will be validated)
 * @returns Success or error
 */
export async function updateRecipeImportStatusAction(
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
          message: "Je moet ingelogd zijn om recipe import status te updaten",
        },
      };
    }

    // Validate input
    let input: UpdateRecipeImportStatusInput;
    try {
      input = updateRecipeImportStatusInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Ongeldige input voor update recipe import status",
        },
      };
    }

    // Load current job to validate status transition
    const { data: currentJob, error: loadError } = await supabase
      .from("recipe_imports")
      .select("status, user_id")
      .eq("id", input.jobId)
      .maybeSingle();

    if (loadError) {
      console.error("Error loading recipe import for status update:", loadError);
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: `Fout bij ophalen recipe import: ${loadError.message}`,
        },
      };
    }

    if (!currentJob) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Recipe import niet gevonden",
        },
      };
    }

    // Check if user owns this job
    if (currentJob.user_id !== user.id) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Geen toegang tot deze recipe import",
        },
      };
    }

    // Validate status transition
    if (!isValidStatusTransition(currentJob.status as RecipeImportStatus, input.status)) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Ongeldige status transitie van '${currentJob.status}' naar '${input.status}'`,
        },
      };
    }

    // Prepare update data
    const updateData: any = {
      status: input.status,
      updated_at: new Date().toISOString(),
    };

    // Set finalized_at if status is finalized
    if (input.status === "finalized") {
      updateData.finalized_at = new Date().toISOString();
    }

    // Store error message in validation_errors_json if provided
    if (input.errorMessage) {
      updateData.validation_errors_json = {
        error: input.errorMessage,
        updatedAt: new Date().toISOString(),
      };
    }

    // Update recipe import job
    const { error: updateError } = await supabase
      .from("recipe_imports")
      .update(updateData)
      .eq("id", input.jobId)
      .eq("user_id", user.id); // Double-check user ownership

    if (updateError) {
      console.error("Error updating recipe import status:", updateError);
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: `Fout bij updaten recipe import status: ${updateError.message}`,
        },
      };
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Unexpected error in updateRecipeImportStatusAction:", error);
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Onbekende fout bij updaten recipe import status",
      },
    };
  }
}
