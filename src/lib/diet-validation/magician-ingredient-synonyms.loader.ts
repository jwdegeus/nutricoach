/**
 * Loader voor magician_ingredient_synonyms uit de database.
 * Extra NL↔EN synoniemen voor ingrediënten-matching.
 * Geen hardcoded fallback - bij DB-fout of lege tabel: lege object.
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';

export type IngredientSynonyms = Record<string, string[]>;

/** In-memory cache (per request) */
let cachedSynonyms: IngredientSynonyms | null = null;

/**
 * Laadt extra synoniemen uit magician_ingredient_synonyms.
 * Bij DB-fout of lege tabel: lege object (geen hardcoded fallback).
 */
export async function loadMagicianIngredientSynonyms(): Promise<IngredientSynonyms> {
  if (cachedSynonyms) return cachedSynonyms;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('magician_ingredient_synonyms')
      .select('forbidden_term, synonym')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.warn(
        '[MagicianSynonyms] DB error, using empty synonyms:',
        error.message,
      );
      cachedSynonyms = {};
      return cachedSynonyms;
    }

    const synonyms: IngredientSynonyms = {};
    for (const row of data ?? []) {
      const term = String(row.forbidden_term ?? '')
        .trim()
        .toLowerCase();
      const syn = String(row.synonym ?? '').trim();
      if (!term || !syn) continue;
      const lowerSyn = syn.toLowerCase();
      if (!synonyms[term]) synonyms[term] = [];
      if (!synonyms[term].includes(lowerSyn)) synonyms[term].push(lowerSyn);
    }

    cachedSynonyms = synonyms;
    return cachedSynonyms;
  } catch (e) {
    console.warn('[MagicianSynonyms] Load failed, using empty synonyms:', e);
    cachedSynonyms = {};
    return cachedSynonyms;
  }
}

/** Reset cache (bijv. na wijziging in admin) */
export function clearMagicianIngredientSynonymsCache(): void {
  cachedSynonyms = null;
}
