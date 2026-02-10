/**
 * Therapeutic coverage estimator — pure, shared by template and Gemini paths.
 * No DB; deterministic: same plan + request → same snapshot.
 * No hardcoded nutrient lists; keys from request.therapeuticTargets.
 */

import type { MealPlanRequest, MealPlanResponse, Meal } from '@/src/lib/diets';
import type {
  TherapeuticCoverageSnapshot,
  TherapeuticCoverageDaily,
  TherapeuticCoverageWeekly,
  TherapeuticDeficitSummary,
  TherapeuticActionSuggestion,
  TherapeuticTargetsSnapshot,
  TherapeuticWorstContext,
} from '@/src/lib/diets/diet.types';

type DeficitEvent = {
  code: string;
  severity: 'info' | 'warn' | 'error';
  date: string;
  actual: number;
  target: number;
  unit?: string;
};

/** Resolve meal actual for a macro key (energy -> calories). */
function getMealMacroActual(meal: Meal, macroKey: string): number | undefined {
  const raw =
    macroKey === 'energy'
      ? meal.estimatedMacros?.calories
      : (meal.estimatedMacros as Record<string, unknown>)?.[macroKey];
  return typeof raw === 'number' ? raw : undefined;
}

/**
 * V1 therapeutic coverage: food groups (veg/fruit) + macro actuals from meal.estimatedMacros.
 * Only runs when request.therapeuticTargets is present.
 * - Food groups: vegetablesG (veg1+veg2 grams), fruitG: 0.
 * - Macros: keys from request.therapeuticTargets.daily.macros; actuals summed from meal.estimatedMacros (no 0 for unknown keys).
 * - Deficits: absolute targets only; alert when actual < 80% of target. No deficits for adh_percent.
 * Deterministic; JSON-safe output.
 */
export function estimateTherapeuticCoverage(
  plan: MealPlanResponse,
  request: MealPlanRequest,
): TherapeuticCoverageSnapshot | undefined {
  const targets = request.therapeuticTargets;
  if (!targets || typeof targets !== 'object') return undefined;

  const foodGroups = targets.daily?.foodGroups;
  const macroTargets = targets.daily?.macros ?? {};
  const dailyByDate: Record<string, TherapeuticCoverageDaily> = {};
  const deficitEvents: DeficitEvent[] = [];

  for (const day of plan.days) {
    let vegetablesG = 0;
    for (const meal of day.meals) {
      const refs = meal.ingredientRefs ?? [];
      vegetablesG += (refs[1]?.quantityG ?? 0) + (refs[2]?.quantityG ?? 0);
    }

    const daily: TherapeuticCoverageDaily = {
      foodGroups: {
        vegetablesG,
        fruitG: 0,
      },
    };

    const macroActuals: TherapeuticCoverageDaily['macros'] = {};
    for (const [macroKey, targetVal] of Object.entries(macroTargets)) {
      if (!targetVal || typeof targetVal !== 'object') continue;
      const unit =
        'unit' in targetVal &&
        typeof (targetVal as { unit?: string }).unit === 'string'
          ? (targetVal as { unit: string }).unit
          : 'g';
      let daySum = 0;
      let hadAny = false;
      for (const meal of day.meals) {
        const v = getMealMacroActual(meal, macroKey);
        if (v !== undefined) {
          daySum += v;
          hadAny = true;
        }
      }
      if (hadAny) {
        macroActuals[macroKey as keyof typeof macroActuals] = {
          value: daySum,
          unit: unit as 'g' | 'mg' | 'µg' | 'kcal',
        };
      }
      const absKey = `${macroKey}__absolute`;
      const absVal = (macroTargets as Record<string, unknown>)[absKey];
      const effectiveTarget =
        (targetVal as { kind?: string }).kind === 'absolute' &&
        typeof (targetVal as { value?: number }).value === 'number'
          ? (targetVal as { value: number }).value
          : absVal != null &&
              typeof absVal === 'object' &&
              (absVal as { kind?: string }).kind === 'absolute' &&
              typeof (absVal as { value?: number }).value === 'number'
            ? (absVal as { value: number }).value
            : null;
      if (
        effectiveTarget != null &&
        effectiveTarget > 0 &&
        daySum < 0.8 * effectiveTarget
      ) {
        deficitEvents.push({
          code: `MACRO_TARGET_UNDER_80:${macroKey}`,
          severity: 'warn',
          date: day.date,
          actual: daySum,
          target: effectiveTarget,
          unit,
        });
      }
    }
    if (Object.keys(macroActuals).length > 0) {
      daily.macros = macroActuals;
    }
    dailyByDate[day.date] = daily;
  }

  const vegTargetG = foodGroups?.vegetablesG;
  for (const day of plan.days) {
    const vegetablesG = dailyByDate[day.date]?.foodGroups?.vegetablesG ?? 0;
    if (
      typeof vegTargetG === 'number' &&
      vegTargetG > 0 &&
      vegetablesG < 0.8 * vegTargetG
    ) {
      deficitEvents.push({
        code: 'VEG_TARGET_UNDER_80',
        severity: 'warn',
        date: day.date,
        actual: vegetablesG,
        target: vegTargetG,
        unit: 'g',
      });
    }
  }

  const { alerts = [], worstByCode } = dedupeDeficitEvents(deficitEvents);

  let weekly: TherapeuticCoverageWeekly | undefined;
  if (Object.keys(dailyByDate).length > 0) {
    weekly = buildWeeklyRollup(dailyByDate, targets.daily?.macros ?? {});
  }

  const suggestions =
    (alerts?.length ?? 0) > 0
      ? buildTherapeuticSuggestions(
          { alerts },
          targets as TherapeuticTargetsSnapshot,
          worstByCode,
        )
      : [];

  const snapshot: TherapeuticCoverageSnapshot = {
    dailyByDate,
    ...(weekly && { weekly }),
    deficits:
      (alerts?.length ?? 0) > 0
        ? {
            alerts: alerts ?? [],
            ...(suggestions.length > 0 && { suggestions }),
          }
        : undefined,
    computedAt: new Date().toISOString(),
  };

  return snapshot;
}

/**
 * Pure: build action suggestions from deficits.alerts (code-driven; no message parsing).
 * Uses worstByCode for appliesTo.date and metrics. Dedupe on (kind + titleNl); max 3. JSON-safe, deterministic.
 */
export function buildTherapeuticSuggestions(
  deficits: Pick<TherapeuticDeficitSummary, 'alerts'> | undefined,
  _targets: TherapeuticTargetsSnapshot | undefined,
  worstByCode?: Record<string, TherapeuticWorstContext>,
): TherapeuticActionSuggestion[] {
  const alerts = deficits?.alerts;
  if (!alerts || !Array.isArray(alerts) || alerts.length === 0) return [];

  const raw: TherapeuticActionSuggestion[] = [];
  for (const a of alerts) {
    const code = typeof a.code === 'string' ? a.code : '';
    const worst = worstByCode?.[code];
    const appliesTo =
      worst?.date != null && typeof worst.date === 'string'
        ? { date: worst.date }
        : undefined;
    const metrics =
      worst != null &&
      typeof worst.actual === 'number' &&
      typeof worst.target === 'number'
        ? {
            actual: worst.actual,
            target: worst.target,
            unit: typeof worst.unit === 'string' ? worst.unit : undefined,
            ratio:
              worst.target > 0
                ? Math.round((worst.actual / worst.target) * 1000) / 1000
                : undefined,
          }
        : undefined;

    if (code.startsWith('VEG_TARGET_UNDER_80')) {
      raw.push({
        kind: 'add_side',
        severity: 'warn',
        titleNl: 'Voeg een extra groente-side toe (±150g)',
        whyNl: 'Helpt om je groente-doel te halen.',
        appliesTo,
        metrics,
        payload: { foodGroup: 'vegetables', grams: 150 },
      });
      continue;
    }
    if (code.startsWith('MACRO_TARGET_UNDER_80:')) {
      const macroKey = code.slice('MACRO_TARGET_UNDER_80:'.length).trim();
      if (macroKey) {
        raw.push({
          kind: 'add_snack',
          severity: 'warn',
          titleNl: `Voeg een extra snack toe voor ${macroKey}`,
          whyNl: 'Helpt om je macro-doel te halen.',
          appliesTo,
          metrics,
          payload: { macroKey },
        });
      }
    }
  }

  const seen = new Set<string>();
  const out: TherapeuticActionSuggestion[] = [];
  for (const s of raw) {
    const key = `${s.kind}:${s.titleNl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 3) break;
  }
  return out;
}

function buildWeeklyRollup(
  dailyByDate: Record<string, TherapeuticCoverageDaily>,
  macroTargets: Record<
    string,
    { kind?: string; value?: number; unit?: string }
  >,
): TherapeuticCoverageWeekly {
  const dates = Object.keys(dailyByDate);
  let vegSum = 0;
  let fruitSum = 0;
  const macroSums: Record<string, { value: number; unit: string }> = {};
  const macroUnits: Record<string, string> = {};

  for (const key of Object.keys(macroTargets)) {
    if (key.endsWith('__absolute')) continue;
    const t = macroTargets[key];
    if (
      t &&
      typeof t === 'object' &&
      typeof (t as { unit?: string }).unit === 'string'
    ) {
      macroUnits[key] = (t as { unit: string }).unit;
    }
  }

  for (const date of dates) {
    const d = dailyByDate[date];
    if (d?.foodGroups) {
      if (typeof d.foodGroups.vegetablesG === 'number')
        vegSum += d.foodGroups.vegetablesG;
      if (typeof d.foodGroups.fruitG === 'number')
        fruitSum += d.foodGroups.fruitG;
    }
    if (d?.macros && typeof d.macros === 'object') {
      for (const [k, v] of Object.entries(d.macros)) {
        if (
          v != null &&
          typeof v === 'object' &&
          typeof (v as { value?: number }).value === 'number'
        ) {
          const val = (v as { value: number }).value;
          if (!macroSums[k]) {
            macroSums[k] = {
              value: 0,
              unit: (v as { unit?: string }).unit ?? macroUnits[k] ?? 'g',
            };
          }
          macroSums[k].value += val;
        }
      }
    }
  }

  const out: TherapeuticCoverageWeekly = {
    foodGroups: {
      vegetablesG: { value: vegSum, unit: 'g' },
      fruitG: { value: fruitSum, unit: 'g' },
    },
  };
  if (Object.keys(macroSums).length > 0) {
    out.macros = macroSums;
  }
  return out;
}

function dedupeDeficitEvents(events: DeficitEvent[]): {
  alerts: TherapeuticDeficitSummary['alerts'];
  worstByCode: Record<string, TherapeuticWorstContext>;
} {
  const byCode = new Map<string, DeficitEvent[]>();
  for (const e of events) {
    const list = byCode.get(e.code) ?? [];
    list.push(e);
    byCode.set(e.code, list);
  }
  const alerts: TherapeuticDeficitSummary['alerts'] = [];
  const worstByCode: Record<string, TherapeuticWorstContext> = {};
  for (const [code, list] of byCode) {
    if (list.length === 0) continue;
    const worst = list.reduce((a, b) =>
      a.target > 0 && b.target > 0 && a.actual / a.target < b.actual / b.target
        ? a
        : b,
    );
    const ratio =
      typeof worst.target === 'number' && worst.target > 0
        ? worst.actual / worst.target
        : undefined;
    worstByCode[code] = {
      date: worst.date,
      actual: worst.actual,
      target: worst.target,
      unit: worst.unit,
      ratio,
    };
    const dateLabel = formatDateShort(worst.date);
    const msg =
      worst.code === 'VEG_TARGET_UNDER_80'
        ? `Groente-doel vaak niet gehaald deze week (slechtste dag ${dateLabel}: ${Math.round(worst.actual)}g / ${worst.target}g).`
        : worst.code.startsWith('MACRO_TARGET_UNDER_80:')
          ? `Doel niet structureel gehaald deze week (slechtste dag ${dateLabel}: ${Math.round(worst.actual)}/${worst.target}${worst.unit ?? 'g'}).`
          : `Doel vaak niet gehaald deze week (slechtste dag ${dateLabel}).`;
    alerts.push({
      code: worst.code,
      severity: worst.severity,
      messageNl: msg,
    });
  }
  return { alerts, worstByCode };
}

function formatDateShort(isoDate: string): string {
  try {
    return new Date(isoDate + 'T12:00:00').toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return isoDate;
  }
}
