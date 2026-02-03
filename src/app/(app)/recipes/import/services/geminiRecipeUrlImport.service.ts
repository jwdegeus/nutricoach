/**
 * Gemini Recipe URL Import Service
 *
 * Service for processing recipe URLs with Gemini API.
 * Fetches HTML and uses Gemini to extract recipe information.
 */

import 'server-only';
import { z } from 'zod';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import {
  geminiExtractedRecipeSchema,
  type GeminiExtractedRecipe,
} from '../recipeImport.gemini.schemas';
import type { RecipeDraft } from '../recipeDraft.types';

/** HTML extraction strategy used by extractRelevantHtmlContent */
export type HtmlExtractionStrategy =
  | 'wprm_id'
  | 'wprm_class'
  | 'itemtype_recipe'
  | 'article'
  | 'main'
  | 'recipe_class'
  | 'recipe_id'
  | 'content_class'
  | 'fallback';

/** Metadata from HTML extraction (no raw HTML; lengths and strategy only). */
export type HtmlExtractionMeta = {
  strategy: HtmlExtractionStrategy;
  matchedSelector: string;
  bytesBefore: number;
  bytesAfter: number;
  wasTruncated: boolean;
  truncateMode: 'none' | 'head+tail';
};

/** Parse/repair flags collected during Gemini response handling. */
export type GeminiParseRepairFlags = {
  usedExtractJsonFromResponse: boolean;
  usedRepairTruncatedJson: boolean;
  addedMissingClosers: boolean;
  injectedPlaceholdersIngredients: boolean;
  injectedPlaceholdersInstructions: boolean;
};

/**
 * Diagnostics for Gemini URL import (only when RECIPE_IMPORT_DEBUG=true).
 * No full HTML or PII; counts and strategy only.
 */
export type GeminiUrlImportDiagnostics = {
  html: HtmlExtractionMeta;
  parseRepair: GeminiParseRepairFlags;
  ingredientCount: number;
  instructionCount: number;
  minNonPlaceholderIngredientCount: number;
  minNonPlaceholderInstructionCount: number;
  confidence_overall: number | null;
  language_detected: string | null;
  attempt: 1 | 2;
  retryReason: string | null;
};

/**
 * Check if a URL is a tracking pixel or non-image URL
 */
function isTrackingPixelOrNonImage(url: string): boolean {
  const lowerUrl = url.toLowerCase();

  // Check for tracking pixels and analytics
  const trackingPatterns = [
    'facebook.com/tr',
    'google-analytics.com',
    'googletagmanager.com',
    'doubleclick.net',
    '/analytics',
    '/tracking',
    '/pixel',
    '/beacon',
    'noscript',
    'amp;', // HTML entities
  ];

  if (trackingPatterns.some((pattern) => lowerUrl.includes(pattern))) {
    return true;
  }

  // Check if URL has query params but no image extension
  if (
    url.includes('?') &&
    !url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i)
  ) {
    // Might be a tracking pixel, but allow if it's from a known image CDN
    const imageCdnPatterns = [
      'imgur.com',
      'cloudinary.com',
      'unsplash.com',
      'pexels.com',
    ];
    if (!imageCdnPatterns.some((cdn) => lowerUrl.includes(cdn))) {
      return true;
    }
  }

  return false;
}

/**
 * Extract image URL from HTML
 * Looks for og:image, recipe image, or main image
 * Filters out tracking pixels and non-image URLs
 */
function extractImageUrlFromHtml(html: string): string | undefined {
  // Try og:image meta tag first
  const ogImageMatch = html.match(
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
  );
  if (ogImageMatch && ogImageMatch[1]) {
    const url = ogImageMatch[1];
    // Decode HTML entities
    const decodedUrl = url
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    if (!isTrackingPixelOrNonImage(decodedUrl)) {
      return decodedUrl;
    }
  }

  // Try recipe image in JSON-LD (we'll extract this separately, but also check HTML)
  // Look for common image patterns
  const imgTagMatch = html.match(
    /<img[^>]*class=["'][^"]*recipe[^"]*["'][^>]*src=["']([^"']+)["']/i,
  );
  if (imgTagMatch && imgTagMatch[1]) {
    const url = imgTagMatch[1];
    const decodedUrl = url
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    if (!isTrackingPixelOrNonImage(decodedUrl)) {
      return decodedUrl;
    }
  }

  // Try first large image in main content
  // Match all img tags and filter them
  const imgTagMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi);
  for (const match of imgTagMatches) {
    if (match[1]) {
      const url = match[1];
      const decodedUrl = url
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      // Filter out small icons, logos, tracking pixels, etc.
      const lowerUrl = decodedUrl.toLowerCase();
      if (
        !lowerUrl.includes('icon') &&
        !lowerUrl.includes('logo') &&
        !lowerUrl.includes('avatar') &&
        !isTrackingPixelOrNonImage(decodedUrl)
      ) {
        return decodedUrl;
      }
    }
  }

  return undefined;
}

/**
 * Clean and extract relevant HTML content.
 * Returns cleaned HTML and metadata (strategy, sizes, truncation) for diagnostics.
 */
function extractRelevantHtmlContent(html: string): {
  cleanedHtml: string;
  meta: HtmlExtractionMeta;
} {
  let strategy: HtmlExtractionStrategy = 'fallback';
  let matchedSelector = 'none';

  // Remove scripts and styles (they're not needed for recipe extraction)
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Prefer the recipe block first (WP Recipe Maker, etc.); capture enough to include ALL instructions (often after a long ingredient list)
  const WPRM_CAPTURE_MAX = 150000; // 150KB so instructions at the end are not cut off
  const wprmIdRe = new RegExp(
    `<div[^>]*id="wprm-recipe-container-[^"]*"[^>]*>([\\s\\S]{200,${WPRM_CAPTURE_MAX}})`,
    'i',
  );
  const wprmContainerMatch = cleaned.match(wprmIdRe);
  if (wprmContainerMatch && wprmContainerMatch[1]) {
    cleaned = wprmContainerMatch[1];
    strategy = 'wprm_id';
    matchedSelector = 'div#wprm-recipe-container-*';
  } else {
    const recipeBlockSelectors: {
      re: RegExp;
      name: HtmlExtractionStrategy;
      selector: string;
    }[] = [
      {
        re: new RegExp(
          `<div[^>]*class="[^"]*wprm-recipe-container[^"]*"[^>]*>([\\s\\S]{200,${WPRM_CAPTURE_MAX}})`,
          'i',
        ),
        name: 'wprm_class',
        selector: 'div.wprm-recipe-container',
      },
      {
        re: /<div[^>]*itemtype="[^"]*\/Recipe[^"]*"[^>]*>([\s\S]{200,120000})/i,
        name: 'itemtype_recipe',
        selector: 'div[itemtype*="Recipe"]',
      },
    ];
    for (const { re, name, selector } of recipeBlockSelectors) {
      const match = cleaned.match(re);
      if (match && match[1]) {
        cleaned = match[1];
        strategy = name;
        matchedSelector = selector;
        break;
      }
    }
  }

  // If no recipe block found, try main content areas
  if (cleaned.length > 15000 || !cleaned.includes('ingredient')) {
    const contentSelectors: {
      re: RegExp;
      name: HtmlExtractionStrategy;
      selector: string;
    }[] = [
      {
        re: /<article[^>]*>([\s\S]*?)<\/article>/i,
        name: 'article',
        selector: 'article',
      },
      { re: /<main[^>]*>([\s\S]*?)<\/main>/i, name: 'main', selector: 'main' },
      {
        re: /<div[^>]*class="[^"]*recipe[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        name: 'recipe_class',
        selector: 'div.recipe',
      },
      {
        re: /<div[^>]*id="[^"]*recipe[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        name: 'recipe_id',
        selector: 'div#*recipe*',
      },
      {
        re: /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        name: 'content_class',
        selector: 'div.content',
      },
    ];
    const stripped = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    for (const { re, name, selector } of contentSelectors) {
      const match = stripped.match(re);
      if (match && match[1] && match[1].length > 500) {
        cleaned = match[1];
        strategy = name;
        matchedSelector = selector;
        break;
      }
    }
  }

  // Remove common navigation/header/footer patterns
  cleaned = cleaned
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  const bytesBefore = cleaned.length;
  let wasTruncated = false;
  let truncateMode: 'none' | 'head+tail' = 'none';
  const maxSize = 120000; // 120KB
  if (cleaned.length > maxSize) {
    wasTruncated = true;
    truncateMode = 'head+tail';
    const keepEnd = 60000;
    const keepStart = maxSize - keepEnd;
    const startPortion = cleaned.substring(0, keepStart);
    const endPortion = cleaned.substring(cleaned.length - keepEnd);
    cleaned =
      startPortion +
      '\n... [middle content removed for size] ...\n' +
      endPortion;
  }
  const bytesAfter = cleaned.length;

  const meta: HtmlExtractionMeta = {
    strategy,
    matchedSelector,
    bytesBefore,
    bytesAfter,
    wasTruncated,
    truncateMode,
  };
  return { cleanedHtml: cleaned, meta };
}

/**
 * Build prompt for Gemini to extract recipe from HTML (caller must pass already-cleaned HTML).
 */
function buildRecipeExtractionFromHtmlPrompt(cleanedHtml: string): string {
  return `Extract recipe information from the HTML below. Use ONLY the recipe card/content: ingredient lists and instruction steps. Ignore any narrative text, comments, "tips", marketing lines, or text outside the actual recipe (e.g. "I believe your healing journey...", "Subscribe", "browse more recipes").
The recipe block may be long: ingredients often come first, then an "Instructions" or "Directions" section. You MUST extract EVERY instruction step from that section (all numbered or bulleted steps). Do not stop after the first few steps.

HTML:
${cleanedHtml}

REQUIRED OUTPUT FORMAT (strict JSON):
{
  "title": "Recipe name in original language",
  "language_detected": "Source language code (e.g., 'en', 'nl', 'de') or null if unclear",
  "translated_to": null,
  "servings": number or null,
  "times": {
    "prep_minutes": number or null,
    "cook_minutes": number or null,
    "total_minutes": number or null
  },
  "ingredients": [
    {
      "original_line": "Ingredient line as shown to the user, trimmed (e.g. \"1 lb of shucked oysters\")",
      "quantity": number or null,
      "unit": "string or null (e.g., 'g', 'ml', 'el', 'tl')",
      "name": "Normalized ingredient name in original language (REQUIRED)",
      "note": "string or null"
    }
  ],
  "instructions": [
    {
      "step": 1,
      "text": "Instruction text in original language (REQUIRED)"
    }
  ],
  "confidence": { "overall": number 0-100 or null, "fields": {} } (optional),
  "warnings": ["string"] (optional)
}

CRITICAL RULES:
1. Extract ONLY from the recipe block: the listed ingredients and the instruction steps. Do NOT include paragraph text, taglines, or text that is not an ingredient line or a step.
2. Language Detection: Identify the source language and set "language_detected" (e.g., 'en', 'nl', 'de') or null if unclear
3. Keep ALL text in original language - do NOT translate anything
4. Ingredients: every list item under Ingredients (or per section) must be one ingredient object. Preserve exact quantities and units (e.g. "2 lbs", "1/4 cup", "2 tbsp").
5. Instructions: Output ONE instruction object per step. Each step is typically one full paragraph (e.g. "Prepare the steak with marinade: Clean steak... Refrigerate 1-4 hours." is ONE step; "Grill steak: Heat a grill..." is another). Do NOT split a paragraph into multiple steps. Do NOT skip any step. If the recipe has 5 paragraphs under Instructions, output exactly 5 instruction objects with the complete text of each paragraph.
6. Ingredients MUST be objects with "original_line" and "name" fields (NOT strings). For "original_line" use only the visible ingredient text, trimmed (e.g. "1 lb of shucked oysters"); do NOT include leading/trailing/repeated whitespace, tabs, or HTML.
7. Instructions MUST be objects with "step" (number) and "text" fields (NOT strings)
8. Always include "language_detected", "translated_to", "servings", and "times" fields (use null if not available)
9. Number instruction steps starting from 1

UNIT CONVERSION (convert English units to metric):
- "cups" or "cup" → "ml" (1 cup = 240 ml, so "1 cup" becomes "240 ml", "2 cups" becomes "480 ml")
- "tablespoons" or "tablespoon" or "tbsp" → "el" (1 tablespoon = 1 el, so "3 tablespoons" becomes "3 el")
- "teaspoons" or "teaspoon" or "tsp" → "tl" (1 teaspoon = 1 tl, so "1 teaspoon" becomes "1 tl")
- "oz" or "ounces" → "g" (1 oz = 28 g, so "15 oz" becomes "420 g")
- "lb" or "pounds" → "g" (1 lb = 450 g, so "1 lb" becomes "450 g")

Return ONLY valid JSON conforming to the schema above. Do NOT include markdown code blocks.`;
}

function buildRecipeExtractionFromHtmlPromptStrict(
  cleanedHtml: string,
): string {
  return `CRITICAL: Return MINIFIED JSON only (no whitespace, no prose, no markdown). If the response cannot fit, omit non-essential fields first (description, times, confidence, warnings) but ALWAYS include ALL ingredients and ALL instruction steps.\n\n${buildRecipeExtractionFromHtmlPrompt(cleanedHtml)}`;
}

export class RecipeImportAiParseError extends Error {
  diagnostics?: GeminiUrlImportDiagnostics;
  constructor(message: string, diagnostics?: GeminiUrlImportDiagnostics) {
    super(message);
    this.name = 'RecipeImportAiParseError';
    this.diagnostics = diagnostics;
  }
}

/**
 * Extract JSON from potentially wrapped response
 */
function extractJsonFromResponse(rawResponse: string): string {
  let jsonString = rawResponse.trim();

  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockMatch = jsonString.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (codeBlockMatch) {
    jsonString = codeBlockMatch[1].trim();
  }

  // Try to find JSON object boundaries (recovery attempt)
  const jsonObjectMatch = jsonString.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    jsonString = jsonObjectMatch[0];
  }

  return jsonString;
}

/**
 * Get the parse position from a JSON SyntaxError message (e.g. "Unterminated string at position 2308")
 */
function getParsePositionFromError(error: unknown): number | undefined {
  const msg = error instanceof Error ? error.message : String(error);
  const match = msg.match(/position\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Compute the stack of unclosed bracket characters (in reverse order) up to position,
 * respecting string boundaries so we don't count brackets inside strings.
 */
function getUnclosedBrackets(
  jsonString: string,
  upToPosition: number,
): string[] {
  const stack: string[] = [];
  let i = 0;
  while (i < upToPosition && i < jsonString.length) {
    const c = jsonString[i];
    if (c === '"') {
      // Enter or exit string; skip to next unescaped "
      i += 1;
      while (i < upToPosition && i < jsonString.length) {
        const d = jsonString[i];
        if (d === '\\') {
          i += 2; // skip escape + next char
          continue;
        }
        if (d === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === '{') {
      stack.push('}');
    } else if (c === '[') {
      stack.push(']');
    } else if (c === '}' || c === ']') {
      stack.pop();
    }
    i += 1;
  }
  return stack.reverse();
}

/**
 * Try to repair truncated or unterminated JSON from Gemini (e.g. unterminated string at position N).
 * Truncates at the reported position, closes an open string if needed, then closes any unclosed brackets.
 * Returns repaired string and number of bracket closers added (for diagnostics).
 */
function repairTruncatedJson(
  jsonString: string,
  parseError: unknown,
): { repaired: string; addedClosersCount: number } | null {
  const position = getParsePositionFromError(parseError);
  if (position == null || position <= 0) return null;

  const isUnterminatedString =
    parseError instanceof Error &&
    parseError.message.toLowerCase().includes('unterminated string');

  let truncated = jsonString.slice(0, position);
  const unclosed = getUnclosedBrackets(jsonString, position);
  if (isUnterminatedString) {
    truncated += '"';
  }
  truncated += unclosed.join('');
  return { repaired: truncated, addedClosersCount: unclosed.length };
}

/** Placeholder instruction when response was truncated and instructions are missing. */
const TRUNCATED_INSTRUCTIONS_PLACEHOLDER = [
  { step: 1, text: 'Instructions were truncated. Please add steps manually.' },
];

/**
 * Ensure parsed object has required fields for schema validation (e.g. after truncation repair).
 * Fills in missing instructions and ingredients with placeholders so the draft can still be created.
 * Returns normalized object and flags for diagnostics.
 */
function ensureRepairedRecipeHasRequiredFields(parsed: unknown): {
  normalized: unknown;
  injectedIngredients: boolean;
  injectedInstructions: boolean;
} {
  if (parsed == null || typeof parsed !== 'object') {
    return {
      normalized: parsed,
      injectedIngredients: false,
      injectedInstructions: false,
    };
  }
  const obj = parsed as Record<string, unknown>;
  const out = { ...obj };
  let injectedIngredients = false;
  let injectedInstructions = false;

  const instructions = out.instructions;
  if (!Array.isArray(instructions) || instructions.length === 0) {
    out.instructions = TRUNCATED_INSTRUCTIONS_PLACEHOLDER;
    injectedInstructions = true;
  }

  const ingredients = out.ingredients;
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    out.ingredients = [
      {
        original_line: '',
        name: 'Ingredient list truncated',
        quantity: null,
        unit: null,
        note: null,
      },
    ];
    injectedIngredients = true;
  }

  return { normalized: out, injectedIngredients, injectedInstructions };
}

/**
 * Parse and validate Gemini response.
 * When parseRepairFlags is provided (debug), it is filled with flags for diagnostics.
 */
function parseGeminiResponse(
  rawResponse: string,
  attemptRecovery: boolean = true,
  parseRepairFlags?: GeminiParseRepairFlags,
): GeminiExtractedRecipe {
  const flags = parseRepairFlags ?? undefined;

  // First attempt: direct parse
  let jsonString = rawResponse.trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonString);
  } catch (parseError) {
    // Recovery attempt: extract JSON from wrapped response
    if (attemptRecovery) {
      jsonString = extractJsonFromResponse(rawResponse);
      if (flags) flags.usedExtractJsonFromResponse = true;
      try {
        parsed = JSON.parse(jsonString);
      } catch (recoveryError) {
        // Second recovery: repair truncated/unterminated JSON (e.g. Gemini cut off mid-string)
        const repairResult = repairTruncatedJson(jsonString, recoveryError);
        if (repairResult) {
          if (flags) {
            flags.usedRepairTruncatedJson = true;
            flags.addedMissingClosers = repairResult.addedClosersCount > 0;
          }
          try {
            parsed = JSON.parse(repairResult.repaired);
          } catch {
            // Fall through to throw with full context
          }
        }
        if (parsed === undefined) {
          const repairOriginal = repairTruncatedJson(
            rawResponse.trim(),
            parseError,
          );
          if (repairOriginal) {
            if (flags) {
              flags.usedRepairTruncatedJson = true;
              flags.addedMissingClosers =
                flags.addedMissingClosers ||
                repairOriginal.addedClosersCount > 0;
            }
            try {
              parsed = JSON.parse(repairOriginal.repaired);
            } catch {
              // ignore
            }
          }
        }
        if (parsed === undefined) {
          throw new Error(
            `Failed to parse JSON from Gemini response. ` +
              `Parse error: ${parseError instanceof Error ? parseError.message : 'Unknown'}. ` +
              `Recovery attempt also failed: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown'}. ` +
              `Raw response preview: ${rawResponse.substring(0, 500)}`,
          );
        }
      }
    } else {
      throw new Error(
        `Invalid JSON from Gemini: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}. ` +
          `Raw response preview: ${rawResponse.substring(0, 500)}`,
      );
    }
  }

  // Fill in missing required fields when response was truncated (e.g. missing instructions)
  const ensured = ensureRepairedRecipeHasRequiredFields(parsed);
  parsed = ensured.normalized;
  if (flags) {
    flags.injectedPlaceholdersIngredients = ensured.injectedIngredients;
    flags.injectedPlaceholdersInstructions = ensured.injectedInstructions;
  }

  // Validate against schema
  try {
    return geminiExtractedRecipeSchema.parse(parsed);
  } catch (validationError) {
    // Check if this is a case where no recipe was found (empty ingredients/instructions)
    const parsedData = parsed as Record<string, unknown>;
    const warnings = parsedData?.warnings as string[] | undefined;
    const hasWarnings =
      warnings && Array.isArray(warnings) && warnings.length > 0;
    const hasAccessDenied =
      hasWarnings &&
      warnings.some(
        (w: string) =>
          w.toLowerCase().includes('access denied') ||
          w.toLowerCase().includes('toegang geweigerd') ||
          w.toLowerCase().includes('geen receptinformatie'),
      );
    const ingredientsArr = parsedData?.ingredients as unknown[] | undefined;
    const instructionsArr = parsedData?.instructions as unknown[] | undefined;
    const isEmptyRecipe =
      (!ingredientsArr || ingredientsArr.length === 0) &&
      (!instructionsArr || instructionsArr.length === 0);

    if (hasAccessDenied || (isEmptyRecipe && hasWarnings)) {
      const warningMessage = hasAccessDenied
        ? 'De website blokkeert toegang tot deze pagina. Probeer een andere URL of controleer of de pagina publiek toegankelijk is.'
        : warnings?.[0] || 'Geen receptinformatie gevonden op deze pagina.';

      throw new Error(warningMessage);
    }

    const errorDetails =
      validationError instanceof z.ZodError
        ? validationError.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join('; ')
        : validationError instanceof Error
          ? validationError.message
          : 'Unknown validation error';

    throw new Error(
      `Schema validation failed: ${errorDetails}. ` +
        `Parsed data preview: ${JSON.stringify(parsed, null, 2).substring(0, 1000)}`,
    );
  }
}

/**
 * Map Gemini extracted recipe to RecipeDraft
 *
 * IMPORTANT: Uses the TRANSLATED values (name, text) not original_line
 * The original_line is kept for reference but the translated name should be used
 */
function mapGeminiRecipeToDraft(
  extracted: GeminiExtractedRecipe,
  sourceUrl: string,
): RecipeDraft {
  // Build ingredient text from translated name, quantity, unit, and note
  const ingredients = extracted.ingredients.map((ing) => {
    // Use the TRANSLATED name, not original_line
    let text = ing.name; // This should be translated

    // Add quantity and unit if present (units should already be converted)
    if (ing.quantity !== null && ing.quantity !== undefined) {
      text = `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''} ${text}`;
    } else if (ing.unit) {
      text = `${ing.unit} ${text}`;
    }

    // Add note if present (should also be translated)
    if (ing.note) {
      text = `${text} (${ing.note})`;
    }

    return { text };
  });

  return {
    title: extracted.title, // Should be translated
    description: undefined, // Gemini schema doesn't include description
    servings: extracted.servings ? String(extracted.servings) : undefined,
    ingredients,
    steps: extracted.instructions.map((inst) => ({
      text: inst.text, // Should be translated
    })),
    sourceUrl,
    sourceLanguage: extracted.language_detected || undefined,
  };
}

/**
 * Process recipe URL with Gemini API
 *
 * @param args - Configuration for URL processing
 * @returns Extracted recipe draft
 */
const RECIPE_IMPORT_DEBUG =
  typeof process !== 'undefined' && process.env.RECIPE_IMPORT_DEBUG === 'true';
const ALLOW_PLACEHOLDERS =
  typeof process !== 'undefined' && process.env.ALLOW_PLACEHOLDERS === 'true';

/** Placeholder text we inject so we can count non-placeholder items in diagnostics. */
const PLACEHOLDER_INGREDIENT_NAME = 'Ingredient list truncated';
const PLACEHOLDER_INSTRUCTION_SUBSTRING = 'Instructions were truncated';
const MIN_HEURISTIC_INGREDIENTS = 3;
const MIN_HEURISTIC_INSTRUCTIONS = 2;

const initParseRepairFlags = (): GeminiParseRepairFlags => ({
  usedExtractJsonFromResponse: false,
  usedRepairTruncatedJson: false,
  addedMissingClosers: false,
  injectedPlaceholdersIngredients: false,
  injectedPlaceholdersInstructions: false,
});

const isTruncationParseError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('unterminated string') ||
    lower.includes('unexpected end of json') ||
    lower.includes('unexpected end of input')
  );
};

export async function processRecipeUrlWithGemini(args: {
  html: string;
  url: string;
}): Promise<{
  draft: RecipeDraft;
  extracted: GeminiExtractedRecipe;
  rawResponse: string;
  diagnostics?: GeminiUrlImportDiagnostics;
}> {
  const { html, url } = args;

  console.log(
    `[processRecipeUrlWithGemini] URL: "${url}", HTML size: ${html.length} bytes`,
  );

  const { cleanedHtml, meta: htmlMeta } = extractRelevantHtmlContent(html);
  const prompt = buildRecipeExtractionFromHtmlPrompt(cleanedHtml);
  const promptStrict = buildRecipeExtractionFromHtmlPromptStrict(cleanedHtml);

  const gemini = getGeminiClient();

  // Convert Zod schema to JSON schema for Gemini with explicit translation requirements
  const jsonSchema = {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Recipe title in original language',
      },
      language_detected: {
        type: ['string', 'null'],
        description: "Source language code (e.g., 'en', 'nl', 'de')",
      },
      translated_to: {
        type: ['string', 'null'],
        description: 'Not used - set to null',
      },
      servings: { type: ['number', 'null'] },
      times: {
        type: 'object',
        properties: {
          prep_minutes: { type: ['number', 'null'] },
          cook_minutes: { type: ['number', 'null'] },
          total_minutes: { type: ['number', 'null'] },
        },
        required: [],
      },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            original_line: {
              type: 'string',
              description: 'Original text from HTML (keep as-is)',
            },
            quantity: {
              type: ['number', 'null'],
              description:
                'Quantity. Convert if needed: 1 cup = 240 ml, 1 oz = 28 g, 1 lb = 450 g',
            },
            unit: {
              type: ['string', 'null'],
              description:
                'Unit. Convert English units to metric: cups → ml, tablespoons → el, teaspoons → tl, oz → g, lb → g',
            },
            name: {
              type: 'string',
              description: 'Ingredient name in original language',
            },
            note: {
              type: ['string', 'null'],
              description: 'Note in original language if present',
            },
          },
          required: ['original_line', 'name'],
        },
        minItems: 1,
      },
      instructions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            step: { type: 'number' },
            text: {
              type: 'string',
              description: 'Instruction text in original language',
            },
          },
          required: ['step', 'text'],
        },
        minItems: 1,
      },
      confidence: {
        type: 'object',
        properties: {
          overall: { type: ['number', 'null'] },
          fields: { type: 'object' },
        },
        required: [],
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: [
      'title',
      'language_detected',
      'translated_to',
      'servings',
      'times',
      'ingredients',
      'instructions',
    ],
  };

  try {
    let attempt: 1 | 2 = 1;
    let retryReason: string | null = null;
    let lastDiagnostics: GeminiUrlImportDiagnostics | undefined;

    while (attempt <= 2) {
      const attemptPrompt = attempt === 1 ? prompt : promptStrict;
      const parseRepairFlags = initParseRepairFlags();

      console.log(
        `[GeminiRecipeUrlImport] Calling Gemini API (attempt ${attempt}) with HTML size: ${html.length} bytes`,
      );
      const startTime = Date.now();
      const rawResponse = await gemini.generateJson({
        prompt: attemptPrompt,
        jsonSchema,
        temperature: 0.4,
        purpose: 'plan',
        maxOutputTokens: 16384,
      });
      const duration = Date.now() - startTime;
      console.log(
        `[GeminiRecipeUrlImport] API call completed in ${duration}ms, response length: ${rawResponse.length} chars`,
      );

      let extracted: GeminiExtractedRecipe;
      let parseErrorSignal = false;
      try {
        const parsed = JSON.parse(rawResponse);
        extracted = geminiExtractedRecipeSchema.parse(parsed);
      } catch (parseError) {
        parseErrorSignal = isTruncationParseError(parseError);
        console.error(
          `[GeminiRecipeUrlImport] Failed to parse JSON from generateJson (attempt ${attempt}), trying fallback parser:`,
          parseError,
        );
        try {
          extracted = parseGeminiResponse(rawResponse, true, parseRepairFlags);
        } catch (fallbackError) {
          const shouldRetry =
            attempt === 1 && isTruncationParseError(fallbackError);
          if (shouldRetry) {
            retryReason = 'parse_truncation';
            attempt = 2;
            continue;
          }
          if (RECIPE_IMPORT_DEBUG) {
            lastDiagnostics = {
              html: htmlMeta,
              parseRepair: parseRepairFlags,
              ingredientCount: 0,
              instructionCount: 0,
              minNonPlaceholderIngredientCount: 0,
              minNonPlaceholderInstructionCount: 0,
              confidence_overall: null,
              language_detected: null,
              attempt,
              retryReason,
            };
          }
          throw new RecipeImportAiParseError(
            'Gemini response was invalid or truncated; failed to parse JSON.',
            lastDiagnostics,
          );
        }
      }

      console.log(
        `[GeminiRecipeUrlImport] Extraction completed. Language detected: ${extracted.language_detected}`,
      );

      if (attempt === 1 && parseErrorSignal) {
        retryReason = 'parse_truncation';
        attempt = 2;
        continue;
      }

      if (
        !ALLOW_PLACEHOLDERS &&
        (parseRepairFlags.injectedPlaceholdersIngredients ||
          parseRepairFlags.injectedPlaceholdersInstructions)
      ) {
        throw new RecipeImportAiParseError(
          'Gemini response incomplete; placeholders were injected.',
          lastDiagnostics,
        );
      }

      const ingredientCount = extracted.ingredients.length;
      const instructionCount = extracted.instructions.length;
      const minNonPlaceholderIngredientCount = extracted.ingredients.filter(
        (ing) => ing.name !== PLACEHOLDER_INGREDIENT_NAME,
      ).length;
      const minNonPlaceholderInstructionCount = extracted.instructions.filter(
        (inst) => !inst.text.includes(PLACEHOLDER_INSTRUCTION_SUBSTRING),
      ).length;

      if (RECIPE_IMPORT_DEBUG) {
        lastDiagnostics = {
          html: htmlMeta,
          parseRepair: parseRepairFlags,
          ingredientCount,
          instructionCount,
          minNonPlaceholderIngredientCount,
          minNonPlaceholderInstructionCount,
          confidence_overall: extracted.confidence?.overall ?? null,
          language_detected: extracted.language_detected ?? null,
          attempt,
          retryReason,
        };
      }

      if (
        attempt === 1 &&
        htmlMeta.wasTruncated &&
        (ingredientCount < MIN_HEURISTIC_INGREDIENTS ||
          instructionCount < MIN_HEURISTIC_INSTRUCTIONS)
      ) {
        retryReason = 'html_truncated_low_counts';
        attempt = 2;
        continue;
      }

      // Extract image URL from HTML
      const imageUrl = extractImageUrlFromHtml(html);
      console.log(
        `[GeminiRecipeUrlImport] Extracted image URL: ${imageUrl || 'none'}`,
      );

      // Convert relative URLs to absolute URLs
      let absoluteImageUrl = imageUrl;
      if (imageUrl) {
        try {
          const baseUrl = new URL(url);
          if (imageUrl.startsWith('/')) {
            absoluteImageUrl = new URL(imageUrl, baseUrl.origin).toString();
          } else if (
            !imageUrl.startsWith('http://') &&
            !imageUrl.startsWith('https://')
          ) {
            absoluteImageUrl = `https:${imageUrl}`;
          } else {
            absoluteImageUrl = imageUrl;
          }
          console.log(
            `[GeminiRecipeUrlImport] Resolved image URL: ${absoluteImageUrl}`,
          );
        } catch (urlError) {
          console.error(
            `[GeminiRecipeUrlImport] Error resolving image URL:`,
            urlError,
          );
          absoluteImageUrl = imageUrl;
        }
      }

      const draft = mapGeminiRecipeToDraft(extracted, url);
      draft.imageUrl = absoluteImageUrl;
      draft.prepTimeMinutes = extracted.times?.prep_minutes || undefined;
      draft.cookTimeMinutes = extracted.times?.cook_minutes || undefined;
      draft.totalTimeMinutes = extracted.times?.total_minutes || undefined;

      const result: {
        draft: RecipeDraft;
        extracted: GeminiExtractedRecipe;
        rawResponse: string;
        diagnostics?: GeminiUrlImportDiagnostics;
      } = {
        draft,
        extracted,
        rawResponse,
      };

      if (RECIPE_IMPORT_DEBUG && lastDiagnostics) {
        result.diagnostics = lastDiagnostics;
      }

      return result;
    }

    throw new RecipeImportAiParseError(
      'Gemini response was invalid or truncated; retry failed.',
      lastDiagnostics,
    );
  } catch (error) {
    if (RECIPE_IMPORT_DEBUG) {
      console.log(
        '[processRecipeUrlWithGemini] RECIPE_IMPORT_DEBUG (parse failed)',
        JSON.stringify({
          url,
          html: htmlMeta,
        }),
      );
    }
    if (error instanceof RecipeImportAiParseError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new Error(
        `Gemini recipe extraction from URL failed: ${error.message}`,
      );
    }
    throw new Error('Unknown error during Gemini recipe extraction from URL');
  }
}
