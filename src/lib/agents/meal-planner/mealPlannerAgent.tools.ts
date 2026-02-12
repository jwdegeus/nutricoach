/**
 * Meal Planner Agent Tools
 *
 * Server-side tools for NEVO ingredient lookup and macro calculation.
 * These tools are used by the meal planner agent to:
 * - Search for candidate ingredients from NEVO database
 * - Calculate macros for meals and days based on NEVO codes
 *
 * All functions are read-only (no writes to database).
 */

import {
  searchNevoFoods,
  calculateMealNutrition,
  type MealIngredient,
} from '@/src/lib/nevo/nutrition-calculator';
import type { Meal, MealPlanDay } from '@/src/lib/diets';

/**
 * NEVO food candidate (simplified for agent use)
 */
export type NevoFoodCandidate = {
  nevoCode: string; // NEVO code as string
  name: string; // Display name (prefer Dutch, fallback to English)
  tags?: string[]; // Optional tags for categorization
};

/**
 * Macro summary for validation
 */
export type MacroSummary = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/**
 * Search for NEVO foods by query string
 *
 * Wraps the existing searchNevoFoods function and formats results
 * for agent use (with nevoCode as string).
 *
 * @param query - Search term (Dutch or English)
 * @param limit - Maximum number of results (default: 20)
 * @returns Array of candidate foods with nevoCode, name, and optional tags
 */
export async function searchNevoFoodCandidates(
  query: string,
  limit: number = 20,
): Promise<NevoFoodCandidate[]> {
  const results = await searchNevoFoods(query, limit);

  return results.map((food) => ({
    nevoCode: String(food.nevo_code),
    name: String(food.name_nl ?? food.name_en ?? 'Unknown'),
    tags: food.food_group_nl
      ? [String(food.food_group_nl).toLowerCase()]
      : undefined,
  }));
}

/**
 * Calculate macros for a single meal based on ingredient references
 *
 * @param ingredients - Array of ingredient references with nevoCode and quantityG
 * @returns Macro summary (calories, protein, carbs, fat)
 */
export async function calcMealMacros(
  ingredients: Array<{ nevoCode: string; quantityG: number }>,
): Promise<MacroSummary> {
  // Convert to MealIngredient format (nevo_food_id is number)
  const mealIngredients: MealIngredient[] = ingredients.map((ing) => ({
    nevo_food_id: parseInt(ing.nevoCode, 10),
    amount_g: ing.quantityG,
  }));

  // Calculate nutrition using existing function
  const nutrition = await calculateMealNutrition(mealIngredients);

  return {
    calories: nutrition.energy_kcal ?? 0,
    proteinG: nutrition.protein_g ?? 0,
    carbsG: nutrition.carbs_g ?? 0,
    fatG: nutrition.fat_g ?? 0,
  };
}

/**
 * Calculate macros for a single day based on all meals
 *
 * @param dayMeals - Array of meals for the day
 * @returns Macro summary for the entire day
 */
export async function calcDayMacros(dayMeals: Meal[]): Promise<MacroSummary> {
  // Collect all ingredient refs from all meals
  const allIngredients: Array<{ nevoCode: string; quantityG: number }> = [];

  for (const meal of dayMeals) {
    if (meal.ingredientRefs && meal.ingredientRefs.length > 0) {
      for (const ref of meal.ingredientRefs) {
        if (ref.nevoCode) {
          allIngredients.push({
            nevoCode: ref.nevoCode,
            quantityG: ref.quantityG,
          });
        }
      }
    }
  }

  // Calculate total macros for the day
  return await calcMealMacros(allIngredients);
}

/**
 * Build candidate pool for meal planning
 *
 * Searches NEVO database for candidate foods in different categories
 * based on diet rules. Returns a structured pool of candidates that
 * the agent can choose from.
 *
 * @param dietKey - Diet type (affects which categories to search)
 * @param excludeTerms - Terms to exclude from search (e.g., allergens)
 * @returns Structured candidate pool by category
 */
export type CandidatePool = {
  proteins: NevoFoodCandidate[];
  vegetables: NevoFoodCandidate[];
  fruits: NevoFoodCandidate[];
  fats: NevoFoodCandidate[];
  carbs: NevoFoodCandidate[];
  /** Ingredients suitable for shakes/smoothies: milk, yoghurt, fruit, etc. */
  dairy_liquids: NevoFoodCandidate[];
  [key: string]: NevoFoodCandidate[]; // Allow additional categories
};

export async function buildCandidatePool(
  dietKey: string,
  excludeTerms: string[] = [],
): Promise<CandidatePool> {
  // Define search terms per category (diet-aware)
  const searchTerms: Record<string, string[]> = {
    proteins:
      dietKey === 'vegan'
        ? [
            'tofu',
            'tempeh',
            'seitan',
            'linzen',
            'kikkererwten',
            'bonen',
            'noten',
          ]
        : [
            'kip',
            'kipfilet',
            'eieren',
            'zalm',
            'tonijn',
            'rundvlees',
            'varkensvlees',
            'tofu',
          ],
    vegetables: [
      'broccoli',
      'spinazie',
      'wortel',
      'paprika',
      'tomaat',
      'komkommer',
      'ui',
      'knoflook',
    ],
    fruits: [
      'appel',
      'banaan',
      'blauwe bessen',
      'bessen',
      'sinaasappel',
      'druiven',
      'aardbei',
      'peer',
    ],
    fats: ['olijfolie', 'avocado', 'noten', 'zaden', 'kokosolie'],
    carbs:
      dietKey === 'keto' || dietKey === 'wahls_paleo_plus'
        ? [] // Keto and Wahls don't use traditional carbs
        : ['rijst', 'aardappel', 'pasta', 'haver', 'quinoa', 'brood'],
    // Shake/smoothie-friendly: liquid base; Wahls Paleo forbids dairy so no cow milk/yoghurt in pool
    dairy_liquids:
      dietKey === 'wahls_paleo_plus'
        ? ['amandelmelk', 'kokosmelk', 'eiwitpoeder'] // non-dairy liquids only
        : [
            'melk',
            'yoghurt',
            'kwark',
            'amandelmelk',
            'sojamelk',
            'eiwitpoeder',
          ],
  };

  // Build candidate pool in parallel
  const pool: CandidatePool = {
    proteins: [],
    vegetables: [],
    fruits: [],
    fats: [],
    carbs: [],
    dairy_liquids: [],
  };

  const filterExcluded = (candidates: NevoFoodCandidate[]) =>
    candidates.filter((candidate) => {
      const candidateName = candidate.name.toLowerCase();
      return !excludeTerms.some((exclude) =>
        candidateName.includes(exclude.toLowerCase()),
      );
    });

  // Search each category
  const searchPromises: Promise<void>[] = [];

  for (const [category, terms] of Object.entries(searchTerms)) {
    if (terms.length === 0) continue; // Skip empty categories (e.g., carbs for keto)

    // Search with first term (can be extended to search multiple terms)
    const searchTerm = terms[0];
    const promise = searchNevoFoodCandidates(searchTerm, 20).then(
      (candidates) => {
        pool[category] = filterExcluded(candidates);
      },
    );

    searchPromises.push(promise);
  }

  // dairy_liquids: search multiple terms and merge (dedupe by nevoCode) so we get melk, yoghurt, kwark, amandelmelk, etc.
  const dairyTerms = searchTerms.dairy_liquids;
  const dairyPromise = Promise.all(
    dairyTerms.map((term) => searchNevoFoodCandidates(term, 15)),
  ).then((results) => {
    const seen = new Set<string>();
    const merged: NevoFoodCandidate[] = [];
    for (const list of results) {
      for (const c of filterExcluded(list)) {
        if (seen.has(c.nevoCode)) continue;
        seen.add(c.nevoCode);
        merged.push(c);
      }
    }
    pool.dairy_liquids = merged;
  });
  searchPromises.push(dairyPromise);

  // Wait for all searches to complete
  await Promise.all(searchPromises);

  return pool;
}

/**
 * Verify that a nevoCode exists in the NEVO database
 *
 * @param nevoCode - NEVO code to verify
 * @returns true if code exists, false otherwise
 */
export async function verifyNevoCode(nevoCode: string): Promise<boolean> {
  try {
    const codeNum = parseInt(nevoCode, 10);
    if (isNaN(codeNum)) return false;

    const { getNevoFoodByCode } =
      await import('@/src/lib/nevo/nutrition-calculator');
    const food = await getNevoFoodByCode(codeNum);
    return food !== null;
  } catch {
    return false;
  }
}

/**
 * Quantity adjustment record
 */
export type QuantityAdjustment = {
  nevoCode: string;
  oldG: number;
  newG: number;
};

/**
 * Adjust day quantities to meet macro targets deterministically
 *
 * Scales ingredient quantities proportionally to meet calorie/macro targets
 * without changing ingredients. This avoids LLM calls for simple macro adjustments.
 *
 * @param args - Adjustment parameters
 * @returns Adjusted day and list of adjustments made
 */
export async function adjustDayQuantitiesToTargets(args: {
  day: MealPlanDay;
  targets: {
    calories?: { min: number; max: number };
    proteinG?: { min: number; max: number };
    carbsG?: { max: number };
    fatG?: { min: number; max: number };
  };
  maxScale?: number; // Maximum scale factor (default: 1.3 = 30% increase)
  minScale?: number; // Minimum scale factor (default: 0.7 = 30% decrease)
}): Promise<{
  day: MealPlanDay;
  adjustments: QuantityAdjustment[];
}> {
  const { day, targets, maxScale = 1.3, minScale = 0.7 } = args;

  // Calculate current macros
  const currentMacros = await calcDayMacros(day.meals);

  // Determine scale factor based on calorie target (primary)
  let scaleFactor = 1.0;

  if (targets.calories) {
    const targetMid = (targets.calories.min + targets.calories.max) / 2;
    if (currentMacros.calories > 0) {
      scaleFactor = targetMid / currentMacros.calories;
      // Clamp scale factor
      scaleFactor = Math.max(minScale, Math.min(maxScale, scaleFactor));
    }
  }

  // If protein target exists and is below minimum, try to scale protein-rich ingredients more
  // For MVP: apply uniform scaling. Future: selective protein scaling
  if (targets.proteinG && currentMacros.proteinG < targets.proteinG.min) {
    // If calories are already at target, we can't scale up much
    // For now, use calorie-based scaling (future: selective protein ingredient scaling)
    const proteinScale = targets.proteinG.min / currentMacros.proteinG;
    if (proteinScale > scaleFactor && proteinScale <= maxScale) {
      // Only if it doesn't exceed calorie max
      const projectedCalories = currentMacros.calories * proteinScale;
      if (!targets.calories || projectedCalories <= targets.calories.max) {
        scaleFactor = Math.min(proteinScale, maxScale);
      }
    }
  }

  // Apply scaling to all ingredients
  const adjustments: QuantityAdjustment[] = [];
  const adjustedMeals: Meal[] = day.meals.map((meal) => {
    const adjustedMeal: Meal = {
      ...meal,
      ingredientRefs: meal.ingredientRefs.map((ref) => {
        const oldG = ref.quantityG;
        // Round to nearest 5g for practical quantities
        const newG = Math.round((oldG * scaleFactor) / 5) * 5;
        // Minimum 1g
        const finalG = Math.max(1, newG);

        if (finalG !== oldG && ref.nevoCode) {
          adjustments.push({
            nevoCode: ref.nevoCode,
            oldG,
            newG: finalG,
          });
        }

        return {
          ...ref,
          quantityG: finalG,
        };
      }),
    };
    return adjustedMeal;
  });

  return {
    day: {
      ...day,
      meals: adjustedMeals,
    },
    adjustments,
  };
}
