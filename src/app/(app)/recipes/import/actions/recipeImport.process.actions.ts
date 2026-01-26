"use server";

import { createClient } from "@/src/lib/supabase/server";
import {
  loadRecipeImportAction,
  updateRecipeImportStatusAction,
} from "./recipeImport.actions";
import { processRecipeImageWithGemini } from "../services/geminiRecipeImport.service";
import { ProfileService } from "@/src/lib/profile/profile.service";
import { z } from "zod";

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: "AUTH_ERROR" | "VALIDATION_ERROR" | "DB_ERROR" | "NOT_FOUND" | "FORBIDDEN" | "GEMINI_ERROR";
        message: string;
      };
    };

/**
 * Process recipe import input schema
 */
const processRecipeImportInputSchema = z
  .object({
    jobId: z.string().uuid("jobId must be a valid UUID"),
    imageDataUrl: z.string().optional(),
    imagePublicUrl: z.string().url().optional(),
    sourceLocale: z.string().nullable().optional(),
    targetLocale: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      // Exactly one image input must be present
      const hasDataUrl = !!data.imageDataUrl;
      const hasPublicUrl = !!data.imagePublicUrl;
      return hasDataUrl !== hasPublicUrl; // XOR: exactly one must be true
    },
    {
      message: "Exactly one of imageDataUrl or imagePublicUrl must be provided",
      path: ["imageDataUrl"],
    }
  );

/**
 * Maximum base64 image size (5MB)
 */
const MAX_BASE64_SIZE = 5 * 1024 * 1024;

/**
 * Extract image data and mime type from data URL
 */
function extractImageFromDataUrl(dataUrl: string): {
  base64Data: string;
  mimeType: string;
} {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL format");
  }

  const mimeType = match[1];
  const base64Data = match[2];

  // Validate size
  if (base64Data.length > MAX_BASE64_SIZE) {
    throw new Error(
      `IMAGE_TOO_LARGE: Image too large. Maximum base64 size is ${MAX_BASE64_SIZE / 1024 / 1024}MB. ` +
        `Current size: ${(base64Data.length / 1024 / 1024).toFixed(2)}MB`
    );
  }

  return { base64Data, mimeType };
}

/**
 * Process recipe import with Gemini Vision API
 * 
 * This action:
 * 1. Validates job ownership and status
 * 2. Transitions status to 'processing'
 * 3. Calls Gemini Vision API for OCR + extraction
 * 4. Writes results back to recipe_imports table
 * 5. Transitions status to 'ready_for_review' or 'failed'
 * 
 * @param raw - Raw input (will be validated)
 * @returns Success or error
 */
export async function processRecipeImportWithGeminiAction(
  raw: unknown
): Promise<ActionResult<void>> {
  console.log("[processRecipeImportWithGeminiAction] Called with raw input:", typeof raw, raw ? Object.keys(raw as any) : "null");
  
  try {
    console.log("[processRecipeImportWithGeminiAction] Getting authenticated user...");
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    console.log("[processRecipeImportWithGeminiAction] User:", user ? user.id : "null");

    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn om recipe imports te verwerken",
        },
      };
    }

    // Validate input
    console.log("[processRecipeImportWithGeminiAction] Validating input...");
    let input: z.infer<typeof processRecipeImportInputSchema>;
    try {
      input = processRecipeImportInputSchema.parse(raw);
      console.log("[processRecipeImportWithGeminiAction] Input validated, jobId:", input.jobId);
    } catch (error) {
      console.error("[processRecipeImportWithGeminiAction] Validation error:", error);
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Ongeldige input voor recipe import processing",
        },
      };
    }

    // Load job to check ownership and status
    console.log("[processRecipeImportWithGeminiAction] Loading job...");
    const loadResult = await loadRecipeImportAction({ jobId: input.jobId });
    console.log("[processRecipeImportWithGeminiAction] Load result:", loadResult.ok ? "OK" : "ERROR");

    if (!loadResult.ok) {
      return loadResult; // Return NOT_FOUND or FORBIDDEN
    }

    const job = loadResult.data;

    // Validate status transition (only allow from 'uploaded' or 'failed')
    if (job.status !== "uploaded" && job.status !== "failed") {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Ongeldige status transitie. Job status moet 'uploaded' of 'failed' zijn, maar is '${job.status}'`,
        },
      };
    }

    // Extract image data
    let imageData: string;
    let mimeType: string;

    if (input.imageDataUrl) {
      try {
        const extracted = extractImageFromDataUrl(input.imageDataUrl);
        // Use full data URL for Gemini (it handles data URLs)
        imageData = input.imageDataUrl;
        mimeType = extracted.mimeType;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Ongeldig image data URL formaat";
        
        // Check if it's IMAGE_TOO_LARGE error
        const isImageTooLarge = errorMessage.includes("IMAGE_TOO_LARGE");
        
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errorMessage,
          },
        };
      }
    } else if (input.imagePublicUrl) {
      // For public URLs, we'd need to fetch and convert to base64
      // For now, this is a placeholder - in real implementation, fetch from storage
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "imagePublicUrl wordt nog niet ondersteund. Gebruik imageDataUrl.",
        },
      };
    } else {
      // This should not happen due to schema validation, but handle it anyway
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Geen image input opgegeven",
        },
      };
    }

    // Step 1: Transition to 'processing'
    console.log("[processRecipeImportWithGeminiAction] Updating status to 'processing'...");
    const processingResult = await updateRecipeImportStatusAction({
      jobId: input.jobId,
      status: "processing",
    });
    console.log("[processRecipeImportWithGeminiAction] Status update result:", processingResult.ok ? "OK" : "ERROR");

    if (!processingResult.ok) {
      console.error("[processRecipeImportWithGeminiAction] Status update failed:", processingResult.error);
      return processingResult;
    }

    // Step 2: Process with Gemini (OCR + Extraction)
    let geminiResult: {
      extracted: any;
      rawResponse: string;
      ocrText?: string;
    };
    let validationErrors: any = null;

    try {
      console.log(`[RecipeImport] Calling processRecipeImageWithGemini...`);
      console.log(`[RecipeImport] Image data size: ${imageData.length} chars, mimeType: ${mimeType}`);
      const startTime = Date.now();
      
      // Add timeout for Gemini call (max 45 seconds)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Gemini API timeout: Call duurde langer dan 45 seconden"));
        }, 45000);
      });
      
      geminiResult = await Promise.race([
        processRecipeImageWithGemini({
          imageData,
          mimeType,
        }),
        timeoutPromise,
      ]);
      
      const duration = Date.now() - startTime;
      console.log(`[RecipeImport] Gemini processing completed in ${duration}ms`);
    } catch (error) {
      // Gemini call failed
      const errorMessage =
        error instanceof Error ? error.message : "Unknown Gemini error";

      // Determine error stage
      let errorStage: "gemini_call" | "parse" | "validate" = "gemini_call";
      if (errorMessage.includes("parse") || errorMessage.includes("JSON")) {
        errorStage = "parse";
      } else if (errorMessage.includes("validation") || errorMessage.includes("schema")) {
        errorStage = "validate";
      }

      // Update status to failed
      await updateRecipeImportStatusAction({
        jobId: input.jobId,
        status: "failed",
        errorMessage: `Gemini processing failed: ${errorMessage}`,
      });

      // Store error details (no secrets)
      const sanitizedMessage = errorMessage
        .replace(/api[_-]?key/gi, "[REDACTED]")
        .replace(/GEMINI_API_KEY/gi, "[REDACTED]")
        .substring(0, 1000); // Limit length

      validationErrors = {
        stage: errorStage,
        message: sanitizedMessage,
        timestamp: new Date().toISOString(),
      };

      // Try to save raw response if available (might be partial)
      try {
        await supabase
          .from("recipe_imports")
          .update({
            validation_errors_json: validationErrors,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.jobId)
          .eq("user_id", user.id);
      } catch (dbError) {
        // Log but don't fail - we already set status to failed
        console.error("Failed to save error details:", dbError);
      }

      return {
        ok: false,
        error: {
          code: "GEMINI_ERROR",
          message: `Gemini verwerking mislukt: ${errorMessage}`,
        },
      };
    }

    // Step 3: Write results back to database
    try {
      // Parse raw response to JSON for storage (but keep original string for reference)
      let geminiRawJson: any = null;
      try {
        geminiRawJson = JSON.parse(geminiResult.rawResponse);
        // Remove secrets if present
        if (typeof geminiRawJson === "object" && geminiRawJson !== null) {
          delete geminiRawJson.apiKey;
          delete geminiRawJson.api_key;
          delete geminiRawJson.key;
        }
      } catch {
        // If parse fails, store as string in an object
        geminiRawJson = { raw_text: geminiResult.rawResponse.substring(0, 10000) }; // Limit size
      }

      const updateData: any = {
        raw_ocr_text: geminiResult.ocrText || null,
        gemini_raw_json: geminiRawJson,
        extracted_recipe_json: geminiResult.extracted,
        confidence_overall: geminiResult.extracted.confidence?.overall || null,
        validation_errors_json: validationErrors,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from("recipe_imports")
        .update(updateData)
        .eq("id", input.jobId)
        .eq("user_id", user.id);

      if (updateError) {
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      // Step 4: Automatically translate recipe if needed
      console.log("[processRecipeImportWithGeminiAction] Step 4: Auto-translating recipe...");
      try {
        const { translateRecipeImportAction } = await import("./recipeImport.translate.actions");
        const translateResult = await translateRecipeImportAction({
          jobId: input.jobId,
          // targetLocale will be determined from user preferences in the action
        });

        if (translateResult.ok) {
          console.log("[processRecipeImportWithGeminiAction] Translation completed successfully");
        } else {
          // Log but don't fail - recipe is already extracted
          console.error("[processRecipeImportWithGeminiAction] Translation failed (non-fatal):", translateResult.error);
        }
      } catch (translateError) {
        // Log but don't fail - recipe is already extracted
        console.error("[processRecipeImportWithGeminiAction] Translation error (non-fatal):", translateError);
      }

      // Step 5: Transition to 'ready_for_review'
      const reviewResult = await updateRecipeImportStatusAction({
        jobId: input.jobId,
        status: "ready_for_review",
      });

      if (!reviewResult.ok) {
        // Log but don't fail - data is already saved
        console.error("Failed to transition to ready_for_review:", reviewResult.error);
      }

      return {
        ok: true,
        data: undefined,
      };
    } catch (error) {
      // Database write failed
      const errorMessage =
        error instanceof Error ? error.message : "Unknown database error";

      // Try to set status to failed
      await updateRecipeImportStatusAction({
        jobId: input.jobId,
        status: "failed",
        errorMessage: `Database write failed: ${errorMessage}`,
      });

      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: `Fout bij opslaan resultaten: ${errorMessage}`,
        },
      };
    }
  } catch (error) {
    console.error("Unexpected error in processRecipeImportWithGeminiAction:", error);
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Onbekende fout bij verwerken recipe import",
      },
    };
  }
}
