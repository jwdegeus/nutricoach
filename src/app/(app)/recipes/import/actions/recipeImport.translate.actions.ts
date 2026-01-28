'use server';

import { createClient } from '@/src/lib/supabase/server';
import { z } from 'zod';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import type { GeminiExtractedRecipe } from '../recipeImport.gemini.schemas';

/** Woorden die typisch Engels zijn in recepten; als deze in de "vertaalde" tekst staan bij target nl, opnieuw per item vertalen */
const ENGLISH_RECIPE_MARKERS =
  /\b(tomatoes|cucumbers|scallions|peppers|place|add|stir|mix|slice|chop|cup|tablespoon|teaspoon|ounces|recipe|salad)\b/i;

/** Extract only numbered list lines from Gemini response (skip preamble like "Here are the translated...") */
function extractNumberedLines(response: string): string[] {
  return response
    .trim()
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\.?\s*/.test(line))
    .map((line) => line.replace(/^\d+\.?\s*/, '').trim());
}

function looksLikeEnglish(
  text: string | undefined,
  original: string | undefined,
): boolean {
  if (!text || !original) return false;
  const t = text.trim().toLowerCase();
  const o = original.trim().toLowerCase();
  if (t === o) return true;
  return ENGLISH_RECIPE_MARKERS.test(t);
}

/**
 * Convert English units to Dutch/metric units
 */
function convertUnitToDutch(
  unit: string | null | undefined,
  quantity: number | null | undefined,
): { unit: string | null; quantity: number | null } {
  if (!unit || quantity == null || quantity === undefined) {
    return { unit: unit || null, quantity: quantity ?? null };
  }

  const lowerUnit = unit.toLowerCase().trim();

  // Volume conversions
  if (lowerUnit.includes('cup') || lowerUnit === 'c' || lowerUnit === 'c.') {
    return { unit: 'ml', quantity: Math.round(quantity * 240) };
  }
  if (
    lowerUnit.includes('tablespoon') ||
    lowerUnit === 'tbsp' ||
    lowerUnit === 'tbs' ||
    lowerUnit === 'T' ||
    lowerUnit === 'T.'
  ) {
    return { unit: 'el', quantity: Math.round(quantity) };
  }
  if (
    lowerUnit.includes('teaspoon') ||
    lowerUnit === 'tsp' ||
    lowerUnit === 't' ||
    lowerUnit === 't.'
  ) {
    return { unit: 'tl', quantity: Math.round(quantity) };
  }
  if (
    lowerUnit.includes('fluid ounce') ||
    lowerUnit === 'fl oz' ||
    lowerUnit === 'fl. oz.'
  ) {
    return { unit: 'ml', quantity: Math.round(quantity * 30) };
  }
  if (lowerUnit === 'pint' || lowerUnit === 'pt' || lowerUnit === 'pt.') {
    return { unit: 'ml', quantity: Math.round(quantity * 500) };
  }
  if (lowerUnit === 'quart' || lowerUnit === 'qt' || lowerUnit === 'qt.') {
    return { unit: 'ml', quantity: Math.round(quantity * 1000) };
  }

  // Weight conversions
  if (lowerUnit.includes('ounce') && !lowerUnit.includes('fluid')) {
    if (lowerUnit === 'oz' || lowerUnit === 'oz.') {
      return { unit: 'g', quantity: Math.round(quantity * 28) };
    }
  }
  if (
    lowerUnit.includes('pound') ||
    lowerUnit === 'lb' ||
    lowerUnit === 'lbs' ||
    lowerUnit === 'lb.'
  ) {
    return { unit: 'g', quantity: Math.round(quantity * 450) };
  }

  // Keep metric units as-is
  if (
    [
      'g',
      'kg',
      'ml',
      'l',
      'el',
      'tl',
      'gram',
      'kilogram',
      'milliliter',
      'liter',
      'eetlepel',
      'theelepel',
    ].includes(lowerUnit)
  ) {
    return { unit, quantity };
  }

  // Unknown unit, keep as-is
  return { unit, quantity };
}

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
 * Translate recipe import input schema
 */
const translateRecipeImportInputSchema = z.object({
  jobId: z.string().uuid('jobId must be a valid UUID'),
  targetLocale: z.enum(['nl', 'en']).optional(),
});

/**
 * Translate recipe import by translating the extracted recipe
 *
 * @param raw - Raw input (will be validated)
 * @returns Success or error
 */
export async function translateRecipeImportAction(
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
          message: 'Je moet ingelogd zijn om recipe imports te vertalen',
        },
      };
    }

    // Validate input
    let input: z.infer<typeof translateRecipeImportInputSchema>;
    try {
      input = translateRecipeImportInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input voor recipe import translation',
        },
      };
    }

    // Load job to check ownership and get extracted recipe
    const { data: job, error: loadError } = await supabase
      .from('recipe_imports')
      .select('*, original_recipe_json')
      .eq('id', input.jobId)
      .eq('user_id', user.id)
      .single();

    if (loadError || !job) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Recipe import job niet gevonden of geen toegang',
        },
      };
    }

    if (!job.extracted_recipe_json) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Geen geëxtraheerd recept gevonden. Extracteer eerst het recept.',
        },
      };
    }

    // Get user's language preference for translation target
    const { ProfileService } =
      await import('@/src/lib/profile/profile.service');
    const profileService = new ProfileService();
    const userLanguage = await profileService.getUserLanguage(user.id);
    const targetLocale = input.targetLocale || userLanguage || 'nl';

    // Use original_recipe_json if available, otherwise use extracted_recipe_json
    // IMPORTANT: Always use original_recipe_json for translation source to preserve original
    const _originalExtracted = (job.original_recipe_json ||
      job.extracted_recipe_json) as GeminiExtractedRecipe;
    const currentExtracted = job.extracted_recipe_json as GeminiExtractedRecipe;

    // Determine which version to translate from
    // If original_recipe_json exists, use that (it's the untranslated version)
    // Otherwise, check if current extracted_recipe_json is already translated
    const extracted: GeminiExtractedRecipe = job.original_recipe_json
      ? (job.original_recipe_json as GeminiExtractedRecipe)
      : currentExtracted;

    const sourceLocale = extracted.language_detected || 'en';

    // If already in target language, skip translation
    if (sourceLocale === targetLocale) {
      console.log(
        `[translateRecipeImportAction] Recipe already in target language ${targetLocale}, skipping translation`,
      );
      return { ok: true, data: undefined };
    }

    // Check if already translated (check current extracted_recipe_json)
    if (currentExtracted && currentExtracted.translated_to === targetLocale) {
      console.log(
        `[translateRecipeImportAction] Recipe already translated to ${targetLocale}, skipping`,
      );
      return { ok: true, data: undefined };
    }

    console.log(
      `[translateRecipeImportAction] Starting translation. Source: ${sourceLocale}, Target: ${targetLocale}`,
    );
    console.log(
      `[translateRecipeImportAction] Original title: "${extracted.title}"`,
    );
    console.log(
      `[translateRecipeImportAction] Has original_recipe_json: ${!!job.original_recipe_json}`,
    );
    console.log(
      `[translateRecipeImportAction] Current extracted_recipe_json.translated_to: ${currentExtracted?.translated_to || 'null'}`,
    );

    console.log(
      `[translateRecipeImportAction] Translating recipe from ${sourceLocale} to ${targetLocale}`,
    );

    // Translate using Gemini
    const gemini = getGeminiClient();
    const modelName = gemini.getModelName('translate');
    console.log(`[translateRecipeImportAction] Using model: ${modelName}`);
    const translated: GeminiExtractedRecipe = { ...extracted };

    // Translate title
    if (extracted.title) {
      const titlePrompt =
        targetLocale === 'nl'
          ? `Vertaal deze recepttitel naar het Nederlands. Geef ALLEEN de Nederlandse titel, geen uitleg of Engels.

"${extracted.title}"

Nederlandse titel:`
          : `Translate this recipe title to English. Return ONLY the English title, nothing else.

"${extracted.title}"

English title:`;

      try {
        const titleResponse = await gemini.generateText({
          prompt: titlePrompt,
          temperature: 0.2,
          purpose: 'translate',
        });
        translated.title =
          titleResponse
            .trim()
            .replace(/^["']|["']$/g, '')
            .trim() || extracted.title;
        if (
          targetLocale === 'nl' &&
          looksLikeEnglish(translated.title, extracted.title)
        ) {
          const retryResponse = await gemini.generateText({
            prompt: `Vertaal naar Nederlands, alleen het antwoord: "${extracted.title}"`,
            temperature: 0.1,
            purpose: 'translate',
          });
          translated.title =
            retryResponse
              .trim()
              .replace(/^["']|["']$/g, '')
              .trim() || extracted.title;
        }
        console.log(
          `[translateRecipeImportAction] Title translated: "${extracted.title}" → "${translated.title}"`,
        );
      } catch (error) {
        console.error(
          `[translateRecipeImportAction] Failed to translate title:`,
          error,
        );
        translated.title = extracted.title;
      }
    }

    // Translate description (omschrijving) if present
    const desc = (extracted as { description?: string }).description;
    if (desc && typeof desc === 'string' && desc.trim()) {
      const descPrompt =
        targetLocale === 'nl'
          ? `Vertaal de volgende receptomschrijving naar het Nederlands. Geef ALLEEN de Nederlandse tekst, geen uitleg.\n\n"${desc.trim()}"\n\nNederlandse omschrijving:`
          : `Translate the following recipe description to English. Return ONLY the English text, nothing else.\n\n"${desc.trim()}"\n\nEnglish description:`;
      try {
        const descResponse = await gemini.generateText({
          prompt: descPrompt,
          temperature: 0.2,
          purpose: 'translate',
        });
        const translatedDesc =
          descResponse
            .trim()
            .replace(/^["']|["']$/g, '')
            .trim() || desc;
        (translated as { description?: string }).description = translatedDesc;
      } catch (error) {
        console.error(
          `[translateRecipeImportAction] Failed to translate description:`,
          error,
        );
        (translated as { description?: string }).description = desc;
      }
    }

    // Translate ingredients in batch
    if (extracted.ingredients && extracted.ingredients.length > 0) {
      // Build ingredients list for batch translation
      const ingredientsList = extracted.ingredients
        .map((ing, idx) => {
          let text = ing.name || '';
          if (ing.quantity !== null && ing.quantity !== undefined) {
            text = `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''} ${text}`;
          } else if (ing.unit) {
            text = `${ing.unit} ${text}`;
          }
          if (ing.note) {
            text = `${text} (${ing.note})`;
          }
          return `${idx + 1}. ${text}`;
        })
        .join('\n');

      const ingredientsPrompt =
        targetLocale === 'nl'
          ? `Vertaal de volgende recept-ingrediënten naar het Nederlands. Je antwoord moet ALLEEN in het Nederlands zijn (geen Engels). Gebruik natuurlijke Nederlandse namen (tomaten, komkommers, uien, etc.). Converteer eenheden naar metrisch waar nodig (cups → ml, oz → g). Geef ALLEEN een genummerde lijst: regel 1 begint met "1. ", regel 2 met "2. ", enz. Geen introductie, geen uitleg, geen andere tekst.

Ingredients:
${ingredientsList}

Antwoord (alleen genummerde lijst, Nederlands):`
          : `Translate the following recipe ingredients to English. Reply with ONLY a numbered list: line 1 must start with "1. ", line 2 with "2. ", etc. No introduction, no explanation, no other text.

Ingredients:
${ingredientsList}

Reply (numbered list only):`;

      try {
        const ingredientsResponse = await gemini.generateText({
          prompt: ingredientsPrompt,
          temperature: 0.3,
          purpose: 'translate',
        });

        // Parse translated ingredients (only numbered lines to skip preamble)
        const translatedLines = extractNumberedLines(ingredientsResponse);
        const translatedIngredients = await Promise.all(
          extracted.ingredients.map(async (ing, idx) => {
            const translatedIng = { ...ing };

            // Try to extract translated line (extractNumberedLines already stripped numbering)
            const translatedLine = translatedLines[idx];

            if (translatedLine) {
              // Try to parse quantity, unit, name, and note
              // Pattern: "quantity unit name (note)" or "unit name (note)" or "name (note)" or "name"
              const noteMatch = translatedLine.match(/^(.+?)\s*\(([^)]+)\)$/);
              const mainPart = noteMatch ? noteMatch[1] : translatedLine;
              const note = noteMatch ? noteMatch[2] : null;

              // Try to extract quantity and unit
              const qtyUnitMatch = mainPart.match(
                /^([\d.,]+)\s*([a-zA-Z]+)\s+(.+)$/,
              );
              if (qtyUnitMatch) {
                const qty = parseFloat(qtyUnitMatch[1].replace(',', '.'));
                const unit = qtyUnitMatch[2];
                const name = qtyUnitMatch[3].trim();

                translatedIng.quantity = qty;
                translatedIng.unit = unit;
                translatedIng.name = name;
              } else {
                // Try unit without quantity
                const unitMatch = mainPart.match(/^([a-zA-Z]+)\s+(.+)$/);
                if (unitMatch) {
                  translatedIng.unit = unitMatch[1];
                  translatedIng.name = unitMatch[2].trim();
                } else {
                  // Just name
                  translatedIng.name = mainPart.trim();
                }
              }

              if (note) {
                translatedIng.note = note;
              }
            }

            // Als batch nog Engels teruggeeft bij target nl, per item vertalen
            if (
              targetLocale === 'nl' &&
              looksLikeEnglish(translatedIng.name, ing.name) &&
              ing.name
            ) {
              try {
                const nameResponse = await gemini.generateText({
                  prompt: `Vertaal dit recept-ingrediënt naar het Nederlands. Alleen het Nederlandse woord/zin, geen uitleg.\n"${ing.name}"`,
                  temperature: 0.2,
                  purpose: 'translate',
                });
                translatedIng.name =
                  nameResponse
                    .trim()
                    .replace(/^["']|["']$/g, '')
                    .trim() || ing.name;
              } catch {
                translatedIng.name = ing.name;
              }
            }

            if (!translatedLine && ing.name) {
              // Fallback: translate name only
              const namePrompt =
                targetLocale === 'nl'
                  ? `Translate this ingredient name to Dutch: "${ing.name}"`
                  : `Translate this ingredient name to English: "${ing.name}"`;
              try {
                const nameResponse = await gemini.generateText({
                  prompt: namePrompt,
                  temperature: 0.3,
                  purpose: 'translate',
                });
                translatedIng.name =
                  nameResponse.trim().replace(/^["']|["']$/g, '') || ing.name;
              } catch {
                translatedIng.name = ing.name;
              }
            }

            // Convert units if translating to Dutch
            if (
              targetLocale === 'nl' &&
              translatedIng.unit &&
              translatedIng.quantity
            ) {
              const converted = convertUnitToDutch(
                translatedIng.unit,
                translatedIng.quantity,
              );
              translatedIng.unit = converted.unit;
              translatedIng.quantity = converted.quantity;
            }

            return translatedIng;
          }),
        );

        translated.ingredients = translatedIngredients;
        console.log(
          `[translateRecipeImportAction] Translated ${translatedIngredients.length} ingredients in batch`,
        );
      } catch (error) {
        console.error(
          `[translateRecipeImportAction] Failed to translate ingredients in batch:`,
          error,
        );
        // Fallback: translate individually
        console.log(
          `[translateRecipeImportAction] Falling back to individual translation...`,
        );
        for (let i = 0; i < extracted.ingredients.length; i++) {
          const ing = extracted.ingredients[i];
          const translatedIng = { ...ing };

          if (ing.name) {
            const namePrompt =
              targetLocale === 'nl'
                ? `Translate this ingredient name to Dutch: "${ing.name}"`
                : `Translate this ingredient name to English: "${ing.name}"`;
            try {
              const nameResponse = await gemini.generateText({
                prompt: namePrompt,
                temperature: 0.3,
                purpose: 'translate',
              });
              translatedIng.name =
                nameResponse.trim().replace(/^["']|["']$/g, '') || ing.name;
            } catch {
              translatedIng.name = ing.name;
            }
          }

          if (targetLocale === 'nl' && ing.unit && ing.quantity) {
            const converted = convertUnitToDutch(ing.unit, ing.quantity);
            translatedIng.unit = converted.unit;
            translatedIng.quantity = converted.quantity;
          }

          if (ing.note) {
            const notePrompt =
              targetLocale === 'nl'
                ? `Translate to Dutch: "${ing.note}"`
                : `Translate to English: "${ing.note}"`;
            try {
              const noteResponse = await gemini.generateText({
                prompt: notePrompt,
                temperature: 0.3,
                purpose: 'translate',
              });
              translatedIng.note =
                noteResponse.trim().replace(/^["']|["']$/g, '') || ing.note;
            } catch {
              translatedIng.note = ing.note;
            }
          }

          translated.ingredients[i] = translatedIng;
        }
      }
    }

    // Translate instructions in batch
    if (extracted.instructions && extracted.instructions.length > 0) {
      // Build instructions list for batch translation
      const instructionsText = extracted.instructions
        .map((inst, _idx) => {
          const text = inst.text || '';
          // Convert temperatures if translating to Dutch
          if (targetLocale === 'nl' && sourceLocale === 'en') {
            return text
              .replace(/(\d+)\s*°?\s*F/gi, (match, temp) => {
                const fahrenheit = parseInt(temp);
                const celsius = Math.round(((fahrenheit - 32) * 5) / 9 / 5) * 5;
                return `${celsius}°C`;
              })
              .replace(
                /(\d+)\s*-\s*(\d+)\s*°?\s*F/gi,
                (match, temp1, temp2) => {
                  const f1 = parseInt(temp1);
                  const f2 = parseInt(temp2);
                  const c1 = Math.round(((f1 - 32) * 5) / 9 / 5) * 5;
                  const c2 = Math.round(((f2 - 32) * 5) / 9 / 5) * 5;
                  return `${c1}-${c2}°C`;
                },
              );
          }
          return text;
        })
        .map((text, idx) => `${idx + 1}. ${text}`)
        .join('\n\n');

      const instructionsPrompt =
        targetLocale === 'nl'
          ? `Vertaal de volgende bereidingsinstructies naar het Nederlands. Je antwoord moet ALLEEN in het Nederlands zijn (geen Engels). Gebruik natuurlijke Nederlandse zinnen. Geef ALLEEN een genummerde lijst: regel 1 begint met "1. ", regel 2 met "2. ", enz. Geen introductie, geen uitleg, geen andere tekst.

Instructions:
${instructionsText}

Antwoord (alleen genummerde lijst, Nederlands):`
          : `Translate the following cooking instructions to English. Reply with ONLY a numbered list: line 1 must start with "1. ", line 2 with "2. ", etc. No introduction, no explanation, no other text.

Instructions:
${instructionsText}

Reply (numbered list only):`;

      try {
        const instructionsResponse = await gemini.generateText({
          prompt: instructionsPrompt,
          temperature: 0.3,
          purpose: 'translate',
        });

        // Parse translated instructions (only numbered lines to skip preamble)
        const translatedLines = extractNumberedLines(instructionsResponse);

        translated.instructions = await Promise.all(
          extracted.instructions.map(async (inst, idx) => {
            const translatedInst = { ...inst };
            const translatedText = translatedLines[idx] || inst.text;
            translatedInst.text = translatedText;
            if (
              targetLocale === 'nl' &&
              looksLikeEnglish(translatedText, inst.text) &&
              inst.text
            ) {
              try {
                const textResponse = await gemini.generateText({
                  prompt: `Vertaal deze bereidingsinstructie naar het Nederlands. Alleen de Nederlandse zin, geen uitleg.\n"${inst.text}"`,
                  temperature: 0.2,
                  purpose: 'translate',
                });
                translatedInst.text =
                  textResponse
                    .trim()
                    .replace(/^["']|["']$/g, '')
                    .trim() || inst.text;
              } catch {
                translatedInst.text = inst.text;
              }
            }
            return translatedInst;
          }),
        );

        console.log(
          `[translateRecipeImportAction] Translated ${translated.instructions.length} instructions in batch`,
        );
      } catch (error) {
        console.error(
          `[translateRecipeImportAction] Failed to translate instructions in batch:`,
          error,
        );
        // Fallback: translate individually
        console.log(
          `[translateRecipeImportAction] Falling back to individual instruction translation...`,
        );
        for (let i = 0; i < extracted.instructions.length; i++) {
          const inst = extracted.instructions[i];
          const translatedInst = { ...inst };

          if (inst.text) {
            let instructionText = inst.text;
            if (targetLocale === 'nl' && sourceLocale === 'en') {
              instructionText = instructionText
                .replace(/(\d+)\s*°?\s*F/gi, (match, temp) => {
                  const fahrenheit = parseInt(temp);
                  const celsius =
                    Math.round(((fahrenheit - 32) * 5) / 9 / 5) * 5;
                  return `${celsius}°C`;
                })
                .replace(
                  /(\d+)\s*-\s*(\d+)\s*°?\s*F/gi,
                  (match, temp1, temp2) => {
                    const f1 = parseInt(temp1);
                    const f2 = parseInt(temp2);
                    const c1 = Math.round(((f1 - 32) * 5) / 9 / 5) * 5;
                    const c2 = Math.round(((f2 - 32) * 5) / 9 / 5) * 5;
                    return `${c1}-${c2}°C`;
                  },
                );
            }

            const textPrompt =
              targetLocale === 'nl'
                ? `Translate this cooking instruction to Dutch: "${instructionText}"`
                : `Translate this cooking instruction to English: "${instructionText}"`;

            try {
              const textResponse = await gemini.generateText({
                prompt: textPrompt,
                temperature: 0.3,
                purpose: 'translate',
              });
              translatedInst.text =
                textResponse.trim().replace(/^["']|["']$/g, '') || inst.text;
            } catch {
              translatedInst.text = inst.text;
            }
          }

          translated.instructions[i] = translatedInst;
        }
      }
    }

    // Only set translated_to when we actually have translated content (avoid "Vertaald naar: nl" with English text)
    if (
      targetLocale === 'nl' &&
      looksLikeEnglish(translated.title, extracted.title)
    ) {
      translated.translated_to = null;
      console.log(
        `[translateRecipeImportAction] Title still looks English, not setting translated_to`,
      );
    } else {
      translated.translated_to = targetLocale;
    }

    // Save both original and translated versions
    // If original_recipe_json doesn't exist yet, save the current extracted as original
    const originalToSave = job.original_recipe_json || extracted;

    console.log(
      `[translateRecipeImportAction] Saving translation. Original title: "${extracted.title}", Translated title: "${translated.title}", translated_to: ${translated.translated_to ?? 'null'}`,
    );

    const { error: updateError } = await supabase
      .from('recipe_imports')
      .update({
        extracted_recipe_json: translated, // Store translated version (with translated_to set)
        original_recipe_json: originalToSave, // Store original version (keep existing or use current)
        target_locale: targetLocale,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.jobId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error(
        '[translateRecipeImportAction] Error updating job:',
        updateError,
      );
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Fout bij opslaan vertaling: ${updateError.message}`,
        },
      };
    }

    // Verify the update was successful by reading it back
    const { data: verifyJob } = await supabase
      .from('recipe_imports')
      .select('extracted_recipe_json')
      .eq('id', input.jobId)
      .single();

    if (verifyJob) {
      const verifyTranslated =
        verifyJob.extracted_recipe_json as GeminiExtractedRecipe;
      console.log(
        `[translateRecipeImportAction] Verification: translated_to in DB = "${verifyTranslated?.translated_to || 'NOT SET'}"`,
      );
    }

    console.log(
      `[translateRecipeImportAction] Translation completed successfully`,
    );
    console.log(`[translateRecipeImportAction] Final translated recipe:`, {
      title: translated.title,
      translated_to: translated.translated_to,
      ingredients_count: translated.ingredients.length,
      instructions_count: translated.instructions.length,
      first_ingredient: translated.ingredients[0]?.name,
      first_instruction: translated.instructions[0]?.text?.substring(0, 50),
    });
    return { ok: true, data: undefined };
  } catch (error) {
    console.error('Unexpected error in translateRecipeImportAction:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Onbekende fout bij vertalen recipe import',
      },
    };
  }
}
