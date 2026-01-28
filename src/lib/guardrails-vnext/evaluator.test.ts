/**
 * Guard Rails vNext - Evaluator Tests
 * 
 * Comprehensive unit tests for the evaluator module.
 * 
 * Run with: node --test evaluator.test.ts
 * Or with tsx: tsx evaluator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { evaluateGuardrails, sortRules } from './evaluator';
import type {
  GuardrailsRuleset,
  EvaluationContext,
  GuardRule,
  TextAtom,
  GuardrailsEvaluateInput,
} from './types';

// Helper to create a minimal ruleset
function createRuleset(rules: GuardRule[]): GuardrailsRuleset {
  return {
    version: 1,
    rules,
    provenance: {
      source: 'database',
      loadedAt: new Date().toISOString(),
    },
    contentHash: 'test-hash',
  };
}

// Helper to create evaluation context
function createContext(overrides?: Partial<EvaluationContext>): EvaluationContext {
  return {
    locale: 'nl',
    mode: 'recipe_adaptation',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// Helper to create text atom
function createTextAtom(text: string, path: string, overrides?: Partial<TextAtom>): TextAtom {
  return {
    text: text.toLowerCase(),
    path,
    ...overrides,
  };
}

describe('evaluateGuardrails', () => {
  describe('Sorting determinisme', () => {
    it('should sort by priority DESC, then specificity, then ruleId', () => {
      const rules: GuardRule[] = [
        {
          id: 'rule-c',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Pasta', specificity: 'diet' },
        },
        {
          id: 'rule-a',
          action: 'block',
          strictness: 'hard',
          priority: 50, // Same priority
          target: 'ingredient',
          match: { term: 'gluten' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Gluten', specificity: 'user' }, // Higher specificity
        },
        {
          id: 'rule-b',
          action: 'block',
          strictness: 'hard',
          priority: 100, // Higher priority
          target: 'ingredient',
          match: { term: 'dairy' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Dairy', specificity: 'diet' },
        },
      ];

      const sorted = sortRules(rules);

      // rule-b should be first (highest priority)
      assert.strictEqual(sorted[0].id, 'rule-b');
      // rule-a should be second (same priority as rule-c, but user > diet specificity)
      assert.strictEqual(sorted[1].id, 'rule-a');
      // rule-c should be third (same priority, lower specificity)
      assert.strictEqual(sorted[2].id, 'rule-c');
    });

    it('should use ruleId as stable tie-break', () => {
      const rules: GuardRule[] = [
        {
          id: 'rule-z',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Pasta', specificity: 'diet' },
        },
        {
          id: 'rule-a',
          action: 'block',
          strictness: 'hard',
          priority: 50, // Same priority
          target: 'ingredient',
          match: { term: 'gluten' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Gluten', specificity: 'diet' }, // Same specificity
        },
      ];

      const sorted = sortRules(rules);

      // rule-a should be first (lexicographic order)
      assert.strictEqual(sorted[0].id, 'rule-a');
      assert.strictEqual(sorted[1].id, 'rule-z');
    });

    it('should produce same order for same input (deterministic)', () => {
      const rules: GuardRule[] = [
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Pasta' },
        },
        {
          id: 'rule-2',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'gluten' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Gluten' },
        },
      ];

      const sorted1 = sortRules(rules);
      const sorted2 = sortRules(rules);

      assert.deepStrictEqual(sorted1, sorted2);
    });
  });

  describe('Hard block behavior', () => {
    it('should block when hard constraint violation detected', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Pasta' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [createTextAtom('pasta', 'ingredients[0].name')],
          step: [],
          metadata: [],
        },
      };

      const result = evaluateGuardrails(input);

      assert.strictEqual(result.outcome, 'blocked');
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.matches.length, 1);
      assert.strictEqual(result.appliedRuleIds.length, 1);
      assert(result.reasonCodes.includes('FORBIDDEN_INGREDIENT'));
    });

    it('should block even if soft blocks also match', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Pasta' },
        },
        {
          id: 'rule-2',
          action: 'block',
          strictness: 'soft',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta' },
          metadata: { ruleCode: 'SOFT_CONSTRAINT_VIOLATION', label: 'Pasta (soft)' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [createTextAtom('pasta', 'ingredients[0].name')],
          step: [],
          metadata: [],
        },
      };

      const result = evaluateGuardrails(input);

      assert.strictEqual(result.outcome, 'blocked');
      assert.strictEqual(result.ok, false);
      // Both rules should match, but hard block determines outcome
      assert(result.matches.length >= 1);
      assert(result.appliedRuleIds.includes('rule-1'));
    });
  });

  describe('Soft block behavior', () => {
    it('should warn when only soft constraint violations detected', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'soft',
          priority: 50,
          target: 'ingredient',
          match: { term: 'mushroom' },
          metadata: { ruleCode: 'SOFT_CONSTRAINT_VIOLATION', label: 'Mushroom (disliked)' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [createTextAtom('mushroom', 'ingredients[0].name')],
          step: [],
          metadata: [],
        },
      };

      const result = evaluateGuardrails(input);

      assert.strictEqual(result.outcome, 'warned');
      assert.strictEqual(result.ok, true); // Soft never blocks
      assert.strictEqual(result.matches.length, 1);
      assert.strictEqual(result.appliedRuleIds.length, 1);
      assert(result.reasonCodes.includes('SOFT_CONSTRAINT_VIOLATION'));
    });

    it('should allow when no violations detected', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Pasta' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [createTextAtom('rice', 'ingredients[0].name')],
          step: [],
          metadata: [],
        },
      };

      const result = evaluateGuardrails(input);

      assert.strictEqual(result.outcome, 'allowed');
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.matches.length, 0);
      assert.strictEqual(result.appliedRuleIds.length, 0);
    });
  });

  describe('Allow rules behavior', () => {
    it('should allow when only allow rules match', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'allow',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta' },
          metadata: { ruleCode: 'ALLOWED_INGREDIENT', label: 'Pasta (allowed)' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [createTextAtom('pasta', 'ingredients[0].name')],
          step: [],
          metadata: [],
        },
      };

      const result = evaluateGuardrails(input);

      assert.strictEqual(result.outcome, 'allowed');
      assert.strictEqual(result.ok, true);
      // Allow matches are tracked but don't change outcome
      assert(result.matches.length >= 1);
      assert.strictEqual(result.appliedRuleIds.length, 0); // Allow rules don't apply
    });

    it('should block when block rule overrides allow rule', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-allow',
          action: 'allow',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta' },
          metadata: { ruleCode: 'ALLOWED_INGREDIENT', label: 'Pasta (allowed)' },
        },
        {
          id: 'rule-block',
          action: 'block',
          strictness: 'hard',
          priority: 60, // Higher priority
          target: 'ingredient',
          match: { term: 'pasta' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Pasta (blocked)' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [createTextAtom('pasta', 'ingredients[0].name')],
          step: [],
          metadata: [],
        },
      };

      const result = evaluateGuardrails(input);

      // BLOCK wins always
      assert.strictEqual(result.outcome, 'blocked');
      assert.strictEqual(result.ok, false);
      assert(result.appliedRuleIds.includes('rule-block'));
    });
  });

  describe('Matching modes', () => {
    it('should match exact mode', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta', preferredMatchMode: 'exact' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Pasta' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [createTextAtom('pasta', 'ingredients[0].name')],
          step: [],
          metadata: [],
        },
      };

      const result = evaluateGuardrails(input);

      assert.strictEqual(result.outcome, 'blocked');
      assert.strictEqual(result.matches.length, 1);
      assert.strictEqual(result.matches[0].matchMode, 'exact');
    });

    it('should match word_boundary mode and prevent false positives', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'suiker', preferredMatchMode: 'word_boundary' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Suiker' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [
            createTextAtom('suiker', 'ingredients[0].name'), // Should match
            createTextAtom('suikervrij', 'ingredients[1].name'), // Should NOT match
          ],
          step: [],
          metadata: [],
        },
      };

      const result = evaluateGuardrails(input);

      assert.strictEqual(result.outcome, 'blocked');
      // Should match "suiker" but not "suikervrij"
      assert.strictEqual(result.matches.length, 1);
      assert.strictEqual(result.matches[0].targetPath, 'ingredients[0].name');
    });

    it('should match substring mode for ingredients', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta', preferredMatchMode: 'substring' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Pasta' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [createTextAtom('spaghetti pasta', 'ingredients[0].name')],
          step: [],
          metadata: [],
        },
      };

      const result = evaluateGuardrails(input);

      assert.strictEqual(result.outcome, 'blocked');
      assert.strictEqual(result.matches.length, 1);
      assert.strictEqual(result.matches[0].matchMode, 'substring');
    });

    it('should match canonical_id mode', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'metadata',
          match: { term: 'NEVO-123', canonicalId: 'NEVO-123', preferredMatchMode: 'canonical_id' },
          metadata: { ruleCode: 'INVALID_NEVO_CODE', label: 'Invalid NEVO' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [],
          step: [],
          metadata: [createTextAtom('some text', 'metadata[0].code', { canonicalId: 'NEVO-123' })],
        },
      };

      const result = evaluateGuardrails(input);

      assert.strictEqual(result.outcome, 'blocked');
      assert.strictEqual(result.matches.length, 1);
      assert.strictEqual(result.matches[0].matchMode, 'canonical_id');
    });
  });

  describe('Config errors', () => {
    it('should block when substring mode used on steps with hard rule', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'step',
          match: { term: 'pasta', preferredMatchMode: 'substring' }, // Invalid: substring on steps
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Pasta' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [],
          step: [createTextAtom('add pasta', 'steps[0].text')],
          metadata: [],
        },
      };

      const result = evaluateGuardrails(input);

      // Config error with hard rule → blocked
      assert.strictEqual(result.outcome, 'blocked');
      assert.strictEqual(result.ok, false);
      assert(result.reasonCodes.includes('EVALUATOR_ERROR'));
      assert(result.appliedRuleIds.includes('rule-1'));
    });

    it('should warn when substring mode used on steps with soft rule', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'soft',
          priority: 50,
          target: 'step',
          match: { term: 'pasta', preferredMatchMode: 'substring' }, // Invalid: substring on steps
          metadata: { ruleCode: 'SOFT_CONSTRAINT_VIOLATION', label: 'Pasta (soft)' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [],
          step: [createTextAtom('add pasta', 'steps[0].text')],
          metadata: [],
        },
      };

      const result = evaluateGuardrails(input);

      // Config error with soft rule → warned (soft never blocks)
      assert.strictEqual(result.outcome, 'warned');
      assert.strictEqual(result.ok, true);
      assert(result.reasonCodes.includes('EVALUATOR_WARNING'));
      assert(result.appliedRuleIds.includes('rule-1'));
    });
  });

  describe('Trace completeness', () => {
    it('should include all rules in trace', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Pasta' },
        },
        {
          id: 'rule-2',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'gluten' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Gluten' },
        },
      ]);

      const input: GuardrailsEvaluateInput = {
        ruleset,
        context: createContext(),
        targets: {
          ingredient: [createTextAtom('pasta', 'ingredients[0].name')],
          step: [],
          metadata: [],
        },
      };

      const result = evaluateGuardrails(input);

      // Trace should include all rules
      assert.strictEqual(result.trace.evaluationSteps.length, ruleset.rules.length);
      assert.strictEqual(result.trace.evaluationSteps[0].ruleId, 'rule-1');
      assert.strictEqual(result.trace.evaluationSteps[1].ruleId, 'rule-2');
    });

    it('should be deterministic (same input → same trace)', () => {
      const ruleset = createRuleset([
        {
          id: 'rule-1',
          action: 'block',
          strictness: 'hard',
          priority: 50,
          target: 'ingredient',
          match: { term: 'pasta' },
          metadata: { ruleCode: 'FORBIDDEN_INGREDIENT', label: 'Pasta' },
        },
      ]);

      const context = createContext();
      const input: GuardrailsEvaluateInput = {
        ruleset,
        context,
        targets: {
          ingredient: [createTextAtom('pasta', 'ingredients[0].name')],
          step: [],
          metadata: [],
        },
      };

      const result1 = evaluateGuardrails(input);
      const result2 = evaluateGuardrails(input);

      // Same input should produce same trace
      assert.deepStrictEqual(result1.trace.evaluationSteps, result2.trace.evaluationSteps);
      assert.strictEqual(result1.trace.finalOutcome, result2.trace.finalOutcome);
    });
  });
});
