/**
 * Guard Rails vNext - Wahls Paleo Smoke Tests
 * 
 * Smoke tests to verify Wahls Paleo ruleset is correctly loaded and evaluated.
 * 
 * Run with: node --test wahls-paleo.smoke.test.ts
 * Or with tsx: tsx wahls-paleo.smoke.test.ts
 * 
 * These tests verify:
 * - Ruleset loads successfully from database (or mock)
 * - Critical forbidden terms are blocked (hard)
 * - Limited terms are warned (soft)
 * - Reason codes are correct
 * - Content hash is stable
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { loadGuardrailsRuleset } from './ruleset-loader';
import { evaluateGuardrails } from './evaluator';
import type {
  GuardrailsRepo,
  LoadGuardrailsRulesetInput,
} from './ruleset-loader';
import type {
  EvaluationContext,
  TextAtom,
} from './types';

// ============================================================================
// Fixture: Wahls Paleo Ruleset (based on migration)
// ============================================================================
// This fixture represents the expected state after migration 20260131000012
// It's a subset of the full ruleset for testing critical paths

function createWahlsPaleoMockRepo(): GuardrailsRepo {
  return {
    async loadConstraints() {
      return {
        constraints: [
          // Forbidden: Gluten (hard block, priority 100)
          {
            id: 'constraint-gluten',
            diet_type_id: 'wahls-paleo-uuid',
            rule_action: 'block',
            strictness: 'hard',
            rule_priority: 100,
            priority: 100,
            is_active: true,
            updated_at: '2026-01-31T00:00:00Z',
            category: {
              id: 'cat-gluten',
              code: 'wahls_forbidden_gluten',
              name_nl: 'Wahls Verboden: Gluten',
              category_type: 'forbidden',
              items: [
                {
                  term: 'wheat',
                  term_nl: 'tarwe',
                  synonyms: ['tarwe', 'tarwebloem', 'tarwemeel', 'bloem', 'meel', 'wheat flour'],
                  is_active: true,
                },
                {
                  term: 'pasta',
                  term_nl: 'pasta',
                  synonyms: ['spaghetti', 'penne', 'fusilli', 'macaroni', 'orzo', 'couscous'],
                  is_active: true,
                },
                {
                  term: 'bread',
                  term_nl: 'brood',
                  synonyms: ['brood', 'bread', 'stokbrood', 'baguette'],
                  is_active: true,
                },
              ],
            },
          },
          // Forbidden: Dairy (hard block, priority 100)
          {
            id: 'constraint-dairy',
            diet_type_id: 'wahls-paleo-uuid',
            rule_action: 'block',
            strictness: 'hard',
            rule_priority: 100,
            priority: 100,
            is_active: true,
            updated_at: '2026-01-31T00:00:00Z',
            category: {
              id: 'cat-dairy',
              code: 'wahls_forbidden_dairy',
              name_nl: 'Wahls Verboden: Zuivel',
              category_type: 'forbidden',
              items: [
                {
                  term: 'milk',
                  term_nl: 'melk',
                  synonyms: ['melk', 'milk', 'koemelk', 'volle melk'],
                  is_active: true,
                },
                {
                  term: 'cheese',
                  term_nl: 'kaas',
                  synonyms: ['kaas', 'cheese', 'cheddar', 'gouda'],
                  is_active: true,
                },
                {
                  term: 'butter',
                  term_nl: 'boter',
                  synonyms: ['boter', 'butter', 'roomboter'],
                  is_active: true,
                },
              ],
            },
          },
          // Forbidden: Soy (hard block, priority 100)
          {
            id: 'constraint-soy',
            diet_type_id: 'wahls-paleo-uuid',
            rule_action: 'block',
            strictness: 'hard',
            rule_priority: 100,
            priority: 100,
            is_active: true,
            updated_at: '2026-01-31T00:00:00Z',
            category: {
              id: 'cat-soy',
              code: 'wahls_forbidden_soy',
              name_nl: 'Wahls Verboden: Soja',
              category_type: 'forbidden',
              items: [
                {
                  term: 'soy',
                  term_nl: 'soja',
                  synonyms: ['soja', 'soy', 'soybean'],
                  is_active: true,
                },
                {
                  term: 'tofu',
                  term_nl: 'tofu',
                  synonyms: ['tofu', 'bean curd'],
                  is_active: true,
                },
                {
                  term: 'tempeh',
                  term_nl: 'tempeh',
                  synonyms: ['tempeh'],
                  is_active: true,
                },
              ],
            },
          },
          // Forbidden: Added Sugar (hard block, priority 100)
          {
            id: 'constraint-sugar',
            diet_type_id: 'wahls-paleo-uuid',
            rule_action: 'block',
            strictness: 'hard',
            rule_priority: 100,
            priority: 100,
            is_active: true,
            updated_at: '2026-01-31T00:00:00Z',
            category: {
              id: 'cat-sugar',
              code: 'wahls_forbidden_added_sugar',
              name_nl: 'Wahls Verboden: Toegevoegde Suiker',
              category_type: 'forbidden',
              items: [
                {
                  term: 'sugar',
                  term_nl: 'suiker',
                  synonyms: ['suiker', 'sugar', 'witte suiker', 'white sugar'],
                  is_active: true,
                },
                {
                  term: 'honey',
                  term_nl: 'honing',
                  synonyms: ['honing', 'honey'],
                  is_active: true,
                },
                {
                  term: 'syrup',
                  term_nl: 'siroop',
                  synonyms: ['siroop', 'syrup', 'maple syrup', 'agave'],
                  is_active: true,
                },
              ],
            },
          },
          // Limited: Legumes (soft warning, priority 60)
          {
            id: 'constraint-legumes',
            diet_type_id: 'wahls-paleo-uuid',
            rule_action: 'block',
            strictness: 'soft',
            rule_priority: 60,
            priority: 60,
            is_active: true,
            updated_at: '2026-01-31T00:00:00Z',
            category: {
              id: 'cat-legumes',
              code: 'wahls_limited_legumes',
              name_nl: 'Wahls Beperkt: Peulvruchten',
              category_type: 'forbidden',
              items: [
                {
                  term: 'lentils',
                  term_nl: 'linzen',
                  synonyms: ['linzen', 'lentils', 'red lentils', 'rode linzen'],
                  is_active: true,
                },
                {
                  term: 'beans',
                  term_nl: 'bonen',
                  synonyms: ['bonen', 'beans', 'black beans', 'zwarte bonen'],
                  is_active: true,
                },
                {
                  term: 'chickpeas',
                  term_nl: 'kikkererwten',
                  synonyms: ['kikkererwten', 'chickpeas', 'garbanzo beans'],
                  is_active: true,
                },
              ],
            },
          },
          // Limited: Non-Gluten Grains (soft warning, priority 60)
          {
            id: 'constraint-non-gluten-grains',
            diet_type_id: 'wahls-paleo-uuid',
            rule_action: 'block',
            strictness: 'soft',
            rule_priority: 60,
            priority: 60,
            is_active: true,
            updated_at: '2026-01-31T00:00:00Z',
            category: {
              id: 'cat-non-gluten-grains',
              code: 'wahls_limited_non_gluten_grains',
              name_nl: 'Wahls Beperkt: Non-Gluten Granen',
              category_type: 'forbidden',
              items: [
                {
                  term: 'rice',
                  term_nl: 'rijst',
                  synonyms: ['rijst', 'rice', 'white rice', 'witte rijst'],
                  is_active: true,
                },
                {
                  term: 'quinoa',
                  term_nl: 'quinoa',
                  synonyms: ['quinoa'],
                  is_active: true,
                },
                {
                  term: 'potato',
                  term_nl: 'aardappel',
                  synonyms: ['aardappel', 'potato', 'potatoes'],
                  is_active: true,
                },
              ],
            },
          },
          // Required: Leafy Greens (allow, priority 90)
          {
            id: 'constraint-leafy',
            diet_type_id: 'wahls-paleo-uuid',
            rule_action: 'allow',
            strictness: 'hard',
            rule_priority: 90,
            priority: 90,
            min_per_day: 3,
            is_active: true,
            updated_at: '2026-01-31T00:00:00Z',
            category: {
              id: 'cat-leafy',
              code: 'wahls_leafy_greens',
              name_nl: 'Wahls Bladgroenten',
              category_type: 'required',
              items: [
                {
                  term: 'spinach',
                  term_nl: 'spinazie',
                  synonyms: ['spinazie', 'spinach'],
                  is_active: true,
                },
                {
                  term: 'kale',
                  term_nl: 'boerenkool',
                  synonyms: ['boerenkool', 'kale'],
                  is_active: true,
                },
              ],
            },
          },
        ],
      };
    },
    async loadRecipeAdaptationRules() {
      return {
        rules: [
          {
            id: 'rule-gluten',
            diet_type_id: 'wahls-paleo-uuid',
            term: 'gluten',
            synonyms: ['wheat', 'spelt', 'rye', 'barley', 'pasta', 'bread'],
            rule_code: 'FORBIDDEN_GLUTEN',
            rule_label: 'Gluten verboden (Wahls Paleo)',
            substitution_suggestions: [],
            priority: 100,
            updated_at: '2026-01-31T00:00:00Z',
            is_active: true,
          },
          {
            id: 'rule-dairy',
            diet_type_id: 'wahls-paleo-uuid',
            term: 'dairy',
            synonyms: ['milk', 'melk', 'cheese', 'kaas', 'yoghurt', 'butter'],
            rule_code: 'FORBIDDEN_DAIRY',
            rule_label: 'Zuivel verboden (Wahls Paleo)',
            substitution_suggestions: [],
            priority: 100,
            updated_at: '2026-01-31T00:00:00Z',
            is_active: true,
          },
        ],
      };
    },
    async loadHeuristics() {
      return { heuristics: [] };
    },
  };
}

// ============================================================================
// Test Helpers
// ============================================================================

function createTextAtom(text: string, path: string): TextAtom {
  return {
    text: text.toLowerCase(),
    path,
    locale: 'nl',
  };
}

function createEvaluationContext(overrides?: Partial<EvaluationContext>): EvaluationContext {
  return {
    dietId: 'wahls-paleo-uuid',
    locale: 'nl',
    mode: 'recipe_adaptation',
    timestamp: '2026-01-31T12:00:00Z', // Fixed timestamp for determinism
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Wahls Paleo Ruleset Smoke Tests', () => {
  describe('Ruleset Loading', () => {
    it('should load ruleset successfully', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const input: LoadGuardrailsRulesetInput = {
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z', // Fixed timestamp for determinism
        repo: mockRepo,
      };

      const ruleset = await loadGuardrailsRuleset(input);

      // Assert ruleset structure
      assert.strictEqual(ruleset.dietId, 'wahls-paleo-uuid');
      assert(ruleset.rules.length > 0, 'Ruleset should have rules');
      assert.strictEqual(ruleset.provenance.source, 'database');
      assert(typeof ruleset.contentHash === 'string', 'Content hash should be a string');
      assert(ruleset.contentHash.length > 0, 'Content hash should not be empty');
    });

    it('should have stable content hash', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const input: LoadGuardrailsRulesetInput = {
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      };

      const ruleset1 = await loadGuardrailsRuleset(input);
      const ruleset2 = await loadGuardrailsRuleset(input);

      // Same input should produce same hash
      assert.strictEqual(
        ruleset1.contentHash,
        ruleset2.contentHash,
        'Content hash should be deterministic'
      );
    });

    it('should have provenance counts > 0', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const input: LoadGuardrailsRulesetInput = {
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      };

      const ruleset = await loadGuardrailsRuleset(input);

      // Check that we have rules from constraints
      const constraintRules = ruleset.rules.filter((r) =>
        r.id.startsWith('db:diet_category_constraints:')
      );
      assert(
        constraintRules.length > 0,
        `Should have constraint rules, got ${constraintRules.length}`
      );

      // Check that we have rules from recipe adaptation rules
      const recipeRules = ruleset.rules.filter((r) =>
        r.id.startsWith('db:recipe_adaptation_rules:')
      );
      assert(
        recipeRules.length > 0,
        `Should have recipe adaptation rules, got ${recipeRules.length}`
      );
    });
  });

  describe('Evaluation - Hard Blocks', () => {
    it('should block "brood" (gluten)', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const context = createEvaluationContext();
      const targets = {
        ingredient: [createTextAtom('brood', 'ingredients[0].name')],
        step: [],
        metadata: [],
      };

      const decision = evaluateGuardrails({ ruleset, context, targets });

      assert.strictEqual(decision.outcome, 'blocked', 'Should be blocked');
      assert.strictEqual(decision.ok, false, 'Should not be ok');
      assert(decision.matches.length > 0, 'Should have matches');
      assert(
        decision.reasonCodes.some((code) =>
          code.includes('FORBIDDEN') || code.includes('GLUTEN')
        ),
        `Should have forbidden reason code, got: ${decision.reasonCodes.join(', ')}`
      );
    });

    it('should block "wheat" (gluten)', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const context = createEvaluationContext();
      const targets = {
        ingredient: [createTextAtom('wheat', 'ingredients[0].name')],
        step: [],
        metadata: [],
      };

      const decision = evaluateGuardrails({ ruleset, context, targets });

      assert.strictEqual(decision.outcome, 'blocked', 'Should be blocked');
      assert.strictEqual(decision.ok, false, 'Should not be ok');
    });

    it('should block "kaas" (dairy)', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const context = createEvaluationContext();
      const targets = {
        ingredient: [createTextAtom('kaas', 'ingredients[0].name')],
        step: [],
        metadata: [],
      };

      const decision = evaluateGuardrails({ ruleset, context, targets });

      assert.strictEqual(decision.outcome, 'blocked', 'Should be blocked');
      assert.strictEqual(decision.ok, false, 'Should not be ok');
      assert(
        decision.reasonCodes.some((code) =>
          code.includes('FORBIDDEN') || code.includes('DAIRY')
        ),
        `Should have forbidden reason code, got: ${decision.reasonCodes.join(', ')}`
      );
    });

    it('should block "tofu" (soy)', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const context = createEvaluationContext();
      const targets = {
        ingredient: [createTextAtom('tofu', 'ingredients[0].name')],
        step: [],
        metadata: [],
      };

      const decision = evaluateGuardrails({ ruleset, context, targets });

      assert.strictEqual(decision.outcome, 'blocked', 'Should be blocked');
      assert.strictEqual(decision.ok, false, 'Should not be ok');
    });

    it('should block "suiker" (added sugar)', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const context = createEvaluationContext();
      const targets = {
        ingredient: [createTextAtom('suiker', 'ingredients[0].name')],
        step: [],
        metadata: [],
      };

      const decision = evaluateGuardrails({ ruleset, context, targets });

      assert.strictEqual(decision.outcome, 'blocked', 'Should be blocked');
      assert.strictEqual(decision.ok, false, 'Should not be ok');
    });
  });

  describe('Evaluation - Soft Warnings', () => {
    it('should warn "linzen" (limited legumes)', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const context = createEvaluationContext();
      const targets = {
        ingredient: [createTextAtom('linzen', 'ingredients[0].name')],
        step: [],
        metadata: [],
      };

      const decision = evaluateGuardrails({ ruleset, context, targets });

      assert.strictEqual(decision.outcome, 'warned', 'Should be warned');
      assert.strictEqual(decision.ok, true, 'Should be ok (soft never blocks)');
      assert(decision.matches.length > 0, 'Should have matches');
      assert(
        decision.reasonCodes.some((code) =>
          code.includes('DISCOURAGED') || code.includes('LIMITED')
        ),
        `Should have discouraged/limited reason code, got: ${decision.reasonCodes.join(', ')}`
      );
    });

    it('should warn "rijst" (limited non-gluten grains)', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const context = createEvaluationContext();
      const targets = {
        ingredient: [createTextAtom('rijst', 'ingredients[0].name')],
        step: [],
        metadata: [],
      };

      const decision = evaluateGuardrails({ ruleset, context, targets });

      assert.strictEqual(decision.outcome, 'warned', 'Should be warned');
      assert.strictEqual(decision.ok, true, 'Should be ok (soft never blocks)');
    });
  });

  describe('Evaluation - Allowed Items', () => {
    it('should allow "spinazie" (required leafy greens)', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const context = createEvaluationContext();
      const targets = {
        ingredient: [createTextAtom('spinazie', 'ingredients[0].name')],
        step: [],
        metadata: [],
      };

      const decision = evaluateGuardrails({ ruleset, context, targets });

      assert.strictEqual(decision.outcome, 'allowed', 'Should be allowed');
      assert.strictEqual(decision.ok, true, 'Should be ok');
    });

    it('should allow "kipfilet" (neutral ingredient)', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const context = createEvaluationContext();
      const targets = {
        ingredient: [createTextAtom('kipfilet', 'ingredients[0].name')],
        step: [],
        metadata: [],
      };

      const decision = evaluateGuardrails({ ruleset, context, targets });

      assert.strictEqual(decision.outcome, 'allowed', 'Should be allowed');
      assert.strictEqual(decision.ok, true, 'Should be ok');
    });
  });

  describe('Reason Codes', () => {
    it('should have correct reason codes for forbidden items', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const context = createEvaluationContext();
      const targets = {
        ingredient: [createTextAtom('pasta', 'ingredients[0].name')],
        step: [],
        metadata: [],
      };

      const decision = evaluateGuardrails({ ruleset, context, targets });

      assert(decision.reasonCodes.length > 0, 'Should have reason codes');
      // Should have FORBIDDEN or GLUTEN in reason codes
      const hasForbiddenCode = decision.reasonCodes.some(
        (code) => code.includes('FORBIDDEN') || code.includes('GLUTEN')
      );
      assert(
        hasForbiddenCode,
        `Should have forbidden reason code, got: ${decision.reasonCodes.join(', ')}`
      );
    });

    it('should have correct reason codes for limited items', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const context = createEvaluationContext();
      const targets = {
        ingredient: [createTextAtom('linzen', 'ingredients[0].name')],
        step: [],
        metadata: [],
      };

      const decision = evaluateGuardrails({ ruleset, context, targets });

      assert(decision.reasonCodes.length > 0, 'Should have reason codes');
      // Should have DISCOURAGED or LIMITED in reason codes
      const hasLimitedCode = decision.reasonCodes.some(
        (code) => code.includes('DISCOURAGED') || code.includes('LIMITED')
      );
      assert(
        hasLimitedCode,
        `Should have discouraged/limited reason code, got: ${decision.reasonCodes.join(', ')}`
      );
    });
  });

  describe('Critical Rules Verification', () => {
    it('should have gluten blocking rules', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const glutenRules = ruleset.rules.filter(
        (r) =>
          r.match.term === 'wheat' ||
          r.match.term === 'pasta' ||
          r.match.term === 'bread' ||
          r.match.synonyms?.some((s) => ['tarwe', 'brood', 'spaghetti'].includes(s))
      );

      assert(glutenRules.length > 0, 'Should have gluten blocking rules');
      assert(
        glutenRules.every((r) => r.action === 'block' && r.strictness === 'hard'),
        'All gluten rules should be hard blocks'
      );
    });

    it('should have dairy blocking rules', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const dairyRules = ruleset.rules.filter(
        (r) =>
          r.match.term === 'milk' ||
          r.match.term === 'cheese' ||
          r.match.term === 'butter' ||
          r.match.synonyms?.some((s) => ['melk', 'kaas', 'boter'].includes(s))
      );

      assert(dairyRules.length > 0, 'Should have dairy blocking rules');
      assert(
        dairyRules.every((r) => r.action === 'block' && r.strictness === 'hard'),
        'All dairy rules should be hard blocks'
      );
    });

    it('should have limited legumes warning rules', async () => {
      const mockRepo = createWahlsPaleoMockRepo();
      const ruleset = await loadGuardrailsRuleset({
        dietId: 'wahls-paleo-uuid',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-31T12:00:00Z',
        repo: mockRepo,
      });

      const legumesRules = ruleset.rules.filter(
        (r) =>
          r.match.term === 'lentils' ||
          r.match.term === 'beans' ||
          r.match.synonyms?.some((s) => ['linzen', 'bonen'].includes(s))
      );

      assert(legumesRules.length > 0, 'Should have legumes warning rules');
      assert(
        legumesRules.every((r) => r.action === 'block' && r.strictness === 'soft'),
        'All legumes rules should be soft warnings'
      );
    });
  });
});
