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

  describe('findForbiddenMatches - bloemkoolrijst vs rijst', () => {
    const dairyWithRijstRuleset: DietRuleset = {
      dietId: 'test-diet',
      version: 1,
      forbidden: [
        {
          term: 'dairy',
          synonyms: ['melk', 'kaas', 'rijst'],
          ruleCode: 'wahls_forbidden_dairy',
          ruleLabel: 'Zuivel (Strikt verboden)',
          substitutionSuggestions: ['amandelmelk'],
        },
      ],
    };

    it('should NOT flag bloemkoolrijst as dairy (cauliflower rice is vegetable)', () => {
      const matches = findForbiddenMatches(
        'bloemkoolrijst',
        dairyWithRijstRuleset,
        'ingredients',
      );
      assert.strictEqual(
        matches.length,
        0,
        'bloemkoolrijst is cauliflower rice, not dairy',
      );
    });

    it('should NOT flag bloemkool as dairy', () => {
      const matches = findForbiddenMatches(
        'bloemkool',
        dairyWithRijstRuleset,
        'ingredients',
      );
      assert.strictEqual(matches.length, 0, 'bloemkool is cabbage, not dairy');
    });

    it('should still flag plain rijst when rule has rijst as forbidden', () => {
      const matches = findForbiddenMatches(
        'rijst',
        dairyWithRijstRuleset,
        'ingredients',
      );
      assert.strictEqual(matches.length, 1, 'plain rijst should be flagged');
    });
  });

  describe('findForbiddenMatches - bloemkoolrijst vs gluten', () => {
    const glutenRulesetWithBloem: DietRuleset = {
      dietId: 'test-diet',
      version: 1,
      forbidden: [
        {
          term: 'gluten',
          synonyms: ['tarwe', 'bloem', 'pasta', 'brood'],
          ruleCode: 'wahls_forbidden_gluten',
          ruleLabel: 'Gluten (Strikt verboden)',
          substitutionSuggestions: ['courgette noodles'],
        },
      ],
    };

    it('should NOT flag bloemkoolrijst as gluten (cauliflower rice is vegetable)', () => {
      const matches = findForbiddenMatches(
        'bloemkoolrijst',
        glutenRulesetWithBloem,
        'ingredients',
      );
      assert.strictEqual(
        matches.length,
        0,
        'bloemkoolrijst is cauliflower rice, not gluten',
      );
    });

    it('should NOT flag bloemkool as gluten', () => {
      const matches = findForbiddenMatches(
        'bloemkool',
        glutenRulesetWithBloem,
        'ingredients',
      );
      assert.strictEqual(
        matches.length,
        0,
        'bloemkool is vegetable, not gluten',
      );
    });

    it('should still flag plain bloem (flour) as gluten', () => {
      const matches = findForbiddenMatches(
        'tarwebloem',
        glutenRulesetWithBloem,
        'ingredients',
      );
      assert.strictEqual(matches.length, 1, 'tarwebloem should be flagged');
    });

    it('should NOT flag "Kool bloem- rauw" as gluten (bloemkool, word order)', () => {
      const matches = findForbiddenMatches(
        'Kool bloem- rauw',
        glutenRulesetWithBloem,
        'ingredients',
      );
      assert.strictEqual(
        matches.length,
        0,
        'kool bloem = bloemkool (cauliflower), not flour/gluten',
      );
    });

    it('should NOT flag "kool bloem rauw" as gluten (bloemkool)', () => {
      const matches = findForbiddenMatches(
        'kool bloem rauw',
        glutenRulesetWithBloem,
        'ingredients',
      );
      assert.strictEqual(
        matches.length,
        0,
        'kool bloem = bloemkool (cauliflower), not gluten',
      );
    });
  });

  describe('findForbiddenMatches - glutenvrij(e) / gluten-free in naam', () => {
    const glutenRulesetWithBloem: DietRuleset = {
      dietId: 'test-diet',
      version: 1,
      forbidden: [
        {
          term: 'gluten',
          synonyms: ['tarwe', 'bloem', 'pasta', 'brood'],
          ruleCode: 'wahls_forbidden_gluten',
          ruleLabel: 'Gluten (Strikt verboden)',
          substitutionSuggestions: ['courgette noodles'],
        },
      ],
    };

    it('should NOT flag glutenvrije pannenkoekenmix as gluten', () => {
      const matches = findForbiddenMatches(
        'glutenvrije pannenkoekenmix',
        glutenRulesetWithBloem,
        'ingredients',
      );
      assert.strictEqual(
        matches.length,
        0,
        'glutenvrije pannenkoekenmix is gluten-free, so allowed under gluten rule',
      );
    });

    it('should NOT flag glutenvrij brood as gluten', () => {
      const matches = findForbiddenMatches(
        'glutenvrij brood',
        glutenRulesetWithBloem,
        'ingredients',
      );
      assert.strictEqual(
        matches.length,
        0,
        'glutenvrij brood is gluten-free, so allowed',
      );
    });

    it('should NOT flag gluten-free bread as gluten', () => {
      const matches = findForbiddenMatches(
        'gluten-free bread',
        glutenRulesetWithBloem,
        'ingredients',
      );
      assert.strictEqual(
        matches.length,
        0,
        'gluten-free bread is allowed under gluten rule',
      );
    });

    it('should still flag plain brood as gluten', () => {
      const matches = findForbiddenMatches(
        'brood',
        glutenRulesetWithBloem,
        'ingredients',
      );
      assert.strictEqual(matches.length, 1, 'plain brood should be flagged');
    });
  });

  describe('findForbiddenMatches - kokosyoghurt vs zuivel (dairy alternative)', () => {
    const dairyRuleset: DietRuleset = {
      dietId: 'test-diet',
      version: 1,
      forbidden: [
        {
          term: 'dairy',
          synonyms: ['melk', 'kaas', 'yoghurt', 'boter'],
          ruleCode: 'wahls_forbidden_dairy',
          ruleLabel: 'Zuivel (Strikt verboden)',
          substitutionSuggestions: ['amandelmelk', 'kokosyoghurt'],
        },
      ],
    };

    it('should NOT flag Kokosyoghurt (ongezoet) as zuivel (dairy alternative)', () => {
      const matches = findForbiddenMatches(
        'Kokosyoghurt (ongezoet)',
        dairyRuleset,
        'ingredients',
      );
      assert.strictEqual(
        matches.length,
        0,
        'kokosyoghurt is dairy alternative, not zuivel',
      );
    });

    it('should NOT flag amandelyoghurt as zuivel', () => {
      const matches = findForbiddenMatches(
        'amandelyoghurt',
        dairyRuleset,
        'ingredients',
      );
      assert.strictEqual(
        matches.length,
        0,
        'amandelyoghurt is dairy alternative',
      );
    });

    it('should still flag plain yoghurt as zuivel', () => {
      const matches = findForbiddenMatches(
        'yoghurt',
        dairyRuleset,
        'ingredients',
      );
      assert.strictEqual(matches.length, 1, 'plain yoghurt should be flagged');
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
