/**
 * Diet Validator
 *
 * Validates recipe adaptation drafts against diet rulesets.
 * Server-only module for strict ingredient checking.
 *
 * ALL false-positive exclusions komen uitsluitend uit magician_validator_overrides
 * (admin sectie). Geen hardcoded uitsluitingen - alleen backend data via overrides.
 */

import 'server-only';
import type { RecipeAdaptationDraft } from '../recipe-ai.types';
import type { SubstringFalsePositives } from '@/src/lib/diet-validation/magician-overrides.loader';
export type { SubstringFalsePositives };
import type { IngredientSynonyms } from '@/src/lib/diet-validation/magician-ingredient-synonyms.loader';

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
 * Check of een match een false positive is volgens overrides uit de backend.
 * Als atom.text een exclude-patroon bevat voor de gematchte term, geen violation.
 */
function isExcludedByOverrides(
  text: string,
  matchedTerm: string,
  overrides: SubstringFalsePositives,
): boolean {
  const key = matchedTerm.toLowerCase().trim();
  const patterns = overrides[key];
  if (!patterns?.length) return false;
  const lower = text.toLowerCase();
  // Normaliseer komma's, streepjes en spaties – "aardappel, zoete, gekookt" → "aardappel zoete gekookt"
  const normalized = lower
    .replace(/,/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ');
  return (
    patterns.some((p) => lower.includes(p)) ||
    patterns.some((p) => normalized.includes(p))
  );
}

/**
 * Normaliseer tekst voor matching: lowercase, trim, meerdere spaties → één.
 */
export function normalizeForMatching(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Case-insensitive word boundary match
 */
function matchesWordBoundary(text: string, term: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const escapedTerm = lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i');
  return regex.test(lowerText);
}

/**
 * Check if a short phrase matches any forbidden term (for "X of Y" detection)
 */
function partMatchesAnyForbidden(
  part: string,
  ruleset: DietRuleset,
  extraSynonyms: IngredientSynonyms,
): boolean {
  const lower = part.toLowerCase().trim();
  if (!lower) return false;
  for (const f of ruleset.forbidden) {
    const term = f.term.toLowerCase();
    if (lower === term || lower.includes(term)) return true;
    for (const s of f.synonyms || []) {
      const syn = s.toLowerCase();
      if (lower === syn || lower.includes(syn)) return true;
    }
    const extra = (extraSynonyms[f.term] || []).map((x) => x.toLowerCase());
    if (extra.some((e) => lower === e || lower.includes(e))) return true;
  }
  return false;
}

/**
 * Set allowedAlternativeInText when text has "X of Y" and one part is allowed
 */
function enrichLastMatchWithAllowedAlternative(
  fullText: string,
  ruleset: DietRuleset,
  matches: Array<{ matched: string; allowedAlternativeInText?: string }>,
  extraSynonyms: IngredientSynonyms,
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
    if (partMatchesAnyForbidden(part, ruleset, extraSynonyms)) continue;
    last.allowedAlternativeInText = part;
    return;
  }
}

/**
 * Check if text contains any forbidden terms.
 *
 * Alle uitsluitingen komen uitsluitend uit overrides (magician_validator_overrides via admin).
 * Geen hardcoded fallbacks - overrides is verplicht.
 *
 * @param overrides - False-positive exclusions uit magician_validator_overrides (verplicht)
 * @param extraSynonyms - Extra NL↔EN synoniemen uit magician_ingredient_synonyms (optioneel)
 */
export function findForbiddenMatches(
  text: string,
  ruleset: DietRuleset,
  context: 'ingredients' | 'steps',
  overrides: SubstringFalsePositives,
  extraSynonyms: IngredientSynonyms = {},
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

  if (context === 'ingredients') {
    console.log(
      `[DietValidator] Checking text: "${text}" (lower: "${lowerText}") against ${ruleset.forbidden.length} forbidden rules`,
    );
  }

  for (const forbidden of ruleset.forbidden) {
    const lowerTerm = forbidden.term.toLowerCase();

    const shouldSkipMatch = (matched: string) =>
      isExcludedByOverrides(lowerText, matched, overrides);

    // Exact match with main term
    if (context === 'ingredients' && lowerText === lowerTerm) {
      if (shouldSkipMatch(lowerTerm)) continue;
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
      enrichLastMatchWithAllowedAlternative(
        text,
        ruleset,
        matches,
        extraSynonyms,
      );
      continue;
    }

    // Exact match with synonym
    if (context === 'ingredients' && forbidden.synonyms) {
      for (const synonym of forbidden.synonyms) {
        const lowerSynonym = synonym.toLowerCase();
        if (lowerText === lowerSynonym) {
          if (shouldSkipMatch(lowerSynonym)) continue;
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
          enrichLastMatchWithAllowedAlternative(
            text,
            ruleset,
            matches,
            extraSynonyms,
          );
          continue;
        }
      }
    }

    // Word boundary match on main term
    if (matchesWordBoundary(text, forbidden.term)) {
      if (context === 'ingredients' && shouldSkipMatch(lowerTerm)) continue;
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
      if (context === 'ingredients')
        enrichLastMatchWithAllowedAlternative(
          text,
          ruleset,
          matches,
          extraSynonyms,
        );
      continue;
    }

    // Substring match (ingredients only)
    if (context === 'ingredients') {
      const extra = (extraSynonyms[forbidden.term] || []).map((s) =>
        s.toLowerCase(),
      );
      const allToCheck = [
        lowerTerm,
        ...(forbidden.synonyms || []).map((s) => s.toLowerCase()),
        ...extra,
      ];
      const found = allToCheck.find((t) => lowerText.includes(t));
      if (found) {
        if (shouldSkipMatch(found)) continue;
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
        enrichLastMatchWithAllowedAlternative(
          text,
          ruleset,
          matches,
          extraSynonyms,
        );
        continue;
      }
    }

    // Synonym: word boundary
    if (forbidden.synonyms) {
      for (const synonym of forbidden.synonyms) {
        const lowerSynonym = synonym.toLowerCase();
        if (matchesWordBoundary(text, synonym)) {
          if (context === 'ingredients' && shouldSkipMatch(lowerSynonym))
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
          if (context === 'ingredients')
            enrichLastMatchWithAllowedAlternative(
              text,
              ruleset,
              matches,
              extraSynonyms,
            );
          break;
        }
      }
    }

    // Synonym: substring (ingredients only)
    if (context === 'ingredients' && forbidden.synonyms) {
      for (const synonym of forbidden.synonyms) {
        const lowerSynonym = synonym.toLowerCase();
        if (
          !lowerText.includes(lowerSynonym) ||
          matches.some((m) => m.term === forbidden.term)
        )
          continue;
        if (shouldSkipMatch(lowerSynonym)) continue;
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
        enrichLastMatchWithAllowedAlternative(
          text,
          ruleset,
          matches,
          extraSynonyms,
        );
        break;
      }
    }
  }

  // Added sugar heuristics (steps only)
  // Rule code/label uit ruleset – zoek eerste regel over suiker (geen hardcoded LOW_SUGAR)
  if (context === 'steps' && ruleset.heuristics?.addedSugarTerms) {
    const sugarRule =
      ruleset.forbidden.find(
        (f) =>
          /sugar|suiker|toegevoegd/i.test(f.ruleCode) ||
          /suiker|sugar|zoet/i.test(f.ruleLabel ?? ''),
      ) ?? null;
    for (const sugarTerm of ruleset.heuristics.addedSugarTerms) {
      if (matchesWordBoundary(text, sugarTerm)) {
        const alreadyMatched = matches.some(
          (m) => m.term === sugarTerm || m.matched === sugarTerm,
        );
        if (!alreadyMatched) {
          matches.push({
            term: 'added_sugar',
            matched: sugarTerm,
            ruleCode: sugarRule?.ruleCode ?? 'ADDED_SUGAR',
            ruleLabel: sugarRule?.ruleLabel ?? 'Verminderde suikerinname',
            substitutionSuggestions: sugarRule?.substitutionSuggestions,
          });
        }
      }
    }
  }

  return matches;
}

/**
 * Validate a recipe adaptation draft against diet ruleset.
 *
 * @param overrides - False-positive exclusions uit magician_validator_overrides (verplicht)
 * @param extraSynonyms - Extra NL↔EN synoniemen uit magician_ingredient_synonyms (optioneel)
 */
export function validateDraft(
  draft: RecipeAdaptationDraft,
  ruleset: DietRuleset,
  overrides: SubstringFalsePositives,
  extraSynonyms: IngredientSynonyms = {},
): ValidationReport {
  const matches: ValidationReport['matches'] = [];

  for (const ingredient of draft.rewrite.ingredients) {
    const nameMatches = findForbiddenMatches(
      ingredient.name,
      ruleset,
      'ingredients',
      overrides,
      extraSynonyms,
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

    if (ingredient.note) {
      const noteMatches = findForbiddenMatches(
        ingredient.note,
        ruleset,
        'ingredients',
        overrides,
        extraSynonyms,
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

  for (const step of draft.rewrite.steps) {
    const stepMatches = findForbiddenMatches(
      step.text,
      ruleset,
      'steps',
      overrides,
      extraSynonyms,
    );
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

  const ok = matches.length === 0;
  const summary = ok
    ? 'No forbidden ingredients detected'
    : `${matches.length} forbidden term${matches.length !== 1 ? 's' : ''} detected`;

  return { ok, matches, summary };
}
