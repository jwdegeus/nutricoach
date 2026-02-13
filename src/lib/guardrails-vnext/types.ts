/**
 * Guard Rails vNext - Type Definitions
 *
 * Unified type definitions for guard rails system.
 *
 * @see docs/guard-rails-rebuild-plan.md for glossary and naming conventions
 * @see docs/guardrails-vnext-semantics.md for evaluation semantics
 */

/**
 * Rule Action - Firewall semantics
 *
 * - "allow": Explicitly allow ingredient (tracking only, block can override)
 * - "block": Block ingredient (has priority over allow)
 */
export type RuleAction = 'allow' | 'block';

/**
 * Strictness - Effect on outcome
 *
 * - "hard": Block output if violation detected (fail-closed)
 * - "soft": Warn only, never blocks output
 */
export type Strictness = 'hard' | 'soft';

/**
 * Match Target - Where rule applies
 *
 * - "ingredient": Match on ingredient name, displayName, note, tags
 * - "step": Match on recipe step text
 * - "metadata": Match on metadata fields (tags, categories, NEVO codes)
 */
export type MatchTarget = 'ingredient' | 'step' | 'metadata';

/**
 * Match Mode - How to match text
 *
 * - "exact": Case-insensitive exact match
 * - "word_boundary": Regex word boundary match (prevents false positives)
 * - "substring": Substring match (only for ingredients, fallback)
 * - "canonical_id": Exact match on canonical identifier (e.g., NEVO code)
 */
export type MatchMode =
  | 'exact'
  | 'word_boundary'
  | 'substring'
  | 'canonical_id';

/**
 * Evaluation Mode - Which flow is evaluating
 */
export type EvaluationMode = 'recipe_adaptation' | 'meal_planner' | 'plan_chat';

/**
 * Locale - Language for matching and messages
 */
export type Locale = 'nl' | 'en';

/**
 * Rule Status - Lifecycle state of a rule
 *
 * Determined from database fields:
 * - "active": is_active === true (rule is enforced)
 * - "paused": is_active === true && strictness === 'soft' (temporary: soft warnings only)
 *   Note: Currently "paused" is not a distinct DB state, but represented as soft strictness.
 *   Future: may add explicit paused_at timestamp or status column.
 * - "deleted": is_active === false (rule is excluded from ruleset)
 */
export type RuleStatus = 'active' | 'paused' | 'deleted';

/**
 * Guard Rule - Individual guard rail rule
 *
 * @see docs/guardrails-vnext-semantics.md section 2.1
 */
export type GuardRule = {
  /** Unique identifier (stable, for audit trail) */
  id: string;

  /** Firewall action: allow or block */
  action: RuleAction;

  /** Strictness: hard blocks, soft warns only */
  strictness: Strictness;

  /** Priority (0-100, higher = more important, for conflict resolution) */
  priority: number;

  /** Where rule applies */
  target: MatchTarget;

  /** Matching criteria */
  match: {
    /** Primary term to match (lowercase, canonicalized) */
    term: string;
    /** Synonyms for matching (lowercase, canonicalized) */
    synonyms?: string[];
    /** Canonical ID (e.g., NEVO code, category code) */
    canonicalId?: string;
    /** Preferred match mode (evaluator may fallback) */
    preferredMatchMode?: MatchMode;
  };

  /** Metadata */
  metadata: {
    /** Rule code (e.g., "GUARD_RAIL_HARD", "FORBIDDEN_INGREDIENT") */
    ruleCode: string;
    /** Human-readable label */
    label: string;
    /** Category (e.g., "gluten_containing_grains", "dairy") */
    category?: string;
    /** Source specificity: "user" | "diet" | "global" */
    specificity?: 'user' | 'diet' | 'global';
    /**
     * Semantics note for allow rules: indicates this is a non-enforcing allow rule.
     * Allow rules are traceable but do not override block rules (BLOCK always wins).
     * This is engine-first metadata, not a UI string.
     */
    isNonEnforcingAllow?: boolean;
  };

  /** Optional remediation suggestions */
  remediation?: RemediationHint[];
};

/**
 * Guard Rule Match - Detection of a rule match in content
 *
 * @see docs/guardrails-vnext-semantics.md section 4
 */
export type GuardRuleMatch = {
  /** Rule ID that matched */
  ruleId: string;

  /** Actual text that matched */
  matchedText: string;

  /** Path to matched content (e.g., "ingredients[0].name", "steps[2].text") */
  targetPath: string;

  /** Match confidence (0-1, optional, for future ML-based matching) */
  confidence?: number;

  /** Match mode used */
  matchMode: MatchMode;

  /** Locale of matched text */
  locale?: Locale;

  /** Rule metadata (for convenience) */
  ruleCode?: string;
  ruleLabel?: string;
};

/**
 * Remediation Hint - Suggestion for resolving violations
 *
 * @see docs/guardrails-vnext-semantics.md section 5
 */
export type RemediationHint = {
  /** Type of remediation */
  type: 'substitute' | 'remove' | 'add_required' | 'reduce';

  /** Payload (typed per type) */
  payload:
    | { original: string; alternatives: string[] } // substitute
    | { ingredient: string; reason: string } // remove
    | { category: string; minAmount: number; suggestions: string[] } // add_required
    | { ingredient: string; currentAmount: number; suggestedAmount: number }; // reduce

  /** Human-readable text for LLM prompts */
  promptText: string;
};

/**
 * Guard Decision - Result of guard rails evaluation
 *
 * @see docs/guardrails-vnext-semantics.md section 2.4
 */
export type GuardDecision = {
  /** True if no hard constraint violations */
  ok: boolean;

  /** Final outcome */
  outcome: 'allowed' | 'blocked' | 'warned';

  /** All matches found (may include soft constraint matches) */
  matches: GuardRuleMatch[];

  /** Rule IDs that had effect on outcome */
  appliedRuleIds: string[];

  /** Human-readable summary */
  summary: string;

  /** Reason codes (for categorization) */
  reasonCodes: GuardReasonCode[];

  /** Remediation hints (for AI/UI) */
  remediationHints: RemediationHint[];

  /** Full decision trace (for audit) */
  trace: DecisionTrace;
};

/**
 * Decision Trace - Complete audit trail of evaluation
 *
 * @see docs/guardrails-vnext-semantics.md section 3.5
 */
export type DecisionTrace = {
  /** Unique ID for this evaluation */
  evaluationId: string;

  /** ISO timestamp */
  timestamp: string;

  /** Full context snapshot */
  context: EvaluationContext;

  /** Ruleset version used */
  rulesetVersion: number;

  /** Content hash of ruleset */
  rulesetHash: string;

  /** Evaluator version (for reproducibility) */
  evaluatorVersion: string;

  /** Evaluation steps (all rules evaluated) */
  evaluationSteps: Array<{
    /** Step number */
    step: number;
    /** Rule ID evaluated */
    ruleId: string;
    /** Whether match was found */
    matchFound: boolean;
    /** Match details (if found) */
    matchDetails?: GuardRuleMatch;
    /** Whether rule had effect on outcome */
    applied: boolean;
  }>;

  /** Final outcome */
  finalOutcome: 'allowed' | 'blocked' | 'warned';

  /** All rule IDs that had effect */
  appliedRuleIds: string[];

  /** All reason codes */
  reasonCodes: GuardReasonCode[];
};

/**
 * Guardrails Ruleset - Unified ruleset format
 *
 * @see docs/guardrails-vnext-semantics.md section 2.2
 */
export type GuardrailsRuleset = {
  /** Diet identifier (UUID or DietKey) */
  dietId?: string;
  dietKey?: string;

  /** Version number (for audit trail) */
  version: number;

  /** Rules (sorted according to evaluation semantics) */
  rules: GuardRule[];

  /** Optional heuristics (e.g., added sugar detection) */
  heuristics?: {
    addedSugarTerms?: string[];
    [key: string]: unknown; // Forward-compatible
  };

  /** Provenance metadata */
  provenance: {
    /** Source: "database" | "derived" | "fallback" */
    source: 'database' | 'derived' | 'fallback';
    /** Timestamp when ruleset was loaded */
    loadedAt: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
  };

  /** Content hash (SHA-256 of serialized ruleset) */
  contentHash: string;
};

/**
 * Evaluation Context - Input for evaluation
 *
 * @see docs/guardrails-vnext-semantics.md section 2.3
 */
export type EvaluationContext = {
  /** Diet identifier */
  dietId?: string;
  dietKey?: string;

  /** Locale for matching and messages */
  locale: Locale;

  /** User-specific constraints */
  userConstraints?: {
    /** User allergies (hard constraints) */
    allergies?: string[];
    /** User dislikes (soft constraints) */
    dislikes?: string[];
    /** Additional user-specific rules */
    customRules?: GuardRule[];
  };

  /** Evaluation mode */
  mode: EvaluationMode;

  /** Timestamp when evaluation occurred */
  timestamp: string;

  /**
   * False-positive uitsluitingen uit magician_validator_overrides (admin).
   * Key = verboden term (aardappel, potato), value = patronen; als atom.text een patroon bevat, geen match.
   */
  excludeOverrides?: Record<string, string[]>;
};

/**
 * Guard Reason Code - Stable reason codes for violations
 *
 * @see docs/guardrails-vnext-semantics.md section 6.2
 */
export type GuardReasonCode =
  // Ingredient violations
  | 'FORBIDDEN_INGREDIENT'
  | 'ALLERGEN_PRESENT'
  | 'DISLIKED_INGREDIENT'
  // Category violations
  | 'MISSING_REQUIRED_CATEGORY'
  | 'INVALID_CATEGORY'
  // NEVO/Canonical violations
  | 'INVALID_NEVO_CODE'
  | 'INVALID_CANONICAL_ID'
  // Macro/Calorie violations
  | 'CALORIE_TARGET_MISS'
  | 'MACRO_TARGET_MISS'
  // Meal structure violations
  | 'MEAL_PREFERENCE_MISS'
  | 'MEAL_STRUCTURE_VIOLATION'
  // Soft constraints
  | 'SOFT_CONSTRAINT_VIOLATION'
  // Errors
  | 'EVALUATOR_ERROR'
  | 'EVALUATOR_WARNING'
  | 'RULESET_LOAD_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Evaluation Result - Return type for evaluateGuardrails()
 *
 * This is the main contract for guard rails evaluation.
 */
export type EvaluationResult = GuardDecision;

/**
 * Ruleset Load Result - Return type for loadGuardrailsRuleset()
 */
export type RulesetLoadResult = {
  ruleset: GuardrailsRuleset;
  errors?: string[]; // Warnings/errors during loading
};

/**
 * Constraint Compilation Result - Return type for compileConstraintsForAI()
 *
 * Formatted constraints for LLM prompts.
 */
export type ConstraintCompilationResult = {
  /** Text format for LLM prompts */
  promptText: string;
  /** Structured format (optional, for advanced use cases) */
  structured?: {
    forbidden: string[];
    allowed: string[];
    required: string[];
    soft: string[];
  };
};

/**
 * Text Atom - Normalized text input for evaluation
 *
 * Represents a single piece of text to evaluate (ingredient name, step text, metadata).
 */
export type TextAtom = {
  /** Text content (normalized, lowercase) */
  text: string;
  /** Stable path for UI/audit (e.g., "ingredients[2].name", "steps[0].text") */
  path: string;
  /** Optional canonical ID (for canonical_id matching mode) */
  canonicalId?: string;
  /** Optional locale of the text */
  locale?: Locale;
};

/**
 * Guardrails Evaluate Input - Input for evaluateGuardrails()
 */
export type GuardrailsEvaluateInput = {
  /** Guard rails ruleset */
  ruleset: GuardrailsRuleset;
  /** Evaluation context */
  context: EvaluationContext;
  /** Targets to evaluate */
  targets: {
    /** Ingredient targets */
    ingredient: TextAtom[];
    /** Step targets */
    step: TextAtom[];
    /** Metadata targets */
    metadata: TextAtom[];
  };
};
