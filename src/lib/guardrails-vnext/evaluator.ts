/**
 * Guard Rails vNext - Evaluator
 * 
 * Pure, deterministic evaluator for guard rails rulesets.
 * 
 * @see docs/guardrails-vnext-semantics.md for evaluation semantics
 */

import type {
  GuardRule,
  GuardrailsRuleset,
  GuardDecision,
  GuardRuleMatch,
  DecisionTrace,
  GuardReasonCode,
  MatchTarget,
  MatchMode,
  TextAtom,
  GuardrailsEvaluateInput,
} from './types';
import { findMatches, matchTextAtom } from './matchers';

/**
 * Evaluator version (for trace reproducibility)
 */
const EVALUATOR_VERSION = '1.0.0';

/**
 * Get specificity score for a rule
 * 
 * user = 3, diet = 2, global = 1
 * If specificity is not set, default to diet (2)
 * 
 * @param rule - Guard rule
 * @returns Specificity score (1-3)
 */
function getSpecificity(rule: GuardRule): number {
  const specificity = rule.metadata.specificity;
  if (specificity === 'user') return 3;
  if (specificity === 'diet') return 2;
  if (specificity === 'global') return 1;
  // Default to diet if not specified
  return 2;
}

/**
 * Sort rules according to evaluation semantics
 * 
 * Sorting order:
 * 1. Priority DESC (higher = first)
 * 2. Specificity DESC (user > diet > global)
 * 3. RuleId lexicographic (stable tie-break)
 * 
 * @param rules - Rules to sort
 * @returns Sorted rules array
 */
export function sortRules(rules: GuardRule[]): GuardRule[] {
  return [...rules].sort((a, b) => {
    // Level 1: Priority
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // DESC
    }
    
    // Level 2: Specificity
    const specificityA = getSpecificity(a);
    const specificityB = getSpecificity(b);
    if (specificityA !== specificityB) {
      return specificityB - specificityA; // DESC
    }
    
    // Level 3: Stable tie-break (ruleId lexicographic)
    return a.id.localeCompare(b.id);
  });
}

/**
 * Validate rule configuration
 * 
 * Checks for config errors (e.g., substring mode on steps target).
 * 
 * @param rule - Rule to validate
 * @returns Error code if invalid, null if valid
 */
function validateRule(rule: GuardRule): GuardReasonCode | null {
  // Check: substring mode is not allowed for steps
  const preferredMode = rule.match.preferredMatchMode;
  if (preferredMode === 'substring' && rule.target === 'step') {
    return 'EVALUATOR_ERROR';
  }
  
  return null;
}

/**
 * Get match mode for rule
 * 
 * Determines which match mode to use, with fallback logic.
 * 
 * @param rule - Rule to get match mode for
 * @param targetType - Target type being matched
 * @returns Match mode to use
 */
function getMatchMode(rule: GuardRule, targetType: MatchTarget): MatchMode {
  const preferred = rule.match.preferredMatchMode;
  
  // If preferred mode is set and valid, use it
  if (preferred) {
    // Validate: substring not allowed for steps
    if (preferred === 'substring' && targetType === 'step') {
      // Config error - will be handled by validateRule
      return preferred; // Return anyway, error will be caught
    }
    return preferred;
  }
  
  // Default fallback logic
  if (targetType === 'metadata' && rule.match.canonicalId) {
    return 'canonical_id';
  }
  if (targetType === 'ingredient') {
    return 'word_boundary'; // Default for ingredients
  }
  if (targetType === 'step') {
    return 'word_boundary'; // Default for steps
  }
  
  return 'exact'; // Ultimate fallback
}

/**
 * Find matches for a rule against targets
 *
 * Block rules with target "ingredient" are also evaluated against step text,
 * so verboden ingrediënten (bv. paprika, nachtschade) in bereidingsinstructies
 * worden meegenomen in de compliance-analyse.
 *
 * @param rule - Rule to match
 * @param targets - All targets (ingredient, step, metadata)
 * @returns Array of matches found
 */
function findRuleMatches(
  rule: GuardRule,
  targets: { ingredient: TextAtom[]; step: TextAtom[]; metadata: TextAtom[] }
): GuardRuleMatch[] {
  const matches: GuardRuleMatch[] = [];
  const slots: { type: MatchTarget; atoms: TextAtom[] }[] = [];

  if (rule.action === 'block' && rule.target === 'ingredient') {
    if (targets.ingredient?.length) slots.push({ type: 'ingredient', atoms: targets.ingredient });
    if (targets.step?.length) slots.push({ type: 'step', atoms: targets.step });
  } else {
    const arr = targets[rule.target];
    if (arr?.length) slots.push({ type: rule.target, atoms: arr });
  }

  if (slots.length === 0) return matches;

  for (const { type, atoms } of slots) {
    const matchMode = getMatchMode(rule, type);

    const termMatches = findMatches(atoms, rule.match.term, matchMode);
    for (const { atom, matchedText } of termMatches) {
      const isDuplicate = matches.some(
        (m) => m.ruleId === rule.id && m.targetPath === atom.path
      );
      if (!isDuplicate) {
        matches.push({
          ruleId: rule.id,
          matchedText,
          targetPath: atom.path,
          matchMode,
          locale: atom.locale,
          ruleCode: rule.metadata.ruleCode,
          ruleLabel: rule.metadata.label,
        });
      }
    }

    if (rule.match.synonyms) {
      for (const synonym of rule.match.synonyms) {
        const synonymMatches = findMatches(atoms, synonym, matchMode);
        for (const { atom, matchedText } of synonymMatches) {
          const isDuplicate = matches.some(
            (m) => m.ruleId === rule.id && m.targetPath === atom.path
          );
          if (!isDuplicate) {
            matches.push({
              ruleId: rule.id,
              matchedText,
              targetPath: atom.path,
              matchMode,
              locale: atom.locale,
              ruleCode: rule.metadata.ruleCode,
              ruleLabel: rule.metadata.label,
            });
          }
        }
      }
    }

    if (rule.match.canonicalId && type === 'metadata') {
      for (const atom of atoms) {
        if (matchTextAtom(atom, rule.match.canonicalId, 'canonical_id')) {
          const isDuplicate = matches.some(
            (m) => m.ruleId === rule.id && m.targetPath === atom.path
          );
          if (!isDuplicate) {
            matches.push({
              ruleId: rule.id,
              matchedText: atom.canonicalId || rule.match.canonicalId,
              targetPath: atom.path,
              matchMode: 'canonical_id',
              locale: atom.locale,
              ruleCode: rule.metadata.ruleCode,
              ruleLabel: rule.metadata.label,
            });
          }
        }
      }
    }
  }

  return matches;
}

/**
 * Get reason code for a rule
 * 
 * Uses rule.metadata.ruleCode if available, otherwise falls back based on strictness/action.
 * 
 * @param rule - Rule to get reason code for
 * @returns Reason code
 */
function getReasonCode(rule: GuardRule): GuardReasonCode {
  // Use ruleCode from metadata if it's a valid GuardReasonCode
  const ruleCode = rule.metadata.ruleCode;
  const validReasonCodes: GuardReasonCode[] = [
    'FORBIDDEN_INGREDIENT',
    'ALLERGEN_PRESENT',
    'DISLIKED_INGREDIENT',
    'MISSING_REQUIRED_CATEGORY',
    'INVALID_CATEGORY',
    'INVALID_NEVO_CODE',
    'INVALID_CANONICAL_ID',
    'CALORIE_TARGET_MISS',
    'MACRO_TARGET_MISS',
    'MEAL_PREFERENCE_MISS',
    'MEAL_STRUCTURE_VIOLATION',
    'SOFT_CONSTRAINT_VIOLATION',
    'EVALUATOR_ERROR',
    'EVALUATOR_WARNING',
    'RULESET_LOAD_ERROR',
    'UNKNOWN_ERROR',
  ];
  
  if (validReasonCodes.includes(ruleCode as GuardReasonCode)) {
    return ruleCode as GuardReasonCode;
  }
  
  // Fallback based on strictness/action
  if (rule.strictness === 'soft') {
    return 'SOFT_CONSTRAINT_VIOLATION';
  }
  
  if (rule.action === 'block') {
    return 'FORBIDDEN_INGREDIENT';
  }
  
  return 'UNKNOWN_ERROR';
}

/**
 * Apply match to decision state
 * 
 * Updates decision state based on match and rule.
 * Handles config errors, allow/block logic, and strictness.
 * 
 * @param state - Current decision state
 * @param rule - Rule that matched
 * @param matches - Matches found for this rule
 * @returns Updated state
 */
function applyMatchToDecision(
  state: {
    hasHardBlock: boolean;
    hasSoftBlock: boolean;
    hasAllow: boolean;
    appliedRuleIds: string[];
    reasonCodes: GuardReasonCode[];
    configErrors: Array<{ ruleId: string; error: GuardReasonCode }>;
  },
  rule: GuardRule,
  matches: GuardRuleMatch[]
): typeof state {
  // Check for config errors first
  const configError = validateRule(rule);
  if (configError) {
    if (rule.strictness === 'hard') {
      // Hard config error → fail-closed
      state.configErrors.push({ ruleId: rule.id, error: 'EVALUATOR_ERROR' });
      state.hasHardBlock = true;
      state.appliedRuleIds.push(rule.id);
      state.reasonCodes.push('EVALUATOR_ERROR');
    } else {
      // Soft config error → warning (soft never blocks)
      state.configErrors.push({ ruleId: rule.id, error: 'EVALUATOR_WARNING' });
      state.hasSoftBlock = true; // Set hasSoftBlock so outcome becomes "warned"
      state.appliedRuleIds.push(rule.id);
      state.reasonCodes.push('EVALUATOR_WARNING');
    }
    return state;
  }
  
  // No matches, no effect
  if (matches.length === 0) {
    return state;
  }
  
  // Handle allow rules (tracking only, block can override)
  if (rule.action === 'allow') {
    state.hasAllow = true;
    // Allow rules don't change outcome, but are tracked in matches
    return state;
  }
  
  // Handle block rules
  if (rule.action === 'block') {
    const reasonCode = getReasonCode(rule);
    
    if (rule.strictness === 'hard') {
      // Hard block → blocks output
      state.hasHardBlock = true;
      state.appliedRuleIds.push(rule.id);
      state.reasonCodes.push(reasonCode);
    } else {
      // Soft block → warns only (never blocks)
      state.hasSoftBlock = true;
      state.appliedRuleIds.push(rule.id);
      state.reasonCodes.push(reasonCode);
    }
  }
  
  return state;
}

/**
 * Generate evaluation ID (deterministic)
 * 
 * @param context - Evaluation context
 * @returns Evaluation ID
 */
function generateEvaluationId(context: { timestamp: string; mode: string }): string {
  // Use timestamp + mode for deterministic ID generation
  // In production, could use UUID or hash
  return `eval-${context.timestamp}-${context.mode}`;
}

/**
 * Build summary text
 * 
 * @param state - Decision state
 * @param appliedRuleIds - Applied rule IDs (for counting)
 * @returns Human-readable summary
 */
function buildSummary(
  state: {
    hasHardBlock: boolean;
    hasSoftBlock: boolean;
    hasAllow: boolean;
    matches: GuardRuleMatch[];
    reasonCodes: GuardReasonCode[];
  },
  appliedRuleIds: string[]
): string {
  if (state.hasHardBlock) {
    const hardBlockCount = appliedRuleIds.length;
    return `Blocked: ${hardBlockCount} hard constraint violation(s) detected`;
  }
  
  if (state.hasSoftBlock) {
    const softBlockCount = appliedRuleIds.length;
    return `Warned: ${softBlockCount} soft constraint violation(s) detected`;
  }
  
  if (state.hasAllow && state.matches.length > 0) {
    return `Allowed: ${state.matches.length} allow rule(s) matched`;
  }
  
  return 'Allowed: No violations detected';
}

/**
 * Evaluate guard rails against content
 * 
 * Main entry point for guard rails evaluation.
 * Returns deterministic decision with full trace.
 * 
 * @param input - Evaluation input (ruleset, context, targets)
 * @returns Guard decision with full trace
 */
export function evaluateGuardrails(
  input: GuardrailsEvaluateInput
): GuardDecision {
  const { ruleset, context, targets } = input;
  
  // Sort rules according to semantics
  const sortedRules = sortRules(ruleset.rules);
  
  // Initialize decision state
  const state = {
    hasHardBlock: false,
    hasSoftBlock: false,
    hasAllow: false,
    appliedRuleIds: [] as string[],
    reasonCodes: [] as GuardReasonCode[],
    configErrors: [] as Array<{ ruleId: string; error: GuardReasonCode }>,
    matches: [] as GuardRuleMatch[],
  };
  
  // Initialize trace
  const evaluationId = generateEvaluationId(context);
  const trace: DecisionTrace = {
    evaluationId,
    timestamp: context.timestamp,
    context,
    rulesetVersion: ruleset.version,
    rulesetHash: ruleset.contentHash,
    evaluatorVersion: EVALUATOR_VERSION,
    evaluationSteps: [],
    finalOutcome: 'allowed',
    appliedRuleIds: [],
    reasonCodes: [],
  };
  
  // Evaluate each rule
  for (let step = 0; step < sortedRules.length; step++) {
    const rule = sortedRules[step];
    
    // Find matches for this rule
    const matches = findRuleMatches(rule, targets);
    const matchFound = matches.length > 0;
    
    // Apply match to decision state
    const previousState = { ...state };
    applyMatchToDecision(state, rule, matches);
    const applied = state.appliedRuleIds.length > previousState.appliedRuleIds.length ||
                    state.reasonCodes.length > previousState.reasonCodes.length;
    
    // Add matches to state
    state.matches.push(...matches);
    
    // Add to trace
    trace.evaluationSteps.push({
      step: step + 1,
      ruleId: rule.id,
      matchFound,
      matchDetails: matches.length > 0 ? matches[0] : undefined,
      applied,
    });
  }
  
  // Determine final outcome
  let outcome: 'allowed' | 'blocked' | 'warned';
  let ok: boolean;
  
  if (state.hasHardBlock) {
    outcome = 'blocked';
    ok = false;
  } else if (state.hasSoftBlock) {
    outcome = 'warned';
    ok = true; // Soft never blocks
  } else {
    outcome = 'allowed';
    ok = true;
  }
  
  trace.finalOutcome = outcome;
  trace.appliedRuleIds = [...state.appliedRuleIds];
  trace.reasonCodes = [...new Set(state.reasonCodes)]; // Deduplicate
  
  // Build summary
  const summary = buildSummary(state, state.appliedRuleIds);
  
  // Collect remediation hints from applied rules
  const remediationHints = state.appliedRuleIds
    .map((ruleId) => {
      const rule = sortedRules.find((r) => r.id === ruleId);
      return rule?.remediation || [];
    })
    .flat();
  
  // Build decision
  const decision: GuardDecision = {
    ok,
    outcome,
    matches: state.matches,
    appliedRuleIds: state.appliedRuleIds,
    summary,
    reasonCodes: [...new Set(state.reasonCodes)], // Deduplicate
    remediationHints,
    trace,
  };
  
  return decision;
}
