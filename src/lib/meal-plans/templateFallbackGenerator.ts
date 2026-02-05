/**
 * Template-based meal plan generator.
 * Produces planSnapshot-compatible meals from whitelisted ingredient pools only.
 * No free-form AI; templates + pool picks only.
 */

import type {
  MealPlanRequest,
  MealPlanResponse,
  MealPlanDay,
  Meal,
  MealSlot,
  MealIngredientRef,
} from '@/src/lib/diets';
import type { MealQualityEntry } from '@/src/lib/diets/diet.types';
import type {
  CandidatePool,
  NevoFoodCandidate,
} from '@/src/lib/agents/meal-planner/mealPlannerAgent.tools';
import { calcMealMacros } from '@/src/lib/agents/meal-planner/mealPlannerAgent.tools';

/** Ingredient slot in a template */
export type TemplateSlot = 'protein' | 'veg1' | 'veg2' | 'fat';

/** One ingredient option from a whitelisted pool */
export type PoolIngredient = {
  nevoCode: string;
  name: string;
};

/** Flavor item with quantity bounds (from DB pool, category=flavor). */
export type FlavorPoolItem = PoolIngredient & {
  defaultG: number;
  minG: number;
  maxG: number;
};

/** Whitelisted pools per category (from config + NEVO merge). */
export type TemplateIngredientPools = {
  protein: PoolIngredient[];
  veg: PoolIngredient[];
  fat: PoolIngredient[];
  flavor: FlavorPoolItem[];
};

/** Limits from meal_plan_generator_settings (passed with config). */
export type GeneratorLimits = {
  maxIngredients: number;
  maxFlavorItems: number;
  signatureRetryLimit: number;
  proteinRepeatCap7d: number;
  templateRepeatCap7d: number;
};

const NUM_CANDIDATES = 5;
const TOP_PROTEIN_COUNTS = 5;

/** Recipe template: fixed structure + default quantities (g) per slot. Max 10 ingredients, max 6 steps. */
export type RecipeTemplate = {
  id: string;
  nameNl: string;
  slots: Array<{
    slot: TemplateSlot;
    defaultG: number;
    minG: number;
    maxG: number;
  }>;
  /** Fixed step count (max 6); for enrichment only, not in plan snapshot */
  stepCount: number;
};

/** Draft meal from template + pool picks (before macros/ids). */
export type TemplateMealDraft = {
  name: string;
  ingredientRefs: MealIngredientRef[];
};

export class InsufficientAllowedIngredientsError extends Error {
  readonly code = 'INSUFFICIENT_ALLOWED_INGREDIENTS';
  constructor(
    message: string,
    public readonly emptyPools?: TemplateSlot[],
  ) {
    super(message);
    this.name = 'InsufficientAllowedIngredientsError';
  }
}

/** Signature for no-repeat window: protein + veg1 + veg2 nevoCodes (fixed order). */
export function buildMealSignature(
  ingredientRefs: MealIngredientRef[],
): string {
  const first3 = ingredientRefs.slice(0, 3);
  return first3
    .map((r) => r.nevoCode)
    .filter(Boolean)
    .join('|');
}

/** Heuristic: name indicates fat source (avocado, oil, nuts, etc.) to avoid double fats. */
export function isFatLike(name: string): boolean {
  const n = name.toLowerCase();
  return /avocado|olijf|olie|noten|kokos|tahini|boter/.test(n);
}

/** Minimal name pattern for meal naming (template_key, slot, pattern). */
export type NamePatternForGenerator = {
  template_key: string;
  slot: string;
  pattern: string;
};

/**
 * Build meal name from pattern: replace {protein}, {veg1}, {veg2}, {flavor}, {templateName}; trim and cleanup.
 * Removes empty "()" or "–" when flavor is missing.
 */
export function buildMealNameFromPattern(
  pattern: string,
  ingredientRefs: MealIngredientRef[],
  templateName: string,
): string {
  const protein = (ingredientRefs[0]?.displayName ?? '').trim() || 'eiwit';
  const veg1 = (ingredientRefs[1]?.displayName ?? '').trim() || 'groente';
  const veg2 = (ingredientRefs[2]?.displayName ?? '').trim() || 'groente';
  const flavorRefs = ingredientRefs.slice(4);
  const flavor =
    flavorRefs.length > 0
      ? (flavorRefs[0]?.displayName ?? '').trim() || ''
      : '';
  let out = pattern
    .replace(/\{templateName\}/g, templateName)
    .replace(/\{protein\}/g, protein)
    .replace(/\{veg1\}/g, veg1)
    .replace(/\{veg2\}/g, veg2)
    .replace(/\{flavor\}/g, flavor);
  out = out.replace(/\s+/g, ' ').trim();
  if (flavor === '') {
    out = out
      .replace(/\s*\(\s*\)\s*/g, ' ')
      .replace(/\s*–\s*$/g, '')
      .replace(/^\s*–\s*/g, '')
      .trim();
  }
  out = out
    .replace(/\s*–\s*–\s*/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
  return out;
}

/**
 * Pick one ingredient from pool, avoiding nevoCodes in avoidSet. Max 8 attempts, then fallback.
 */
export function pickIngredientWithAvoid(
  pool: PoolIngredient[],
  avoidSet: Set<string>,
  seed?: number,
): PoolIngredient {
  if (pool.length === 0)
    throw new InsufficientAllowedIngredientsError('Pool is empty');
  const available = pool.filter((p) => !avoidSet.has(p.nevoCode));
  const list = available.length > 0 ? available : pool;
  if (seed != null) {
    const idx = Math.abs(seed) % list.length;
    return list[idx];
  }
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Map CandidatePool (from buildCandidatePool) to TemplateIngredientPools.
 * For the template generator path use loadMealPlanGeneratorConfig + mergePoolItemsWithCandidatePool instead (flavor from DB).
 * This helper is for callers that only have NEVO pool and no config (e.g. tests); flavor is empty.
 */
export function mapCandidatePoolToTemplatePools(
  candidatePool: CandidatePool,
): TemplateIngredientPools {
  const toPool = (list: NevoFoodCandidate[]): PoolIngredient[] =>
    list.map((c) => ({ nevoCode: c.nevoCode, name: c.name }));

  const vegetables = candidatePool.vegetables ?? [];
  const fruits = candidatePool.fruits ?? [];
  const veg = [...toPool(vegetables), ...toPool(fruits)];

  return {
    protein: toPool(candidatePool.proteins ?? []),
    veg: veg.length > 0 ? veg : toPool(vegetables),
    fat: toPool(candidatePool.fats ?? []),
    flavor: [],
  };
}

/**
 * Pick one item from pool; deterministic shuffle when seed is set for retries.
 */
function _pickOne<T>(pool: T[], seed?: number): T {
  if (pool.length === 0)
    throw new InsufficientAllowedIngredientsError('Pool is empty');
  if (seed != null) {
    const idx = Math.abs(seed) % pool.length;
    return pool[idx];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export type TemplateQualityMetrics = {
  repeatsAvoided: number;
  repeatsForced: number;
  proteinRepeatsForced?: number;
  templateRepeatsForced?: number;
  proteinCountsTop?: Array<{ nevoCode: string; count: number }>;
  templateCounts?: Array<{ id: string; count: number }>;
  /** Number of veg picks that chose a low-usage item (coverage-aware). */
  vegMonotonyAvoided?: number;
};

/**
 * Pick one item from pool with lowest usage count; filter by avoidSet; deterministic tiebreak via seed.
 * Fallback: if subset of min-usage items is empty (edge case), use full list; if list empty, use pool.
 */
function pickLeastUsed(
  pool: PoolIngredient[],
  usageMap: Map<string, number>,
  avoidSet: Set<string>,
  seed: number,
): PoolIngredient {
  if (pool.length === 0)
    throw new InsufficientAllowedIngredientsError('Pool is empty');
  const available = pool.filter((p) => !avoidSet.has(p.nevoCode));
  const list = available.length > 0 ? available : pool;
  if (list.length === 0) return pool[Math.abs(seed) % pool.length]!;
  const getUsage = (p: PoolIngredient) => usageMap.get(p.nevoCode) ?? 0;
  const minUsage = Math.min(...list.map(getUsage));
  const subset = list.filter((p) => getUsage(p) === minUsage);
  const pickFrom = subset.length > 0 ? subset : list;
  const idx = Math.abs(seed) % pickFrom.length;
  return pickFrom[idx]!;
}

/**
 * Generate a single meal from a template and pools. Uses limits from config (max_ingredients, etc.).
 * Applies no-repeat window (protein+veg1+veg2 signature), fat compatibility, and 0–N flavor items from pool.
 * When usageMapProtein/usageMapVeg/usageMapFat are provided, picks prefer lower usage (coverage-aware).
 * When namePatterns is provided, meal name is built from a pattern (deterministic pick by seed) instead of template+date.
 */
export function generateTemplateMealDraft(
  template: RecipeTemplate,
  slot: MealSlot,
  date: string,
  pools: TemplateIngredientPools,
  limits: GeneratorLimits,
  retrySeed?: number,
  usedSignatures?: Set<string>,
  quality?: TemplateQualityMetrics,
  usageMapProtein?: Map<string, number>,
  usageMapVeg?: Map<string, number>,
  usageMapFat?: Map<string, number>,
  namePatterns?: NamePatternForGenerator[],
): TemplateMealDraft {
  const used = new Set<string>();
  const baseSeed = retrySeed ?? 0;
  const { maxIngredients, maxFlavorItems, signatureRetryLimit } = limits;

  const proteinPool = pools.protein;
  const vegPool = pools.veg;
  const fatPool = pools.fat;
  const flavorPool = pools.flavor;

  if (proteinPool.length === 0 || vegPool.length === 0) {
    throw new InsufficientAllowedIngredientsError(
      'Geen toegestane ingrediënten voor eiwit of groente. Verruim dieetregels of voeg recepten toe.',
    );
  }

  let ingredientRefs: MealIngredientRef[] = [];
  const slot0 = template.slots[0];
  const slot1 = template.slots[1];
  const slot2 = template.slots[2];
  const slot3 = template.slots[3];

  const pickProtein = (attemptUsed: Set<string>, seed: number) =>
    usageMapProtein != null
      ? pickLeastUsed(proteinPool, usageMapProtein, attemptUsed, seed)
      : pickIngredientWithAvoid(proteinPool, attemptUsed, seed);
  const pickVeg = (attemptUsed: Set<string>, seed: number) =>
    usageMapVeg != null
      ? pickLeastUsed(vegPool, usageMapVeg, attemptUsed, seed)
      : pickIngredientWithAvoid(vegPool, attemptUsed, seed);

  for (let attempt = 0; attempt < signatureRetryLimit; attempt++) {
    const attemptUsed = new Set<string>();
    const refs: MealIngredientRef[] = [];
    const seed = baseSeed + attempt * 1000;

    const p = pickProtein(attemptUsed, seed);
    attemptUsed.add(p.nevoCode);
    const pSlot = slot0 ?? { defaultG: 120, minG: 50, maxG: 200 };
    refs.push({
      nevoCode: p.nevoCode,
      quantityG: Math.max(pSlot.minG, Math.min(pSlot.maxG, pSlot.defaultG)),
      displayName: p.name,
    });

    const v1 = pickVeg(attemptUsed, seed + 1);
    attemptUsed.add(v1.nevoCode);
    const v1Slot = slot1 ?? { defaultG: 80, minG: 30, maxG: 150 };
    refs.push({
      nevoCode: v1.nevoCode,
      quantityG: Math.max(v1Slot.minG, Math.min(v1Slot.maxG, v1Slot.defaultG)),
      displayName: v1.name,
    });

    const v2 = pickVeg(attemptUsed, seed + 2);
    attemptUsed.add(v2.nevoCode);
    const v2Slot = slot2 ?? { defaultG: 60, minG: 30, maxG: 120 };
    refs.push({
      nevoCode: v2.nevoCode,
      quantityG: Math.max(v2Slot.minG, Math.min(v2Slot.maxG, v2Slot.defaultG)),
      displayName: v2.name,
    });

    const sig = buildMealSignature(refs);
    if (!usedSignatures?.has(sig)) {
      ingredientRefs = refs;
      usedSignatures?.add(sig);
      if (attempt > 0 && quality) quality.repeatsAvoided += 1;
      break;
    }
    if (attempt === signatureRetryLimit - 1) {
      ingredientRefs = refs;
      usedSignatures?.add(sig);
      if (quality) quality.repeatsForced += 1;
    }
  }

  used.add(ingredientRefs[0].nevoCode);
  used.add(ingredientRefs[1].nevoCode);
  used.add(ingredientRefs[2].nevoCode);

  if (fatPool.length > 0 && ingredientRefs.length < maxIngredients) {
    const alreadyFatLike = ingredientRefs.some(
      (r) => r != null && isFatLike(r.displayName ?? ''),
    );
    const fatCandidates = alreadyFatLike
      ? fatPool.filter((f) => !isFatLike(f.name))
      : fatPool;
    const fatPoolToUse = fatCandidates.length > 0 ? fatCandidates : fatPool;
    const fatIng =
      usageMapFat != null
        ? pickLeastUsed(fatPoolToUse, usageMapFat, used, baseSeed + 3)
        : pickIngredientWithAvoid(fatPoolToUse, used, baseSeed + 3);
    used.add(fatIng.nevoCode);
    const fSlot = slot3 ?? { defaultG: 10, minG: 5, maxG: 25 };
    ingredientRefs.push({
      nevoCode: fatIng.nevoCode,
      quantityG: Math.max(fSlot.minG, Math.min(fSlot.maxG, fSlot.defaultG)),
      displayName: fatIng.name,
    });
  }

  if (ingredientRefs.length < maxIngredients && flavorPool.length > 0) {
    const numFlavor = Math.min(
      maxFlavorItems,
      maxIngredients - ingredientRefs.length,
      (Math.abs(baseSeed) + date.length) % (maxFlavorItems + 1),
    );
    for (let i = 0; i < numFlavor; i++) {
      const f = flavorPool[
        Math.abs(baseSeed + i * 11) % flavorPool.length
      ] as FlavorPoolItem;
      if (used.has(f.nevoCode)) continue;
      used.add(f.nevoCode);
      ingredientRefs.push({
        nevoCode: f.nevoCode,
        quantityG: Math.max(f.minG, Math.min(f.maxG, f.defaultG)),
        displayName: f.name,
      });
    }
  }

  if (ingredientRefs.length === 0) {
    throw new InsufficientAllowedIngredientsError(
      'Geen ingrediënten gekozen uit pools. Controleer dieetregels.',
    );
  }

  let name: string;
  const forSlot =
    namePatterns?.filter(
      (p) => p.template_key === template.id && p.slot === slot,
    ) ?? [];
  if (forSlot.length > 0) {
    const idx = Math.abs(baseSeed) % forSlot.length;
    const pattern = forSlot[idx]!.pattern;
    name = buildMealNameFromPattern(pattern, ingredientRefs, template.nameNl);
    if (!name || name.length < 3) name = `${template.nameNl} (${date})`;
  } else {
    name = `${template.nameNl} (${date})`;
  }
  return { name, ingredientRefs };
}

/**
 * Build full Meal with id and estimatedMacros. Server-side only.
 */
export async function buildMealFromDraft(
  draft: TemplateMealDraft,
  slot: MealSlot,
  date: string,
): Promise<Meal> {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  let estimatedMacros: Meal['estimatedMacros'];
  try {
    const nevoRefs = draft.ingredientRefs.filter(
      (ref) => ref.nevoCode && !ref.nevoCode.startsWith('FLAVOR:'),
    );
    const macros = await calcMealMacros(
      nevoRefs.map((ref) => ({
        nevoCode: ref.nevoCode,
        quantityG: ref.quantityG,
      })),
    );
    estimatedMacros = {
      calories: macros.calories,
      protein: macros.proteinG,
      carbs: macros.carbsG,
      fat: macros.fatG,
    };
  } catch {
    estimatedMacros = undefined;
  }

  return {
    id,
    name: draft.name,
    slot,
    date,
    ingredientRefs: draft.ingredientRefs,
    estimatedMacros,
  };
}

/** Config passed from loader: templates + settings (caps/limits) + optional name patterns. */
export type MealPlanGeneratorConfig = {
  templates: RecipeTemplate[];
  settings: {
    max_ingredients: number;
    max_flavor_items: number;
    protein_repeat_cap_7d: number;
    template_repeat_cap_7d: number;
    signature_retry_limit: number;
  };
  /** Name patterns for meal naming (from meal_plan_name_patterns). */
  namePatterns?: NamePatternForGenerator[];
};

/** Result of template plan generation: plan + observability info for metadata.generator */
export type GenerateTemplatePlanResult = {
  plan: MealPlanResponse;
  templateInfo: {
    rotation: string[];
    usedTemplateIds: string[];
    quality?: TemplateQualityMetrics;
    mealQualities?: MealQualityEntry[];
  };
};

/**
 * Score a candidate draft for plan-level balance.
 * +2 protein not used this week, +1 template used less, -3 protein cap exceeded, -2 template cap exceeded.
 */
function scoreCandidate(
  draft: TemplateMealDraft,
  templateId: string,
  proteinCounts: Map<string, number>,
  templateCounts: Map<string, number>,
  caps: { proteinRepeatCap7d: number; templateRepeatCap7d: number },
): number {
  const protein = draft.ingredientRefs[0]?.nevoCode ?? '';
  const currentProtein = proteinCounts.get(protein) ?? 0;
  const currentTemplate = templateCounts.get(templateId) ?? 0;
  let score = 0;
  if (currentProtein === 0) score += 2;
  if (currentTemplate < caps.templateRepeatCap7d) score += 1;
  if (currentProtein >= caps.proteinRepeatCap7d) score -= 3;
  if (currentTemplate >= caps.templateRepeatCap7d) score -= 2;
  return score;
}

/**
 * Generate a full MealPlanResponse from config (templates + settings) and pools.
 * Applies no-repeat window (7 days), fat compatibility, and flavor pool from config.
 * @param request - Valid MealPlanRequest
 * @param config - Loaded config (templates + settings from DB)
 * @param pools - Merged ingredient pools (from mergePoolItemsWithCandidatePool)
 * @param retrySeed - Optional seed for alternate picks (e.g. 1 on guardrails retry)
 */
export async function generateTemplatePlan(
  request: MealPlanRequest,
  config: MealPlanGeneratorConfig,
  pools: TemplateIngredientPools,
  retrySeed?: number,
): Promise<GenerateTemplatePlanResult> {
  const { templates, settings } = config;
  if (templates.length === 0) {
    throw new InsufficientAllowedIngredientsError(
      'Geen actieve templates beschikbaar. Configureer templates in de generatorconfiguratie.',
    );
  }

  const limits: GeneratorLimits = {
    maxIngredients: settings.max_ingredients,
    maxFlavorItems: settings.max_flavor_items,
    signatureRetryLimit: settings.signature_retry_limit,
    proteinRepeatCap7d: settings.protein_repeat_cap_7d,
    templateRepeatCap7d: settings.template_repeat_cap_7d,
  };
  const rotationIds = templates.map((t) => t.id);
  const start = new Date(request.dateRange.start);
  const end = new Date(request.dateRange.end);
  const days: MealPlanDay[] = [];
  const slots = request.slots;
  let templateIndex = 0;
  const usedTemplateIds = new Set<string>();
  const usedSignatures = new Set<string>();
  const proteinCounts = new Map<string, number>();
  const vegCounts = new Map<string, number>();
  const fatCounts = new Map<string, number>();
  const templateCounts = new Map<string, number>();
  const quality: TemplateQualityMetrics = {
    repeatsAvoided: 0,
    repeatsForced: 0,
    proteinRepeatsForced: 0,
    templateRepeatsForced: 0,
    vegMonotonyAvoided: 0,
  };
  const mealQualities: MealQualityEntry[] = [];

  const baseSeed = retrySeed ?? 0;
  const caps = {
    proteinRepeatCap7d: settings.protein_repeat_cap_7d,
    templateRepeatCap7d: settings.template_repeat_cap_7d,
  };

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const meals: Meal[] = [];

    for (const slot of slots) {
      const template = templates[templateIndex % templates.length]!;
      templateIndex += 1;
      usedTemplateIds.add(template.id);

      const candidateDrafts: TemplateMealDraft[] = [];
      for (let c = 0; c < NUM_CANDIDATES; c++) {
        try {
          const candidateSeed = baseSeed + (templateIndex - 1) * 100 + c;
          const draft = generateTemplateMealDraft(
            template,
            slot,
            dateStr,
            pools,
            limits,
            candidateSeed,
            new Set(usedSignatures),
            undefined,
            proteinCounts,
            vegCounts,
            fatCounts,
            config.namePatterns,
          );
          candidateDrafts.push(draft);
        } catch {
          // Skip failed candidate (e.g. pool too small for variety); use others
        }
      }

      if (candidateDrafts.length === 0) {
        throw new InsufficientAllowedIngredientsError(
          'Geen maaltijd kon gegenereerd worden. Verruim dieetregels of voeg recepten toe.',
        );
      }

      let bestIdx = 0;
      let bestScore = scoreCandidate(
        candidateDrafts[0]!,
        template.id,
        proteinCounts,
        templateCounts,
        caps,
      );
      for (let c = 1; c < candidateDrafts.length; c++) {
        const s = scoreCandidate(
          candidateDrafts[c]!,
          template.id,
          proteinCounts,
          templateCounts,
          caps,
        );
        if (s > bestScore) {
          bestScore = s;
          bestIdx = c;
        }
      }

      const chosen = candidateDrafts[bestIdx]!;
      const sig = buildMealSignature(chosen.ingredientRefs);
      usedSignatures.add(sig);

      const veg1Nevo = chosen.ingredientRefs[1]?.nevoCode;
      const veg2Nevo = chosen.ingredientRefs[2]?.nevoCode;
      const fatNevo = chosen.ingredientRefs[3]?.nevoCode;
      const getVegUsage = (nevo: string) => vegCounts.get(nevo) ?? 0;
      const vegUsages = pools.veg.map((p) => getVegUsage(p.nevoCode));
      const minVegUsage = vegUsages.length > 0 ? Math.min(...vegUsages) : 0;
      const maxVegUsage = vegUsages.length > 0 ? Math.max(...vegUsages) : 0;
      if (
        minVegUsage < maxVegUsage &&
        veg1Nevo &&
        getVegUsage(veg1Nevo) === minVegUsage
      )
        quality.vegMonotonyAvoided! += 1;
      if (
        minVegUsage < maxVegUsage &&
        veg2Nevo &&
        getVegUsage(veg2Nevo) === minVegUsage
      )
        quality.vegMonotonyAvoided! += 1;

      const protein = chosen.ingredientRefs[0]?.nevoCode ?? '';
      const prevProtein = proteinCounts.get(protein) ?? 0;
      const prevTemplate = templateCounts.get(template.id) ?? 0;

      const reasons: string[] = [];
      if (prevProtein === 0) reasons.push('Protein nieuw deze week');
      if (prevTemplate < caps.templateRepeatCap7d)
        reasons.push('Template onder cap');
      if (
        minVegUsage < maxVegUsage &&
        ((veg1Nevo && getVegUsage(veg1Nevo) === minVegUsage) ||
          (veg2Nevo && getVegUsage(veg2Nevo) === minVegUsage))
      ) {
        reasons.push('Veg met lage week-usage gekozen');
      }
      if (usedSignatures.size > 0) reasons.push('Vermijdt herhaalde signature');
      mealQualities.push({
        date: dateStr,
        slot,
        score: bestScore,
        reasons: reasons.slice(0, 3),
      });

      proteinCounts.set(protein, prevProtein + 1);
      templateCounts.set(template.id, prevTemplate + 1);
      if (veg1Nevo) vegCounts.set(veg1Nevo, (vegCounts.get(veg1Nevo) ?? 0) + 1);
      if (veg2Nevo) vegCounts.set(veg2Nevo, (vegCounts.get(veg2Nevo) ?? 0) + 1);
      if (fatNevo) fatCounts.set(fatNevo, (fatCounts.get(fatNevo) ?? 0) + 1);

      if (prevProtein >= settings.protein_repeat_cap_7d)
        quality.proteinRepeatsForced! += 1;
      if (prevTemplate >= settings.template_repeat_cap_7d)
        quality.templateRepeatsForced! += 1;

      const meal = await buildMealFromDraft(chosen, slot, dateStr);
      meals.push(meal);
    }

    days.push({ date: dateStr, meals });
  }

  quality.proteinCountsTop = [...proteinCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_PROTEIN_COUNTS)
    .map(([nevoCode, count]) => ({ nevoCode, count }));
  quality.templateCounts = [...templateCounts.entries()].map(([id, count]) => ({
    id,
    count,
  }));

  const requestId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `plan-${Date.now()}`;
  const totalMeals = days.reduce((sum, day) => sum + day.meals.length, 0);

  const plan: MealPlanResponse = {
    requestId,
    days,
    metadata: {
      generatedAt: new Date().toISOString(),
      dietKey: request.profile.dietKey,
      totalDays: days.length,
      totalMeals,
    },
  };

  return {
    plan,
    templateInfo: {
      rotation: [...rotationIds],
      usedTemplateIds: [...usedTemplateIds],
      quality,
      mealQualities,
    },
  };
}
