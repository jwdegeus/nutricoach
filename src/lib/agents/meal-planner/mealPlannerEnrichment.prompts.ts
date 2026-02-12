/**
 * Meal Planner Enrichment Prompts
 *
 * Builds prompts for enriching meal plans with titles, instructions, and cook plans.
 */

import type { MealPlanResponse } from '@/src/lib/diets';
import type { MealEnrichmentOptions } from './mealPlannerEnrichment.types';

/**
 * Format ingredients for a meal
 */
function formatMealIngredients(
  meal: MealPlanResponse['days'][0]['meals'][0],
  nevoFoodNamesByCode: Record<string, string>,
): string {
  if (!meal.ingredientRefs || meal.ingredientRefs.length === 0) {
    return 'No ingredients';
  }

  const items = meal.ingredientRefs.map((ref) => {
    const code = ref.nevoCode ?? ref.customFoodId ?? ref.fdcId ?? '?';
    const name =
      ref.displayName ||
      (ref.nevoCode && nevoFoodNamesByCode[ref.nevoCode]) ||
      (ref.nevoCode ? `NEVO ${ref.nevoCode}` : null) ||
      `Ingrediënt (${code})`;
    return `- ${name} (ref: ${code}, quantity: ${ref.quantityG}g)`;
  });

  return items.join('\n');
}

/**
 * Build meal enrichment prompt
 *
 * Creates a prompt that instructs Gemini to generate meal titles, instructions,
 * and cook plans using ONLY the provided ingredients (no new ingredients).
 *
 * @param args - Enrichment prompt arguments
 * @returns Formatted prompt string
 */
export function buildMealEnrichmentPrompt(args: {
  plan: MealPlanResponse;
  options: MealEnrichmentOptions;
  nevoFoodNamesByCode: Record<string, string>;
  language?: 'nl' | 'en';
}): string {
  const { plan, options, nevoFoodNamesByCode, language = 'nl' } = args;

  // Format all meals with their ingredients
  const mealsList: string[] = [];
  for (const day of plan.days) {
    for (const meal of day.meals) {
      const ingredients = formatMealIngredients(meal, nevoFoodNamesByCode);
      mealsList.push(
        `MEAL: ${meal.name || 'Unnamed meal'}
Date: ${meal.date}
Slot: ${meal.slot}
Ingredients:
${ingredients}`,
      );
    }
  }

  const pantryStaplesNote = options.allowPantryStaples
    ? ''
    : "\n\nCRITICAL: Do NOT mention or use any pantry staples (water, salt, pepper, oil, etc.) unless they are explicitly listed as ingredients above. Only use the ingredients provided in each meal's ingredient list.";

  const maxSteps = options.maxInstructionSteps || 8;

  // Language instruction
  const languageInstruction =
    language === 'nl'
      ? 'CRITICAL LANGUAGE REQUIREMENT: All meal titles, instructions, cook plans, and any text you generate MUST be in Dutch (Nederlands). Write all instructions, tips, and descriptions in Dutch.'
      : 'CRITICAL LANGUAGE REQUIREMENT: All meal titles, instructions, cook plans, and any text you generate MUST be in English. Write all instructions, tips, and descriptions in English.';

  const prompt = `You are a meal planning assistant that enriches meal plans with cooking instructions and cook plans.

${languageInstruction}

TASK: Generate enriched meal data (titles, instructions, prep/cook times) and daily cook plans for the following meal plan.

MEAL PLAN:
${mealsList.join('\n\n')}

REQUIREMENTS:
1. Output MUST be exactly ONE valid JSON object conforming to the provided schema
2. Do NOT include markdown formatting, code blocks, or explanations
3. Do NOT include any text outside the JSON object
4. For each meal in the plan:
   - Generate a descriptive title (3-80 characters)
   - Generate cooking instructions (${maxSteps} steps maximum, minimum 2 steps)
   - Estimate prepTimeMin and cookTimeMin (0-240 minutes each)
   - Include ingredientNevoCodesUsed: array of NEVO codes that are referenced in the instructions
   - ingredientNevoCodesUsed MUST only contain codes from the meal's ingredient list above
   - Optional: servings count, kitchenNotes (short tips)
5. For each day in the plan:
   - Generate a cook plan with batch suggestions, order of preparation, and prep-ahead tips
   - Only suggest batch cooking if it makes logical sense (e.g., chopping vegetables for multiple meals)
   - CRITICAL: For each cook plan step that mentions a specific meal by name, the time in parentheses (e.g. "Bereid de X (5 min)") MUST equal that meal's prepTimeMin + cookTimeMin. Do not use a different time.
   - Estimate total time for the day as the sum of all step times (or meal times) for that day.
6. For meals whose title suggests a protein shake (eiwitshake, smoothie met eiwit): if the ingredient list has no protein powder (eiwitpoeder, rijsteiwitpoeder, ei-eiwitpoeder), add one short kitchenNote suggesting optional addition of e.g. rijsteiwitpoeder or ei-eiwitpoeder.
7. Do NOT add any new ingredients - use ONLY the ingredients provided in each meal's ingredient list${pantryStaplesNote}
8. Instructions should be clear, step-by-step, and reference ingredients by their names (from the ingredient list)
9. Cook plan steps should be practical and help optimize meal preparation

Generate the enriched meal plan now. Output ONLY the JSON object, nothing else.`;

  return prompt;
}

/**
 * Build repair prompt for enrichment
 */
export function buildEnrichmentRepairPrompt(args: {
  originalPrompt: string;
  badOutput: string;
  issues: string;
  responseJsonSchema: object;
}): string {
  const { originalPrompt, badOutput, issues, responseJsonSchema } = args;

  return `You previously generated an enriched meal plan, but the output had issues that need to be fixed.

ORIGINAL REQUEST:
${originalPrompt}

ISSUES FOUND:
${issues}

INVALID OUTPUT (to be repaired):
${badOutput}

REQUIRED JSON SCHEMA:
${JSON.stringify(responseJsonSchema, null, 2)}

TASK: Repair the output above to create a valid enriched meal plan that:
1. Is valid JSON conforming exactly to the provided schema
2. Does NOT add any extra fields beyond what the schema requires
3. Does NOT add any new ingredients - use ONLY ingredients from the original meal plan
4. ingredientNevoCodesUsed must only contain codes from the meal's ingredient list
5. All meals from the original plan must be present (match on date + mealSlot)
6. Times must be reasonable (prepTimeMin + cookTimeMin <= 240 minutes per meal)
7. Outputs ONLY the JSON object - no markdown, no explanations, no code blocks

Generate the repaired enriched meal plan now. Output ONLY the JSON object, nothing else.`;
}

/**
 * Build prompt for enriching a single meal
 *
 * Creates a prompt that instructs Gemini to generate meal title, instructions,
 * and timing for a single meal using ONLY the provided ingredients.
 *
 * @param args - Single meal enrichment prompt arguments
 * @returns Formatted prompt string
 */
export function buildSingleMealEnrichmentPrompt(args: {
  meal: MealPlanResponse['days'][0]['meals'][0];
  options: MealEnrichmentOptions;
  nevoFoodNamesByCode: Record<string, string>;
  language?: 'nl' | 'en';
}): string {
  const { meal, options, nevoFoodNamesByCode, language = 'nl' } = args;

  const ingredients = formatMealIngredients(meal, nevoFoodNamesByCode);

  const pantryStaplesNote = options.allowPantryStaples
    ? ''
    : "\n\nCRITICAL: Do NOT mention or use any pantry staples (water, salt, pepper, oil, etc.) unless they are explicitly listed as ingredients above. Only use the ingredients provided in the meal's ingredient list.";

  const maxSteps = options.maxInstructionSteps || 8;

  // Language instruction
  const languageInstruction =
    language === 'nl'
      ? 'CRITICAL LANGUAGE REQUIREMENT: All meal titles, instructions, and any text you generate MUST be in Dutch (Nederlands). Write all instructions and descriptions in Dutch.'
      : 'CRITICAL LANGUAGE REQUIREMENT: All meal titles, instructions, and any text you generate MUST be in English. Write all instructions and descriptions in English.';

  const prompt = `You are a meal planning assistant that enriches a single meal with cooking instructions.

${languageInstruction}

TASK: Generate enriched meal data (title, instructions, prep/cook times) for the following meal.

MEAL:
Name: ${meal.name || 'Unnamed meal'}
Date: ${meal.date}
Slot: ${meal.slot}
Ingredients:
${ingredients}

REQUIREMENTS:
1. Output MUST be exactly ONE valid JSON object conforming to the provided schema
2. Do NOT include markdown formatting, code blocks, or explanations
3. Do NOT include any text outside the JSON object
4. Generate:
   - A descriptive title (3-80 characters)
   - Cooking instructions (${maxSteps} steps maximum, minimum 2 steps)
   - Estimate prepTimeMin and cookTimeMin (0-240 minutes each)
   - Include ingredientNevoCodesUsed: array of NEVO codes that are referenced in the instructions
   - ingredientNevoCodesUsed MUST only contain codes from the meal's ingredient list above
   - Optional: servings count, kitchenNotes (short tips)
5. Do NOT add any new ingredients - use ONLY the ingredients provided in the meal's ingredient list${pantryStaplesNote}
6. For meals whose name suggests a protein shake (eiwitshake, smoothie met eiwit): if the ingredient list has no protein powder (eiwitpoeder, rijsteiwitpoeder, ei-eiwitpoeder), add one short kitchenNote suggesting optional addition of e.g. rijsteiwitpoeder or ei-eiwitpoeder.
7. Instructions should be clear, step-by-step, and reference ingredients by their names (from the ingredient list)
8. Times must be reasonable (prepTimeMin + cookTimeMin <= 240 minutes)

Generate the enriched meal now. Output ONLY the JSON object, nothing else.`;

  return prompt;
}
