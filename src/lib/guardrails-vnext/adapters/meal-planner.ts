/**
 * Guard Rails vNext - Meal Planner Adapter
 *
 * Maps Meal Plan to GuardrailsEvaluateInput targets.
 * Pure mapping function (no side effects, deterministic).
 */

import type { TextAtom } from '../types';
import type { MealPlanResponse } from '@/src/lib/diets';

/**
 * Map Meal Plan to GuardrailsEvaluateInput targets
 *
 * Converts meal plan ingredients, meal names, and metadata to TextAtom[] arrays
 * with stable paths for evaluation.
 *
 * @param plan - Meal plan response
 * @param locale - Optional locale for text atoms
 * @returns GuardrailsEvaluateInput targets
 */
export function mapMealPlanToGuardrailsTargets(
  plan: MealPlanResponse,
  locale?: 'nl' | 'en',
): {
  ingredient: TextAtom[];
  step: TextAtom[];
  metadata: TextAtom[];
} {
  const ingredientAtoms: TextAtom[] = [];
  const stepAtoms: TextAtom[] = [];
  const metadataAtoms: TextAtom[] = [];

  // Iterate through days and meals
  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    const day = plan.days[dayIndex];

    for (let mealIndex = 0; mealIndex < day.meals.length; mealIndex++) {
      const meal = day.meals[mealIndex];

      // Map meal name to metadata
      const mealName = meal.name?.trim();
      if (mealName) {
        metadataAtoms.push({
          text: mealName.toLowerCase(),
          path: `days[${dayIndex}].meals[${mealIndex}].name`,
          locale,
        });
      }

      // Map ingredients from ingredientRefs (primary)
      if (meal.ingredientRefs && meal.ingredientRefs.length > 0) {
        for (
          let ingIndex = 0;
          ingIndex < meal.ingredientRefs.length;
          ingIndex++
        ) {
          const ref = meal.ingredientRefs[ingIndex];

          // Use displayName if available, otherwise use NEVO code as fallback
          const ingredientText =
            ref.displayName?.trim() || `NEVO-${ref.nevoCode}`;
          if (ingredientText) {
            ingredientAtoms.push({
              text: ingredientText.toLowerCase(),
              path: `days[${dayIndex}].meals[${mealIndex}].ingredients[${ingIndex}]`,
              canonicalId: ref.nevoCode, // Include NEVO code for canonical_id matching
              locale,
            });
          }

          // Map tags if present (as metadata)
          if (ref.tags && ref.tags.length > 0) {
            for (let tagIndex = 0; tagIndex < ref.tags.length; tagIndex++) {
              const tag = ref.tags[tagIndex]?.trim();
              if (tag) {
                metadataAtoms.push({
                  text: tag.toLowerCase(),
                  path: `days[${dayIndex}].meals[${mealIndex}].ingredients[${ingIndex}].tags[${tagIndex}]`,
                  locale,
                });
              }
            }
          }
        }
      }

      // Map legacy ingredients if present (fallback)
      if (meal.ingredients && meal.ingredients.length > 0) {
        for (let ingIndex = 0; ingIndex < meal.ingredients.length; ingIndex++) {
          const ing = meal.ingredients[ingIndex];
          const ingredientName = ing.name?.trim();
          if (ingredientName) {
            ingredientAtoms.push({
              text: ingredientName.toLowerCase(),
              path: `days[${dayIndex}].meals[${mealIndex}].legacyIngredients[${ingIndex}]`,
              locale,
            });
          }

          // Map tags if present
          if (ing.tags && ing.tags.length > 0) {
            for (let tagIndex = 0; tagIndex < ing.tags.length; tagIndex++) {
              const tag = ing.tags[tagIndex]?.trim();
              if (tag) {
                metadataAtoms.push({
                  text: tag.toLowerCase(),
                  path: `days[${dayIndex}].meals[${mealIndex}].legacyIngredients[${ingIndex}].tags[${tagIndex}]`,
                  locale,
                });
              }
            }
          }
        }
      }
    }
  }

  // Map plan metadata if available
  if (plan.metadata) {
    // Plan description/title could be added here if available in metadata
    // For now, metadata is limited to generatedAt, dietKey, counts
  }

  return {
    ingredient: ingredientAtoms,
    step: stepAtoms, // Meal plans don't have steps in the base structure
    metadata: metadataAtoms,
  };
}

/** Diet Logic ingredient shape (name only for matching) */
export type DietLogicIngredientLike = { name: string };

/**
 * Returns ingredients per day for FORCE-quotum evaluation (dag-aggregatie).
 * FORCE-regels (bv. 9 cups groenten) worden per dag geëvalueerd, niet per maaltijd.
 *
 * @param plan - Meal plan response
 * @returns Array of ingredient arrays, one per day (zelfde volgorde als plan.days)
 */
export function getMealPlanIngredientsPerDay(
  plan: MealPlanResponse,
): DietLogicIngredientLike[][] {
  return plan.days.map((day) => {
    const names: string[] = [];
    for (const meal of day.meals) {
      if (meal.ingredientRefs?.length) {
        for (const ref of meal.ingredientRefs) {
          const t =
            ref.displayName?.trim() ||
            (ref.nevoCode ? `NEVO-${ref.nevoCode}` : null);
          if (t) names.push(t);
        }
      }
      if (meal.ingredients?.length) {
        for (const ing of meal.ingredients) {
          const t = ing.name?.trim();
          if (t) names.push(t);
        }
      }
    }
    return names.map((name) => ({ name }));
  });
}
