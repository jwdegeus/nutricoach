'use server';

import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import { AppError } from '@/src/lib/errors/app-error';
import type { TherapeuticProtocolRef } from '@/src/lib/diets/diet.types';
import {
  getHealthProfile,
  upsertHealthProfile,
  listActiveProtocols,
  getActiveTherapeuticProfile,
  setActiveTherapeuticProtocol,
  getProtocolTargets,
  getProtocolSupplements,
  getApplicableProtocolSupplementRules,
  getActiveTherapeuticOverrides,
  upsertActiveTherapeuticOverrides,
  mapHealthRow,
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

const setActiveProtocolSchema = z.object({
  protocolId: z.string().uuid(),
});

async function getSupabaseAndUserId(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new AppError('UNAUTHORIZED', 'Je moet ingelogd zijn.');
  }
  return { supabase, userId: user.id };
}

/**
 * Get current user's health profile (physiology). Returns null if no row exists.
 */
export async function getMyHealthProfileAction(): Promise<{
  ok: true;
  profile: HealthProfileViewModel | null;
}> {
  try {
    const { supabase, userId } = await getSupabaseAndUserId();
    const row = await getHealthProfile(supabase, userId);
    const profile = mapHealthRow(row);
    return { ok: true, profile };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'DB_ERROR',
      'Kon gezondheidsprofiel niet ophalen.',
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * Upsert current user's health profile. Validates input with Zod.
 */
export async function upsertMyHealthProfileAction(
  input: z.infer<typeof upsertHealthProfileSchema>,
): Promise<{
  ok: true;
  profile: HealthProfileViewModel;
}> {
  const parsed = upsertHealthProfileSchema.safeParse(input);
  if (!parsed.success) {
    const msg =
      parsed.error.errors.map((e) => e.message).join('; ') ||
      'Ongeldige invoer';
    throw new AppError('VALIDATION_ERROR', msg);
  }

  try {
    const { supabase, userId } = await getSupabaseAndUserId();
    const data = parsed.data;
    const row = await upsertHealthProfile(supabase, userId, {
      birthDate:
        data.birthDate && data.birthDate !== '' ? data.birthDate : undefined,
      sex: data.sex,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
    });
    const profile = mapHealthRow(row)!;
    return { ok: true, profile };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'DB_ERROR',
      'Kon gezondheidsprofiel niet opslaan.',
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * List active therapeutic protocols (for user to choose). RLS: is_active = true only.
 */
export async function listActiveTherapeuticProtocolsAction(): Promise<{
  ok: true;
  protocols: ProtocolListItem[];
}> {
  try {
    const { supabase } = await getSupabaseAndUserId();
    const rows = await listActiveProtocols(supabase);
    const protocols = rows.map(mapProtocolListRow);
    return { ok: true, protocols };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'DB_ERROR',
      'Kon protocollen niet ophalen.',
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * Get current user's active therapeutic profile (protocol ref + overrides). Returns null if none set.
 */
export async function getMyActiveTherapeuticProfileAction(): Promise<{
  ok: true;
  active: {
    protocol: TherapeuticProtocolRef;
    overrides?: Record<string, unknown>;
  } | null;
}> {
  try {
    const { supabase, userId } = await getSupabaseAndUserId();
    const result = await getActiveTherapeuticProfile(supabase, userId);
    if (!result) return { ok: true, active: null };
    const protocol = mapProtocolRowToRef(result.protocol);
    const overrides =
      result.profile.overrides != null &&
      typeof result.profile.overrides === 'object' &&
      !Array.isArray(result.profile.overrides)
        ? (result.profile.overrides as Record<string, unknown>)
        : undefined;
    return { ok: true, active: { protocol, ...(overrides && { overrides }) } };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'DB_ERROR',
      'Kon therapeutisch profiel niet ophalen.',
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * Set active therapeutic protocol for current user. Deactivates others, then upserts selected.
 * Returns the new active profile (same shape as getMyActiveTherapeuticProfileAction).
 */
export async function setMyActiveTherapeuticProtocolAction(
  input: z.infer<typeof setActiveProtocolSchema>,
): Promise<{
  ok: true;
  active: {
    protocol: TherapeuticProtocolRef;
    overrides?: Record<string, unknown>;
  } | null;
}> {
  const parsed = setActiveProtocolSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Ongeldige invoer.');
  }

  try {
    const { supabase, userId } = await getSupabaseAndUserId();
    await setActiveTherapeuticProtocol(
      supabase,
      userId,
      parsed.data.protocolId,
    );
    const result = await getMyActiveTherapeuticProfileAction();
    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('INTERNAL', 'Er ging iets mis. Probeer het opnieuw.');
  }
}

/**
 * Load full details for the user's active protocol: ref + targets + supplements + applicable rules.
 * Rules are filtered by user context (health profile + overrides). Returns null if no active profile.
 * rulesWhy (optional): per-rule matched conditions for "why" explanation when when_json was present.
 */
export async function loadMyActiveTherapeuticProtocolDetailsAction(): Promise<{
  ok: true;
  details: {
    protocol: TherapeuticProtocolRef;
    targets: ProtocolTargetRow[];
    supplements: ProtocolSupplementRow[];
    rules: ProtocolSupplementRuleRow[];
    rulesMeta?: SupplementRulesFilterMeta;
    rulesWhy?: Record<string, { matched?: MatchedCondition[] }>;
  } | null;
}> {
  try {
    const { supabase, userId } = await getSupabaseAndUserId();
    const result = await getActiveTherapeuticProfile(supabase, userId);
    if (!result) return { ok: true, details: null };

    const protocolId = result.profile.protocol_id;
    const [healthRow, overrides, targets, supplements] = await Promise.all([
      getHealthProfile(supabase, userId),
      getActiveTherapeuticOverrides(supabase, userId),
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
        protocol,
        targets,
        supplements,
        rules,
        rulesMeta: meta,
        ...(Object.keys(ruleMetaById).length > 0 && { rulesWhy: ruleMetaById }),
      },
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'DB_ERROR',
      'Kon protocoldetails niet ophalen.',
      err instanceof Error ? err : undefined,
    );
  }
}

/** JSON-safe value for overrides (no hardcoded keys; dynamic from protocol/snapshot). */
const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.number(),
    z.string(),
    z.boolean(),
    z.null(),
    z.record(z.string(), jsonValueSchema),
    z.array(jsonValueSchema),
  ]),
);

const upsertOverridesSchema = z
  .object({
    overrides: z.record(z.string(), jsonValueSchema),
  })
  .refine((v) => Object.keys(v.overrides).length <= 200, {
    message: 'Maximaal 200 overrides toegestaan.',
  });

/**
 * Get current user's therapeutic overrides from the active profile.
 * Returns null when user has no active protocol; otherwise the overrides object (possibly empty).
 */
export async function getMyTherapeuticOverridesAction(): Promise<{
  ok: true;
  overrides: Record<string, unknown> | null;
}> {
  try {
    const { supabase, userId } = await getSupabaseAndUserId();
    const overrides = await getActiveTherapeuticOverrides(supabase, userId);
    return { ok: true, overrides };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'DB_ERROR',
      'Kon overrides niet ophalen.',
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * Upsert therapeutic overrides on the active profile. Keys are dynamic (from protocol/snapshot).
 * Throws VALIDATION_ERROR when no active protocol or invalid input (Zod / max 200 keys).
 */
export async function upsertMyTherapeuticOverridesAction(
  input: unknown,
): Promise<{
  ok: true;
  overrides: Record<string, unknown>;
}> {
  const parsed = upsertOverridesSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Ongeldige invoer.');
  }

  try {
    const { supabase, userId } = await getSupabaseAndUserId();
    const overrides = await upsertActiveTherapeuticOverrides(
      supabase,
      userId,
      parsed.data.overrides,
    );
    return { ok: true, overrides };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('INTERNAL', 'Er ging iets mis. Probeer het opnieuw.');
  }
}
