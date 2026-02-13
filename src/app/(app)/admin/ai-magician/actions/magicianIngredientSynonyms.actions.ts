'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { z } from 'zod';
import { clearMagicianIngredientSynonymsCache } from '@/src/lib/diet-validation/magician-ingredient-synonyms.loader';

export type MagicianIngredientSynonymRow = {
  id: string;
  forbidden_term: string;
  synonym: string;
  is_active: boolean;
  display_order: number;
  updated_at: string;
};

type ActionResult<T> = { data: T } | { error: string };

export async function listMagicianIngredientSynonymsAction(): Promise<
  ActionResult<MagicianIngredientSynonymRow[]>
> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('magician_ingredient_synonyms')
    .select('id,forbidden_term,synonym,is_active,display_order,updated_at')
    .order('display_order', { ascending: true })
    .order('forbidden_term', { ascending: true })
    .order('synonym', { ascending: true });

  if (error) {
    return { error: 'Synoniemen laden mislukt.' };
  }

  const rows: MagicianIngredientSynonymRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    forbidden_term: (r.forbidden_term as string) ?? '',
    synonym: (r.synonym as string) ?? '',
    is_active: Boolean(r.is_active),
    display_order: Number(r.display_order) ?? 0,
    updated_at: (r.updated_at as string) ?? '',
  }));

  return { data: rows };
}

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  forbiddenTerm: z.string().min(1, 'Term verplicht').max(80),
  synonym: z.string().min(1, 'Synoniem verplicht').max(120),
  isActive: z.boolean().optional().default(true),
  displayOrder: z.number().int().min(0).optional().default(0),
});

export async function upsertMagicianIngredientSynonymAction(
  input: z.infer<typeof upsertSchema>,
): Promise<ActionResult<MagicianIngredientSynonymRow>> {
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
  const synonym = parsed.data.synonym.trim().toLowerCase();

  const row = {
    forbidden_term: term,
    synonym,
    is_active: parsed.data.isActive,
    display_order: parsed.data.displayOrder,
  };

  if (parsed.data.id) {
    const { data, error } = await supabase
      .from('magician_ingredient_synonyms')
      .update(row)
      .eq('id', parsed.data.id)
      .select()
      .single();

    if (error) {
      return { error: 'Bijwerken mislukt.' };
    }
    clearMagicianIngredientSynonymsCache();
    return {
      data: {
        id: data.id,
        forbidden_term: data.forbidden_term,
        synonym: data.synonym,
        is_active: data.is_active,
        display_order: data.display_order,
        updated_at: data.updated_at,
      },
    };
  }

  const { data, error } = await supabase
    .from('magician_ingredient_synonyms')
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: `Synoniem "${synonym}" voor "${term}" bestaat al.` };
    }
    return { error: 'Aanmaken mislukt.' };
  }
  clearMagicianIngredientSynonymsCache();
  return {
    data: {
      id: data.id,
      forbidden_term: data.forbidden_term,
      synonym: data.synonym,
      is_active: data.is_active,
      display_order: data.display_order,
      updated_at: data.updated_at,
    },
  };
}

export async function setMagicianIngredientSynonymActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult<MagicianIngredientSynonymRow>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('magician_ingredient_synonyms')
    .update({ is_active: isActive })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { error: 'Status wijzigen mislukt.' };
  }
  clearMagicianIngredientSynonymsCache();
  return {
    data: {
      id: data.id,
      forbidden_term: data.forbidden_term,
      synonym: data.synonym,
      is_active: data.is_active,
      display_order: data.display_order,
      updated_at: data.updated_at,
    },
  };
}

export async function deleteMagicianIngredientSynonymAction(
  id: string,
): Promise<ActionResult<void>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('magician_ingredient_synonyms')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: 'Verwijderen mislukt.' };
  }
  clearMagicianIngredientSynonymsCache();
  return { data: undefined };
}
