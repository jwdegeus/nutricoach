/**
 * Diet Validator
 *
 * Validates recipe adaptation drafts against diet rulesets.
 * Server-only module for strict ingredient checking.
 */

import 'server-only';
import type { RecipeAdaptationDraft } from '../recipe-ai.types';

/**
 * Diet ruleset representation
 * Contains forbidden ingredients, synonyms, and substitution suggestions
 */
export type DietRuleset = {
  dietId: string;
  version: number;
  forbidden: Array<{
    term: string;
    synonyms?: string[];
    ruleCode: string;
    ruleLabel: string;
    substitutionSuggestions?: string[];
  }>;
  heuristics?: {
    addedSugarTerms: string[];
  };
};

/**
 * Validation report from diet validator
 */
export type ValidationReport = {
  ok: boolean;
  matches: Array<{
    term: string;
    matched: string;
    where: 'ingredients' | 'steps';
    ruleCode?: string;
    ruleLabel?: string;
    substitutionSuggestions?: string[];
    allowedAlternativeInText?: string;
  }>;
  summary: string;
};

/**
 * Extra synoniemen voor ingrediënten-matching.
 * Keys zijn zowel NL als EN: ruleset uit DB gebruikt vaak Engelse termen (cheese, sugar, corn, soy),
 * recepten gebruiken vaak Nederlandse namen (mozzarella, honing, maiskorrels, sojasaus).
 * Wordt gebruikt voor substring-matching: "verse mozzarella" matcht via cheese→mozzarella.
 */
const EXTRA_INGREDIENT_SYNONYMS: Record<string, string[]> = {
  // Nederlands (als ruleset term "kaas" gebruikt)
  kaas: [
    'mozzarella',
    'geitenkaas',
    'blauwe kaas',
    'feta',
    'parmezaan',
    'cheddar',
    'brie',
    'camembert',
    'roomkaas',
    'buffalo mozzarella',
    'verse mozzarella',
  ],
  suiker: [
    'honing',
    'ahornsiroop',
    'agavesiroop',
    'maissiroop',
    'rietsuiker',
    'basterdsuiker',
    'poedersuiker',
  ],
  mais: ['maiskorrels', 'maïs', 'corn', 'corn kernels', 'maismeel', 'cornmeal'],
  paprika: [
    'paprikapoeder',
    'zoete paprika',
    'gerookte paprikapoeder',
    'zoete paprikapoeder',
    'sweet paprika',
    'groene paprika',
    'rode paprika',
    'gele paprika',
    "paprika's",
    'paprikas',
    'bell pepper',
    'bell peppers',
  ],
  tomaat: ['cherrytomaat', 'cherrytomaatjes', 'tomaatjes', 'tomaten'],
  soja: ['sojasaus', 'tamari', 'ketjap', 'sojabonen'],
  // Engels (ruleset uit ingredient_category_items gebruikt vaak Engelse term)
  cheese: [
    'mozzarella',
    'geitenkaas',
    'blauwe kaas',
    'feta',
    'parmezaan',
    'cheddar',
    'brie',
    'camembert',
    'roomkaas',
    'buffalo mozzarella',
    'verse mozzarella',
  ],
  dairy: [
    'mozzarella',
    'melk',
    'yoghurt',
    'boter',
    'room',
    'kaas',
    'geitenkaas',
    'feta',
  ],
  sugar: [
    'honing',
    'ahornsiroop',
    'agavesiroop',
    'maissiroop',
    'rietsuiker',
    'basterdsuiker',
    'poedersuiker',
    'maple syrup',
    'agave',
  ],
  corn: ['maiskorrels', 'maïs', 'corn', 'corn kernels', 'maismeel', 'cornmeal'],
  soy: ['sojasaus', 'tamari', 'ketjap', 'sojabonen', 'tofu', 'tempeh', 'miso'],
  tomato: [
    'cherrytomaat',
    'cherrytomaatjes',
    'cherry tomato',
    'tomaatjes',
    'tomaten',
    'tomatoes',
  ],
};

/**
 * False positives voor substring-match: als de tekst één van deze strings bevat, dan is
 * een match op de key géén echte violation (bijv. "bloem" in "zonnebloempitten" = zaden).
 * Waarde is string of string[] voor meerdere uitsluitpatronen.
 */
const SUBSTRING_FALSE_POSITIVE_IF_CONTAINS: Record<string, string | string[]> =
  {
    // "bloem" in "zonnebloem" = zaden; in "bloemkool(rijst)" = groente (geen tarwe)
    // "kool bloem" / "bloem kool" = bloemkool (word order / typo), zie ook isBloemkoolRelated
    bloem: [
      'zonnebloem',
      'bloemkoolrijst',
      'bloemkool',
      'kool bloem',
      'bloem kool',
    ],
    // "ei" in "rijpe" (ripe), "romeinse" (Romaine), "avocado" = geen eieren
    // "ei" in "kleine" (small) = "1/2 kleine wortel" (carrot), "kleine ui" = groente, geen eieren
    // "ei" in "wortel" niet direct, maar "kleine wortel" matcht via "kleine"
    ei: [
      'romeinse',
      'romaine',
      'rijpe',
      'rijp',
      'avocado',
      'kleine',
      'wortel',
      'weinig',
    ],
    // "ijs" in "ijsblokjes" = ijsblokjes (ice cubes), geen zuivel; "ijs" in "radijs" = radijs (radish)
    ijs: ['radijs', 'ijsblokjes', 'ijsblokje'],
    oca: 'avocado',
    // "rijst" in "bloemkoolrijst" = groente (cauliflower rice), geen graan; "rijstazijn" = azijn, geen zuivel/graan
    rijst: ['bloemkoolrijst', 'bloemkool', 'rijstazijn'],
    // "kool" in "bloemkool" = bloemkool (cauliflower), geen gewone kool/zuivel
    kool: ['bloemkoolrijst', 'bloemkool'],
    // Zuivelalternatieven: bevatten "yoghurt"/"melk" maar zijn geen zuivel
    yoghurt: [
      'kokosyoghurt',
      'kokos yoghurt',
      'amandelyoghurt',
      'amandel yoghurt',
      'haveryoghurt',
      'haver yoghurt',
      'sojayoghurt',
      'soja yoghurt',
      'plantaardige yoghurt',
      'plantyoghurt',
      'oatyoghurt',
      'oat yoghurt',
    ],
    melk: [
      'kokosmelk',
      'kokos melk',
      'amandelmelk',
      'amandel melk',
      'havermelk',
      'haver melk',
      'rijstmelk',
      'rijst melk',
      'sojamelk',
      'soja melk',
      'oatmelk',
      'oat melk',
      'plantaardige melk',
    ],
    // "pasta" als in paste/spread (notenpasta, amandelpasta, tomatenpasta) ≠ glutenpasta
    pasta: [
      'notenpasta',
      'amandelpasta',
      'gember-knoflookpasta',
      'gemberpasta',
      'knoflookpasta',
      'tomatenpasta',
      'sesampasta',
      'pindapasta',
      'olijvenpasta',
      'chilipasta',
      'currypasta',
      'kruidenpasta',
      'pastasaus',
      'tahin',
      'tahini',
    ],
  };

/**
 * Ingrediëntnamen die "pasta" als paste/spread betekenen (geen gluten).
 * Wordt gebruikt om false positives te voorkomen: notenpasta, amandelpasta,
 * gember-knoflookpasta, tomatenpasta enz. zijn geen tarwepasta.
 */
const PASTA_AS_PASTE_INDICATORS = [
  'notenpasta',
  'amandelpasta',
  'gember-knoflookpasta',
  'gemberpasta',
  'knoflookpasta',
  'tomatenpasta',
  'sesampasta',
  'pindapasta',
  'olijvenpasta',
  'chilipasta',
  'currypasta',
  'kruidenpasta',
  'pastasaus',
  'tahin',
  'tahini',
];

/** Bloemkool(rijst) is groente, geen gluten/zuivel – uitsluiten voor die regels */
function isBloemkoolRelated(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const normalized = lower.replace(/-/g, ' ').replace(/\s+/g, ' ');
  return (
    lower.includes('bloemkoolrijst') ||
    lower.includes('bloemkool') ||
    lower === 'cauliflower rice' ||
    lower.includes('cauliflower rice') ||
    normalized.includes('cauliflower') ||
    normalized.includes('bloem kool') ||
    normalized.includes('kool bloem')
  );
}

/** Rijstazijn is azijn, geen zuivel – nooit als zuivel flaggen */
function isRijstazijn(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower === 'rijstazijn' ||
    lower === 'rice vinegar' ||
    lower.includes('rijstazijn') ||
    lower.includes('rice vinegar')
  );
}

function isDairyRule(forbidden: {
  term: string;
  ruleLabel?: string;
  ruleCode?: string;
}): boolean {
  const t = (forbidden.term ?? '').toLowerCase();
  const l = (forbidden.ruleLabel ?? '').toLowerCase();
  const c = (forbidden.ruleCode ?? '').toLowerCase();
  return (
    t === 'dairy' ||
    t === 'zuivel' ||
    l.includes('zuivel') ||
    l.includes('dairy') ||
    c.includes('dairy') ||
    c.includes('zuivel')
  );
}

function isGlutenRule(forbidden: {
  term: string;
  ruleLabel?: string;
  ruleCode?: string;
}): boolean {
  const t = (forbidden.term ?? '').toLowerCase();
  const l = (forbidden.ruleLabel ?? '').toLowerCase();
  const c = (forbidden.ruleCode ?? '').toLowerCase();
  return (
    t === 'gluten' ||
    t === 'pasta' ||
    t === 'tarwe' ||
    t === 'wheat' ||
    l.includes('gluten') ||
    c.includes('gluten') ||
    c.includes('pasta') ||
    c.includes('wahls_forbidden_gluten')
  );
}

/** Ingrediënt is expliciet glutenvrij (glutenvrije pannenkoekenmix, gluten-free bread) → onder gluten-regel toegestaan. */
function isGlutenFreeIngredient(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.includes('glutenvrij') ||
    lower.includes('glutenvrije') ||
    lower.includes('gluten-free')
  );
}

/** Peper (kruid) is toegestaan; alleen paprika/chili/pepper als groente zijn nachtschades. */
function isNightshadeRule(forbidden: {
  term: string;
  ruleLabel?: string;
  ruleCode?: string;
}): boolean {
  const t = (forbidden.term ?? '').toLowerCase();
  const l = (forbidden.ruleLabel ?? '').toLowerCase();
  const c = (forbidden.ruleCode ?? '').toLowerCase();
  return (
    t.includes('pepper') ||
    t.includes('paprika') ||
    t.includes('chili') ||
    t === 'nachtschade' ||
    l.includes('nachtschade') ||
    l.includes('nightshade') ||
    c.includes('nightshade') ||
    c.includes('nachtschade')
  );
}

/** Zwarte/witte peper (kruid) ≠ paprika/chili (groente). */
const SPICE_PEPPER_INDICATORS = [
  'peper',
  'zwarte peper',
  'witte peper',
  'black pepper',
  'white pepper',
  'peperkorrel',
  'gemalen peper',
  'ground pepper',
  'zeezout en peper',
  'zout en peper',
];

function isSpicePepper(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower) return false;
  return SPICE_PEPPER_INDICATORS.some(
    (ind) => lower === ind || lower.includes(ind),
  );
}

function isPastaAsPaste(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (PASTA_AS_PASTE_INDICATORS.some((p) => lower.includes(p))) return true;
  // "noten pasta", "amandel pasta" (twee woorden)
  const pastaAsPastePrefixes = [
    'noten',
    'amandel',
    'gember',
    'knoflook',
    'tomaten',
    'sesam',
    'pinda',
    'olijven',
    'chili',
    'curry',
    'kruiden',
  ];
  const twoWordMatch = new RegExp(
    `^(${pastaAsPastePrefixes.join('|')})\\s+pasta$`,
    'i',
  );
  return twoWordMatch.test(lower);
}

/**
 * Normaliseer tekst voor matching: lowercase, trim, meerdere spaties → één.
 * Behoud context (bijv. "verse mozzarella (in blokjes)") zodat substring-match werkt.
 */
export function normalizeForMatching(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Case-insensitive word boundary match
 * Matches whole words, not substrings (e.g., "suiker" won't match "suikervrij")
 */
function matchesWordBoundary(text: string, term: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();

  // Create regex for word boundary matching
  // \b matches word boundaries, but we need to handle special chars
  const escapedTerm = lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i');

  return regex.test(lowerText);
}

/**
 * Case-insensitive substring match (fallback for phrases)
 */
function _matchesSubstring(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

/**
 * Check if a short phrase (e.g. one part of "X of Y") matches any forbidden term.
 * Used to detect allowed alternatives in combinations like "olijfolie of boter".
 */
function partMatchesAnyForbidden(part: string, ruleset: DietRuleset): boolean {
  const lower = part.toLowerCase().trim();
  if (!lower) return false;
  for (const f of ruleset.forbidden) {
    const term = f.term.toLowerCase();
    if (lower === term || lower.includes(term)) return true;
    for (const s of f.synonyms || []) {
      const syn = s.toLowerCase();
      if (lower === syn || lower.includes(syn)) return true;
    }
    const extra = (EXTRA_INGREDIENT_SYNONYMS[f.term] || []).map((x) =>
      x.toLowerCase(),
    );
    if (extra.some((e) => lower === e || lower.includes(e))) return true;
  }
  return false;
}

/**
 * If the ingredient text looks like "X of Y" or "X or Y" and one part is allowed,
 * set allowedAlternativeInText on the last match so the UI can suggest "Kies X, of vervang Y door Z".
 */
function enrichLastMatchWithAllowedAlternative(
  fullText: string,
  ruleset: DietRuleset,
  matches: Array<{
    matched: string;
    allowedAlternativeInText?: string;
  }>,
): void {
  if (matches.length === 0) return;
  const lower = fullText.toLowerCase();
  if (!lower.includes(' of ') && !lower.includes(' or ')) return;
  const parts = fullText
    .split(/\s+of\s+|\s+or\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return;
  const last = matches[matches.length - 1];
  const matchedLower = last.matched.toLowerCase();
  for (const part of parts) {
    const pl = part.toLowerCase();
    if (pl.includes(matchedLower) || pl === matchedLower) continue;
    if (partMatchesAnyForbidden(part, ruleset)) continue;
    last.allowedAlternativeInText = part;
    return;
  }
}

/**
 * Check if text contains any forbidden terms
 *
 * Exported for use in recipe analysis (not just validation)
 * Uses word boundary matching for accuracy, with substring fallback for ingredients
 */
export function findForbiddenMatches(
  text: string,
  ruleset: DietRuleset,
  context: 'ingredients' | 'steps',
): Array<{
  term: string;
  matched: string;
  ruleCode: string;
  ruleLabel: string;
  substitutionSuggestions?: string[];
  allowedAlternativeInText?: string;
}> {
  const matches: Array<{
    term: string;
    matched: string;
    ruleCode: string;
    ruleLabel: string;
    substitutionSuggestions?: string[];
    allowedAlternativeInText?: string;
  }> = [];
  const lowerText = normalizeForMatching(text);

  // Debug logging
  if (context === 'ingredients') {
    console.log(
      `[DietValidator] Checking text: "${text}" (lower: "${lowerText}") against ${ruleset.forbidden.length} forbidden rules`,
    );
  }

  for (const forbidden of ruleset.forbidden) {
    const lowerTerm = forbidden.term.toLowerCase();

    // Bloemkool(rijst) is groente, geen gluten/zuivel – nooit als zodanig flaggen
    if (context === 'ingredients' && isBloemkoolRelated(lowerText)) {
      if (isDairyRule(forbidden) || isGlutenRule(forbidden)) continue;
    }

    // Rijstazijn is azijn, geen zuivel – nooit onder zuivelregel flaggen
    if (
      context === 'ingredients' &&
      isDairyRule(forbidden) &&
      isRijstazijn(lowerText)
    ) {
      continue;
    }

    // Peper als kruid (zwarte/witte peper) is toegestaan; nachtschade-regels gaan over paprika/chili (groente)
    if (
      context === 'ingredients' &&
      isNightshadeRule(forbidden) &&
      isSpicePepper(lowerText)
    ) {
      continue;
    }

    // Glutenvrij(e) / gluten-free in de naam → onder gluten-regel toegestaan, niet flaggen
    if (
      context === 'ingredients' &&
      isGlutenRule(forbidden) &&
      isGlutenFreeIngredient(lowerText)
    ) {
      continue;
    }

    // For ingredients, check if the text exactly matches the forbidden term or any synonym
    // This handles cases like "orzo" matching "pasta" (where "orzo" is a synonym of "pasta")
    if (context === 'ingredients') {
      // Exact match with main term
      if (lowerText === lowerTerm) {
        console.log(
          `[DietValidator] ✓ Exact match: "${forbidden.term}" == "${text}"`,
        );
        matches.push({
          term: forbidden.term,
          matched: forbidden.term,
          ruleCode: forbidden.ruleCode,
          ruleLabel: forbidden.ruleLabel,
          substitutionSuggestions: forbidden.substitutionSuggestions,
        });
        enrichLastMatchWithAllowedAlternative(text, ruleset, matches);
        continue;
      }

      // Exact match with any synonym
      if (forbidden.synonyms) {
        for (const synonym of forbidden.synonyms) {
          const lowerSynonym = synonym.toLowerCase();
          if (lowerText === lowerSynonym) {
            if (lowerTerm === 'pasta' && isPastaAsPaste(lowerText)) continue;
            console.log(
              `[DietValidator] ✓ Exact synonym match: "${synonym}" (synonym of "${forbidden.term}") == "${text}"`,
            );
            matches.push({
              term: forbidden.term,
              matched: synonym,
              ruleCode: forbidden.ruleCode,
              ruleLabel: forbidden.ruleLabel,
              substitutionSuggestions: forbidden.substitutionSuggestions,
            });
            enrichLastMatchWithAllowedAlternative(text, ruleset, matches);
            continue;
          }
        }
      }
    }

    // Check main term - try word boundary first, then substring for ingredients
    if (matchesWordBoundary(text, forbidden.term)) {
      if (
        context === 'ingredients' &&
        lowerTerm === 'pasta' &&
        isPastaAsPaste(lowerText)
      )
        continue;
      if (context === 'ingredients') {
        console.log(
          `[DietValidator] ✓ Word boundary match: "${forbidden.term}" in "${text}"`,
        );
      }
      matches.push({
        term: forbidden.term,
        matched: forbidden.term,
        ruleCode: forbidden.ruleCode,
        ruleLabel: forbidden.ruleLabel,
        substitutionSuggestions: forbidden.substitutionSuggestions,
      });
      if (context === 'ingredients') {
        enrichLastMatchWithAllowedAlternative(text, ruleset, matches);
      }
      continue;
    }

    // For ingredients, also try substring matching (e.g. "pasta" in "spaghetti pasta")
    // Inclusief extra Nederlandse synoniemen (kaas → mozzarella, suiker → honing, etc.)
    if (context === 'ingredients') {
      const lowerTerm = forbidden.term.toLowerCase();
      const extra = (EXTRA_INGREDIENT_SYNONYMS[forbidden.term] || []).map((s) =>
        s.toLowerCase(),
      );
      const allToCheck = [
        lowerTerm,
        ...(forbidden.synonyms || []).map((s) => s.toLowerCase()),
        ...extra,
      ];
      const found = allToCheck.find((t) => lowerText.includes(t));
      if (found) {
        const excludeIfContains = SUBSTRING_FALSE_POSITIVE_IF_CONTAINS[found];
        if (excludeIfContains) {
          const patterns = Array.isArray(excludeIfContains)
            ? excludeIfContains
            : [excludeIfContains];
          const textToCheck = lowerText;
          const normalizedForWordOrder = lowerText
            .replace(/-/g, ' ')
            .replace(/\s+/g, ' ');
          if (
            patterns.some((p) => textToCheck.includes(p)) ||
            (found === 'bloem' &&
              patterns.some((p) => normalizedForWordOrder.includes(p)))
          ) {
            continue; // bv. "ei" in "romeinse sla", "pasta" in "notenpasta", "kool bloem-" = bloemkool
          }
        }
        if (found === 'pasta' && isPastaAsPaste(lowerText)) continue;
        const matchedLabel = found === lowerTerm ? forbidden.term : found;
        console.log(
          `[DietValidator] ✓ Substring match: "${matchedLabel}" (term: ${forbidden.term}) in "${text}"`,
        );
        matches.push({
          term: forbidden.term,
          matched: matchedLabel,
          ruleCode: forbidden.ruleCode,
          ruleLabel: forbidden.ruleLabel,
          substitutionSuggestions: forbidden.substitutionSuggestions,
        });
        enrichLastMatchWithAllowedAlternative(text, ruleset, matches);
        continue;
      }
    }

    // Check synonyms - IMPORTANT: Check synonyms BEFORE substring matching
    // This ensures "orzo" (synonym of "pasta") is detected even if ingredient name is just "orzo"
    if (forbidden.synonyms) {
      for (const synonym of forbidden.synonyms) {
        const lowerSynonym = synonym.toLowerCase();

        // For ingredients, check exact match first (most important for cases like "orzo")
        if (context === 'ingredients' && lowerText === lowerSynonym) {
          if (lowerTerm === 'pasta' && isPastaAsPaste(lowerText)) continue;
          console.log(
            `[DietValidator] ✓ Exact synonym match: "${synonym}" (synonym of "${forbidden.term}") == "${text}"`,
          );
          matches.push({
            term: forbidden.term,
            matched: synonym,
            ruleCode: forbidden.ruleCode,
            ruleLabel: forbidden.ruleLabel,
            substitutionSuggestions: forbidden.substitutionSuggestions,
          });
          enrichLastMatchWithAllowedAlternative(text, ruleset, matches);
          break; // Only report once per forbidden term
        }

        // Then check word boundary
        if (matchesWordBoundary(text, synonym)) {
          if (
            context === 'ingredients' &&
            lowerTerm === 'pasta' &&
            isPastaAsPaste(lowerText)
          )
            continue;
          if (context === 'ingredients') {
            console.log(
              `[DietValidator] ✓ Word boundary synonym match: "${synonym}" (synonym of "${forbidden.term}") in "${text}"`,
            );
          }
          matches.push({
            term: forbidden.term,
            matched: synonym,
            ruleCode: forbidden.ruleCode,
            ruleLabel: forbidden.ruleLabel,
            substitutionSuggestions: forbidden.substitutionSuggestions,
          });
          if (context === 'ingredients') {
            enrichLastMatchWithAllowedAlternative(text, ruleset, matches);
          }
          break; // Only report once per forbidden term
        }
      }

      // For ingredients, also try substring matching for synonyms (e.g., "orzo pasta")
      if (context === 'ingredients') {
        for (const synonym of forbidden.synonyms) {
          const lowerSynonym = synonym.toLowerCase();
          if (
            !lowerText.includes(lowerSynonym) ||
            matches.some((m) => m.term === forbidden.term)
          )
            continue;
          const excludeIfContains =
            SUBSTRING_FALSE_POSITIVE_IF_CONTAINS[lowerSynonym];
          if (excludeIfContains) {
            const patterns = Array.isArray(excludeIfContains)
              ? excludeIfContains
              : [excludeIfContains];
            const normalizedForWordOrder = lowerText
              .replace(/-/g, ' ')
              .replace(/\s+/g, ' ');
            if (
              patterns.some((p) => lowerText.includes(p)) ||
              (lowerSynonym === 'bloem' &&
                patterns.some((p) => normalizedForWordOrder.includes(p)))
            )
              continue;
          }
          if (lowerTerm === 'pasta' && isPastaAsPaste(lowerText)) continue;
          console.log(
            `[DietValidator] ✓ Substring synonym match: "${synonym}" (synonym of "${forbidden.term}") in "${text}"`,
          );
          matches.push({
            term: forbidden.term,
            matched: synonym,
            ruleCode: forbidden.ruleCode,
            ruleLabel: forbidden.ruleLabel,
            substitutionSuggestions: forbidden.substitutionSuggestions,
          });
          enrichLastMatchWithAllowedAlternative(text, ruleset, matches);
          break;
        }
      }
    }
  }

  // Check added sugar heuristics (only in steps, as ingredients should be explicit)
  if (context === 'steps' && ruleset.heuristics?.addedSugarTerms) {
    for (const sugarTerm of ruleset.heuristics.addedSugarTerms) {
      if (matchesWordBoundary(text, sugarTerm)) {
        // Check if it's not already matched by a forbidden term
        const alreadyMatched = matches.some(
          (m) => m.term === sugarTerm || m.matched === sugarTerm,
        );
        if (!alreadyMatched) {
          // Find matching forbidden rule for added sugar
          const sugarRule = ruleset.forbidden.find(
            (f) => f.ruleCode === 'LOW_SUGAR',
          );
          matches.push({
            term: 'added_sugar',
            matched: sugarTerm,
            ruleCode: sugarRule?.ruleCode || 'LOW_SUGAR',
            ruleLabel: sugarRule?.ruleLabel || 'Verminderde suikerinname',
            substitutionSuggestions: sugarRule?.substitutionSuggestions,
          });
        }
      }
    }
  }

  return matches;
}

/**
 * Validate a recipe adaptation draft against diet ruleset
 *
 * Scans both ingredients and steps for forbidden terms.
 * Returns validation report with matches and summary.
 */
export function validateDraft(
  draft: RecipeAdaptationDraft,
  ruleset: DietRuleset,
): ValidationReport {
  const matches: ValidationReport['matches'] = [];

  // Validate ingredients
  for (const ingredient of draft.rewrite.ingredients) {
    // Check ingredient name
    const nameMatches = findForbiddenMatches(
      ingredient.name,
      ruleset,
      'ingredients',
    );
    matches.push(
      ...nameMatches.map((m) => ({
        term: m.term,
        matched: m.matched,
        where: 'ingredients' as const,
        ruleCode: m.ruleCode,
        ruleLabel: m.ruleLabel,
        substitutionSuggestions: m.substitutionSuggestions,
        allowedAlternativeInText: m.allowedAlternativeInText,
      })),
    );

    // Check note if present
    if (ingredient.note) {
      const noteMatches = findForbiddenMatches(
        ingredient.note,
        ruleset,
        'ingredients',
      );
      matches.push(
        ...noteMatches.map((m) => ({
          term: m.term,
          matched: m.matched,
          where: 'ingredients' as const,
          ruleCode: m.ruleCode,
          ruleLabel: m.ruleLabel,
          substitutionSuggestions: m.substitutionSuggestions,
          allowedAlternativeInText: m.allowedAlternativeInText,
        })),
      );
    }
  }

  // Validate steps
  for (const step of draft.rewrite.steps) {
    const stepMatches = findForbiddenMatches(step.text, ruleset, 'steps');
    matches.push(
      ...stepMatches.map((m) => ({
        term: m.term,
        matched: m.matched,
        where: 'steps' as const,
        ruleCode: m.ruleCode,
        ruleLabel: m.ruleLabel,
        substitutionSuggestions: m.substitutionSuggestions,
      })),
    );
  }

  // Build summary
  const ok = matches.length === 0;
  let summary: string;

  if (ok) {
    summary = 'No forbidden ingredients detected';
  } else {
    const uniqueTerms = new Set(matches.map((m) => m.term));
    const count = matches.length;
    const termCount = uniqueTerms.size;
    summary = `${count} forbidden term${count !== 1 ? 's' : ''} detected (${termCount} unique rule${termCount !== 1 ? 's' : ''})`;
  }

  return {
    ok,
    matches,
    summary,
  };
}
