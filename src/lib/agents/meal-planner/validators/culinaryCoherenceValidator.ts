/**
 * Culinary coherence validator: applies DB rules (meal_plan_culinary_rules_v1)
 * to a generated plan. Used only in the Gemini path; no extra DB load (rules from loader).
 */

import type { MealPlanResponse, Meal } from '@/src/lib/diets';
import type { MealPlanCulinaryRuleV1 } from '@/src/lib/meal-planner/config/mealPlanGeneratorDbConfig';
import { AppError } from '@/src/lib/errors/app-error';

export type CulinaryViolation = {
  rule_code: string;
  reason_code: string;
  slot: string;
  match_value: string;
  day_index: number;
  date: string;
  slot_type: string;
};

/** Build searchable text from a meal (title + ingredient names). No PII. */
function getRelevantTextForMeal(meal: Meal): string {
  const parts: string[] = [meal.name ?? ''];
  if (meal.ingredientRefs?.length) {
    for (const ref of meal.ingredientRefs) {
      if (ref.displayName) parts.push(ref.displayName);
      if (ref.nevoCode) parts.push(ref.nevoCode);
    }
  }
  if (meal.ingredients?.length) {
    for (const ing of meal.ingredients) {
      if (ing.name) parts.push(ing.name);
    }
  }
  return parts.join(' ');
}

/** Whether this meal should be checked against smoothie rules (infer from content). */
function isSmoothieLike(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('smoothie') ||
    lower.includes('shake') ||
    lower.includes('eiwit shake')
  );
}

/** Escape special regex characters in a string for use inside \b...\b. */
function escapeForWordBoundary(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * For term mode: use word-boundary matching so "ei" matches the word "ei" (egg)
 * but not "eiwit" (protein). Multi-word terms still use substring include.
 */
function termMatches(
  relevantLower: string,
  rule: MealPlanCulinaryRuleV1,
): boolean {
  const value = (rule.match_value ?? '').toLowerCase().trim();
  if (!value) return false;
  if (value.includes(' ')) {
    return relevantLower.includes(value);
  }
  const escaped = escapeForWordBoundary(value);
  const wordBoundaryRe = new RegExp(`\\b${escaped}\\b`, 'i');
  return wordBoundaryRe.test(relevantLower);
}

/** Compile regex with safe flags; throws MEAL_PLAN_CONFIG_INVALID on invalid pattern. */
function compileRuleRegex(rule: MealPlanCulinaryRuleV1): RegExp {
  try {
    return new RegExp(rule.match_value, 'i');
  } catch {
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Ongeldige culinaire regel (regex). Pas de regel in de configuratie aan.',
      { rule_code: rule.rule_code },
    );
  }
}

/**
 * Validate plan against culinary rules. On any block violation, throws MEAL_PLAN_CULINARY_VIOLATION.
 * Empty rules → no-op. Warn actions are logged and ignored.
 */
export function validateCulinaryCoherence(
  plan: MealPlanResponse,
  culinaryRules: MealPlanCulinaryRuleV1[],
): void {
  if (!culinaryRules?.length) return;

  const blockRules = culinaryRules.filter((r) => r.action === 'block');
  if (blockRules.length === 0) return;

  const violations: CulinaryViolation[] = [];
  const regexCache = new Map<string, RegExp>();

  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    const day = plan.days[dayIndex];
    const date = day.date ?? '';

    for (const meal of day.meals ?? []) {
      const relevantText = getRelevantTextForMeal(meal);
      const relevantLower = relevantText.toLowerCase();
      const slot = meal.slot ?? '';

      const applicableSlotTypes: string[] = [slot];
      if (isSmoothieLike(relevantText)) applicableSlotTypes.push('smoothie');

      for (const rule of blockRules) {
        if (!applicableSlotTypes.includes(rule.slot_type)) continue;

        let matched: boolean;
        if (rule.match_mode === 'regex') {
          let re = regexCache.get(rule.rule_code);
          if (!re) {
            re = compileRuleRegex(rule);
            regexCache.set(rule.rule_code, re);
          }
          matched = re.test(relevantText);
        } else {
          matched = termMatches(relevantLower, rule);
        }

        if (matched) {
          violations.push({
            rule_code: rule.rule_code,
            reason_code: rule.reason_code,
            slot,
            match_value: rule.match_value,
            day_index: dayIndex,
            date,
            slot_type: rule.slot_type,
          });
        }
      }

      for (const rule of culinaryRules.filter((r) => r.action === 'warn')) {
        if (!applicableSlotTypes.includes(rule.slot_type)) continue;
        let matched: boolean;
        if (rule.match_mode === 'regex') {
          try {
            const re = new RegExp(rule.match_value, 'i');
            matched = re.test(relevantText);
          } catch {
            matched = false;
          }
        } else {
          matched = termMatches(relevantLower, rule);
        }
        if (matched) {
          console.warn(
            `[Culinary warn] ${rule.rule_code} (${rule.reason_code}) slot=${slot} date=${date}`,
          );
        }
      }
    }
  }

  if (violations.length > 0) {
    throw new AppError(
      'MEAL_PLAN_CULINARY_VIOLATION',
      'Er zit een culinaire mismatch in het menu (bijv. onlogische combinatie in een smoothie). Probeer opnieuw of pas je regels aan.',
      { violations },
    );
  }
}
