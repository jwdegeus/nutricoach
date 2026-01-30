'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetIngredientEnabledInput {
  ingredientUid: string;
  isEnabled: boolean;
  reason?: string | null;
}

export interface BulkSetIngredientEnabledInput {
  ingredientUids: string[];
  isEnabled: boolean;
  reason?: string | null;
}

export type SetIngredientEnabledResult =
  | { ok: true }
  | { ok: false; error: string };

export type BulkSetIngredientEnabledResult =
  | { ok: true; updated: number }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Validation (matches ingredient_overview_v1 UID format)
// ---------------------------------------------------------------------------

const VALID_PREFIXES = ['nevo:', 'ai:', 'custom:', 'fndds:'] as const;
const MAX_UID_LENGTH = 100;
const BULK_MAX = 500;

function isValidIngredientUid(uid: unknown): uid is string {
  if (
    typeof uid !== 'string' ||
    uid.length === 0 ||
    uid.length > MAX_UID_LENGTH
  ) {
    return false;
  }
  return VALID_PREFIXES.some((p) => uid.startsWith(p));
}

function validateIngredientUid(uid: string): string | null {
  if (!isValidIngredientUid(uid)) {
    return `ingredientUid moet beginnen met ${VALID_PREFIXES.join(' | ')} en max ${MAX_UID_LENGTH} tekens zijn`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Single: set enabled/disabled for one ingredient
// ---------------------------------------------------------------------------

/**
 * Set enabled/disabled state for one ingredient (admin-only).
 * Upserts ingredient_state_overrides. When enabling, disabled_reason is set to null unless provided.
 */
export async function setIngredientEnabledAction(
  input: SetIngredientEnabledInput,
): Promise<SetIngredientEnabledResult> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      ok: false,
      error: 'Alleen admins kunnen ingredienten in- of uitschakelen',
    };
  }

  const uid =
    typeof input.ingredientUid === 'string' ? input.ingredientUid.trim() : '';
  const err = validateIngredientUid(uid);
  if (err) {
    return { ok: false, error: err };
  }

  const isEnabled = Boolean(input.isEnabled);
  const disabledReason = isEnabled
    ? null
    : input.reason != null && input.reason !== ''
      ? String(input.reason).trim().slice(0, 500)
      : null;
  const updatedAt = new Date().toISOString();

  try {
    const supabase = await createClient();
    const { error } = await supabase.from('ingredient_state_overrides').upsert(
      {
        ingredient_uid: uid,
        is_enabled: isEnabled,
        disabled_reason: disabledReason,
        updated_at: updatedAt,
      },
      { onConflict: 'ingredient_uid' },
    );

    if (error) {
      return { ok: false, error: `Fout bij bijwerken: ${error.message}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Onbekende fout bij bijwerken',
    };
  }
}

// ---------------------------------------------------------------------------
// Bulk: set enabled/disabled for multiple ingredients
// ---------------------------------------------------------------------------

/**
 * Set enabled/disabled state for multiple ingredients (admin-only).
 * Max 500 UIDs per call; duplicates are removed. Returns count of rows upserted.
 */
export async function bulkSetIngredientEnabledAction(
  input: BulkSetIngredientEnabledInput,
): Promise<BulkSetIngredientEnabledResult> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      ok: false,
      error: 'Alleen admins kunnen ingredienten in bulk in- of uitschakelen',
    };
  }

  const raw = Array.isArray(input.ingredientUids) ? input.ingredientUids : [];
  const uids = [
    ...new Set(
      raw.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean),
    ),
  ];

  if (uids.length === 0) {
    return { ok: false, error: 'ingredientUids mag niet leeg zijn' };
  }
  if (uids.length > BULK_MAX) {
    return {
      ok: false,
      error: `Maximaal ${BULK_MAX} ingredientUids per aanroep (ontvangen: ${uids.length})`,
    };
  }

  for (const uid of uids) {
    const err = validateIngredientUid(uid);
    if (err) {
      return {
        ok: false,
        error: `Ongeldige ingredientUid "${uid.slice(0, 30)}...": ${err}`,
      };
    }
  }

  const isEnabled = Boolean(input.isEnabled);
  const disabledReason = isEnabled
    ? null
    : input.reason != null && input.reason !== ''
      ? String(input.reason).trim().slice(0, 500)
      : null;
  const updatedAt = new Date().toISOString();

  const rows = uids.map((ingredient_uid) => ({
    ingredient_uid,
    is_enabled: isEnabled,
    disabled_reason: disabledReason,
    updated_at: updatedAt,
  }));

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('ingredient_state_overrides')
      .upsert(rows, { onConflict: 'ingredient_uid' });

    if (error) {
      return { ok: false, error: `Fout bij bulk bijwerken: ${error.message}` };
    }
    return { ok: true, updated: rows.length };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : 'Onbekende fout bij bulk bijwerken',
    };
  }
}
