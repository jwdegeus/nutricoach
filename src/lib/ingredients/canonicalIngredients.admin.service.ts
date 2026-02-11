/**
 * Canonical Ingredients Admin Service
 *
 * Server-only; uses admin Supabase client for writes (canonical_ingredients + refs).
 * Idempotent backfill: ensures canonical ingredients + NEVO refs for given codes.
 * No SELECT *; no secrets; logging counts + error.message only.
 */

import 'server-only';
import { createAdminClient } from '@/src/lib/supabase/admin';
import { getNevoFoodByCode } from '@/src/lib/nevo/nutrition-calculator';

const REFS_TABLE = 'ingredient_external_refs';
const REFS_SELECT = 'ref_value, ingredient_id';
const INGREDIENTS_TABLE = 'canonical_ingredients';
const BATCH_IN_SIZE = 100;
const MAX_CODES = 500;

/** Minimal slug: lowercase, trim, spaces → single dash; no business rules. */
function toSlug(name: string): string {
  const s = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'ingredient';
}

export type EnsureResult = {
  ensured: number;
  skipped: number;
  errors: number;
};

/**
 * Ensure canonical ingredients + ingredient_external_refs (ref_type=nevo) for given NEVO codes.
 * Idempotent: existing refs are skipped; no duplicates.
 * Unknown NEVO codes are skipped and counted as errors (no throw).
 */
export async function ensureCanonicalIngredientsForNevoCodes(
  nevoCodes: string[],
): Promise<EnsureResult> {
  const codes = [
    ...new Set(nevoCodes.map((c) => String(c).trim()).filter(Boolean)),
  ].slice(0, MAX_CODES);
  const result: EnsureResult = { ensured: 0, skipped: 0, errors: 0 };

  if (codes.length === 0) return result;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Canonical backfill: admin client failed', msg);
    result.errors = codes.length;
    return result;
  }

  // 1) Existing refs (ref_type = 'nevo', ref_value IN codes) – chunk 100
  const existingRefValues = new Set<string>();
  for (let i = 0; i < codes.length; i += BATCH_IN_SIZE) {
    const batch = codes.slice(i, i + BATCH_IN_SIZE);
    const { data, error } = await admin
      .from(REFS_TABLE)
      .select(REFS_SELECT)
      .eq('ref_type', 'nevo')
      .in('ref_value', batch);

    if (error) {
      console.error(
        'Canonical backfill: existing refs query failed',
        error.message,
      );
      result.errors += batch.length;
      continue;
    }
    for (const row of data ?? []) {
      const v = (row as { ref_value?: string }).ref_value;
      if (v) existingRefValues.add(v);
    }
  }

  const missing = codes.filter((c) => !existingRefValues.has(c));
  result.skipped = codes.length - missing.length;
  if (missing.length === 0) return result;

  // 2) For each missing: get NEVO name, create canonical_ingredient + ref
  for (const code of missing) {
    const codeNum = Number(code);
    if (Number.isNaN(codeNum)) {
      result.errors += 1;
      continue;
    }

    const food = await getNevoFoodByCode(codeNum);
    if (!food) {
      result.errors += 1;
      continue;
    }
    const name = String(
      (food as { name_nl?: string }).name_nl ??
        (food as { name_en?: string }).name_en ??
        `NEVO ${code}`,
    );

    let slug = toSlug(name);
    const insertSlug = () =>
      admin
        .from(INGREDIENTS_TABLE)
        .insert({ name, slug })
        .select('id, slug')
        .single();

    let insertResult = await insertSlug();
    if (insertResult.error) {
      if (insertResult.error.code === '23505') {
        slug = `${slug}-${code}`;
        insertResult = await insertSlug();
      }
      if (insertResult.error) {
        console.error(
          'Canonical backfill: insert ingredient failed',
          insertResult.error.message,
        );
        result.errors += 1;
        continue;
      }
    }

    const ingredientId = (insertResult.data as { id: string } | null)?.id;
    if (!ingredientId) {
      result.errors += 1;
      continue;
    }

    const { error: refError } = await admin.from(REFS_TABLE).insert({
      ingredient_id: ingredientId,
      ref_type: 'nevo',
      ref_value: code,
    });

    if (refError) {
      console.error('Canonical backfill: insert ref failed', refError.message);
      result.errors += 1;
      continue;
    }
    result.ensured += 1;
  }

  return result;
}
