/**
 * Guard Rails vNext - Public API
 *
 * Unified guard rails implementation for all flows (recipe adaptation, meal planner, plan chat).
 *
 * This module will replace the current distributed guard rails logic with a unified,
 * deterministic, and testable implementation.
 *
 * @see docs/guard-rails-rebuild-plan.md for migration plan
 * @see docs/guardrails-vnext-semantics.md for evaluation semantics
 */

// Type exports
export type {
  RuleAction,
  Strictness,
  MatchTarget,
  MatchMode,
  EvaluationMode,
  Locale,
  GuardRule,
  GuardRuleMatch,
  RemediationHint,
  GuardDecision,
  DecisionTrace,
  GuardrailsRuleset,
  EvaluationContext,
  GuardReasonCode,
  EvaluationResult,
  RulesetLoadResult,
  ConstraintCompilationResult,
  RuleStatus,
} from './types';

// Import types for function signatures
import type {
  GuardrailsRuleset,
  EvaluationContext,
  EvaluationResult,
  RulesetLoadResult,
  ConstraintCompilationResult,
  GuardrailsEvaluateInput,
} from './types';

// Export evaluator
export { evaluateGuardrails, sortRules } from './evaluator';

// Re-export input types
export type { GuardrailsEvaluateInput, TextAtom } from './types';

// Export loader
export {
  loadGuardrailsRuleset,
  loadRulesetWithDietLogic,
} from './ruleset-loader';
export type {
  LoadGuardrailsRulesetInput,
  LoadRulesetWithDietLogicInput,
  LoadRulesetWithDietLogicResult,
  GuardrailsRepo,
} from './ruleset-loader';

/**
 * Compile constraints for AI prompts
 *
 * Formats guard rails ruleset as text for LLM prompts.
 * Includes forbidden ingredients, allowed ingredients, required categories,
 * and remediation hints.
 *
 * @param ruleset - Guard rails ruleset
 * @param context - Evaluation context (for locale-specific formatting)
 * @returns Formatted constraints for LLM prompts
 *
 * @example
 * ```typescript
 * const { promptText } = await compileConstraintsForAI(ruleset, context);
 * const fullPrompt = `${basePrompt}\n\nGUARDRAILS:\n${promptText}`;
 * ```
 *
 * @see docs/guardrails-vnext-semantics.md section 5.2 for remediation contract
 *
 * TODO: Implement in prompt-compiler.ts (or validator.ts)
 */
export async function compileConstraintsForAI(
  ruleset: GuardrailsRuleset,
  context: EvaluationContext,
): Promise<ConstraintCompilationResult> {
  throw new Error('Not implemented yet - see prompt-compiler.ts');
}
