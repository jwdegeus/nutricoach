'use server';

import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import { AppError } from '@/src/lib/errors/app-error';
import type { TherapeuticProtocolRef } from '@/src/lib/diets/diet.types';
import {
  getHealthProfileForFamilyMember,
  upsertHealthProfileForFamilyMember,
  mapFamilyMemberHealthRow,
  listActiveProtocols,
  getActiveTherapeuticProfileForFamilyMember,
  setActiveTherapeuticProtocolForFamilyMember,
  getActiveTherapeuticOverridesForFamilyMember,
  upsertActiveTherapeuticOverridesForFamilyMember,
  getProtocolTargets,
  getProtocolSupplements,
  getApplicableProtocolSupplementRules,
  mapProtocolRowToRef,
  mapProtocolListRow,
  ageYearsFromBirthDate,
  type HealthProfileViewModel,
  type ProtocolListItem,
  type ProtocolTargetRow,
  type ProtocolSupplementRow,
  type ProtocolSupplementRuleRow,
  type SupplementRulesFilterMeta,
  type MatchedCondition,
} from '@/src/lib/therapeutic/therapeuticProfile.service';

const SEX_ENUM = z.enum(['female', 'male', 'other', 'unknown']);
const upsertHealthProfileSchema = z.object({
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
  sex: SEX_ENUM.optional(),
  heightCm: z.number().int().min(50).max(250).optional(),
  weightKg: z.number().min(10).max(400).optional(),
});
const setActiveProtocolSchema = z.object({ protocolId: z.string().uuid() });

async function ensureFamilyMemberOwnership(memberId: string): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError('UNAUTHORIZED', 'Je moet ingelogd zijn.');

  const { data: member, error } = await supabase
    .from('family_members')
    .select('id')
    .eq('id', memberId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw new AppError('DB_ERROR', error.message);
  if (!member)
    throw new AppError('VALIDATION_ERROR', 'Familielid niet gevonden.');
  return { supabase, userId: user.id };
}

export async function getHealthProfileForFamilyMemberAction(
  memberId: string,
): Promise<{
  ok: true;
  profile: HealthProfileViewModel | null;
}> {
  const { supabase } = await ensureFamilyMemberOwnership(memberId);
  const row = await getHealthProfileForFamilyMember(supabase, memberId);
  const profile = mapFamilyMemberHealthRow(row);
  return { ok: true, profile };
}

export async function upsertHealthProfileForFamilyMemberAction(
  memberId: string,
  input: z.infer<typeof upsertHealthProfileSchema>,
): Promise<{ ok: true; profile: HealthProfileViewModel }> {
  const parsed = upsertHealthProfileSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      parsed.error.errors.map((e) => e.message).join('; '),
    );
  }
  const { supabase } = await ensureFamilyMemberOwnership(memberId);
  const data = parsed.data;
  await upsertHealthProfileForFamilyMember(supabase, memberId, {
    birthDate:
      data.birthDate && data.birthDate !== '' ? data.birthDate : undefined,
    sex: data.sex,
    heightCm: data.heightCm,
    weightKg: data.weightKg,
  });
  const row = await getHealthProfileForFamilyMember(supabase, memberId);
  const profile = mapFamilyMemberHealthRow(row)!;
  return { ok: true, profile };
}

export async function listActiveTherapeuticProtocolsForFamilyAction(): Promise<{
  ok: true;
  protocols: ProtocolListItem[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError('UNAUTHORIZED', 'Je moet ingelogd zijn.');
  const rows = await listActiveProtocols(supabase);
  return { ok: true, protocols: rows.map(mapProtocolListRow) };
}

export async function getActiveTherapeuticProfileForFamilyMemberAction(
  memberId: string,
): Promise<{
  ok: true;
  active: {
    protocol: TherapeuticProtocolRef;
    overrides?: Record<string, unknown>;
  } | null;
}> {
  const { supabase } = await ensureFamilyMemberOwnership(memberId);
  const result = await getActiveTherapeuticProfileForFamilyMember(
    supabase,
    memberId,
  );
  if (!result) return { ok: true, active: null };
  const protocol = mapProtocolRowToRef(result.protocol);
  const overrides =
    result.profile.overrides != null &&
    typeof result.profile.overrides === 'object' &&
    !Array.isArray(result.profile.overrides)
      ? (result.profile.overrides as Record<string, unknown>)
      : undefined;
  return { ok: true, active: { protocol, ...(overrides && { overrides }) } };
}

export async function setActiveTherapeuticProtocolForFamilyMemberAction(
  memberId: string,
  input: z.infer<typeof setActiveProtocolSchema>,
): Promise<{
  ok: true;
  active: {
    protocol: TherapeuticProtocolRef;
    overrides?: Record<string, unknown>;
  } | null;
}> {
  const parsed = setActiveProtocolSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError('VALIDATION_ERROR', 'Ongeldige invoer.');
  const { supabase } = await ensureFamilyMemberOwnership(memberId);
  await setActiveTherapeuticProtocolForFamilyMember(
    supabase,
    memberId,
    parsed.data.protocolId,
  );
  return getActiveTherapeuticProfileForFamilyMemberAction(memberId);
}

export async function loadActiveTherapeuticProtocolDetailsForFamilyMemberAction(
  memberId: string,
): Promise<{
  ok: true;
  details: {
    protocol: { protocolKey: string; labelNl?: string };
    targets: ProtocolTargetRow[];
    supplements: ProtocolSupplementRow[];
    rules: ProtocolSupplementRuleRow[];
    rulesMeta?: SupplementRulesFilterMeta;
    rulesWhy?: Record<string, { matched?: MatchedCondition[] }>;
  } | null;
}> {
  const { supabase } = await ensureFamilyMemberOwnership(memberId);
  const result = await getActiveTherapeuticProfileForFamilyMember(
    supabase,
    memberId,
  );
  if (!result) return { ok: true, details: null };

  const protocolId = result.profile.protocol_id;
  const [healthRow, overrides, targets, supplements] = await Promise.all([
    getHealthProfileForFamilyMember(supabase, memberId),
    getActiveTherapeuticOverridesForFamilyMember(supabase, memberId),
    getProtocolTargets(supabase, protocolId),
    getProtocolSupplements(supabase, protocolId),
  ]);

  const protocolRow = result.protocol;
  const sex =
    healthRow?.sex &&
    ['female', 'male', 'other', 'unknown'].includes(healthRow.sex)
      ? (healthRow.sex as 'female' | 'male' | 'other' | 'unknown')
      : undefined;
  const rawVersion =
    protocolRow.version != null && protocolRow.version !== ''
      ? protocolRow.version
      : null;
  const protocolVersion =
    rawVersion != null
      ? (() => {
          const n = Number(rawVersion);
          return Number.isNaN(n) ? undefined : n;
        })()
      : undefined;
  const ctx = {
    sex,
    ageYears: ageYearsFromBirthDate(healthRow?.birth_date ?? null),
    heightCm: healthRow?.height_cm ?? undefined,
    weightKg:
      healthRow?.weight_kg != null ? Number(healthRow.weight_kg) : undefined,
    overrides: overrides ?? undefined,
    dietKey: undefined as string | undefined,
    protocolKey: protocolRow.protocol_key ?? undefined,
    protocolVersion,
  };
  const { rules, meta, ruleMetaById } =
    await getApplicableProtocolSupplementRules(supabase, protocolId, ctx);

  const protocol = mapProtocolRowToRef(protocolRow);
  return {
    ok: true,
    details: {
      protocol: {
        protocolKey: protocol.protocolKey,
        labelNl: protocol.labelNl,
      },
      targets,
      supplements,
      rules,
      rulesMeta: meta,
      ...(Object.keys(ruleMetaById).length > 0 && { rulesWhy: ruleMetaById }),
    },
  };
}

const upsertOverridesSchema = z
  .object({
    overrides: z.record(z.string(), z.unknown()),
  })
  .refine((v) => Object.keys(v.overrides).length <= 200, {
    message: 'Maximaal 200 overrides.',
  });

export async function getTherapeuticOverridesForFamilyMemberAction(
  memberId: string,
): Promise<{
  ok: true;
  overrides: Record<string, unknown> | null;
}> {
  const { supabase } = await ensureFamilyMemberOwnership(memberId);
  const overrides = await getActiveTherapeuticOverridesForFamilyMember(
    supabase,
    memberId,
  );
  return { ok: true, overrides };
}

export async function upsertTherapeuticOverridesForFamilyMemberAction(
  memberId: string,
  input: unknown,
): Promise<{ ok: true; overrides: Record<string, unknown> }> {
  const parsed = upsertOverridesSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError('VALIDATION_ERROR', 'Ongeldige invoer.');
  const { supabase } = await ensureFamilyMemberOwnership(memberId);
  const overrides = await upsertActiveTherapeuticOverridesForFamilyMember(
    supabase,
    memberId,
    parsed.data.overrides as Record<string, unknown>,
  );
  return { ok: true, overrides };
}
