/**
 * Therapeutic Target Calculator – ADH % → absolute (DB-driven).
 * No hardcoded nutrient lists or ADH tables; keys and reference values come from DB/caller.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TherapeuticTargetValue } from '@/src/lib/diets/diet.types';

const ADH_REF_COLUMNS =
  'key, sex, age_min_years, age_max_years, unit, value_num';

export type AdhReferenceRow = {
  key: string;
  sex: string | null;
  age_min_years: number | null;
  age_max_years: number | null;
  unit: string;
  value_num: number;
};

/**
 * Load ADH reference values for given keys. Optional sex/ageYears filter and resolution.
 * - Filter: is_active = true, key IN keys.
 * - Optional: match rows where (sex IS NULL OR sex = userSex) and ageYears in [age_min_years, age_max_years] (null = open).
 * - Resolution: for each key, pick "most specific" match: sex match > sex null; then smallest age range first.
 * Caller supplies keys (e.g. from protocol targets); no hardcoded key list.
 */
export async function loadAdhReferenceValues(
  supabase: SupabaseClient,
  keys: string[],
  sex?: string | null,
  ageYears?: number | null,
): Promise<AdhReferenceRow[]> {
  if (keys.length === 0) return [];

  const { data, error } = await supabase
    .from('therapeutic_adh_reference_values')
    .select(ADH_REF_COLUMNS)
    .eq('is_active', true)
    .in('key', keys);

  if (error) throw error;
  const rows = (data ?? []) as AdhReferenceRow[];

  const filtered =
    sex != null || ageYears != null
      ? rows.filter((r) => {
          const sexMatch = r.sex == null || r.sex === sex;
          const ageMinOk =
            r.age_min_years == null ||
            (ageYears != null && ageYears >= r.age_min_years);
          const ageMaxOk =
            r.age_max_years == null ||
            (ageYears != null && ageYears <= r.age_max_years);
          return sexMatch && ageMinOk && ageMaxOk;
        })
      : rows;

  const byKey = new Map<string, AdhReferenceRow[]>();
  for (const r of filtered) {
    const list = byKey.get(r.key) ?? [];
    list.push(r);
    byKey.set(r.key, list);
  }

  const result: AdhReferenceRow[] = [];
  for (const key of keys) {
    const candidates = byKey.get(key) ?? [];
    if (candidates.length === 0) continue;
    const chosen = chooseMostSpecific(candidates, sex ?? null);
    result.push(chosen);
  }
  return result;
}

function chooseMostSpecific(
  candidates: AdhReferenceRow[],
  userSex: string | null,
): AdhReferenceRow {
  return [...candidates].sort((a, b) => {
    const sexScore = (r: AdhReferenceRow) =>
      r.sex != null && r.sex === userSex ? 2 : r.sex == null ? 1 : 0;
    const sexDiff = sexScore(b) - sexScore(a);
    if (sexDiff !== 0) return sexDiff;
    const rangeWidth = (r: AdhReferenceRow) =>
      (r.age_max_years ?? 999) - (r.age_min_years ?? 0);
    return rangeWidth(a) - rangeWidth(b);
  })[0]!;
}

/**
 * Compute absolute target from ADH percent and reference value (pure).
 * value = (targetPercent / 100) * refValueNum; unit from ref.
 */
export function computeAbsoluteFromAdhPercent(
  targetPercent: number,
  refValueNum: number,
  refUnit: string,
): TherapeuticTargetValue & { kind: 'absolute' } {
  const value = (targetPercent / 100) * refValueNum;
  return {
    kind: 'absolute',
    value: Math.round(value * 1000) / 1000,
    unit: refUnit as 'g' | 'mg' | 'µg' | 'kcal',
  };
}
