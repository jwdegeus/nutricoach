/**
 * Builds a variety scorecard from a meal plan and DB variety targets.
 * Purely reporting; no enforcement. Attach result to plan.metadata.varietyScorecard before persist.
 * Use throwIfVarietyTargetsNotMet(scorecard) before persist to enforce targets.
 *
 * Targets are scaled by plan length: for plans shorter than 7 days, minimums are reduced
 * proportionally so short plans (e.g. 2 days) can pass.
 */

import type {
  MealPlanResponse,
  MealPlanVarietyScorecard,
  Meal,
} from '@/src/lib/diets';
import type { MealPlanVarietyTargetsV1 } from '@/src/lib/meal-planner/config/mealPlanGeneratorDbConfig';
import { AppError } from '@/src/lib/errors/app-error';

/** Reference length: DB targets are defined per week. */
const REFERENCE_DAYS = 7;

/**
 * Scale variety targets for a plan of numDays days.
 * For plans shorter than REFERENCE_DAYS, minimums are reduced proportionally (min 1).
 * Repeat window is capped at numDays so a 2-day plan isn't judged on a 7-day window.
 */
export function scaleVarietyTargetsForPlanDays(
  numDays: number,
  targets: MealPlanVarietyTargetsV1 | null | undefined,
): {
  unique_veg_min: number;
  unique_fruit_min: number;
  protein_rotation_min_categories: number;
  max_repeat_same_recipe_within_days: number;
} {
  if (!targets || numDays < 1) {
    return {
      unique_veg_min: 1,
      unique_fruit_min: 1,
      protein_rotation_min_categories: 1,
      max_repeat_same_recipe_within_days: Math.max(1, numDays),
    };
  }
  const scale = Math.min(1, numDays / REFERENCE_DAYS);
  const baseVeg = targets.unique_veg_min ?? 5;
  const baseFruit = targets.unique_fruit_min ?? 3;
  const baseProtein = targets.protein_rotation_min_categories ?? 3;
  const baseRepeat = targets.max_repeat_same_recipe_within_days ?? 7;
  return {
    unique_veg_min: Math.max(1, Math.ceil(baseVeg * scale)),
    unique_fruit_min: Math.max(1, Math.ceil(baseFruit * scale)),
    protein_rotation_min_categories: Math.max(
      1,
      Math.ceil(baseProtein * scale),
    ),
    max_repeat_same_recipe_within_days: Math.min(
      baseRepeat,
      Math.max(1, numDays),
    ),
  };
}

function normalizeKey(s: string | undefined): string {
  if (s == null) return '';
  return String(s).trim().toLowerCase();
}

/** Extract distinct ingredient keys (nevoCode or displayName or legacy name) from a meal. */
function getIngredientKeys(meal: Meal): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  if (meal.ingredientRefs?.length) {
    for (const ref of meal.ingredientRefs) {
      const key = normalizeKey(ref.displayName) || normalizeKey(ref.nevoCode);
      if (key && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  if (meal.ingredients?.length) {
    for (const ing of meal.ingredients) {
      const key = normalizeKey(ing.name);
      if (key && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

/** Heuristic: veg keywords (Dutch + English) for substring match on normalized name. */
const VEG_TERMS = new Set([
  'groente',
  'groenten',
  'tomaten',
  'tomaat',
  'wortel',
  'wortelen',
  'ui',
  'uien',
  'knoflook',
  'paprika',
  'courgette',
  'aubergine',
  'spinazie',
  'sla',
  'broccoli',
  'bloemkool',
  'boerenkool',
  'andijvie',
  'prei',
  'bleekselderij',
  'komkommer',
  'radijs',
  'biet',
  'bieten',
  'vegetable',
  'tomato',
  'carrot',
  'onion',
  'garlic',
  'pepper',
  'spinach',
  'lettuce',
  'broccoli',
  'cauliflower',
  'kale',
  'zucchini',
  'eggplant',
  'cucumber',
  'celery',
  'leek',
]);

/** Heuristic: fruit keywords (Dutch + English). */
const FRUIT_TERMS = new Set([
  'fruit',
  'appel',
  'appels',
  'banaan',
  'bananen',
  'sinaasappel',
  'citroen',
  'limoen',
  'peer',
  'peren',
  'druif',
  'druiven',
  'bes',
  'bessen',
  'aardbei',
  'aardbeien',
  'framboos',
  'blauwe bes',
  'mango',
  'ananas',
  'kiwi',
  'apple',
  'banana',
  'orange',
  'lemon',
  'lime',
  'pear',
  'grape',
  'berry',
  'berries',
  'strawberry',
  'raspberry',
  'blueberry',
  'mango',
  'pineapple',
]);

/** Heuristic: protein-like ingredients for rotation count. */
const PROTEIN_TERMS = new Set([
  'kip',
  'kipfilet',
  'kipfilets',
  'vlees',
  'rund',
  'varken',
  'gehakt',
  'ei',
  'eieren',
  'vis',
  'zalm',
  'tonijn',
  'kabeljauw',
  'forel',
  'tofu',
  'tempeh',
  'linzen',
  'kikkererwten',
  'bonen',
  'quorn',
  'chicken',
  'beef',
  'pork',
  'egg',
  'fish',
  'salmon',
  'tuna',
  'cod',
  'tofu',
  'tempeh',
  'lentil',
  'chickpea',
  'bean',
  'beans',
]);

function isVeg(key: string): boolean {
  return Array.from(VEG_TERMS).some((t) => key.includes(t) || t.includes(key));
}

function isFruit(key: string): boolean {
  return Array.from(FRUIT_TERMS).some(
    (t) => key.includes(t) || t.includes(key),
  );
}

function isProtein(key: string): boolean {
  return Array.from(PROTEIN_TERMS).some(
    (t) => key.includes(t) || t.includes(key),
  );
}

/** Max times the same meal name appears in any sliding window of windowDays days. */
function computeMaxRepeatWithinDays(
  plan: MealPlanResponse,
  windowDays: number,
): { maxRepeat: number; topRepeats: { name: string; count: number }[] } {
  const nameCountByWindow = new Map<string, number>();
  const dayOrder = [...(plan.days ?? [])].sort((a, b) =>
    (a.date ?? '').localeCompare(b.date ?? ''),
  );
  if (windowDays < 1 || dayOrder.length === 0) {
    return { maxRepeat: 0, topRepeats: [] };
  }
  let globalMax = 0;
  const totalCountByName = new Map<string, number>();

  for (let i = 0; i <= dayOrder.length - windowDays; i++) {
    const window = dayOrder.slice(i, i + windowDays);
    const nameInWindow = new Map<string, number>();
    for (const day of window) {
      for (const meal of day.meals ?? []) {
        const name = normalizeKey(meal.name) || 'unknown';
        nameInWindow.set(name, (nameInWindow.get(name) ?? 0) + 1);
        totalCountByName.set(name, (totalCountByName.get(name) ?? 0) + 1);
      }
    }
    for (const [, count] of nameInWindow) {
      if (count > globalMax) globalMax = count;
    }
  }

  const topRepeats = [...totalCountByName.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return { maxRepeat: globalMax, topRepeats };
}

/**
 * Build variety scorecard from plan and DB targets. No enforcement; safe when targets missing.
 */
export function buildMealPlanVarietyScorecard(
  plan: MealPlanResponse,
  varietyTargets: MealPlanVarietyTargetsV1 | null | undefined,
): MealPlanVarietyScorecard {
  const unavailable: MealPlanVarietyScorecard = {
    status: 'unavailable',
    uniqueVegCount: 0,
    uniqueFruitCount: 0,
    proteinUniqueCount: 0,
    maxRepeatWithinDays: 0,
    repeatWindowDays: 0,
    targets: {
      unique_veg_min: 0,
      unique_fruit_min: 0,
      protein_rotation_min_categories: 0,
      max_repeat_same_recipe_within_days: 0,
    },
    meetsTargets: {
      meetsUniqueVegMin: false,
      meetsUniqueFruitMin: false,
      meetsProteinRotation: false,
      meetsRepeatWindow: 'unknown',
    },
  };

  if (!varietyTargets) return unavailable;

  const numDays = Math.max(1, plan.days?.length ?? REFERENCE_DAYS);
  const scaled = scaleVarietyTargetsForPlanDays(numDays, varietyTargets);
  const unique_veg_min = scaled.unique_veg_min;
  const unique_fruit_min = scaled.unique_fruit_min;
  const protein_rotation_min_categories =
    scaled.protein_rotation_min_categories;
  const repeatWindowDays = scaled.max_repeat_same_recipe_within_days;

  const allVegKeys = new Set<string>();
  const allFruitKeys = new Set<string>();
  const allProteinKeys = new Set<string>();

  for (const day of plan.days ?? []) {
    for (const meal of day.meals ?? []) {
      for (const key of getIngredientKeys(meal)) {
        if (!key) continue;
        if (isVeg(key)) allVegKeys.add(key);
        if (isFruit(key)) allFruitKeys.add(key);
        if (isProtein(key)) allProteinKeys.add(key);
      }
    }
  }

  const uniqueVegCount = allVegKeys.size;
  const uniqueFruitCount = allFruitKeys.size;
  const proteinUniqueCount = allProteinKeys.size;

  const { maxRepeat: maxRepeatWithinDays, topRepeats } =
    computeMaxRepeatWithinDays(plan, repeatWindowDays);

  const meetsUniqueVegMin = uniqueVegCount >= unique_veg_min;
  const meetsUniqueFruitMin = uniqueFruitCount >= unique_fruit_min;
  const meetsProteinRotation =
    proteinUniqueCount >= protein_rotation_min_categories;
  const meetsRepeatWindow: boolean | 'unknown' =
    maxRepeatWithinDays <= 1 ? true : false;

  return {
    status: 'ok',
    uniqueVegCount,
    uniqueFruitCount,
    proteinUniqueCount,
    maxRepeatWithinDays,
    repeatWindowDays,
    targets: {
      unique_veg_min,
      unique_fruit_min,
      protein_rotation_min_categories,
      max_repeat_same_recipe_within_days: repeatWindowDays,
    },
    meetsTargets: {
      meetsUniqueVegMin,
      meetsUniqueFruitMin,
      meetsProteinRotation,
      meetsRepeatWindow,
    },
    ...(topRepeats.length > 0 && { topRepeats }),
  };
}

/**
 * Throws when variety scorecard indicates one or more targets are not met.
 * Call after building and attaching scorecard, before persist. No retries.
 * Safe payload only: counts + targets + meetsTargets (no topRepeats/meal names).
 */
export function throwIfVarietyTargetsNotMet(
  scorecard: MealPlanVarietyScorecard | undefined,
): void {
  if (scorecard == null) return;
  if (scorecard.status !== 'ok') {
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Variatie-instellingen ontbreken. Configureer variatiedoelen in beheer.',
      { reason: 'variety_scorecard_unavailable' },
    );
  }
  const { meetsTargets } = scorecard;
  const notMet =
    meetsTargets.meetsUniqueVegMin === false ||
    meetsTargets.meetsUniqueFruitMin === false ||
    meetsTargets.meetsProteinRotation === false ||
    meetsTargets.meetsRepeatWindow === false;
  if (!notMet) return;
  throw new AppError(
    'MEAL_PLAN_VARIETY_TARGETS_NOT_MET',
    'Menu voldoet niet aan variatiedoelen (groente, fruit, proteïne of herhaling). Voeg meer recepten toe of pas variatie-instellingen aan in beheer.',
    {
      uniqueVegCount: scorecard.uniqueVegCount,
      uniqueFruitCount: scorecard.uniqueFruitCount,
      proteinUniqueCount: scorecard.proteinUniqueCount,
      maxRepeatWithinDays: scorecard.maxRepeatWithinDays,
      targets: scorecard.targets,
      meetsTargets: scorecard.meetsTargets,
    },
  );
}
