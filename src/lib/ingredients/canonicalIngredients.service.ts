/**
 * Canonical Ingredient Catalog Service
 *
 * Server-only read-path for canonical_ingredient_catalog_v1.
 * Queries the view with explicit columns; aggregates refs per ingredient.
 * No SELECT *; errors return null/empty (no PII in logs).
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import type {
  CanonicalIngredient,
  CanonicalIngredientRef,
  CanonicalIngredientRefType,
} from './canonicalIngredients.types';

const CATALOG_VIEW = 'canonical_ingredient_catalog_v1';
const CATALOG_COLUMNS =
  'ingredient_id, name, slug, ref_type, ref_value, created_at, updated_at';

const REF_TYPES: Set<string> = new Set(['nevo', 'fdc', 'custom', 'ai']);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type ViewRow = {
  ingredient_id: string;
  name: string;
  slug: string;
  ref_type: string | null;
  ref_value: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Sanitize query for ILIKE: remove wildcards so pattern is literal (avoids full scan / injection).
 * Returns pattern '%sanitized%' for partial match.
 */
function patternForIlike(q: string): string {
  const sanitized = q.replace(/%/g, '').replace(/_/g, '');
  return `%${sanitized}%`;
}

function mapRef(
  type: string | null,
  value: string | null,
): CanonicalIngredientRef | null {
  if (type == null || value == null || !REF_TYPES.has(type)) return null;
  return { type: type as CanonicalIngredientRefType, value };
}

/**
 * Aggregate view rows (one per ref, or one row with null ref) into CanonicalIngredient[].
 * Dedupes refs by type+value defensively.
 */
function aggregateRows(rows: ViewRow[]): CanonicalIngredient[] {
  const byId = new Map<
    string,
    {
      name: string;
      slug: string;
      createdAt: string;
      updatedAt: string;
      refs: Set<string>;
      refList: CanonicalIngredientRef[];
    }
  >();
  for (const r of rows) {
    const existing = byId.get(r.ingredient_id);
    const ref = mapRef(r.ref_type, r.ref_value);
    if (existing) {
      if (ref) {
        const key = `${ref.type}:${ref.value}`;
        if (!existing.refs.has(key)) {
          existing.refs.add(key);
          existing.refList.push(ref);
        }
      }
    } else {
      const refList: CanonicalIngredientRef[] = ref ? [ref] : [];
      const refs = new Set<string>();
      if (ref) refs.add(`${ref.type}:${ref.value}`);
      byId.set(r.ingredient_id, {
        name: r.name,
        slug: r.slug,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        refs,
        refList,
      });
    }
  }
  return Array.from(byId.entries()).map(([id, v]) => ({
    id,
    name: v.name,
    slug: v.slug,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    refs: v.refList,
  }));
}

/**
 * Search canonical ingredients by name or slug (ILIKE).
 * Returns aggregated rows per ingredient with refs array.
 * Empty/whitespace q returns []. Limit default 25, max 100.
 */
export async function searchCanonicalIngredients(options: {
  q: string;
  limit?: number;
}): Promise<CanonicalIngredient[]> {
  const trimmed = options.q?.trim() ?? '';
  if (trimmed === '') return [];

  const limit = Math.min(
    Math.max(1, options.limit ?? DEFAULT_LIMIT),
    MAX_LIMIT,
  );
  const pattern = patternForIlike(trimmed);

  try {
    const supabase = await createClient();
    // Two queries to avoid embedding user input in .or() filter string
    const [byName, bySlug] = await Promise.all([
      supabase
        .from(CATALOG_VIEW)
        .select(CATALOG_COLUMNS)
        .ilike('name', pattern)
        .limit(limit),
      supabase
        .from(CATALOG_VIEW)
        .select(CATALOG_COLUMNS)
        .ilike('slug', pattern)
        .limit(limit),
    ]);

    if (byName.error) {
      console.error(
        'Canonical ingredient search (name) failed:',
        byName.error.message,
      );
      return [];
    }
    if (bySlug.error) {
      console.error(
        'Canonical ingredient search (slug) failed:',
        bySlug.error.message,
      );
      return [];
    }

    const rows = [...(byName.data ?? []), ...(bySlug.data ?? [])] as ViewRow[];
    const merged = aggregateRows(rows);
    return merged.slice(0, limit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Canonical ingredient search error:', msg);
    return [];
  }
}

const NEVO_REF_BATCH_SIZE = 100;

/**
 * Bulk lookup: nevoCode -> canonical_ingredients.id via canonical_ingredient_catalog_v1.
 * ref_type = 'nevo', ref_value in (nevoCodes). Chunks in batches to avoid .in() limits.
 */
export async function getCanonicalIngredientIdsByNevoCodes(
  nevoCodes: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(nevoCodes)].filter(Boolean);
  if (unique.length === 0) return new Map();

  const result = new Map<string, string>();
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += NEVO_REF_BATCH_SIZE) {
    batches.push(unique.slice(i, i + NEVO_REF_BATCH_SIZE));
  }

  try {
    const supabase = await createClient();
    for (const batch of batches) {
      const { data, error } = await supabase
        .from(CATALOG_VIEW)
        .select('ingredient_id, ref_value')
        .eq('ref_type', 'nevo')
        .in('ref_value', batch);

      if (error) {
        const isSchemaCache =
          /schema cache|relation.*does not|could not find/i.test(error.message);
        if (isSchemaCache) {
          console.warn(
            'Canonical ingredient catalog view not available (migrations may not be applied). Run: supabase db push',
          );
          return result;
        }
        console.error(
          'Canonical ingredient lookup by nevoCodes failed:',
          error.message,
        );
        continue;
      }
      for (const row of data ?? []) {
        const refValue = row.ref_value as string | null;
        const ingredientId = row.ingredient_id as string | null;
        if (refValue != null && ingredientId != null) {
          result.set(refValue, ingredientId);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Canonical ingredient lookup error:', msg);
  }
  return result;
}

/**
 * Get one canonical ingredient by id with all refs.
 * Returns null if not found or on error.
 */
export async function getCanonicalIngredientById(
  id: string,
): Promise<CanonicalIngredient | null> {
  if (!id?.trim()) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from(CATALOG_VIEW)
      .select(CATALOG_COLUMNS)
      .eq('ingredient_id', id.trim());

    if (error) {
      console.error('Canonical ingredient getById failed:', error.message);
      return null;
    }
    const rows = (data ?? []) as ViewRow[];
    const aggregated = aggregateRows(rows);
    return aggregated[0] ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Canonical ingredient getById error:', msg);
    return null;
  }
}
