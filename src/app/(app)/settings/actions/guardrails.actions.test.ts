/**
 * Guard Rails Actions - Swap Priority Tests
 *
 * Tests for swapGuardRailRulePriorityAction to ensure deterministic,
 * transactional priority swapping.
 *
 * Note: These are integration tests that require database access.
 * For true unit tests, mock the Supabase client.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { swapGuardRailRulePriorityAction } from './guardrails.actions';
import { loadGuardrailsRuleset } from '@/src/lib/guardrails-vnext';
import { createClient } from '@/src/lib/supabase/server';

/**
 * Helper: Create test diet type
 */
async function createTestDietType(name: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('diet_types')
    .insert({
      name,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to create test diet: ${error?.message || 'Unknown error'}`,
    );
  }

  return data.id;
}

/**
 * Helper: Create test admin user
 */
async function createTestAdmin(): Promise<string> {
  // Note: In real tests, you'd mock isAdmin() or use test auth
  // For now, we'll assume tests run with proper admin setup
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Test requires authenticated user');
  }

  // Ensure admin role
  await supabase.from('user_roles').upsert({
    user_id: user.id,
    role: 'admin',
  });

  return user.id;
}

/**
 * Helper: Create test constraint
 */
async function createTestConstraint(
  dietTypeId: string,
  priority: number,
): Promise<string> {
  const supabase = await createClient();

  // First create a category
  const { data: category, error: catError } = await supabase
    .from('ingredient_categories')
    .insert({
      code: `test_category_${Date.now()}`,
      name_nl: 'Test Category',
      category_type: 'forbidden',
      is_active: true,
    })
    .select('id')
    .single();

  if (catError || !category) {
    throw new Error(
      `Failed to create test category: ${catError?.message || 'Unknown error'}`,
    );
  }

  // Create category item
  const { data: item, error: itemError } = await supabase
    .from('ingredient_category_items')
    .insert({
      category_id: category.id,
      term: `test_term_${Date.now()}`,
      is_active: true,
    })
    .select('id')
    .single();

  if (itemError || !item) {
    throw new Error(
      `Failed to create test item: ${itemError?.message || 'Unknown error'}`,
    );
  }

  // Create constraint
  const { data: constraint, error: constraintError } = await supabase
    .from('diet_category_constraints')
    .insert({
      diet_type_id: dietTypeId,
      category_id: category.id,
      constraint_type: 'forbidden',
      rule_action: 'block',
      strictness: 'hard',
      rule_priority: priority,
      priority: priority,
      is_active: true,
    })
    .select('id')
    .single();

  if (constraintError || !constraint) {
    throw new Error(
      `Failed to create test constraint: ${constraintError?.message || 'Unknown error'}`,
    );
  }

  return constraint.id;
}

/**
 * Helper: Create test recipe adaptation rule
 */
async function createTestRecipeRule(
  dietTypeId: string,
  priority: number,
): Promise<string> {
  const supabase = await createClient();

  const { data: rule, error } = await supabase
    .from('recipe_adaptation_rules')
    .insert({
      diet_type_id: dietTypeId,
      term: `test_term_${Date.now()}`,
      synonyms: [],
      rule_code: 'FORBIDDEN_INGREDIENT',
      rule_label: 'Test Rule',
      substitution_suggestions: [],
      priority: priority,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !rule) {
    throw new Error(
      `Failed to create test rule: ${error?.message || 'Unknown error'}`,
    );
  }

  return rule.id;
}

/**
 * Helper: Cleanup test data
 */
async function cleanupTestData(dietTypeId: string) {
  const supabase = await createClient();

  // Delete constraints
  await supabase
    .from('diet_category_constraints')
    .delete()
    .eq('diet_type_id', dietTypeId);

  // Delete recipe rules
  await supabase
    .from('recipe_adaptation_rules')
    .delete()
    .eq('diet_type_id', dietTypeId);

  // Delete diet type
  await supabase.from('diet_types').delete().eq('id', dietTypeId);
}

describe('swapGuardRailRulePriorityAction', () => {
  let testDietTypeId: string;
  let _testAdminId: string;

  beforeEach(async () => {
    _testAdminId = await createTestAdmin();
    testDietTypeId = await createTestDietType(`test_diet_${Date.now()}`);
  });

  afterEach(async () => {
    if (testDietTypeId) {
      await cleanupTestData(testDietTypeId);
    }
  });

  describe('Validation', () => {
    it('should reject swap with same rule ID', async () => {
      const constraintId = await createTestConstraint(testDietTypeId, 50);
      const ruleId = `db:diet_category_constraints:${constraintId}:0`;

      const result = await swapGuardRailRulePriorityAction(ruleId, ruleId);

      assert('error' in result);
      assert.strictEqual(
        result.error,
        'Kan niet dezelfde regel met zichzelf verwisselen',
      );
    });

    it('should reject swap with missing rule A', async () => {
      const constraintIdB = await createTestConstraint(testDietTypeId, 60);
      const ruleIdA =
        'db:diet_category_constraints:00000000-0000-0000-0000-000000000000:0';
      const ruleIdB = `db:diet_category_constraints:${constraintIdB}:0`;

      const result = await swapGuardRailRulePriorityAction(ruleIdA, ruleIdB);

      assert(
        'error' in result && result.error.includes('Regel A niet gevonden'),
      );
    });

    it('should reject swap with missing rule B', async () => {
      const constraintIdA = await createTestConstraint(testDietTypeId, 50);
      const ruleIdA = `db:diet_category_constraints:${constraintIdA}:0`;
      const ruleIdB =
        'db:diet_category_constraints:00000000-0000-0000-0000-000000000000:0';

      const result = await swapGuardRailRulePriorityAction(ruleIdA, ruleIdB);

      assert(
        'error' in result && result.error.includes('Regel B niet gevonden'),
      );
    });

    it('should reject swap between different source types', async () => {
      const constraintId = await createTestConstraint(testDietTypeId, 50);
      const recipeRuleId = await createTestRecipeRule(testDietTypeId, 60);

      const ruleIdA = `db:diet_category_constraints:${constraintId}:0`;
      const ruleIdB = `db:recipe_adaptation_rules:${recipeRuleId}`;

      const result = await swapGuardRailRulePriorityAction(ruleIdA, ruleIdB);

      assert(
        'error' in result &&
          result.error.includes(
            'Kan alleen regels van hetzelfde type verwisselen',
          ),
      );
    });

    it('should reject swap between different diets', async () => {
      const otherDietId = await createTestDietType(`other_diet_${Date.now()}`);

      try {
        const constraintIdA = await createTestConstraint(testDietTypeId, 50);
        const constraintIdB = await createTestConstraint(otherDietId, 60);

        const ruleIdA = `db:diet_category_constraints:${constraintIdA}:0`;
        const ruleIdB = `db:diet_category_constraints:${constraintIdB}:0`;

        const result = await swapGuardRailRulePriorityAction(ruleIdA, ruleIdB);

        assert('error' in result);
        assert.strictEqual(
          result.error,
          'Regels moeten tot hetzelfde dieettype behoren',
        );
      } finally {
        await cleanupTestData(otherDietId);
      }
    });
  });

  describe('Swap functionality', () => {
    it('should swap priorities for diet_category_constraints', async () => {
      const constraintIdA = await createTestConstraint(testDietTypeId, 50);
      const constraintIdB = await createTestConstraint(testDietTypeId, 80);

      const ruleIdA = `db:diet_category_constraints:${constraintIdA}:0`;
      const ruleIdB = `db:diet_category_constraints:${constraintIdB}:0`;

      const result = await swapGuardRailRulePriorityAction(ruleIdA, ruleIdB);

      assert('data' in result);
      assert.strictEqual(result.data, undefined);

      // Verify swap by loading ruleset
      const ruleset = await loadGuardrailsRuleset({
        dietId: testDietTypeId,
        mode: 'recipe_adaptation',
        locale: 'nl',
      });

      const ruleA = ruleset.rules.find((r) => r.id === ruleIdA);
      const ruleB = ruleset.rules.find((r) => r.id === ruleIdB);

      assert(ruleA, 'Rule A should exist');
      assert(ruleB, 'Rule B should exist');
      assert.strictEqual(ruleA.priority, 80, 'Rule A should have priority 80');
      assert.strictEqual(ruleB.priority, 50, 'Rule B should have priority 50');
    });

    it('should swap priorities for recipe_adaptation_rules', async () => {
      const ruleIdA = await createTestRecipeRule(testDietTypeId, 50);
      const ruleIdB = await createTestRecipeRule(testDietTypeId, 80);

      const ruleIdAStr = `db:recipe_adaptation_rules:${ruleIdA}`;
      const ruleIdBStr = `db:recipe_adaptation_rules:${ruleIdB}`;

      const result = await swapGuardRailRulePriorityAction(
        ruleIdAStr,
        ruleIdBStr,
      );

      assert('data' in result);
      assert.strictEqual(result.data, undefined);

      // Verify swap by loading ruleset
      const ruleset = await loadGuardrailsRuleset({
        dietId: testDietTypeId,
        mode: 'recipe_adaptation',
        locale: 'nl',
      });

      const ruleA = ruleset.rules.find((r) => r.id === ruleIdAStr);
      const ruleB = ruleset.rules.find((r) => r.id === ruleIdBStr);

      assert(ruleA, 'Rule A should exist');
      assert(ruleB, 'Rule B should exist');
      assert.strictEqual(ruleA.priority, 80, 'Rule A should have priority 80');
      assert.strictEqual(ruleB.priority, 50, 'Rule B should have priority 50');
    });

    it('should maintain deterministic ordering after swap', async () => {
      const constraintIdA = await createTestConstraint(testDietTypeId, 50);
      const constraintIdB = await createTestConstraint(testDietTypeId, 80);
      const constraintIdC = await createTestConstraint(testDietTypeId, 60);

      const ruleIdA = `db:diet_category_constraints:${constraintIdA}:0`;
      const ruleIdB = `db:diet_category_constraints:${constraintIdB}:0`;
      const ruleIdC = `db:diet_category_constraints:${constraintIdC}:0`;

      // Swap A and B (50 <-> 80)
      const result = await swapGuardRailRulePriorityAction(ruleIdA, ruleIdB);
      assert('data' in result);
      assert.strictEqual(result.data, undefined);

      // Load ruleset and verify ordering
      const ruleset = await loadGuardrailsRuleset({
        dietId: testDietTypeId,
        mode: 'recipe_adaptation',
        locale: 'nl',
      });

      // Rules should be sorted by priority DESC
      const sortedRules = [...ruleset.rules].sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.id.localeCompare(b.id);
      });

      // Verify priorities after swap
      const ruleA = ruleset.rules.find((r) => r.id === ruleIdA);
      const ruleB = ruleset.rules.find((r) => r.id === ruleIdB);
      const ruleC = ruleset.rules.find((r) => r.id === ruleIdC);

      assert.strictEqual(ruleA?.priority, 80);
      assert.strictEqual(ruleB?.priority, 50);
      assert.strictEqual(ruleC?.priority, 60);

      // Verify ordering: A (80) > C (60) > B (50)
      const priorities = sortedRules
        .filter((r) => [ruleIdA, ruleIdB, ruleIdC].includes(r.id))
        .map((r) => r.priority);

      assert.deepStrictEqual(priorities, [80, 60, 50]);
    });
  });
});
