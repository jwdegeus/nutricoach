'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { z } from 'zod';
import { clearMagicianOverridesCache } from '@/src/lib/diet-validation/magician-overrides.loader';

export type MagicianOverrideRow = {
  id: string;
  forbidden_term: string;
  exclude_if_contains: string[];
  description: string | null;
  is_active: boolean;
  display_order: number;
  updated_at: string;
};

type ActionResult<T> = { data: T } | { error: string };

export async function listMagicianOverridesAction(): Promise<
  ActionResult<MagicianOverrideRow[]>
> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('magician_validator_overrides')
    .select(
      'id,forbidden_term,exclude_if_contains,description,is_active,display_order,updated_at',
    )
    .order('display_order', { ascending: true })
    .order('forbidden_term', { ascending: true });

  if (error) {
    return { error: 'Overrides laden mislukt.' };
  }

  const rows: MagicianOverrideRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    forbidden_term: (r.forbidden_term as string) ?? '',
    exclude_if_contains: Array.isArray(r.exclude_if_contains)
      ? (r.exclude_if_contains as string[])
      : [],
    description: r.description as string | null,
    is_active: Boolean(r.is_active),
    display_order: Number(r.display_order) ?? 0,
    updated_at: (r.updated_at as string) ?? '',
  }));

  return { data: rows };
}

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  forbiddenTerm: z.string().min(1, 'Term verplicht').max(80),
  excludeIfContains: z.array(z.string().min(1)),
  description: z.string().max(200).optional(),
  isActive: z.boolean().optional().default(true),
  displayOrder: z.number().int().min(0).optional().default(0),
});

export async function upsertMagicianOverrideAction(
  input: z.infer<typeof upsertSchema>,
): Promise<ActionResult<MagicianOverrideRow>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join('; ');
    return { error: msg || 'Ongeldige invoer' };
  }

  const supabase = await createClient();
  const term = parsed.data.forbiddenTerm.trim().toLowerCase();

  const row = {
    forbidden_term: term,
    exclude_if_contains: parsed.data.excludeIfContains
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    description: parsed.data.description?.trim() || null,
    is_active: parsed.data.isActive,
    display_order: parsed.data.displayOrder,
  };

  if (parsed.data.id) {
    const { data, error } = await supabase
      .from('magician_validator_overrides')
      .update(row)
      .eq('id', parsed.data.id)
      .select()
      .single();

    if (error) {
      return { error: 'Bijwerken mislukt.' };
    }
    clearMagicianOverridesCache();
    return {
      data: {
        id: data.id,
        forbidden_term: data.forbidden_term,
        exclude_if_contains: Array.isArray(data.exclude_if_contains)
          ? data.exclude_if_contains
          : [],
        description: data.description,
        is_active: data.is_active,
        display_order: data.display_order,
        updated_at: data.updated_at,
      },
    };
  }

  const { data, error } = await supabase
    .from('magician_validator_overrides')
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: `Een override voor "${term}" bestaat al.` };
    }
    return { error: 'Aanmaken mislukt.' };
  }
  clearMagicianOverridesCache();
  return {
    data: {
      id: data.id,
      forbidden_term: data.forbidden_term,
      exclude_if_contains: Array.isArray(data.exclude_if_contains)
        ? data.exclude_if_contains
        : [],
      description: data.description,
      is_active: data.is_active,
      display_order: data.display_order,
      updated_at: data.updated_at,
    },
  };
}

export async function setMagicianOverrideActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult<MagicianOverrideRow>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('magician_validator_overrides')
    .update({ is_active: isActive })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { error: 'Status wijzigen mislukt.' };
  }
  clearMagicianOverridesCache();
  return {
    data: {
      id: data.id,
      forbidden_term: data.forbidden_term,
      exclude_if_contains: Array.isArray(data.exclude_if_contains)
        ? data.exclude_if_contains
        : [],
      description: data.description,
      is_active: data.is_active,
      display_order: data.display_order,
      updated_at: data.updated_at,
    },
  };
}

export async function deleteMagicianOverrideAction(
  id: string,
): Promise<ActionResult<void>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('magician_validator_overrides')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: 'Verwijderen mislukt.' };
  }
  clearMagicianOverridesCache();
  return { data: undefined };
}
