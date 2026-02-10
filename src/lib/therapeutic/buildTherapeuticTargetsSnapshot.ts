/**
 * Build TherapeuticTargetsSnapshot from DB (read-only).
 * Uses existing therapeutic profile service; no SELECT *, no service_role.
 * Returns undefined when user has no active protocol.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TherapeuticTargetsSnapshot,
  TherapeuticProtocolRef,
  UserPhysiologySnapshot,
  TherapeuticTargetsDaily,
  TherapeuticTargetsWeekly,
  TherapeuticTargetValue,
} from '@/src/lib/diets/diet.types';
import {
  getHealthProfileForUser,
  getActiveTherapeuticProfileForUser,
  getProtocolTargets,
  getProtocolSupplements,
  mapHealthRow,
  mapProtocolRowToRef,
} from '@/src/lib/therapeutic/therapeuticProfile.service';
import type { HealthProfileRow } from '@/src/lib/therapeutic/therapeuticProfile.service';
import type {
  ProtocolTargetRow,
  ProtocolSupplementRow,
} from '@/src/lib/therapeutic/therapeuticProfile.service';
import {
  loadAdhReferenceValues,
  computeAbsoluteFromAdhPercent,
} from '@/src/lib/therapeutic/therapeuticTargetCalculator.service';

/**
 * Build therapeutic targets snapshot for the current user.
 * If no active protocol → undefined. Otherwise returns full snapshot (JSON-safe).
 */
export async function buildTherapeuticTargetsSnapshot(
  supabase: SupabaseClient,
  userId: string,
  _locale: 'nl' | 'en' = 'nl',
): Promise<TherapeuticTargetsSnapshot | undefined> {
  const [healthRow, activeResult] = await Promise.all([
    getHealthProfileForUser(supabase, userId),
    getActiveTherapeuticProfileForUser(supabase, userId),
  ]);

  if (!activeResult) return undefined;

  const [targets, supplements] = await Promise.all([
    getProtocolTargets(supabase, activeResult.profile.protocol_id),
    getProtocolSupplements(supabase, activeResult.profile.protocol_id),
  ]);

  const protocol: TherapeuticProtocolRef = mapProtocolRowToRef(
    activeResult.protocol,
  );
  const physiology = mapPhysiology(healthRow);
  let daily = mapDailyTargets(targets);
  let weekly = mapWeeklyTargets(targets);
  const supplementsList = mapSupplements(supplements);

  const overrides = normaliseOverrides(activeResult.profile.overrides);
  if (overrides && Object.keys(overrides).length > 0) {
    const applied = applyOverridesToTargets(daily, weekly, overrides);
    daily = applied.daily ?? daily;
    weekly = applied.weekly ?? weekly;
  }

  if (daily) {
    daily = await enrichDailyWithAbsoluteFromAdh(
      supabase,
      daily,
      physiology,
      healthRow,
    );
  }

  const snapshot: TherapeuticTargetsSnapshot = {
    protocol,
    ...(physiology && Object.keys(physiology).length > 0 && { physiology }),
    ...(daily && hasDailyContent(daily) && { daily }),
    ...(weekly && hasWeeklyContent(weekly) && { weekly }),
    ...(supplementsList.length > 0 && { supplements: supplementsList }),
    computedAt: new Date().toISOString(),
  };

  return snapshot;
}

/** Override entry from user (UI format). valueNum required, finite >= 0; valueType/unit optional. Exported for tests. */
export type OverrideEntry = {
  valueNum: number;
  valueType?: string;
  unit?: string;
};

function isOverrideEntry(v: unknown): v is OverrideEntry {
  if (v == null || typeof v !== 'object') return false;
  const n = (v as OverrideEntry).valueNum;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return false;
  const vt = (v as OverrideEntry).valueType;
  if (vt !== undefined && typeof vt !== 'string') return false;
  const u = (v as OverrideEntry).unit;
  if (u !== undefined && typeof u !== 'string') return false;
  return true;
}

/** Return only valid override entries; invalid ones ignored (no throw, no logging). */
function normaliseOverrides(
  raw: unknown,
): Record<string, OverrideEntry> | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, OverrideEntry> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof key !== 'string' || !isOverrideEntry(val)) continue;
    out[key] = val;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Apply user overrides to daily/weekly targets. Key format: period:targetKind:targetKey.
 * Mutates copies only; can add new keys for daily macros/micros and weekly variety/frequency.
 * Exported for regression tests (override on key__absolute wins over later ADH enrichment).
 */
export function applyOverridesToTargets(
  daily: TherapeuticTargetsDaily | undefined,
  weekly: TherapeuticTargetsWeekly | undefined,
  overrides: Record<string, OverrideEntry>,
): {
  daily: TherapeuticTargetsDaily | undefined;
  weekly: TherapeuticTargetsWeekly | undefined;
} {
  const dailyOut = daily
    ? {
        ...daily,
        macros: daily.macros ? { ...daily.macros } : {},
        micros: daily.micros ? { ...daily.micros } : {},
        foodGroups: daily.foodGroups ? { ...daily.foodGroups } : {},
      }
    : undefined;
  const weeklyOut = weekly
    ? {
        ...weekly,
        variety: weekly.variety ? { ...weekly.variety } : {},
        frequency: weekly.frequency ? { ...weekly.frequency } : {},
      }
    : undefined;

  for (const [key, entry] of Object.entries(overrides)) {
    const parts = key.split(':');
    if (parts.length !== 3) continue;
    const [period, targetKind, targetKey] = parts;
    const valueNum = entry.valueNum;
    const valueType = entry.valueType;
    const unit = entry.unit ?? 'g';

    if (period === 'daily') {
      if (!dailyOut) continue;
      if (targetKind === 'macro') {
        const existing =
          dailyOut.macros?.[targetKey as keyof typeof dailyOut.macros];
        const kind =
          valueType === 'adh_percent'
            ? ('adh_percent' as const)
            : ('absolute' as const);
        const targetUnit =
          kind === 'adh_percent'
            ? '%_adh'
            : (unit ??
              (existing && typeof existing === 'object' && 'unit' in existing
                ? (existing as { unit: string }).unit
                : 'g'));
        dailyOut.macros[targetKey as keyof typeof dailyOut.macros] = {
          kind,
          value: valueNum,
          unit: targetUnit as 'g' | 'mg' | 'µg' | 'kcal' | '%_adh',
        } as TherapeuticTargetValue;
      } else if (targetKind === 'micro') {
        const existing =
          dailyOut.micros?.[targetKey as keyof typeof dailyOut.micros];
        const kind =
          valueType === 'adh_percent'
            ? ('adh_percent' as const)
            : ('absolute' as const);
        const targetUnit =
          kind === 'adh_percent'
            ? '%_adh'
            : (unit ??
              (existing && typeof existing === 'object' && 'unit' in existing
                ? (existing as { unit: string }).unit
                : 'g'));
        dailyOut.micros[targetKey as keyof typeof dailyOut.micros] = {
          kind,
          value: valueNum,
          unit: targetUnit as 'g' | 'mg' | 'µg' | 'kcal' | '%_adh',
        } as TherapeuticTargetValue;
      } else if (targetKind === 'food_group') {
        if (targetKey === 'vegetables_g' || targetKey === 'vegetablesG') {
          dailyOut.foodGroups.vegetablesG = Math.round(valueNum);
        } else if (targetKey === 'fruit_g' || targetKey === 'fruitG') {
          dailyOut.foodGroups.fruitG = Math.round(valueNum);
        }
      }
    } else if (period === 'weekly' && weeklyOut) {
      const numVal = Math.max(0, Math.round(valueNum));
      if (targetKind === 'variety') {
        weeklyOut.variety[targetKey as keyof typeof weeklyOut.variety] = numVal;
      } else if (targetKind === 'frequency') {
        weeklyOut.frequency[targetKey as keyof typeof weeklyOut.frequency] =
          numVal;
      }
    }
  }

  return {
    daily: dailyOut,
    weekly: weeklyOut,
  };
}

function mapPhysiology(
  row: HealthProfileRow | null,
): UserPhysiologySnapshot | undefined {
  const vm = mapHealthRow(row);
  if (!vm) return undefined;
  return {
    ...(vm.birthDate != null && { birthDate: vm.birthDate }),
    ...(vm.sex != null && { sex: vm.sex }),
    ...(vm.heightCm != null && { heightCm: vm.heightCm }),
    ...(vm.weightKg != null && { weightKg: vm.weightKg }),
  };
}

/** Integer age in years from birth date (UTC); undefined if birthDate missing or invalid. */
function ageYearsFromBirthDate(
  birthDate: string | undefined | null,
): number | undefined {
  if (birthDate == null || birthDate === '') return undefined;
  const d = new Date(birthDate + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return undefined;
  const today = new Date();
  let age = today.getUTCFullYear() - d.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - d.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < d.getUTCDate()))
    age -= 1;
  return age >= 0 ? age : undefined;
}

/** Ref shape for pure enrichment (no DB). Used by enrichDailyWithAbsoluteFromAdhPure and tests. */
export type AdhRefForEnrich = { value_num: number; unit: string | null };

/**
 * Pure: add key__absolute for each adh_percent when ref exists; does not overwrite existing absKey.
 * Exported for regression tests (adh_percent + ref => __absolute when not present).
 */
export function enrichDailyWithAbsoluteFromAdhPure(
  daily: TherapeuticTargetsDaily,
  refByKey: Map<string, AdhRefForEnrich>,
): TherapeuticTargetsDaily {
  const addAbsolute = (
    map: Record<string, TherapeuticTargetValue> | undefined,
  ): Record<string, TherapeuticTargetValue> => {
    if (!map) return {};
    const out = { ...map };
    for (const [key, val] of Object.entries(map)) {
      if (
        val &&
        typeof val === 'object' &&
        (val as { kind?: string }).kind === 'adh_percent'
      ) {
        const absKey = `${key}__absolute`;
        if (out[absKey] != null) continue;
        const ref = refByKey.get(key);
        if (ref && typeof (val as { value: number }).value === 'number') {
          const percent = (val as { value: number }).value;
          out[absKey] = computeAbsoluteFromAdhPercent(
            percent,
            ref.value_num,
            ref.unit ?? 'g',
          );
        }
      }
    }
    return out;
  };

  return {
    ...daily,
    ...(daily.macros &&
      Object.keys(daily.macros).length > 0 && {
        macros: addAbsolute(
          daily.macros as Record<string, TherapeuticTargetValue>,
        ),
      }),
    ...(daily.micros &&
      Object.keys(daily.micros).length > 0 && {
        micros: addAbsolute(
          daily.micros as Record<string, TherapeuticTargetValue>,
        ),
      }),
  };
}

/**
 * Enrich daily targets: for each adh_percent macro/micro, add computed absolute target as key__absolute when ADH ref exists.
 * Uses loadAdhReferenceValues (DB); no hardcoded keys.
 */
async function enrichDailyWithAbsoluteFromAdh(
  supabase: SupabaseClient,
  daily: TherapeuticTargetsDaily,
  physiology: UserPhysiologySnapshot | undefined,
  healthRow: HealthProfileRow | null,
): Promise<TherapeuticTargetsDaily> {
  const adhKeys: string[] = [];
  const collectAdh = (
    m: Record<string, TherapeuticTargetValue> | undefined,
  ) => {
    if (!m) return;
    for (const [key, val] of Object.entries(m)) {
      if (
        val &&
        typeof val === 'object' &&
        (val as { kind?: string }).kind === 'adh_percent'
      ) {
        adhKeys.push(key);
      }
    }
  };
  collectAdh(
    daily.macros as Record<string, TherapeuticTargetValue> | undefined,
  );
  collectAdh(
    daily.micros as Record<string, TherapeuticTargetValue> | undefined,
  );
  if (adhKeys.length === 0) return daily;

  const birthDate = physiology?.birthDate ?? healthRow?.birth_date ?? null;
  const ageYears = ageYearsFromBirthDate(birthDate ?? undefined);
  const sex = physiology?.sex ?? healthRow?.sex ?? undefined;
  const refs = await loadAdhReferenceValues(
    supabase,
    adhKeys,
    sex ?? null,
    ageYears ?? null,
  );
  const refByKey = new Map<string, AdhRefForEnrich>();
  for (const r of refs)
    refByKey.set(r.key, { value_num: r.value_num, unit: r.unit });

  return enrichDailyWithAbsoluteFromAdhPure(daily, refByKey);
}

function mapTargetValue(
  row: ProtocolTargetRow,
): TherapeuticTargetValue | number | null {
  const value = Number(row.value_num);
  if (row.value_type === 'adh_percent') {
    return { kind: 'adh_percent', value, unit: '%_adh' };
  }
  if (row.value_type === 'count') {
    return value;
  }
  const unit = (row.unit ?? 'g') as 'g' | 'mg' | 'µg' | 'kcal';
  return { kind: 'absolute', value, unit };
}

function mapDailyTargets(
  rows: ProtocolTargetRow[],
): TherapeuticTargetsDaily | undefined {
  const dailyRows = rows.filter((r) => r.period === 'daily');
  if (dailyRows.length === 0) return undefined;

  const macros: TherapeuticTargetsDaily['macros'] = {};
  const micros: TherapeuticTargetsDaily['micros'] = {};
  const foodGroups: {
    vegetablesG?: number;
    fruitG?: number;
    [k: string]: number | undefined;
  } = {};

  for (const row of dailyRows) {
    const tv = mapTargetValue(row);
    if (tv === null) continue;
    if (typeof tv === 'number') {
      continue;
    }

    if (row.target_kind === 'macro') {
      macros[row.target_key as keyof typeof macros] = tv;
    } else if (row.target_kind === 'micro') {
      micros[row.target_key as keyof typeof micros] = tv;
    } else if (row.target_kind === 'food_group') {
      if (row.target_key === 'vegetables_g')
        foodGroups.vegetablesG = (tv as { value: number }).value;
      else if (row.target_key === 'fruit_g')
        foodGroups.fruitG = (tv as { value: number }).value;
      else foodGroups[row.target_key] = (tv as { value: number }).value;
    } else {
      micros[row.target_key as keyof typeof micros] = tv;
    }
  }

  const hasMacros = Object.keys(macros).length > 0;
  const hasMicros = Object.keys(micros).length > 0;
  const hasFoodGroups = Object.keys(foodGroups).length > 0;
  if (!hasMacros && !hasMicros && !hasFoodGroups) return undefined;

  return {
    ...(hasMacros && { macros }),
    ...(hasMicros && { micros }),
    ...(hasFoodGroups && {
      foodGroups: foodGroups as TherapeuticTargetsDaily['foodGroups'],
    }),
  };
}

function mapWeeklyTargets(
  rows: ProtocolTargetRow[],
): TherapeuticTargetsWeekly | undefined {
  const weeklyRows = rows.filter((r) => r.period === 'weekly');
  if (weeklyRows.length === 0) return undefined;

  const variety: Record<string, number> = {};
  const frequency: Record<string, number> = {};

  for (const row of weeklyRows) {
    const val = Number(row.value_num);
    if (row.target_kind === 'variety') {
      variety[row.target_key] = val;
    } else if (row.target_kind === 'frequency') {
      frequency[row.target_key] = val;
    } else {
      frequency[row.target_key] = val;
    }
  }

  const hasVariety = Object.keys(variety).length > 0;
  const hasFrequency = Object.keys(frequency).length > 0;
  if (!hasVariety && !hasFrequency) return undefined;

  return {
    ...(hasVariety && {
      variety: variety as TherapeuticTargetsWeekly['variety'],
    }),
    ...(hasFrequency && {
      frequency: frequency as TherapeuticTargetsWeekly['frequency'],
    }),
  };
}

function hasDailyContent(d: TherapeuticTargetsDaily): boolean {
  return Boolean(
    (d.macros && Object.keys(d.macros).length > 0) ||
    (d.micros && Object.keys(d.micros).length > 0) ||
    (d.foodGroups && Object.keys(d.foodGroups).length > 0),
  );
}

function hasWeeklyContent(w: TherapeuticTargetsWeekly): boolean {
  return Boolean(
    (w.variety && Object.keys(w.variety).length > 0) ||
    (w.frequency && Object.keys(w.frequency).length > 0),
  );
}

function mapSupplements(rows: ProtocolSupplementRow[]): Array<{
  key: string;
  labelNl: string;
  dosageText?: string;
  notesNl?: string;
}> {
  return rows.map((r) => ({
    key: r.supplement_key,
    labelNl: r.label_nl,
    ...(r.dosage_text != null &&
      r.dosage_text !== '' && { dosageText: r.dosage_text }),
    ...(r.notes_nl != null && r.notes_nl !== '' && { notesNl: r.notes_nl }),
  }));
}
