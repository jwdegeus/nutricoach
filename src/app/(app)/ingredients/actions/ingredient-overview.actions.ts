'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import type {
  IngredientOverviewSource,
  IngredientOverviewRow,
  LoadIngredientOverviewInput,
  LoadIngredientOverviewResult,
} from '../ingredients.types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_SEARCH_LENGTH = 200;

/**
 * Load paginated ingredient list via get_ingredient_overview_paginated (SECURITY INVOKER).
 * Filter by source and optional search (q); sort by source_rank then display_name.
 * Admin-only.
 */
export async function loadIngredientOverviewAction(
  input: LoadIngredientOverviewInput = {},
): Promise<LoadIngredientOverviewResult | { error: string }> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Alleen admins kunnen de ingredientenoverzicht laden' };
  }

  const source: IngredientOverviewSource = input.source ?? 'all';
  const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, input.offset ?? 0);
  const q = (input.q ?? '').trim().slice(0, MAX_SEARCH_LENGTH) || null;

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc(
      'get_ingredient_overview_paginated',
      {
        p_source: source,
        p_limit: limit,
        p_offset: offset,
        p_q: q,
      },
    );

    if (error) {
      return { error: `Fout bij laden overzicht: ${error.message}` };
    }

    const first = Array.isArray(data) ? data[0] : data;
    const rowsJson = (first as { rows?: unknown } | null)?.rows;
    const totalCount = (first as { total_count?: number } | null)?.total_count;
    const list = Array.isArray(rowsJson)
      ? (rowsJson as Record<string, unknown>[]).map(
          (row) =>
            ({
              ...row,
              is_enabled: (row as { is_enabled?: boolean }).is_enabled ?? true,
            }) as IngredientOverviewRow,
        )
      : [];

    return {
      rows: list,
      totalCount: totalCount ?? undefined,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Onbekende fout bij laden overzicht',
    };
  }
}
