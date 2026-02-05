/**
 * Gemini Recipe Text Import Service
 *
 * Extracts a structured recipe from pasted plain text using Gemini.
 */

import 'server-only';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import {
  geminiExtractedRecipeSchema,
  type GeminiExtractedRecipe,
} from '../recipeImport.gemini.schemas';

function buildTextExtractionPrompt(text: string): string {
  return `Extract recipe information from the following text. The text may be a copied recipe from a website, a message, or free-form notes. Identify title, ingredients, and preparation steps.

TEXT:
${text}

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
      "original_line": "Ingredient line as it appears in the text",
      "quantity": number or null,
      "unit": "string or null (e.g., 'g', 'ml', 'el', 'tl')",
      "name": "Normalized ingredient name (REQUIRED)",
      "note": "string or null",
      "section": null
    }
  ],
  "instructions": [
    {
      "step": 1,
      "text": "Full instruction text for this step (REQUIRED)"
    }
  ],
  "confidence": { "overall": number 0-100 or null, "fields": {} },
  "warnings": ["string"]
}

RULES:
1. Extract ONLY recipe content: ingredients and preparation steps. Ignore intro text, comments, or non-recipe content.
2. Set "language_detected" from the text language (e.g. 'nl', 'en').
3. Ingredients: each line that describes an ingredient becomes one object. Preserve quantity and unit where present.
4. Instructions: one object per step. Keep each step as one coherent paragraph; do not split or merge arbitrarily.
5. Ingredients MUST be objects with "original_line" and "name". Instructions MUST be objects with "step" (number) and "text".
6. If the text contains no clear recipe, set ingredients and instructions to minimal placeholders and add a warning.

Return ONLY valid JSON. No markdown code blocks.`;
}

const jsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Recipe title' },
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
          section: { type: ['string', 'null'] },
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

/**
 * Extract a structured recipe from pasted plain text.
 */
export async function extractRecipeFromText(
  text: string,
): Promise<GeminiExtractedRecipe> {
  const gemini = getGeminiClient();
  const prompt = buildTextExtractionPrompt(text);

  const rawResponse = await gemini.generateJson({
    prompt,
    jsonSchema,
    temperature: 0.3,
    purpose: 'plan',
    maxOutputTokens: 8192,
  });

  const parsed = JSON.parse(rawResponse) as unknown;
  return geminiExtractedRecipeSchema.parse(parsed);
}
