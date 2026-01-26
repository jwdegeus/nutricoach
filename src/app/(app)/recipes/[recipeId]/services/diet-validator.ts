/**
 * Diet Validator
 * 
 * Validates recipe adaptation drafts against diet rulesets.
 * Server-only module for strict ingredient checking.
 */

import "server-only";
import type { RecipeAdaptationDraft } from "../recipe-ai.types";

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
    where: "ingredients" | "steps";
    ruleCode?: string;
    ruleLabel?: string;
    substitutionSuggestions?: string[];
  }>;
  summary: string;
};

/**
 * Case-insensitive word boundary match
 * Matches whole words, not substrings (e.g., "suiker" won't match "suikervrij")
 */
function matchesWordBoundary(text: string, term: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  
  // Create regex for word boundary matching
  // \b matches word boundaries, but we need to handle special chars
  const escapedTerm = lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escapedTerm}\\b`, "i");
  
  return regex.test(lowerText);
}

/**
 * Case-insensitive substring match (fallback for phrases)
 */
function matchesSubstring(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
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
  context: "ingredients" | "steps"
): Array<{ term: string; matched: string; ruleCode: string; ruleLabel: string; substitutionSuggestions?: string[] }> {
  const matches: Array<{ term: string; matched: string; ruleCode: string; ruleLabel: string; substitutionSuggestions?: string[] }> = [];
  const lowerText = text.toLowerCase().trim();

  // Debug logging
  if (context === "ingredients") {
    console.log(`[DietValidator] Checking text: "${text}" (lower: "${lowerText}") against ${ruleset.forbidden.length} forbidden rules`);
  }

  for (const forbidden of ruleset.forbidden) {
    const lowerTerm = forbidden.term.toLowerCase();
    
    // For ingredients, check if the text exactly matches the forbidden term or any synonym
    // This handles cases like "orzo" matching "pasta" (where "orzo" is a synonym of "pasta")
    if (context === "ingredients") {
      // Exact match with main term
      if (lowerText === lowerTerm) {
        console.log(`[DietValidator] ✓ Exact match: "${forbidden.term}" == "${text}"`);
        matches.push({ 
          term: forbidden.term, 
          matched: forbidden.term,
          ruleCode: forbidden.ruleCode,
          ruleLabel: forbidden.ruleLabel,
          substitutionSuggestions: forbidden.substitutionSuggestions,
        });
        continue;
      }
      
      // Exact match with any synonym
      if (forbidden.synonyms) {
        for (const synonym of forbidden.synonyms) {
          const lowerSynonym = synonym.toLowerCase();
          if (lowerText === lowerSynonym) {
            console.log(`[DietValidator] ✓ Exact synonym match: "${synonym}" (synonym of "${forbidden.term}") == "${text}"`);
            matches.push({ 
              term: forbidden.term, 
              matched: synonym,
              ruleCode: forbidden.ruleCode,
              ruleLabel: forbidden.ruleLabel,
              substitutionSuggestions: forbidden.substitutionSuggestions,
            });
            continue;
          }
        }
      }
    }
    
    // Check main term - try word boundary first, then substring for ingredients
    if (matchesWordBoundary(text, forbidden.term)) {
      if (context === "ingredients") {
        console.log(`[DietValidator] ✓ Word boundary match: "${forbidden.term}" in "${text}"`);
      }
      matches.push({ 
        term: forbidden.term, 
        matched: forbidden.term,
        ruleCode: forbidden.ruleCode,
        ruleLabel: forbidden.ruleLabel,
        substitutionSuggestions: forbidden.substitutionSuggestions,
      });
      continue;
    }

    // For ingredients, also try substring matching (e.g., "pasta" in "spaghetti pasta")
    // This is important for cases like "orzo pasta" where "pasta" should match
    if (context === "ingredients") {
      const lowerTerm = forbidden.term.toLowerCase();
      if (lowerText.includes(lowerTerm)) {
        console.log(`[DietValidator] ✓ Substring match: "${forbidden.term}" in "${text}"`);
        // Extract the matched portion for better reporting
        const matchedPortion = lowerText.includes(` ${lowerTerm} `) || 
                              lowerText.startsWith(`${lowerTerm} `) || 
                              lowerText.endsWith(` ${lowerTerm}`) ||
                              lowerText === lowerTerm
          ? forbidden.term
          : lowerText.substring(
              Math.max(0, lowerText.indexOf(lowerTerm) - 10),
              Math.min(lowerText.length, lowerText.indexOf(lowerTerm) + lowerTerm.length + 10)
            );
        
        matches.push({ 
          term: forbidden.term, 
          matched: matchedPortion,
          ruleCode: forbidden.ruleCode,
          ruleLabel: forbidden.ruleLabel,
          substitutionSuggestions: forbidden.substitutionSuggestions,
        });
        continue;
      } else if (context === "ingredients") {
        // Debug: log why substring didn't match
        console.log(`[DietValidator]   No substring match: "${lowerTerm}" not in "${lowerText}"`);
      }
    }

    // Check synonyms - IMPORTANT: Check synonyms BEFORE substring matching
    // This ensures "orzo" (synonym of "pasta") is detected even if ingredient name is just "orzo"
    if (forbidden.synonyms) {
      for (const synonym of forbidden.synonyms) {
        const lowerSynonym = synonym.toLowerCase();
        
        // For ingredients, check exact match first (most important for cases like "orzo")
        if (context === "ingredients" && lowerText === lowerSynonym) {
          console.log(`[DietValidator] ✓ Exact synonym match: "${synonym}" (synonym of "${forbidden.term}") == "${text}"`);
          matches.push({ 
            term: forbidden.term, 
            matched: synonym,
            ruleCode: forbidden.ruleCode,
            ruleLabel: forbidden.ruleLabel,
            substitutionSuggestions: forbidden.substitutionSuggestions,
          });
          break; // Only report once per forbidden term
        }
        
        // Then check word boundary
        if (matchesWordBoundary(text, synonym)) {
          if (context === "ingredients") {
            console.log(`[DietValidator] ✓ Word boundary synonym match: "${synonym}" (synonym of "${forbidden.term}") in "${text}"`);
          }
          matches.push({ 
            term: forbidden.term, 
            matched: synonym,
            ruleCode: forbidden.ruleCode,
            ruleLabel: forbidden.ruleLabel,
            substitutionSuggestions: forbidden.substitutionSuggestions,
          });
          break; // Only report once per forbidden term
        }
      }
      
      // For ingredients, also try substring matching for synonyms (e.g., "orzo pasta")
      if (context === "ingredients") {
        for (const synonym of forbidden.synonyms) {
          const lowerSynonym = synonym.toLowerCase();
          if (lowerText.includes(lowerSynonym) && !matches.some(m => m.term === forbidden.term)) {
            console.log(`[DietValidator] ✓ Substring synonym match: "${synonym}" (synonym of "${forbidden.term}") in "${text}"`);
            matches.push({ 
              term: forbidden.term, 
              matched: synonym,
              ruleCode: forbidden.ruleCode,
              ruleLabel: forbidden.ruleLabel,
              substitutionSuggestions: forbidden.substitutionSuggestions,
            });
            break; // Only report once per forbidden term
          }
        }
      }
    }
  }

  // Check added sugar heuristics (only in steps, as ingredients should be explicit)
  if (context === "steps" && ruleset.heuristics?.addedSugarTerms) {
    for (const sugarTerm of ruleset.heuristics.addedSugarTerms) {
      if (matchesWordBoundary(text, sugarTerm)) {
        // Check if it's not already matched by a forbidden term
        const alreadyMatched = matches.some(
          (m) => m.term === sugarTerm || m.matched === sugarTerm
        );
        if (!alreadyMatched) {
          // Find matching forbidden rule for added sugar
          const sugarRule = ruleset.forbidden.find(f => f.ruleCode === "LOW_SUGAR");
          matches.push({ 
            term: "added_sugar", 
            matched: sugarTerm,
            ruleCode: sugarRule?.ruleCode || "LOW_SUGAR",
            ruleLabel: sugarRule?.ruleLabel || "Verminderde suikerinname",
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
  ruleset: DietRuleset
): ValidationReport {
  const matches: ValidationReport["matches"] = [];

  // Validate ingredients
  for (const ingredient of draft.rewrite.ingredients) {
    // Check ingredient name
    const nameMatches = findForbiddenMatches(
      ingredient.name,
      ruleset,
      "ingredients"
    );
    matches.push(
      ...nameMatches.map((m) => ({ 
        term: m.term,
        matched: m.matched,
        where: "ingredients" as const,
        ruleCode: m.ruleCode,
        ruleLabel: m.ruleLabel,
        substitutionSuggestions: m.substitutionSuggestions,
      }))
    );

    // Check note if present
    if (ingredient.note) {
      const noteMatches = findForbiddenMatches(
        ingredient.note,
        ruleset,
        "ingredients"
      );
      matches.push(
        ...noteMatches.map((m) => ({ 
          term: m.term,
          matched: m.matched,
          where: "ingredients" as const,
          ruleCode: m.ruleCode,
          ruleLabel: m.ruleLabel,
          substitutionSuggestions: m.substitutionSuggestions,
        }))
      );
    }
  }

  // Validate steps
  for (const step of draft.rewrite.steps) {
    const stepMatches = findForbiddenMatches(step.text, ruleset, "steps");
    matches.push(
      ...stepMatches.map((m) => ({ 
        term: m.term,
        matched: m.matched,
        where: "steps" as const,
        ruleCode: m.ruleCode,
        ruleLabel: m.ruleLabel,
        substitutionSuggestions: m.substitutionSuggestions,
      }))
    );
  }

  // Build summary
  const ok = matches.length === 0;
  let summary: string;

  if (ok) {
    summary = "No forbidden ingredients detected";
  } else {
    const uniqueTerms = new Set(matches.map((m) => m.term));
    const count = matches.length;
    const termCount = uniqueTerms.size;
    summary = `${count} forbidden term${count !== 1 ? "s" : ""} detected (${termCount} unique rule${termCount !== 1 ? "s" : ""})`;
  }

  return {
    ok,
    matches,
    summary,
  };
}
