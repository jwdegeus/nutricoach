/**
 * Diet Validator - Tests
 *
 * Unit tests met minimale override-fixtures per scenario.
 * Productie gebruikt uitsluitend magician_validator_overrides (admin/DB) via loadMagicianOverrides().
 * Geen duplicatie van productiedata - tests verifiëren alleen de logica.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  findForbiddenMatches,
  normalizeForMatching,
  type DietRuleset,
  type SubstringFalsePositives,
} from './diet-validator';

/** Minimale fixtures per scenario - alleen wat nodig is voor de testlogica */
const FIXTURES = {
  pasta: {
    pasta: [
      'notenpasta',
      'noten pasta',
      'amandelpasta',
      'gember-knoflookpasta',
      'tomatenpasta',
      'tahin',
      'tahini',
    ],
  } as SubstringFalsePositives,
  bloemRijst: {
    rijst: ['bloemkoolrijst', 'bloemkool'],
    kool: ['bloemkoolrijst', 'bloemkool'],
  } as SubstringFalsePositives,
  bloem: {
    bloem: ['bloemkoolrijst', 'bloemkool', 'kool bloem', 'bloem kool'],
  } as SubstringFalsePositives,
  gluten: {
    gluten: ['glutenvrij', 'glutenvrije', 'gluten-free'],
  } as SubstringFalsePositives,
  yoghurt: {
    yoghurt: [
      'kokosyoghurt',
      'amandelyoghurt',
      'haveryoghurt',
      'sojayoghurt',
      'plantaardige yoghurt',
    ],
  } as SubstringFalsePositives,
  zoeteAardappel: {
    aardappel: [
      'zoete aardappel',
      'zoet aardappel',
      'aardappel zoete',
      'zoete_aardappel',
      'aardappel zoete gekookt',
      'zoete aardappel gekookt',
      'zoet aardappel gekookt',
      'sweet potato',
      'bataat',
    ],
    potato: [
      'sweet potato',
      'zoete aardappel',
      'zoet aardappel',
      'aardappel zoete gekookt',
      'zoete aardappel gekookt',
      'zoet aardappel gekookt',
      'batata doce',
      'bataat',
      'yam',
    ],
  } as SubstringFalsePositives,
};

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
        FIXTURES.pasta,
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
        FIXTURES.pasta,
      );
      assert.strictEqual(matches.length, 0, 'notenpasta is nut paste');
    });

    it('should NOT flag amandelpasta as gluten', () => {
      const matches = findForbiddenMatches(
        'amandelpasta',
        glutenRuleset,
        'ingredients',
        FIXTURES.pasta,
      );
      assert.strictEqual(matches.length, 0, 'amandelpasta is almond paste');
    });

    it('should NOT flag tomatenpasta as gluten', () => {
      const matches = findForbiddenMatches(
        'tomatenpasta',
        glutenRuleset,
        'ingredients',
        FIXTURES.pasta,
      );
      assert.strictEqual(matches.length, 0, 'tomatenpasta is tomato paste');
    });

    it('should NOT flag "noten pasta" (two words) as gluten', () => {
      const matches = findForbiddenMatches(
        'noten pasta',
        glutenRuleset,
        'ingredients',
        FIXTURES.pasta,
      );
      assert.strictEqual(matches.length, 0, 'noten pasta = nut paste');
    });

    it('should flag plain "pasta" as gluten', () => {
      const matches = findForbiddenMatches(
        'pasta',
        glutenRuleset,
        'ingredients',
        FIXTURES.pasta,
      );
      assert.strictEqual(matches.length, 1, 'pasta (noodle) should be flagged');
      assert.strictEqual(matches[0].term, 'pasta');
    });

    it('should flag spaghetti as gluten', () => {
      const matches = findForbiddenMatches(
        'spaghetti',
        glutenRuleset,
        'ingredients',
        FIXTURES.pasta,
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
        FIXTURES.bloemRijst,
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
        FIXTURES.bloemRijst,
      );
      assert.strictEqual(matches.length, 0, 'bloemkool is cabbage, not dairy');
    });

    it('should still flag plain rijst when rule has rijst as forbidden', () => {
      const matches = findForbiddenMatches(
        'rijst',
        dairyWithRijstRuleset,
        'ingredients',
        FIXTURES.bloemRijst,
      );
      assert.strictEqual(matches.length, 1, 'plain rijst should be flagged');
    });
  });

  describe('findForbiddenMatches - bloemkool vs gluten', () => {
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
        FIXTURES.bloem,
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
        FIXTURES.bloem,
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
        FIXTURES.bloem,
      );
      assert.strictEqual(matches.length, 1, 'tarwebloem should be flagged');
    });

    it('should NOT flag "Kool bloem- rauw" as gluten (bloemkool, word order)', () => {
      const matches = findForbiddenMatches(
        'Kool bloem- rauw',
        glutenRulesetWithBloem,
        'ingredients',
        FIXTURES.bloem,
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
        FIXTURES.bloem,
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
        FIXTURES.gluten,
      );
      assert.strictEqual(
        matches.length,
        0,
        'glutenvrije pannenkoekenmix is gluten-free',
      );
    });

    it('should NOT flag glutenvrij brood as gluten', () => {
      const matches = findForbiddenMatches(
        'glutenvrij brood',
        glutenRulesetWithBloem,
        'ingredients',
        FIXTURES.gluten,
      );
      assert.strictEqual(matches.length, 0, 'glutenvrij brood is gluten-free');
    });

    it('should NOT flag gluten-free bread as gluten', () => {
      const matches = findForbiddenMatches(
        'gluten-free bread',
        glutenRulesetWithBloem,
        'ingredients',
        FIXTURES.gluten,
      );
      assert.strictEqual(matches.length, 0, 'gluten-free bread is allowed');
    });

    it('should still flag plain brood as gluten', () => {
      const matches = findForbiddenMatches(
        'brood',
        glutenRulesetWithBloem,
        'ingredients',
        FIXTURES.gluten,
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
        FIXTURES.yoghurt,
      );
      assert.strictEqual(
        matches.length,
        0,
        'kokosyoghurt is dairy alternative',
      );
    });

    it('should NOT flag amandelyoghurt as zuivel', () => {
      const matches = findForbiddenMatches(
        'amandelyoghurt',
        dairyRuleset,
        'ingredients',
        FIXTURES.yoghurt,
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
        FIXTURES.yoghurt,
      );
      assert.strictEqual(matches.length, 1, 'plain yoghurt should be flagged');
    });
  });

  describe('findForbiddenMatches - zoete aardappel (nachtschade override)', () => {
    const nachtschadeRuleset: DietRuleset = {
      dietId: 'test-diet',
      version: 1,
      forbidden: [
        {
          term: 'nachtschade',
          synonyms: ['aardappel', 'potato', 'tomaat', 'paprika'],
          ruleCode: 'wahls_forbidden_nightshade',
          ruleLabel: 'Nachtschade',
          substitutionSuggestions: ['zoete aardappel'],
        },
      ],
    };

    it('should NOT flag zoete_aardappel as nachtschade', () => {
      const matches = findForbiddenMatches(
        'zoete_aardappel',
        nachtschadeRuleset,
        'ingredients',
        FIXTURES.zoeteAardappel,
      );
      assert.strictEqual(
        matches.length,
        0,
        'zoete aardappel is geen nachtschade',
      );
    });

    it('should NOT flag zoete aardappel as nachtschade', () => {
      const matches = findForbiddenMatches(
        'zoete aardappel',
        nachtschadeRuleset,
        'ingredients',
        FIXTURES.zoeteAardappel,
      );
      assert.strictEqual(
        matches.length,
        0,
        'zoete aardappel is geen nachtschade',
      );
    });

    it('should NOT flag zoet aardappel gekookt as nachtschade', () => {
      const matches = findForbiddenMatches(
        'zoet aardappel gekookt',
        nachtschadeRuleset,
        'ingredients',
        FIXTURES.zoeteAardappel,
      );
      assert.strictEqual(
        matches.length,
        0,
        'zoet aardappel gekookt is geen nachtschade',
      );
    });

    it('should NOT flag aardappel zoete gekookt as nachtschade', () => {
      const matches = findForbiddenMatches(
        'aardappel zoete gekookt',
        nachtschadeRuleset,
        'ingredients',
        FIXTURES.zoeteAardappel,
      );
      assert.strictEqual(
        matches.length,
        0,
        'aardappel zoete gekookt is geen nachtschade',
      );
    });

    it('should NOT flag aardappel, zoete, gekookt (met kommas) as nachtschade', () => {
      const matches = findForbiddenMatches(
        'aardappel, zoete, gekookt',
        nachtschadeRuleset,
        'ingredients',
        FIXTURES.zoeteAardappel,
      );
      assert.strictEqual(
        matches.length,
        0,
        'aardappel, zoete, gekookt (kommas) is zoete aardappel, geen nachtschade',
      );
    });

    it('should still flag plain aardappel as nachtschade', () => {
      const matches = findForbiddenMatches(
        'aardappel',
        nachtschadeRuleset,
        'ingredients',
        FIXTURES.zoeteAardappel,
      );
      assert.strictEqual(matches.length, 1, 'gewone aardappel is nachtschade');
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
