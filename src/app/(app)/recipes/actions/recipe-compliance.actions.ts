'use server';

import {
  loadGuardrailsRuleset,
  evaluateGuardrails,
} from '@/src/lib/guardrails-vnext';
import { mapMealToGuardrailsTargets } from '@/src/lib/guardrails-vnext/adapters/meal-to-targets';
import type {
  GuardDecision,
  EvaluationContext,
  GuardrailsRuleset,
} from '@/src/lib/guardrails-vnext/types';
import { getCurrentDietIdAction } from '../[recipeId]/actions/recipe-ai.persist.actions';
import {
  getNevoFoodNamesByCodesAction,
  getCustomFoodNamesByIdsAction,
} from '../[recipeId]/actions/ingredient-matching.actions';

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export type RecipeComplianceResult = {
  scorePercent: number;
  ok: boolean;
  dietId: string | null;
  /** True when the diet has no configured rules (fallback ruleset was used); UI should show "N.v.t." instead of a percentage. */
  noRulesConfigured?: boolean;
  /** Aantal atomen (ingrediënt of stap) met een blocking violation; handig voor UI-tekst zoals "1 item wijkt af". */
  violatingCount?: number;
};

const INGREDIENT_PATH_PREFIX = 'ingredientRefs[';
const INGREDIENT_PATH_PREFIX_LEGACY = 'ingredients[';

function isIngredientPath(path: string): boolean {
  return (
    path.startsWith(INGREDIENT_PATH_PREFIX) ||
    path.startsWith(INGREDIENT_PATH_PREFIX_LEGACY)
  );
}

/**
 * Compute compliance score 0–100 and violating count from guardrails decision.
 *
 * Score = alleen ingrediënten: round((compliantIngredients / totalIngredients) * 100).
 * Bereidingsstappen worden wel geëvalueerd (voor decision.ok en violations), maar
 * tellen niet mee in het percentage. Zo sluit 100% aan bij "geen ingrediënten om
 * te vervangen" / AI magician heeft geen verbeteringen.
 *
 * violatingCount = totaal aantal atomen (ingrediënt + stap) met een violation,
 * voor de tooltip ("X item(s) wijkt af").
 */
function complianceFromDecision(
  decision: GuardDecision,
  ingredientCount: number,
): { scorePercent: number; violatingCount: number } {
  if (ingredientCount === 0) {
    const violatingPaths = new Set(
      decision.matches
        .filter((m) => decision.appliedRuleIds.includes(m.ruleId))
        .map((m) => m.targetPath),
    );
    return { scorePercent: 100, violatingCount: violatingPaths.size };
  }
  const violatingPaths = new Set(
    decision.matches
      .filter((m) => decision.appliedRuleIds.includes(m.ruleId))
      .map((m) => m.targetPath),
  );
  const violatingIngredientPaths = new Set(
    [...violatingPaths].filter(isIngredientPath),
  );
  const compliantIngredients = Math.max(
    0,
    ingredientCount - violatingIngredientPaths.size,
  );
  const scorePercent = Math.round(
    (compliantIngredients / ingredientCount) * 100,
  );
  return { scorePercent, violatingCount: violatingPaths.size };
}

/**
 * Input item for batch compliance: id + meal payload (mealData or meal_data).
 */
export type RecipeComplianceInputItem = {
  id: string;
  source: 'custom' | 'gemini';
  mealData?: unknown;
  meal_data?: unknown;
};

type IngredientRefLike = {
  displayName?: string;
  display_name?: string;
  nevoCode?: string | number;
  nevo_code?: string | number;
  customFoodId?: string;
};

/** Collect nevoCodes and customFoodIds that need displayName for guardrails matching. */
function collectRefsMissingDisplayName(items: RecipeComplianceInputItem[]): {
  nevoCodes: (string | number)[];
  customFoodIds: string[];
} {
  const nevoCodes = new Set<string | number>();
  const customFoodIds = new Set<string>();
  for (const item of items) {
    const raw = (item.mealData ?? item.meal_data ?? null) as Record<
      string,
      unknown
    > | null;
    const refs = (raw?.ingredientRefs ?? raw?.ingredient_refs) as
      | IngredientRefLike[]
      | undefined;
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      if (ref == null || typeof ref !== 'object') continue;
      const hasName =
        (ref.displayName ?? ref.display_name ?? '').toString().trim() !== '';
      if (hasName) continue;
      if (ref.nevoCode != null || ref.nevo_code != null) {
        const c = ref.nevoCode ?? ref.nevo_code;
        if (c != null) nevoCodes.add(c);
      }
      if (
        typeof ref.customFoodId === 'string' &&
        ref.customFoodId.trim() !== ''
      ) {
        customFoodIds.add(ref.customFoodId.trim());
      }
    }
  }
  return {
    nevoCodes: [...nevoCodes],
    customFoodIds: [...customFoodIds],
  };
}

/**
 * Enrich meal payload: set displayName on refs that have nevoCode/customFoodId
 * but no displayName, using the provided name maps. Ensures guardrails evaluate
 * on ingredient names (e.g. "griekse yoghurt") instead of codes.
 */
function enrichMealPayloadWithDisplayNames(
  raw: Record<string, unknown> | null,
  nevoNamesByCode: Record<string, string>,
  customNamesById: Record<string, string>,
): Record<string, unknown> | null {
  if (!raw) return null;
  const refs = (raw.ingredientRefs ?? raw.ingredient_refs) as
    | IngredientRefLike[]
    | undefined;
  if (!Array.isArray(refs) || refs.length === 0) {
    return {
      ...raw,
      ingredientRefs: raw.ingredientRefs ?? raw.ingredient_refs,
      instructions: raw.instructions,
      name: raw.name ?? raw.meal_name,
      steps: raw.steps,
    };
  }
  const enrichedRefs = refs.map((ref) => {
    if (ref == null || typeof ref !== 'object') return ref;
    const hasName =
      (ref.displayName ?? ref.display_name ?? '').toString().trim() !== '';
    if (hasName) return ref;
    let name: string | undefined;
    if (ref.nevoCode != null || ref.nevo_code != null) {
      const c = String(ref.nevoCode ?? ref.nevo_code);
      name = nevoNamesByCode[c];
    }
    if (name == null && typeof ref.customFoodId === 'string')
      name = customNamesById[ref.customFoodId];
    if (name == null) return ref;
    return { ...ref, displayName: name };
  });
  return {
    ...raw,
    ingredientRefs: enrichedRefs,
    instructions: raw.instructions,
    name: raw.name ?? raw.meal_name,
    steps: raw.steps,
  };
}

/**
 * Get compliance scores for multiple recipes against the current user's diet.
 * Returns 0–100% per recipe; uses dieetregels (guardrails) for the active diet.
 * Enriches ingredientRefs with displayNames (from NEVO/custom_foods) when missing
 * so that compliance is evaluated on ingredient names (e.g. "griekse yoghurt").
 */
export async function getRecipeComplianceScoresAction(
  items: RecipeComplianceInputItem[],
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
      mode: 'recipe_adaptation',
      locale: 'nl',
    });
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'RULESET_LOAD_ERROR',
        message: err instanceof Error ? err.message : 'Regelset laden mislukt',
      },
    };
  }

  // Geen echte dieetregels geconfigureerd → score niet tonen (fallback-regelset)
  if (ruleset.provenance?.source === 'fallback') {
    const noRules: Record<string, RecipeComplianceResult> = {};
    items.forEach((i) => {
      noRules[i.id] = {
        scorePercent: 0,
        ok: true,
        dietId,
        noRulesConfigured: true,
      };
    });
    return { ok: true, data: noRules };
  }

  const context: EvaluationContext = {
    dietId,
    locale: 'nl',
    mode: 'recipe_adaptation',
    timestamp: new Date().toISOString(),
  };

  // Resolve displayNames for refs that only have nevoCode/customFoodId (so guardrails match on names)
  const { nevoCodes, customFoodIds } = collectRefsMissingDisplayName(items);
  const [nevoResult, customResult] = await Promise.all([
    nevoCodes.length > 0
      ? getNevoFoodNamesByCodesAction(nevoCodes)
      : Promise.resolve({
          ok: true as const,
          data: {} as Record<string, string>,
        }),
    customFoodIds.length > 0
      ? getCustomFoodNamesByIdsAction(customFoodIds)
      : Promise.resolve({
          ok: true as const,
          data: {} as Record<string, string>,
        }),
  ]);
  const nevoNamesByCode = nevoResult.ok ? nevoResult.data : {};
  const customNamesById = customResult.ok ? customResult.data : {};

  const scores: Record<string, RecipeComplianceResult> = {};

  for (const item of items) {
    const raw = (item.mealData ?? item.meal_data ?? null) as Record<
      string,
      unknown
    > | null;
    const mealPayload = enrichMealPayloadWithDisplayNames(
      raw,
      nevoNamesByCode,
      customNamesById,
    );
    const targets = mapMealToGuardrailsTargets(
      mealPayload as Parameters<typeof mapMealToGuardrailsTargets>[0],
      'nl',
    );
    const ingredientCount = targets.ingredient.length;

    if (ingredientCount === 0) {
      const decision: GuardDecision = evaluateGuardrails({
        ruleset,
        context,
        targets,
      });
      const violatingPaths = new Set(
        decision.matches
          .filter((m) => decision.appliedRuleIds.includes(m.ruleId))
          .map((m) => m.targetPath),
      );
      scores[item.id] = {
        scorePercent: 100,
        ok: decision.ok,
        dietId,
        violatingCount: violatingPaths.size,
      };
      continue;
    }

    const decision: GuardDecision = evaluateGuardrails({
      ruleset,
      context,
      targets,
    });

    const { scorePercent, violatingCount } = complianceFromDecision(
      decision,
      ingredientCount,
    );
    scores[item.id] = {
      scorePercent,
      ok: decision.ok,
      dietId,
      violatingCount,
    };
  }

  return { ok: true, data: scores };
}
