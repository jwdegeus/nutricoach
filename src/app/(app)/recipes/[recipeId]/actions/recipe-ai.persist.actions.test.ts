/**
 * Recipe Adaptation Actions - Enforcement Tests
 *
 * Tests for vNext guard rails enforcement in applyRecipeAdaptationAction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { GuardDecision } from '@/src/lib/guardrails-vnext/types';

/**
 * Helper: Check if guard decision should block apply
 *
 * HARD blocks prevent apply, SOFT warnings do not.
 *
 * @param decision - Guard decision from vNext evaluator
 * @returns True if apply should be blocked
 */
function shouldBlockApply(decision: GuardDecision): boolean {
  // HARD blocks prevent apply (ok === false means hard block)
  return !decision.ok;
}

describe('Recipe Adaptation Enforcement', () => {
  describe('shouldBlockApply', () => {
    it('should block apply when HARD violation detected (ok === false)', () => {
      const decision: GuardDecision = {
        ok: false,
        outcome: 'blocked',
        matches: [],
        appliedRuleIds: ['rule-1'],
        summary: 'Hard constraint violation',
        reasonCodes: ['FORBIDDEN_INGREDIENT'],
        remediationHints: [],
        trace: {
          evaluationId: 'test-1',
          timestamp: new Date().toISOString(),
          context: {
            dietKey: 'test-diet',
            mode: 'recipe_adaptation',
            locale: 'nl',
            timestamp: new Date().toISOString(),
          },
          rulesetVersion: 1,
          rulesetHash: 'hash-1',
          evaluatorVersion: '1.0.0',
          evaluationSteps: [],
          finalOutcome: 'blocked',
          appliedRuleIds: ['rule-1'],
          reasonCodes: ['FORBIDDEN_INGREDIENT'],
        },
      };

      assert.strictEqual(
        shouldBlockApply(decision),
        true,
        'Should block apply on HARD violation',
      );
    });

    it('should allow apply when only SOFT warnings (ok === true, outcome === warned)', () => {
      const decision: GuardDecision = {
        ok: true,
        outcome: 'warned',
        matches: [],
        appliedRuleIds: ['rule-1'],
        summary: 'Soft constraint warning',
        reasonCodes: ['SOFT_CONSTRAINT_VIOLATION'],
        remediationHints: [],
        trace: {
          evaluationId: 'test-2',
          timestamp: new Date().toISOString(),
          context: {
            dietKey: 'test-diet',
            mode: 'recipe_adaptation',
            locale: 'nl',
            timestamp: new Date().toISOString(),
          },
          rulesetVersion: 1,
          rulesetHash: 'hash-1',
          evaluatorVersion: '1.0.0',
          evaluationSteps: [],
          finalOutcome: 'warned',
          appliedRuleIds: ['rule-1'],
          reasonCodes: ['SOFT_CONSTRAINT_VIOLATION'],
        },
      };

      assert.strictEqual(
        shouldBlockApply(decision),
        false,
        'Should allow apply on SOFT warning',
      );
    });

    it('should allow apply when no violations (ok === true, outcome === allowed)', () => {
      const decision: GuardDecision = {
        ok: true,
        outcome: 'allowed',
        matches: [],
        appliedRuleIds: [],
        summary: 'No violations',
        reasonCodes: [],
        remediationHints: [],
        trace: {
          evaluationId: 'test-3',
          timestamp: new Date().toISOString(),
          context: {
            dietKey: 'test-diet',
            mode: 'recipe_adaptation',
            locale: 'nl',
            timestamp: new Date().toISOString(),
          },
          rulesetVersion: 1,
          rulesetHash: 'hash-1',
          evaluatorVersion: '1.0.0',
          evaluationSteps: [],
          finalOutcome: 'allowed',
          appliedRuleIds: [],
          reasonCodes: [],
        },
      };

      assert.strictEqual(
        shouldBlockApply(decision),
        false,
        'Should allow apply when no violations',
      );
    });

    it('should block apply when HARD violation even if SOFT warnings also present', () => {
      const decision: GuardDecision = {
        ok: false, // HARD block takes precedence
        outcome: 'blocked',
        matches: [],
        appliedRuleIds: ['rule-hard-1', 'rule-soft-1'],
        summary: 'Hard and soft violations',
        reasonCodes: ['FORBIDDEN_INGREDIENT', 'SOFT_CONSTRAINT_VIOLATION'],
        remediationHints: [],
        trace: {
          evaluationId: 'test-4',
          timestamp: new Date().toISOString(),
          context: {
            dietKey: 'test-diet',
            mode: 'recipe_adaptation',
            locale: 'nl',
            timestamp: new Date().toISOString(),
          },
          rulesetVersion: 1,
          rulesetHash: 'hash-1',
          evaluatorVersion: '1.0.0',
          evaluationSteps: [],
          finalOutcome: 'blocked',
          appliedRuleIds: ['rule-hard-1', 'rule-soft-1'],
          reasonCodes: ['FORBIDDEN_INGREDIENT', 'SOFT_CONSTRAINT_VIOLATION'],
        },
      };

      assert.strictEqual(
        shouldBlockApply(decision),
        true,
        'Should block apply when HARD violation present, even with SOFT warnings',
      );
    });
  });
});
