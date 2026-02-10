'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { z } from 'zod';

const ADH_REF_COLUMNS =
  'id, key, sex, age_min_years, age_max_years, unit, value_num, is_active, updated_at';

export type AdhRefRow = {
  id: string;
  key: string;
  sex: string | null;
  age_min_years: number | null;
  age_max_years: number | null;
  unit: string;
  value_num: number;
  is_active: boolean;
  updated_at: string;
};

type ActionResult<T> = { data: T } | { error: string };

/**
 * List ADH reference values (admin only). Explicit columns; order key asc, sex nulls first, age_min nulls first.
 */
export async function listAdhReferenceValuesAction(): Promise<
  ActionResult<AdhRefRow[]>
> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('therapeutic_adh_reference_values')
    .select(ADH_REF_COLUMNS)
    .order('key', { ascending: true })
    .order('sex', { ascending: true, nullsFirst: true })
    .order('age_min_years', { ascending: true, nullsFirst: true });

  if (error) {
    return { error: 'Referentiewaarden laden mislukt.' };
  }

  const rows: AdhRefRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    key: (r.key as string) ?? '',
    sex: r.sex as string | null,
    age_min_years: r.age_min_years as number | null,
    age_max_years: r.age_max_years as number | null,
    unit: (r.unit as string) ?? '',
    value_num: Number(r.value_num),
    is_active: Boolean(r.is_active),
    updated_at: (r.updated_at as string) ?? '',
  }));

  return { data: rows };
}

const toggleSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

/**
 * Toggle is_active for an ADH reference row (admin only).
 */
export async function toggleAdhReferenceActiveAction(
  input: z.infer<typeof toggleSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Ongeldige invoer' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('therapeutic_adh_reference_values')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.id)
    .select('id')
    .single();

  if (error) {
    return { error: 'Actief zetten mislukt.' };
  }

  return { data: null };
}

const sexEnum = z.enum(['female', 'male', 'other', 'unknown']);

const createSchema = z
  .object({
    key: z.string().min(2, 'Key min. 2 tekens'),
    sex: sexEnum.nullable(),
    ageMinYears: z.number().int().min(0).nullable(),
    ageMaxYears: z.number().int().min(0).nullable(),
    unit: z.string().min(1, 'Unit verplicht'),
    valueNum: z.number().min(0, 'Waarde moet ≥ 0 zijn'),
    isActive: z.boolean().default(true),
  })
  .refine(
    (v) => {
      if (v.ageMinYears != null && v.ageMaxYears != null) {
        return v.ageMinYears <= v.ageMaxYears;
      }
      return true;
    },
    { message: 'Min. leeftijd mag niet groter zijn dan max. leeftijd' },
  );

/**
 * Create ADH reference value (admin only). Handles unique conflict (23505) with NL message.
 */
export async function createAdhReferenceValueAction(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult<AdhRefRow>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join(' ');
    return { error: msg || 'Ongeldige invoer' };
  }

  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('therapeutic_adh_reference_values')
    .insert({
      key: p.key,
      sex: p.sex,
      age_min_years: p.ageMinYears,
      age_max_years: p.ageMaxYears,
      unit: p.unit,
      value_num: p.valueNum,
      is_active: p.isActive,
    })
    .select(ADH_REF_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: 'Combinatie key/sex/leeftijd bestaat al.' };
    }
    return { error: 'Aanmaken mislukt.' };
  }

  const row: AdhRefRow = {
    id: data.id as string,
    key: (data.key as string) ?? '',
    sex: data.sex as string | null,
    age_min_years: data.age_min_years as number | null,
    age_max_years: data.age_max_years as number | null,
    unit: (data.unit as string) ?? '',
    value_num: Number(data.value_num),
    is_active: Boolean(data.is_active),
    updated_at: (data.updated_at as string) ?? '',
  };

  return { data: row };
}

const updateSchema = z
  .object({
    id: z.string().uuid(),
    key: z.string().min(2, 'Key min. 2 tekens'),
    sex: sexEnum.nullable(),
    ageMinYears: z.number().int().min(0).nullable(),
    ageMaxYears: z.number().int().min(0).nullable(),
    unit: z.string().min(1, 'Unit verplicht'),
    valueNum: z.number().min(0, 'Waarde moet ≥ 0 zijn'),
    isActive: z.boolean(),
  })
  .refine(
    (v) => {
      if (v.ageMinYears != null && v.ageMaxYears != null) {
        return v.ageMinYears <= v.ageMaxYears;
      }
      return true;
    },
    { message: 'Min. leeftijd mag niet groter zijn dan max. leeftijd' },
  );

/**
 * Update ADH reference value (admin only). Handles unique conflict (23505) with NL message.
 */
export async function updateAdhReferenceValueAction(
  input: z.infer<typeof updateSchema>,
): Promise<ActionResult<AdhRefRow>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join(' ');
    return { error: msg || 'Ongeldige invoer' };
  }

  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('therapeutic_adh_reference_values')
    .update({
      key: p.key,
      sex: p.sex,
      age_min_years: p.ageMinYears,
      age_max_years: p.ageMaxYears,
      unit: p.unit,
      value_num: p.valueNum,
      is_active: p.isActive,
    })
    .eq('id', p.id)
    .select(ADH_REF_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: 'Combinatie key/sex/leeftijd bestaat al.' };
    }
    return { error: 'Bijwerken mislukt.' };
  }

  const row: AdhRefRow = {
    id: data.id as string,
    key: (data.key as string) ?? '',
    sex: data.sex as string | null,
    age_min_years: data.age_min_years as number | null,
    age_max_years: data.age_max_years as number | null,
    unit: (data.unit as string) ?? '',
    value_num: Number(data.value_num),
    is_active: Boolean(data.is_active),
    updated_at: (data.updated_at as string) ?? '',
  };

  return { data: row };
}
