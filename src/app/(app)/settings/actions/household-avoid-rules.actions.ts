'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/src/lib/supabase/server';

/** Minimal columns for user_preferences (no SELECT *) */
const USER_PREFS_HOUSEHOLD_COLUMN = 'household_id';

/** Columns for household_avoid_rules list (no SELECT *) */
const HOUSEHOLD_AVOID_RULES_LIST_COLUMNS =
  'id,rule_type,match_mode,match_value,strictness,note,created_at';

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR';
        message: string;
      };
    };

/** Record returned to UI (camelCase) */
export type HouseholdAvoidRuleRecord = {
  id: string;
  ruleType: 'allergen' | 'avoid' | 'warning';
  matchMode: 'nevo_code' | 'term';
  matchValue: string;
  strictness: 'hard' | 'soft';
  note: string | null;
  createdAt: string;
};

async function resolveHouseholdId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('user_preferences')
    .select(USER_PREFS_HOUSEHOLD_COLUMN)
    .eq('user_id', userId)
    .maybeSingle();
  const prefs = data as { household_id?: string | null } | null;
  const id =
    prefs != null &&
    typeof prefs.household_id === 'string' &&
    prefs.household_id.trim() !== ''
      ? prefs.household_id.trim()
      : null;
  return id;
}

function rowToRecord(row: {
  id: string;
  rule_type: string;
  match_mode: string;
  match_value: string;
  strictness: string;
  note: string | null;
  created_at: string;
}): HouseholdAvoidRuleRecord {
  return {
    id: row.id,
    ruleType:
      row.rule_type === 'allergen' ||
      row.rule_type === 'avoid' ||
      row.rule_type === 'warning'
        ? row.rule_type
        : 'avoid',
    matchMode:
      row.match_mode === 'nevo_code' || row.match_mode === 'term'
        ? row.match_mode
        : 'term',
    matchValue: String(row.match_value ?? '').trim(),
    strictness:
      row.strictness === 'hard' || row.strictness === 'soft'
        ? row.strictness
        : 'hard',
    note: row.note != null ? String(row.note).trim() || null : null,
    createdAt: row.created_at,
  };
}

/**
 * List household avoid rules for the current user's household.
 * Returns [] if user has no household_id.
 */
export async function listHouseholdAvoidRulesAction(): Promise<
  ActionResult<HouseholdAvoidRuleRecord[]>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const householdId = await resolveHouseholdId(supabase, user.id);
    if (householdId == null) {
      return { ok: true, data: [] };
    }

    const { data, error } = await supabase
      .from('household_avoid_rules')
      .select(HOUSEHOLD_AVOID_RULES_LIST_COLUMNS)
      .eq('household_id', householdId)
      .order('created_at', { ascending: false });

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    const rows = (data ?? []) as Array<{
      id: string;
      rule_type: string;
      match_mode: string;
      match_value: string;
      strictness: string;
      note: string | null;
      created_at: string;
    }>;
    const list = rows.map(rowToRecord);
    return { ok: true, data: list };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: err instanceof Error ? err.message : 'Onbekende fout',
      },
    };
  }
}

const createHouseholdAvoidRuleSchema = z.object({
  ruleType: z.enum(['allergen', 'avoid', 'warning']),
  matchMode: z.enum(['nevo_code', 'term']),
  matchValue: z
    .string()
    .trim()
    .min(1, 'Matchwaarde is verplicht')
    .max(80, 'Matchwaarde maximaal 80 tekens'),
  strictness: z.enum(['hard', 'soft']).default('hard'),
  note: z
    .string()
    .trim()
    .max(120, 'Notitie maximaal 120 tekens')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

/**
 * Create a household avoid rule.
 * Duplicate (same household_id + match_mode + match_value) returns VALIDATION_ERROR.
 */
export async function createHouseholdAvoidRuleAction(
  raw: z.infer<typeof createHouseholdAvoidRuleSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createHouseholdAvoidRuleSchema.safeParse(raw);
    if (!parsed.success) {
      const msg =
        parsed.error.errors.map((e) => e.message).join('; ') ||
        'Ongeldige invoer';
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: msg },
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const householdId = await resolveHouseholdId(supabase, user.id);
    if (householdId == null) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Huishouden ontbreekt',
        },
      };
    }

    const { ruleType, matchMode, matchValue, strictness, note } = parsed.data;
    const matchValueNormalized =
      matchMode === 'term'
        ? matchValue.trim().toLowerCase()
        : matchValue.trim();

    const { data, error } = await supabase
      .from('household_avoid_rules')
      .insert({
        household_id: householdId,
        rule_type: ruleType,
        match_mode: matchMode,
        match_value: matchValueNormalized,
        strictness: strictness ?? 'hard',
        note: note ?? null,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'Deze regel bestaat al (zelfde type en waarde voor dit huishouden).',
          },
        };
      }
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    const id = (data as { id: string }).id;
    revalidatePath('/familie/edit');
    revalidatePath('/familie');
    return { ok: true, data: { id } };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: err instanceof Error ? err.message : 'Onbekende fout',
      },
    };
  }
}

const deleteHouseholdAvoidRuleSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Delete a household avoid rule by id.
 * Only deletes if the rule belongs to the user's household (RLS).
 */
export async function deleteHouseholdAvoidRuleAction(
  raw: z.infer<typeof deleteHouseholdAvoidRuleSchema>,
): Promise<ActionResult<void>> {
  try {
    const parsed = deleteHouseholdAvoidRuleSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ongeldig regel-id',
        },
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const householdId = await resolveHouseholdId(supabase, user.id);
    if (householdId == null) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Huishouden ontbreekt',
        },
      };
    }

    const { error } = await supabase
      .from('household_avoid_rules')
      .delete()
      .eq('id', parsed.data.id)
      .eq('household_id', householdId);

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    revalidatePath('/familie/edit');
    revalidatePath('/familie');
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: err instanceof Error ? err.message : 'Onbekende fout',
      },
    };
  }
}
