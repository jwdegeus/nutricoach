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
 * Load paginated ingredient list from view ingredient_overview_v1.
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
  const q = (input.q ?? '').trim().slice(0, MAX_SEARCH_LENGTH);

  const selectWithGroup =
    'ingredient_uid, source, source_rank, source_id, display_name, description, created_at, food_group_nl, is_enabled';
  const selectWithoutGroup =
    'ingredient_uid, source, source_rank, source_id, display_name, description, created_at, is_enabled';

  try {
    const supabase = await createClient();

    const buildQuery = (selectCols: string) => {
      let query = supabase
        .from('ingredient_overview_v1')
        .select(selectCols, { count: 'exact' })
        .order('source_rank', { ascending: true })
        .order('display_name', { ascending: true });
      if (source !== 'all') query = query.eq('source', source);
      if (q) {
        const safeQ = q
          .replace(/%/g, '\\%')
          .replace(/_/g, '\\_')
          .replace(/,/g, ' ');
        query = query.or(
          `display_name.ilike.%${safeQ}%,description.ilike.%${safeQ}%`,
        );
      }
      return query.range(offset, offset + limit - 1);
    };

    let result = await buildQuery(selectWithGroup);

    if (result.error) {
      const msg = result.error.message ?? '';
      const columnMissing =
        /food_group_nl|column.*does not exist|unknown column/i.test(msg);
      if (columnMissing) {
        result = await buildQuery(selectWithoutGroup);
        if (result.error) {
          return { error: `Fout bij laden overzicht: ${result.error.message}` };
        }
        const list = (
          (result.data ?? []) as unknown as Record<string, unknown>[]
        ).map(
          (row) =>
            ({
              ...row,
              food_group_nl: null,
              is_enabled: (row as { is_enabled?: boolean }).is_enabled ?? true,
            }) as IngredientOverviewRow,
        );
        return {
          rows: list,
          totalCount: result.count ?? undefined,
        };
      }
      return { error: `Fout bij laden overzicht: ${msg}` };
    }

    const list = (
      (result.data ?? []) as unknown as Record<string, unknown>[]
    ).map(
      (row) =>
        ({
          ...row,
          is_enabled: (row as { is_enabled?: boolean }).is_enabled ?? true,
        }) as IngredientOverviewRow,
    );
    return {
      rows: list,
      totalCount: result.count ?? undefined,
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
