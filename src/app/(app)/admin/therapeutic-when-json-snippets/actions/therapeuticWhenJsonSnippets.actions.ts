'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { z } from 'zod';
import { whenJsonSchema } from '@/src/lib/therapeutic/whenJson.schema';

const SNIPPET_COLUMNS =
  'id,snippet_key,label_nl,description_nl,template_json,is_active,updated_at';

export type WhenJsonSnippetRow = {
  id: string;
  snippet_key: string;
  label_nl: string;
  description_nl: string | null;
  template_json: unknown;
  is_active: boolean;
  updated_at: string;
};

type ActionResult<T> = { data: T } | { error: string };

function parseAndValidateTemplateJson(
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed.length < 2) {
    return { ok: false, error: 'template_json is geen geldige JSON.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'template_json is geen geldige JSON.' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'template_json is geen geldige JSON.' };
  }
  const result = whenJsonSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: 'template_json heeft een ongeldige DSL-structuur.',
    };
  }
  return { ok: true, value: parsed };
}

export async function listWhenJsonSnippetsAction(): Promise<
  ActionResult<WhenJsonSnippetRow[]>
> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('therapeutic_when_json_snippets')
    .select(SNIPPET_COLUMNS)
    .order('snippet_key', { ascending: true });

  if (error) {
    return { error: 'Sjablonen laden mislukt.' };
  }

  const rows: WhenJsonSnippetRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    snippet_key: (r.snippet_key as string) ?? '',
    label_nl: (r.label_nl as string) ?? '',
    description_nl: r.description_nl as string | null,
    template_json: r.template_json,
    is_active: Boolean(r.is_active),
    updated_at: (r.updated_at as string) ?? '',
  }));

  return { data: rows };
}

const createSchema = z.object({
  snippetKey: z.string().min(2, 'snippet_key min. 2 tekens'),
  labelNl: z.string().min(2, 'label_nl min. 2 tekens').max(80),
  descriptionNl: z.string().max(200).optional(),
  templateJson: z.string().min(2, 'template_json verplicht'),
  isActive: z.boolean().optional().default(true),
});

export async function createWhenJsonSnippetAction(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult<WhenJsonSnippetRow>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join('; ');
    return { error: msg || 'Ongeldige invoer' };
  }

  const validated = parseAndValidateTemplateJson(parsed.data.templateJson);
  if (!validated.ok) {
    return { error: validated.error };
  }

  const supabase = await createClient();
  const row = {
    snippet_key: parsed.data.snippetKey.trim(),
    label_nl: parsed.data.labelNl.trim(),
    description_nl: parsed.data.descriptionNl?.trim() ?? null,
    template_json: validated.value,
    is_active: parsed.data.isActive ?? true,
  };

  const { data, error } = await supabase
    .from('therapeutic_when_json_snippets')
    .insert(row)
    .select(SNIPPET_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: 'snippet_key bestaat al.' };
    }
    return { error: 'Sjabloon opslaan mislukt.' };
  }

  return {
    data: {
      id: data.id as string,
      snippet_key: (data.snippet_key as string) ?? '',
      label_nl: (data.label_nl as string) ?? '',
      description_nl: data.description_nl as string | null,
      template_json: data.template_json,
      is_active: Boolean(data.is_active),
      updated_at: (data.updated_at as string) ?? '',
    },
  };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  labelNl: z.string().min(2).max(80),
  descriptionNl: z.string().max(200).optional(),
  templateJson: z.string().min(2),
  isActive: z.boolean(),
});

export async function updateWhenJsonSnippetAction(
  input: z.infer<typeof updateSchema>,
): Promise<ActionResult<WhenJsonSnippetRow>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Ongeldige invoer' };
  }

  const validated = parseAndValidateTemplateJson(parsed.data.templateJson);
  if (!validated.ok) {
    return { error: validated.error };
  }

  const supabase = await createClient();
  const row = {
    label_nl: parsed.data.labelNl.trim(),
    description_nl: parsed.data.descriptionNl?.trim() ?? null,
    template_json: validated.value,
    is_active: parsed.data.isActive,
  };

  const { data, error } = await supabase
    .from('therapeutic_when_json_snippets')
    .update(row)
    .eq('id', parsed.data.id)
    .select(SNIPPET_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: 'snippet_key bestaat al.' };
    }
    return { error: 'Sjabloon bijwerken mislukt.' };
  }

  return {
    data: {
      id: data.id as string,
      snippet_key: (data.snippet_key as string) ?? '',
      label_nl: (data.label_nl as string) ?? '',
      description_nl: data.description_nl as string | null,
      template_json: data.template_json,
      is_active: Boolean(data.is_active),
      updated_at: (data.updated_at as string) ?? '',
    },
  };
}

const toggleSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export async function toggleWhenJsonSnippetActiveAction(
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
    .from('therapeutic_when_json_snippets')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.id)
    .select('id')
    .single();

  if (error) {
    return { error: 'Actief zetten mislukt.' };
  }

  return { data: null };
}
