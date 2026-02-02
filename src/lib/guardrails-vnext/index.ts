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
  ConstraintCompilationResult,
  GuardRule,
  MatchTarget,
  MatchMode,
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

const TARGET_ORDER: MatchTarget[] = ['ingredient', 'step', 'metadata'];
const MAX_LINES = 40;
const MAX_SYNONYMS_PER_LINE = 3;

function matchModeLabel(mode: MatchMode): string {
  switch (mode) {
    case 'substring':
      return '[substring]';
    case 'word_boundary':
      return '[word]';
    case 'exact':
      return '[exact]';
    case 'canonical_id':
      return '[id]';
    default:
      return '[word]';
  }
}

function strictnessLabel(
  strictness: 'hard' | 'soft',
  locale: 'nl' | 'en',
): string {
  if (strictness === 'hard') {
    return locale === 'nl' ? 'VERBODEN (HARD)' : 'FORBIDDEN (HARD)';
  }
  return locale === 'nl' ? 'VERMIJD (SOFT)' : 'AVOID (SOFT)';
}

function termDisplay(rule: GuardRule): string {
  const { match } = rule;
  if (match.canonicalId) {
    return match.canonicalId;
  }
  const syns = (match.synonyms ?? []).slice(0, MAX_SYNONYMS_PER_LINE);
  if (syns.length === 0) {
    return match.term;
  }
  return `${match.term} (${syns.join(', ')})`;
}

/**
 * Pure compilation: ruleset + locale → constraint text.
 * Only block rules; grouped by target (ingredient first); sorted by priority DESC, then term/canonicalId ASC.
 */
function compileConstraintsText(
  ruleset: GuardrailsRuleset,
  locale: 'nl' | 'en',
): string {
  const blockRules = ruleset.rules.filter(
    (r): r is GuardRule => r.action === 'block',
  );
  const byTarget = new Map<MatchTarget, GuardRule[]>();
  for (const t of TARGET_ORDER) {
    byTarget.set(t, []);
  }
  for (const r of blockRules) {
    const list = byTarget.get(r.target);
    if (list) list.push(r);
  }
  const lines: string[] = [];
  for (const target of TARGET_ORDER) {
    const rules = byTarget.get(target)!;
    if (rules.length === 0) continue;
    rules.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      const termA = a.match.canonicalId ?? a.match.term;
      const termB = b.match.canonicalId ?? b.match.term;
      return termA.localeCompare(termB, 'en');
    });
    const targetLabel =
      target === 'ingredient'
        ? 'Ingredient'
        : target === 'step'
          ? 'Step'
          : 'Metadata';
    lines.push(`--- ${targetLabel} (block) ---`);
    for (const r of rules) {
      const mode = r.match.preferredMatchMode ?? 'word_boundary';
      const term = termDisplay(r);
      const label = strictnessLabel(r.strictness, locale);
      lines.push(`${term} ${matchModeLabel(mode)} — ${label}`);
    }
  }
  const result = lines.slice(0, MAX_LINES).join('\n');
  return result;
}

/**
 * Compile constraints for AI prompts
 *
 * Formats guard rails ruleset as text for LLM prompts.
 * Block rules only; grouped by target (ingredient, step, metadata); sorted by priority then term.
 * Output is deterministic and compact (max ~40 lines).
 *
 * @param ruleset - Guard rails ruleset
 * @param context - Evaluation context (locale used for labels; default 'nl')
 * @returns Formatted constraints for LLM prompts
 *
 * @example
 * ```typescript
 * const { promptText } = await compileConstraintsForAI(ruleset, context);
 * const fullPrompt = `${basePrompt}\n\nGUARDRAILS:\n${promptText}`;
 * ```
 */
export async function compileConstraintsForAI(
  ruleset: GuardrailsRuleset,
  context: EvaluationContext,
): Promise<ConstraintCompilationResult> {
  const locale = context?.locale ?? 'nl';
  const promptText = compileConstraintsText(ruleset, locale);
  return Promise.resolve({ promptText });
}
