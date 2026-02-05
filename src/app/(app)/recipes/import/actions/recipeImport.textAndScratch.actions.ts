'use server';

import { createClient } from '@/src/lib/supabase/server';
import type {
  RecipeImportJob,
  RecipeImportStatus,
} from '../recipeImport.types';
import { importRecipeFromTextInputSchema } from '../recipeImport.schemas';
import { extractRecipeFromText } from '../services/geminiRecipeTextImport.service';

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR' | 'INTERNAL';
        message: string;
      };
    };

/** Minimal GeminiExtractedRecipe for "from scratch" (one empty ingredient, one empty step). */
const FROM_SCRATCH_RECIPE = {
  title: 'Nieuw recept',
  language_detected: 'nl',
  translated_to: null,
  servings: null,
  times: {
    prep_minutes: null,
    cook_minutes: null,
    total_minutes: null,
  },
  ingredients: [
    {
      original_line: '',
      name: '',
      quantity: null,
      unit: null,
      note: null,
      section: null,
    },
  ],
  instructions: [{ step: 1, text: '' }],
  confidence: { overall: null, fields: {} },
  warnings: [] as string[],
} as const;

/**
 * Import recipe from pasted text: analyse text with Gemini and create a ready_for_review job.
 */
export async function importRecipeFromTextAction(
  raw: unknown,
): Promise<
  | { ok: true; jobId: string; job: RecipeImportJob }
  | { ok: false; errorCode: string; message: string }
> {
  try {
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

    let input: { text: string };
    try {
      input = importRecipeFromTextInputSchema.parse(raw);
    } catch {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Voer recepttekst in (minimaal 10 tekens)',
      };
    }

    const extracted = await extractRecipeFromText(input.text);

    const { data: jobData, error: jobError } = await supabase
      .from('recipe_imports')
      .insert({
        user_id: user.id,
        status: 'ready_for_review' as RecipeImportStatus,
        source_image_meta: {
          source: 'text_import',
        },
        source_locale: extracted.language_detected || undefined,
        target_locale: 'nl',
        extracted_recipe_json: extracted,
        original_recipe_json: extracted,
        confidence_overall: extracted.confidence?.overall ?? null,
      })
      .select('id')
      .single();

    if (jobError) {
      console.error(
        '[importRecipeFromTextAction] Error creating job:',
        jobError,
      );
      return {
        ok: false,
        errorCode: 'INTERNAL',
        message: `Fout bij aanmaken import: ${jobError.message}`,
      };
    }

    // Optional: translate to Dutch if detected language is not Dutch
    const lang = (extracted.language_detected || '').toLowerCase();
    if (lang && lang !== 'nl') {
      try {
        const { translateRecipeImportAction } =
          await import('./recipeImport.translate.actions');
        await translateRecipeImportAction({ jobId: jobData.id });
      } catch {
        // Non-fatal; keep original
      }
    }

    const { data: freshData } = await supabase
      .from('recipe_imports')
      .select('*, original_recipe_json')
      .eq('id', jobData.id)
      .eq('user_id', user.id)
      .maybeSingle();

    const job: RecipeImportJob | undefined = freshData
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
            ? parseFloat(String(freshData.confidence_overall))
            : null,
          createdAt: freshData.created_at,
          updatedAt: freshData.updated_at,
          finalizedAt: freshData.finalized_at,
          recipeId: freshData.recipe_id || null,
        } as RecipeImportJob)
      : undefined;

    return {
      ok: true,
      jobId: jobData.id,
      job: job!,
    };
  } catch (err) {
    console.error('[importRecipeFromTextAction] Error:', err);
    const message =
      err instanceof Error
        ? err.message
        : 'Recept kon niet uit de tekst worden gehaald.';
    return {
      ok: false,
      errorCode: 'INTERNAL',
      message,
    };
  }
}

/**
 * Create a recipe import job "from scratch": empty recipe with one ingredient row and one instruction row for the user to fill.
 */
export async function createRecipeImportFromScratchAction(): Promise<
  ActionResult<{ jobId: string; job: RecipeImportJob }>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om een recept toe te voegen',
        },
      };
    }

    const { data: jobData, error: jobError } = await supabase
      .from('recipe_imports')
      .insert({
        user_id: user.id,
        status: 'ready_for_review' as RecipeImportStatus,
        source_image_meta: {
          source: 'from_scratch',
        },
        source_locale: 'nl',
        target_locale: 'nl',
        extracted_recipe_json: FROM_SCRATCH_RECIPE,
        original_recipe_json: FROM_SCRATCH_RECIPE,
        confidence_overall: null,
      })
      .select('id')
      .single();

    if (jobError) {
      console.error(
        '[createRecipeImportFromScratchAction] Error creating job:',
        jobError,
      );
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Fout bij aanmaken: ${jobError.message}`,
        },
      };
    }

    const { data: freshData } = await supabase
      .from('recipe_imports')
      .select('*, original_recipe_json')
      .eq('id', jobData.id)
      .eq('user_id', user.id)
      .maybeSingle();

    const job: RecipeImportJob | undefined = freshData
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
            ? parseFloat(String(freshData.confidence_overall))
            : null,
          createdAt: freshData.created_at,
          updatedAt: freshData.updated_at,
          finalizedAt: freshData.finalized_at,
          recipeId: freshData.recipe_id || null,
        } as RecipeImportJob)
      : undefined;

    return {
      ok: true,
      data: {
        jobId: jobData.id,
        job: job!,
      },
    };
  } catch (err) {
    console.error('[createRecipeImportFromScratchAction] Error:', err);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          err instanceof Error ? err.message : 'Onbekende fout bij aanmaken',
      },
    };
  }
}
