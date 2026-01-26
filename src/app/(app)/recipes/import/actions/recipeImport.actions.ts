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
  importRecipeFromUrlInputSchema,
} from "../recipeImport.schemas";
import type { ImportRecipeFromUrlResult } from "../recipeImport.types";
import { fetchAndParseRecipeJsonLd } from "../server/fetchAndParseRecipeJsonLd";
import { processRecipeUrlWithGemini } from "../services/geminiRecipeUrlImport.service";

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

    // Load recipe import job (include original_recipe_json)
    const { data, error } = await supabase
      .from("recipe_imports")
      .select("*, original_recipe_json")
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
      originalRecipeJson: data.original_recipe_json,
      validationErrorsJson: data.validation_errors_json,
      confidenceOverall: data.confidence_overall
        ? parseFloat(data.confidence_overall.toString())
        : null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      finalizedAt: data.finalized_at,
      recipeId: data.recipe_id || null,
    };

    // Debug logging for source_image_meta
    if (job.sourceImageMeta) {
      const sourceImageMeta = job.sourceImageMeta as any;
      console.log("[loadRecipeImportAction] Job source_image_meta:", JSON.stringify({
        jobId: job.id,
        sourceImageMeta: sourceImageMeta,
        savedImageUrl: sourceImageMeta?.savedImageUrl,
        savedImagePath: sourceImageMeta?.savedImagePath,
        imageUrl: sourceImageMeta?.imageUrl,
        allKeys: Object.keys(sourceImageMeta),
      }, null, 2));
    } else {
      console.log("[loadRecipeImportAction] Job source_image_meta is null for jobId:", job.id);
    }

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

/**
 * Import a recipe from a URL
 * 
 * This is a stub implementation that validates the URL and user authentication.
 * Future steps will add:
 * - HTML fetching with SSRF mitigation
 * - Recipe parsing/extraction
 * - Gemini integration for recipe extraction
 * - Database writes for import jobs and recipes
 * 
 * @param raw - Raw input (will be validated)
 * @returns Success with optional jobId/recipeId, or error with errorCode and message
 */
export async function importRecipeFromUrlAction(
  raw: unknown
): Promise<ImportRecipeFromUrlResult> {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        errorCode: "UNAUTHORIZED",
        message: "Je moet ingelogd zijn om een recept te importeren",
      };
    }

    // Validate input
    let input;
    try {
      input = importRecipeFromUrlInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        errorCode: "INVALID_URL",
        message:
          error instanceof Error
            ? error.message
            : "Ongeldige URL",
      };
    }

    // Additional URL validation (beyond schema)
    let urlObj: URL;
    try {
      urlObj = new URL(input.url);
    } catch {
      return {
        ok: false,
        errorCode: "INVALID_URL",
        message: "Ongeldige URL format",
      };
    }

    // Extract domain name from URL (e.g., "ah.nl" from "https://www.ah.nl/...")
    const domain = urlObj.hostname.replace(/^www\./, ''); // Remove www. prefix if present

    // Fetch HTML from URL (with SSRF mitigation)
    let html: string;
    try {
      const { fetchHtml } = await import("../server/fetchAndParseRecipeJsonLd");
      html = await fetchHtml(input.url);
      console.log(`[importRecipeFromUrlAction] Fetched HTML, size: ${html.length} bytes`);
      
      // Try JSON-LD first (faster and more reliable)
      try {
        const { fetchAndParseRecipeJsonLd } = await import("../server/fetchAndParseRecipeJsonLd");
        const jsonLdResult = await fetchAndParseRecipeJsonLd(input.url);
        console.log("[importRecipeFromUrlAction] JSON-LD result:", jsonLdResult.ok ? "OK" : "FAILED", jsonLdResult.ok ? jsonLdResult.draft?.title : jsonLdResult.message);
        
        if (jsonLdResult.ok && jsonLdResult.draft) {
          // Validate that we have actual recipe data
          if (jsonLdResult.draft.ingredients.length > 0 && jsonLdResult.draft.steps.length > 0) {
            // JSON-LD extraction succeeded - create job and save recipe
            console.log("[importRecipeFromUrlAction] Recipe extracted via JSON-LD:", jsonLdResult.draft);
            
            // Create job
            const { data: jobData, error: jobError } = await supabase
              .from("recipe_imports")
              .insert({
                user_id: user.id,
                status: "ready_for_review",
                source_image_meta: {
                  url: input.url,
                  domain: domain,
                  source: "url_import",
                  ...(jsonLdResult.draft.imageUrl ? { imageUrl: jsonLdResult.draft.imageUrl } : {}), // Store image URL for later use
                },
                source_locale: jsonLdResult.draft.sourceLanguage || undefined,
                extracted_recipe_json: {
                  title: jsonLdResult.draft.title,
                  language_detected: jsonLdResult.draft.sourceLanguage || "en",
                  translated_to: null,
                  description: jsonLdResult.draft.description,
                  servings: jsonLdResult.draft.servings ? (() => {
                    // Convert servings string to number if possible
                    const servingsNum = parseFloat(jsonLdResult.draft.servings);
                    return isNaN(servingsNum) || servingsNum <= 0 ? null : Math.round(servingsNum);
                  })() : null,
                  ingredients: jsonLdResult.draft.ingredients.map(ing => {
                    // Parse ingredient text to extract quantity, unit, name, and note
                    const text = ing.text.trim();
                    let quantity: number | null = null;
                    let unit: string | null = null;
                    let name: string = text;
                    let note: string | null = null;

                    // Try to extract note (text in parentheses)
                    const noteMatch = text.match(/^(.+?)\s*\(([^)]+)\)$/);
                    const mainPart = noteMatch ? noteMatch[1].trim() : text;
                    if (noteMatch) {
                      note = noteMatch[2].trim();
                    }

                    // Try to parse quantity and unit
                    // Pattern: "1 ½ cup flour" or "1 lb ground chicken" or "2 cloves garlic"
                    const qtyUnitMatch = mainPart.match(/^([\d\s½¼¾⅓⅔⅛⅜⅝⅞]+)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(.+)$/);
                    if (qtyUnitMatch) {
                      // Parse fraction or decimal quantity
                      const qtyStr = qtyUnitMatch[1].trim();
                      const fractionMap: Record<string, number> = {
                        '½': 0.5, '¼': 0.25, '¾': 0.75,
                        '⅓': 0.333, '⅔': 0.667,
                        '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
                      };
                      
                      let qty = 0;
                      const parts = qtyStr.split(/\s+/);
                      for (const part of parts) {
                        if (fractionMap[part]) {
                          qty += fractionMap[part];
                        } else {
                          const num = parseFloat(part);
                          if (!isNaN(num)) {
                            qty += num;
                          }
                        }
                      }
                      
                      if (qty > 0) {
                        quantity = qty;
                        unit = qtyUnitMatch[2].trim();
                        name = qtyUnitMatch[3].trim();
                      }
                    } else {
                      // Try without quantity: "cup flour" or "cloves garlic"
                      const unitMatch = mainPart.match(/^([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(.+)$/);
                      if (unitMatch) {
                        unit = unitMatch[1].trim();
                        name = unitMatch[2].trim();
                      } else {
                        // Just name
                        name = mainPart;
                      }
                    }

                    return {
                      original_line: ing.text,
                      name,
                      quantity,
                      unit,
                      note,
                    };
                  }),
                  instructions: jsonLdResult.draft.steps.map((step, idx) => ({
                    step: idx + 1,
                    text: step.text,
                  })),
                  times: {
                    prep_minutes: jsonLdResult.draft.prepTimeMinutes || null,
                    cook_minutes: jsonLdResult.draft.cookTimeMinutes || null,
                    total_minutes: jsonLdResult.draft.totalTimeMinutes || null,
                  },
                  confidence: {
                    overall: 95,
                    fields: {},
                  },
                  warnings: [],
                },
                confidence_overall: 95, // JSON-LD is highly reliable
              })
              .select("id")
              .single();
            
            if (jobError) {
              console.error("[importRecipeFromUrlAction] Error creating job:", jobError);
              return {
                ok: false,
                errorCode: "INTERNAL",
                message: `Fout bij aanmaken import job: ${jobError.message}`,
              };
            }
            
            // Download and save recipe image if available
            let savedImageUrl: string | null = null;
            let savedImagePath: string | null = null;
            if (jsonLdResult.draft.imageUrl) {
              console.log("[importRecipeFromUrlAction] Image URL found:", jsonLdResult.draft.imageUrl);
              console.log("[importRecipeFromUrlAction] Downloading and saving recipe image...");
              try {
                const { downloadAndSaveRecipeImage } = await import("../services/recipeImageDownload.service");
                const imageResult = await downloadAndSaveRecipeImage(
                  jsonLdResult.draft.imageUrl,
                  user.id
                );

                if (imageResult) {
                  savedImageUrl = imageResult.url;
                  savedImagePath = imageResult.path;
                  console.log("[importRecipeFromUrlAction] Image saved successfully:", savedImageUrl);
                  
                  // Update source_image_meta with saved image URL
                  await supabase
                    .from("recipe_imports")
                    .update({
                      source_image_meta: {
                        url: input.url,
                        domain: domain,
                        source: "url_import",
                        imageUrl: jsonLdResult.draft.imageUrl, // Keep original URL for reference
                        savedImageUrl: savedImageUrl, // Add saved local URL
                        savedImagePath: savedImagePath, // Add saved path
                      },
                    })
                    .eq("id", jobData.id)
                    .eq("user_id", user.id);
                } else {
                  console.warn("[importRecipeFromUrlAction] Failed to download/save image, continuing without it");
                }
              } catch (imageError) {
                // Log but don't fail - recipe is already extracted
                console.error("[importRecipeFromUrlAction] Image download error (non-fatal):", imageError);
              }
            }

            // Automatically translate recipe if needed
            console.log("[importRecipeFromUrlAction] Auto-translating JSON-LD recipe...");
            try {
              const { translateRecipeImportAction } = await import("./recipeImport.translate.actions");
              const translateResult = await translateRecipeImportAction({
                jobId: jobData.id,
                // targetLocale will be determined from user preferences in the action
              });

              if (translateResult.ok) {
                console.log("[importRecipeFromUrlAction] Translation completed successfully");
              } else {
                // Log but don't fail - recipe is already extracted
                console.error("[importRecipeFromUrlAction] Translation failed (non-fatal):", translateResult.error);
              }
            } catch (translateError) {
              // Log but don't fail - recipe is already extracted
              console.error("[importRecipeFromUrlAction] Translation error (non-fatal):", translateError);
            }
            
            // JSON-LD extraction succeeded - recipe is ready
            
            return {
              ok: true,
              jobId: jobData.id,
            };
          } else {
            console.log("[importRecipeFromUrlAction] JSON-LD draft incomplete, trying Gemini");
          }
        } else {
          console.log("[importRecipeFromUrlAction] JSON-LD extraction failed:", jsonLdResult.message);
        }
      } catch (jsonLdError) {
        // JSON-LD failed, continue with Gemini extraction
        console.log("[importRecipeFromUrlAction] JSON-LD extraction error (continuing with Gemini):", jsonLdError);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch URL";
      const errorCode = (error as any)?.code;
      
      // Map specific error codes to user-friendly messages
      if (errorCode === "ACCESS_DENIED" || errorCode === "NOT_FOUND" || errorCode === "CLIENT_ERROR") {
        return {
          ok: false,
          errorCode: "INVALID_URL",
          message: errorMessage,
        };
      }

      if (errorCode === "SERVER_ERROR") {
        return {
          ok: false,
          errorCode: "INTERNAL",
          message: errorMessage,
        };
      }
      
      if (errorCode === "UNSUPPORTED_CONTENT_TYPE") {
        return {
          ok: false,
          errorCode: "INVALID_URL",
          message: errorMessage,
        };
      }
      
      if (errorCode === "RESPONSE_TOO_LARGE") {
        return {
          ok: false,
          errorCode: "INVALID_URL",
          message: errorMessage,
        };
      }

      if (errorCode === "FETCH_TIMEOUT") {
        return {
          ok: false,
          errorCode: "INVALID_URL",
          message: errorMessage,
        };
      }
      
      return {
        ok: false,
        errorCode: "INVALID_URL",
        message: errorMessage,
      };
    }

    // Process with Gemini to extract recipe from HTML
    try {
      console.log(`[importRecipeFromUrlAction] Calling Gemini with HTML size: ${html.length} bytes`);
      const geminiResult = await processRecipeUrlWithGemini({
        html,
        url: input.url,
      });

      console.log(`[importRecipeFromUrlAction] Gemini extraction completed. Ingredients: ${geminiResult.extracted.ingredients.length}, Instructions: ${geminiResult.extracted.instructions.length}`);

      // Check if extraction was successful (has ingredients and instructions)
      const hasIngredients = geminiResult.extracted.ingredients.length > 0;
      const hasInstructions = geminiResult.extracted.instructions.length > 0;
      const hasWarnings = geminiResult.extracted.warnings && geminiResult.extracted.warnings.length > 0;
      
      // Check for placeholder/error indicators
      const hasPlaceholderData = 
        (hasIngredients && geminiResult.extracted.ingredients[0]?.name?.toLowerCase().includes("geen")) ||
        (hasInstructions && geminiResult.extracted.instructions[0]?.text?.toLowerCase().includes("geen"));

      if (hasWarnings && hasPlaceholderData) {
        const warningMessage = geminiResult.extracted.warnings?.[0] || "Geen receptinformatie gevonden op deze pagina.";
        console.log("[importRecipeFromUrlAction] Placeholder data detected, returning error");
        return {
          ok: false,
          errorCode: "INVALID_URL",
          message: warningMessage,
        };
      }

      // Check if we have actual recipe data (not just placeholders)
      if (!hasIngredients || !hasInstructions) {
        const errorMessage = hasWarnings 
          ? (geminiResult.extracted.warnings?.[0] || "Geen receptinformatie gevonden op deze pagina.")
          : "Geen ingrediënten of instructies gevonden in het recept.";
        console.log("[importRecipeFromUrlAction] Missing ingredients or instructions");
        return {
          ok: false,
          errorCode: "INVALID_URL",
          message: errorMessage,
        };
      }

      // Additional validation: check confidence score
      const confidence = geminiResult.extracted.confidence?.overall;
      if (confidence !== null && confidence !== undefined && confidence < 30) {
        const errorMessage = hasWarnings 
          ? (geminiResult.extracted.warnings?.[0] || "Recept extractie had lage betrouwbaarheid.")
          : "Recept extractie had lage betrouwbaarheid. Probeer een andere URL.";
        console.log(`[importRecipeFromUrlAction] Low confidence score: ${confidence}`);
        return {
          ok: false,
          errorCode: "INVALID_URL",
          message: errorMessage,
        };
      }

      // Create job and save extracted recipe
      console.log("[importRecipeFromUrlAction] Recipe draft extracted via Gemini:", geminiResult.draft);
      console.log("[importRecipeFromUrlAction] Extracted recipe title:", geminiResult.extracted.title);
      console.log("[importRecipeFromUrlAction] Detected language:", geminiResult.extracted.language_detected);
      
      // Download and save recipe image if available
      let savedImageUrl: string | null = null;
      let savedImagePath: string | null = null;
      if (geminiResult.draft.imageUrl) {
        console.log("[importRecipeFromUrlAction] Image URL found:", geminiResult.draft.imageUrl);
        console.log("[importRecipeFromUrlAction] Downloading and saving recipe image...");
        try {
          const { downloadAndSaveRecipeImage } = await import("../services/recipeImageDownload.service");
          const imageResult = await downloadAndSaveRecipeImage(
            geminiResult.draft.imageUrl,
            user.id
          );

          if (imageResult) {
            savedImageUrl = imageResult.url;
            savedImagePath = imageResult.path;
            console.log("[importRecipeFromUrlAction] Image saved successfully:", savedImageUrl);
          } else {
            console.warn("[importRecipeFromUrlAction] Failed to download/save image, continuing without it");
          }
        } catch (imageError) {
          // Log but don't fail - recipe is already extracted
          console.error("[importRecipeFromUrlAction] Image download error (non-fatal):", imageError);
        }
      }

      // Create job with extracted recipe
      const { data: jobData, error: jobError } = await supabase
        .from("recipe_imports")
        .insert({
          user_id: user.id,
          status: "ready_for_review",
          source_image_meta: {
            url: input.url,
            domain: domain,
            source: "url_import",
            ...(geminiResult.draft.imageUrl ? { 
              imageUrl: geminiResult.draft.imageUrl, // Keep original URL for reference
              ...(savedImageUrl ? { savedImageUrl } : {}),
              ...(savedImagePath ? { savedImagePath } : {}),
            } : {}),
          },
          source_locale: geminiResult.extracted.language_detected || undefined,
          gemini_raw_json: geminiResult.rawResponse,
          extracted_recipe_json: geminiResult.extracted,
          confidence_overall: geminiResult.extracted.confidence?.overall || null,
        })
        .select("id")
        .single();

      if (jobError) {
        console.error("[importRecipeFromUrlAction] Error creating job:", jobError);
        return {
          ok: false,
          errorCode: "INTERNAL",
          message: `Fout bij aanmaken import job: ${jobError.message}`,
        };
      }

      console.log(`[importRecipeFromUrlAction] Recipe extracted successfully`);

      // Automatically translate recipe if needed
      console.log("[importRecipeFromUrlAction] Auto-translating recipe...");
      try {
        const { translateRecipeImportAction } = await import("./recipeImport.translate.actions");
        const translateResult = await translateRecipeImportAction({
          jobId: jobData.id,
          // targetLocale will be determined from user preferences in the action
        });

        if (translateResult.ok) {
          console.log("[importRecipeFromUrlAction] Translation completed successfully");
        } else {
          // Log but don't fail - recipe is already extracted
          console.error("[importRecipeFromUrlAction] Translation failed (non-fatal):", translateResult.error);
        }
      } catch (translateError) {
        // Log but don't fail - recipe is already extracted
        console.error("[importRecipeFromUrlAction] Translation error (non-fatal):", translateError);
      }

      return {
        ok: true,
        jobId: jobData.id,
      };
    } catch (error) {
      console.error("Error processing recipe URL with Gemini:", error);
      
      // Check if error message indicates access denied or no recipe found
      const errorMessage = error instanceof Error ? error.message : "Failed to extract recipe from URL";
      const isAccessDenied = errorMessage.toLowerCase().includes("access denied") || 
                            errorMessage.toLowerCase().includes("toegang geweigerd") ||
                            errorMessage.toLowerCase().includes("blokkeert toegang");
      const isNoRecipeFound = errorMessage.toLowerCase().includes("geen receptinformatie") ||
                             errorMessage.toLowerCase().includes("no recipe found");

      if (isAccessDenied || isNoRecipeFound) {
        return {
          ok: false,
          errorCode: "INVALID_URL",
          message: errorMessage,
        };
      }

      return {
        ok: false,
        errorCode: "INTERNAL",
        message: errorMessage,
      };
    }
  } catch (error) {
    console.error("Unexpected error in importRecipeFromUrlAction:", error);
    return {
      ok: false,
      errorCode: "INTERNAL",
      message:
        error instanceof Error
          ? error.message
          : "Onbekende fout bij importeren recept van URL",
    };
  }
}
