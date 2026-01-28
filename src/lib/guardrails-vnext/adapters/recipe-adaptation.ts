/**
 * Guard Rails vNext - Recipe Adaptation Adapter
 *
 * Maps Recipe Adaptation draft to GuardrailsEvaluateInput targets.
 * Pure mapping function (no side effects, deterministic).
 */

import type { TextAtom } from '../types';
import type { RecipeAdaptationDraft } from '@/src/app/(app)/recipes/[recipeId]/recipe-ai.types';

/**
 * Map Recipe Adaptation draft to GuardrailsEvaluateInput targets
 *
 * Converts draft ingredients, steps, and metadata to TextAtom[] arrays
 * with stable paths for evaluation.
 *
 * @param draft - Recipe adaptation draft
 * @param locale - Optional locale for text atoms
 * @returns GuardrailsEvaluateInput targets
 */
export function mapRecipeDraftToGuardrailsTargets(
  draft: RecipeAdaptationDraft,
  locale?: 'nl' | 'en',
): {
  ingredient: TextAtom[];
  step: TextAtom[];
  metadata: TextAtom[];
} {
  // Map ingredients
  const ingredientAtoms: TextAtom[] = [];
  for (let i = 0; i < draft.rewrite.ingredients.length; i++) {
    const ing = draft.rewrite.ingredients[i];

    // Primary text: ingredient name
    const nameText = ing.name?.trim();
    if (nameText) {
      ingredientAtoms.push({
        text: nameText.toLowerCase(),
        path: `ingredients[${i}].name`,
        locale,
      });
    }

    // Optional: note field
    const noteText = ing.note?.trim();
    if (noteText) {
      ingredientAtoms.push({
        text: noteText.toLowerCase(),
        path: `ingredients[${i}].note`,
        locale,
      });
    }
  }

  // Map steps
  const stepAtoms: TextAtom[] = [];
  for (let i = 0; i < draft.rewrite.steps.length; i++) {
    const step = draft.rewrite.steps[i];
    const stepText = step.text?.trim();
    if (stepText) {
      stepAtoms.push({
        text: stepText.toLowerCase(),
        path: `steps[${i}].text`,
        locale,
      });
    }
  }

  // Map metadata (title, description, sourceUrl if available)
  const metadataAtoms: TextAtom[] = [];

  const titleText = draft.rewrite.title?.trim();
  if (titleText) {
    metadataAtoms.push({
      text: titleText.toLowerCase(),
      path: 'metadata.title',
      locale,
    });
  }

  // Note: RecipeAdaptationDraft doesn't have description or sourceUrl fields
  // If they're added later, they can be mapped here

  return {
    ingredient: ingredientAtoms,
    step: stepAtoms,
    metadata: metadataAtoms,
  };
}
