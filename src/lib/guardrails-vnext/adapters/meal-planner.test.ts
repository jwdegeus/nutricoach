/**
 * Guard Rails vNext - Meal Planner Adapter Tests
 *
 * Unit tests for the meal planner adapter.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mapMealPlanToGuardrailsTargets } from './meal-planner';
import type { MealPlanResponse, Meal } from '@/src/lib/diets';

// Helper to create a minimal meal plan
function createMealPlan(
  overrides?: Partial<MealPlanResponse>,
): MealPlanResponse {
  return {
    requestId: 'test-request',
    days: [],
    ...overrides,
  };
}

function createMeal(overrides?: Partial<Meal>): Meal {
  return {
    id: 'meal-1',
    name: 'Test Meal',
    slot: 'breakfast',
    date: '2026-01-26',
    ingredientRefs: [],
    ...overrides,
  };
}

describe('mapMealPlanToGuardrailsTargets', () => {
  describe('Ingredients mapping', () => {
    it('should map ingredientRefs displayName to TextAtom with stable paths', () => {
      const plan = createMealPlan({
        days: [
          {
            date: '2026-01-26',
            meals: [
              createMeal({
                name: 'Breakfast',
                ingredientRefs: [
                  { nevoCode: '123', quantityG: 100, displayName: 'Eieren' },
                  { nevoCode: '456', quantityG: 200, displayName: 'Brood' },
                ],
              }),
            ],
          },
        ],
      });

      const result = mapMealPlanToGuardrailsTargets(plan, 'nl');

      assert.strictEqual(result.ingredient.length, 2);
      assert.strictEqual(result.ingredient[0].text, 'eieren');
      assert.strictEqual(
        result.ingredient[0].path,
        'days[0].meals[0].ingredients[0]',
      );
      assert.strictEqual(result.ingredient[0].canonicalId, '123');
      assert.strictEqual(result.ingredient[0].locale, 'nl');
      assert.strictEqual(result.ingredient[1].text, 'brood');
      assert.strictEqual(
        result.ingredient[1].path,
        'days[0].meals[0].ingredients[1]',
      );
    });

    it('should use NEVO code as fallback when displayName is missing', () => {
      const plan = createMealPlan({
        days: [
          {
            date: '2026-01-26',
            meals: [
              createMeal({
                ingredientRefs: [{ nevoCode: '789', quantityG: 150 }],
              }),
            ],
          },
        ],
      });

      const result = mapMealPlanToGuardrailsTargets(plan, 'nl');

      assert.strictEqual(result.ingredient.length, 1);
      assert.strictEqual(result.ingredient[0].text, 'nevo-789');
      assert.strictEqual(result.ingredient[0].canonicalId, '789');
    });

    it('should map tags to metadata', () => {
      const plan = createMealPlan({
        days: [
          {
            date: '2026-01-26',
            meals: [
              createMeal({
                ingredientRefs: [
                  {
                    nevoCode: '123',
                    quantityG: 100,
                    displayName: 'Eieren',
                    tags: ['protein', 'dairy'],
                  },
                ],
              }),
            ],
          },
        ],
      });

      const result = mapMealPlanToGuardrailsTargets(plan, 'nl');

      // Should have ingredient + 2 tags in metadata
      assert.strictEqual(result.ingredient.length, 1);
      assert(result.metadata.length >= 2);
      assert(result.metadata.some((m) => m.text === 'protein'));
      assert(result.metadata.some((m) => m.text === 'dairy'));
    });

    it('should map legacy ingredients if present', () => {
      const plan = createMealPlan({
        days: [
          {
            date: '2026-01-26',
            meals: [
              createMeal({
                ingredients: [
                  { name: 'Pasta', amount: 200, unit: 'g' },
                  { name: 'Tomaten', amount: 2, unit: 'stuks' },
                ],
              }),
            ],
          },
        ],
      });

      const result = mapMealPlanToGuardrailsTargets(plan, 'nl');

      assert.strictEqual(result.ingredient.length, 2);
      assert.strictEqual(result.ingredient[0].text, 'pasta');
      assert(result.ingredient[0].path.includes('legacyIngredients'));
    });

    it('should filter empty ingredient strings', () => {
      const plan = createMealPlan({
        days: [
          {
            date: '2026-01-26',
            meals: [
              createMeal({
                ingredientRefs: [
                  { nevoCode: '123', quantityG: 100, displayName: 'Eieren' },
                  { nevoCode: '456', quantityG: 200, displayName: '   ' }, // Empty after trim
                  { nevoCode: '789', quantityG: 150 }, // No displayName, will use NEVO code
                ],
              }),
            ],
          },
        ],
      });

      const result = mapMealPlanToGuardrailsTargets(plan, 'nl');

      // Should have 3 ingredients:
      // - First with displayName 'Eieren' (kept)
      // - Second with empty displayName (uses NEVO code fallback: 'nevo-456')
      // - Third with no displayName (uses NEVO code fallback: 'nevo-789')
      assert.strictEqual(result.ingredient.length, 3);
      assert(result.ingredient.some((ing) => ing.text === 'eieren'));
      assert(result.ingredient.some((ing) => ing.text === 'nevo-456'));
      assert(result.ingredient.some((ing) => ing.text === 'nevo-789'));
    });

    it('should lowercase ingredient text', () => {
      const plan = createMealPlan({
        days: [
          {
            date: '2026-01-26',
            meals: [
              createMeal({
                ingredientRefs: [
                  { nevoCode: '123', quantityG: 100, displayName: 'EIEREN' },
                ],
              }),
            ],
          },
        ],
      });

      const result = mapMealPlanToGuardrailsTargets(plan, 'nl');

      assert.strictEqual(result.ingredient[0].text, 'eieren');
    });
  });

  describe('Metadata mapping', () => {
    it('should map meal names to metadata', () => {
      const plan = createMealPlan({
        days: [
          {
            date: '2026-01-26',
            meals: [
              createMeal({ name: 'Breakfast' }),
              createMeal({ name: 'Lunch' }),
            ],
          },
        ],
      });

      const result = mapMealPlanToGuardrailsTargets(plan, 'nl');

      assert(result.metadata.length >= 2);
      assert(result.metadata.some((m) => m.text === 'breakfast'));
      assert(result.metadata.some((m) => m.text === 'lunch'));
    });

    it('should filter empty meal names', () => {
      const plan = createMealPlan({
        days: [
          {
            date: '2026-01-26',
            meals: [
              createMeal({ name: 'Breakfast' }),
              createMeal({ name: '   ' }), // Empty after trim
            ],
          },
        ],
      });

      const result = mapMealPlanToGuardrailsTargets(plan, 'nl');

      // Should only have 1 meal name in metadata
      assert.strictEqual(
        result.metadata.filter((m) => m.path.includes('.name')).length,
        1,
      );
    });
  });

  describe('Path stability', () => {
    it('should generate stable paths for same input', () => {
      const plan = createMealPlan({
        days: [
          {
            date: '2026-01-26',
            meals: [
              createMeal({
                name: 'Breakfast',
                ingredientRefs: [
                  { nevoCode: '123', quantityG: 100, displayName: 'Eieren' },
                  { nevoCode: '456', quantityG: 200, displayName: 'Brood' },
                ],
              }),
            ],
          },
        ],
      });

      const result1 = mapMealPlanToGuardrailsTargets(plan, 'nl');
      const result2 = mapMealPlanToGuardrailsTargets(plan, 'nl');

      // Paths should be identical
      assert.deepStrictEqual(
        result1.ingredient.map((a) => a.path),
        result2.ingredient.map((a) => a.path),
      );
    });
  });

  describe('Multiple days', () => {
    it('should map ingredients across multiple days', () => {
      const plan = createMealPlan({
        days: [
          {
            date: '2026-01-26',
            meals: [
              createMeal({
                ingredientRefs: [
                  { nevoCode: '123', quantityG: 100, displayName: 'Eieren' },
                ],
              }),
            ],
          },
          {
            date: '2026-01-27',
            meals: [
              createMeal({
                ingredientRefs: [
                  { nevoCode: '456', quantityG: 200, displayName: 'Brood' },
                ],
              }),
            ],
          },
        ],
      });

      const result = mapMealPlanToGuardrailsTargets(plan, 'nl');

      assert.strictEqual(result.ingredient.length, 2);
      assert(result.ingredient[0].path.includes('days[0]'));
      assert(result.ingredient[1].path.includes('days[1]'));
    });
  });
});
