/**
 * Hard Constraint Validator
 *
 * Validates that a generated meal plan adheres to hard constraints
 * from the diet rule set. This is a "best effort" enforcement that
 * will be refined later with NEVO codes and taxonomy.
 */

import type {
  MealPlanResponse,
  MealPlanRequest,
  DietRuleSet,
  MealPlanDay,
} from '@/src/lib/diets';
import {
  calcDayMacros,
  verifyNevoCode,
  adjustDayQuantitiesToTargets,
} from './mealPlannerAgent.tools';
import { getMealPlannerConfig } from '@/src/lib/meal-plans/mealPlans.config';
import { getIngredientCategories } from '@/src/lib/diet-validation/ingredient-categorizer';

/**
 * Validation issue found in the meal plan
 */
export type ValidationIssue = {
  path: string; // e.g., "days[0].meals[0].ingredients[2]"
  code:
    | 'FORBIDDEN_INGREDIENT'
    | 'FORBIDDEN_IN_SHAKE_SMOOTHIE'
    | 'ALLERGEN_PRESENT'
    | 'DISLIKED_INGREDIENT'
    | 'MISSING_REQUIRED_CATEGORY'
    | 'INVALID_NEVO_CODE'
    | 'CALORIE_TARGET_MISS'
    | 'MACRO_TARGET_MISS'
    | 'MEAL_PREFERENCE_MISS';
  message: string;
};

/** Strip invisible/Unicode space so "[]" and "[]\u200b" both normalize to "[]". */
function normalizePreferenceString(s: string): string {
  return s.replace(/[\u200b\u200c\u200d\ufeff]/g, '').trim();
}

/** Treat empty JSON-like strings as "no preference" so we skip MEAL_PREFERENCE_MISS. */
function isEmptyJsonLike(s: string): boolean {
  if (!s || typeof s !== 'string') return false;
  const t = normalizePreferenceString(s);
  if (t.length < 2) return false;
  if (t === '[]' || t === '{}') return true;
  if (/^\s*\[\s*\]\s*$/.test(t) || /^\s*\{\s*\}\s*$/.test(t)) return true;
  try {
    const x = JSON.parse(t);
    if (Array.isArray(x)) {
      if (x.length === 0) return true;
      if (
        x.every(
          (el) =>
            typeof el === 'string' &&
            isEmptyJsonLike(normalizePreferenceString(el)),
        )
      )
        return true;
    }
    return typeof x === 'object' && x !== null && Object.keys(x).length === 0;
  } catch {
    return false;
  }
}

/**
 * Case-insensitive substring match
 */
function matchesIngredient(
  ingredientName: string,
  searchTerm: string,
): boolean {
  return ingredientName.toLowerCase().includes(searchTerm.toLowerCase());
}

/**
 * Check if an ingredient matches any forbidden items or categories.
 * Uses both constraint items, tags, and name-based category detection (grains, dairy, legumes, etc.).
 */
function isForbiddenIngredient(
  ingredientName: string,
  tags: string[] | undefined,
  rules: DietRuleSet,
): boolean {
  // Check hard ingredient constraints
  for (const constraint of rules.ingredientConstraints) {
    if (constraint.constraintType !== 'hard') continue;
    if (constraint.type !== 'forbidden') continue;

    // Check items (e.g. user allergies as forbidden items)
    if (constraint.items.length > 0) {
      for (const item of constraint.items) {
        if (matchesIngredient(ingredientName, item)) {
          return true;
        }
      }
    }

    // Check categories via tags (e.g. NEVO food_group_nl)
    if (constraint.categories && tags) {
      for (const category of constraint.categories) {
        if (tags.some((tag) => matchesIngredient(tag, category))) {
          return true;
        }
      }
    }

    // Check categories via ingredient name (e.g. "Melk magere" -> dairy, "Rijst" -> grains)
    if (constraint.categories?.length && ingredientName?.trim()) {
      const nameCategories = getIngredientCategories(ingredientName);
      for (const category of constraint.categories) {
        if (nameCategories.includes(category)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Allergen -> ingredient terms that indicate that allergen (Dutch + English).
 * Used so "Eieren" matches "eiwit", "kippenei", "ei"; "Lactose" matches "melk", "yoghurt", etc.
 */
const ALLERGEN_INGREDIENT_TERMS: Record<string, string[]> = {
  eieren: ['ei', 'eieren', 'eiwit', 'kippenei', 'eidooier', 'egg'],
  lactose: [
    'lactose',
    'melk',
    'yoghurt',
    'kwark',
    'kaas',
    'room',
    'boter',
    'zuivel',
    'milk',
    'cheese',
    'yogurt',
  ],
  gluten: [
    'gluten',
    'tarwe',
    'rogge',
    'gerst',
    'brood',
    'pasta',
    'wheat',
    'bread',
  ],
  peulvruchten: [
    'peulvruchten',
    'linzen',
    'bonen',
    'kikkererwten',
    'erwten',
    'pinda',
    'lentils',
    'beans',
    'chickpeas',
    'peanuts',
  ],
  nachtschades: [
    'nachtschades',
    'tomaat',
    'paprika',
    'aardappel',
    'aubergine',
    'tomato',
    'potato',
    'eggplant',
    'bell_pepper',
  ],
  noten: [
    'noten',
    'amandel',
    'cashew',
    'walnoot',
    'hazelnoot',
    'nuts',
    'almond',
    'walnut',
  ],
  pinda: ['pinda', "pinda's", 'peanut'],
  vis: ['vis', 'zalm', 'tonijn', 'fish', 'salmon', 'tuna'],
  schaal: [
    'garnalen',
    'kreeft',
    'krab',
    'schelpdieren',
    'shellfish',
    'shrimp',
    'lobster',
    'crab',
  ],
  soja: ['soja', 'sojamelk', 'tofu', 'tempeh', 'soy'],
  'schaal- en schelpdieren': [
    'garnalen',
    'kreeft',
    'krab',
    'schelpdieren',
    'shellfish',
    'shrimp',
    'lobster',
    'crab',
  ],
};

function getAllergenTerms(allergen: string): string[] {
  const key = allergen.toLowerCase().trim();
  const expanded = ALLERGEN_INGREDIENT_TERMS[key];
  return expanded ? [key, ...expanded] : [key];
}

/**
 * Returns all ingredient terms to exclude from the candidate pool when user has these allergies.
 * Used so the pool does not contain yoghurt/melk when user has Lactose, etc.
 */
export function getExpandedAllergenTermsForExclusion(
  allergies: string[],
): string[] {
  const set = new Set<string>();
  for (const a of allergies) {
    for (const t of getAllergenTerms(a)) {
      if (t?.trim()) set.add(t.toLowerCase().trim());
    }
  }
  return Array.from(set);
}

/** Terms to skip when matching tags only (avoid false positives: "eiwit"/"ei" in tags = protein, not egg). */
const EGG_TAG_EXCLUDED_TERMS = new Set(['eiwit', 'ei']);

/** Whether character is a letter (a-z). */
function isLetter(c: string): boolean {
  return /^[a-z]$/.test(c);
}

/**
 * Check if text contains term, optionally with word-boundary for short terms
 * so "ei" matches "eiwit"/"kippenei" but not "verrijkt"/"bereid".
 */
function textContainsAllergenTerm(text: string, term: string): boolean {
  const lower = text.toLowerCase();
  const len = term.length;
  if (len === 0) return false;
  let idx = lower.indexOf(term);
  while (idx !== -1) {
    const beforeOk = idx === 0 || !isLetter(lower[idx - 1] ?? '');
    const afterOk =
      idx + len >= lower.length || !isLetter(lower[idx + len] ?? '');
    if (beforeOk || afterOk) return true;
    idx = lower.indexOf(term, idx + 1);
  }
  return false;
}

/**
 * Check if an ingredient matches user allergies.
 * Uses allergen name and expanded ingredient terms (e.g. Eieren -> ei, kippenei, eiwit).
 * Short terms (e.g. "ei") match only at word boundaries to avoid false positives (verrijkt, bereid).
 * For tags we skip "eiwit" for Eieren allergy to avoid matching NEVO/tag "eiwit" (protein content).
 */
function isAllergen(
  ingredientName: string,
  tags: string[] | undefined,
  allergies: string[],
): boolean {
  const nameLower = ingredientName.toLowerCase();
  for (const allergen of allergies) {
    const key = allergen.toLowerCase().trim();
    const terms = getAllergenTerms(allergen);
    const termsForTags =
      key === 'eieren'
        ? terms.filter((t) => !EGG_TAG_EXCLUDED_TERMS.has(t.toLowerCase()))
        : terms;
    for (const term of terms) {
      if (textContainsAllergenTerm(nameLower, term)) return true;
    }
    for (const term of termsForTags) {
      if (tags?.some((t) => textContainsAllergenTerm(t.toLowerCase(), term)))
        return true;
    }
  }
  return false;
}

/**
 * Check if an ingredient matches user dislikes
 */
function isDisliked(
  ingredientName: string,
  tags: string[] | undefined,
  dislikes: string[],
): boolean {
  for (const dislike of dislikes) {
    if (matchesIngredient(ingredientName, dislike)) {
      return true;
    }
    // Also check tags
    if (tags) {
      for (const tag of tags) {
        if (matchesIngredient(tag, dislike)) {
          return true;
        }
      }
    }
  }
  return false;
}

function isForbiddenInShakeSmoothie(displayName: string): boolean {
  if (!displayName || !displayName.trim()) return false;
  const patterns = getMealPlannerConfig().forbiddenPatternsInShakeSmoothie;
  if (!patterns.length) return false;
  const lower = displayName.toLowerCase();
  return patterns.some(
    (p) => p?.trim() && lower.includes(p.trim().toLowerCase()),
  );
}

function isShakeOrSmoothieMeal(meal: {
  name?: string;
  slot?: string;
  title?: string;
}): boolean {
  const name = ((meal.name ?? '') + ' ' + (meal.title ?? '')).toLowerCase();
  return (
    name.includes('shake') ||
    name.includes('smoothie') ||
    name.includes('eiwitshake')
  );
}

/** Terms that indicate meat/chicken/fish (NL + EN); matched with word boundaries. */
const MEAT_FISH_TERMS = [
  'kip',
  'kipfilet',
  'kalkoen',
  'rund',
  'gehakt',
  'varken',
  'speklap',
  'vis',
  'zalm',
  'tonijn',
  'chicken',
  'turkey',
  'beef',
  'pork',
  'fish',
  'salmon',
  'tuna',
];

const MEAT_FISH_REGEX = new RegExp(`\\b(${MEAT_FISH_TERMS.join('|')})\\b`, 'i');

/** Exclude "vis" match when text is about vitamins (vitamine/vitamines) to avoid false positive. */
function isVitaminContext(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('vitamine') || lower.includes('vitamin');
}

/**
 * Check if an ingredient is meat/chicken/fish (by name or tags).
 * Uses word-boundary regex to limit false positives.
 * Excludes "vis" when the text is about vitamins (vitamines).
 */
function isMeatFishIngredient(
  name: string | undefined,
  tags: string[] | undefined,
): boolean {
  const check = (t: string): boolean => {
    if (!t?.trim()) return false;
    if (isVitaminContext(t) && /\bvis\b/i.test(t)) return false;
    return MEAT_FISH_REGEX.test(t);
  };
  if (name && check(name)) return true;
  if (tags?.length) {
    for (const tag of tags) {
      if (typeof tag === 'string' && check(tag)) return true;
    }
  }
  return false;
}

/**
 * Check if required categories are present in a day's meals
 */
function checkRequiredCategories(
  dayMeals: MealPlanResponse['days'][0]['meals'],
  rules: DietRuleSet,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const required of rules.requiredCategories) {
    if (required.constraintType !== 'hard') continue;

    // Check if category is present in any meal of the day
    let found = false;
    for (const meal of dayMeals) {
      for (const ingredient of meal.ingredients ?? []) {
        // Check if ingredient name matches required items
        if (required.items && required.items.length > 0) {
          for (const item of required.items) {
            if (matchesIngredient(ingredient.name, item)) {
              found = true;
              break;
            }
          }
        }

        // Check if ingredient tags match required category
        if (ingredient.tags) {
          for (const tag of ingredient.tags) {
            if (matchesIngredient(tag, required.category)) {
              found = true;
              break;
            }
          }
        }

        if (found) break;
      }
      if (found) break;
    }

    // If minPerDay is specified and not found, create issue
    if (required.minPerDay && !found) {
      issues.push({
        path: `day[${dayMeals[0]?.date || 'unknown'}]`,
        code: 'MISSING_REQUIRED_CATEGORY',
        message: `Required category "${required.category}" (min ${required.minPerDay}/day) not found in any meal`,
      });
    }
  }

  return issues;
}

/**
 * Validate NEVO codes in ingredient references
 */
async function validateNevoCodes(
  plan: MealPlanResponse,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    const day = plan.days[dayIndex];

    for (let mealIndex = 0; mealIndex < day.meals.length; mealIndex++) {
      const meal = day.meals[mealIndex];

      // Validate ingredientRefs if present
      if (meal.ingredientRefs && meal.ingredientRefs.length > 0) {
        for (
          let refIndex = 0;
          refIndex < meal.ingredientRefs.length;
          refIndex++
        ) {
          const ref = meal.ingredientRefs[refIndex];
          if (ref == null) continue;
          const path = `days[${dayIndex}].meals[${mealIndex}].ingredientRefs[${refIndex}]`;

          // Verify NEVO code exists
          const isValid = await verifyNevoCode(ref.nevoCode);
          if (!isValid) {
            issues.push({
              path,
              code: 'INVALID_NEVO_CODE',
              message: `Invalid NEVO code: ${ref.nevoCode} (not found in database)`,
            });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Validate macro targets for a day
 */
async function validateDayMacros(
  dayMeals: MealPlanResponse['days'][0]['meals'],
  dayIndex: number,
  rules: DietRuleSet,
  _request: MealPlanRequest,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  // Only validate if there are hard macro constraints or hard calorie targets
  const hasHardMacroConstraints = rules.macroConstraints.some(
    (c) => c.constraintType === 'hard',
  );
  const hasHardCalorieTarget =
    rules.calorieTarget.min !== undefined ||
    rules.calorieTarget.max !== undefined;

  if (!hasHardMacroConstraints && !hasHardCalorieTarget) {
    return issues; // No hard macro/calorie constraints, skip validation
  }

  // Calculate actual macros for the day
  const dayMacros = await calcDayMacros(dayMeals);
  const dayPath = `days[${dayIndex}]`;

  // Check calorie target (hard constraint)
  if (hasHardCalorieTarget) {
    if (
      rules.calorieTarget.min !== undefined &&
      dayMacros.calories < rules.calorieTarget.min
    ) {
      issues.push({
        path: dayPath,
        code: 'CALORIE_TARGET_MISS',
        message: `Day calories (${dayMacros.calories.toFixed(0)}) below minimum target (${rules.calorieTarget.min})`,
      });
    }
    if (
      rules.calorieTarget.max !== undefined &&
      dayMacros.calories > rules.calorieTarget.max
    ) {
      issues.push({
        path: dayPath,
        code: 'CALORIE_TARGET_MISS',
        message: `Day calories (${dayMacros.calories.toFixed(0)}) above maximum target (${rules.calorieTarget.max})`,
      });
    }
  }

  // Check macro constraints (hard constraints only)
  for (const macroConstraint of rules.macroConstraints) {
    if (macroConstraint.constraintType !== 'hard') continue;
    if (macroConstraint.scope !== 'daily') continue;

    if (
      macroConstraint.maxCarbs !== undefined &&
      dayMacros.carbsG > macroConstraint.maxCarbs
    ) {
      issues.push({
        path: dayPath,
        code: 'MACRO_TARGET_MISS',
        message: `Day carbs (${dayMacros.carbsG.toFixed(1)}g) exceed maximum (${macroConstraint.maxCarbs}g)`,
      });
    }

    if (
      macroConstraint.minProtein !== undefined &&
      dayMacros.proteinG < macroConstraint.minProtein
    ) {
      issues.push({
        path: dayPath,
        code: 'MACRO_TARGET_MISS',
        message: `Day protein (${dayMacros.proteinG.toFixed(1)}g) below minimum (${macroConstraint.minProtein}g)`,
      });
    }

    if (
      macroConstraint.minFat !== undefined &&
      dayMacros.fatG < macroConstraint.minFat
    ) {
      issues.push({
        path: dayPath,
        code: 'MACRO_TARGET_MISS',
        message: `Day fat (${dayMacros.fatG.toFixed(1)}g) below minimum (${macroConstraint.minFat}g)`,
      });
    }
  }

  return issues;
}

/**
 * Validate hard constraints in a meal plan
 *
 * Checks for:
 * - Forbidden ingredients (from diet rules)
 * - Allergens (from user profile)
 * - Disliked ingredients (from user profile)
 * - Missing required categories (from diet rules)
 * - Invalid NEVO codes (if ingredientRefs are present)
 * - Macro/calorie target violations (hard constraints only)
 *
 * @param args - Validation arguments
 * @returns Array of validation issues (empty if all constraints are met)
 */
export async function validateHardConstraints(args: {
  plan: MealPlanResponse;
  rules: DietRuleSet;
  request: MealPlanRequest;
}): Promise<ValidationIssue[]> {
  const { plan, rules, request } = args;
  const issues: ValidationIssue[] = [];

  // Get allergies and dislikes from profile
  const allergies = request.profile.allergies;
  const dislikes = request.profile.dislikes;

  // Validate each day
  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    const day = plan.days[dayIndex];

    // Validate each meal in the day
    for (let mealIndex = 0; mealIndex < day.meals.length; mealIndex++) {
      const meal = day.meals[mealIndex];
      const mealPath = `days[${dayIndex}].meals[${mealIndex}]`;

      // Validate meal preferences (hard constraint) – only when slot has real preferences
      const mealPreferences = request.profile.mealPreferences;
      if (mealPreferences) {
        const raw = mealPreferences[meal.slot as keyof typeof mealPreferences];
        const slotPreferences = Array.isArray(raw)
          ? (raw as string[])
              .filter(
                (p): p is string =>
                  typeof p === 'string' &&
                  normalizePreferenceString(p).length > 0,
              )
              .filter((p) => !isEmptyJsonLike(normalizePreferenceString(p)))
          : [];
        if (slotPreferences.length > 0) {
          const { mealMatchesPreferences } =
            await import('@/src/lib/meal-history/mealPreferenceMatcher');
          const matches = mealMatchesPreferences(
            meal,
            meal.slot,
            slotPreferences,
          );
          if (!matches) {
            issues.push({
              path: mealPath,
              code: 'MEAL_PREFERENCE_MISS',
              message: `Meal "${meal.name}" does not match required preferences for ${meal.slot}: ${slotPreferences.join(', ')}`,
            });
          }
        }
      }

      // Validate legacy ingredients if present (backward compatibility)
      if (meal.ingredients && meal.ingredients.length > 0) {
        for (
          let ingredientIndex = 0;
          ingredientIndex < meal.ingredients.length;
          ingredientIndex++
        ) {
          const ingredient = meal.ingredients[ingredientIndex];
          const path = `days[${dayIndex}].meals[${mealIndex}].ingredients[${ingredientIndex}]`;

          // Check for allergens (hard constraint)
          if (isAllergen(ingredient.name, ingredient.tags, allergies)) {
            issues.push({
              path,
              code: 'ALLERGEN_PRESENT',
              message: `Ingredient "${ingredient.name}" contains or matches an allergen: ${allergies
                .filter((a) => matchesIngredient(ingredient.name, a))
                .join(', ')}`,
            });
          }

          // Check for disliked ingredients (hard constraint - user preference)
          if (isDisliked(ingredient.name, ingredient.tags, dislikes)) {
            issues.push({
              path,
              code: 'DISLIKED_INGREDIENT',
              message: `Ingredient "${ingredient.name}" is in the user's dislikes list`,
            });
          }

          // Check for forbidden ingredients from diet rules
          if (isForbiddenIngredient(ingredient.name, ingredient.tags, rules)) {
            issues.push({
              path,
              code: 'FORBIDDEN_INGREDIENT',
              message: `Ingredient "${ingredient.name}" is forbidden by diet rules`,
            });
          }

          // Food safety: raw chicken egg in shakes/smoothies is forbidden
          if (
            isShakeOrSmoothieMeal(meal) &&
            isForbiddenInShakeSmoothie(ingredient.name ?? '')
          ) {
            issues.push({
              path,
              code: 'FORBIDDEN_INGREDIENT',
              message: `Ei (rauw of gebakken) mag niet in een shake/smoothie. Gebruik yoghurt, melk, kwark of eiwitpoeder voor eiwit.`,
            });
          }

          // Hard constraint: no meat/chicken/fish in shake/smoothie
          if (
            isShakeOrSmoothieMeal(meal) &&
            isMeatFishIngredient(ingredient.name, ingredient.tags)
          ) {
            issues.push({
              path,
              code: 'FORBIDDEN_IN_SHAKE_SMOOTHIE',
              message: `Shake/smoothie mag geen vlees/kip/vis bevatten.`,
            });
          }
        }
      }

      // Validate ingredientRefs (new contract)
      if (meal.ingredientRefs && meal.ingredientRefs.length > 0) {
        for (
          let refIndex = 0;
          refIndex < meal.ingredientRefs.length;
          refIndex++
        ) {
          const ref = meal.ingredientRefs[refIndex];
          if (ref == null) continue;
          const path = `days[${dayIndex}].meals[${mealIndex}].ingredientRefs[${refIndex}]`;

          // Check displayName against allergens/dislikes/forbidden (if provided)
          if (ref.displayName) {
            if (isAllergen(ref.displayName, ref.tags, allergies)) {
              issues.push({
                path,
                code: 'ALLERGEN_PRESENT',
                message: `Ingredient "${ref.displayName}" (nevoCode: ${ref.nevoCode}) contains or matches an allergen`,
              });
            }

            if (isDisliked(ref.displayName, ref.tags, dislikes)) {
              issues.push({
                path,
                code: 'DISLIKED_INGREDIENT',
                message: `Ingredient "${ref.displayName}" (nevoCode: ${ref.nevoCode}) is in the user's dislikes list`,
              });
            }

            if (isForbiddenIngredient(ref.displayName, ref.tags, rules)) {
              issues.push({
                path,
                code: 'FORBIDDEN_INGREDIENT',
                message: `Ingredient "${ref.displayName}" (nevoCode: ${ref.nevoCode}) is forbidden by diet rules`,
              });
            }

            // Food safety: raw chicken egg in shakes/smoothies is forbidden
            if (
              isShakeOrSmoothieMeal(meal) &&
              isForbiddenInShakeSmoothie(ref.displayName ?? '')
            ) {
              issues.push({
                path,
                code: 'FORBIDDEN_INGREDIENT',
                message: `Ei (rauw of gebakken) mag niet in een shake/smoothie. Gebruik yoghurt, melk, kwark of eiwitpoeder voor eiwit.`,
              });
            }

            // Hard constraint: no meat/chicken/fish in shake/smoothie
            if (
              isShakeOrSmoothieMeal(meal) &&
              isMeatFishIngredient(ref.displayName, ref.tags)
            ) {
              issues.push({
                path,
                code: 'FORBIDDEN_IN_SHAKE_SMOOTHIE',
                message: `Shake/smoothie mag geen vlees/kip/vis bevatten.`,
              });
            }
          } else if (
            isShakeOrSmoothieMeal(meal) &&
            ref.tags?.length &&
            isMeatFishIngredient(undefined, ref.tags)
          ) {
            // No displayName but tags present: still check tags for meat/fish
            issues.push({
              path,
              code: 'FORBIDDEN_IN_SHAKE_SMOOTHIE',
              message: `Shake/smoothie mag geen vlees/kip/vis bevatten.`,
            });
          }
        }
      }
    }

    // Check required categories for the day
    const categoryIssues = checkRequiredCategories(day.meals, rules);
    issues.push(...categoryIssues);

    // Validate day macros (async)
    const macroIssues = await validateDayMacros(
      day.meals,
      dayIndex,
      rules,
      request,
    );
    issues.push(...macroIssues);
  }

  // Validate NEVO codes (async)
  const nevoCodeIssues = await validateNevoCodes(plan);
  issues.push(...nevoCodeIssues);

  return issues;
}

/**
 * Validate hard constraints for a single day
 *
 * Similar to validateHardConstraints but for a single day only.
 * Used in partial regenerate scenarios.
 *
 * @param args - Validation arguments for a single day
 * @returns Array of validation issues (empty if all constraints are met)
 */
export async function validateDayHardConstraints(args: {
  day: MealPlanDay;
  rules: DietRuleSet;
  request: MealPlanRequest;
  dayIndex?: number; // Optional day index for path generation
}): Promise<ValidationIssue[]> {
  const { day, rules, request, dayIndex = 0 } = args;
  const issues: ValidationIssue[] = [];

  // Get allergies and dislikes from profile
  const allergies = request.profile.allergies;
  const dislikes = request.profile.dislikes;

  // Validate each meal in the day
  for (let mealIndex = 0; mealIndex < day.meals.length; mealIndex++) {
    const meal = day.meals[mealIndex];
    const mealPath = `days[${dayIndex}].meals[${mealIndex}]`;

    // Validate meal preferences (hard constraint) – only when slot has real preferences
    const mealPreferences = request.profile.mealPreferences;
    if (mealPreferences) {
      const raw = mealPreferences[meal.slot as keyof typeof mealPreferences];
      const slotPreferences = Array.isArray(raw)
        ? (raw as string[])
            .filter(
              (p): p is string =>
                typeof p === 'string' &&
                normalizePreferenceString(p).length > 0,
            )
            .filter((p) => !isEmptyJsonLike(normalizePreferenceString(p)))
        : [];
      if (slotPreferences.length > 0) {
        const { mealMatchesPreferences } =
          await import('@/src/lib/meal-history/mealPreferenceMatcher');
        const matches = mealMatchesPreferences(
          meal,
          meal.slot,
          slotPreferences,
        );
        if (!matches) {
          issues.push({
            path: mealPath,
            code: 'MEAL_PREFERENCE_MISS',
            message: `Meal "${meal.name}" does not match required preferences for ${meal.slot}: ${slotPreferences.join(', ')}`,
          });
        }
      }
    }

    // Validate legacy ingredients if present (backward compatibility)
    if (meal.ingredients && meal.ingredients.length > 0) {
      for (
        let ingredientIndex = 0;
        ingredientIndex < meal.ingredients.length;
        ingredientIndex++
      ) {
        const ingredient = meal.ingredients[ingredientIndex];
        const path = `days[${dayIndex}].meals[${mealIndex}].ingredients[${ingredientIndex}]`;

        // Check for allergens (hard constraint)
        if (isAllergen(ingredient.name, ingredient.tags, allergies)) {
          issues.push({
            path,
            code: 'ALLERGEN_PRESENT',
            message: `Ingredient "${ingredient.name}" contains or matches an allergen: ${allergies
              .filter((a) => matchesIngredient(ingredient.name, a))
              .join(', ')}`,
          });
        }

        // Check for disliked ingredients (hard constraint - user preference)
        if (isDisliked(ingredient.name, ingredient.tags, dislikes)) {
          issues.push({
            path,
            code: 'DISLIKED_INGREDIENT',
            message: `Ingredient "${ingredient.name}" is in the user's dislikes list`,
          });
        }

        // Check for forbidden ingredients from diet rules
        if (isForbiddenIngredient(ingredient.name, ingredient.tags, rules)) {
          issues.push({
            path,
            code: 'FORBIDDEN_INGREDIENT',
            message: `Ingredient "${ingredient.name}" is forbidden by diet rules`,
          });
        }

        // Food safety: raw chicken egg in shakes/smoothies is forbidden
        if (
          isShakeOrSmoothieMeal(meal) &&
          isForbiddenInShakeSmoothie(ingredient.name ?? '')
        ) {
          issues.push({
            path,
            code: 'FORBIDDEN_INGREDIENT',
            message: `Ei (rauw of gebakken) mag niet in een shake/smoothie. Gebruik yoghurt, melk, kwark of eiwitpoeder voor eiwit.`,
          });
        }

        // Hard constraint: no meat/chicken/fish in shake/smoothie
        if (
          isShakeOrSmoothieMeal(meal) &&
          isMeatFishIngredient(ingredient.name, ingredient.tags)
        ) {
          issues.push({
            path,
            code: 'FORBIDDEN_IN_SHAKE_SMOOTHIE',
            message: `Shake/smoothie mag geen vlees/kip/vis bevatten.`,
          });
        }
      }
    }

    // Validate ingredientRefs (new contract)
    if (meal.ingredientRefs && meal.ingredientRefs.length > 0) {
      for (
        let refIndex = 0;
        refIndex < meal.ingredientRefs.length;
        refIndex++
      ) {
        const ref = meal.ingredientRefs[refIndex];
        if (ref == null) continue;
        const path = `days[${dayIndex}].meals[${mealIndex}].ingredientRefs[${refIndex}]`;

        // Check displayName against allergens/dislikes/forbidden (if provided)
        if (ref.displayName) {
          if (isAllergen(ref.displayName, ref.tags, allergies)) {
            issues.push({
              path,
              code: 'ALLERGEN_PRESENT',
              message: `Ingredient "${ref.displayName}" (nevoCode: ${ref.nevoCode}) contains or matches an allergen`,
            });
          }

          if (isDisliked(ref.displayName, ref.tags, dislikes)) {
            issues.push({
              path,
              code: 'DISLIKED_INGREDIENT',
              message: `Ingredient "${ref.displayName}" (nevoCode: ${ref.nevoCode}) is in the user's dislikes list`,
            });
          }

          if (isForbiddenIngredient(ref.displayName, ref.tags, rules)) {
            issues.push({
              path,
              code: 'FORBIDDEN_INGREDIENT',
              message: `Ingredient "${ref.displayName}" (nevoCode: ${ref.nevoCode}) is forbidden by diet rules`,
            });
          }

          // Food safety: raw chicken egg in shakes/smoothies is forbidden
          if (
            isShakeOrSmoothieMeal(meal) &&
            isForbiddenInShakeSmoothie(ref.displayName ?? '')
          ) {
            issues.push({
              path,
              code: 'FORBIDDEN_INGREDIENT',
              message: `Ei (rauw of gebakken) mag niet in een shake/smoothie. Gebruik yoghurt, melk, kwark of eiwitpoeder voor eiwit.`,
            });
          }

          // Hard constraint: no meat/chicken/fish in shake/smoothie
          if (
            isShakeOrSmoothieMeal(meal) &&
            isMeatFishIngredient(ref.displayName, ref.tags)
          ) {
            issues.push({
              path,
              code: 'FORBIDDEN_IN_SHAKE_SMOOTHIE',
              message: `Shake/smoothie mag geen vlees/kip/vis bevatten.`,
            });
          }
        } else if (
          isShakeOrSmoothieMeal(meal) &&
          ref.tags?.length &&
          isMeatFishIngredient(undefined, ref.tags)
        ) {
          issues.push({
            path,
            code: 'FORBIDDEN_IN_SHAKE_SMOOTHIE',
            message: `Shake/smoothie mag geen vlees/kip/vis bevatten.`,
          });
        }

        // Verify NEVO code exists
        const isValidCode = await verifyNevoCode(ref.nevoCode);
        if (!isValidCode) {
          issues.push({
            path,
            code: 'INVALID_NEVO_CODE',
            message: `Invalid NEVO code: ${ref.nevoCode}`,
          });
        }
      }
    }
  }

  // Check required categories for the day
  const categoryIssues = checkRequiredCategories(day.meals, rules);
  issues.push(...categoryIssues);

  // Validate day macros (async)
  const macroIssues = await validateDayMacros(
    day.meals,
    dayIndex,
    rules,
    request,
  );
  issues.push(...macroIssues);

  return issues;
}

/**
 * Validate and optionally adjust day macros deterministically
 *
 * Validates day macros and if only macro issues exist, attempts
 * deterministic quantity adjustment before returning issues.
 *
 * @param args - Day validation arguments
 * @returns Validation result with optional adjusted day
 */
export async function validateAndAdjustDayMacros(args: {
  day: MealPlanDay;
  rules: DietRuleSet;
  request: MealPlanRequest;
  allowAdjustment?: boolean; // If true, attempt deterministic adjustment for macro-only issues
}): Promise<{
  issues: ValidationIssue[];
  adjustedDay?: MealPlanDay;
  adjustments?: Array<{ nevoCode: string; oldG: number; newG: number }>;
}> {
  const { day, rules, request, allowAdjustment = true } = args;

  // First, validate all constraints
  const allIssues = await validateDayHardConstraints({
    day,
    rules,
    request,
  });

  // Check if only macro issues exist (no ingredient/constraint violations)
  const macroOnlyIssues = allIssues.filter(
    (issue) =>
      issue.code === 'CALORIE_TARGET_MISS' ||
      issue.code === 'MACRO_TARGET_MISS',
  );
  const nonMacroIssues = allIssues.filter(
    (issue) =>
      issue.code !== 'CALORIE_TARGET_MISS' &&
      issue.code !== 'MACRO_TARGET_MISS',
  );

  // If there are non-macro issues, return all issues (can't fix with adjustment)
  if (nonMacroIssues.length > 0) {
    return { issues: allIssues };
  }

  // If only macro issues and adjustment is allowed, try deterministic adjustment
  if (macroOnlyIssues.length > 0 && allowAdjustment) {
    // Build targets from rules
    const targets: {
      calories?: { min: number; max: number };
      proteinG?: { min: number; max: number };
      carbsG?: { max: number };
      fatG?: { min: number; max: number };
    } = {};

    if (rules.calorieTarget.min || rules.calorieTarget.max) {
      targets.calories = {
        min: rules.calorieTarget.min ?? 0,
        max: rules.calorieTarget.max ?? 10000,
      };
    }

    // Extract macro constraints
    for (const macro of rules.macroConstraints) {
      if (macro.constraintType === 'hard' && macro.scope === 'daily') {
        if (macro.minProtein !== undefined) {
          targets.proteinG = {
            ...targets.proteinG,
            min: macro.minProtein,
            max: targets.proteinG?.max ?? 999,
          };
        }
        if (macro.maxCarbs !== undefined) {
          targets.carbsG = { max: macro.maxCarbs };
        }
        if (macro.minFat !== undefined || macro.maxFat !== undefined) {
          targets.fatG = {
            ...targets.fatG,
            min: macro.minFat ?? targets.fatG?.min ?? 0,
            max: macro.maxFat ?? targets.fatG?.max ?? 999,
          };
        }
      }
    }

    // Attempt adjustment
    try {
      const { day: adjustedDay, adjustments } =
        await adjustDayQuantitiesToTargets({
          day,
          targets,
        });

      // Re-validate adjusted day
      const adjustedIssues = await validateDayHardConstraints({
        day: adjustedDay,
        rules,
        request,
      });

      // If adjustment fixed all issues, return success
      if (adjustedIssues.length === 0) {
        return {
          issues: [],
          adjustedDay,
          adjustments,
        };
      }

      // If adjustment helped but didn't fix everything, return adjusted day with remaining issues
      // (This allows the repair loop to continue with better starting point)
      return {
        issues: adjustedIssues,
        adjustedDay,
        adjustments,
      };
    } catch (error) {
      // Adjustment failed - return original issues
      console.warn('Deterministic macro adjustment failed:', error);
      return { issues: allIssues };
    }
  }

  // No adjustment attempted or not allowed - return original issues
  return { issues: allIssues };
}
