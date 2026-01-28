/**
 * Guard Rails vNext - Recipe Adaptation Adapter Tests
 * 
 * Unit tests for the recipe adaptation adapter.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mapRecipeDraftToGuardrailsTargets } from './recipe-adaptation';
import type { RecipeAdaptationDraft } from '@/src/app/(app)/recipes/[recipeId]/recipe-ai.types';

// Helper to create a minimal draft
function createDraft(overrides?: Partial<RecipeAdaptationDraft>): RecipeAdaptationDraft {
  return {
    analysis: {
      violations: [],
      summary: 'No violations',
    },
    rewrite: {
      title: 'Test Recipe',
      ingredients: [],
      steps: [],
    },
    ...overrides,
  };
}

describe('mapRecipeDraftToGuardrailsTargets', () => {
  describe('Ingredients mapping', () => {
    it('should map ingredient names to TextAtom with stable paths', () => {
      const draft = createDraft({
        rewrite: {
          title: 'Test Recipe',
          ingredients: [
            { name: 'Pasta', quantity: '200', unit: 'g' },
            { name: 'Tomaten', quantity: '2', unit: 'stuks' },
          ],
          steps: [],
        },
      });

      const result = mapRecipeDraftToGuardrailsTargets(draft, 'nl');

      assert.strictEqual(result.ingredient.length, 2);
      assert.strictEqual(result.ingredient[0].text, 'pasta');
      assert.strictEqual(result.ingredient[0].path, 'ingredients[0].name');
      assert.strictEqual(result.ingredient[0].locale, 'nl');
      assert.strictEqual(result.ingredient[1].text, 'tomaten');
      assert.strictEqual(result.ingredient[1].path, 'ingredients[1].name');
    });

    it('should map ingredient notes if present', () => {
      const draft = createDraft({
        rewrite: {
          title: 'Test Recipe',
          ingredients: [
            { name: 'Pasta', quantity: '200', unit: 'g', note: 'Glutenvrij' },
          ],
          steps: [],
        },
      });

      const result = mapRecipeDraftToGuardrailsTargets(draft, 'nl');

      assert.strictEqual(result.ingredient.length, 2); // name + note
      assert.strictEqual(result.ingredient[0].text, 'pasta');
      assert.strictEqual(result.ingredient[0].path, 'ingredients[0].name');
      assert.strictEqual(result.ingredient[1].text, 'glutenvrij');
      assert.strictEqual(result.ingredient[1].path, 'ingredients[0].note');
    });

    it('should filter empty ingredient strings', () => {
      const draft = createDraft({
        rewrite: {
          title: 'Test Recipe',
          ingredients: [
            { name: 'Pasta', quantity: '200', unit: 'g' },
            { name: '   ', quantity: '100', unit: 'g' }, // Empty after trim
            { name: '', quantity: '50', unit: 'g' }, // Empty
          ],
          steps: [],
        },
      });

      const result = mapRecipeDraftToGuardrailsTargets(draft, 'nl');

      // Should only have 1 ingredient (empty ones filtered)
      assert.strictEqual(result.ingredient.length, 1);
      assert.strictEqual(result.ingredient[0].text, 'pasta');
    });

    it('should lowercase ingredient text', () => {
      const draft = createDraft({
        rewrite: {
          title: 'Test Recipe',
          ingredients: [
            { name: 'PASTA', quantity: '200', unit: 'g' },
            { name: 'Tomaten', quantity: '2', unit: 'stuks' },
          ],
          steps: [],
        },
      });

      const result = mapRecipeDraftToGuardrailsTargets(draft, 'nl');

      assert.strictEqual(result.ingredient[0].text, 'pasta');
      assert.strictEqual(result.ingredient[1].text, 'tomaten');
    });
  });

  describe('Steps mapping', () => {
    it('should map step text to TextAtom with stable paths', () => {
      const draft = createDraft({
        rewrite: {
          title: 'Test Recipe',
          ingredients: [],
          steps: [
            { step: 1, text: 'Kook de pasta' },
            { step: 2, text: 'Voeg tomaten toe' },
          ],
        },
      });

      const result = mapRecipeDraftToGuardrailsTargets(draft, 'nl');

      assert.strictEqual(result.step.length, 2);
      assert.strictEqual(result.step[0].text, 'kook de pasta');
      assert.strictEqual(result.step[0].path, 'steps[0].text');
      assert.strictEqual(result.step[0].locale, 'nl');
      assert.strictEqual(result.step[1].text, 'voeg tomaten toe');
      assert.strictEqual(result.step[1].path, 'steps[1].text');
    });

    it('should filter empty step strings', () => {
      const draft = createDraft({
        rewrite: {
          title: 'Test Recipe',
          ingredients: [],
          steps: [
            { step: 1, text: 'Kook de pasta' },
            { step: 2, text: '   ' }, // Empty after trim
            { step: 3, text: '' }, // Empty
          ],
        },
      });

      const result = mapRecipeDraftToGuardrailsTargets(draft, 'nl');

      // Should only have 1 step (empty ones filtered)
      assert.strictEqual(result.step.length, 1);
      assert.strictEqual(result.step[0].text, 'kook de pasta');
    });

    it('should lowercase step text', () => {
      const draft = createDraft({
        rewrite: {
          title: 'Test Recipe',
          ingredients: [],
          steps: [
            { step: 1, text: 'KOOK DE PASTA' },
          ],
        },
      });

      const result = mapRecipeDraftToGuardrailsTargets(draft, 'nl');

      assert.strictEqual(result.step[0].text, 'kook de pasta');
    });
  });

  describe('Metadata mapping', () => {
    it('should map title to metadata TextAtom', () => {
      const draft = createDraft({
        rewrite: {
          title: 'Pasta Carbonara',
          ingredients: [],
          steps: [],
        },
      });

      const result = mapRecipeDraftToGuardrailsTargets(draft, 'nl');

      assert.strictEqual(result.metadata.length, 1);
      assert.strictEqual(result.metadata[0].text, 'pasta carbonara');
      assert.strictEqual(result.metadata[0].path, 'metadata.title');
      assert.strictEqual(result.metadata[0].locale, 'nl');
    });

    it('should filter empty title', () => {
      const draft = createDraft({
        rewrite: {
          title: '   ',
          ingredients: [],
          steps: [],
        },
      });

      const result = mapRecipeDraftToGuardrailsTargets(draft, 'nl');

      assert.strictEqual(result.metadata.length, 0);
    });
  });

  describe('Locale handling', () => {
    it('should use provided locale', () => {
      const draft = createDraft({
        rewrite: {
          title: 'Test Recipe',
          ingredients: [{ name: 'Pasta', quantity: '200', unit: 'g' }],
          steps: [{ step: 1, text: 'Cook pasta' }],
        },
      });

      const resultEn = mapRecipeDraftToGuardrailsTargets(draft, 'en');
      assert.strictEqual(resultEn.ingredient[0].locale, 'en');
      assert.strictEqual(resultEn.step[0].locale, 'en');
      assert.strictEqual(resultEn.metadata[0].locale, 'en');

      const resultNl = mapRecipeDraftToGuardrailsTargets(draft, 'nl');
      assert.strictEqual(resultNl.ingredient[0].locale, 'nl');
      assert.strictEqual(resultNl.step[0].locale, 'nl');
      assert.strictEqual(resultNl.metadata[0].locale, 'nl');
    });

    it('should work without locale (undefined)', () => {
      const draft = createDraft({
        rewrite: {
          title: 'Test Recipe',
          ingredients: [{ name: 'Pasta', quantity: '200', unit: 'g' }],
          steps: [],
        },
      });

      const result = mapRecipeDraftToGuardrailsTargets(draft, undefined);

      assert.strictEqual(result.ingredient[0].locale, undefined);
    });
  });

  describe('Path stability', () => {
    it('should generate stable paths for same input', () => {
      const draft = createDraft({
        rewrite: {
          title: 'Test Recipe',
          ingredients: [
            { name: 'Pasta', quantity: '200', unit: 'g' },
            { name: 'Tomaten', quantity: '2', unit: 'stuks' },
          ],
          steps: [
            { step: 1, text: 'Kook pasta' },
            { step: 2, text: 'Voeg tomaten toe' },
          ],
        },
      });

      const result1 = mapRecipeDraftToGuardrailsTargets(draft, 'nl');
      const result2 = mapRecipeDraftToGuardrailsTargets(draft, 'nl');

      // Paths should be identical
      assert.deepStrictEqual(
        result1.ingredient.map((a) => a.path),
        result2.ingredient.map((a) => a.path)
      );
      assert.deepStrictEqual(
        result1.step.map((a) => a.path),
        result2.step.map((a) => a.path)
      );
    });
  });
});
