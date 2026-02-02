/**
 * Guard Rails vNext – Skim milk / magere melk regression harness
 *
 * Ensures "magere melk" / "skim milk" is blocked by:
 * 1) Being present in compiled prompt constraints (compileConstraintsForAI)
 * 2) Being blocked by evaluateGuardrails when it appears in a generated plan
 *
 * Run with: node --import tsx --test src/lib/guardrails-vnext/skim-milk-block.test.ts
 *
 * No network/LLM; uses mock repo for deterministic ruleset.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { loadGuardrailsRuleset } from './ruleset-loader';
import { compileConstraintsForAI, evaluateGuardrails } from './index';
import { mapMealPlanToGuardrailsTargets } from './adapters/meal-planner';
import type { GuardrailsRepo } from './ruleset-loader';
import type { MealPlanResponse } from '@/src/lib/diets';

const SKIM_MILK_RULE = {
  id: 'rule-skim-milk',
  diet_type_id: 'wahls_paleo',
  term: 'magere melk',
  synonyms: [
    'skim milk',
    'low-fat milk',
    '0% milk',
    'halfvolle melk',
    'milk (skim)',
  ],
  rule_code: 'FORBIDDEN_DAIRY_SKIM_MILK_HARD',
  rule_label: 'Magere melk / skim milk verboden (Wahls Paleo)',
  substitution_suggestions: [
    'ongezoete amandelmelk',
    'kokosmelk',
    'coconut milk',
    'almond milk',
  ],
  priority: 9000,
  target: 'ingredient' as const,
  match_mode: 'substring' as const,
  updated_at: '2026-02-01T00:00:00Z',
  is_active: true,
};

function createMockRepoWithSkimMilkRule(): GuardrailsRepo {
  return {
    async loadConstraints() {
      return { constraints: [] };
    },
    async loadRecipeAdaptationRules() {
      return { rules: [SKIM_MILK_RULE] };
    },
    async loadHeuristics() {
      return { heuristics: [] };
    },
  };
}

function createPlanWithMagereMelk(): MealPlanResponse {
  return {
    requestId: 'test-skim-milk',
    days: [
      {
        date: '2026-01-26',
        meals: [
          {
            id: 'meal-1',
            name: 'Ontbijt met magere melk',
            slot: 'breakfast',
            date: '2026-01-26',
            ingredientRefs: [
              {
                nevoCode: 'NEVO-123',
                quantityG: 200,
                displayName: 'magere melk',
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('Skim milk / magere melk block regression', () => {
  it('(1) ruleset loads and compileConstraintsForAI output contains magere melk or skim milk', async () => {
    const ruleset = await loadGuardrailsRuleset({
      dietId: 'wahls_paleo',
      mode: 'meal_planner',
      locale: 'nl',
      repo: createMockRepoWithSkimMilkRule(),
    });

    assert.ok(
      ruleset.rules.length >= 1,
      'ruleset should contain at least one rule',
    );
    const hasSkimMilkRule = ruleset.rules.some(
      (r) =>
        r.match.term === 'magere melk' ||
        (r.match.synonyms && r.match.synonyms.includes('skim milk')),
    );
    assert.ok(
      hasSkimMilkRule,
      'ruleset should contain magere melk / skim milk rule',
    );

    const { promptText } = await compileConstraintsForAI(ruleset, {
      locale: 'nl',
      mode: 'meal_planner',
      timestamp: new Date().toISOString(),
    });

    const hasMagereMelk = promptText.includes('magere melk');
    const hasSkimMilk = promptText.includes('skim milk');
    assert.ok(
      hasMagereMelk || hasSkimMilk,
      `compiled constraints should contain "magere melk" or "skim milk"; got: ${promptText.slice(0, 200)}...`,
    );
  });

  it('(2) evaluateGuardrails blocks plan containing magere melk', async () => {
    const ruleset = await loadGuardrailsRuleset({
      dietId: 'wahls_paleo',
      mode: 'meal_planner',
      locale: 'nl',
      repo: createMockRepoWithSkimMilkRule(),
    });

    const plan = createPlanWithMagereMelk();
    const targets = mapMealPlanToGuardrailsTargets(plan, 'nl');
    const context = {
      dietId: 'wahls_paleo',
      locale: 'nl' as const,
      mode: 'meal_planner' as const,
      timestamp: new Date().toISOString(),
    };

    const decision = evaluateGuardrails({
      ruleset,
      context,
      targets,
    });

    assert.strictEqual(
      decision.outcome,
      'blocked',
      `expected outcome 'blocked', got '${decision.outcome}'; summary: ${decision.summary}`,
    );
    assert.ok(
      decision.reasonCodes.length >= 1,
      `expected at least one reason code, got: ${decision.reasonCodes.join(', ')}`,
    );
    assert.strictEqual(
      decision.ok,
      false,
      'decision.ok should be false when blocked',
    );
  });
});
