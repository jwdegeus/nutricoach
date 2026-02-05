/**
 * Pure tuning advisor: analyses a MealPlanResponse + generator config
 * and returns concrete suggestions (no DB, no side effects).
 */

import type { MealPlanResponse, MealPlanDay, Meal } from '@/src/lib/diets';

/** Allowed action kinds; use this union to avoid typos (e.g. 'arn' → 'pool'). */
export const TUNING_ACTION_KINDS = ['setting', 'pool', 'slot'] as const;
export type TuningActionKind = (typeof TUNING_ACTION_KINDS)[number];

export type TuningAction = {
  kind: TuningActionKind;
  target: string;
  hint: string;
};

export type TuningSuggestion = {
  severity: 'info' | 'warn';
  code: string;
  title: string;
  actions: TuningAction[];
};

/** Minimal config shape for the advisor (buildable from admin data + dietKey). */
export type GeneratorConfigForAdvisor = {
  dietKey: string;
  poolItems: { protein: number; veg: number; fat: number; flavor: number };
  settings: {
    max_ingredients: number;
    max_flavor_items: number;
    protein_repeat_cap_7d: number;
    template_repeat_cap_7d: number;
    signature_retry_limit: number;
  };
  templates?: Array<{
    template_key: string;
    slots: Array<{
      slot_key: string;
      default_g: number;
      min_g: number;
      max_g: number;
    }>;
  }>;
};

const MAX_SUGGESTIONS = 8;
const VEG_MONOTONY_THRESHOLD = 3;

function getGeneratorMeta(preview: MealPlanResponse): {
  quality?: {
    repeatsForced?: number;
    proteinRepeatsForced?: number;
    templateRepeatsForced?: number;
    proteinCountsTop?: Array<{ nevoCode: string; count: number }>;
    templateCounts?: Array<{ id: string; count: number }>;
  };
  sanity?: { ok: boolean; issues?: Array<{ code: string; message: string }> };
} | null {
  const gen = (preview.metadata as Record<string, unknown>)?.generator as
    | Record<string, unknown>
    | undefined;
  if (!gen) return null;
  const templateInfo = gen.templateInfo as Record<string, unknown> | undefined;
  const quality = templateInfo?.quality as Record<string, unknown> | undefined;
  const sanity = gen.sanity as
    | { ok: boolean; issues?: Array<{ code: string; message: string }> }
    | undefined;
  return { quality: quality ?? undefined, sanity: sanity ?? undefined };
}

/**
 * Returns tuning suggestions from preview + config. Deterministic, max 8 items, warn first.
 */
export function getTuningSuggestions(
  preview: MealPlanResponse,
  config: GeneratorConfigForAdvisor,
): TuningSuggestion[] {
  const out: TuningSuggestion[] = [];
  const meta = getGeneratorMeta(preview);

  // 1) Forced repeats
  if (meta?.quality) {
    const q = meta.quality;
    const repeatsForced = Number(q.repeatsForced ?? 0);
    const proteinForced = Number(q.proteinRepeatsForced ?? 0);
    const templateForced = Number(q.templateRepeatsForced ?? 0);
    if (repeatsForced > 0 || proteinForced > 0 || templateForced > 0) {
      const actions: TuningAction[] = [];
      actions.push({
        kind: 'pool',
        target: `Pools → diet_key=${config.dietKey}`,
        hint: 'Voeg meer items toe aan protein/veg/fat om herhaling te verminderen.',
      });
      if (config.settings.protein_repeat_cap_7d < 5) {
        actions.push({
          kind: 'setting',
          target: 'protein_repeat_cap_7d',
          hint: `Overweeg +1 (nu ${config.settings.protein_repeat_cap_7d}).`,
        });
      }
      if (config.settings.template_repeat_cap_7d < 5) {
        actions.push({
          kind: 'setting',
          target: 'template_repeat_cap_7d',
          hint: `Overweeg +1 (nu ${config.settings.template_repeat_cap_7d}).`,
        });
      }
      const topProteins = (
        q.proteinCountsTop as
          | Array<{ nevoCode: string; count: number }>
          | undefined
      )?.slice(0, 3);
      const topTemplates = (
        q.templateCounts as Array<{ id: string; count: number }> | undefined
      )?.slice(0, 2);
      if (topProteins?.length) {
        actions.push({
          kind: 'pool',
          target: 'protein',
          hint: `Meest herhaald: ${topProteins.map((p) => `nevo ${p.nevoCode} (${p.count}x)`).join(', ')}.`,
        });
      }
      if (topTemplates?.length) {
        actions.push({
          kind: 'slot',
          target: 'templates',
          hint: `Meest gebruikt: ${topTemplates.map((t) => `${t.id} (${t.count}x)`).join(', ')}.`,
        });
      }
      out.push({
        severity: 'warn',
        code: 'REPEATS_FORCED',
        title: 'Forced repeats in plan',
        actions: actions.slice(0, 3),
      });
    }
  }

  // 2) Pool empties / low counts (from config)
  const { poolItems } = config;
  const lowPools: string[] = [];
  if (poolItems.protein < 3) lowPools.push(`protein (${poolItems.protein})`);
  if (poolItems.veg < 3) lowPools.push(`veg (${poolItems.veg})`);
  if (poolItems.fat < 2) lowPools.push(`fat (${poolItems.fat})`);
  if (lowPools.length > 0) {
    out.push({
      severity: 'warn',
      code: 'POOL_LOW',
      title: 'Pools te klein voor variatie',
      actions: [
        {
          kind: 'pool',
          target: `Pools → diet_key=${config.dietKey}, category`,
          hint: `Voeg minimaal 5–10 items toe aan: ${lowPools.join(', ')}.`,
        },
      ],
    });
  }

  // 3) Sanity issues
  const issues = meta?.sanity?.issues ?? [];
  if (issues.length > 0) {
    const byCode = new Map<string, typeof issues>();
    for (const i of issues) {
      const list = byCode.get(i.code) ?? [];
      list.push(i);
      byCode.set(i.code, list);
    }
    if (byCode.has('INGREDIENT_COUNT_OUT_OF_RANGE')) {
      out.push({
        severity: 'warn',
        code: 'SANITY_INGREDIENT_COUNT',
        title: 'Aantal ingrediënten buiten bereik',
        actions: [
          {
            kind: 'setting',
            target: 'max_ingredients',
            hint: `Pas aan (nu ${config.settings.max_ingredients}) of controleer slot default_g/min_g/max_g.`,
          },
          ...(config.templates?.length
            ? [
                {
                  kind: 'slot' as const,
                  target: 'Templates → slots',
                  hint: 'Verhoog veg2/fat default_g indien nodig.',
                },
              ]
            : []),
        ],
      });
    }
    if (byCode.has('PLACEHOLDER_NAME')) {
      out.push({
        severity: 'warn',
        code: 'SANITY_PLACEHOLDER',
        title: 'Placeholder meal names',
        actions: [
          {
            kind: 'pool',
            target: `Pools → diet_key=${config.dietKey}`,
            hint: 'Breid pools uit voor meer variatie.',
          },
          {
            kind: 'slot',
            target: 'templates',
            hint: 'Meer templates of sanity retry met andere seed.',
          },
        ],
      });
    }
    if (byCode.has('EMPTY_DAY')) {
      out.push({
        severity: 'warn',
        code: 'SANITY_EMPTY_DAY',
        title: 'Dag zonder maaltijden',
        actions: [
          {
            kind: 'pool',
            target: `Pools → diet_key=${config.dietKey}`,
            hint: 'Pools of caps te strikt; voeg items toe.',
          },
          {
            kind: 'setting',
            target: 'protein_repeat_cap_7d / template_repeat_cap_7d',
            hint: 'Overweeg caps te verhogen.',
          },
        ],
      });
    }
  }

  // 4) Ingredient monotony (same veg nevoCode many times)
  const vegNevoCounts = new Map<string, number>();
  for (const day of preview.days ?? []) {
    const d = day as MealPlanDay;
    for (const meal of d.meals ?? []) {
      const m = meal as Meal;
      const refs = m.ingredientRefs ?? [];
      // Template order: 0=protein, 1=veg1, 2=veg2, 3=fat, 4+=flavor
      for (let i = 1; i <= 2 && i < refs.length; i++) {
        const r = refs[i];
        if (r?.nevoCode) {
          vegNevoCounts.set(
            r.nevoCode,
            (vegNevoCounts.get(r.nevoCode) ?? 0) + 1,
          );
        }
      }
    }
  }
  for (const [, count] of vegNevoCounts) {
    if (count >= VEG_MONOTONY_THRESHOLD) {
      out.push({
        severity: 'info',
        code: 'VEG_MONOTONY',
        title: 'Zelfde groente vaak herhaald',
        actions: [
          {
            kind: 'pool',
            target: `Pools → diet_key=${config.dietKey}, category=veg`,
            hint: 'Veg pool uitbreiden.',
          },
          {
            kind: 'setting',
            target: 'protein_repeat_cap_7d',
            hint: 'Eventueel aanpassen om herhaling te sturen.',
          },
        ],
      });
      break;
    }
  }

  // Sort: warn first, then info; limit
  out.sort((a, b) =>
    a.severity === 'warn' && b.severity === 'info'
      ? -1
      : a.severity === 'info' && b.severity === 'warn'
        ? 1
        : 0,
  );

  if (
    typeof process !== 'undefined' &&
    process.env.NODE_ENV === 'development'
  ) {
    for (const s of out) {
      for (const a of s.actions) {
        if (!TUNING_ACTION_KINDS.includes(a.kind)) {
          throw new Error(
            `TuningAction.kind must be one of ${TUNING_ACTION_KINDS.join(', ')}; got: ${JSON.stringify(a.kind)}`,
          );
        }
      }
    }
  }

  return out.slice(0, MAX_SUGGESTIONS);
}
