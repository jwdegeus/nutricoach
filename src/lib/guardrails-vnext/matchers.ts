/**
 * Guard Rails vNext - Matchers
 *
 * Pure matching functions for different match modes.
 *
 * @see docs/guardrails-vnext-semantics.md section 4.2 for matching modes
 */

import type { MatchMode, TextAtom } from './types';

/**
 * Exact match - Case-insensitive exact match
 *
 * @param text - Text to match against
 * @param term - Term to match
 * @returns True if exact match (case-insensitive)
 */
export function matchExact(text: string, term: string): boolean {
  return text.toLowerCase().trim() === term.toLowerCase().trim();
}

/**
 * Word boundary match - Regex word boundary match (prevents false positives)
 *
 * Example: "suiker" matches "suiker" but not "suikervrij"
 *
 * @param text - Text to match against
 * @param term - Term to match
 * @returns True if word boundary match found
 */
export function matchWordBoundary(text: string, term: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();

  // Escape special regex characters
  const escapedTerm = lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Create word boundary regex
  const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i');

  return regex.test(lowerText);
}

/**
 * Substring match - Case-insensitive substring match
 *
 * WARNING: Can produce false positives (e.g., "pasta" matches "pastasaus")
 * Only use for ingredients, not for steps.
 *
 * @param text - Text to match against
 * @param term - Term to match
 * @returns True if substring match found
 */
export function matchSubstring(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

/**
 * Canonical ID match - Exact match on canonical identifier
 *
 * @param textAtom - Text atom with optional canonicalId
 * @param canonicalId - Canonical ID to match
 * @returns True if canonical ID matches
 */
export function matchCanonicalId(
  textAtom: TextAtom,
  canonicalId: string,
): boolean {
  // Prefer canonicalId if available
  if (textAtom.canonicalId) {
    return textAtom.canonicalId === canonicalId;
  }

  // Fallback to text exact match
  return textAtom.text === canonicalId;
}

/**
 * Match text atom against term using specified mode
 *
 * @param textAtom - Text atom to match
 * @param term - Term to match
 * @param mode - Match mode to use
 * @returns True if match found
 */
export function matchTextAtom(
  textAtom: TextAtom,
  term: string,
  mode: MatchMode,
): boolean {
  switch (mode) {
    case 'exact':
      return matchExact(textAtom.text, term);
    case 'word_boundary':
      return matchWordBoundary(textAtom.text, term);
    case 'substring':
      return matchSubstring(textAtom.text, term);
    case 'canonical_id':
      // For canonical_id, term is the canonical ID
      return matchCanonicalId(textAtom, term);
    default:
      return false;
  }
}

/**
 * Find all matches for a term across multiple text atoms
 *
 * @param textAtoms - Array of text atoms to search
 * @param term - Term to match
 * @param mode - Match mode to use
 * @returns Array of matching text atoms with match details
 */
export function findMatches(
  textAtoms: TextAtom[],
  term: string,
  mode: MatchMode,
): Array<{ atom: TextAtom; matchedText: string }> {
  const matches: Array<{ atom: TextAtom; matchedText: string }> = [];

  for (const atom of textAtoms) {
    if (matchTextAtom(atom, term, mode)) {
      // Extract matched portion for better reporting
      let matchedText: string;
      if (mode === 'canonical_id' && atom.canonicalId) {
        matchedText = atom.canonicalId;
      } else if (mode === 'exact') {
        matchedText = term;
      } else if (mode === 'word_boundary') {
        // Find the actual matched word in context
        const lowerText = atom.text.toLowerCase();
        const lowerTerm = term.toLowerCase();
        const index = lowerText.indexOf(lowerTerm);
        if (index >= 0) {
          matchedText = atom.text.substring(index, index + term.length);
        } else {
          matchedText = term;
        }
      } else {
        // substring mode
        matchedText = term;
      }

      matches.push({ atom, matchedText });
    }
  }

  return matches;
}
