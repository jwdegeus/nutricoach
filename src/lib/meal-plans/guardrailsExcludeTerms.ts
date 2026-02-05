/**
 * Guardrails-aware exclude terms for template generator pool filtering.
 * Extracts hard block ingredient terms from the guardrails ruleset so they can be
 * applied before generation (reduces guardrails retries).
 *
 * Only used when ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER === 'true'.
 */

import { loadGuardrailsRuleset } from '@/src/lib/guardrails-vnext';
import type { SupabaseClient } from '@supabase/supabase-js';

const INGREDIENT_TERM_MATCH_MODES = [
  'exact',
  'word_boundary',
  'substring',
] as const;

/**
 * Load hard block ingredient terms from the guardrails ruleset for the given diet.
 * Conservative: only rules with target ingredient, action block, strictness hard,
 * and match mode term/substring (exact, word_boundary, substring). Excludes canonical_id.
 *
 * @param _supabase - Reserved for future repo injection; loader uses default repo
 * @param dietKey - Diet identifier (passed as dietId to ruleset loader)
 * @param locale - Locale for ruleset load
 * @returns Deduplicated list of terms (rule term + synonyms) for name-based exclusion
 */
export async function loadHardBlockTermsForDiet(
  _supabase: SupabaseClient,
  dietKey: string,
  locale: 'nl' | 'en' = 'nl',
): Promise<string[]> {
  const ruleset = await loadGuardrailsRuleset({
    dietId: dietKey,
    mode: 'meal_planner',
    locale,
  });

  const terms = new Set<string>();
  for (const rule of ruleset.rules) {
    if (
      rule.action !== 'block' ||
      rule.strictness !== 'hard' ||
      rule.target !== 'ingredient'
    ) {
      continue;
    }
    const mode = rule.match?.preferredMatchMode;
    if (
      mode !== undefined &&
      !(INGREDIENT_TERM_MATCH_MODES as readonly string[]).includes(mode)
    ) {
      continue;
    }
    const t = rule.match?.term?.trim();
    if (t) terms.add(t);
    for (const s of rule.match?.synonyms ?? []) {
      const sTrim = typeof s === 'string' ? s.trim() : '';
      if (sTrim) terms.add(sTrim);
    }
  }
  return Array.from(terms);
}
