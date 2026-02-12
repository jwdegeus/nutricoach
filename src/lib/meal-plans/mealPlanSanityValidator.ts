/**
 * Culinary sanity validator for MealPlanResponse (post-generation).
 * Pure checks: meal names, ingredient counts/bounds, duplicate refs, empty days.
 * No DB queries.
 */

import type {
  MealPlanResponse,
  Meal,
  MealPlanDay,
  MealIngredientRef,
} from '@/src/lib/diets';

/** Stable issue codes for logging/debug. */
export type SanityIssueCode =
  | 'EMPTY_NAME'
  | 'PLACEHOLDER_NAME'
  | 'INGREDIENT_COUNT_OUT_OF_RANGE'
  | 'INGREDIENT_QTY_OUT_OF_RANGE'
  | 'MISSING_NEVO_CODE'
  | 'DUPLICATE_INGREDIENT'
  | 'EMPTY_DAY';

export type SanityIssue = {
  code: SanityIssueCode;
  message: string;
  mealId?: string;
  date?: string;
};

export type SanityResult = {
  ok: boolean;
  issues: SanityIssue[];
};

/** Placeholder meal names (case-insensitive); short list for detection. */
const PLACEHOLDER_NAMES = new Set([
  'tbd',
  'n/a',
  'na',
  'meal',
  'recept',
  'recipe',
  'unknown',
  'ontbijt',
  'lunch',
  'diner',
  'avondeten',
]);

/** Lower bound: allow 1 for simple meals (e.g. banaan, smoothie); Gemini soms 1. */
const MIN_INGREDIENTS = 1;
const MAX_INGREDIENTS = 10;
const MIN_QTY_G = 1;
const MAX_QTY_G = 400;

function isPlaceholderName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (PLACEHOLDER_NAMES.has(n)) return true;
  if (n.length <= 2) return true;
  return false;
}

/** Ref geldig bij nevoCode, customFoodId, of fdcId (één database, alle bronnen). */
function hasValidIngredientRef(ref: MealIngredientRef): boolean {
  const n = ref?.nevoCode?.trim();
  const c = ref?.customFoodId?.trim();
  const f = ref?.fdcId?.trim();
  return (n?.length ?? 0) > 0 || (c?.length ?? 0) > 0 || (f?.length ?? 0) > 0;
}

function ingredientRefKey(ref: MealIngredientRef, idx: number): string {
  const n = ref?.nevoCode?.trim();
  const c = ref?.customFoodId?.trim();
  const f = ref?.fdcId?.trim();
  if (n) return `nevo:${n}`;
  if (c) return `custom:${c}`;
  if (f) return `fdc:${f}`;
  return `idx:${idx}`;
}

/**
 * Validate a single meal: name, ingredient count, per-ref qty/nevoCode, no duplicate nevoCode.
 */
function validateMeal(meal: Meal, dayDate: string): SanityIssue[] {
  const issues: SanityIssue[] = [];

  const name = meal.name?.trim() ?? '';
  if (!name) {
    issues.push({
      code: 'EMPTY_NAME',
      message: 'Meal name is empty',
      mealId: meal.id,
      date: dayDate,
    });
  } else if (isPlaceholderName(name)) {
    issues.push({
      code: 'PLACEHOLDER_NAME',
      message: `Meal name looks like a placeholder: "${name.slice(0, 30)}"`,
      mealId: meal.id,
      date: dayDate,
    });
  }

  const refs = meal.ingredientRefs ?? [];
  if (refs.length < MIN_INGREDIENTS || refs.length > MAX_INGREDIENTS) {
    issues.push({
      code: 'INGREDIENT_COUNT_OUT_OF_RANGE',
      message: `Ingredient count ${refs.length} must be between ${MIN_INGREDIENTS} and ${MAX_INGREDIENTS}`,
      mealId: meal.id,
      date: dayDate,
    });
  }

  const seenKeys = new Set<string>();
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i] as MealIngredientRef;
    if (!hasValidIngredientRef(ref)) {
      issues.push({
        code: 'MISSING_NEVO_CODE',
        message: `Ingredient ref at index ${i} has no nevoCode, customFoodId, or fdcId`,
        mealId: meal.id,
        date: dayDate,
      });
      continue;
    }
    const key = ingredientRefKey(ref, i);
    if (seenKeys.has(key)) {
      issues.push({
        code: 'DUPLICATE_INGREDIENT',
        message: `Duplicate ingredient in meal: ${key}`,
        mealId: meal.id,
        date: dayDate,
      });
    }
    seenKeys.add(key);

    const qty = ref?.quantityG;
    if (typeof qty === 'number' && (qty < MIN_QTY_G || qty > MAX_QTY_G)) {
      issues.push({
        code: 'INGREDIENT_QTY_OUT_OF_RANGE',
        message: `quantityG ${qty} must be between ${MIN_QTY_G} and ${MAX_QTY_G}`,
        mealId: meal.id,
        date: dayDate,
      });
    }
  }

  return issues;
}

/**
 * Validate plan: each day has at least one meal, and each meal passes sanity rules.
 */
export function validateMealPlanSanity(plan: MealPlanResponse): SanityResult {
  const issues: SanityIssue[] = [];

  const days = plan.days ?? [];
  for (const day of days) {
    const dayDate = (day as MealPlanDay).date ?? '';
    const meals = (day as MealPlanDay).meals ?? [];
    if (meals.length === 0) {
      issues.push({
        code: 'EMPTY_DAY',
        message: 'Day has no meals',
        date: dayDate,
      });
    }
    for (const meal of meals) {
      issues.push(...validateMeal(meal as Meal, dayDate));
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
