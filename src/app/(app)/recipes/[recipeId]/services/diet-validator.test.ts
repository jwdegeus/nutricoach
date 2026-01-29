/**
 * Diet Validator - Tests
 *
 * Inclusief pasta-as-paste: notenpasta, amandelpasta, gember-knoflookpasta
 * mogen niet als glutenproduct worden gematcht.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  findForbiddenMatches,
  normalizeForMatching,
  type DietRuleset,
} from './diet-validator';

const glutenRuleset: DietRuleset = {
  dietId: 'test-diet',
  version: 1,
  forbidden: [
    {
      term: 'pasta',
      synonyms: ['spaghetti', 'penne', 'macaroni'],
      ruleCode: 'wahls_forbidden_gluten',
      ruleLabel: 'Gluten',
      substitutionSuggestions: ['rijstnoedels', 'zucchininoedels'],
    },
  ],
};

describe('Diet Validator', () => {
  describe('findForbiddenMatches - pasta vs pasta-as-paste', () => {
    it('should NOT flag gember-knoflookpasta as gluten (paste, not noodle)', () => {
      const matches = findForbiddenMatches(
        'gember-knoflookpasta',
        glutenRuleset,
        'ingredients',
      );
      assert.strictEqual(
        matches.length,
        0,
        'gember-knoflookpasta is paste, not gluten pasta',
      );
    });

    it('should NOT flag notenpasta as gluten', () => {
      const matches = findForbiddenMatches(
        'notenpasta',
        glutenRuleset,
        'ingredients',
      );
      assert.strictEqual(matches.length, 0, 'notenpasta is nut paste');
    });

    it('should NOT flag amandelpasta as gluten', () => {
      const matches = findForbiddenMatches(
        'amandelpasta',
        glutenRuleset,
        'ingredients',
      );
      assert.strictEqual(matches.length, 0, 'amandelpasta is almond paste');
    });

    it('should NOT flag tomatenpasta as gluten', () => {
      const matches = findForbiddenMatches(
        'tomatenpasta',
        glutenRuleset,
        'ingredients',
      );
      assert.strictEqual(matches.length, 0, 'tomatenpasta is tomato paste');
    });

    it('should NOT flag "noten pasta" (two words) as gluten', () => {
      const matches = findForbiddenMatches(
        'noten pasta',
        glutenRuleset,
        'ingredients',
      );
      assert.strictEqual(matches.length, 0, 'noten pasta = nut paste');
    });

    it('should flag plain "pasta" as gluten', () => {
      const matches = findForbiddenMatches(
        'pasta',
        glutenRuleset,
        'ingredients',
      );
      assert.strictEqual(matches.length, 1, 'pasta (noodle) should be flagged');
      assert.strictEqual(matches[0].term, 'pasta');
    });

    it('should flag spaghetti as gluten', () => {
      const matches = findForbiddenMatches(
        'spaghetti',
        glutenRuleset,
        'ingredients',
      );
      assert.strictEqual(matches.length, 1, 'spaghetti is gluten pasta');
      assert.strictEqual(matches[0].term, 'pasta');
    });
  });

  describe('normalizeForMatching', () => {
    it('should lowercase and collapse spaces', () => {
      assert.strictEqual(
        normalizeForMatching('  Pasta  Carbonara  '),
        'pasta carbonara',
      );
    });
  });
});
