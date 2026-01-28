/**
 * Diet Logic (Dieetregels)
 *
 * Bepaalt per ingredientgroep: DROP (blokkeren), FORCE (verplicht),
 * LIMIT (beperkt), PASS (toegestaan). Zie docs/diet-logic-plan.md.
 */

export type {
  DietLogic,
  DietLogicConstraint,
  DietLogicRuleset,
  DietLogicIngredient,
  DietLogicContext,
  DietLogicTargets,
  DietLogicPhaseResult,
  DietLogicEvaluationResult,
} from "./types";

export {
  DIET_LOGIC_PRIORITY,
  DIET_LOGIC_LABELS,
} from "./types";

export {
  loadDietLogicRuleset,
  loadDietLogicRulesetForUser,
  type LoadDietLogicOptions,
} from "./loader";
export { evaluateDietLogic } from "./evaluator";
