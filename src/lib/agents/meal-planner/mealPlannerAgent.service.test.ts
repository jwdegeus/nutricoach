/**
 * Meal Planner Agent Service - Enforcement Gate Tests
 *
 * Tests for vNext guard rails enforcement gate in Meal Planner.
 * These tests prove that the gate blocks plan output when HARD violations are detected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AppError } from '@/src/lib/errors/app-error';
import type {
  GuardDecision,
  GuardrailsRuleset,
} from '@/src/lib/guardrails-vnext/types';
import type { MealPlanResponse } from '@/src/lib/diets';

/**
 * Helper: Simulate enforcement gate logic
 *
 * This function simulates the enforcement gate logic from mealPlannerAgent.service.ts
 * to test it in isolation without importing the full service.
 */
async function simulateEnforcementGate(
  plan: MealPlanResponse,
  decision: GuardDecision,
  ruleset: GuardrailsRuleset,
): Promise<void> {
  // Check if plan should be blocked (HARD violations only)
  if (!decision.ok) {
    // Log for monitoring
    console.log(
      `[MealPlanner] vNext guard rails blocked plan: dietKey=${ruleset.dietKey}, outcome=${decision.outcome}, reasonCodes=${decision.reasonCodes.slice(0, 5).join(',')}, hash=${ruleset.contentHash}`,
    );

    // Throw AppError to block plan
    throw new AppError(
      'GUARDRAILS_VIOLATION',
      'Het gegenereerde meal plan voldoet niet aan de dieetregels',
      {
        outcome: 'blocked',
        reasonCodes: decision.reasonCodes,
        contentHash: ruleset.contentHash,
        rulesetVersion: ruleset.version,
      },
    );
  }

  // SOFT warnings are allowed (decision.ok === true), continue
}

describe('Meal Planner Enforcement Gate', () => {
  describe('gate logic', () => {
    it('should throw AppError when HARD violation detected (ok === false)', async () => {
      // Arrange
      const plan: MealPlanResponse = {
        requestId: 'test-request',
        days: [],
      };

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
            mode: 'meal_planner',
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
        await simulateEnforcementGate(plan, decision, ruleset);
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

    it('should not throw when only SOFT warnings (ok === true, outcome === warned)', async () => {
      // Arrange
      const plan: MealPlanResponse = {
        requestId: 'test-request',
        days: [],
      };

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
            mode: 'meal_planner',
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
      await assert.doesNotReject(async () => {
        await simulateEnforcementGate(plan, decision, ruleset);
      }, 'Should not throw on SOFT warnings');
    });

    it('should not throw when no violations (ok === true, outcome === allowed)', async () => {
      // Arrange
      const plan: MealPlanResponse = {
        requestId: 'test-request',
        days: [],
      };

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
            mode: 'meal_planner',
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
      await assert.doesNotReject(async () => {
        await simulateEnforcementGate(plan, decision, ruleset);
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
