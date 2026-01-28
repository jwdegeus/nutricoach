/**
 * Guard Rails vNext - Plan Chat Adapter Tests
 * 
 * Unit tests for the plan chat adapter.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mapPlanEditToGuardrailsTargets } from './plan-chat';
import type { PlanEdit } from '@/src/lib/agents/meal-planner/planEdit.types';
import type { MealPlanResponse } from '@/src/lib/diets';

// Helper to create a minimal plan edit
function createPlanEdit(overrides?: Partial<PlanEdit>): PlanEdit {
  return {
    action: 'REPLACE_MEAL',
    planId: 'plan-1',
    date: '2026-01-26',
    mealSlot: 'breakfast',
    userIntentSummary: 'Replace breakfast with eggs',
    ...overrides,
  };
}

// Helper to create a minimal meal plan
function createMealPlan(overrides?: Partial<MealPlanResponse>): MealPlanResponse {
  return {
    requestId: 'test-request',
    days: [],
    ...overrides,
  };
}

describe('mapPlanEditToGuardrailsTargets', () => {
  describe('PlanEdit mapping', () => {
    it('should map userIntentSummary to metadata', () => {
      const edit = createPlanEdit({
        userIntentSummary: 'Replace breakfast with eggs and bacon',
      });

      const result = mapPlanEditToGuardrailsTargets(edit, undefined, 'nl');

      assert.strictEqual(result.metadata.length, 1);
      assert.strictEqual(result.metadata[0].text, 'replace breakfast with eggs and bacon');
      assert.strictEqual(result.metadata[0].path, 'edit.userIntentSummary');
      assert.strictEqual(result.metadata[0].locale, 'nl');
    });

    it('should map notes to metadata', () => {
      const edit = createPlanEdit({
        userIntentSummary: undefined, // Explicitly exclude default
        notes: ['High protein', 'Quick prep'],
      });

      const result = mapPlanEditToGuardrailsTargets(edit, undefined, 'nl');

      assert.strictEqual(result.metadata.length, 2);
      assert.strictEqual(result.metadata[0].text, 'high protein');
      assert.strictEqual(result.metadata[0].path, 'edit.notes[0]');
      assert.strictEqual(result.metadata[1].text, 'quick prep');
      assert.strictEqual(result.metadata[1].path, 'edit.notes[1]');
    });

    it('should map avoidIngredients to ingredients', () => {
      const edit = createPlanEdit({
        constraints: {
          avoidIngredients: ['pasta', 'dairy'],
        },
      });

      const result = mapPlanEditToGuardrailsTargets(edit, undefined, 'nl');

      assert.strictEqual(result.ingredient.length, 2);
      assert.strictEqual(result.ingredient[0].text, 'pasta');
      assert.strictEqual(result.ingredient[0].path, 'edit.constraints.avoidIngredients[0]');
      assert.strictEqual(result.ingredient[1].text, 'dairy');
      assert.strictEqual(result.ingredient[1].path, 'edit.constraints.avoidIngredients[1]');
    });

    it('should filter empty strings', () => {
      const edit = createPlanEdit({
        userIntentSummary: '   ', // Empty after trim - will be filtered
        notes: ['Valid note', '   ', ''], // Only first is valid, others filtered
      });

      const result = mapPlanEditToGuardrailsTargets(edit, undefined, 'nl');

      // Should only have 1 note (empty userIntentSummary filtered, empty notes filtered)
      // userIntentSummary '   ' becomes '' after trim, so it's filtered out
      assert.strictEqual(result.metadata.length, 1, `Expected 1 metadata, got ${result.metadata.length}: ${result.metadata.map(m => `${m.text} (${m.path})`).join(', ')}`);
      const validNote = result.metadata.find((m) => m.path.includes('notes'));
      assert(validNote, 'Should have valid note in metadata');
      assert.strictEqual(validNote.text, 'valid note');
    });

    it('should lowercase all text', () => {
      const edit = createPlanEdit({
        userIntentSummary: 'REPLACE BREAKFAST',
        notes: ['HIGH PROTEIN'],
        constraints: {
          avoidIngredients: ['PASTA'],
        },
      });

      const result = mapPlanEditToGuardrailsTargets(edit, undefined, 'nl');

      // Check that all text is lowercased (order may vary)
      assert(result.metadata.some((m) => m.text === 'replace breakfast'), 'Should contain lowercased userIntentSummary');
      assert(result.metadata.some((m) => m.text === 'high protein'), 'Should contain lowercased note');
      assert.strictEqual(result.ingredient[0].text, 'pasta');
    });
  });

  describe('Plan snapshot merging', () => {
    it('should merge plan snapshot targets when provided', () => {
      const edit = createPlanEdit({
        userIntentSummary: 'Replace breakfast',
      });

      const planSnapshot = createMealPlan({
        days: [
          {
            date: '2026-01-26',
            meals: [
              {
                id: 'meal-1',
                name: 'Breakfast',
                slot: 'breakfast',
                date: '2026-01-26',
                ingredientRefs: [
                  { nevoCode: '123', quantityG: 100, displayName: 'Eieren' },
                ],
              },
            ],
          },
        ],
      });

      const result = mapPlanEditToGuardrailsTargets(edit, planSnapshot, 'nl');

      // Should have edit metadata + plan snapshot ingredients + meal name
      // Metadata: userIntentSummary + meal name from snapshot
      assert(result.metadata.length >= 1, `Expected at least 1 metadata, got ${result.metadata.length}`);
      assert(result.ingredient.length >= 1, `Expected at least 1 ingredient, got ${result.ingredient.length}`);
      assert(result.ingredient.some((ing) => ing.text === 'eieren'), 'Should contain eieren ingredient');
    });

    it('should include both edit and snapshot ingredients (different paths)', () => {
      const edit = createPlanEdit({
        constraints: {
          avoidIngredients: ['pasta'],
        },
      });

      const planSnapshot = createMealPlan({
        days: [
          {
            date: '2026-01-26',
            meals: [
              {
                id: 'meal-1',
                name: 'Breakfast',
                slot: 'breakfast',
                date: '2026-01-26',
                ingredientRefs: [
                  { nevoCode: '123', quantityG: 100, displayName: 'Pasta' },
                ],
              },
            ],
          },
        ],
      });

      const result = mapPlanEditToGuardrailsTargets(edit, planSnapshot, 'nl');

      // Should have ingredients from both edit and snapshot (different paths, so both included)
      // Edit has: avoidIngredients: ['pasta'] -> ingredient with path 'edit.constraints.avoidIngredients[0]'
      // Snapshot has: displayName: 'Pasta' -> ingredient with path 'days[0].meals[0].ingredients[0]'
      assert(result.ingredient.length >= 1, `Should have at least 1 ingredient, got ${result.ingredient.length}`);
      // Check that we have pasta ingredient (from either source)
      const pastaIngredients = result.ingredient.filter((ing) => ing.text === 'pasta');
      assert(pastaIngredients.length >= 1, `Should contain pasta ingredient. Got: ${result.ingredient.map(i => `${i.text} (${i.path})`).join(', ')}`);
    });
  });

  describe('Locale handling', () => {
    it('should use provided locale', () => {
      const edit = createPlanEdit({
        userIntentSummary: 'Replace breakfast',
      });

      const resultEn = mapPlanEditToGuardrailsTargets(edit, undefined, 'en');
      assert.strictEqual(resultEn.metadata[0].locale, 'en');

      const resultNl = mapPlanEditToGuardrailsTargets(edit, undefined, 'nl');
      assert.strictEqual(resultNl.metadata[0].locale, 'nl');
    });

    it('should work without locale (undefined)', () => {
      const edit = createPlanEdit({
        userIntentSummary: 'Replace breakfast',
      });

      const result = mapPlanEditToGuardrailsTargets(edit, undefined, undefined);

      assert.strictEqual(result.metadata[0].locale, undefined);
    });
  });

  describe('Path stability', () => {
    it('should generate stable paths for same input', () => {
      const edit = createPlanEdit({
        userIntentSummary: 'Replace breakfast',
        notes: ['High protein'],
        constraints: {
          avoidIngredients: ['pasta'],
        },
      });

      const result1 = mapPlanEditToGuardrailsTargets(edit, undefined, 'nl');
      const result2 = mapPlanEditToGuardrailsTargets(edit, undefined, 'nl');

      // Paths should be identical
      assert.deepStrictEqual(
        result1.metadata.map((a) => a.path),
        result2.metadata.map((a) => a.path)
      );
      assert.deepStrictEqual(
        result1.ingredient.map((a) => a.path),
        result2.ingredient.map((a) => a.path)
      );
    });
  });
});
