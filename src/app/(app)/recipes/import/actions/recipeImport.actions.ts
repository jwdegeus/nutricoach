'use server';

import { createClient } from '@/src/lib/supabase/server';
import type {
  RecipeImportJob,
  CreateRecipeImportInput,
  LoadRecipeImportInput,
  UpdateRecipeImportStatusInput,
  RecipeImportStatus,
} from '../recipeImport.types';
import {
  createRecipeImportInputSchema,
  loadRecipeImportInputSchema,
  updateRecipeImportStatusInputSchema,
  importRecipeFromUrlInputSchema,
} from '../recipeImport.schemas';
import type {
  ImportRecipeFromUrlResult,
  ImportRecipeFromUrlSuccess,
  ImportRecipeFromUrlError,
} from '../recipeImport.types';
import {
  processRecipeUrlWithGemini,
  RecipeImportAiParseError,
} from '../services/geminiRecipeUrlImport.service';
import {
  normalizeIngredient,
  normalizeIngredientFromCombinedText,
} from '../utils/normalizeIngredient';

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code:
          | 'AUTH_ERROR'
          | 'VALIDATION_ERROR'
          | 'DB_ERROR'
          | 'NOT_FOUND'
          | 'FORBIDDEN';
        message: string;
      };
    };

/**
 * Valid status transitions
 */
const VALID_STATUS_TRANSITIONS: Record<
  RecipeImportStatus,
  RecipeImportStatus[]
> = {
  uploaded: ['processing', 'failed'],
  processing: ['ready_for_review', 'failed'],
  ready_for_review: ['finalized', 'failed'],
  failed: ['uploaded', 'processing'], // Allow retry
  finalized: [], // Finalized is terminal
};

/**
 * Validate status transition
 */
function isValidStatusTransition(
  currentStatus: RecipeImportStatus,
  newStatus: RecipeImportStatus,
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
  raw: unknown,
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om een recept te importeren',
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
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input voor recipe import',
        },
      };
    }

    // Insert recipe import job
    const { data, error } = await supabase
      .from('recipe_imports')
      .insert({
        user_id: user.id, // Set server-side, not from client
        status: 'uploaded',
        source_image_path: input.sourceImagePath || null,
        source_image_meta: input.sourceImageMeta || null,
        source_locale: input.sourceLocale || null,
        target_locale: input.targetLocale || null,
      })
      .select('id, status')
      .single();

    if (error) {
      console.error('Error creating recipe import:', error);
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
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
    console.error('Unexpected error in createRecipeImportAction:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Onbekende fout bij aanmaken recipe import',
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
  raw: unknown,
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om recipe imports te bekijken',
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
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input voor load recipe import',
        },
      };
    }

    // Load recipe import job (include original_recipe_json)
    const { data, error } = await supabase
      .from('recipe_imports')
      .select('*, original_recipe_json')
      .eq('id', input.jobId)
      .eq('user_id', user.id) // Ensure user can only access own jobs
      .maybeSingle();

    if (error) {
      console.error('Error loading recipe import:', error);
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Fout bij ophalen recipe import: ${error.message}`,
        },
      };
    }

    if (!data) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Recipe import niet gevonden of geen toegang',
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
      const sourceImageMeta = job.sourceImageMeta as Record<string, unknown>;
      console.log(
        '[loadRecipeImportAction] Job source_image_meta:',
        JSON.stringify(
          {
            jobId: job.id,
            sourceImageMeta: sourceImageMeta,
            savedImageUrl: sourceImageMeta?.savedImageUrl,
            savedImagePath: sourceImageMeta?.savedImagePath,
            imageUrl: sourceImageMeta?.imageUrl,
            allKeys: Object.keys(sourceImageMeta),
          },
          null,
          2,
        ),
      );
    } else {
      console.log(
        '[loadRecipeImportAction] Job source_image_meta is null for jobId:',
        job.id,
      );
    }

    return {
      ok: true,
      data: job,
    };
  } catch (error) {
    console.error('Unexpected error in loadRecipeImportAction:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Onbekende fout bij ophalen recipe import',
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
  raw: unknown,
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om recipe import status te updaten',
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
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input voor update recipe import status',
        },
      };
    }

    // Load current job to validate status transition
    const { data: currentJob, error: loadError } = await supabase
      .from('recipe_imports')
      .select('status, user_id')
      .eq('id', input.jobId)
      .maybeSingle();

    if (loadError) {
      console.error(
        'Error loading recipe import for status update:',
        loadError,
      );
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Fout bij ophalen recipe import: ${loadError.message}`,
        },
      };
    }

    if (!currentJob) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Recipe import niet gevonden',
        },
      };
    }

    // Check if user owns this job
    if (currentJob.user_id !== user.id) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Geen toegang tot deze recipe import',
        },
      };
    }

    // Validate status transition
    if (
      !isValidStatusTransition(
        currentJob.status as RecipeImportStatus,
        input.status,
      )
    ) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Ongeldige status transitie van '${currentJob.status}' naar '${input.status}'`,
        },
      };
    }

    // Prepare update data
    const updateData: {
      status: string;
      updated_at: string;
      finalized_at?: string;
      validation_errors_json?: unknown;
    } = {
      status: input.status,
      updated_at: new Date().toISOString(),
    };

    // Set finalized_at if status is finalized
    if (input.status === 'finalized') {
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
      .from('recipe_imports')
      .update(updateData)
      .eq('id', input.jobId)
      .eq('user_id', user.id); // Double-check user ownership

    if (updateError) {
      console.error('Error updating recipe import status:', updateError);
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Fout bij updaten recipe import status: ${updateError.message}`,
        },
      };
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error('Unexpected error in updateRecipeImportStatusAction:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Onbekende fout bij updaten recipe import status',
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
  raw: unknown,
): Promise<ImportRecipeFromUrlResult> {
  const importStart = Date.now();
  let logEmitted = false;
  let domain = 'unknown';
  let urlPath = 'unknown';
  let importPath: 'jsonld' | 'heuristic' | 'gemini' = 'jsonld';
  let fetchMs: number | undefined;
  let jsonldMs: number | undefined;
  let heuristicMs: number | undefined;
  let geminiMs: number | undefined;
  let translateMs: number | undefined;
  let ingredientCount: number | undefined;
  let instructionCount: number | undefined;
  let geminiInfo:
    | {
        attempt?: number;
        retryReason?: string | null;
        parseFailed?: boolean;
        placeholdersInjected?: boolean;
        wasTruncated?: boolean;
      }
    | undefined;

  const emitLog = (outcome: 'success' | 'fail', jobId?: string) => {
    if (logEmitted) return;
    logEmitted = true;
    const payload = {
      eventName: 'recipe_url_import',
      domain,
      path: importPath,
      outcome,
      jobId,
      timings: {
        fetchMs,
        jsonldMs,
        heuristicMs,
        geminiMs,
        translateMs,
        totalMs: Date.now() - importStart,
      },
      gemini: geminiInfo,
      counts:
        ingredientCount != null || instructionCount != null
          ? { ingredientCount, instructionCount }
          : undefined,
      url: { path: urlPath },
    };
    console.info(JSON.stringify(payload));
  };

  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        errorCode: 'UNAUTHORIZED',
        message: 'Je moet ingelogd zijn om een recept te importeren',
      };
    }

    // Validate input
    let input;
    try {
      input = importRecipeFromUrlInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        errorCode: 'INVALID_URL',
        message: error instanceof Error ? error.message : 'Ongeldige URL',
      };
    }

    // Additional URL validation (beyond schema)
    let urlObj: URL;
    try {
      urlObj = new URL(input.url);
      urlPath = urlObj.pathname || 'unknown';
    } catch {
      emitLog('fail');
      return {
        ok: false,
        errorCode: 'INVALID_URL',
        message: 'Ongeldige URL format',
      };
    }

    // Extract domain name from URL (e.g., "ah.nl" from "https://www.ah.nl/...")
    domain = urlObj.hostname.replace(/^www\./, ''); // Remove www. prefix if present

    // Duplicate check: existing recipe with same source_url
    try {
      const normalizedUrl = input.url.replace(/\/+$/, '');
      const urlCandidates = [normalizedUrl, `${normalizedUrl}/`];
      const { data: existingMeal, error: existingError } = await supabase
        .from('custom_meals')
        .select('id,name,source_url')
        .eq('user_id', user.id)
        .in('source_url', urlCandidates)
        .maybeSingle();

      if (existingError) {
        console.error(
          '[importRecipeFromUrlAction] Duplicate check failed:',
          existingError,
        );
      } else if (existingMeal?.id) {
        emitLog('fail');
        const recipeId = String(existingMeal.id);
        const recipeName =
          existingMeal.name != null ? String(existingMeal.name) : undefined;
        return {
          ok: false,
          errorCode: 'DUPLICATE_URL',
          message:
            'Dit recept is al eerder geïmporteerd. Open het bestaande recept.',
          recipeId,
          recipeName,
        };
      }
    } catch (dupError) {
      console.error(
        '[importRecipeFromUrlAction] Duplicate check error:',
        dupError,
      );
    }

    // Fetch HTML from URL (with SSRF mitigation)
    let html: string;
    try {
      const { fetchHtml } = await import('../server/fetchAndParseRecipeJsonLd');
      const fetchStart = Date.now();
      html = await fetchHtml(input.url);
      fetchMs = Date.now() - fetchStart;
      console.log(
        `[importRecipeFromUrlAction] Fetched HTML, size: ${html.length} bytes`,
      );

      // Try JSON-LD first (faster and more reliable) – pass existing html to avoid duplicate fetch
      try {
        const { fetchAndParseRecipeJsonLd } =
          await import('../server/fetchAndParseRecipeJsonLd');
        const jsonLdStart = Date.now();
        const jsonLdResult = await fetchAndParseRecipeJsonLd(input.url, html);
        jsonldMs = Date.now() - jsonLdStart;
        console.log(
          '[importRecipeFromUrlAction] JSON-LD result:',
          jsonLdResult.ok ? 'OK' : 'FAILED',
          jsonLdResult.ok ? jsonLdResult.draft?.title : jsonLdResult.message,
        );

        if (jsonLdResult.ok && jsonLdResult.draft) {
          // Validate that we have actual recipe data
          if (
            jsonLdResult.draft.ingredients.length > 0 &&
            jsonLdResult.draft.steps.length > 0
          ) {
            importPath = 'jsonld';
            ingredientCount = jsonLdResult.draft.ingredients.length;
            instructionCount = jsonLdResult.draft.steps.length;
            // JSON-LD extraction succeeded - create job and save recipe (no auto-translate; user translates via button)
            console.log(
              '[importRecipeFromUrlAction] Recipe extracted via JSON-LD:',
              jsonLdResult.draft,
            );
            const ingredientsList = jsonLdResult.draft.ingredients.map(
              (ing) => {
                const text = ing.text.trim();
                let quantity: number | null = null;
                let unit: string | null = null;
                let name: string = text;
                let note: string | null = null;
                const noteMatch = text.match(/^(.+?)\s*\(([^)]+)\)$/);
                const mainPart = noteMatch ? noteMatch[1].trim() : text;
                if (noteMatch) note = noteMatch[2].trim();
                const qtyUnitMatch = mainPart.match(
                  /^([\d\s½¼¾⅓⅔⅛⅜⅝⅞]+)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(.+)$/,
                );
                if (qtyUnitMatch) {
                  const qtyStr = qtyUnitMatch[1].trim();
                  const fractionMap: Record<string, number> = {
                    '½': 0.5,
                    '¼': 0.25,
                    '¾': 0.75,
                    '⅓': 0.333,
                    '⅔': 0.667,
                    '⅛': 0.125,
                    '⅜': 0.375,
                    '⅝': 0.625,
                    '⅞': 0.875,
                  };
                  let qty = 0;
                  for (const part of qtyStr.split(/\s+/)) {
                    if (fractionMap[part]) qty += fractionMap[part];
                    else {
                      const num = parseFloat(part);
                      if (!isNaN(num)) qty += num;
                    }
                  }
                  if (qty > 0) {
                    quantity = qty;
                    unit = qtyUnitMatch[2].trim();
                    name = qtyUnitMatch[3].trim();
                  }
                } else {
                  const unitMatch = mainPart.match(
                    /^([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(.+)$/,
                  );
                  if (unitMatch) {
                    unit = unitMatch[1].trim();
                    name = unitMatch[2].trim();
                  } else {
                    // Fallback: try normalizer for "1/2 theelepel kurkumapoeder" etc.
                    const parsed =
                      normalizeIngredientFromCombinedText(mainPart);
                    if (parsed) {
                      quantity = parsed.quantity;
                      unit = parsed.unit;
                      name = parsed.name;
                    } else name = mainPart;
                  }
                }
                return {
                  original_line: ing.text,
                  name,
                  quantity,
                  unit,
                  note,
                  section: null as string | null,
                };
              },
            );
            const jsonLdExtractedRecipe = {
              title: jsonLdResult.draft.title,
              language_detected: jsonLdResult.draft.sourceLanguage || 'en',
              translated_to: null,
              description: jsonLdResult.draft.description,
              servings: jsonLdResult.draft.servings
                ? (() => {
                    const servingsNum = parseFloat(jsonLdResult.draft.servings);
                    return isNaN(servingsNum) || servingsNum <= 0
                      ? null
                      : Math.round(servingsNum);
                  })()
                : null,
              ingredients: ingredientsList,
              instructions: jsonLdResult.draft.steps.map((step, idx) => ({
                step: idx + 1,
                text: step.text,
              })),
              times: {
                prep_minutes: jsonLdResult.draft.prepTimeMinutes || null,
                cook_minutes: jsonLdResult.draft.cookTimeMinutes || null,
                total_minutes: jsonLdResult.draft.totalTimeMinutes || null,
              },
              confidence: { overall: 95, fields: {} },
              warnings: [],
            };
            const { data: jobData, error: jobError } = await supabase
              .from('recipe_imports')
              .insert({
                user_id: user.id,
                status: 'ready_for_review',
                source_image_meta: {
                  url: input.url,
                  domain: domain,
                  source: 'url_import',
                  ...(jsonLdResult.draft.imageUrl
                    ? { imageUrl: jsonLdResult.draft.imageUrl }
                    : {}),
                },
                source_locale: jsonLdResult.draft.sourceLanguage || undefined,
                extracted_recipe_json: jsonLdExtractedRecipe,
                original_recipe_json: jsonLdExtractedRecipe,
                confidence_overall: 95,
              })
              .select('id')
              .single();

            if (jobError) {
              console.error(
                '[importRecipeFromUrlAction] Error creating job:',
                jobError,
              );
              return {
                ok: false,
                errorCode: 'INTERNAL',
                message: `Fout bij aanmaken import job: ${jobError.message}`,
              };
            }

            // Download and save recipe image if available
            let savedImageUrl: string | null = null;
            let savedImagePath: string | null = null;
            if (jsonLdResult.draft.imageUrl) {
              console.log(
                '[importRecipeFromUrlAction] Image URL found:',
                jsonLdResult.draft.imageUrl,
              );
              console.log(
                '[importRecipeFromUrlAction] Downloading and saving recipe image...',
              );
              try {
                const { downloadAndSaveRecipeImage } =
                  await import('../services/recipeImageDownload.service');
                const imageResult = await downloadAndSaveRecipeImage(
                  jsonLdResult.draft.imageUrl,
                  user.id,
                );

                if (imageResult) {
                  savedImageUrl = imageResult.url;
                  savedImagePath = imageResult.path;
                  console.log(
                    '[importRecipeFromUrlAction] Image saved successfully:',
                    savedImageUrl,
                  );

                  // Update source_image_meta with saved image URL
                  await supabase
                    .from('recipe_imports')
                    .update({
                      source_image_meta: {
                        url: input.url,
                        domain: domain,
                        source: 'url_import',
                        imageUrl: jsonLdResult.draft.imageUrl, // Keep original URL for reference
                        savedImageUrl: savedImageUrl, // Add saved local URL
                        savedImagePath: savedImagePath, // Add saved path
                      },
                    })
                    .eq('id', jobData.id)
                    .eq('user_id', user.id);
                } else {
                  console.warn(
                    '[importRecipeFromUrlAction] Failed to download/save image, continuing without it',
                  );
                }
              } catch (imageError) {
                // Log but don't fail - recipe is already extracted
                console.error(
                  '[importRecipeFromUrlAction] Image download error (non-fatal):',
                  imageError,
                );
              }
            }

            // Step 2: Translate to user language (ingredients, description, instructions)
            console.log(
              '[importRecipeFromUrlAction] Translating JSON-LD recipe to user language...',
            );
            try {
              const translateStart = Date.now();
              const { translateRecipeImportAction } =
                await import('./recipeImport.translate.actions');
              const translateResult = await translateRecipeImportAction({
                jobId: jobData.id,
              });
              translateMs = Date.now() - translateStart;
              if (translateResult.ok) {
                console.log(
                  '[importRecipeFromUrlAction] Translation completed',
                );
              } else {
                console.error(
                  '[importRecipeFromUrlAction] Translation failed (non-fatal):',
                  translateResult.error,
                );
              }
            } catch (translateError) {
              console.error(
                '[importRecipeFromUrlAction] Translation error (non-fatal):',
                translateError,
              );
            }

            // Return fresh job (with translated extracted_recipe_json) so client shows it without refetch
            const { data: freshData } = await supabase
              .from('recipe_imports')
              .select('*, original_recipe_json')
              .eq('id', jobData.id)
              .eq('user_id', user.id)
              .maybeSingle();
            const job = freshData
              ? ({
                  id: freshData.id,
                  userId: freshData.user_id,
                  status: freshData.status as RecipeImportStatus,
                  sourceImagePath: freshData.source_image_path,
                  sourceImageMeta: freshData.source_image_meta,
                  sourceLocale: freshData.source_locale,
                  targetLocale: freshData.target_locale,
                  rawOcrText: freshData.raw_ocr_text,
                  geminiRawJson: freshData.gemini_raw_json,
                  extractedRecipeJson: freshData.extracted_recipe_json,
                  originalRecipeJson: freshData.original_recipe_json,
                  validationErrorsJson: freshData.validation_errors_json,
                  confidenceOverall: freshData.confidence_overall
                    ? parseFloat(freshData.confidence_overall.toString())
                    : null,
                  createdAt: freshData.created_at,
                  updatedAt: freshData.updated_at,
                  finalizedAt: freshData.finalized_at,
                  recipeId: freshData.recipe_id || null,
                } as RecipeImportJob)
              : undefined;

            emitLog('success', jobData.id);
            return {
              ok: true,
              jobId: jobData.id,
              job,
            };
          } else {
            console.log(
              '[importRecipeFromUrlAction] JSON-LD draft incomplete, trying Gemini',
            );
          }
        } else {
          console.log(
            '[importRecipeFromUrlAction] JSON-LD extraction failed:',
            !jsonLdResult.ok ? jsonLdResult.message : 'Unknown',
          );
        }
      } catch (jsonLdError) {
        // JSON-LD failed, continue with Gemini extraction
        console.log(
          '[importRecipeFromUrlAction] JSON-LD extraction error (continuing with Gemini):',
          jsonLdError,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch URL';
      const errorCode = (error as { code?: string })?.code;

      // Map specific error codes to user-friendly messages
      if (
        errorCode === 'ACCESS_DENIED' ||
        errorCode === 'NOT_FOUND' ||
        errorCode === 'CLIENT_ERROR'
      ) {
        emitLog('fail');
        return {
          ok: false,
          errorCode: 'INVALID_URL',
          message: errorMessage,
        };
      }

      if (errorCode === 'SERVER_ERROR') {
        emitLog('fail');
        return {
          ok: false,
          errorCode: 'INTERNAL',
          message: errorMessage,
        };
      }

      if (errorCode === 'UNSUPPORTED_CONTENT_TYPE') {
        emitLog('fail');
        return {
          ok: false,
          errorCode: 'INVALID_URL',
          message: errorMessage,
        };
      }

      if (errorCode === 'RESPONSE_TOO_LARGE') {
        emitLog('fail');
        return {
          ok: false,
          errorCode: 'INVALID_URL',
          message: errorMessage,
        };
      }

      if (errorCode === 'FETCH_TIMEOUT') {
        emitLog('fail');
        return {
          ok: false,
          errorCode: 'INVALID_URL',
          message: errorMessage,
        };
      }

      emitLog('fail');
      return {
        ok: false,
        errorCode: 'INVALID_URL',
        message: errorMessage,
      };
    }

    // Heuristic HTML headings parser (Ingredients/Instructions) before Gemini
    try {
      const heuristicStart = Date.now();
      const { extractRecipeFromHtmlHeadings } =
        await import('../server/fetchAndParseRecipeJsonLd');
      const heuristic = extractRecipeFromHtmlHeadings(html, input.url);
      heuristicMs = Date.now() - heuristicStart;
      const debugEnabled =
        typeof process !== 'undefined' &&
        process.env.RECIPE_IMPORT_DEBUG === 'true';
      if (debugEnabled) {
        console.log(
          '[importRecipeFromUrlAction] Heuristic headings',
          JSON.stringify({
            usedHeuristic: !!heuristic,
            ingredientCount: heuristic?.ingredients.length ?? 0,
            instructionCount: heuristic?.instructions.length ?? 0,
          }),
        );
      }

      if (heuristic) {
        importPath = 'heuristic';
        ingredientCount = heuristic.ingredients.length;
        instructionCount = heuristic.instructions.length;
        const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i);
        const languageDetected = langMatch ? langMatch[1] : null;
        const extractedHeuristic = {
          title: heuristic.title || 'Recept',
          language_detected: languageDetected,
          translated_to: null,
          servings: null,
          times: {
            prep_minutes: null,
            cook_minutes: null,
            total_minutes: null,
          },
          ingredients: heuristic.ingredients.map((text) => {
            const base = {
              original_line: text,
              name: text,
              quantity: null as number | null,
              unit: null as string | null,
              note: null as string | null,
              section: null as string | null,
            };
            return normalizeIngredient(base, { useOriginalLine: true });
          }),
          instructions: heuristic.instructions.map((text, idx) => ({
            step: idx + 1,
            text,
          })),
          confidence: { overall: 70, fields: {} },
          warnings: [],
        };

        const { data: jobData, error: jobError } = await supabase
          .from('recipe_imports')
          .insert({
            user_id: user.id,
            status: 'ready_for_review',
            source_image_meta: {
              url: input.url,
              domain: domain,
              source: 'url_import',
              ...(heuristic.imageUrl ? { imageUrl: heuristic.imageUrl } : {}),
            },
            source_locale: languageDetected || undefined,
            extracted_recipe_json: extractedHeuristic,
            original_recipe_json: extractedHeuristic,
            confidence_overall: extractedHeuristic.confidence?.overall || null,
          })
          .select('id')
          .single();

        if (jobError) {
          console.error(
            '[importRecipeFromUrlAction] Error creating job (heuristic):',
            jobError,
          );
          return {
            ok: false,
            errorCode: 'INTERNAL',
            message: `Fout bij aanmaken import job: ${jobError.message}`,
          };
        }

        console.log(
          '[importRecipeFromUrlAction] Recipe extracted via HTML headings heuristic',
        );

        // Download and save recipe image if available
        let savedImageUrl: string | null = null;
        let savedImagePath: string | null = null;
        if (heuristic.imageUrl) {
          console.log(
            '[importRecipeFromUrlAction] Heuristic image URL found:',
            heuristic.imageUrl,
          );
          console.log(
            '[importRecipeFromUrlAction] Downloading and saving heuristic image...',
          );
          try {
            const { downloadAndSaveRecipeImage } =
              await import('../services/recipeImageDownload.service');
            const imageResult = await downloadAndSaveRecipeImage(
              heuristic.imageUrl,
              user.id,
            );

            if (imageResult) {
              savedImageUrl = imageResult.url;
              savedImagePath = imageResult.path;
              console.log(
                '[importRecipeFromUrlAction] Heuristic image saved successfully:',
                savedImageUrl,
              );

              await supabase
                .from('recipe_imports')
                .update({
                  source_image_meta: {
                    url: input.url,
                    domain: domain,
                    source: 'url_import',
                    imageUrl: heuristic.imageUrl,
                    savedImageUrl: savedImageUrl,
                    savedImagePath: savedImagePath,
                  },
                })
                .eq('id', jobData.id)
                .eq('user_id', user.id);
            } else {
              console.warn(
                '[importRecipeFromUrlAction] Failed to download/save heuristic image, continuing without it',
              );
            }
          } catch (imageError) {
            console.error(
              '[importRecipeFromUrlAction] Heuristic image download error (non-fatal):',
              imageError,
            );
          }
        }

        // Step 2: Translate to user language (ingredients, description, instructions)
        console.log(
          '[importRecipeFromUrlAction] Translating heuristic recipe to user language...',
        );
        try {
          const translateStart = Date.now();
          const { translateRecipeImportAction } =
            await import('./recipeImport.translate.actions');
          const translateResult = await translateRecipeImportAction({
            jobId: jobData.id,
          });
          translateMs = Date.now() - translateStart;
          if (translateResult.ok) {
            console.log('[importRecipeFromUrlAction] Translation completed');
          } else {
            console.error(
              '[importRecipeFromUrlAction] Translation failed (non-fatal):',
              translateResult.error,
            );
          }
        } catch (translateError) {
          console.error(
            '[importRecipeFromUrlAction] Translation error (non-fatal):',
            translateError,
          );
        }

        // Return fresh job (with translated extracted_recipe_json) so client shows it without refetch
        const { data: freshData } = await supabase
          .from('recipe_imports')
          .select(
            'id, user_id, status, source_image_path, source_image_meta, source_locale, target_locale, raw_ocr_text, gemini_raw_json, extracted_recipe_json, original_recipe_json, validation_errors_json, confidence_overall, created_at, updated_at, finalized_at, recipe_id',
          )
          .eq('id', jobData.id)
          .eq('user_id', user.id)
          .maybeSingle();
        const job = freshData
          ? ({
              id: freshData.id,
              userId: freshData.user_id,
              status: freshData.status as RecipeImportStatus,
              sourceImagePath: freshData.source_image_path,
              sourceImageMeta: freshData.source_image_meta,
              sourceLocale: freshData.source_locale,
              targetLocale: freshData.target_locale,
              rawOcrText: freshData.raw_ocr_text,
              geminiRawJson: freshData.gemini_raw_json,
              extractedRecipeJson: freshData.extracted_recipe_json,
              originalRecipeJson: freshData.original_recipe_json,
              validationErrorsJson: freshData.validation_errors_json,
              confidenceOverall: freshData.confidence_overall
                ? parseFloat(freshData.confidence_overall.toString())
                : null,
              createdAt: freshData.created_at,
              updatedAt: freshData.updated_at,
              finalizedAt: freshData.finalized_at,
              recipeId: freshData.recipe_id || null,
            } as RecipeImportJob)
          : undefined;

        emitLog('success', jobData.id);
        return {
          ok: true,
          jobId: jobData.id,
          job,
        };
      }
    } catch (heuristicError) {
      console.error(
        '[importRecipeFromUrlAction] Heuristic headings extraction failed:',
        heuristicError,
      );
    }

    // Process with Gemini to extract recipe from HTML
    try {
      importPath = 'gemini';
      console.log(
        `[importRecipeFromUrlAction] Calling Gemini with HTML size: ${html.length} bytes`,
      );
      const geminiStart = Date.now();
      const geminiResult = await processRecipeUrlWithGemini({
        html,
        url: input.url,
      });
      geminiMs = Date.now() - geminiStart;

      console.log(
        `[importRecipeFromUrlAction] Gemini extraction completed. Ingredients: ${geminiResult.extracted.ingredients.length}, Instructions: ${geminiResult.extracted.instructions.length}`,
      );
      ingredientCount = geminiResult.extracted.ingredients.length;
      instructionCount = geminiResult.extracted.instructions.length;
      if (geminiResult.diagnostics) {
        geminiInfo = {
          attempt: geminiResult.diagnostics.attempt,
          retryReason: geminiResult.diagnostics.retryReason ?? undefined,
          parseFailed: false,
          placeholdersInjected:
            geminiResult.diagnostics.parseRepair
              .injectedPlaceholdersIngredients ||
            geminiResult.diagnostics.parseRepair
              .injectedPlaceholdersInstructions,
          wasTruncated: geminiResult.diagnostics.html.wasTruncated,
        };
      }

      // Check if extraction was successful (has ingredients and instructions)
      const hasIngredients = geminiResult.extracted.ingredients.length > 0;
      const hasInstructions = geminiResult.extracted.instructions.length > 0;
      const hasWarnings =
        geminiResult.extracted.warnings &&
        geminiResult.extracted.warnings.length > 0;

      // Check for placeholder/error indicators
      const hasPlaceholderData =
        (hasIngredients &&
          geminiResult.extracted.ingredients[0]?.name
            ?.toLowerCase()
            .includes('geen')) ||
        (hasInstructions &&
          geminiResult.extracted.instructions[0]?.text
            ?.toLowerCase()
            .includes('geen'));

      if (hasWarnings && hasPlaceholderData) {
        const warningMessage =
          geminiResult.extracted.warnings?.[0] ||
          'Geen receptinformatie gevonden op deze pagina.';
        console.log(
          '[importRecipeFromUrlAction] Placeholder data detected, returning error',
        );
        return {
          ok: false,
          errorCode: 'INVALID_URL',
          message: warningMessage,
        };
      }

      // Check if we have actual recipe data (not just placeholders)
      if (!hasIngredients || !hasInstructions) {
        const errorMessage = hasWarnings
          ? geminiResult.extracted.warnings?.[0] ||
            'Geen receptinformatie gevonden op deze pagina.'
          : 'Geen ingrediënten of instructies gevonden in het recept.';
        console.log(
          '[importRecipeFromUrlAction] Missing ingredients or instructions',
        );
        return {
          ok: false,
          errorCode: 'INVALID_URL',
          message: errorMessage,
        };
      }

      // Additional validation: check confidence score
      const confidence = geminiResult.extracted.confidence?.overall;
      if (confidence !== null && confidence !== undefined && confidence < 30) {
        const errorMessage = hasWarnings
          ? geminiResult.extracted.warnings?.[0] ||
            'Recept extractie had lage betrouwbaarheid.'
          : 'Recept extractie had lage betrouwbaarheid. Probeer een andere URL.';
        console.log(
          `[importRecipeFromUrlAction] Low confidence score: ${confidence}`,
        );
        return {
          ok: false,
          errorCode: 'INVALID_URL',
          message: errorMessage,
        };
      }

      // Create job and save extracted recipe
      console.log(
        '[importRecipeFromUrlAction] Recipe draft extracted via Gemini:',
        geminiResult.draft,
      );
      console.log(
        '[importRecipeFromUrlAction] Extracted recipe title:',
        geminiResult.extracted.title,
      );
      console.log(
        '[importRecipeFromUrlAction] Detected language:',
        geminiResult.extracted.language_detected,
      );

      // Download and save recipe image if available
      let savedImageUrl: string | null = null;
      let savedImagePath: string | null = null;
      if (geminiResult.draft.imageUrl) {
        console.log(
          '[importRecipeFromUrlAction] Image URL found:',
          geminiResult.draft.imageUrl,
        );
        console.log(
          '[importRecipeFromUrlAction] Downloading and saving recipe image...',
        );
        try {
          const { downloadAndSaveRecipeImage } =
            await import('../services/recipeImageDownload.service');
          const imageResult = await downloadAndSaveRecipeImage(
            geminiResult.draft.imageUrl,
            user.id,
          );

          if (imageResult) {
            savedImageUrl = imageResult.url;
            savedImagePath = imageResult.path;
            console.log(
              '[importRecipeFromUrlAction] Image saved successfully:',
              savedImageUrl,
            );
          } else {
            console.warn(
              '[importRecipeFromUrlAction] Failed to download/save image, continuing without it',
            );
          }
        } catch (imageError) {
          // Log but don't fail - recipe is already extracted
          console.error(
            '[importRecipeFromUrlAction] Image download error (non-fatal):',
            imageError,
          );
        }
      }

      // Normalize: no sections for URL import; merge short instruction steps into paragraph-style steps
      const { mergeInstructionsIntoParagraphs } =
        await import('../recipeInstructionUtils');
      const mergedInstructions = mergeInstructionsIntoParagraphs(
        geminiResult.extracted.instructions.map((i) => ({ text: i.text })),
      ).map((m, idx) => ({ step: idx + 1, text: m.text }));

      const extractedNoSections = {
        ...geminiResult.extracted,
        ingredients: geminiResult.extracted.ingredients.map((ing) => {
          const withNullSection = {
            ...ing,
            section: null as string | null,
          };
          return normalizeIngredient(withNullSection, {
            useOriginalLine: true,
          });
        }),
        instructions: mergedInstructions,
      };

      // Create job with extracted recipe
      const { data: jobData, error: jobError } = await supabase
        .from('recipe_imports')
        .insert({
          user_id: user.id,
          status: 'ready_for_review',
          source_image_meta: {
            url: input.url,
            domain: domain,
            source: 'url_import',
            ...(geminiResult.draft.imageUrl
              ? {
                  imageUrl: geminiResult.draft.imageUrl, // Keep original URL for reference
                  ...(savedImageUrl ? { savedImageUrl } : {}),
                  ...(savedImagePath ? { savedImagePath } : {}),
                }
              : {}),
          },
          source_locale: geminiResult.extracted.language_detected || undefined,
          gemini_raw_json: geminiResult.rawResponse,
          extracted_recipe_json: extractedNoSections,
          original_recipe_json: extractedNoSections,
          confidence_overall:
            geminiResult.extracted.confidence?.overall || null,
        })
        .select('id')
        .single();

      if (jobError) {
        console.error(
          '[importRecipeFromUrlAction] Error creating job:',
          jobError,
        );
        return {
          ok: false,
          errorCode: 'INTERNAL',
          message: `Fout bij aanmaken import job: ${jobError.message}`,
        };
      }

      console.log(`[importRecipeFromUrlAction] Recipe extracted successfully`);

      // Step 2: Translate to user language (ingredients, description, instructions)
      console.log(
        '[importRecipeFromUrlAction] Translating recipe to user language...',
      );
      try {
        const { translateRecipeImportAction } =
          await import('./recipeImport.translate.actions');
        const translateResult = await translateRecipeImportAction({
          jobId: jobData.id,
        });
        if (translateResult.ok) {
          console.log('[importRecipeFromUrlAction] Translation completed');
        } else {
          console.error(
            '[importRecipeFromUrlAction] Translation failed (non-fatal):',
            translateResult.error,
          );
        }
      } catch (translateError) {
        console.error(
          '[importRecipeFromUrlAction] Translation error (non-fatal):',
          translateError,
        );
      }

      // Return fresh job (with translated extracted_recipe_json) so client shows it without refetch
      const { data: freshData } = await supabase
        .from('recipe_imports')
        .select('*, original_recipe_json')
        .eq('id', jobData.id)
        .eq('user_id', user.id)
        .maybeSingle();
      const job = freshData
        ? ({
            id: freshData.id,
            userId: freshData.user_id,
            status: freshData.status as RecipeImportStatus,
            sourceImagePath: freshData.source_image_path,
            sourceImageMeta: freshData.source_image_meta,
            sourceLocale: freshData.source_locale,
            targetLocale: freshData.target_locale,
            rawOcrText: freshData.raw_ocr_text,
            geminiRawJson: freshData.gemini_raw_json,
            extractedRecipeJson: freshData.extracted_recipe_json,
            originalRecipeJson: freshData.original_recipe_json,
            validationErrorsJson: freshData.validation_errors_json,
            confidenceOverall: freshData.confidence_overall
              ? parseFloat(freshData.confidence_overall.toString())
              : null,
            createdAt: freshData.created_at,
            updatedAt: freshData.updated_at,
            finalizedAt: freshData.finalized_at,
            recipeId: freshData.recipe_id || null,
          } as RecipeImportJob)
        : undefined;

      const successPayload: ImportRecipeFromUrlSuccess = {
        ok: true,
        jobId: jobData.id,
        job,
      };
      if (geminiResult.diagnostics) {
        successPayload.diagnostics = geminiResult.diagnostics;
        console.log(
          '[importRecipeFromUrlAction] RECIPE_IMPORT_DEBUG',
          JSON.stringify({
            jobId: jobData.id,
            urlDomain: domain,
            diagnostics: geminiResult.diagnostics,
          }),
        );
      }
      emitLog('success', jobData.id);
      return successPayload;
    } catch (error) {
      console.error('Error processing recipe URL with Gemini:', error);

      if (error instanceof RecipeImportAiParseError) {
        const debugEnabled =
          typeof process !== 'undefined' &&
          process.env.RECIPE_IMPORT_DEBUG === 'true';
        const message =
          'AI kon geen geldig recept uit deze pagina halen. Probeer een andere URL of gebruik handmatige import.';
        const payload: ImportRecipeFromUrlError = {
          ok: false,
          errorCode: 'AI_EXTRACTION_FAILED',
          message,
          error: { code: 'AI_EXTRACTION_FAILED', message },
        };
        if (debugEnabled && error.diagnostics) {
          payload.diagnostics = error.diagnostics;
          geminiInfo = {
            attempt: error.diagnostics.attempt,
            retryReason: error.diagnostics.retryReason ?? undefined,
            parseFailed: true,
            placeholdersInjected:
              error.diagnostics.parseRepair.injectedPlaceholdersIngredients ||
              error.diagnostics.parseRepair.injectedPlaceholdersInstructions,
            wasTruncated: error.diagnostics.html.wasTruncated,
          };
        }
        emitLog('fail');
        return payload;
      }

      // Check if error message indicates access denied or no recipe found
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to extract recipe from URL';
      const isAccessDenied =
        errorMessage.toLowerCase().includes('access denied') ||
        errorMessage.toLowerCase().includes('toegang geweigerd') ||
        errorMessage.toLowerCase().includes('blokkeert toegang');
      const isNoRecipeFound =
        errorMessage.toLowerCase().includes('geen receptinformatie') ||
        errorMessage.toLowerCase().includes('no recipe found');

      if (isAccessDenied || isNoRecipeFound) {
        emitLog('fail');
        return {
          ok: false,
          errorCode: 'INVALID_URL',
          message: errorMessage,
        };
      }

      emitLog('fail');
      return {
        ok: false,
        errorCode: 'INTERNAL',
        message: errorMessage,
      };
    }
  } catch (error) {
    console.error('Unexpected error in importRecipeFromUrlAction:', error);
    emitLog('fail');
    return {
      ok: false,
      errorCode: 'INTERNAL',
      message:
        error instanceof Error
          ? error.message
          : 'Onbekende fout bij importeren recept van URL',
    };
  }
}
