/**
 * Unit tests for meal plan culinary sanity validator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateMealPlanSanity } from './mealPlanSanityValidator';
import type { MealPlanResponse, Meal } from '@/src/lib/diets';

describe('mealPlanSanityValidator', () => {
  describe('validateMealPlanSanity', () => {
    const validMeal: Meal = {
      id: 'm1',
      name: 'Geroosterde kip met groenten',
      slot: 'dinner',
      date: '2026-02-01',
      ingredientRefs: [
        { nevoCode: '1', quantityG: 120 },
        { nevoCode: '2', quantityG: 80 },
        { nevoCode: '3', quantityG: 60 },
      ],
    };

    it('returns ok for valid plan with 2+ ingredients per meal', () => {
      const plan: MealPlanResponse = {
        requestId: 'r1',
        days: [
          {
            date: '2026-02-01',
            meals: [validMeal],
          },
        ],
      };
      const result = validateMealPlanSanity(plan);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.issues.length, 0);
    });

    it('returns EMPTY_NAME when meal name is empty', () => {
      const plan: MealPlanResponse = {
        requestId: 'r1',
        days: [
          {
            date: '2026-02-01',
            meals: [
              {
                ...validMeal,
                name: '   ',
              },
            ],
          },
        ],
      };
      const result = validateMealPlanSanity(plan);
      assert.strictEqual(result.ok, false);
      assert.ok(result.issues.some((i) => i.code === 'EMPTY_NAME'));
    });

    it('returns PLACEHOLDER_NAME for TBD', () => {
      const plan: MealPlanResponse = {
        requestId: 'r1',
        days: [
          {
            date: '2026-02-01',
            meals: [{ ...validMeal, name: 'TBD' }],
          },
        ],
      };
      const result = validateMealPlanSanity(plan);
      assert.strictEqual(result.ok, false);
      assert.ok(result.issues.some((i) => i.code === 'PLACEHOLDER_NAME'));
    });

    it('returns INGREDIENT_COUNT_OUT_OF_RANGE when fewer than 2', () => {
      const plan: MealPlanResponse = {
        requestId: 'r1',
        days: [
          {
            date: '2026-02-01',
            meals: [
              {
                ...validMeal,
                ingredientRefs: [{ nevoCode: '1', quantityG: 100 }],
              },
            ],
          },
        ],
      };
      const result = validateMealPlanSanity(plan);
      assert.strictEqual(result.ok, false);
      assert.ok(
        result.issues.some((i) => i.code === 'INGREDIENT_COUNT_OUT_OF_RANGE'),
      );
    });

    it('returns DUPLICATE_INGREDIENT for same nevoCode in meal', () => {
      const plan: MealPlanResponse = {
        requestId: 'r1',
        days: [
          {
            date: '2026-02-01',
            meals: [
              {
                ...validMeal,
                ingredientRefs: [
                  { nevoCode: '1', quantityG: 100 },
                  { nevoCode: '1', quantityG: 50 },
                ],
              },
            ],
          },
        ],
      };
      const result = validateMealPlanSanity(plan);
      assert.strictEqual(result.ok, false);
      assert.ok(result.issues.some((i) => i.code === 'DUPLICATE_INGREDIENT'));
    });

    it('returns EMPTY_DAY when day has no meals', () => {
      const plan: MealPlanResponse = {
        requestId: 'r1',
        days: [{ date: '2026-02-01', meals: [] }],
      };
      const result = validateMealPlanSanity(plan);
      assert.strictEqual(result.ok, false);
      assert.ok(result.issues.some((i) => i.code === 'EMPTY_DAY'));
    });
  });
});
