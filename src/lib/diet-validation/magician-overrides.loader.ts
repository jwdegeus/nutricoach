/**
 * Loader voor magician_validator_overrides uit de database.
 * Alle false-positive exclusions komen uitsluitend uit de admin-sectie.
 * Geen hardcoded fallback - bij DB-fout of lege tabel: lege overrides.
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';

export type SubstringFalsePositives = Record<string, string[]>;

/** In-memory cache (per request) om herhaalde DB-calls te vermijden */
let cachedOverrides: SubstringFalsePositives | null = null;

/**
 * Laadt false-positive overrides uit magician_validator_overrides.
 * Bij DB-fout of lege tabel: lege object (geen hardcoded fallback).
 */
export async function loadMagicianOverrides(): Promise<SubstringFalsePositives> {
  if (cachedOverrides) return cachedOverrides;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('magician_validator_overrides')
      .select('forbidden_term, exclude_if_contains')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.warn(
        '[MagicianOverrides] DB error, using empty overrides:',
        error.message,
      );
      cachedOverrides = {};
      return cachedOverrides;
    }

    const overrides: SubstringFalsePositives = {};
    for (const row of data ?? []) {
      const term = String(row.forbidden_term ?? '')
        .trim()
        .toLowerCase();
      if (!term) continue;
      const arr = Array.isArray(row.exclude_if_contains)
        ? row.exclude_if_contains
        : [];
      const patterns = arr
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (patterns.length > 0) {
        overrides[term] = patterns;
      }
    }

    cachedOverrides = overrides;
    return cachedOverrides;
  } catch (e) {
    console.warn('[MagicianOverrides] Load failed, using empty overrides:', e);
    cachedOverrides = {};
    return cachedOverrides;
  }
}

/** Reset cache (bijv. na wijziging in admin) */
export function clearMagicianOverridesCache(): void {
  cachedOverrides = null;
}
