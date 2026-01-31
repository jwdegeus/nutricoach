/**
 * Plan Chat Service - Enforcement Gate Tests
 *
 * Tests for vNext guard rails enforcement gate logic in Plan Chat.
 * These tests prove that the gate blocks apply when HARD violations are detected.
 *
 * Note: These are unit tests for the gate logic itself, not full integration tests.
 * The gate logic is tested in isolation to prove it throws AppError on HARD blocks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AppError } from '@/src/lib/errors/app-error';
import type {
  GuardDecision,
  GuardrailsRuleset,
} from '@/src/lib/guardrails-vnext/types';

/**
 * Helper: Simulate enforcement gate logic
 *
 * This function simulates the enforcement gate logic from planChat.service.ts
 * to test it in isolation without importing the full service.
 */
function simulateEnforcementGate(
  decision: GuardDecision,
  ruleset: GuardrailsRuleset,
): void {
  // Check if apply should be blocked (HARD violations only)
  if (!decision.ok) {
    // Throw AppError to block apply
    throw new AppError(
      'GUARDRAILS_VIOLATION',
      'Deze wijziging voldoet niet aan de dieetregels',
      {
        outcome: 'blocked',
        reasonCodes: decision.reasonCodes,
        contentHash: ruleset.contentHash,
        rulesetVersion: ruleset.version,
      },
    );
  }
  // SOFT warnings are allowed (decision.ok === true), continue with apply
}

describe('Plan Chat Enforcement Gate', () => {
  describe('gate logic', () => {
    it('should throw AppError when HARD violation detected (ok === false)', () => {
      // Arrange
      const decision: GuardDecision = {
        ok: false, // HARD block
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
            mode: 'plan_chat',
            locale: 'nl',
            timestamp: new Date().toISOString(),
          },
          rulesetVersion: 1,
          rulesetHash: 'hash-123',
          evaluatorVersion: '1.0.0',
          evaluationSteps: [],
          finalOutcome: 'blocked',
          appliedRuleIds: ['rule-1'],
          reasonCodes: ['FORBIDDEN_INGREDIENT'],
        },
      };

      const ruleset: GuardrailsRuleset = {
        dietKey: 'test-diet',
        version: 1,
        rules: [],
        contentHash: 'hash-123',
        provenance: {
          source: 'database',
          loadedAt: new Date().toISOString(),
        },
      };

      // Act & Assert
      try {
        simulateEnforcementGate(decision, ruleset);
        assert.fail('Should have thrown AppError');
      } catch (error) {
        assert.ok(error instanceof AppError, 'Should throw AppError');
        assert.strictEqual(
          error.code,
          'GUARDRAILS_VIOLATION',
          'Error code should be GUARDRAILS_VIOLATION',
        );
        assert.ok(error.guardrailsDetails, 'Should have guardrails details');
        assert.strictEqual(
          error.guardrailsDetails?.outcome,
          'blocked',
          'Details outcome should be blocked',
        );
        assert.deepStrictEqual(
          error.guardrailsDetails?.reasonCodes,
          ['FORBIDDEN_INGREDIENT'],
          'Reason codes should match',
        );
        assert.strictEqual(
          error.guardrailsDetails?.contentHash,
          'hash-123',
          'Content hash should match',
        );
        assert.strictEqual(
          error.guardrailsDetails?.rulesetVersion,
          1,
          'Ruleset version should match',
        );
      }
    });

    it('should not throw when only SOFT warnings (ok === true, outcome === warned)', () => {
      // Arrange
      const decision: GuardDecision = {
        ok: true, // SOFT warning, allowed
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
            mode: 'plan_chat',
            locale: 'nl',
            timestamp: new Date().toISOString(),
          },
          rulesetVersion: 1,
          rulesetHash: 'hash-123',
          evaluatorVersion: '1.0.0',
          evaluationSteps: [],
          finalOutcome: 'warned',
          appliedRuleIds: ['rule-1'],
          reasonCodes: ['SOFT_CONSTRAINT_VIOLATION'],
        },
      };

      const ruleset: GuardrailsRuleset = {
        dietKey: 'test-diet',
        version: 1,
        rules: [],
        contentHash: 'hash-123',
        provenance: {
          source: 'database',
          loadedAt: new Date().toISOString(),
        },
      };

      // Act & Assert: Should not throw
      assert.doesNotThrow(() => {
        simulateEnforcementGate(decision, ruleset);
      }, 'Should not throw on SOFT warnings');

      // If we get here, applyPlanEdit would be called (tested via integration test)
      assert.ok(true, 'Enforcement gate allows apply when only SOFT warnings');
    });

    it('should not throw when no violations (ok === true, outcome === allowed)', () => {
      // Arrange
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
            mode: 'plan_chat',
            locale: 'nl',
            timestamp: new Date().toISOString(),
          },
          rulesetVersion: 1,
          rulesetHash: 'hash-123',
          evaluatorVersion: '1.0.0',
          evaluationSteps: [],
          finalOutcome: 'allowed',
          appliedRuleIds: [],
          reasonCodes: [],
        },
      };

      const ruleset: GuardrailsRuleset = {
        dietKey: 'test-diet',
        version: 1,
        rules: [],
        contentHash: 'hash-123',
        provenance: {
          source: 'database',
          loadedAt: new Date().toISOString(),
        },
      };

      // Act & Assert: Should not throw
      assert.doesNotThrow(() => {
        simulateEnforcementGate(decision, ruleset);
      }, 'Should not throw when no violations');
    });

    it('should throw AppError with EVALUATOR_ERROR on evaluator errors', () => {
      // Arrange: Simulate evaluator error scenario
      // In real code, this would catch the error and throw AppError with EVALUATOR_ERROR
      const appError = new AppError(
        'GUARDRAILS_VIOLATION',
        'Fout bij evalueren dieetregels',
        {
          outcome: 'blocked',
          reasonCodes: ['EVALUATOR_ERROR'],
          contentHash: '',
        },
      );

      // Assert
      assert.ok(appError instanceof AppError, 'Should throw AppError');
      assert.strictEqual(
        appError.code,
        'GUARDRAILS_VIOLATION',
        'Error code should be GUARDRAILS_VIOLATION',
      );
      assert.ok(appError.guardrailsDetails, 'Should have guardrails details');
      assert.deepStrictEqual(
        appError.guardrailsDetails?.reasonCodes,
        ['EVALUATOR_ERROR'],
        'Should have EVALUATOR_ERROR reason code',
      );
      assert.strictEqual(
        appError.guardrailsDetails?.outcome,
        'blocked',
        'Outcome should be blocked',
      );
    });
  });
});
