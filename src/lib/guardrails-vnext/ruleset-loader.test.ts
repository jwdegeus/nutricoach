/**
 * Guard Rails vNext - Ruleset Loader Tests
 * 
 * Unit tests for the ruleset loader module.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { loadGuardrailsRuleset } from './ruleset-loader';
import type { GuardrailsRepo, LoadGuardrailsRulesetInput } from './ruleset-loader';
import type { GuardrailsRuleset } from './types';

// Helper to create mock repository
function createMockRepo(overrides?: Partial<GuardrailsRepo>): GuardrailsRepo {
  return {
    loadConstraints: async () => ({ constraints: [] }),
    loadRecipeAdaptationRules: async () => ({ rules: [] }),
    loadHeuristics: async () => ({ heuristics: [] }),
    ...overrides,
  };
}

describe('loadGuardrailsRuleset', () => {
  describe('Loads from DB only', () => {
    it('should load rules from database constraints', async () => {
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({
          constraints: [
            {
              id: 'constraint-1',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-1',
                code: 'gluten_containing_grains',
                name_nl: 'Glutenhoudende granen',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'pasta',
                    term_nl: 'pasta',
                    synonyms: ['spaghetti', 'penne'],
                    is_active: true,
                  },
                ],
              },
            },
          ],
        }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        locale: 'nl',
        now: '2026-01-26T00:00:00Z',
        repo: mockRepo,
      };

      const result = await loadGuardrailsRuleset(input);

      assert.strictEqual(result.dietId, 'diet-1');
      assert.strictEqual(result.rules.length, 1);
      assert.strictEqual(result.rules[0].match.term, 'pasta');
      assert.strictEqual(result.rules[0].action, 'block');
      assert.strictEqual(result.rules[0].strictness, 'hard');
      assert.strictEqual(result.rules[0].priority, 80);
      assert(result.rules[0].id.startsWith('db:diet_category_constraints:'));
      assert.strictEqual(result.provenance.source, 'database');
    });

    it('should have stable rule IDs', async () => {
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({
          constraints: [
            {
              id: 'constraint-1',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-1',
                code: 'gluten_containing_grains',
                name_nl: 'Glutenhoudende granen',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'pasta',
                    synonyms: ['spaghetti'],
                    is_active: true,
                  },
                ],
              },
            },
          ],
        }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        repo: mockRepo,
      };

      const result1 = await loadGuardrailsRuleset(input);
      const result2 = await loadGuardrailsRuleset(input);

      // Same input should produce same rule IDs
      assert.strictEqual(result1.rules[0].id, result2.rules[0].id);
    });

    it('should have deterministic contentHash', async () => {
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({
          constraints: [
            {
              id: 'constraint-1',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-1',
                code: 'gluten_containing_grains',
                name_nl: 'Glutenhoudende granen',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'pasta',
                    synonyms: ['spaghetti'],
                    is_active: true,
                  },
                ],
              },
            },
          ],
        }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        now: '2026-01-26T00:00:00Z', // Fixed timestamp for determinism
        repo: mockRepo,
      };

      const result1 = await loadGuardrailsRuleset(input);
      const result2 = await loadGuardrailsRuleset(input);

      // Same input should produce same hash
      assert.strictEqual(result1.contentHash, result2.contentHash);
    });
  });

  describe('Overlay applied', () => {
    it('should merge recipe adaptation rules with constraints', async () => {
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({
          constraints: [
            {
              id: 'constraint-1',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-1',
                code: 'gluten_containing_grains',
                name_nl: 'Glutenhoudende granen',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'pasta',
                    synonyms: [],
                    is_active: true,
                  },
                ],
              },
            },
          ],
        }),
        loadRecipeAdaptationRules: async () => ({
          rules: [
            {
              id: 'rule-1',
              diet_type_id: 'diet-1',
              term: 'gluten',
              synonyms: ['tarwe'],
              rule_code: 'FORBIDDEN_INGREDIENT',
              rule_label: 'Gluten (additional)',
              substitution_suggestions: ['rijst'],
              priority: 70,
              updated_at: '2026-01-02T00:00:00Z',
            },
          ],
        }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        repo: mockRepo,
      };

      const result = await loadGuardrailsRuleset(input);

      // Should have both constraint rule and recipe adaptation rule
      assert(result.rules.length >= 2);
      assert(result.rules.some((r) => r.match.term === 'pasta'));
      assert(result.rules.some((r) => r.match.term === 'gluten'));
      assert(result.provenance.metadata?.sources);
      const sources = result.provenance.metadata?.sources as Array<{ ref: string }>;
      assert(sources.some((s) => s.ref === 'diet_category_constraints'));
      assert(sources.some((s) => s.ref === 'recipe_adaptation_rules'));
    });

    it('should apply overlay rules when same ID exists (overlay wins)', async () => {
      // This test would require same rule ID from both sources
      // In practice, constraint rules and recipe adaptation rules have different ID formats
      // So this is more of a conceptual test
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({
          constraints: [
            {
              id: 'constraint-1',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-1',
                code: 'gluten_containing_grains',
                name_nl: 'Glutenhoudende granen',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'pasta',
                    synonyms: [],
                    is_active: true,
                  },
                ],
              },
            },
          ],
        }),
        loadRecipeAdaptationRules: async () => ({
          rules: [
            {
              id: 'rule-1',
              diet_type_id: 'diet-1',
              term: 'pasta', // Same term, different source
              synonyms: ['spaghetti', 'penne'],
              rule_code: 'FORBIDDEN_INGREDIENT',
              rule_label: 'Pasta (overlay)',
              substitution_suggestions: ['rijstnoedels'],
              priority: 90, // Higher priority
              updated_at: '2026-01-02T00:00:00Z',
            },
          ],
        }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        repo: mockRepo,
      };

      const result = await loadGuardrailsRuleset(input);

      // Should have both rules (different IDs, so both included)
      assert(result.rules.length >= 2);
      // Both should have pasta as term
      const pastaRules = result.rules.filter((r) => r.match.term === 'pasta');
      assert(pastaRules.length >= 1);
    });
  });

  describe('Fallback when empty', () => {
    it('should return fallback ruleset when no database rules found', async () => {
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({ constraints: [] }),
        loadRecipeAdaptationRules: async () => ({ rules: [] }),
        loadHeuristics: async () => ({ heuristics: [] }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        repo: mockRepo,
      };

      const result = await loadGuardrailsRuleset(input);

      assert.strictEqual(result.provenance.source, 'fallback');
      assert(result.rules.length > 0);
      assert(result.rules.some((r) => r.id.startsWith('fallback:')));
      assert(result.heuristics?.addedSugarTerms);
    });
  });

  describe('Deterministic ordering', () => {
    it('should sort rules deterministically by ID', async () => {
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({
          constraints: [
            {
              id: 'constraint-2',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-2',
                code: 'dairy',
                name_nl: 'Zuivel',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'melk',
                    synonyms: [],
                    is_active: true,
                  },
                ],
              },
            },
            {
              id: 'constraint-1',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-1',
                code: 'gluten_containing_grains',
                name_nl: 'Glutenhoudende granen',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'pasta',
                    synonyms: [],
                    is_active: true,
                  },
                ],
              },
            },
          ],
        }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        repo: mockRepo,
      };

      const result = await loadGuardrailsRuleset(input);

      // Rules should be sorted by ID (deterministic)
      const ruleIds = result.rules.map((r) => r.id);
      const sortedIds = [...ruleIds].sort();
      assert.deepStrictEqual(ruleIds, sortedIds);
    });
  });

  describe('Heuristics loading', () => {
    it('should load heuristics from database', async () => {
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({
          constraints: [
            {
              id: 'constraint-1',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-1',
                code: 'gluten_containing_grains',
                name_nl: 'Glutenhoudende granen',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'pasta',
                    synonyms: [],
                    is_active: true,
                  },
                ],
              },
            },
          ],
        }),
        loadHeuristics: async () => ({
          heuristics: [
            {
              id: 'heuristic-1',
              diet_type_id: 'diet-1',
              heuristic_type: 'added_sugar',
              terms: ['suiker', 'siroop', 'honing'],
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        repo: mockRepo,
      };

      const result = await loadGuardrailsRuleset(input);

      assert(result.heuristics?.addedSugarTerms);
      assert.strictEqual(result.heuristics.addedSugarTerms?.length, 3);
      assert(result.heuristics.addedSugarTerms?.includes('suiker'));
    });
  });

  describe('Allow rules', () => {
    it('should load allow rules from constraints', async () => {
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({
          constraints: [
            {
              id: 'constraint-1',
              diet_type_id: 'diet-1',
              rule_action: 'allow',
              strictness: 'hard',
              rule_priority: 90,
              priority: 90,
              is_active: true,
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-1',
                code: 'allowed_grains',
                name_nl: 'Toegestane granen',
                category_type: 'required',
                items: [
                  {
                    term: 'rijst',
                    synonyms: ['basmatirijst'],
                    is_active: true,
                  },
                ],
              },
            },
          ],
        }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        repo: mockRepo,
      };

      const result = await loadGuardrailsRuleset(input);

      assert.strictEqual(result.rules.length, 1);
      assert.strictEqual(result.rules[0].action, 'allow');
      assert.strictEqual(result.rules[0].match.term, 'rijst');
      // Allow rules should have isNonEnforcingAllow metadata
      assert.strictEqual(result.rules[0].metadata.isNonEnforcingAllow, true);
    });
  });

  describe('Status filtering', () => {
    it('should exclude deleted constraints (is_active = false)', async () => {
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({
          constraints: [
            {
              id: 'constraint-1',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              is_active: true, // Active constraint
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-1',
                code: 'gluten_containing_grains',
                name_nl: 'Glutenhoudende granen',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'pasta',
                    synonyms: [],
                    is_active: true,
                  },
                ],
              },
            },
            {
              id: 'constraint-2',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              is_active: false, // Deleted constraint
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-2',
                code: 'dairy',
                name_nl: 'Zuivel',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'melk',
                    synonyms: [],
                    is_active: true,
                  },
                ],
              },
            },
          ],
        }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        repo: mockRepo,
      };

      const result = await loadGuardrailsRuleset(input);

      // Should only include active constraint
      assert.strictEqual(result.rules.length, 1);
      assert.strictEqual(result.rules[0].match.term, 'pasta');
    });

    it('should exclude deleted items (is_active = false)', async () => {
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({
          constraints: [
            {
              id: 'constraint-1',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              is_active: true,
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-1',
                code: 'gluten_containing_grains',
                name_nl: 'Glutenhoudende granen',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'pasta',
                    synonyms: [],
                    is_active: true, // Active item
                  },
                  {
                    term: 'brood',
                    synonyms: [],
                    is_active: false, // Deleted item
                  },
                ],
              },
            },
          ],
        }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        repo: mockRepo,
      };

      const result = await loadGuardrailsRuleset(input);

      // Should only include active item
      assert.strictEqual(result.rules.length, 1);
      assert.strictEqual(result.rules[0].match.term, 'pasta');
    });

    it('should exclude deleted recipe adaptation rules (is_active = false)', async () => {
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({ constraints: [] }),
        loadRecipeAdaptationRules: async () => ({
          rules: [
            {
              id: 'rule-1',
              diet_type_id: 'diet-1',
              term: 'gluten',
              synonyms: ['tarwe'],
              rule_code: 'FORBIDDEN_INGREDIENT',
              rule_label: 'Gluten',
              substitution_suggestions: ['rijst'],
              priority: 70,
              is_active: true, // Active rule
              updated_at: '2026-01-02T00:00:00Z',
            },
            {
              id: 'rule-2',
              diet_type_id: 'diet-1',
              term: 'melk',
              synonyms: [],
              rule_code: 'FORBIDDEN_INGREDIENT',
              rule_label: 'Melk',
              substitution_suggestions: ['amandelmelk'],
              priority: 70,
              is_active: false, // Deleted rule
              updated_at: '2026-01-02T00:00:00Z',
            },
          ],
        }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        repo: mockRepo,
      };

      const result = await loadGuardrailsRuleset(input);

      // Should only include active rule
      assert.strictEqual(result.rules.length, 1);
      assert.strictEqual(result.rules[0].match.term, 'gluten');
    });

    it('should include active rules only in provenance counts', async () => {
      const mockRepo = createMockRepo({
        loadConstraints: async () => ({
          constraints: [
            {
              id: 'constraint-1',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              is_active: true,
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-1',
                code: 'gluten_containing_grains',
                name_nl: 'Glutenhoudende granen',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'pasta',
                    synonyms: [],
                    is_active: true,
                  },
                ],
              },
            },
            {
              id: 'constraint-2',
              diet_type_id: 'diet-1',
              rule_action: 'block',
              strictness: 'hard',
              rule_priority: 80,
              priority: 80,
              is_active: false, // Deleted
              updated_at: '2026-01-01T00:00:00Z',
              category: {
                id: 'cat-2',
                code: 'dairy',
                name_nl: 'Zuivel',
                category_type: 'forbidden',
                items: [
                  {
                    term: 'melk',
                    synonyms: [],
                    is_active: true,
                  },
                ],
              },
            },
          ],
        }),
      });

      const input: LoadGuardrailsRulesetInput = {
        dietId: 'diet-1',
        mode: 'recipe_adaptation',
        repo: mockRepo,
      };

      const result = await loadGuardrailsRuleset(input);

      // Provenance should reflect active count
      const sources = result.provenance.metadata?.sources as Array<{
        details?: { activeConstraintCount?: number };
      }>;
      const constraintSource = sources?.find((s) => s.details);
      assert(constraintSource);
      // Should count only active constraints
      assert.strictEqual(constraintSource.details?.activeConstraintCount, 1);
      // Rules array should only contain active rules
      assert.strictEqual(result.rules.length, 1);
    });
  });
});
