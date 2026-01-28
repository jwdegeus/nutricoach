/**
 * Guard Rails vNext - Plan Chat Adapter
 *
 * Maps Plan Edit and/or Plan Snapshot to GuardrailsEvaluateInput targets.
 * Pure mapping function (no side effects, deterministic).
 */

import type { TextAtom } from '../types';
import type { MealPlanResponse } from '@/src/lib/diets';
import type { PlanEdit } from '@/src/lib/agents/meal-planner/planEdit.types';
import { mapMealPlanToGuardrailsTargets } from './meal-planner';

/**
 * Map Plan Edit to GuardrailsEvaluateInput targets
 *
 * Maps PlanEdit user intent and constraints to TextAtom[] arrays.
 * Also includes plan snapshot if provided for complete evaluation.
 *
 * @param edit - Plan edit (user intent)
 * @param planSnapshot - Optional plan snapshot (current state)
 * @param locale - Optional locale for text atoms
 * @returns GuardrailsEvaluateInput targets
 */
export function mapPlanEditToGuardrailsTargets(
  edit: PlanEdit,
  planSnapshot?: MealPlanResponse,
  locale?: 'nl' | 'en',
): {
  ingredient: TextAtom[];
  step: TextAtom[];
  metadata: TextAtom[];
} {
  const ingredientAtoms: TextAtom[] = [];
  const stepAtoms: TextAtom[] = [];
  const metadataAtoms: TextAtom[] = [];

  // Map user intent summary to metadata
  const intentText = edit.userIntentSummary?.trim();
  if (intentText) {
    metadataAtoms.push({
      text: intentText.toLowerCase(),
      path: 'edit.userIntentSummary',
      locale,
    });
  }

  // Map notes to metadata
  if (edit.notes && edit.notes.length > 0) {
    for (let i = 0; i < edit.notes.length; i++) {
      const note = edit.notes[i]?.trim();
      if (note) {
        metadataAtoms.push({
          text: note.toLowerCase(),
          path: `edit.notes[${i}]`,
          locale,
        });
      }
    }
  }

  // Map avoidIngredients from constraints to ingredients
  if (
    edit.constraints?.avoidIngredients &&
    edit.constraints.avoidIngredients.length > 0
  ) {
    for (let i = 0; i < edit.constraints.avoidIngredients.length; i++) {
      const ingredient = edit.constraints.avoidIngredients[i]?.trim();
      if (ingredient) {
        ingredientAtoms.push({
          text: ingredient.toLowerCase(),
          path: `edit.constraints.avoidIngredients[${i}]`,
          locale,
        });
      }
    }
  }

  // If plan snapshot is provided, merge its targets
  if (planSnapshot) {
    const snapshotTargets = mapMealPlanToGuardrailsTargets(
      planSnapshot,
      locale,
    );
    // Merge ingredients (avoid duplicates by path)
    const existingPaths = new Set(ingredientAtoms.map((a) => a.path));
    for (const atom of snapshotTargets.ingredient) {
      if (!existingPaths.has(atom.path)) {
        ingredientAtoms.push(atom);
      }
    }
    // Merge steps
    stepAtoms.push(...snapshotTargets.step);
    // Merge metadata (avoid duplicates by path)
    const existingMetaPaths = new Set(metadataAtoms.map((a) => a.path));
    for (const atom of snapshotTargets.metadata) {
      if (!existingMetaPaths.has(atom.path)) {
        metadataAtoms.push(atom);
      }
    }
  }

  return {
    ingredient: ingredientAtoms,
    step: stepAtoms,
    metadata: metadataAtoms,
  };
}
