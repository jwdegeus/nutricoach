'use server';

import { z } from 'zod';
import { createAdminClient } from '@/src/lib/supabase/admin';
import { isAdmin } from '@/src/lib/auth/roles';

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

/** Minimal columns for system catalog options (no SELECT *). */
const SYSTEM_CATALOG_COLUMNS =
  'id,dimension,key,label,is_active,sort_order,updated_at';

export type SystemCatalogOptionRow = {
  id: string;
  dimension: string;
  key: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  updated_at: string | null;
};

const keySchema = z
  .string()
  .min(1, 'Key is verplicht')
  .max(40)
  .regex(/^[a-z0-9_\-]+$/, 'Key: alleen kleine letters, cijfers, _ en -');

const createSchema = z.object({
  dimension: dimensionSchema,
  key: keySchema,
  label: z
    .string()
    .min(1, 'Label is verplicht')
    .max(40)
    .transform((s) => s.trim()),
  sortOrder: z.number().int().min(0).optional().default(0),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  label: z
    .string()
    .min(1)
    .max(40)
    .transform((s) => s.trim())
    .optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

/**
 * List system catalog options for a dimension (admin only).
 * Uses service-role client because RLS does not allow SELECT on system rows by non-owners.
 */
export async function adminListSystemCatalogOptionsAction(args: {
  dimension: CatalogDimension;
}): Promise<ActionResult<SystemCatalogOptionRow[]>> {
  try {
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Alleen admins kunnen catalog opties bekijken',
        },
      };
    }

    const parsed = z.object({ dimension: dimensionSchema }).safeParse(args);
    if (!parsed.success) {
      const msg =
        parsed.error.flatten().formErrors?.[0] ?? parsed.error.message;
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: msg } };
    }

    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from('catalog_options')
      .select(SYSTEM_CATALOG_COLUMNS)
      .eq('dimension', parsed.data.dimension)
      .eq('scope', 'system')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });

    if (error) {
      return { ok: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { ok: true, data: (rows ?? []) as SystemCatalogOptionRow[] };
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

/**
 * Create a system catalog option (admin only).
 * Uses service-role client because RLS does not allow INSERT for scope=system.
 */
export async function adminCreateSystemCatalogOptionAction(args: {
  dimension: CatalogDimension;
  key: string;
  label: string;
  sortOrder?: number;
}): Promise<ActionResult<SystemCatalogOptionRow>> {
  try {
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Alleen admins kunnen catalog opties aanmaken',
        },
      };
    }

    const parsed = createSchema.safeParse(args);
    if (!parsed.success) {
      const msg =
        parsed.error.flatten().formErrors?.[0] ?? parsed.error.message;
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: msg } };
    }

    const { dimension, key, label, sortOrder } = parsed.data;
    const admin = createAdminClient();

    const { data: row, error } = await admin
      .from('catalog_options')
      .insert({
        dimension,
        scope: 'system',
        user_id: null,
        key,
        label,
        is_active: true,
        sort_order: sortOrder,
      })
      .select(SYSTEM_CATALOG_COLUMNS)
      .single();

    if (error) {
      return { ok: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { ok: true, data: row as SystemCatalogOptionRow };
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

/**
 * Update a system catalog option (admin only).
 * Only updates rows where scope='system' (by id; admin client can update any row).
 */
export async function adminUpdateSystemCatalogOptionAction(args: {
  id: string;
  label?: string;
  isActive?: boolean;
  sortOrder?: number;
}): Promise<ActionResult<SystemCatalogOptionRow>> {
  try {
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Alleen admins kunnen catalog opties bewerken',
        },
      };
    }

    const parsed = updateSchema.safeParse(args);
    if (!parsed.success) {
      const msg =
        parsed.error.flatten().formErrors?.[0] ?? parsed.error.message;
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: msg } };
    }

    const { id, label, isActive, sortOrder } = parsed.data;
    const admin = createAdminClient();

    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = label;
    if (isActive !== undefined) updates.is_active = isActive;
    if (sortOrder !== undefined) updates.sort_order = sortOrder;
    if (Object.keys(updates).length === 0) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Geen velden om bij te werken',
        },
      };
    }

    const { data: row, error } = await admin
      .from('catalog_options')
      .update(updates)
      .eq('id', id)
      .eq('scope', 'system')
      .select(SYSTEM_CATALOG_COLUMNS)
      .single();

    if (error) {
      return { ok: false, error: { code: 'DB_ERROR', message: error.message } };
    }
    if (!row) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Optie niet gevonden of geen system-optie',
        },
      };
    }

    return { ok: true, data: row as SystemCatalogOptionRow };
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
