/**
 * Recipe Translation Service
 *
 * Service for translating recipes using Gemini API.
 * Detects recipe language and translates to user's preferred language.
 * Also converts measurements to Dutch units when translating to Dutch.
 */

import 'server-only';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import { ProfileService } from '@/src/lib/profile/profile.service';

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
 * Detect language of recipe text
 */
async function detectLanguage(text: string): Promise<'nl' | 'en' | 'other'> {
  const gemini = getGeminiClient();

  const prompt = `Detect the language of the following text. Respond with only one word: "nl" for Dutch, "en" for English, or "other" for any other language.

Text: "${text}"

Language:`;

  try {
    const response = await gemini.generateText({
      prompt,
      temperature: 0.1,
      purpose: 'translate',
    });

    const detected = response.trim().toLowerCase();
    if (detected === 'nl' || detected === 'en') {
      return detected;
    }
    return 'other';
  } catch (error) {
    console.error('[detectLanguage] Error detecting language:', error);
    return 'other';
  }
}

/**
 * Translate recipe name
 */
async function translateRecipeName(
  name: string,
  targetLocale: 'nl' | 'en',
): Promise<string> {
  const gemini = getGeminiClient();

  const prompt =
    targetLocale === 'nl'
      ? `Translate the following recipe title to Dutch (Nederlands). Keep it natural. Only return the translated title, nothing else.

Title: "${name}"

Translated title:`
      : `Translate the following recipe title to English. Keep it natural. Only return the translated title, nothing else.

Title: "${name}"

Translated title:`;

  try {
    const response = await gemini.generateText({
      prompt,
      temperature: 0.3,
      purpose: 'translate',
    });
    return response.trim().replace(/^["']|["']$/g, '') || name;
  } catch (error) {
    console.error('[translateRecipeName] Error translating name:', error);
    return name; // Fallback to original
  }
}

/**
 * Translate ingredient name
 */
async function translateIngredientName(
  name: string,
  targetLocale: 'nl' | 'en',
): Promise<string> {
  const gemini = getGeminiClient();

  const prompt =
    targetLocale === 'nl'
      ? `Translate the following ingredient name to Dutch (Nederlands). Keep it natural. Only return the translated name, nothing else.

Ingredient: "${name}"

Translated ingredient:`
      : `Translate the following ingredient name to English. Keep it natural. Only return the translated name, nothing else.

Ingredient: "${name}"

Translated ingredient:`;

  try {
    const response = await gemini.generateText({
      prompt,
      temperature: 0.3,
      purpose: 'translate',
    });
    return response.trim().replace(/^["']|["']$/g, '') || name;
  } catch (error) {
    console.error(
      '[translateIngredientName] Error translating ingredient:',
      error,
    );
    return name; // Fallback to original
  }
}

/**
 * Translate instruction text
 */
async function translateInstruction(
  text: string,
  targetLocale: 'nl' | 'en',
  sourceLocale: 'nl' | 'en' | 'other',
): Promise<string> {
  const gemini = getGeminiClient();

  // Convert temperatures if translating from English to Dutch
  let instructionText = text;
  if (targetLocale === 'nl' && sourceLocale === 'en') {
    // Convert Fahrenheit to Celsius in instructions
    instructionText = instructionText.replace(
      /(\d+)\s*°?\s*F/gi,
      (match, temp) => {
        const fahrenheit = parseInt(temp);
        const celsius = Math.round(((fahrenheit - 32) * 5) / 9 / 5) * 5; // Round to nearest 5°C
        return `${celsius}°C`;
      },
    );
    // Convert temperature ranges
    instructionText = instructionText.replace(
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

  const prompt =
    targetLocale === 'nl'
      ? `Translate the following cooking instruction to Dutch (Nederlands). Keep it natural and appropriate for cooking instructions. Convert temperatures if needed (already converted to Celsius). Only return the translated text, nothing else.

Instruction: "${instructionText}"

Translated instruction:`
      : `Translate the following cooking instruction to English. Keep it natural and appropriate for cooking instructions. Only return the translated text, nothing else.

Instruction: "${instructionText}"

Translated instruction:`;

  try {
    const response = await gemini.generateText({
      prompt,
      temperature: 0.3,
      purpose: 'translate',
    });
    return response.trim().replace(/^["']|["']$/g, '') || text;
  } catch (error) {
    console.error(
      '[translateInstruction] Error translating instruction:',
      error,
    );
    return text; // Fallback to original
  }
}

/**
 * Translate a recipe
 *
 * @param recipe - Recipe data from custom_meals or meal_history
 * @param userId - User ID to get language preference
 * @returns Translated recipe data
 */
export async function translateRecipe(
  recipe: {
    name: string;
    mealData?: any;
    aiAnalysis?: any;
  },
  userId: string,
): Promise<{
  translatedName: string;
  translatedMealData: any;
  translatedAiAnalysis: any;
  sourceLanguage: 'nl' | 'en' | 'other';
  targetLanguage: 'nl' | 'en';
}> {
  // Get user's preferred language
  const profileService = new ProfileService();
  const targetLanguage = await profileService.getUserLanguage(userId);

  // Detect source language from recipe name
  const sourceLanguage = await detectLanguage(recipe.name);

  // If already in target language, return original
  if (sourceLanguage === targetLanguage) {
    return {
      translatedName: recipe.name,
      translatedMealData: recipe.mealData || {},
      translatedAiAnalysis: recipe.aiAnalysis || {},
      sourceLanguage,
      targetLanguage,
    };
  }

  // Translate recipe name
  const translatedName = await translateRecipeName(recipe.name, targetLanguage);

  // Translate meal data
  const mealData = recipe.mealData || {};
  const translatedMealData = { ...mealData };

  // Translate ingredients (legacy format)
  if (mealData.ingredients && Array.isArray(mealData.ingredients)) {
    translatedMealData.ingredients = await Promise.all(
      mealData.ingredients.map(async (ing: any) => {
        const translated = { ...ing };

        // Translate ingredient name
        if (ing.name) {
          translated.name = await translateIngredientName(
            ing.name,
            targetLanguage,
          );
        }

        // Convert units if translating to Dutch
        if (targetLanguage === 'nl' && ing.unit && ing.quantity) {
          const converted = convertUnitToDutch(ing.unit, ing.quantity);
          translated.unit = converted.unit;
          translated.quantity = converted.quantity;
        }

        // Translate note if present
        if (ing.note) {
          const notePrompt =
            targetLanguage === 'nl'
              ? `Translate the following text to Dutch (Nederlands). Keep it natural. Only return the translated text, nothing else.

Text: "${ing.note}"

Translated text:`
              : `Translate the following text to English. Keep it natural. Only return the translated text, nothing else.

Text: "${ing.note}"

Translated text:`;

          const gemini = getGeminiClient();
          try {
            const noteResponse = await gemini.generateText({
              prompt: notePrompt,
              temperature: 0.3,
              purpose: 'translate',
            });
            translated.note =
              noteResponse.trim().replace(/^["']|["']$/g, '') || ing.note;
          } catch (error) {
            console.error(
              '[translateRecipe] Error translating ingredient note:',
              error,
            );
            translated.note = ing.note; // Fallback
          }
        }

        return translated;
      }),
    );
  }

  // Translate AI analysis instructions
  const aiAnalysis = recipe.aiAnalysis || {};
  const translatedAiAnalysis = { ...aiAnalysis };

  if (aiAnalysis.instructions) {
    if (Array.isArray(aiAnalysis.instructions)) {
      translatedAiAnalysis.instructions = await Promise.all(
        aiAnalysis.instructions.map(async (instruction: any) => {
          const instructionText =
            typeof instruction === 'string'
              ? instruction
              : instruction?.text || instruction?.step || String(instruction);

          const translatedText = await translateInstruction(
            instructionText,
            targetLanguage,
            sourceLanguage,
          );

          if (typeof instruction === 'string') {
            return translatedText;
          } else {
            return {
              ...instruction,
              text: translatedText,
              step: translatedText,
            };
          }
        }),
      );
    } else if (typeof aiAnalysis.instructions === 'string') {
      translatedAiAnalysis.instructions = await translateInstruction(
        aiAnalysis.instructions,
        targetLanguage,
        sourceLanguage,
      );
    }
  }

  return {
    translatedName,
    translatedMealData,
    translatedAiAnalysis,
    sourceLanguage,
    targetLanguage,
  };
}
