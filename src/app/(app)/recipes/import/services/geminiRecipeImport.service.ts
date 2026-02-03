/**
 * Gemini Recipe Import Service
 *
 * Service for processing recipe images with Gemini Vision API.
 * Handles OCR, translation, and structured extraction.
 */

import 'server-only';
import { z } from 'zod';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import {
  geminiExtractedRecipeSchema,
  type GeminiExtractedRecipe,
} from '../recipeImport.gemini.schemas';

/**
 * Maximum base64 image size (5MB)
 * Base64 encoding increases size by ~33%, so 5MB base64 ≈ 3.75MB raw
 */
const MAX_BASE64_SIZE = 5 * 1024 * 1024; // 5MB

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
 * Parse and validate Gemini response
 */
function parseGeminiResponse(
  rawResponse: string,
  attemptRecovery: boolean = true,
): GeminiExtractedRecipe {
  // First attempt: direct parse
  let jsonString = rawResponse.trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonString);
  } catch (parseError) {
    // Recovery attempt: extract JSON from wrapped response
    if (attemptRecovery) {
      jsonString = extractJsonFromResponse(rawResponse);
      try {
        parsed = JSON.parse(jsonString);
      } catch (recoveryError) {
        throw new Error(
          `Failed to parse JSON from Gemini response. ` +
            `Parse error: ${parseError instanceof Error ? parseError.message : 'Unknown'}. ` +
            `Recovery attempt also failed: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown'}. ` +
            `Raw response preview: ${rawResponse.substring(0, 500)}`,
        );
      }
    } else {
      throw new Error(
        `Invalid JSON from Gemini: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}. ` +
          `Raw response preview: ${rawResponse.substring(0, 500)}`,
      );
    }
  }

  // Validate against schema
  try {
    return geminiExtractedRecipeSchema.parse(parsed);
  } catch (validationError) {
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
 * Build prompt for Gemini Vision API
 */
function buildRecipeExtractionPrompt(): string {
  return `Analyze this recipe image carefully and extract ALL information.

WORKFLOW:
1. Perform OCR: Extract ALL visible text from the image
2. Detect source language: Identify the language of the recipe (e.g., 'en', 'nl', 'de', 'fr', 'es')
3. Extract structured data: Parse ingredients, instructions, times, servings

REQUIRED OUTPUT FORMAT (strict JSON, no markdown, no extra text):
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
      "original_line": "Exact text as it appears in the image (REQUIRED - preserve original language)",
      "quantity": number or null,
      "unit": "string or null (e.g., 'g', 'ml', 'cups')",
      "name": "Normalized ingredient name in original language",
      "note": "string or null in original language"
    }
  ],
  "instructions": [
    {
      "step": 1,
      "text": "Instruction text in original language"
    }
  ],
  "confidence": {
    "overall": number 0-100 or null,
    "fields": { "title": 95, "ingredients": 90, ... } (optional)
  },
  "warnings": ["string"] (optional)
}

CRITICAL RULES:
1. OCR: Extract ALL text visible in the image accurately
2. Language Detection: Identify the source language correctly
3. Keep ALL text in original language - do NOT translate
4. For each ingredient:
   - "original_line" MUST be the exact text from the image
   - Extract quantity and unit if present
   - "name" should be normalized but in original language
5. Instructions must be step-by-step, numbered starting from 1, in original language
6. Return ONLY valid JSON conforming to the schema above
7. Do NOT include markdown code blocks
8. Do NOT include any text outside the JSON object

If you cannot extract certain information, use null for optional fields, but NEVER omit required fields.`;
}

/**
 * Build prompt for multi-page recipe extraction (same JSON schema, different intro)
 */
function buildMultiPageRecipeExtractionPrompt(pageCount: number): string {
  return `These ${pageCount} images are consecutive pages of the SAME recipe (page 1, page 2, etc.). Treat them as one document.

WORKFLOW:
1. Perform OCR: Extract ALL visible text from ALL images in order
2. Combine into ONE recipe: one title, one ingredients list, one instructions list, one set of times/servings
3. Detect source language from the combined text
4. If the title appears only on the first page, use it. If ingredients continue on page 2, merge them. If instructions span multiple pages, merge and renumber steps 1, 2, 3...

REQUIRED OUTPUT FORMAT (strict JSON, no markdown, no extra text):
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
      "original_line": "Exact text as it appears (REQUIRED - preserve original language)",
      "quantity": number or null,
      "unit": "string or null (e.g., 'g', 'ml', 'cups')",
      "name": "Normalized ingredient name in original language",
      "note": "string or null in original language"
    }
  ],
  "instructions": [
    {
      "step": 1,
      "text": "Instruction text in original language"
    }
  ],
  "confidence": {
    "overall": number 0-100 or null,
    "fields": { "title": 95, "ingredients": 90, ... } (optional)
  },
  "warnings": ["string"] (optional)
}

CRITICAL RULES:
1. Output exactly ONE combined recipe from all pages
2. Merge ingredients from all pages into one list (no duplicates; if same ingredient appears on two pages, combine quantities if applicable)
3. Merge instructions from all pages into one numbered list in reading order
4. Keep ALL text in original language - do NOT translate
5. Return ONLY valid JSON conforming to the schema above
6. Do NOT include markdown code blocks or any text outside the JSON object

If you cannot extract certain information, use null for optional fields, but NEVER omit required fields.`;
}

/**
 * Process recipe image with Gemini Vision API
 *
 * @param args - Configuration for image processing
 * @returns Extracted recipe data
 */
export async function processRecipeImageWithGemini(args: {
  imageData: string; // Base64 string or data URL
  mimeType: string;
}): Promise<{
  extracted: GeminiExtractedRecipe;
  rawResponse: string;
  ocrText?: string; // If Gemini provides separate OCR text
}> {
  const { imageData, mimeType } = args;

  // Validate image size (base64)
  // Handle data URL format for size check
  const base64Data = imageData.startsWith('data:')
    ? imageData.split(',')[1] || imageData
    : imageData;

  if (base64Data.length > MAX_BASE64_SIZE) {
    throw new Error(
      `IMAGE_TOO_LARGE: Image too large. Maximum base64 size is ${MAX_BASE64_SIZE / 1024 / 1024}MB. ` +
        `Current size: ${(base64Data.length / 1024 / 1024).toFixed(2)}MB`,
    );
  }

  const gemini = getGeminiClient();
  const prompt = buildRecipeExtractionPrompt();

  try {
    console.log(
      `[GeminiRecipeImport] Calling Gemini Vision API with image size: ${imageData.length} bytes, mimeType: ${mimeType}`,
    );
    const startTime = Date.now();

    const rawResponse = await gemini.analyzeImage({
      imageData,
      mimeType,
      prompt,
      jsonSchema: recipeExtractionJsonSchema,
      temperature: 0.3,
    });

    const duration = Date.now() - startTime;
    console.log(
      `[GeminiRecipeImport] Gemini API call completed in ${duration}ms, response length: ${rawResponse.length} chars`,
    );

    // Parse and validate response
    const extracted = parseGeminiResponse(rawResponse, true);

    // Extract OCR text if available (for now, we'll use the raw response as OCR text placeholder)
    // In future, Gemini might provide separate OCR output
    const ocrText = extracted.ingredients
      .map((ing) => ing.original_line)
      .join('\n');

    return {
      extracted,
      rawResponse,
      ocrText,
    };
  } catch (error) {
    // Re-throw with context
    if (error instanceof Error) {
      throw new Error(`Gemini recipe extraction failed: ${error.message}`);
    }
    throw new Error('Unknown error during Gemini recipe extraction');
  }
}

/** Shared JSON schema for single and multi-page extraction */
const recipeExtractionJsonSchema = {
  type: 'object' as const,
  properties: {
    title: { type: 'string' },
    language_detected: { type: ['string', 'null'] },
    translated_to: { type: ['string', 'null'] },
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
          original_line: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'] },
          name: { type: 'string' },
          note: { type: ['string', 'null'] },
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
          text: { type: 'string' },
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
  required: ['title', 'ingredients', 'instructions', 'times'],
};

/**
 * Process multiple recipe page images with Gemini Vision API (multi-page recipe).
 * Combines all pages into one extracted recipe.
 *
 * @param args.images - Array of { imageData, mimeType } in page order
 * @returns Extracted recipe data (single combined recipe)
 */
export async function processRecipeImagesWithGemini(args: {
  images: Array<{ imageData: string; mimeType: string }>;
}): Promise<{
  extracted: GeminiExtractedRecipe;
  rawResponse: string;
  ocrText?: string;
}> {
  const { images } = args;
  if (images.length === 0) {
    throw new Error('At least one image is required');
  }
  if (images.length > 5) {
    throw new Error(
      'Maximum 5 pages supported. Please use at most 5 images per recipe.',
    );
  }

  for (let i = 0; i < images.length; i++) {
    const base64Data = images[i].imageData.startsWith('data:')
      ? images[i].imageData.split(',')[1] || images[i].imageData
      : images[i].imageData;
    if (base64Data.length > MAX_BASE64_SIZE) {
      throw new Error(
        `IMAGE_TOO_LARGE: Image at page ${i + 1} is too large. Maximum base64 size is ${MAX_BASE64_SIZE / 1024 / 1024}MB.`,
      );
    }
  }

  const gemini = getGeminiClient();
  const prompt = buildMultiPageRecipeExtractionPrompt(images.length);

  try {
    console.log(
      `[GeminiRecipeImport] Calling Gemini Vision API with ${images.length} page(s)`,
    );
    const startTime = Date.now();

    const rawResponse = await gemini.analyzeImage({
      images: images.map((img) => ({
        imageData: img.imageData,
        mimeType: img.mimeType,
      })),
      prompt,
      jsonSchema: recipeExtractionJsonSchema,
      temperature: 0.3,
    });

    const duration = Date.now() - startTime;
    console.log(
      `[GeminiRecipeImport] Multi-page Gemini API call completed in ${duration}ms, response length: ${rawResponse.length} chars`,
    );

    const extracted = parseGeminiResponse(rawResponse, true);
    const ocrText = extracted.ingredients
      .map((ing) => ing.original_line)
      .join('\n');

    return {
      extracted,
      rawResponse,
      ocrText,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Gemini recipe extraction failed: ${error.message}`);
    }
    throw new Error('Unknown error during Gemini recipe extraction');
  }
}
