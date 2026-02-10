/**
 * buildTherapeuticTargetsSnapshot – regression tests (overrides + ADH __absolute).
 * Override on key__absolute wins; adh_percent + ref => __absolute added when not present.
 *
 * Run: node --test buildTherapeuticTargetsSnapshot.test.ts  (of tsx)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  applyOverridesToTargets,
  enrichDailyWithAbsoluteFromAdhPure,
  type OverrideEntry,
} from './buildTherapeuticTargetsSnapshot';
import type { TherapeuticTargetsDaily } from '@/src/lib/diets/diet.types';

describe('applyOverridesToTargets', () => {
  it('override on key__absolute wins (not overwritten by later ADH enrichment)', () => {
    const daily: TherapeuticTargetsDaily = {
      macros: {
        protein: { kind: 'adh_percent', value: 100, unit: '%_adh' },
      },
    };
    const overrides: Record<string, OverrideEntry> = {
      'daily:macro:protein__absolute': {
        valueNum: 120,
        valueType: 'absolute',
        unit: 'g',
      },
    };
    const { daily: dailyOut } = applyOverridesToTargets(
      daily,
      undefined,
      overrides,
    );
    assert(dailyOut != null);
    const abs =
      dailyOut!.macros?.['protein__absolute' as keyof typeof dailyOut.macros];
    assert(abs != null && typeof abs === 'object');
    assert.strictEqual((abs as { kind: string }).kind, 'absolute');
    assert.strictEqual((abs as { value: number }).value, 120);
  });

  it('adh_percent without override: no __absolute in applyOverridesToTargets', () => {
    const daily: TherapeuticTargetsDaily = {
      macros: {
        protein: { kind: 'adh_percent', value: 100, unit: '%_adh' },
      },
    };
    const { daily: dailyOut } = applyOverridesToTargets(daily, undefined, {});
    assert(dailyOut != null);
    assert.strictEqual(
      dailyOut!.macros?.['protein__absolute' as keyof typeof dailyOut.macros],
      undefined,
    );
  });
});

describe('enrichDailyWithAbsoluteFromAdhPure', () => {
  it('adh_percent + ref => __absolute added when not present', () => {
    const daily: TherapeuticTargetsDaily = {
      macros: {
        protein: { kind: 'adh_percent', value: 100, unit: '%_adh' },
      },
    };
    const refByKey = new Map([['protein', { value_num: 60, unit: 'g' }]]);
    const out = enrichDailyWithAbsoluteFromAdhPure(daily, refByKey);
    const abs = out.macros?.['protein__absolute' as keyof typeof out.macros];
    assert(abs != null && typeof abs === 'object');
    assert.strictEqual((abs as { kind: string }).kind, 'absolute');
    assert.strictEqual((abs as { value: number }).value, 60);
  });

  it('existing key__absolute not overwritten by enrichment', () => {
    const daily: TherapeuticTargetsDaily = {
      macros: {
        protein: { kind: 'adh_percent', value: 100, unit: '%_adh' },
        protein__absolute: { kind: 'absolute', value: 999, unit: 'g' },
      },
    };
    const refByKey = new Map([['protein', { value_num: 60, unit: 'g' }]]);
    const out = enrichDailyWithAbsoluteFromAdhPure(daily, refByKey);
    const abs = out.macros?.['protein__absolute' as keyof typeof out.macros];
    assert(abs != null && typeof abs === 'object');
    assert.strictEqual((abs as { value: number }).value, 999);
  });
});
