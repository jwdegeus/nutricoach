"use server";

import { loadGuardrailsRuleset, evaluateGuardrails } from "@/src/lib/guardrails-vnext";
import { mapMealToGuardrailsTargets } from "@/src/lib/guardrails-vnext/adapters/meal-to-targets";
import type { GuardDecision, EvaluationContext, GuardrailsRuleset } from "@/src/lib/guardrails-vnext/types";
import { getCurrentDietIdAction } from "../[recipeId]/actions/recipe-ai.persist.actions";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export type RecipeComplianceResult = {
  scorePercent: number;
  ok: boolean;
  dietId: string | null;
  /** True when the diet has no configured rules (fallback ruleset was used); UI should show "N.v.t." instead of a percentage. */
  noRulesConfigured?: boolean;
};

/**
 * Compute compliance score 0–100 from guardrails decision and target counts.
 * Score = share of evaluated atoms (ingredients + steps) that have no blocking violation.
 */
function complianceScoreFromDecision(
  decision: GuardDecision,
  totalAtoms: number
): number {
  if (totalAtoms === 0) return 100;
  const violatingPaths = new Set(
    decision.matches
      .filter((m) => decision.appliedRuleIds.includes(m.ruleId))
      .map((m) => m.targetPath)
  );
  const compliantCount = Math.max(0, totalAtoms - violatingPaths.size);
  return Math.round((compliantCount / totalAtoms) * 100);
}

/**
 * Input item for batch compliance: id + meal payload (mealData or meal_data).
 */
export type RecipeComplianceInputItem = {
  id: string;
  source: "custom" | "gemini";
  mealData?: unknown;
  meal_data?: unknown;
};

/**
 * Get compliance scores for multiple recipes against the current user's diet.
 * Returns 0–100% per recipe; uses dieetregels (guardrails) for the active diet.
 */
export async function getRecipeComplianceScoresAction(
  items: RecipeComplianceInputItem[]
): Promise<ActionResult<Record<string, RecipeComplianceResult>>> {
  const dietResult = await getCurrentDietIdAction();
  if (!dietResult.ok) {
    return { ok: false, error: dietResult.error };
  }
  const diet = dietResult.data;
  const dietId = diet?.dietId ?? null;

  if (!dietId) {
    const empty: Record<string, RecipeComplianceResult> = {};
    items.forEach((i) => {
      empty[i.id] = { scorePercent: 100, ok: true, dietId: null };
    });
    return { ok: true, data: empty };
  }

  let ruleset: GuardrailsRuleset;
  try {
    ruleset = await loadGuardrailsRuleset({
      dietId,
      mode: "recipe_adaptation",
      locale: "nl",
    });
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "RULESET_LOAD_ERROR",
        message: err instanceof Error ? err.message : "Regelset laden mislukt",
      },
    };
  }

  // Geen echte dieetregels geconfigureerd → score niet tonen (fallback-regelset)
  if (ruleset.provenance?.source === "fallback") {
    const noRules: Record<string, RecipeComplianceResult> = {};
    items.forEach((i) => {
      noRules[i.id] = { scorePercent: 0, ok: true, dietId, noRulesConfigured: true };
    });
    return { ok: true, data: noRules };
  }

  const context: EvaluationContext = {
    dietId,
    locale: "nl",
    mode: "recipe_adaptation",
    timestamp: new Date().toISOString(),
  };

  const scores: Record<string, RecipeComplianceResult> = {};

  for (const item of items) {
    const mealPayload = item.mealData ?? item.meal_data ?? null;
    const targets = mapMealToGuardrailsTargets(
      mealPayload as Parameters<typeof mapMealToGuardrailsTargets>[0],
      "nl"
    );
    const totalAtoms =
      targets.ingredient.length + targets.step.length;

    if (totalAtoms === 0) {
      scores[item.id] = { scorePercent: 100, ok: true, dietId };
      continue;
    }

    const decision: GuardDecision = evaluateGuardrails({
      ruleset,
      context,
      targets,
    });

    const scorePercent = complianceScoreFromDecision(decision, totalAtoms);
    scores[item.id] = {
      scorePercent,
      ok: decision.ok,
      dietId,
    };
  }

  return { ok: true, data: scores };
}
