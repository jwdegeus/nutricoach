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
 * Ingredients: we gebruiken ingredientRefs OF ingredients (niet beide), zodat
 * één fysiek ingrediënt = één atoom. Dat sluit aan bij de AI magician en voorkomt
 * dat de compliance-score lager is door dubbele telling (bijv. 94% bij "geen verbeteringen").
 * Steps: elke bereidingsstap is één atoom (een verboden term in een stap telt als violation).
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
    ingredient_refs?: Array<{
      displayName?: string;
      display_name?: string;
      nevoCode?: string;
      nevo_code?: string;
    }>;
    ingredients?: Array<{ name?: string }>;
    steps?: Array<{ text?: string } | string>;
    instructions?: string[];
  };

  // Ingredients: ingredientRefs OF ingredient_refs (snake_case) OF legacy ingredients; één bron, één atoom per ingrediënt
  const refs =
    m.ingredientRefs ??
    (
      m as {
        ingredient_refs?: Array<{
          displayName?: string;
          display_name?: string;
          nevoCode?: string;
          nevo_code?: string;
        }>;
      }
    ).ingredient_refs;
  if (refs?.length) {
    refs.forEach((ref: any, i: number) => {
      const text = (
        ref.displayName ??
        ref.display_name ??
        ref.nevoCode ??
        ref.nevo_code ??
        ''
      )
        .toString()
        .trim();
      if (text) {
        ingredientAtoms.push({
          text: text.toLowerCase(),
          path: `ingredientRefs[${i}].displayName`,
          locale,
        });
      }
    });
  } else if (m.ingredients?.length) {
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

  // Steps: steps[] of instructions[] (camelCase of snake_case)
  const steps =
    (m as { steps?: Array<{ text?: string } | string> }).steps ??
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
