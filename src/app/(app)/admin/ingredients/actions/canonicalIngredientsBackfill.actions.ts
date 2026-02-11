'use server';

import { isAdmin } from '@/src/lib/auth/roles';
import { ensureCanonicalIngredientsForNevoCodes } from '@/src/lib/ingredients/canonicalIngredients.admin.service';

const MAX_NEVO_CODES = 500;

type BackfillResult = { ensured: number; skipped: number; errors: number };

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * Backfill canonical_ingredients + ingredient_external_refs (nevo) for given NEVO codes (admin-only).
 * Dedupes and limits to 500 server-side. Idempotent: existing refs are skipped.
 */
export async function backfillCanonicalIngredientsForNevoCodesAction({
  nevoCodes,
}: {
  nevoCodes: string[];
}): Promise<ActionResult<BackfillResult>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Alleen admins kunnen canonical ingredients backfillen.',
      },
    };
  }

  const codes = [
    ...new Set((nevoCodes ?? []).map((c) => String(c).trim()).filter(Boolean)),
  ].slice(0, MAX_NEVO_CODES);

  try {
    const data = await ensureCanonicalIngredientsForNevoCodes(codes);
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('backfillCanonicalIngredientsForNevoCodesAction error', msg);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Backfill mislukt.' },
    };
  }
}
