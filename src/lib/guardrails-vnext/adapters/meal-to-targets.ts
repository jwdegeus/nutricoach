/**
 * Guard Rails vNext - Meal to Targets Adapter
 *
 * Maps a saved meal (custom_meals.meal_data or meal_history.meal_data) to
 * GuardrailsEvaluateInput targets for compliance evaluation.
 */

import type { TextAtom } from '../types';
import type { Meal } from '@/src/lib/diets';

/** Meal-like object (DB may use meal_data with same shape) */
export type MealLike = Pick<Meal, 'name' | 'ingredientRefs' | 'ingredients'> & {
  steps?: Array<{ text?: string }>;
  instructions?: string[];
};

/**
 * Map meal to guardrails evaluation targets
 *
 * Uses ingredientRefs (displayName), ingredients (name), and optional steps/instructions.
 */
export function mapMealToGuardrailsTargets(
  meal: MealLike | Meal | null | undefined,
  locale?: 'nl' | 'en',
): {
  ingredient: TextAtom[];
  step: TextAtom[];
  metadata: TextAtom[];
} {
  const ingredientAtoms: TextAtom[] = [];
  const stepAtoms: TextAtom[] = [];
  const metadataAtoms: TextAtom[] = [];

  if (!meal) {
    return {
      ingredient: ingredientAtoms,
      step: stepAtoms,
      metadata: metadataAtoms,
    };
  }

  const m = meal as MealLike & {
    ingredientRefs?: Array<{ displayName?: string; nevoCode?: string }>;
    ingredients?: Array<{ name?: string }>;
  };

  // Ingredients: ingredientRefs first (displayName or nevoCode), then legacy ingredients
  if (m.ingredientRefs?.length) {
    m.ingredientRefs.forEach((ref, i) => {
      const text = (ref.displayName || ref.nevoCode || '').trim();
      if (text) {
        ingredientAtoms.push({
          text: text.toLowerCase(),
          path: `ingredientRefs[${i}].displayName`,
          locale,
        });
      }
    });
  }
  if (m.ingredients?.length) {
    m.ingredients.forEach((ing, i) => {
      const name = (
        typeof ing === 'object' && ing && 'name' in ing
          ? ((ing as { name?: string }).name ?? '')
          : ''
      ).trim();
      if (name) {
        ingredientAtoms.push({
          text: name.toLowerCase(),
          path: `ingredients[${i}].name`,
          locale,
        });
      }
    });
  }

  // Steps: optional steps[] or instructions[]
  const steps =
    (m as { steps?: Array<{ text?: string }> }).steps ??
    (m as { instructions?: string[] }).instructions;
  if (Array.isArray(steps)) {
    steps.forEach((s, i) => {
      const text =
        typeof s === 'string'
          ? s
          : s && typeof s === 'object' && 'text' in s
            ? (s as { text?: string }).text
            : '';
      const t = String(text ?? '').trim();
      if (t) {
        stepAtoms.push({
          text: t.toLowerCase(),
          path: `steps[${i}].text`,
          locale,
        });
      }
    });
  }

  // Metadata: meal name
  const name = (m.name || '').trim();
  if (name) {
    metadataAtoms.push({
      text: name.toLowerCase(),
      path: 'metadata.name',
      locale,
    });
  }

  return {
    ingredient: ingredientAtoms,
    step: stepAtoms,
    metadata: metadataAtoms,
  };
}
