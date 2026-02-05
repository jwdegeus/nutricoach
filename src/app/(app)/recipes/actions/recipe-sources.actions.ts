'use server';

import { createClient } from '@/src/lib/supabase/server';

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR';
        message: string;
      };
    };

/** Item for Bron picker: id and label are both the source name (custom_meals.source is text). */
export type RecipeSourcePickerItem = {
  id: string;
  label: string;
};

/**
 * List recipe_sources for the Bron dropdown (system + user), sorted A–Z by name.
 * Returns items where id === name so selection can set sourceName directly.
 */
export async function getRecipeSourcesForPickerAction(): Promise<
  ActionResult<RecipeSourcePickerItem[]>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    const { data: rows, error } = await supabase
      .from('recipe_sources')
      .select('name')
      .order('name', { ascending: true });

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    const items: RecipeSourcePickerItem[] = (rows ?? [])
      .map((r) => {
        const name = (r.name as string)?.trim() ?? '';
        return { id: name, label: name };
      })
      .filter((item) => item.label.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label, 'nl'));
    return { ok: true, data: items };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: e instanceof Error ? e.message : 'Bronnen laden mislukt',
      },
    };
  }
}

/**
 * Create a recipe source (or return existing if name already exists).
 * Used by "Eigen bron toevoegen" in the classification dialog.
 */
export async function createRecipeSourceAction(
  name: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    const trimmed = name.trim();
    if (!trimmed) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Bron naam mag niet leeg zijn',
        },
      };
    }

    const { data: existing } = await supabase
      .from('recipe_sources')
      .select('id, name')
      .eq('name', trimmed)
      .maybeSingle();

    if (existing) {
      return {
        ok: true,
        data: {
          id: existing.id as string,
          name: (existing.name as string) ?? trimmed,
        },
      };
    }

    const { data: inserted, error } = await supabase
      .from('recipe_sources')
      .insert({
        name: trimmed,
        is_system: false,
        created_by_user_id: user.id,
        usage_count: 0,
      })
      .select('id, name')
      .single();

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    return {
      ok: true,
      data: {
        id: inserted.id as string,
        name: (inserted.name as string) ?? trimmed,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: e instanceof Error ? e.message : 'Bron toevoegen mislukt',
      },
    };
  }
}
