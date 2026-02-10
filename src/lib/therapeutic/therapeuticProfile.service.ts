/**
 * Therapeutic Profile Service
 *
 * Centralised queries and mapping for user health profiles and therapeutic protocols.
 * Accepts Supabase client and userId; RLS is applied via the client (user context).
 * No SELECT *; explicit columns only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '@/src/lib/errors/app-error';
import type { TherapeuticProtocolRef } from '@/src/lib/diets/diet.types';
import { whenJsonSchema } from '@/src/lib/therapeutic/whenJson.schema';
import type {
  Condition,
  WhenJson,
} from '@/src/lib/therapeutic/whenJson.schema';

// ---------------------------------------------------------------------------
// Row types (minimal, snake_case as from DB)
// ---------------------------------------------------------------------------

export type HealthProfileRow = {
  user_id: string;
  birth_date: string | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
};

export type ProtocolListRow = {
  id: string;
  protocol_key: string;
  name_nl: string;
  version: string | null;
};

export type ProtocolDetailRow = {
  id: string;
  protocol_key: string;
  name_nl: string;
  version: string | null;
  source_refs: unknown;
};

export type UserTherapeuticProfileRow = {
  id: string;
  user_id: string;
  protocol_id: string;
  is_active: boolean;
  overrides: unknown;
};

export type ProtocolTargetRow = {
  period: string;
  target_kind: string;
  target_key: string;
  value_num: number;
  unit: string | null;
  value_type: string;
};

export type ProtocolSupplementRow = {
  supplement_key: string;
  label_nl: string;
  dosage_text: string | null;
  notes_nl: string | null;
};

export type ProtocolSupplementRuleRow = {
  id: string;
  protocol_id: string;
  supplement_key: string;
  rule_key: string;
  kind: string;
  severity: string;
  when_json: unknown;
  message_nl: string;
  is_active: boolean;
  updated_at: string;
};

/** Context for evaluating when_json (user health + overrides + diet/protocol). */
export type UserRuleContext = {
  sex?: 'female' | 'male' | 'other' | 'unknown';
  ageYears?: number;
  heightCm?: number;
  weightKg?: number;
  overrides?: Record<string, unknown>;
  dietKey?: string;
  protocolKey?: string;
  protocolVersion?: number;
};

/** One condition that was true during evaluation; used for "why" explanation. */
export type MatchedCondition = {
  type: 'field' | 'override';
  field?:
    | 'sex'
    | 'ageYears'
    | 'heightCm'
    | 'weightKg'
    | 'dietKey'
    | 'protocolKey'
    | 'protocolVersion';
  op: 'eq' | 'neq' | 'gte' | 'lte' | 'in' | 'exists';
  key?: string;
  expected?: string | number | boolean | (string | number | boolean)[];
  actual?: string | number | boolean | null;
};

/** Result of evaluating when_json for one rule. */
export type RuleEvaluationMeta = {
  applicable: boolean;
  invalid: boolean;
  matched?: MatchedCondition[];
};

/**
 * Compute whole years from birth date (UTC). Returns undefined if invalid or missing.
 */
export function ageYearsFromBirthDate(
  birthDate: string | null,
): number | undefined {
  if (
    birthDate == null ||
    typeof birthDate !== 'string' ||
    birthDate.trim() === ''
  )
    return undefined;
  const d = new Date(birthDate.trim());
  if (Number.isNaN(d.getTime())) return undefined;
  const now = new Date();
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) years -= 1;
  return years >= 0 ? years : undefined;
}

// ---------------------------------------------------------------------------
// View models (camelCase, for API)
// ---------------------------------------------------------------------------

export type HealthProfileViewModel = {
  birthDate?: string;
  sex?: 'female' | 'male' | 'other' | 'unknown';
  heightCm?: number;
  weightKg?: number;
};

export type ProtocolListItem = {
  id: string;
  protocolKey: string;
  nameNl: string;
  version?: string;
};

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const SEX_VALUES = ['female', 'male', 'other', 'unknown'] as const;

export function mapHealthRow(
  row: HealthProfileRow | null,
): HealthProfileViewModel | null {
  if (!row) return null;
  const sex =
    row.sex && SEX_VALUES.includes(row.sex as (typeof SEX_VALUES)[number])
      ? (row.sex as (typeof SEX_VALUES)[number])
      : undefined;
  return {
    ...(row.birth_date != null && { birthDate: row.birth_date }),
    ...(sex != null && { sex }),
    ...(row.height_cm != null && { heightCm: row.height_cm }),
    ...(row.weight_kg != null && { weightKg: Number(row.weight_kg) }),
  };
}

export function mapProtocolRowToRef(
  row: ProtocolDetailRow,
): TherapeuticProtocolRef {
  const sourceRefs = parseSourceRefs(row.source_refs);
  return {
    protocolKey: row.protocol_key,
    ...(row.version != null && row.version !== '' && { version: row.version }),
    labelNl: row.name_nl,
    ...(sourceRefs.length > 0 && { sourceRefs: sourceRefs }),
  };
}

function parseSourceRefs(
  value: unknown,
): Array<{ title: string; url?: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        item != null && typeof item === 'object',
    )
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title : '',
      ...(typeof item.url === 'string' && { url: item.url }),
    }))
    .filter((r) => r.title !== '');
}

export function mapProtocolListRow(row: ProtocolListRow): ProtocolListItem {
  return {
    id: row.id,
    protocolKey: row.protocol_key,
    nameNl: row.name_nl,
    ...(row.version != null && row.version !== '' && { version: row.version }),
  };
}

// ---------------------------------------------------------------------------
// Column sets (no SELECT *)
// ---------------------------------------------------------------------------

const HEALTH_COLUMNS = 'user_id, birth_date, sex, height_cm, weight_kg';
const PROTOCOL_LIST_COLUMNS = 'id, protocol_key, name_nl, version';
const PROTOCOL_DETAIL_COLUMNS =
  'id, protocol_key, name_nl, version, source_refs';
const USER_PROFILE_COLUMNS = 'id, user_id, protocol_id, is_active, overrides';
/** Columns for overrides-only read/update (no SELECT *). */
const USER_PROFILE_OVERRIDES_COLUMNS = 'id, overrides';
const TARGET_COLUMNS =
  'period, target_kind, target_key, value_num, unit, value_type';
const SUPPLEMENT_COLUMNS = 'supplement_key, label_nl, dosage_text, notes_nl';
const RULE_COLUMNS =
  'id, protocol_id, supplement_key, rule_key, kind, severity, when_json, message_nl, is_active, updated_at';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getHealthProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<HealthProfileRow | null> {
  const { data, error } = await supabase
    .from('user_health_profiles')
    .select(HEALTH_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as HealthProfileRow | null;
}

export async function upsertHealthProfile(
  supabase: SupabaseClient,
  userId: string,
  input: {
    birthDate?: string;
    sex?: 'female' | 'male' | 'other' | 'unknown';
    heightCm?: number;
    weightKg?: number;
  },
): Promise<HealthProfileRow> {
  const row: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  if (input.birthDate !== undefined) row.birth_date = input.birthDate || null;
  if (input.sex !== undefined) row.sex = input.sex ?? null;
  if (input.heightCm !== undefined) row.height_cm = input.heightCm ?? null;
  if (input.weightKg !== undefined) row.weight_kg = input.weightKg ?? null;

  const { data, error } = await supabase
    .from('user_health_profiles')
    .upsert(row, { onConflict: 'user_id' })
    .select(HEALTH_COLUMNS)
    .single();

  if (error) throw error;
  return data as HealthProfileRow;
}

export async function listActiveProtocols(
  supabase: SupabaseClient,
): Promise<ProtocolListRow[]> {
  const { data, error } = await supabase
    .from('therapeutic_protocols')
    .select(PROTOCOL_LIST_COLUMNS)
    .eq('is_active', true)
    .order('name_nl', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ProtocolListRow[];
}

export async function getActiveTherapeuticProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  profile: UserTherapeuticProfileRow;
  protocol: ProtocolDetailRow;
} | null> {
  const { data: profileData, error: profileError } = await supabase
    .from('user_therapeutic_profiles')
    .select(USER_PROFILE_COLUMNS)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (profileError) throw profileError;
  const profile = profileData as UserTherapeuticProfileRow | null;
  if (!profile) return null;

  const { data: protocolData, error: protocolError } = await supabase
    .from('therapeutic_protocols')
    .select(PROTOCOL_DETAIL_COLUMNS)
    .eq('id', profile.protocol_id)
    .single();

  if (protocolError) throw protocolError;
  const protocol = protocolData as ProtocolDetailRow;
  return { profile, protocol };
}

/**
 * Set active therapeutic protocol for the current user (auth.uid() in RPC).
 * Uses atomic RPC; errors mapped to AppError (no generic DB_ERROR).
 */
export async function setActiveTherapeuticProtocol(
  supabase: SupabaseClient,
  _userId: string,
  protocolId: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_active_therapeutic_protocol', {
    p_protocol_id: protocolId,
  });

  if (!error) return;

  const msg = error.message ?? '';
  const code = (error as { code?: string }).code;

  if (msg.toLowerCase().includes('unauthorized')) {
    throw new AppError('UNAUTHORIZED', 'Je moet ingelogd zijn.');
  }
  if (code === '23503' || msg.toLowerCase().includes('foreign key')) {
    throw new AppError('VALIDATION_ERROR', 'Dit protocol bestaat niet.');
  }
  throw new AppError(
    'INTERNAL',
    'Er ging iets mis bij het opslaan van je therapeutisch profiel.',
  );
}

export async function getProtocolTargets(
  supabase: SupabaseClient,
  protocolId: string,
): Promise<ProtocolTargetRow[]> {
  const { data, error } = await supabase
    .from('therapeutic_protocol_targets')
    .select(TARGET_COLUMNS)
    .eq('protocol_id', protocolId);

  if (error) throw error;
  return (data ?? []) as ProtocolTargetRow[];
}

export async function getProtocolSupplements(
  supabase: SupabaseClient,
  protocolId: string,
): Promise<ProtocolSupplementRow[]> {
  const { data, error } = await supabase
    .from('therapeutic_protocol_supplements')
    .select(SUPPLEMENT_COLUMNS)
    .eq('protocol_id', protocolId)
    .eq('is_active', true);

  if (error) throw error;
  return (data ?? []) as ProtocolSupplementRow[];
}

/**
 * Get active supplement rules for a protocol (user-context; RLS applies).
 * Returns only is_active = true rules. Returns [] when no rows or on empty result.
 */
export async function getProtocolSupplementRules(
  supabase: SupabaseClient,
  protocolId: string,
): Promise<ProtocolSupplementRuleRow[]> {
  const { data, error } = await supabase
    .from('therapeutic_protocol_supplement_rules')
    .select(RULE_COLUMNS)
    .eq('protocol_id', protocolId)
    .eq('is_active', true)
    .order('supplement_key', { ascending: true })
    .order('rule_key', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ProtocolSupplementRuleRow[];
}

// ---------------------------------------------------------------------------
// Supplement rules evaluator (when_json DSL)
// ---------------------------------------------------------------------------

type FieldConditionField =
  | 'sex'
  | 'ageYears'
  | 'heightCm'
  | 'weightKg'
  | 'dietKey'
  | 'protocolKey'
  | 'protocolVersion';

function getContextValue(
  ctx: UserRuleContext,
  field: FieldConditionField,
): string | number | undefined {
  const v = ctx[field];
  if (v === undefined) return undefined;
  if (field === 'sex' || field === 'dietKey' || field === 'protocolKey')
    return typeof v === 'string' ? v : undefined;
  if (
    field === 'ageYears' ||
    field === 'heightCm' ||
    field === 'weightKg' ||
    field === 'protocolVersion'
  )
    return typeof v === 'number' ? v : undefined;
  return undefined;
}

function comparePrimitive(
  op: string,
  ctxVal: string | number | undefined,
  condValue: string | number | string[] | number[],
): { result: boolean; invalid?: boolean } {
  if (op === 'in') {
    const arr = Array.isArray(condValue) ? condValue : [condValue];
    if (ctxVal === undefined) return { result: false };
    const result = arr.some(
      (x) =>
        x === ctxVal ||
        (typeof x === 'number' &&
          typeof ctxVal === 'number' &&
          Number(x) === Number(ctxVal)),
    );
    return { result };
  }
  const cv = Array.isArray(condValue) ? condValue[0] : condValue;
  const left = ctxVal;
  const right = cv;
  if (left === undefined) return { result: false };
  if (op === 'gte' || op === 'lte') {
    const leftNum = typeof left === 'number';
    const rightNum = typeof right === 'number';
    if (!leftNum || !rightNum) return { result: false, invalid: true };
    return {
      result: op === 'gte' ? left >= right : left <= right,
    };
  }
  switch (op) {
    case 'eq':
      return {
        result:
          left === right ||
          (typeof left === 'number' &&
            typeof right === 'number' &&
            Number(left) === Number(right)),
      };
    case 'neq':
      return {
        result:
          left !== right &&
          (typeof left !== 'number' ||
            typeof right !== 'number' ||
            Number(left) !== Number(right)),
      };
    default:
      return { result: false };
  }
}

const MAX_MATCHED_CONDITIONS_PER_RULE = 6;

type EvalConditionResult = {
  result: boolean;
  invalid?: boolean;
  matched?: MatchedCondition;
};

function toPrimitiveOrNull(v: unknown): string | number | boolean | null {
  if (v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    return v;
  return null;
}

function buildMatchedOverride(
  cond: { key: string; op: string; value?: unknown },
  ctx: UserRuleContext,
  result: boolean,
): MatchedCondition | undefined {
  if (!result) return undefined;
  const ov = ctx.overrides ?? {};
  const key = cond.key;
  const val = ov[key];
  if (cond.op === 'exists') {
    return {
      type: 'override',
      op: 'exists',
      key,
      expected: true,
      actual: key in ov && val != null,
    };
  }
  const condVal = cond.value;
  if (condVal === undefined) return undefined;
  const expected = Array.isArray(condVal)
    ? condVal
    : (condVal as string | number | boolean);
  const actual = toPrimitiveOrNull(val);
  return {
    type: 'override',
    op: cond.op as MatchedCondition['op'],
    key,
    expected,
    actual,
  };
}

function buildMatchedField(
  cond: { field: FieldConditionField; op: string; value: unknown },
  ctx: UserRuleContext,
  result: boolean,
): MatchedCondition | undefined {
  if (!result) return undefined;
  const ctxVal = getContextValue(ctx, cond.field);
  const actual = ctxVal !== undefined ? ctxVal : null;
  const expected = Array.isArray(cond.value)
    ? cond.value
    : (cond.value as string | number);
  return {
    type: 'field',
    field: cond.field,
    op: cond.op as MatchedCondition['op'],
    expected,
    actual: actual as string | number | boolean | null,
  };
}

function evaluateCondition(
  cond: Condition,
  ctx: UserRuleContext,
): EvalConditionResult {
  if (cond.field === 'override') {
    const ov = ctx.overrides ?? {};
    const key = cond.key;
    const val = ov[key];
    if (cond.op === 'exists') {
      const result = key in ov && val != null;
      return {
        result,
        matched: buildMatchedOverride(cond, ctx, result),
      };
    }
    const condVal = cond.value;
    if (condVal === undefined) return { result: false };
    if (cond.op === 'in') {
      const arr = Array.isArray(condVal) ? condVal : [condVal];
      const result = arr.some(
        (x) =>
          x === val ||
          (typeof x === 'number' &&
            typeof val === 'number' &&
            Number(x) === Number(val)),
      );
      return {
        result,
        matched: result ? buildMatchedOverride(cond, ctx, true) : undefined,
      };
    }
    const right = Array.isArray(condVal) ? condVal[0] : condVal;
    const left = val;
    if (left === undefined) return { result: false };
    if (cond.op === 'gte' || cond.op === 'lte') {
      const leftNum = typeof left === 'number';
      const rightNum = typeof right === 'number';
      if (!leftNum || !rightNum) return { result: false, invalid: true };
      const result =
        cond.op === 'gte'
          ? (left as number) >= (right as number)
          : (left as number) <= (right as number);
      return {
        result,
        matched: result ? buildMatchedOverride(cond, ctx, true) : undefined,
      };
    }
    switch (cond.op) {
      case 'eq': {
        const result =
          left === right ||
          (typeof left === 'number' &&
            typeof right === 'number' &&
            Number(left) === Number(right));
        return {
          result,
          matched: result ? buildMatchedOverride(cond, ctx, true) : undefined,
        };
      }
      case 'neq': {
        const result =
          left !== right &&
          (typeof left !== 'number' ||
            typeof right !== 'number' ||
            Number(left) !== Number(right));
        return {
          result,
          matched: result ? buildMatchedOverride(cond, ctx, true) : undefined,
        };
      }
      default:
        return { result: false };
    }
  }
  const ctxVal = getContextValue(ctx, cond.field as FieldConditionField);
  const condValue = cond.value as string | number | string[] | number[];
  const cmp = comparePrimitive(cond.op, ctxVal, condValue);
  const matched =
    cmp.result && !cmp.invalid ? buildMatchedField(cond, ctx, true) : undefined;
  return {
    result: cmp.result,
    invalid: cmp.invalid,
    matched,
  };
}

function evaluateWhenJson(
  when: unknown,
  ctx: UserRuleContext,
): RuleEvaluationMeta {
  if (when == null) return { applicable: true, invalid: false };
  const parsed = whenJsonSchema.safeParse(when);
  if (!parsed.success) return { applicable: false, invalid: true };
  const w = parsed.data as WhenJson;
  if (w.all !== undefined) {
    const matched: MatchedCondition[] = [];
    for (const c of w.all) {
      const r = evaluateCondition(c, ctx);
      if (r.invalid) return { applicable: false, invalid: true };
      if (!r.result) return { applicable: false, invalid: false };
      if (r.matched) matched.push(r.matched);
    }
    return {
      applicable: true,
      invalid: false,
      matched: matched.slice(0, MAX_MATCHED_CONDITIONS_PER_RULE),
    };
  }
  if (w.any !== undefined) {
    if (w.any.length === 0) return { applicable: false, invalid: false };
    const matched: MatchedCondition[] = [];
    for (const c of w.any) {
      const r = evaluateCondition(c, ctx);
      if (r.invalid) return { applicable: false, invalid: true };
      if (r.result && r.matched) matched.push(r.matched);
    }
    if (matched.length === 0) return { applicable: false, invalid: false };
    return {
      applicable: true,
      invalid: false,
      matched: matched.slice(0, MAX_MATCHED_CONDITIONS_PER_RULE),
    };
  }
  if (w.not !== undefined) {
    const r = evaluateCondition(w.not, ctx);
    if (r.invalid) return { applicable: false, invalid: true };
    const applicable = !r.result;
    return {
      applicable,
      invalid: false,
      matched: applicable ? undefined : undefined,
    };
  }
  return { applicable: true, invalid: false };
}

export type SupplementRulesFilterMeta = {
  total: number;
  applicable: number;
  skipped: number;
  invalidWhenJson: number;
};

export type RuleMetaById = Record<string, { matched?: MatchedCondition[] }>;

export function filterSupplementRulesForUser(
  rules: ProtocolSupplementRuleRow[],
  ctx: UserRuleContext,
): {
  applicableRules: ProtocolSupplementRuleRow[];
  meta: SupplementRulesFilterMeta;
  ruleMetaById: RuleMetaById;
} {
  let applicable = 0;
  let invalidWhenJson = 0;
  const applicableRules: ProtocolSupplementRuleRow[] = [];
  const ruleMetaById: RuleMetaById = {};
  for (const rule of rules) {
    if (rule.when_json == null) {
      applicableRules.push(rule);
      applicable += 1;
      continue;
    }
    const evalMeta = evaluateWhenJson(rule.when_json, ctx);
    if (evalMeta.invalid) invalidWhenJson += 1;
    if (evalMeta.applicable) {
      applicableRules.push(rule);
      applicable += 1;
      if (
        evalMeta.matched != null &&
        evalMeta.matched.length > 0 &&
        typeof rule.id === 'string'
      ) {
        ruleMetaById[rule.id] = { matched: evalMeta.matched };
      }
    }
  }
  return {
    applicableRules,
    meta: {
      total: rules.length,
      applicable,
      skipped: rules.length - applicable - invalidWhenJson,
      invalidWhenJson,
    },
    ruleMetaById,
  };
}

/**
 * Load active supplement rules for a protocol and filter by user context.
 * Returns only rules applicable to the user; meta counts total, applicable, skipped, invalid;
 * ruleMetaById contains matched conditions per rule (for "why" explanation) when when_json was present.
 */
export async function getApplicableProtocolSupplementRules(
  supabase: SupabaseClient,
  protocolId: string,
  ctx: UserRuleContext,
): Promise<{
  rules: ProtocolSupplementRuleRow[];
  meta: SupplementRulesFilterMeta;
  ruleMetaById: RuleMetaById;
}> {
  const allRules = await getProtocolSupplementRules(supabase, protocolId);
  const { applicableRules, meta, ruleMetaById } = filterSupplementRulesForUser(
    allRules,
    ctx,
  );
  return { rules: applicableRules, meta, ruleMetaById };
}

// ---------------------------------------------------------------------------
// Therapeutic overrides (user per-target overrides on active profile)
// ---------------------------------------------------------------------------

/**
 * Get overrides from the active user_therapeutic_profiles row.
 * Returns null if no active profile; returns {} if overrides column is null.
 * Explicit columns: id, overrides. No SELECT *.
 */
export async function getActiveTherapeuticOverrides(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('user_therapeutic_profiles')
    .select(USER_PROFILE_OVERRIDES_COLUMNS)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (data == null) return null;

  const overrides = (data as { overrides: unknown }).overrides;
  if (overrides == null) return {};
  if (typeof overrides === 'object' && !Array.isArray(overrides)) {
    return overrides as Record<string, unknown>;
  }
  return {};
}

/**
 * Update overrides on the active user_therapeutic_profiles row.
 * No hardcoded protocol; writes to the active row only.
 * If no active row, throws AppError VALIDATION_ERROR.
 * Updates only the overrides column; returns the new overrides.
 */
export async function upsertActiveTherapeuticOverrides(
  supabase: SupabaseClient,
  userId: string,
  overrides: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data: row, error: selectError } = await supabase
    .from('user_therapeutic_profiles')
    .select(USER_PROFILE_OVERRIDES_COLUMNS)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (selectError) throw selectError;
  if (row == null) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Kies eerst een therapeutisch protocol voordat je overrides opslaat.',
    );
  }

  const id = (row as { id: string }).id;
  const { data: updated, error: updateError } = await supabase
    .from('user_therapeutic_profiles')
    .update({ overrides, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('overrides')
    .single();

  if (updateError) throw updateError;
  const out = (updated as { overrides: unknown }).overrides;
  if (out != null && typeof out === 'object' && !Array.isArray(out)) {
    return out as Record<string, unknown>;
  }
  return {};
}

// ---------------------------------------------------------------------------
// User-scoped helpers (family as source of truth, fallback to user_*)
// ---------------------------------------------------------------------------

async function getDefaultFamilyMemberIdForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { getDefaultFamilyMemberId } =
    await import('@/src/lib/family/defaultFamilyMember');
  return getDefaultFamilyMemberId(supabase, userId);
}

/**
 * Get health profile for a user (default family member or legacy user_health_profiles).
 */
export async function getHealthProfileForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<HealthProfileRow | null> {
  const familyMemberId = await getDefaultFamilyMemberIdForUser(
    supabase,
    userId,
  );
  if (familyMemberId) {
    const row = await getHealthProfileForFamilyMember(supabase, familyMemberId);
    if (row)
      return {
        user_id: userId,
        birth_date: row.birth_date,
        sex: row.sex,
        height_cm: row.height_cm,
        weight_kg: row.weight_kg,
      };
  }
  return getHealthProfile(supabase, userId);
}

/**
 * Get active therapeutic profile for a user (default family member or legacy).
 */
export async function getActiveTherapeuticProfileForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  profile: UserTherapeuticProfileRow | FamilyMemberTherapeuticProfileRow;
  protocol: ProtocolDetailRow;
} | null> {
  const familyMemberId = await getDefaultFamilyMemberIdForUser(
    supabase,
    userId,
  );
  if (familyMemberId) {
    const result = await getActiveTherapeuticProfileForFamilyMember(
      supabase,
      familyMemberId,
    );
    if (result) return result;
  }
  return getActiveTherapeuticProfile(supabase, userId);
}

/**
 * Get active therapeutic overrides for a user (default family member or legacy).
 */
export async function getActiveTherapeuticOverridesForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const familyMemberId = await getDefaultFamilyMemberIdForUser(
    supabase,
    userId,
  );
  if (familyMemberId) {
    const ov = await getActiveTherapeuticOverridesForFamilyMember(
      supabase,
      familyMemberId,
    );
    if (ov !== null) return ov;
  }
  return getActiveTherapeuticOverrides(supabase, userId);
}

// ---------------------------------------------------------------------------
// Family member health & therapeutic (family_member_* tables)
// ---------------------------------------------------------------------------

export type FamilyMemberHealthProfileRow = {
  family_member_id: string;
  birth_date: string | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
};

export type FamilyMemberTherapeuticProfileRow = {
  id: string;
  family_member_id: string;
  protocol_id: string;
  is_active: boolean;
  overrides: unknown;
};

const HEALTH_COLUMNS_FAMILY =
  'family_member_id, birth_date, sex, height_cm, weight_kg';
const FAMILY_PROFILE_COLUMNS =
  'id, family_member_id, protocol_id, is_active, overrides';
const FAMILY_PROFILE_OVERRIDES_COLUMNS = 'id, overrides';

export async function getHealthProfileForFamilyMember(
  supabase: SupabaseClient,
  familyMemberId: string,
): Promise<FamilyMemberHealthProfileRow | null> {
  const { data, error } = await supabase
    .from('family_member_health_profiles')
    .select(HEALTH_COLUMNS_FAMILY)
    .eq('family_member_id', familyMemberId)
    .maybeSingle();

  if (error) throw error;
  return data as FamilyMemberHealthProfileRow | null;
}

export async function upsertHealthProfileForFamilyMember(
  supabase: SupabaseClient,
  familyMemberId: string,
  input: {
    birthDate?: string;
    sex?: 'female' | 'male' | 'other' | 'unknown';
    heightCm?: number;
    weightKg?: number;
  },
): Promise<FamilyMemberHealthProfileRow> {
  const row: Record<string, unknown> = {
    family_member_id: familyMemberId,
    updated_at: new Date().toISOString(),
  };
  if (input.birthDate !== undefined) row.birth_date = input.birthDate || null;
  if (input.sex !== undefined) row.sex = input.sex ?? null;
  if (input.heightCm !== undefined) row.height_cm = input.heightCm ?? null;
  if (input.weightKg !== undefined) row.weight_kg = input.weightKg ?? null;

  const { data, error } = await supabase
    .from('family_member_health_profiles')
    .upsert(row, { onConflict: 'family_member_id' })
    .select(HEALTH_COLUMNS_FAMILY)
    .single();

  if (error) throw error;
  return data as FamilyMemberHealthProfileRow;
}

export function mapFamilyMemberHealthRow(
  row: FamilyMemberHealthProfileRow | null,
): HealthProfileViewModel | null {
  if (!row) return null;
  const sex =
    row.sex && SEX_VALUES.includes(row.sex as (typeof SEX_VALUES)[number])
      ? (row.sex as (typeof SEX_VALUES)[number])
      : undefined;
  return {
    ...(row.birth_date != null && { birthDate: row.birth_date }),
    ...(sex != null && { sex }),
    ...(row.height_cm != null && { heightCm: row.height_cm }),
    ...(row.weight_kg != null && { weightKg: Number(row.weight_kg) }),
  };
}

export async function getActiveTherapeuticProfileForFamilyMember(
  supabase: SupabaseClient,
  familyMemberId: string,
): Promise<{
  profile: FamilyMemberTherapeuticProfileRow;
  protocol: ProtocolDetailRow;
} | null> {
  const { data: profileData, error: profileError } = await supabase
    .from('family_member_therapeutic_profiles')
    .select(FAMILY_PROFILE_COLUMNS)
    .eq('family_member_id', familyMemberId)
    .eq('is_active', true)
    .maybeSingle();

  if (profileError) throw profileError;
  const profile = profileData as FamilyMemberTherapeuticProfileRow | null;
  if (!profile) return null;

  const { data: protocolData, error: protocolError } = await supabase
    .from('therapeutic_protocols')
    .select(PROTOCOL_DETAIL_COLUMNS)
    .eq('id', profile.protocol_id)
    .single();

  if (protocolError) throw protocolError;
  const protocol = protocolData as ProtocolDetailRow;
  return { profile, protocol };
}

export async function setActiveTherapeuticProtocolForFamilyMember(
  supabase: SupabaseClient,
  familyMemberId: string,
  protocolId: string,
): Promise<void> {
  const { error } = await supabase.rpc(
    'set_family_member_active_therapeutic_protocol',
    {
      p_family_member_id: familyMemberId,
      p_protocol_id: protocolId,
    },
  );

  if (!error) return;

  const msg = error.message ?? '';
  if (
    msg.toLowerCase().includes('unauthorized') ||
    msg.toLowerCase().includes('access denied')
  ) {
    throw new AppError(
      'UNAUTHORIZED',
      'Je hebt geen toegang tot dit familielid.',
    );
  }
  if (msg.toLowerCase().includes('foreign key')) {
    throw new AppError('VALIDATION_ERROR', 'Dit protocol bestaat niet.');
  }
  throw new AppError(
    'INTERNAL',
    'Er ging iets mis bij het opslaan van het therapeutisch profiel.',
  );
}

export async function getActiveTherapeuticOverridesForFamilyMember(
  supabase: SupabaseClient,
  familyMemberId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('family_member_therapeutic_profiles')
    .select(FAMILY_PROFILE_OVERRIDES_COLUMNS)
    .eq('family_member_id', familyMemberId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (data == null) return null;

  const overrides = (data as { overrides: unknown }).overrides;
  if (overrides == null) return {};
  if (typeof overrides === 'object' && !Array.isArray(overrides)) {
    return overrides as Record<string, unknown>;
  }
  return {};
}

export async function upsertActiveTherapeuticOverridesForFamilyMember(
  supabase: SupabaseClient,
  familyMemberId: string,
  overrides: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data: row, error: selectError } = await supabase
    .from('family_member_therapeutic_profiles')
    .select(FAMILY_PROFILE_OVERRIDES_COLUMNS)
    .eq('family_member_id', familyMemberId)
    .eq('is_active', true)
    .maybeSingle();

  if (selectError) throw selectError;
  if (row == null) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Kies eerst een therapeutisch protocol voordat je overrides opslaat.',
    );
  }

  const id = (row as { id: string }).id;
  const { data: updated, error: updateError } = await supabase
    .from('family_member_therapeutic_profiles')
    .update({ overrides, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('overrides')
    .single();

  if (updateError) throw updateError;
  const out = (updated as { overrides: unknown }).overrides;
  if (out != null && typeof out === 'object' && !Array.isArray(out)) {
    return out as Record<string, unknown>;
  }
  return {};
}
