/**
 * Meal Image Analysis Service
 *
 * Analyzes uploaded images (photos, screenshots) to extract recipe/meal information
 * using Gemini Vision API. Handles translation from English to Dutch.
 */

import 'server-only';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import { z } from 'zod';
import type { Meal, MealIngredientRef } from '@/src/lib/diets';

/**
 * Schema for recipe analysis result from Gemini Vision
 */
const recipeAnalysisSchema = z.object({
  name: z.string().describe('Recipe/meal name'),
  language: z
    .enum(['en', 'nl', 'other'])
    .describe('Detected language of the recipe'),
  ingredients: z
    .array(
      z.object({
        name: z.string(),
        amount: z.number().optional(),
        unit: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .describe('List of ingredients'),
  instructions: z.array(z.string()).optional().describe('Cooking instructions'),
  prepTime: z.number().optional().describe('Preparation time in minutes'),
  cookTime: z.number().optional().describe('Cooking time in minutes'),
  servings: z.number().optional().describe('Number of servings'),
  notes: z.string().optional().describe('Additional notes or information'),
});

export type RecipeAnalysis = z.infer<typeof recipeAnalysisSchema>;

/**
 * Clean recipe analysis data - remove null values and ensure required fields
 */
function cleanRecipeAnalysis(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Expected an object but received: ' + typeof data);
  }

  const obj = data as Record<string, unknown>;

  // Ensure name exists and is a string
  if (
    !obj.name ||
    typeof obj.name !== 'string' ||
    obj.name.trim().length === 0
  ) {
    throw new Error(
      `Recipe name is required and must be a non-empty string. Got: ${JSON.stringify(obj.name)}`,
    );
  }

  // Ensure language exists
  if (!obj.language || !['en', 'nl', 'other'].includes(String(obj.language))) {
    obj.language = 'other'; // Default fallback
  }

  // Clean ingredients - filter out any without names, remove null values
  if (!Array.isArray(obj.ingredients)) {
    throw new Error('Ingredients must be an array');
  }

  const cleanedIngredients = obj.ingredients
    .filter((ing: unknown) => {
      if (typeof ing !== 'object' || ing === null) return false;
      const ingObj = ing as Record<string, unknown>;
      return typeof ingObj.name === 'string' && ingObj.name.trim().length > 0;
    })
    .map((ing: unknown) => {
      const ingObj = ing as Record<string, unknown>;
      const cleaned: Record<string, unknown> = {
        name: String(ingObj.name).trim(),
      };

      if (typeof ingObj.amount === 'number' && !isNaN(ingObj.amount)) {
        cleaned.amount = ingObj.amount;
      }

      if (typeof ingObj.unit === 'string' && ingObj.unit.trim().length > 0) {
        cleaned.unit = ingObj.unit.trim();
      }

      if (typeof ingObj.notes === 'string' && ingObj.notes.trim().length > 0) {
        cleaned.notes = ingObj.notes.trim();
      }

      return cleaned;
    });

  if (cleanedIngredients.length === 0) {
    throw new Error('At least one ingredient with a name is required');
  }

  obj.ingredients = cleanedIngredients;

  // Remove null/undefined values for optional fields
  if (obj.servings === null || obj.servings === undefined) {
    delete obj.servings;
  } else if (typeof obj.servings === 'number' && !isNaN(obj.servings)) {
    // Keep it
  } else {
    delete obj.servings;
  }

  if (obj.prepTime === null || obj.prepTime === undefined) {
    delete obj.prepTime;
  } else if (typeof obj.prepTime === 'number' && !isNaN(obj.prepTime)) {
    // Keep it
  } else {
    delete obj.prepTime;
  }

  if (obj.cookTime === null || obj.cookTime === undefined) {
    delete obj.cookTime;
  } else if (typeof obj.cookTime === 'number' && !isNaN(obj.cookTime)) {
    // Keep it
  } else {
    delete obj.cookTime;
  }

  if (
    obj.notes === null ||
    obj.notes === undefined ||
    (typeof obj.notes === 'string' && obj.notes.trim().length === 0)
  ) {
    delete obj.notes;
  }

  // Ensure instructions is an array of strings or omit it
  if (obj.instructions !== undefined && obj.instructions !== null) {
    if (Array.isArray(obj.instructions)) {
      const cleanedInstructions = obj.instructions
        .filter(
          (inst: unknown) => typeof inst === 'string' && inst.trim().length > 0,
        )
        .map((inst: unknown) => String(inst).trim());

      if (cleanedInstructions.length > 0) {
        obj.instructions = cleanedInstructions;
      } else {
        delete obj.instructions;
      }
    } else {
      delete obj.instructions;
    }
  }

  return obj;
}

/**
 * Convert recipe analysis to Meal format
 *
 * Note: This creates a basic Meal structure. For full integration with NEVO,
 * ingredients would need to be matched to NEVO codes. This is a simplified version.
 */
export function recipeAnalysisToMeal(
  analysis: RecipeAnalysis,
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack',
  date: string,
): Meal {
  // Create ingredient refs (simplified - would need NEVO matching in production)
  const ingredientRefs: MealIngredientRef[] = analysis.ingredients.map(
    (ing, idx) => ({
      nevoCode: `CUSTOM_${idx}`, // Placeholder - would need actual NEVO matching
      amountG: ing.amount || 100, // Default to 100g if no amount specified
      quantityG: ing.amount || 100,
      notes: ing.notes,
    }),
  );

  // Calculate total prep time
  const totalPrepTime = (analysis.prepTime || 0) + (analysis.cookTime || 0);

  return {
    id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: analysis.name,
    slot,
    date,
    ingredientRefs,
    prepTime: totalPrepTime > 0 ? totalPrepTime : undefined,
    servings: analysis.servings,
  };
}

/**
 * Analyze an image and extract recipe information
 *
 * @param imageData - Base64 encoded image data or data URL
 * @param mimeType - MIME type of the image
 * @returns Analyzed recipe information
 */
export async function analyzeMealImage(
  imageData: string,
  mimeType: string,
): Promise<RecipeAnalysis> {
  const gemini = getGeminiClient();

  // Build prompt for recipe extraction
  const prompt = `Analyze this image carefully. If it contains a recipe or meal information, extract ALL details:

REQUIRED FIELDS (must be present):
1. name: Recipe/meal name (REQUIRED - string, cannot be null or undefined)
2. language: Detected language - must be "en", "nl", or "other" (REQUIRED)
3. ingredients: Array of ingredients (REQUIRED - at least one ingredient)
   - Each ingredient MUST have a "name" field (string, REQUIRED)
   - amount: number (optional, can be omitted if not found)
   - unit: string (optional, can be omitted if not found, but if present must be string not null)
   - notes: string (optional)

OPTIONAL FIELDS:
4. instructions: Array of step-by-step cooking instructions (optional array of strings)
5. prepTime: Preparation time in minutes (optional number, omit if not found)
6. cookTime: Cooking time in minutes (optional number, omit if not found)
7. servings: Number of servings (optional number, omit if not found, but if present must be number not null)
8. notes: Additional notes or information (optional string)

CRITICAL RULES:
- ALL required fields MUST be present and cannot be null or undefined
- If a field is optional and not found, OMIT it entirely (do not set to null)
- ingredient.name is REQUIRED for every ingredient - if you cannot extract a name, skip that ingredient
- If servings/prepTime/cookTime are not found, omit them (do not set to null)
- If unit is not found for an ingredient, omit it (do not set to null)

Detect the language of the recipe. If it's in English, provide a Dutch translation for the name and instructions.

Return ONLY valid JSON conforming to the schema. Do NOT include markdown code blocks.`;

  // Convert Zod schema to JSON schema
  const jsonSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      language: { type: 'string', enum: ['en', 'nl', 'other'] },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            amount: { type: 'number' },
            unit: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['name'],
        },
      },
      instructions: {
        type: 'array',
        items: { type: 'string' },
      },
      prepTime: { type: 'number' },
      cookTime: { type: 'number' },
      servings: { type: 'number' },
      notes: { type: 'string' },
    },
    required: ['name', 'language', 'ingredients'],
  };

  try {
    const rawJson = await gemini.analyzeImage({
      imageData,
      mimeType,
      prompt,
      jsonSchema,
      temperature: 0.3, // Lower temperature for more accurate extraction
    });

    // Extract JSON from markdown code blocks if present
    let jsonString = rawJson.trim();

    // Remove markdown code blocks (```json ... ``` or ``` ... ```)
    const codeBlockMatch = jsonString.match(
      /^```(?:json)?\s*([\s\S]*?)\s*```$/,
    );
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1].trim();
    }

    // Also handle cases where JSON is wrapped in other text
    // Try to find JSON object boundaries
    const jsonObjectMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      jsonString = jsonObjectMatch[0];
    }

    // Parse and validate
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseError) {
      throw new Error(
        `Invalid JSON from Gemini: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}. Raw response: ${rawJson.substring(0, 500)}`,
      );
    }

    // Clean up null values and ensure required fields
    const cleaned = cleanRecipeAnalysis(parsed);

    // Validate against schema
    let analysis: RecipeAnalysis;
    try {
      analysis = recipeAnalysisSchema.parse(cleaned);
    } catch (validationError) {
      throw new Error(
        `Schema validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}. Parsed data: ${JSON.stringify(cleaned, null, 2).substring(0, 1000)}`,
      );
    }

    // If language is English, translate to Dutch
    if (analysis.language === 'en') {
      const translated = await translateRecipeToDutch(analysis);
      return translated;
    }

    return analysis;
  } catch (error) {
    throw new Error(
      `Failed to analyze meal image: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Translate recipe from English to Dutch
 */
async function translateRecipeToDutch(
  analysis: RecipeAnalysis,
): Promise<RecipeAnalysis> {
  const gemini = getGeminiClient();

  const translationPrompt = `Translate this recipe to Dutch. Keep the structure and return JSON:

Recipe name: "${analysis.name}"
Ingredients: ${JSON.stringify(analysis.ingredients)}
Instructions: ${JSON.stringify(analysis.instructions || [])}
Notes: "${analysis.notes || ''}"

Translate:
- Recipe name to Dutch
- Ingredient names to Dutch
- Instructions to Dutch
- Notes to Dutch

Keep all numbers, units, and quantities unchanged.`;

  const jsonSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      language: { type: 'string', enum: ['nl'] },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            amount: { type: 'number' },
            unit: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['name'],
        },
      },
      instructions: {
        type: 'array',
        items: { type: 'string' },
      },
      prepTime: { type: 'number' },
      cookTime: { type: 'number' },
      servings: { type: 'number' },
      notes: { type: 'string' },
    },
    required: ['name', 'language', 'ingredients'],
  };

  try {
    const rawJson = await gemini.generateJson({
      prompt: translationPrompt,
      jsonSchema,
      temperature: 0.3,
      purpose: 'translate',
    });

    // Extract JSON from markdown code blocks if present
    let jsonString = rawJson.trim();

    // Remove markdown code blocks (```json ... ``` or ``` ... ```)
    const codeBlockMatch = jsonString.match(
      /^```(?:json)?\s*([\s\S]*?)\s*```$/,
    );
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1].trim();
    }

    // Also handle cases where JSON is wrapped in other text
    const jsonObjectMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      jsonString = jsonObjectMatch[0];
    }

    const parsed = JSON.parse(jsonString);
    const translated = recipeAnalysisSchema.parse(parsed);

    // Preserve original timing and servings
    return {
      ...translated,
      language: 'nl' as const,
      prepTime: analysis.prepTime,
      cookTime: analysis.cookTime,
      servings: analysis.servings,
    };
  } catch (error) {
    // If translation fails, return original with language marked as English
    console.warn('Translation failed, returning original:', error);
    return analysis;
  }
}
