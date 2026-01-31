/**
 * Guard Rails vNext - Ruleset Loader
 *
 * Loads GuardrailsRuleset from database and code overlays.
 * Optionally loads Diet Logic (Dieetregels) for 4-phase evaluation (DROP/FORCE/LIMIT/PASS).
 *
 * @see docs/guardrails-vnext-semantics.md for evaluation semantics
 * @see docs/diet-logic-plan.md for Diet Logic
 */

import type {
  GuardrailsRuleset,
  GuardRule,
  EvaluationMode,
  Locale,
  GuardReasonCode,
  RuleStatus,
} from './types';
import { hashContent } from './hash';
import {
  loadDietLogicRuleset,
  loadDietLogicRulesetForUser,
} from '@/src/lib/diet-logic';
import type { DietLogicRuleset } from '@/src/lib/diet-logic';

/**
 * Repository interface for database access (mockable for tests)
 */
export interface GuardrailsRepo {
  /**
   * Load diet category constraints with related data
   */
  loadConstraints(dietId: string): Promise<{
    constraints: Array<{
      id: string;
      diet_type_id: string;
      rule_action?: 'allow' | 'block';
      constraint_type?: 'forbidden' | 'required';
      strictness: 'hard' | 'soft';
      rule_priority: number;
      priority: number;
      updated_at: string;
      is_active?: boolean;
      category: {
        id: string;
        code: string;
        name_nl: string;
        category_type: 'forbidden' | 'required';
        items: Array<{
          term: string;
          term_nl?: string;
          synonyms: string[];
          is_active: boolean;
        }>;
      };
    }>;
    errors?: string[];
  }>;

  /**
   * Load recipe adaptation rules (legacy)
   */
  loadRecipeAdaptationRules(dietId: string): Promise<{
    rules: Array<{
      id: string;
      diet_type_id: string;
      term: string;
      synonyms: string[];
      rule_code: string;
      rule_label: string;
      substitution_suggestions: string[];
      priority: number;
      target: 'ingredient' | 'step' | 'metadata';
      match_mode: 'exact' | 'word_boundary' | 'substring' | 'canonical_id';
      updated_at: string;
      is_active?: boolean;
    }>;
    errors?: string[];
  }>;

  /**
   * Load recipe adaptation heuristics
   */
  loadHeuristics(dietId: string): Promise<{
    heuristics: Array<{
      id: string;
      diet_type_id: string;
      heuristic_type: string;
      terms: string[];
      updated_at: string;
    }>;
    errors?: string[];
  }>;
}

/**
 * Input for loadGuardrailsRuleset
 */
export type LoadGuardrailsRulesetInput = {
  /** Diet identifier (UUID from diet_types table) */
  dietId: string;
  /** Evaluation mode */
  mode: EvaluationMode;
  /** Locale for matching */
  locale?: Locale;
  /** Optional timestamp for deterministic tests */
  now?: string;
  /** Optional repository (for testing) */
  repo?: GuardrailsRepo;
};

/**
 * Input for loadRulesetWithDietLogic
 *
 * Extends guardrails input with optional user context for Diet Logic (Dieetregels).
 * When userId is set, diet_logic is loaded from user_diet_profiles (diet_type_id + is_inflamed).
 * Otherwise diet_logic uses dietId and optional isInflamed.
 */
export type LoadRulesetWithDietLogicInput = LoadGuardrailsRulesetInput & {
  /** User ID: when set, diet_logic is loaded via user_diet_profiles (diet_type_id, is_inflamed) */
  userId?: string;
  /** When set (and no userId): nightshade-categorie wordt aan DROP toegevoegd bij diet_logic */
  isInflamed?: boolean;
};

/**
 * Result of loadRulesetWithDietLogic
 *
 * Combines GuardrailsRuleset (allow/block) with DietLogicRuleset (DROP/FORCE/LIMIT/PASS).
 * Use guardrails for evaluateGuardrails(); use dietLogic for evaluateDietLogic() when you need
 * 4-phase validation (DROP → FORCE-quotum → LIMIT → PASS).
 */
export type LoadRulesetWithDietLogicResult = {
  guardrails: GuardrailsRuleset;
  dietLogic: DietLogicRuleset | null;
};

/**
 * Provenance source entry
 */
type ProvenanceSource = {
  kind: 'db' | 'overlay' | 'fallback';
  ref: string;
  loadedAt: string;
  details?: Record<string, unknown>;
};

/**
 * Generate stable rule ID from database constraint
 *
 * Format: `db:diet_category_constraints:<id>`
 */
function generateRuleId(source: string, id: string): string {
  return `${source}:${id}`;
}

/**
 * Determine rule status from database fields
 *
 * @param isActive - is_active field from database
 * @param strictness - strictness field (for paused detection)
 * @returns Rule status
 */
function determineRuleStatus(
  isActive: boolean,
  _strictness: 'hard' | 'soft',
): RuleStatus {
  if (!isActive) {
    return 'deleted';
  }
  // Note: Currently "paused" is not a distinct DB state.
  // It's represented as soft strictness, but we treat it as active for now.
  // Future: may add explicit paused_at timestamp or status column.
  return 'active';
}

/**
 * Check if rule should be included in ruleset based on status
 *
 * @param status - Rule status
 * @returns true if rule should be included
 */
function shouldIncludeRule(status: RuleStatus): boolean {
  // Only active rules are included
  // Paused rules are currently treated as active (soft strictness)
  // Deleted rules are excluded
  return status === 'active';
}

/**
 * Map database constraint to GuardRule
 *
 * @param constraint - Database constraint
 * @param itemIndex - Index of item in category (for unique IDs)
 * @returns GuardRule
 */
function mapConstraintToRule(
  constraint: {
    id: string;
    rule_action?: 'allow' | 'block';
    strictness: 'hard' | 'soft';
    rule_priority: number;
    category: {
      code: string;
      name_nl: string;
      category_type: 'forbidden' | 'required';
      items: Array<{
        term: string;
        synonyms: string[];
      }>;
    };
  },
  itemIndex: number,
): GuardRule {
  const ruleAction: 'allow' | 'block' =
    constraint.rule_action ||
    (constraint.category.category_type === 'forbidden' ? 'block' : 'allow');

  const item = constraint.category.items[itemIndex];
  const term = item.term.toLowerCase();
  const synonyms = (item.synonyms || []).map((s) => s.toLowerCase());

  // Map rule code based on category and strictness
  let ruleCode: GuardReasonCode = 'FORBIDDEN_INGREDIENT';
  if (constraint.category.category_type === 'required') {
    ruleCode = 'MISSING_REQUIRED_CATEGORY';
  } else if (ruleAction === 'allow') {
    // Allow rules don't have a specific reason code, use fallback
    ruleCode =
      constraint.strictness === 'hard'
        ? 'FORBIDDEN_INGREDIENT'
        : 'SOFT_CONSTRAINT_VIOLATION';
  } else {
    ruleCode =
      constraint.strictness === 'hard'
        ? 'FORBIDDEN_INGREDIENT'
        : 'SOFT_CONSTRAINT_VIOLATION';
  }

  // Mark allow rules as non-enforcing (BLOCK always wins in evaluator)
  const isNonEnforcingAllow = ruleAction === 'allow';

  return {
    id: generateRuleId(
      'db:diet_category_constraints',
      `${constraint.id}:${itemIndex}`,
    ),
    action: ruleAction,
    strictness: constraint.strictness || 'hard', // Default to hard if not specified
    priority: constraint.rule_priority || 50, // Default to 50 if not specified
    target: 'ingredient', // Category constraints apply to ingredients
    match: {
      term,
      synonyms: synonyms.length > 0 ? synonyms : undefined,
    },
    metadata: {
      ruleCode,
      label:
        ruleAction === 'allow'
          ? `${constraint.category.name_nl} (Toegestaan)`
          : `${constraint.category.name_nl} (${constraint.strictness === 'hard' ? 'Strikt verboden' : 'Niet gewenst'})`,
      category: constraint.category.code,
      specificity: 'diet', // Database rules are diet-level
      isNonEnforcingAllow,
    },
  };
}

/**
 * Map recipe adaptation rule to GuardRule
 *
 * @param rule - Database recipe adaptation rule
 * @returns GuardRule
 */
function mapRecipeAdaptationRuleToRule(rule: {
  id: string;
  term: string;
  synonyms: string[];
  rule_code: string;
  rule_label: string;
  substitution_suggestions: string[];
  priority: number;
  target?: 'ingredient' | 'step' | 'metadata';
  match_mode?: 'exact' | 'word_boundary' | 'substring' | 'canonical_id';
  is_active?: boolean;
}): GuardRule {
  const term = rule.term.toLowerCase();
  const synonyms = (rule.synonyms || []).map((s) => s.toLowerCase());

  // Try to map rule_code to GuardReasonCode, fallback to UNKNOWN_ERROR
  let ruleCode: GuardReasonCode = 'UNKNOWN_ERROR';
  const validCodes: GuardReasonCode[] = [
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
  ];

  if (validCodes.includes(rule.rule_code as GuardReasonCode)) {
    ruleCode = rule.rule_code as GuardReasonCode;
  }

  // Build remediation hints from substitution suggestions
  const remediation =
    rule.substitution_suggestions.length > 0
      ? [
          {
            type: 'substitute' as const,
            payload: {
              original: term,
              alternatives: rule.substitution_suggestions,
            },
            promptText: `Replace '${term}' with ${rule.substitution_suggestions.join(' or ')}`,
          },
        ]
      : undefined;

  return {
    id: generateRuleId('db:recipe_adaptation_rules', rule.id),
    action: 'block', // Recipe adaptation rules are always block
    strictness: ruleCode.includes('SOFT') ? 'soft' : 'hard', // Infer from rule code
    priority: rule.priority || 50,
    target: rule.target || 'ingredient',
    match: {
      term,
      synonyms: synonyms.length > 0 ? synonyms : undefined,
      preferredMatchMode: rule.match_mode || 'word_boundary',
    },
    metadata: {
      ruleCode,
      label: rule.rule_label,
      specificity: 'diet',
      // Recipe adaptation rules are always block, so not non-enforcing
      isNonEnforcingAllow: false,
    },
    remediation,
  };
}

/**
 * Create default repository using Supabase
 *
 * @param dietId - Diet ID
 * @returns Repository instance
 */
async function createDefaultRepo(_dietId: string): Promise<GuardrailsRepo> {
  // Dynamic import to avoid server-only issues in tests
  const { createClient } = await import('@/src/lib/supabase/server');
  const supabase = await createClient();

  return {
    async loadConstraints(dietId: string) {
      // Load all constraints (including inactive) for status determination
      // Filtering happens in mapConstraintToRule based on is_active
      const { data, error } = await supabase
        .from('diet_category_constraints')
        .select(
          `
          *,
          category:ingredient_categories(
            id,
            code,
            name_nl,
            category_type,
            items:ingredient_category_items(term, term_nl, synonyms, is_active)
          )
        `,
        )
        .eq('diet_type_id', dietId)
        // Note: We load all constraints (active and inactive) to determine status
        // Prioriteit: 1 = hoogst, 65500 = laagst → ascending (lagere waarde eerst)
        .order('rule_priority', { ascending: true })
        .order('priority', { ascending: true });

      if (error) {
        return { constraints: [], errors: [error.message] };
      }

      type ConstraintRow = Awaited<
        ReturnType<GuardrailsRepo['loadConstraints']>
      >['constraints'][number];
      return { constraints: (data || []) as ConstraintRow[] };
    },

    async loadRecipeAdaptationRules(dietId: string) {
      // Load all rules (including inactive) for status determination
      // Filtering happens in mapRecipeAdaptationRuleToRule based on is_active
      const { data, error } = await supabase
        .from('recipe_adaptation_rules')
        .select('*')
        .eq('diet_type_id', dietId)
        // Note: We load all rules (active and inactive) to determine status
        // Filtering by status happens in the mapping function
        .order('priority', { ascending: false });

      if (error) {
        return { rules: [], errors: [error.message] };
      }

      type RuleRow = Awaited<
        ReturnType<GuardrailsRepo['loadRecipeAdaptationRules']>
      >['rules'][number];
      return { rules: (data || []) as RuleRow[] };
    },

    async loadHeuristics(dietId: string) {
      const { data, error } = await supabase
        .from('recipe_adaptation_heuristics')
        .select('*')
        .eq('diet_type_id', dietId)
        .eq('is_active', true);

      if (error) {
        return { heuristics: [], errors: [error.message] };
      }

      type HeuristicRow = Awaited<
        ReturnType<GuardrailsRepo['loadHeuristics']>
      >['heuristics'][number];
      return { heuristics: (data || []) as HeuristicRow[] };
    },
  };
}

/**
 * Get fallback ruleset (hardcoded basic rules)
 *
 * @param dietId - Diet ID
 * @returns Fallback ruleset
 */
function getFallbackRuleset(dietId: string): GuardrailsRuleset {
  const now = new Date().toISOString();
  const rules: GuardRule[] = [
    {
      id: 'fallback:pasta',
      action: 'block',
      strictness: 'hard',
      priority: 50,
      target: 'ingredient',
      match: {
        term: 'pasta',
        synonyms: ['spaghetti', 'penne', 'fusilli', 'macaroni', 'orzo'],
      },
      metadata: {
        ruleCode: 'FORBIDDEN_INGREDIENT',
        label: 'Glutenvrij dieet',
        specificity: 'global',
      },
      remediation: [
        {
          type: 'substitute',
          payload: {
            original: 'pasta',
            alternatives: ['rijstnoedels', 'zucchininoedels'],
          },
          promptText: "Replace 'pasta' with rijstnoedels or zucchininoedels",
        },
      ],
    },
    {
      id: 'fallback:melk',
      action: 'block',
      strictness: 'hard',
      priority: 50,
      target: 'ingredient',
      match: {
        term: 'melk',
        synonyms: ['koemelk', 'volle melk'],
      },
      metadata: {
        ruleCode: 'FORBIDDEN_INGREDIENT',
        label: 'Lactose-intolerantie',
        specificity: 'global',
      },
    },
  ];

  // Calculate content hash (policy payload only, excluding provenance timestamps)
  const policyPayload = {
    dietId,
    rules: rules.sort((a, b) => a.id.localeCompare(b.id)), // Deterministic sort
    heuristics: {
      addedSugarTerms: ['suiker', 'siroop', 'stroop'],
    },
  };
  const contentHash = hashContent(policyPayload);

  return {
    dietId,
    version: 1,
    rules,
    heuristics: {
      addedSugarTerms: ['suiker', 'siroop', 'stroop'],
    },
    provenance: {
      source: 'fallback',
      loadedAt: now,
      metadata: {
        reason: 'No database rules found, using hardcoded fallback',
      },
    },
    contentHash,
  };
}

/**
 * Load guard rails ruleset from database and overlays
 *
 * @param input - Load input
 * @returns Loaded ruleset with provenance and content hash
 */
export async function loadGuardrailsRuleset(
  input: LoadGuardrailsRulesetInput,
): Promise<GuardrailsRuleset> {
  const {
    dietId,
    mode: _mode,
    locale: _locale = 'nl',
    now = new Date().toISOString(),
    repo,
  } = input;

  // Create repository (use provided or default)
  const repository = repo || (await createDefaultRepo(dietId));

  // Initialize provenance tracking
  const provenanceSources: ProvenanceSource[] = [];
  const allRules: GuardRule[] = [];
  const allErrors: string[] = [];

  // Load constraints from database
  const constraintsResult = await repository.loadConstraints(dietId);
  if (constraintsResult.errors) {
    allErrors.push(...constraintsResult.errors);
  }

  if (constraintsResult.constraints.length > 0) {
    // Map constraints to rules with status filtering
    for (const constraint of constraintsResult.constraints) {
      if (!constraint.category || !constraint.category.items) {
        continue;
      }
      // Gepauzeerde regels worden niet geëvalueerd (geen blok, geen waarschuwing)
      const c = constraint as { is_paused?: boolean };
      if (c.is_paused === true) {
        continue;
      }

      // Determine constraint status (based on is_active field)
      const constraintStatus = determineRuleStatus(
        constraint.is_active ?? true, // Default to active if not specified
        constraint.strictness || 'hard',
      );

      // Skip deleted constraints
      if (!shouldIncludeRule(constraintStatus)) {
        continue;
      }

      // Create a rule for each item in the category
      for (let i = 0; i < constraint.category.items.length; i++) {
        const item = constraint.category.items[i];

        // Determine item status (based on is_active field)
        const itemStatus = determineRuleStatus(
          item.is_active ?? true, // Default to active if not specified
          constraint.strictness || 'hard',
        );

        // Skip deleted items
        if (!shouldIncludeRule(itemStatus)) {
          continue;
        }

        const rule = mapConstraintToRule(constraint, i);
        allRules.push(rule);
      }
    }

    provenanceSources.push({
      kind: 'db',
      ref: 'diet_category_constraints',
      loadedAt: now,
      details: {
        constraintCount: constraintsResult.constraints.length,
        ruleCount: allRules.length,
        // Count active constraints (for provenance)
        activeConstraintCount: constraintsResult.constraints.filter(
          (c) => c.is_active !== false,
        ).length,
      },
    });
  }

  // Load recipe adaptation rules (legacy/additional)
  const rulesResult = await repository.loadRecipeAdaptationRules(dietId);
  if (rulesResult.errors) {
    allErrors.push(...rulesResult.errors);
  }

  if (rulesResult.rules.length > 0) {
    // Map rules with status filtering
    const mappedRules = rulesResult.rules
      .map((rule) => {
        // Determine rule status (based on is_active field)
        const status = determineRuleStatus(
          rule.is_active ?? true, // Default to active if not specified
          'hard', // Recipe adaptation rules don't have strictness, default to hard
        );

        // Only include active rules
        if (!shouldIncludeRule(status)) {
          return null;
        }

        return mapRecipeAdaptationRuleToRule(rule);
      })
      .filter((rule): rule is GuardRule => rule !== null);

    // Merge rules (overlay wins if same ID)
    for (const newRule of mappedRules) {
      const existingIndex = allRules.findIndex((r) => r.id === newRule.id);
      if (existingIndex >= 0) {
        // Overlay wins - replace existing rule
        allRules[existingIndex] = newRule;
      } else {
        allRules.push(newRule);
      }
    }

    provenanceSources.push({
      kind: 'db',
      ref: 'recipe_adaptation_rules',
      loadedAt: now,
      details: {
        ruleCount: mappedRules.length,
        // Count active rules (for provenance)
        activeRuleCount: rulesResult.rules.filter((r) => r.is_active !== false)
          .length,
      },
    });
  }

  // Load heuristics
  const heuristicsResult = await repository.loadHeuristics(dietId);
  if (heuristicsResult.errors) {
    allErrors.push(...heuristicsResult.errors);
  }

  const addedSugarHeuristic = heuristicsResult.heuristics.find(
    (h) => h.heuristic_type === 'added_sugar',
  );
  const addedSugarTerms = (addedSugarHeuristic?.terms as string[]) || [];

  // If no rules found, use fallback
  if (allRules.length === 0) {
    return getFallbackRuleset(dietId);
  }

  // Sort rules deterministically by ID for stable hash
  const sortedRules = [...allRules].sort((a, b) => a.id.localeCompare(b.id));

  // Build heuristics object
  const heuristics =
    addedSugarTerms.length > 0 ? { addedSugarTerms } : undefined;

  // Calculate version (use max updated_at timestamp or fallback to 1)
  // Version is a number - in production could use schema version or incrementing counter
  // For now, use a hash of updated_at timestamps for determinism
  let version = 1;
  const allUpdatedAts = [
    ...constraintsResult.constraints.map((c) => c.updated_at),
    ...rulesResult.rules.map((r) => r.updated_at),
    ...heuristicsResult.heuristics.map((h) => h.updated_at),
  ].filter(Boolean);

  if (allUpdatedAts.length > 0) {
    // Use hash of timestamps as version (deterministic but not sequential)
    // In production, would use schema version or incrementing counter
    const versionHash = hashContent(allUpdatedAts.sort().join(','));
    version = parseInt(versionHash.substring(0, 8), 16) || 1;
  }

  // Calculate content hash (policy payload only, excluding provenance timestamps)
  const policyPayload = {
    dietId,
    rules: sortedRules,
    heuristics,
  };
  const contentHash = hashContent(policyPayload);

  // Build provenance metadata
  const provenanceSource: 'database' | 'fallback' = provenanceSources.some(
    (s) => s.kind === 'db',
  )
    ? 'database'
    : 'fallback';
  const provenance = {
    source: provenanceSource,
    loadedAt: now,
    metadata: {
      sources: provenanceSources,
      ruleCounts: {
        total: sortedRules.length,
        bySource: provenanceSources.reduce(
          (acc, source) => {
            acc[source.ref] = (source.details?.ruleCount as number) || 0;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      errors: allErrors.length > 0 ? allErrors : undefined,
    },
  };

  return {
    dietId,
    version,
    rules: sortedRules,
    heuristics,
    provenance,
    contentHash,
  };
}

/**
 * Load guardrails ruleset and Diet Logic (Dieetregels) together.
 *
 * Returns both GuardrailsRuleset (allow/block for evaluateGuardrails) and DietLogicRuleset
 * (DROP/FORCE/LIMIT/PASS for evaluateDietLogic). Use this when you need 4-phase validation
 * (DROP → FORCE-quotum → LIMIT → PASS) or nightshade-DROP when isInflamed.
 *
 * - When userId is set: diet_logic is loaded via loadDietLogicRulesetForUser(userId), using
 *   diet_type_id and is_inflamed from user_diet_profiles.
 * - When only dietId (+ optional isInflamed): diet_logic is loaded via
 *   loadDietLogicRuleset(dietId, { isInflamed }).
 *
 * @param input - dietId, mode, locale, now, repo; optional userId or isInflamed
 * @returns { guardrails, dietLogic } — dietLogic is null when diet-logic load fails or returns empty
 */
export async function loadRulesetWithDietLogic(
  input: LoadRulesetWithDietLogicInput,
): Promise<LoadRulesetWithDietLogicResult> {
  const { dietId, userId, isInflamed, ...rest } = input;

  const guardrails = await loadGuardrailsRuleset({
    dietId,
    ...rest,
  });

  let dietLogic: DietLogicRuleset | null = null;
  try {
    if (userId) {
      dietLogic = await loadDietLogicRulesetForUser(userId);
    } else {
      dietLogic = await loadDietLogicRuleset(dietId, { isInflamed });
    }
  } catch {
    dietLogic = null;
  }

  return {
    guardrails,
    dietLogic,
  };
}
