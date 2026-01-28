/**
 * Meal Translation Service
 *
 * Translates meal names and descriptions between Dutch and English.
 * Uses Gemini API for translation to ensure accurate meal-specific translations.
 *
 * NOTE: Translation is resource-intensive and may hit API quotas.
 * For best performance, new meals should be generated in the correct language
 * via prompts rather than translating existing meals.
 */

import 'server-only';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import type { Meal } from '@/src/lib/diets';
import type {
  EnrichedMeal,
  CookPlanDay,
  MealPlanEnrichmentResponse,
} from '@/src/lib/agents/meal-planner/mealPlannerEnrichment.types';

/**
 * Check if we should skip translation due to potential quota issues
 * This is a safety check - in practice, translation should be disabled by default
 */
function shouldSkipTranslation(): boolean {
  // Skip translation if we're likely to hit quota limits
  // Translation is disabled by default in loadPlanForUser, so this is a safety net
  return false; // Can be set to true to completely disable translation
}

/**
 * Detect if a text is likely in English or Dutch
 * Simple heuristic based on common words and patterns
 */
function detectLanguage(text: string): 'nl' | 'en' {
  const lowerText = text.toLowerCase();

  // Common Dutch words and patterns
  const dutchWords = [
    'met',
    'voor',
    'van',
    'een',
    'de',
    'het',
    'en',
    'op',
    'is',
    'zijn',
    'in',
    'te',
    'dat',
    'koken',
    'bakken',
    'gebakken',
    'gegrild',
    'gestoomd',
    'salade',
    'snijden',
    'mengen',
    'soep',
    'pasta',
    'rijst',
    'kip',
    'vlees',
    'vis',
    'groente',
    'fruit',
    'minuten',
    'voeg',
    'toe',
    'verwarm',
    'serveer',
    'snijd',
    'mix',
    'kook',
    'bak',
    'grill',
    'bereid',
    'bereiding',
    'kooktijd',
    'voorbereiding',
    'porties',
    'keukentips',
  ];

  // Common English words and patterns (especially for cooking instructions)
  const englishWords = [
    'with',
    'for',
    'from',
    'a',
    'the',
    'and',
    'on',
    'is',
    'are',
    'in',
    'to',
    'that',
    'cooked',
    'baked',
    'fried',
    'grilled',
    'steamed',
    'salad',
    'cut',
    'mix',
    'combine',
    'soup',
    'pasta',
    'rice',
    'chicken',
    'meat',
    'fish',
    'vegetable',
    'fruit',
    'minutes',
    'add',
    'heat',
    'serve',
    'slice',
    'blend',
    'cook',
    'bake',
    'grill',
    'prepare',
    'preparation',
    'cooking',
    'time',
    'servings',
    'kitchen',
    'tips',
    'until',
    'until',
    'vigorously',
    'smooth',
    'frothy',
    'immediately',
    'pasteurized',
    'consuming',
    'raw',
  ];

  let dutchCount = 0;
  let englishCount = 0;

  const words = lowerText.split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/[.,!?;:]/g, ''); // Remove punctuation
    if (dutchWords.includes(cleanWord)) dutchCount++;
    if (englishWords.includes(cleanWord)) englishCount++;
  }

  // Check for common English cooking instruction patterns
  if (
    lowerText.includes('combine the') ||
    lowerText.includes('blend or shake') ||
    lowerText.includes('serve immediately') ||
    lowerText.includes('ensure the') ||
    lowerText.includes('if consuming') ||
    lowerText.includes('use one pan')
  ) {
    englishCount += 3; // Strong English indicators
  }

  // Check for common Dutch cooking instruction patterns
  if (
    lowerText.includes('voeg') ||
    lowerText.includes('verwarm') ||
    lowerText.includes('serveer') ||
    lowerText.includes('snijd') ||
    lowerText.includes('meng') ||
    lowerText.includes('kook')
  ) {
    dutchCount += 3; // Strong Dutch indicators
  }

  // If we have more Dutch indicators, assume Dutch
  if (dutchCount > englishCount) return 'nl';
  // Default to English if unclear (most existing meals are in English)
  return 'en';
}

/**
 * Translate meal name using Gemini
 */
async function translateMealName(
  mealName: string,
  targetLanguage: 'nl' | 'en',
): Promise<string> {
  const sourceLanguage = detectLanguage(mealName);

  // If already in target language, return as-is
  if (sourceLanguage === targetLanguage) {
    return mealName;
  }

  const gemini = getGeminiClient();

  const prompt =
    targetLanguage === 'nl'
      ? `Translate the following meal name to Dutch (Nederlands). Keep it concise and natural. Only return the translated name, nothing else.

Meal name: "${mealName}"

Translated name:`
      : `Translate the following meal name to English. Keep it concise and natural. Only return the translated name, nothing else.

Meal name: "${mealName}"

Translated name:`;

  try {
    const response = await gemini.generateText({
      prompt,
      temperature: 0.3,
      purpose: 'translate',
    });

    // Clean up response (remove quotes, trim)
    const translated = response.trim().replace(/^["']|["']$/g, '');
    return translated || mealName; // Fallback to original if translation fails
  } catch (error) {
    // Handle quota errors gracefully - don't log as error, just return original
    if (error instanceof Error && error.message.includes('quota')) {
      console.warn(
        `Translation skipped due to quota limit for meal: "${mealName}"`,
      );
      return mealName; // Fallback to original on quota error
    }
    console.error(`Failed to translate meal name "${mealName}":`, error);
    return mealName; // Fallback to original on error
  }
}

/**
 * Translate a meal to the target language
 *
 * @param meal - Meal to translate
 * @param targetLanguage - Target language ('nl' or 'en')
 * @returns Translated meal (new object, doesn't mutate original)
 */
export async function translateMeal(
  meal: Meal,
  targetLanguage: 'nl' | 'en',
): Promise<Meal> {
  // Check if translation is needed - skip if already in target language
  const detectedLanguage = detectLanguage(meal.name);
  if (detectedLanguage === targetLanguage) {
    return meal; // Already in target language, no translation needed
  }

  // Translate meal name
  const translatedName = await translateMealName(meal.name, targetLanguage);

  // Return translated meal
  return {
    ...meal,
    name: translatedName,
  };
}

/**
 * Translate multiple meals in batch
 * Uses batching to avoid overwhelming the API
 *
 * @param meals - Meals to translate
 * @param targetLanguage - Target language
 * @returns Translated meals
 */
export async function translateMeals(
  meals: Meal[],
  targetLanguage: 'nl' | 'en',
): Promise<Meal[]> {
  // Safety check: skip translation if disabled
  if (shouldSkipTranslation()) {
    return meals;
  }

  // First, filter out meals that don't need translation (already in target language)
  const mealsToTranslate: Array<{ meal: Meal; index: number }> = [];
  const translated: Meal[] = new Array(meals.length);

  for (let i = 0; i < meals.length; i++) {
    const detectedLanguage = detectLanguage(meals[i].name);
    if (detectedLanguage === targetLanguage) {
      // Already in target language, no translation needed
      translated[i] = meals[i];
    } else {
      // Needs translation
      mealsToTranslate.push({ meal: meals[i], index: i });
    }
  }

  // Only translate meals that need it
  if (mealsToTranslate.length === 0) {
    return translated;
  }

  // Process in batches of 3 to avoid rate limits and speed up
  const batchSize = 3;

  for (let i = 0; i < mealsToTranslate.length; i += batchSize) {
    const batch = mealsToTranslate.slice(i, i + batchSize);
    const batchPromises = batch.map(({ meal }) =>
      translateMeal(meal, targetLanguage),
    );
    const batchResults = await Promise.all(batchPromises);

    // Place translated meals back in correct positions
    for (let j = 0; j < batch.length; j++) {
      translated[batch[j].index] = batchResults[j];
    }

    // Small delay between batches to avoid rate limits
    if (i + batchSize < mealsToTranslate.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return translated;
}

/**
 * Translate enrichment data (titles, instructions, cook plans)
 */
async function translateEnrichmentText(
  text: string,
  targetLanguage: 'nl' | 'en',
): Promise<string> {
  const sourceLanguage = detectLanguage(text);

  // If already in target language, return as-is
  if (sourceLanguage === targetLanguage) {
    return text;
  }

  const gemini = getGeminiClient();

  const prompt =
    targetLanguage === 'nl'
      ? `Translate the following text to Dutch (Nederlands). Keep it natural and appropriate for cooking instructions. Only return the translated text, nothing else.

Text: "${text}"

Translated text:`
      : `Translate the following text to English. Keep it natural and appropriate for cooking instructions. Only return the translated text, nothing else.

Text: "${text}"

Translated text:`;

  try {
    const response = await gemini.generateText({
      prompt,
      temperature: 0.3,
      purpose: 'translate',
    });

    // Clean up response (remove quotes, trim)
    const translated = response.trim().replace(/^["']|["']$/g, '');
    return translated || text; // Fallback to original if translation fails
  } catch (error) {
    // Handle quota errors gracefully - don't log as error, just return original
    if (error instanceof Error && error.message.includes('quota')) {
      console.warn(
        `Translation skipped due to quota limit for text: "${text.substring(0, 50)}..."`,
      );
      return text; // Fallback to original on quota error
    }
    console.error(`Failed to translate enrichment text "${text}":`, error);
    return text; // Fallback to original on error
  }
}

/**
 * Translate an enriched meal
 */
export async function translateEnrichedMeal(
  enrichedMeal: EnrichedMeal,
  targetLanguage: 'nl' | 'en',
): Promise<EnrichedMeal> {
  // Check if title needs translation
  const titleLanguage = detectLanguage(enrichedMeal.title);
  const translatedTitle =
    titleLanguage === targetLanguage
      ? enrichedMeal.title
      : await translateMealName(enrichedMeal.title, targetLanguage);

  // Check which instructions need translation
  const instructionsToTranslate: Array<{ text: string; index: number }> = [];
  const translatedInstructions = new Array(enrichedMeal.instructions.length);

  for (let i = 0; i < enrichedMeal.instructions.length; i++) {
    const instructionLanguage = detectLanguage(enrichedMeal.instructions[i]);
    if (instructionLanguage === targetLanguage) {
      translatedInstructions[i] = enrichedMeal.instructions[i];
    } else {
      instructionsToTranslate.push({
        text: enrichedMeal.instructions[i],
        index: i,
      });
    }
  }

  // Translate only instructions that need it
  if (instructionsToTranslate.length > 0) {
    const translationPromises = instructionsToTranslate.map(({ text }) =>
      translateEnrichmentText(text, targetLanguage),
    );
    const translated = await Promise.all(translationPromises);
    for (let i = 0; i < instructionsToTranslate.length; i++) {
      translatedInstructions[instructionsToTranslate[i].index] = translated[i];
    }
  }

  // Translate kitchen notes if present
  let translatedKitchenNotes = enrichedMeal.kitchenNotes;
  if (enrichedMeal.kitchenNotes && enrichedMeal.kitchenNotes.length > 0) {
    const notesToTranslate: Array<{ text: string; index: number }> = [];
    translatedKitchenNotes = new Array(enrichedMeal.kitchenNotes.length);

    for (let i = 0; i < enrichedMeal.kitchenNotes.length; i++) {
      const noteLanguage = detectLanguage(enrichedMeal.kitchenNotes[i]);
      if (noteLanguage === targetLanguage) {
        translatedKitchenNotes[i] = enrichedMeal.kitchenNotes[i];
      } else {
        notesToTranslate.push({ text: enrichedMeal.kitchenNotes[i], index: i });
      }
    }

    if (notesToTranslate.length > 0) {
      const translationPromises = notesToTranslate.map(({ text }) =>
        translateEnrichmentText(text, targetLanguage),
      );
      const translated = await Promise.all(translationPromises);
      for (let i = 0; i < notesToTranslate.length; i++) {
        translatedKitchenNotes[notesToTranslate[i].index] = translated[i];
      }
    }
  }

  return {
    ...enrichedMeal,
    title: translatedTitle,
    instructions: translatedInstructions,
    kitchenNotes: translatedKitchenNotes,
  };
}

/**
 * Translate a cook plan day
 */
export async function translateCookPlanDay(
  cookPlanDay: CookPlanDay,
  targetLanguage: 'nl' | 'en',
): Promise<CookPlanDay> {
  // Translate steps
  const translatedSteps = await Promise.all(
    cookPlanDay.steps.map((step) =>
      translateEnrichmentText(step, targetLanguage),
    ),
  );

  return {
    ...cookPlanDay,
    steps: translatedSteps,
  };
}

/**
 * Translate entire enrichment response
 */
export async function translateEnrichment(
  enrichment: MealPlanEnrichmentResponse,
  targetLanguage: 'nl' | 'en',
): Promise<MealPlanEnrichmentResponse> {
  // Safety check: skip translation if disabled
  if (shouldSkipTranslation()) {
    return enrichment;
  }

  // Translate all enriched meals (with error handling)
  const translatedMeals = await Promise.allSettled(
    enrichment.meals.map((meal) => translateEnrichedMeal(meal, targetLanguage)),
  ).then((results) =>
    results.map((result, index) =>
      result.status === 'fulfilled' ? result.value : enrichment.meals[index],
    ),
  );

  // Translate all cook plan days (with error handling)
  const translatedCookPlans = await Promise.allSettled(
    enrichment.cookPlanDays.map((day) =>
      translateCookPlanDay(day, targetLanguage),
    ),
  ).then((results) =>
    results.map((result, index) =>
      result.status === 'fulfilled'
        ? result.value
        : enrichment.cookPlanDays[index],
    ),
  );

  return {
    meals: translatedMeals,
    cookPlanDays: translatedCookPlans,
  };
}
