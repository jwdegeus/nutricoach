/**
 * Shared guardrails enforcement for meal plans.
 * Used by both the meal planner agent (template path) and the admin preview action
 * so that the same rules apply and no logic is duplicated.
 */

import {
  loadRulesetWithDietLogic,
  evaluateGuardrails,
} from '@/src/lib/guardrails-vnext';
import { loadMagicianOverrides } from '@/src/lib/diet-validation/magician-overrides.loader';
import {
  mapMealPlanToGuardrailsTargets,
  getMealPlanIngredientsPerDay,
} from '@/src/lib/guardrails-vnext/adapters/meal-planner';
import type { EvaluationContext } from '@/src/lib/guardrails-vnext/types';
import { evaluateDietLogic } from '@/src/lib/diet-logic';
import type { MealPlanResponse } from '@/src/lib/diets';
import type { GuardrailsViolationDetails } from '@/src/lib/errors/app-error';

export type EnforceGuardrailsResult =
  | { ok: true; plan: MealPlanResponse }
  | {
      ok: false;
      code: 'GUARDRAILS_VIOLATION';
      message: string;
      details: GuardrailsViolationDetails;
    };

/**
 * Runs vNext guardrails (allow/block) and Diet Logic (DROP/FORCE/LIMIT) on a meal plan.
 * Does not throw; returns a result so callers can decide (retry, return error, etc.).
 *
 * @param plan - Generated meal plan
 * @param dietKey - Diet key for ruleset loading
 * @param locale - Locale for evaluation
 * @param userId - Optional; when set, diet logic uses is_inflamed from user_diet_profiles
 */
export async function enforceMealPlannerGuardrails(
  plan: MealPlanResponse,
  dietKey: string,
  locale: 'nl' | 'en' = 'nl',
  userId?: string,
): Promise<EnforceGuardrailsResult> {
  try {
    const targets = mapMealPlanToGuardrailsTargets(plan, locale);

    const { guardrails, dietLogic } = await loadRulesetWithDietLogic({
      dietId: dietKey,
      mode: 'meal_planner',
      locale,
      userId,
    });

    const overrides = await loadMagicianOverrides();
    const context: EvaluationContext = {
      dietKey,
      mode: 'meal_planner',
      locale,
      timestamp: new Date().toISOString(),
      excludeOverrides: overrides,
    };

    const decision = evaluateGuardrails({
      ruleset: guardrails,
      context,
      targets,
    });

    let dietResult: {
      ok: boolean;
      summary: string;
      warnings?: string[];
    } | null = null;
    let forceDeficits: GuardrailsViolationDetails['forceDeficits'];
    if (dietLogic) {
      const ingredientsPerDay = getMealPlanIngredientsPerDay(plan);
      const dayResults = ingredientsPerDay.map((dayIngredients) =>
        evaluateDietLogic(dietLogic, { ingredients: dayIngredients }),
      );
      const firstFail = dayResults.findIndex((r) => !r.ok);
      if (firstFail >= 0) {
        const failed = dayResults[firstFail];
        dietResult = {
          ok: false,
          summary: failed.summary,
          warnings: failed.warnings,
        };
        const dayLabel = plan.days[firstFail]?.date ?? `dag ${firstFail + 1}`;
        dietResult.summary = `${dietResult.summary} (${dayLabel})`;
        const phase2 = failed.phaseResults.find((p) => p.phase === 2);
        if (phase2?.forceDeficits?.length) {
          forceDeficits = phase2.forceDeficits;
        }
      } else {
        const allWarnings = dayResults.flatMap((r) => r.warnings ?? []);
        dietResult = {
          ok: true,
          summary: 'Dieetregels: alle fases geslaagd.',
          warnings: allWarnings.length ? allWarnings : undefined,
        };
      }
    }

    const blockedByGuardrails = !decision.ok;
    const blockedByDietLogic = dietResult !== null && !dietResult.ok;

    if (blockedByGuardrails || blockedByDietLogic) {
      const reasonCodes = blockedByGuardrails
        ? decision.reasonCodes
        : [...decision.reasonCodes, 'DIET_LOGIC_VIOLATION'];
      const message =
        blockedByDietLogic && dietResult
          ? dietResult.summary
          : 'Het gegenereerde meal plan voldoet niet aan de dieetregels';

      console.log(
        `[MealPlanner] vNext guard rails blocked plan: dietKey=${dietKey}, outcome=${decision.outcome}, reasonCodes=${reasonCodes.slice(0, 5).join(',')}, hash=${guardrails.contentHash}`,
      );

      const details: GuardrailsViolationDetails = {
        outcome: 'blocked',
        reasonCodes,
        contentHash: guardrails.contentHash ?? '',
        rulesetVersion: guardrails.version,
        ...(forceDeficits && forceDeficits.length > 0 && { forceDeficits }),
      };
      return { ok: false, code: 'GUARDRAILS_VIOLATION', message, details };
    }

    return { ok: true, plan };
  } catch (error) {
    console.error(
      `[MealPlanner] vNext guard rails evaluation error: dietKey=${dietKey}, error=${error instanceof Error ? error.message : String(error)}`,
    );
    const details: GuardrailsViolationDetails = {
      outcome: 'blocked',
      reasonCodes: ['EVALUATOR_ERROR'],
      contentHash: '',
    };
    return {
      ok: false,
      code: 'GUARDRAILS_VIOLATION',
      message: 'Fout bij evalueren dieetregels',
      details,
    };
  }
}
