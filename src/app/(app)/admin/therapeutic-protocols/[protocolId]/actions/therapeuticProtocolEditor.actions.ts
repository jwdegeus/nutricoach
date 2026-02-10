'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { z } from 'zod';
import { whenJsonSchema } from '@/src/lib/therapeutic/whenJson.schema';

const PROTOCOL_COLUMNS =
  'id,protocol_key,name_nl,description_nl,version,is_active,source_refs,updated_at';
const TARGET_COLUMNS =
  'id,period,target_kind,target_key,value_num,unit,value_type,updated_at';
const SUPPLEMENT_COLUMNS =
  'id,supplement_key,label_nl,dosage_text,notes_nl,is_active,updated_at';
const RULE_COLUMNS =
  'id,protocol_id,supplement_key,rule_key,kind,severity,when_json,message_nl,is_active,updated_at';
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

export type ProtocolEditorProtocol = {
  id: string;
  protocol_key: string;
  name_nl: string;
  description_nl: string | null;
  version: string | null;
  is_active: boolean;
  source_refs: unknown;
  updated_at: string;
};

export type ProtocolEditorTarget = {
  id: string;
  period: string;
  target_kind: string;
  target_key: string;
  value_num: number;
  unit: string | null;
  value_type: string;
  updated_at: string;
};

export type ProtocolEditorSupplement = {
  id: string;
  supplement_key: string;
  label_nl: string;
  dosage_text: string | null;
  notes_nl: string | null;
  is_active: boolean;
  updated_at: string;
};

export type WhenJsonStatus = 'none' | 'ok' | 'invalid';

export type TherapeuticSupplementRuleRow = {
  id: string;
  protocol_id: string;
  supplement_key: string;
  rule_key: string;
  kind: string;
  severity: string;
  when_json: unknown;
  whenJsonStatus: WhenJsonStatus;
  message_nl: string;
  is_active: boolean;
  updated_at: string;
};

function getWhenJsonStatus(whenJson: unknown): WhenJsonStatus {
  if (whenJson == null) return 'none';
  let parsed: unknown = whenJson;
  if (typeof whenJson === 'string') {
    try {
      parsed = JSON.parse(whenJson) as unknown;
    } catch {
      return 'invalid';
    }
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'invalid';
  }
  return whenJsonSchema.safeParse(parsed).success ? 'ok' : 'invalid';
}

export type TherapeuticProtocolEditorData = {
  protocol: ProtocolEditorProtocol;
  targets: ProtocolEditorTarget[];
  supplements: ProtocolEditorSupplement[];
  rules: TherapeuticSupplementRuleRow[];
  snippets: WhenJsonSnippetRow[];
};

type ActionResult<T> = { data: T } | { error: string };

export async function getTherapeuticProtocolEditorAction({
  protocolId,
}: {
  protocolId: string;
}): Promise<ActionResult<TherapeuticProtocolEditorData | null>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();

  const { data: protocolRow, error: protocolError } = await supabase
    .from('therapeutic_protocols')
    .select(PROTOCOL_COLUMNS)
    .eq('id', protocolId)
    .single();

  if (protocolError || !protocolRow) {
    return { data: null };
  }

  const [targetsRes, supplementsRes, rulesRes, snippetsRes] = await Promise.all(
    [
      supabase
        .from('therapeutic_protocol_targets')
        .select(TARGET_COLUMNS)
        .eq('protocol_id', protocolId)
        .order('period')
        .order('target_kind')
        .order('target_key'),
      supabase
        .from('therapeutic_protocol_supplements')
        .select(SUPPLEMENT_COLUMNS)
        .eq('protocol_id', protocolId)
        .order('supplement_key'),
      supabase
        .from('therapeutic_protocol_supplement_rules')
        .select(RULE_COLUMNS)
        .eq('protocol_id', protocolId)
        .order('supplement_key')
        .order('rule_key'),
      supabase
        .from('therapeutic_when_json_snippets')
        .select(SNIPPET_COLUMNS)
        .order('snippet_key', { ascending: true }),
    ],
  );

  if (targetsRes.error) return { error: targetsRes.error.message };
  if (supplementsRes.error) return { error: supplementsRes.error.message };
  if (rulesRes.error) return { error: rulesRes.error.message };
  if (snippetsRes.error) return { error: snippetsRes.error.message };

  const protocol: ProtocolEditorProtocol = {
    id: protocolRow.id as string,
    protocol_key: protocolRow.protocol_key as string,
    name_nl: (protocolRow.name_nl as string) ?? '',
    description_nl: protocolRow.description_nl as string | null,
    version: protocolRow.version as string | null,
    is_active: Boolean(protocolRow.is_active),
    source_refs: protocolRow.source_refs,
    updated_at: (protocolRow.updated_at as string) ?? '',
  };

  const targets: ProtocolEditorTarget[] = (targetsRes.data ?? []).map((r) => ({
    id: r.id as string,
    period: r.period as string,
    target_kind: r.target_kind as string,
    target_key: r.target_key as string,
    value_num: Number(r.value_num),
    unit: r.unit as string | null,
    value_type: r.value_type as string,
    updated_at: (r.updated_at as string) ?? '',
  }));

  const supplements: ProtocolEditorSupplement[] = (
    supplementsRes.data ?? []
  ).map((r) => ({
    id: r.id as string,
    supplement_key: r.supplement_key as string,
    label_nl: (r.label_nl as string) ?? '',
    dosage_text: r.dosage_text as string | null,
    notes_nl: r.notes_nl as string | null,
    is_active: Boolean(r.is_active),
    updated_at: (r.updated_at as string) ?? '',
  }));

  const rules: TherapeuticSupplementRuleRow[] = (rulesRes.data ?? []).map(
    (r) => ({
      id: r.id as string,
      protocol_id: r.protocol_id as string,
      supplement_key: r.supplement_key as string,
      rule_key: r.rule_key as string,
      kind: r.kind as string,
      severity: r.severity as string,
      when_json: r.when_json,
      whenJsonStatus: getWhenJsonStatus(r.when_json),
      message_nl: (r.message_nl as string) ?? '',
      is_active: Boolean(r.is_active),
      updated_at: (r.updated_at as string) ?? '',
    }),
  );

  const snippets: WhenJsonSnippetRow[] = (snippetsRes.data ?? []).map((r) => ({
    id: r.id as string,
    snippet_key: (r.snippet_key as string) ?? '',
    label_nl: (r.label_nl as string) ?? '',
    description_nl: r.description_nl as string | null,
    template_json: r.template_json,
    is_active: Boolean(r.is_active),
    updated_at: (r.updated_at as string) ?? '',
  }));

  return {
    data: { protocol, targets, supplements, rules, snippets },
  };
}

const periodSchema = z.enum(['daily', 'weekly']);
const targetKindSchema = z.enum([
  'macro',
  'micro',
  'food_group',
  'variety',
  'frequency',
]);
const valueTypeSchema = z.enum(['absolute', 'adh_percent', 'count']);

const upsertTargetSchema = z
  .object({
    id: z.string().uuid().optional(),
    protocolId: z.string().uuid(),
    period: periodSchema,
    targetKind: targetKindSchema,
    targetKey: z.string().min(1).max(200),
    valueNum: z.number().min(0),
    unit: z.string().max(50).nullable().optional(),
    valueType: valueTypeSchema,
  })
  .refine((d) => d.valueType !== 'adh_percent' || d.unit === '%_adh', {
    message: 'Bij value_type adh_percent moet unit "%_adh" zijn',
    path: ['unit'],
  })
  .refine((d) => d.valueType !== 'count' || d.unit == null || d.unit === '', {
    message: 'Bij value_type count moet unit leeg zijn',
    path: ['unit'],
  });

export async function upsertTherapeuticTargetAction(
  input: z.infer<typeof upsertTargetSchema>,
): Promise<ActionResult<ProtocolEditorTarget>> {
  const admin = await isAdmin();
  if (!admin) return { error: 'Geen toegang: alleen admins' };

  const parsed = upsertTargetSchema.safeParse({
    ...input,
    unit:
      input.valueType === 'adh_percent'
        ? '%_adh'
        : input.valueType === 'count'
          ? null
          : (input.unit ?? null),
  });
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join('; ');
    return { error: msg || 'Ongeldige invoer' };
  }

  const p = parsed.data;
  const supabase = await createClient();
  const row = {
    protocol_id: p.protocolId,
    period: p.period,
    target_kind: p.targetKind,
    target_key: p.targetKey.trim(),
    value_num: p.valueNum,
    unit: p.valueType === 'count' ? null : (p.unit ?? null),
    value_type: p.valueType,
  };

  if (p.id) {
    const { data, error } = await supabase
      .from('therapeutic_protocol_targets')
      .update(row)
      .eq('id', p.id)
      .select(TARGET_COLUMNS)
      .single();
    if (error) return { error: error.message };
    return {
      data: {
        id: data.id as string,
        period: data.period as string,
        target_kind: data.target_kind as string,
        target_key: data.target_key as string,
        value_num: Number(data.value_num),
        unit: data.unit as string | null,
        value_type: data.value_type as string,
        updated_at: (data.updated_at as string) ?? '',
      },
    };
  }

  const { data, error } = await supabase
    .from('therapeutic_protocol_targets')
    .insert(row)
    .select(TARGET_COLUMNS)
    .single();
  if (error) return { error: error.message };
  return {
    data: {
      id: data.id as string,
      period: data.period as string,
      target_kind: data.target_kind as string,
      target_key: data.target_key as string,
      value_num: Number(data.value_num),
      unit: data.unit as string | null,
      value_type: data.value_type as string,
      updated_at: (data.updated_at as string) ?? '',
    },
  };
}

export async function deleteTherapeuticTargetAction({
  id,
}: {
  id: string;
}): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) return { error: 'Geen toegang: alleen admins' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('therapeutic_protocol_targets')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  return { data: null };
}

const upsertSupplementSchema = z.object({
  id: z.string().uuid().optional(),
  protocolId: z.string().uuid(),
  supplementKey: z.string().min(1).max(200),
  labelNl: z.string().min(1).max(500),
  dosageText: z.string().max(500).nullable().optional(),
  notesNl: z.string().max(1000).nullable().optional(),
  isActive: z.boolean(),
});

export async function upsertTherapeuticSupplementAction(
  input: z.infer<typeof upsertSupplementSchema>,
): Promise<ActionResult<ProtocolEditorSupplement>> {
  const admin = await isAdmin();
  if (!admin) return { error: 'Geen toegang: alleen admins' };

  const parsed = upsertSupplementSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Ongeldige invoer' };
  }

  const p = parsed.data;
  const supabase = await createClient();
  const row = {
    protocol_id: p.protocolId,
    supplement_key: p.supplementKey.trim(),
    label_nl: p.labelNl.trim(),
    dosage_text: p.dosageText?.trim() ?? null,
    notes_nl: p.notesNl?.trim() ?? null,
    is_active: p.isActive,
  };

  if (p.id) {
    const { data, error } = await supabase
      .from('therapeutic_protocol_supplements')
      .update(row)
      .eq('id', p.id)
      .select(SUPPLEMENT_COLUMNS)
      .single();
    if (error) return { error: error.message };
    return {
      data: {
        id: data.id as string,
        supplement_key: data.supplement_key as string,
        label_nl: (data.label_nl as string) ?? '',
        dosage_text: data.dosage_text as string | null,
        notes_nl: data.notes_nl as string | null,
        is_active: Boolean(data.is_active),
        updated_at: (data.updated_at as string) ?? '',
      },
    };
  }

  const { data, error } = await supabase
    .from('therapeutic_protocol_supplements')
    .insert(row)
    .select(SUPPLEMENT_COLUMNS)
    .single();
  if (error) return { error: error.message };
  return {
    data: {
      id: data.id as string,
      supplement_key: data.supplement_key as string,
      label_nl: (data.label_nl as string) ?? '',
      dosage_text: data.dosage_text as string | null,
      notes_nl: data.notes_nl as string | null,
      is_active: Boolean(data.is_active),
      updated_at: (data.updated_at as string) ?? '',
    },
  };
}

const toggleSupplementSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export async function toggleTherapeuticSupplementActiveAction(
  input: z.infer<typeof toggleSupplementSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) return { error: 'Geen toegang: alleen admins' };

  const parsed = toggleSupplementSchema.safeParse(input);
  if (!parsed.success) return { error: 'Ongeldige invoer' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('therapeutic_protocol_supplements')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.id)
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { data: null };
}

const deleteSupplementSchema = z.object({
  id: z.string().uuid(),
});

export async function deleteTherapeuticSupplementAction(
  input: z.infer<typeof deleteSupplementSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) return { error: 'Geen toegang: alleen admins' };

  const parsed = deleteSupplementSchema.safeParse(input);
  if (!parsed.success) return { error: 'Ongeldige invoer' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('therapeutic_protocol_supplements')
    .delete()
    .eq('id', parsed.data.id);

  if (error) return { error: error.message };
  return { data: null };
}

const cloneTherapeuticProtocolSchema = z.object({
  sourceProtocolId: z.string().uuid(),
  protocolKey: z.string().min(2),
  nameNl: z.string().min(2),
  descriptionNl: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function cloneTherapeuticProtocolAction(
  input: z.infer<typeof cloneTherapeuticProtocolSchema>,
): Promise<ActionResult<{ newProtocolId: string }>> {
  const admin = await isAdmin();
  if (!admin) return { error: 'Geen toegang: alleen admins' };

  const parsed = cloneTherapeuticProtocolSchema.safeParse({
    ...input,
    isActive: input.isActive ?? false,
  });
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join('; ');
    return { error: msg || 'Ongeldige invoer' };
  }

  const supabase = await createClient();
  const {
    sourceProtocolId,
    protocolKey,
    nameNl,
    descriptionNl,
    version,
    isActive,
  } = parsed.data;

  const { data: sourceProtocol, error: protocolFetchError } = await supabase
    .from('therapeutic_protocols')
    .select(
      'id,protocol_key,name_nl,description_nl,version,is_active,source_refs',
    )
    .eq('id', sourceProtocolId)
    .single();

  if (protocolFetchError || !sourceProtocol) {
    return { error: 'Kopiëren mislukt. Probeer het opnieuw.' };
  }

  const { data: sourceTargets, error: targetsFetchError } = await supabase
    .from('therapeutic_protocol_targets')
    .select('period,target_kind,target_key,value_num,unit,value_type')
    .eq('protocol_id', sourceProtocolId);

  if (targetsFetchError) {
    return { error: 'Kopiëren mislukt. Probeer het opnieuw.' };
  }

  const { data: sourceSupplements, error: supplementsFetchError } =
    await supabase
      .from('therapeutic_protocol_supplements')
      .select('supplement_key,label_nl,dosage_text,notes_nl,is_active')
      .eq('protocol_id', sourceProtocolId);

  if (supplementsFetchError) {
    return { error: 'Kopiëren mislukt. Probeer het opnieuw.' };
  }

  const { data: newProtocolRow, error: insertProtocolError } = await supabase
    .from('therapeutic_protocols')
    .insert({
      protocol_key: protocolKey.trim(),
      name_nl: nameNl.trim(),
      description_nl: descriptionNl ?? sourceProtocol.description_nl ?? null,
      version: version ?? sourceProtocol.version ?? null,
      is_active: isActive ?? false,
      source_refs: sourceProtocol.source_refs ?? null,
    })
    .select('id')
    .single();

  if (insertProtocolError) {
    if (insertProtocolError.code === '23505') {
      return { error: 'Protocol key bestaat al.' };
    }
    return { error: 'Kopiëren mislukt. Probeer het opnieuw.' };
  }

  const newProtocolId = newProtocolRow?.id as string;
  if (!newProtocolId) {
    return { error: 'Kopiëren mislukt. Probeer het opnieuw.' };
  }

  const targetRows = (sourceTargets ?? []).map((t) => ({
    protocol_id: newProtocolId,
    period: t.period,
    target_kind: t.target_kind,
    target_key: t.target_key,
    value_num: t.value_num,
    unit: t.unit ?? null,
    value_type: t.value_type,
  }));

  if (targetRows.length > 0) {
    const { error: insertTargetsError } = await supabase
      .from('therapeutic_protocol_targets')
      .insert(targetRows);
    if (insertTargetsError) {
      return { error: 'Kopiëren mislukt. Probeer het opnieuw.' };
    }
  }

  const supplementRows = (sourceSupplements ?? []).map((s) => ({
    protocol_id: newProtocolId,
    supplement_key: s.supplement_key,
    label_nl: s.label_nl ?? '',
    dosage_text: s.dosage_text ?? null,
    notes_nl: s.notes_nl ?? null,
    is_active: s.is_active ?? true,
  }));

  if (supplementRows.length > 0) {
    const { error: insertSupplementsError } = await supabase
      .from('therapeutic_protocol_supplements')
      .insert(supplementRows);
    if (insertSupplementsError) {
      return { error: 'Kopiëren mislukt. Probeer het opnieuw.' };
    }
  }

  return { data: { newProtocolId } };
}

const sourceRefItemSchema = z.object({
  title: z.string().min(1).max(300),
  url: z.string().max(2000).optional(),
});

const updateProtocolSourceRefsSchema = z.object({
  protocolId: z.string().uuid(),
  sourceRefs: z.array(sourceRefItemSchema).max(50),
});

export type SourceRefItem = { title: string; url?: string };

export async function updateProtocolSourceRefsAction(
  input: z.infer<typeof updateProtocolSourceRefsSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) return { error: 'Geen toegang: alleen admins' };

  const parsed = updateProtocolSourceRefsSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join('; ');
    return { error: msg || 'Ongeldige invoer' };
  }

  const payload = parsed.data.sourceRefs.map((r) => ({
    title: r.title.trim(),
    url: r.url?.trim() ? r.url.trim() : undefined,
  }));

  const supabase = await createClient();
  const { error } = await supabase
    .from('therapeutic_protocols')
    .update({ source_refs: payload })
    .eq('id', parsed.data.protocolId);

  if (error) return { error: error.message };
  return { data: null };
}

const ruleKindSchema = z.enum(['warning', 'condition', 'contraindication']);
const ruleSeveritySchema = z.enum(['info', 'warn', 'error']);

const upsertSupplementRuleSchema = z.object({
  id: z.string().uuid().optional(),
  protocolId: z.string().uuid(),
  supplementKey: z.string().min(2),
  ruleKey: z.string().min(2),
  kind: ruleKindSchema,
  severity: ruleSeveritySchema,
  whenJson: z.string().optional(),
  messageNl: z.string().min(5).max(400),
  isActive: z.boolean(),
});

function parseWhenJson(raw: string | undefined): unknown | null {
  if (raw == null || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

export async function upsertTherapeuticSupplementRuleAction(
  input: z.infer<typeof upsertSupplementRuleSchema>,
): Promise<ActionResult<TherapeuticSupplementRuleRow>> {
  const admin = await isAdmin();
  if (!admin) return { error: 'Geen toegang: alleen admins' };

  const parsed = upsertSupplementRuleSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join('; ');
    return { error: msg || 'Ongeldige invoer' };
  }

  const whenParsed = parseWhenJson(parsed.data.whenJson);
  if (whenParsed === undefined) {
    return { error: 'when_json is geen geldige JSON.' };
  }

  const supabase = await createClient();
  const row = {
    protocol_id: parsed.data.protocolId,
    supplement_key: parsed.data.supplementKey.trim(),
    rule_key: parsed.data.ruleKey.trim(),
    kind: parsed.data.kind,
    severity: parsed.data.severity,
    when_json: whenParsed,
    message_nl: parsed.data.messageNl.trim(),
    is_active: parsed.data.isActive,
  };

  if (parsed.data.id) {
    const { data, error } = await supabase
      .from('therapeutic_protocol_supplement_rules')
      .update(row)
      .eq('id', parsed.data.id)
      .select(RULE_COLUMNS)
      .single();
    if (error) {
      if (error.code === '23505') {
        return {
          error: 'Rule key bestaat al voor dit supplement binnen dit protocol.',
        };
      }
      return { error: error.message };
    }
    return {
      data: mapRuleRow(data),
    };
  }

  const { data, error } = await supabase
    .from('therapeutic_protocol_supplement_rules')
    .insert(row)
    .select(RULE_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') {
      return {
        error: 'Rule key bestaat al voor dit supplement binnen dit protocol.',
      };
    }
    return { error: error.message };
  }
  return {
    data: mapRuleRow(data),
  };
}

function mapRuleRow(r: Record<string, unknown>): TherapeuticSupplementRuleRow {
  return {
    id: r.id as string,
    protocol_id: r.protocol_id as string,
    supplement_key: r.supplement_key as string,
    rule_key: r.rule_key as string,
    kind: r.kind as string,
    severity: r.severity as string,
    when_json: r.when_json,
    whenJsonStatus: getWhenJsonStatus(r.when_json),
    message_nl: (r.message_nl as string) ?? '',
    is_active: Boolean(r.is_active),
    updated_at: (r.updated_at as string) ?? '',
  };
}

const deleteSupplementRuleSchema = z.object({
  id: z.string().uuid(),
});

export async function deleteTherapeuticSupplementRuleAction(
  input: z.infer<typeof deleteSupplementRuleSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) return { error: 'Geen toegang: alleen admins' };

  const parsed = deleteSupplementRuleSchema.safeParse(input);
  if (!parsed.success) return { error: 'Ongeldige invoer' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('therapeutic_protocol_supplement_rules')
    .delete()
    .eq('id', parsed.data.id);

  if (error) return { error: error.message };
  return { data: null };
}

const toggleSupplementRuleSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export async function toggleTherapeuticSupplementRuleActiveAction(
  input: z.infer<typeof toggleSupplementRuleSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) return { error: 'Geen toegang: alleen admins' };

  const parsed = toggleSupplementRuleSchema.safeParse(input);
  if (!parsed.success) return { error: 'Ongeldige invoer' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('therapeutic_protocol_supplement_rules')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.id)
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { data: null };
}
