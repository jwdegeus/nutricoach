/**
 * TherapeuticSummaryCard – smoke test with snapshot fixture.
 * Asserts: fixture has valid shape; simulated display values contain no "undefined".
 * Full render (RTL) would require jsdom + NextIntlClientProvider.
 *
 * Run: node --test TherapeuticSummaryCard.smoke.test.ts  (of tsx)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { therapeuticSummaryCardFixture } from './therapeuticSummaryCardFixture';

describe('TherapeuticSummaryCard fixture', () => {
  const { targets, coverage } = therapeuticSummaryCardFixture;

  it('fixture has targets with foodGroups and macros (adh_percent + __absolute)', () => {
    assert(targets?.daily?.foodGroups != null);
    assert.strictEqual(typeof targets.daily.foodGroups.vegetablesG, 'number');
    assert.strictEqual(typeof targets.daily.foodGroups.fruitG, 'number');
    assert(targets?.daily?.macros != null);
    const protein = targets.daily.macros.protein as
      | { kind: string; value: number }
      | undefined;
    const proteinAbs = targets.daily.macros.protein__absolute as
      | { kind: string; value: number }
      | undefined;
    assert(
      protein != null &&
        protein.kind === 'adh_percent' &&
        Number.isFinite(protein.value),
    );
    assert(
      proteinAbs != null &&
        proteinAbs.kind === 'absolute' &&
        Number.isFinite(proteinAbs.value),
    );
  });

  it('fixture has coverage with dailyByDate, weekly, deficits.suggestions', () => {
    assert(
      coverage?.dailyByDate != null && typeof coverage.dailyByDate === 'object',
    );
    assert(Object.keys(coverage.dailyByDate!).length >= 1);
    assert(coverage?.weekly != null);
    assert(
      coverage?.deficits?.suggestions != null &&
        Array.isArray(coverage.deficits.suggestions),
    );
  });

  it('simulated display values contain no undefined (no crash / no "undefined" string)', () => {
    const dates = Object.keys(coverage?.dailyByDate ?? {}).sort();
    const dailyByDate = coverage?.dailyByDate ?? {};
    const dailyTargets = targets?.daily?.foodGroups ?? null;
    const macroTargets = targets?.daily?.macros ?? null;

    for (const date of dates) {
      const dayCoverage = dailyByDate[date];
      const vegTarget =
        dailyTargets && typeof dailyTargets.vegetablesG === 'number'
          ? dailyTargets.vegetablesG
          : null;
      const vegActual =
        dayCoverage?.foodGroups != null &&
        typeof dayCoverage.foodGroups?.vegetablesG === 'number'
          ? dayCoverage.foodGroups.vegetablesG
          : null;
      if (vegTarget != null) {
        assert(
          vegActual !== undefined,
          `vegActual for ${date} should not be undefined`,
        );
        assert(!String(vegActual).includes('undefined'));
      }

      const dayMacros = dayCoverage?.macros ?? null;
      if (macroTargets && dayMacros && typeof dayMacros === 'object') {
        for (const baseKey of Object.keys(macroTargets)) {
          if (baseKey.endsWith('__absolute')) continue;
          const val = dayMacros[baseKey] ?? dayMacros[`${baseKey}__absolute`];
          if (
            val != null &&
            typeof val === 'object' &&
            typeof (val as { value?: number }).value === 'number'
          ) {
            const v = (val as { value: number }).value;
            assert(
              Number.isFinite(v),
              `macro value for ${baseKey} on ${date} should be finite`,
            );
          }
        }
      }
    }

    const suggestions = coverage?.deficits?.suggestions ?? [];
    for (const s of suggestions) {
      assert(typeof s.titleNl === 'string');
      if (s.metrics != null) {
        assert(
          s.metrics.actual === undefined || Number.isFinite(s.metrics.actual),
          'metrics.actual finite or absent',
        );
        assert(
          s.metrics.target === undefined || Number.isFinite(s.metrics.target),
          'metrics.target finite or absent',
        );
      }
    }
  });

  it('component module loads without throw', async () => {
    const mod = await import('./TherapeuticSummaryCard');
    assert.strictEqual(typeof mod.TherapeuticSummaryCard, 'function');
  });
});
