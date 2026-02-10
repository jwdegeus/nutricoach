'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/src/lib/supabase/server';

/** Minimal columns for user_preferences (no SELECT *) */
const USER_PREFS_HOUSEHOLD_COLUMN = 'household_id';

/** Minimal columns for households servings prefs (no SELECT *) */
const HOUSEHOLDS_SERVINGS_COLUMNS = 'id,household_size,servings_policy';

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR';
        message: string;
      };
    };

/** Servings preferences returned to UI (camelCase) */
export type HouseholdServingsPrefs = {
  householdSize: number;
  servingsPolicy: 'scale_to_household' | 'keep_recipe_servings';
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

/**
 * Get household servings preferences (household_size, servings_policy) for the current user's household.
 * Returns DB_ERROR "Huishouden ontbreekt" if user has no household_id.
 */
export async function getHouseholdServingsPrefsAction(): Promise<
  ActionResult<HouseholdServingsPrefs>
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
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Huishouden ontbreekt',
        },
      };
    }

    const { data, error } = await supabase
      .from('households')
      .select(HOUSEHOLDS_SERVINGS_COLUMNS)
      .eq('id', householdId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    const row = data as {
      id: string;
      household_size: number;
      servings_policy: string;
    } | null;

    if (!row) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Huishouden niet gevonden',
        },
      };
    }

    const householdSize =
      typeof row.household_size === 'number' &&
      row.household_size >= 1 &&
      row.household_size <= 12
        ? row.household_size
        : 1;
    const servingsPolicy =
      row.servings_policy === 'scale_to_household' ||
      row.servings_policy === 'keep_recipe_servings'
        ? row.servings_policy
        : 'scale_to_household';

    return {
      ok: true,
      data: { householdSize, servingsPolicy },
    };
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

const updateHouseholdServingsPrefsSchema = z.object({
  householdSize: z.number().int().min(1).max(12),
  servingsPolicy: z.enum(['scale_to_household', 'keep_recipe_servings']),
});

/**
 * Update household servings preferences (household_size, servings_policy).
 * RLS ensures only owner can update.
 */
export async function updateHouseholdServingsPrefsAction(
  raw: z.infer<typeof updateHouseholdServingsPrefsSchema>,
): Promise<ActionResult<HouseholdServingsPrefs>> {
  try {
    const parsed = updateHouseholdServingsPrefsSchema.safeParse(raw);
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

    const { householdSize, servingsPolicy } = parsed.data;

    const { error } = await supabase
      .from('households')
      .update({
        household_size: householdSize,
        servings_policy: servingsPolicy,
      })
      .eq('id', householdId);

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    revalidatePath('/familie/edit');
    revalidatePath('/familie');
    return {
      ok: true,
      data: { householdSize, servingsPolicy },
    };
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
