'use server';

import { z } from 'zod';
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

const DIMENSIONS = [
  'cuisine',
  'protein_type',
  'meal_slot',
  'recipe_book',
] as const;
const dimensionSchema = z.enum(DIMENSIONS);
export type CatalogDimension = z.infer<typeof dimensionSchema>;

/** Minimal columns for catalog_options (no SELECT *). */
const CATALOG_OPTIONS_LIST_COLUMNS = 'id,scope,key,label,sort_order';
const CATALOG_OPTIONS_PICKER_COLUMNS = 'id,key,label,is_active';

export type CatalogOptionRow = {
  id: string;
  scope: string;
  key: string | null;
  label: string;
  sort_order: number;
};

/** Option item for picker/select: includes isActive so UI can show "(inactief)"; key for meal_slot resolve. */
export type CatalogOptionPickerItem = {
  id: string;
  label: string;
  isActive: boolean;
  /** Stable key (system options); used e.g. to resolve meal_slot text to option id. */
  key?: string | null;
};

const createUserOptionSchema = z.object({
  dimension: dimensionSchema,
  label: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, 'Label mag niet leeg zijn').max(40)),
});

/**
 * List catalog options for a dimension: system + user (active, sorted).
 * System first (sort_order asc, label asc), then user (label asc).
 * RLS: scope=system OR (scope=user AND user_id=auth.uid()).
 */
export async function listCatalogOptionsAction(args: {
  dimension: CatalogDimension;
}): Promise<ActionResult<CatalogOptionRow[]>> {
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

    const parsed = z.object({ dimension: dimensionSchema }).safeParse(args);
    if (!parsed.success) {
      const msg =
        parsed.error.flatten().formErrors?.[0] ?? parsed.error.message;
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: msg },
      };
    }

    const { data: rows, error } = await supabase
      .from('catalog_options')
      .select(CATALOG_OPTIONS_LIST_COLUMNS)
      .eq('dimension', parsed.data.dimension)
      .eq('is_active', true)
      .order('scope', { ascending: true }) // 'system' < 'user' so system first
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    const list = (rows ?? []) as CatalogOptionRow[];
    return { ok: true, data: list };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

import {
  CATALOG_PICKER_SORT,
  type CatalogPickerSort,
} from './catalog-options.types';

/**
 * Options for picker/select: active list + selected row if missing (e.g. inactive).
 * RLS: system or own user; selectedId row fetched even when is_active=false.
 * sortBy: 'label_az' uses A–Z by label (handy for recipe_book); default is display order.
 * Returns CatalogOptionPickerItem[] so UI can show "(inactief)" when !isActive.
 */
export async function getCatalogOptionsForPickerAction(args: {
  dimension: CatalogDimension;
  selectedId?: string | null;
  sortBy?: CatalogPickerSort;
}): Promise<ActionResult<CatalogOptionPickerItem[]>> {
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

    const parsed = z
      .object({
        dimension: dimensionSchema,
        selectedId: z.string().uuid().nullable().optional(),
        sortBy: z.enum(CATALOG_PICKER_SORT).optional(),
      })
      .safeParse(args);

    if (!parsed.success) {
      const msg =
        parsed.error.flatten().formErrors?.[0] ?? parsed.error.message;
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: msg },
      };
    }

    const { dimension, selectedId, sortBy } = parsed.data;

    const query = supabase
      .from('catalog_options')
      .select(CATALOG_OPTIONS_PICKER_COLUMNS)
      .eq('dimension', dimension)
      .eq('is_active', true)
      .order('scope', { ascending: true });

    if (sortBy === 'label_az') {
      query.order('label', { ascending: true });
    } else {
      query
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });
    }

    const { data: activeRows, error } = await query;

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    const activeList = (activeRows ?? []) as {
      id: string;
      key: string | null;
      label: string;
      is_active: boolean;
    }[];
    const pickerList: CatalogOptionPickerItem[] = activeList.map((r) => ({
      id: r.id,
      label: r.label,
      isActive: r.is_active,
      key: r.key ?? undefined,
    }));

    const hasSelected =
      selectedId && pickerList.some((o) => o.id === selectedId);

    if (selectedId && !hasSelected) {
      const { data: selectedRow } = await supabase
        .from('catalog_options')
        .select(CATALOG_OPTIONS_PICKER_COLUMNS)
        .eq('id', selectedId)
        .maybeSingle();

      if (selectedRow) {
        const row = selectedRow as {
          id: string;
          key: string | null;
          label: string;
          is_active: boolean;
        };
        const item: CatalogOptionPickerItem = {
          id: row.id,
          label: row.label,
          isActive: row.is_active,
          key: row.key ?? undefined,
        };
        pickerList.push(item);
      }
    }

    return { ok: true, data: pickerList };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

export type CreateUserCatalogOptionResult = { id: string; label: string };

/**
 * Create a user-scoped catalog option. Idempotent: if same user already has
 * an option with the same label_norm (dimension + user_id + normalized label),
 * returns the existing row (id, label) instead of error.
 */
export async function createUserCatalogOptionAction(args: {
  dimension: CatalogDimension;
  label: string;
}): Promise<ActionResult<CreateUserCatalogOptionResult>> {
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

    const parsed = createUserOptionSchema.safeParse(args);
    if (!parsed.success) {
      const msg =
        parsed.error.flatten().formErrors?.[0] ?? parsed.error.message;
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: msg },
      };
    }

    const { dimension, label } = parsed.data;
    const labelNorm = label.toLowerCase();

    // Idempotent: return existing row if same (dimension, user_id, label_norm)
    const { data: existing, error: selectError } = await supabase
      .from('catalog_options')
      .select('id,label')
      .eq('dimension', dimension)
      .eq('scope', 'user')
      .eq('user_id', user.id)
      .eq('label_norm', labelNorm)
      .maybeSingle();

    if (selectError) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: selectError.message },
      };
    }

    if (existing) {
      return {
        ok: true,
        data: {
          id: existing.id as string,
          label: (existing.label as string) ?? label,
        },
      };
    }

    const { data: inserted, error: insertError } = await supabase
      .from('catalog_options')
      .insert({
        dimension,
        scope: 'user',
        user_id: user.id,
        key: null,
        label,
      })
      .select('id,label')
      .single();

    if (insertError) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: insertError.message },
      };
    }

    return {
      ok: true,
      data: {
        id: inserted.id as string,
        label: (inserted.label as string) ?? label,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}
