/**
 * Snapshot fixture for TherapeuticSummaryCard smoke test.
 * Deterministic: fixed dates, no undefined in display paths.
 */

import type {
  TherapeuticTargetsSnapshot,
  TherapeuticCoverageSnapshot,
} from '@/src/lib/diets/diet.types';

const FIXED_DATE_1 = '2026-02-03';
const FIXED_DATE_2 = '2026-02-04';

export const therapeuticSummaryCardFixture = {
  targets: {
    protocol: {
      protocolKey: 'test_protocol',
      version: '1',
      labelNl: 'Test protocol',
    },
    daily: {
      foodGroups: {
        vegetablesG: 300,
        fruitG: 100,
      },
      macros: {
        protein: {
          kind: 'adh_percent' as const,
          value: 100,
          unit: '%_adh' as const,
        },
        protein__absolute: {
          kind: 'absolute' as const,
          value: 60,
          unit: 'g' as const,
        },
      },
    },
    computedAt: '2026-02-01T12:00:00.000Z',
  } as TherapeuticTargetsSnapshot,
  coverage: {
    dailyByDate: {
      [FIXED_DATE_1]: {
        foodGroups: { vegetablesG: 250, fruitG: 50 },
        macros: {
          protein: { value: 55, unit: 'g' },
          protein__absolute: { value: 55, unit: 'g' },
        },
      },
      [FIXED_DATE_2]: {
        foodGroups: { vegetablesG: 280, fruitG: 60 },
        macros: {
          protein: { value: 58, unit: 'g' },
          protein__absolute: { value: 58, unit: 'g' },
        },
      },
    },
    weekly: {
      foodGroups: {
        vegetablesG: { value: 530, unit: 'g' as const },
        fruitG: { value: 110, unit: 'g' as const },
      },
      macros: {
        protein: { value: 113, unit: 'g' },
        protein__absolute: { value: 113, unit: 'g' },
      },
    },
    deficits: {
      alerts: [
        {
          code: 'VEG_TARGET_UNDER_80',
          severity: 'warn' as const,
          messageNl: 'Groente-doel vaak niet gehaald deze week.',
        },
      ],
      suggestions: [
        {
          kind: 'add_side' as const,
          severity: 'warn' as const,
          titleNl: 'Voeg een extra groente-side toe (±150g)',
          whyNl: 'Helpt om je groente-doel te halen.',
          appliesTo: { date: FIXED_DATE_1 },
          metrics: { actual: 250, target: 300, unit: 'g', ratio: 0.833 },
          payload: { foodGroup: 'vegetables', grams: 150 },
        },
      ],
    },
    computedAt: '2026-02-02T12:00:00.000Z',
  } as TherapeuticCoverageSnapshot,
};
