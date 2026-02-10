/**
 * Therapeutic coverage estimator – unit tests.
 * Regressie: weekly rollup bij days; deficits 1 alert per code; suggestions max 3, appliesTo + metrics.
 *
 * Run: node --test therapeuticCoverageEstimator.test.ts  (of tsx)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  estimateTherapeuticCoverage,
  buildTherapeuticSuggestions,
} from './therapeuticCoverageEstimator';
import type { MealPlanResponse, MealPlanRequest } from '@/src/lib/diets';
import type { TherapeuticTargetsSnapshot } from '@/src/lib/diets/diet.types';

const FIXED_DATE_1 = '2026-02-03';
const FIXED_DATE_2 = '2026-02-04';

function minimalPlan(days: MealPlanResponse['days']): MealPlanResponse {
  return {
    requestId: 'test-req',
    days,
  };
}

function minimalRequest(
  therapeuticTargets: MealPlanRequest['therapeuticTargets'],
): MealPlanRequest {
  return { therapeuticTargets } as MealPlanRequest;
}

describe('estimateTherapeuticCoverage', () => {
  it('weekly rollup is present when there are days', () => {
    const plan = minimalPlan([
      {
        date: FIXED_DATE_1,
        meals: [
          {
            id: 'm1',
            name: 'Ontbijt',
            slot: 'breakfast',
            date: FIXED_DATE_1,
            ingredientRefs: [
              { nevoCode: '1', quantityG: 50, displayName: 'A' },
              { nevoCode: '2', quantityG: 80, displayName: 'B' },
              { nevoCode: '3', quantityG: 0, displayName: 'C' },
            ],
            estimatedMacros: { calories: 400, protein: 15 },
          },
        ],
      },
    ]);
    const request = minimalRequest({
      protocol: { protocolKey: 'test' },
      daily: {
        foodGroups: { vegetablesG: 300, fruitG: 100 },
        macros: {
          protein: { kind: 'absolute', value: 60, unit: 'g' },
        },
      },
    } as TherapeuticTargetsSnapshot);
    const snapshot = estimateTherapeuticCoverage(plan, request);
    assert(snapshot != null);
    assert.strictEqual(Object.keys(snapshot.dailyByDate).length, 1);
    assert(snapshot.weekly != null, 'weekly must be present when days exist');
    assert(snapshot.weekly!.foodGroups != null);
    assert.strictEqual(
      typeof snapshot.weekly!.foodGroups!.vegetablesG?.value,
      'number',
    );
  });

  it('deficits dedupe: one alert per code (worst ratio)', () => {
    const plan = minimalPlan([
      {
        date: FIXED_DATE_1,
        meals: [
          {
            id: 'm1',
            name: 'M1',
            slot: 'breakfast',
            date: FIXED_DATE_1,
            ingredientRefs: [],
            estimatedMacros: { protein: 10 },
          },
        ],
      },
      {
        date: FIXED_DATE_2,
        meals: [
          {
            id: 'm2',
            name: 'M2',
            slot: 'breakfast',
            date: FIXED_DATE_2,
            ingredientRefs: [],
            estimatedMacros: { protein: 5 },
          },
        ],
      },
    ]);
    const request = minimalRequest({
      protocol: { protocolKey: 'test' },
      daily: {
        macros: {
          protein: { kind: 'absolute', value: 60, unit: 'g' },
        },
      },
    } as TherapeuticTargetsSnapshot);
    const snapshot = estimateTherapeuticCoverage(plan, request);
    assert(snapshot != null);
    const alerts = snapshot.deficits?.alerts ?? [];
    const proteinCodes = alerts.filter((a) =>
      a.code.startsWith('MACRO_TARGET_UNDER_80:protein'),
    );
    assert.strictEqual(
      proteinCodes.length,
      1,
      'expect 1 alert per code (dedupe by worst ratio)',
    );
  });

  it('suggestions max 3 and contain appliesTo.date + metrics when worstByCode', () => {
    const alerts = [
      {
        code: 'VEG_TARGET_UNDER_80',
        severity: 'warn' as const,
        messageNl: 'Groente-doel niet gehaald.',
      },
      {
        code: 'MACRO_TARGET_UNDER_80:protein',
        severity: 'warn' as const,
        messageNl: 'Protein onder doel.',
      },
    ];
    const worstByCode: Record<
      string,
      { date?: string; actual: number; target: number; unit?: string }
    > = {
      VEG_TARGET_UNDER_80: {
        date: FIXED_DATE_1,
        actual: 50,
        target: 300,
        unit: 'g',
      },
      'MACRO_TARGET_UNDER_80:protein': {
        date: FIXED_DATE_2,
        actual: 20,
        target: 60,
        unit: 'g',
      },
    };
    const suggestions = buildTherapeuticSuggestions(
      { alerts },
      undefined,
      worstByCode,
    );
    assert(suggestions.length <= 3);
    const withAppliesTo = suggestions.filter((s) => s.appliesTo?.date);
    assert(
      withAppliesTo.length >= 1,
      'at least one suggestion has appliesTo.date',
    );
    const withMetrics = suggestions.filter(
      (s) => s.metrics && typeof s.metrics.actual === 'number',
    );
    assert(withMetrics.length >= 1, 'at least one suggestion has metrics');
  });
});
