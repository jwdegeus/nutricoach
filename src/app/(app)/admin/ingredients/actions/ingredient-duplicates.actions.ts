'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DuplicateCandidate {
  nevoUid: string;
  fnddsUid: string;
  nevoName: string;
  fnddsName: string;
  score: number;
  matchMethod: 'exact' | 'trgm' | 'contains';
  /** Always fnddsUid in v1 (recommend disabling FNDDS, keep NEVO primary). */
  recommendedDisableUid: string;
  isFnddsEnabled: boolean;
}

export interface FindIngredientDuplicatesInput {
  /** Optional: filter candidates by term (ilike on nevoName or fnddsName). */
  q?: string;
  /** Max candidates to return; default 100, max 500. */
  limit?: number;
  /** Min trigram similarity (0..1); default 0.6. Only affects fuzzy (trgm) matches. */
  minScore?: number;
  /** If false (default), skip pairs where FNDDS ingredient is already disabled. */
  includeDisabled?: boolean;
  /** If true, include trigram (fuzzy) matches; can be slow on large datasets. Default false. */
  includeTrgm?: boolean;
}

export type FindIngredientDuplicatesResult =
  | { ok: true; rows: DuplicateCandidate[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DEFAULT_MIN_SCORE = 0.6;
const MAX_Q_LENGTH = 200;

// ---------------------------------------------------------------------------
// Action: find NEVO ↔ FNDDS duplicate candidates (admin-only, read-only)
// ---------------------------------------------------------------------------

/**
 * Find duplicate candidates between NEVO and FNDDS (admin-only).
 * Uses ingredient_overview_v1 via RPC find_ingredient_duplicate_candidates.
 * Returns pairs with score and match method; recommendedDisableUid is always FNDDS.
 */
export async function findIngredientDuplicatesAction(
  input: FindIngredientDuplicatesInput = {},
): Promise<FindIngredientDuplicatesResult> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      ok: false,
      error: 'Alleen admins kunnen duplicaten zoeken',
    };
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT));
  const minScore = Math.min(
    1,
    Math.max(0, input.minScore ?? DEFAULT_MIN_SCORE),
  );
  const includeDisabled = Boolean(input.includeDisabled);
  const includeTrgm = Boolean(input.includeTrgm);
  const q =
    input.q != null && typeof input.q === 'string'
      ? input.q.trim().slice(0, MAX_Q_LENGTH)
      : null;

  try {
    const supabase = await createClient();
    const { data: rows, error } = await supabase.rpc(
      'find_ingredient_duplicate_candidates',
      {
        p_q: q || null,
        p_limit: limit,
        p_min_score: minScore,
        p_include_disabled: includeDisabled,
        p_include_trgm: includeTrgm,
      },
    );

    if (error) {
      return {
        ok: false,
        error: `Fout bij zoeken duplicaten: ${error.message}`,
      };
    }

    const list = (Array.isArray(rows) ? rows : []) as Array<{
      nevo_uid: string;
      fndds_uid: string;
      nevo_name: string;
      fndds_name: string;
      score: number;
      match_method: string;
      is_fndds_enabled: boolean;
    }>;

    const candidates: DuplicateCandidate[] = list.map((r) => ({
      nevoUid: r.nevo_uid ?? '',
      fnddsUid: r.fndds_uid ?? '',
      nevoName: r.nevo_name ?? '',
      fnddsName: r.fndds_name ?? '',
      score: Number(r.score) ?? 0,
      matchMethod:
        r.match_method === 'exact'
          ? 'exact'
          : r.match_method === 'contains'
            ? 'contains'
            : 'trgm',
      recommendedDisableUid: r.fndds_uid ?? '',
      isFnddsEnabled: Boolean(r.is_fndds_enabled),
    }));

    return { ok: true, rows: candidates };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : 'Onbekende fout bij zoeken duplicaten',
    };
  }
}
