'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { z } from 'zod';
import {
  loadMealPlanGeneratorConfig,
  mergePoolItemsWithCandidatePool,
  type MealPlanGeneratorConfig,
  type PoolItemFromDb,
  type GeneratorSettingsFromDb,
} from '@/src/lib/meal-plans/mealPlanGeneratorConfigLoader';
import { buildCandidatePool } from '@/src/lib/agents/meal-planner/mealPlannerAgent.tools';
import {
  sanitizeCandidatePool,
  normalizeName,
} from '@/src/lib/meal-plans/candidatePoolSanitizer';
import { loadHardBlockTermsForDiet } from '@/src/lib/meal-plans/guardrailsExcludeTerms';
import {
  generateTemplatePlan,
  InsufficientAllowedIngredientsError,
  type RecipeTemplate,
  type TemplateSlot,
} from '@/src/lib/meal-plans/templateFallbackGenerator';
import { validateMealPlanSanity } from '@/src/lib/meal-plans/mealPlanSanityValidator';
import { AppError } from '@/src/lib/errors/app-error';
import type { GuardrailsViolationDetails } from '@/src/lib/errors/app-error';
import { enforceMealPlannerGuardrails } from '@/src/lib/agents/meal-planner/enforceMealPlannerGuardrails';
import type { MealPlanRequest, MealPlanResponse } from '@/src/lib/diets';
import type {
  GeneratorMeta,
  TherapeuticTargetsSnapshot,
} from '@/src/lib/diets/diet.types';
import { buildTherapeuticTargetsSnapshot } from '@/src/lib/therapeutic/buildTherapeuticTargetsSnapshot';

export type GeneratorConfigTemplatesRow = {
  id: string;
  template_key: string;
  name_nl: string;
  is_active: boolean;
  max_steps: number;
  updated_at: string;
};

export type GeneratorConfigPoolItemRow = {
  id: string;
  diet_key: string;
  category: string;
  item_key: string;
  nevo_code: string | null;
  name: string;
  is_active: boolean;
  min_g: number | null;
  default_g: number | null;
  max_g: number | null;
  updated_at: string;
};

export type GeneratorConfigSettingsRow = {
  diet_key: string;
  max_ingredients: number;
  max_flavor_items: number;
  protein_repeat_cap_7d: number;
  template_repeat_cap_7d: number;
  signature_retry_limit: number;
  veg_threshold_low_g: number;
  veg_threshold_mid_g: number;
  veg_threshold_high_g: number;
  veg_score_low: number;
  veg_score_mid: number;
  veg_score_high: number;
  updated_at: string;
};

export type GeneratorConfigSlotsRow = {
  template_id: string;
  slot_key: string;
  min_g: number;
  default_g: number;
  max_g: number;
  updated_at: string;
};

export type GeneratorConfigNamePatternRow = {
  id: string;
  diet_key: string;
  template_key: string;
  slot: string;
  pattern: string;
  is_active: boolean;
  updated_at: string;
};

export type GeneratorConfigAdminData = {
  templates: GeneratorConfigTemplatesRow[];
  poolItems: GeneratorConfigPoolItemRow[];
  settings: GeneratorConfigSettingsRow[];
  slots: GeneratorConfigSlotsRow[];
  namePatterns: GeneratorConfigNamePatternRow[];
};

type ActionResult<T> = { data: T } | { error: string };

export async function getGeneratorConfigAdmin(): Promise<
  ActionResult<GeneratorConfigAdminData>
> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();

  const [templatesRes, poolRes, settingsRes, slotsRes, namePatternsRes] =
    await Promise.all([
      supabase
        .from('meal_plan_templates')
        .select('id, template_key, name_nl, is_active, max_steps, updated_at')
        .order('template_key'),
      supabase
        .from('meal_plan_pool_items')
        .select(
          'id, diet_key, category, item_key, nevo_code, name, is_active, min_g, default_g, max_g, updated_at',
        )
        .order('diet_key')
        .order('category')
        .order('item_key'),
      supabase
        .from('meal_plan_generator_settings')
        .select(
          'diet_key, max_ingredients, max_flavor_items, protein_repeat_cap_7d, template_repeat_cap_7d, signature_retry_limit, veg_threshold_low_g, veg_threshold_mid_g, veg_threshold_high_g, veg_score_low, veg_score_mid, veg_score_high, updated_at',
        )
        .order('diet_key'),
      supabase
        .from('meal_plan_template_slots')
        .select('template_id, slot_key, min_g, default_g, max_g, updated_at')
        .order('template_id')
        .order('slot_key'),
      // RLS: admins need "Admins can read all meal_plan_name_patterns" to see inactive rows
      supabase
        .from('meal_plan_name_patterns')
        .select(
          'id, diet_key, template_key, slot, pattern, is_active, updated_at',
        )
        .order('diet_key')
        .order('template_key')
        .order('slot'),
    ]);

  if (templatesRes.error) {
    return { error: `Templates: ${templatesRes.error.message}` };
  }
  if (poolRes.error) {
    return { error: `Pool items: ${poolRes.error.message}` };
  }
  if (settingsRes.error) {
    return { error: `Settings: ${settingsRes.error.message}` };
  }
  if (slotsRes.error) {
    return { error: `Slots: ${slotsRes.error.message}` };
  }
  if (namePatternsRes.error) {
    return { error: `Name patterns: ${namePatternsRes.error.message}` };
  }

  return {
    data: {
      templates: (templatesRes.data ?? []).map((r) => ({
        id: r.id,
        template_key: r.template_key,
        name_nl: r.name_nl,
        is_active: !!r.is_active,
        max_steps: Number(r.max_steps),
        updated_at: r.updated_at ?? '',
      })),
      poolItems: (poolRes.data ?? []).map((r) => ({
        id: r.id,
        diet_key: r.diet_key,
        category: r.category,
        item_key: r.item_key,
        nevo_code: r.nevo_code,
        name: r.name,
        is_active: !!r.is_active,
        min_g: r.min_g != null ? Number(r.min_g) : null,
        default_g: r.default_g != null ? Number(r.default_g) : null,
        max_g: r.max_g != null ? Number(r.max_g) : null,
        updated_at: r.updated_at ?? '',
      })),
      settings: (settingsRes.data ?? []).map((r) => ({
        diet_key: r.diet_key,
        max_ingredients: Number(r.max_ingredients),
        max_flavor_items: Number(r.max_flavor_items),
        protein_repeat_cap_7d: Number(r.protein_repeat_cap_7d),
        template_repeat_cap_7d: Number(r.template_repeat_cap_7d),
        signature_retry_limit: Number(r.signature_retry_limit),
        veg_threshold_low_g: Number(r.veg_threshold_low_g),
        veg_threshold_mid_g: Number(r.veg_threshold_mid_g),
        veg_threshold_high_g: Number(r.veg_threshold_high_g),
        veg_score_low: Number(r.veg_score_low),
        veg_score_mid: Number(r.veg_score_mid),
        veg_score_high: Number(r.veg_score_high),
        updated_at: r.updated_at ?? '',
      })),
      slots: (slotsRes.data ?? []).map((r) => ({
        template_id: r.template_id,
        slot_key: r.slot_key,
        min_g: Number(r.min_g),
        default_g: Number(r.default_g),
        max_g: Number(r.max_g),
        updated_at: r.updated_at ?? '',
      })),
      namePatterns: (namePatternsRes.data ?? []).map((r) => ({
        id: r.id,
        diet_key: r.diet_key ?? '',
        template_key: r.template_key ?? '',
        slot: r.slot ?? '',
        pattern: r.pattern ?? '',
        is_active: !!r.is_active,
        updated_at: r.updated_at ?? '',
      })),
    },
  };
}

// --- Config snapshot export/import (admin-only, no SELECT *) ---

export type GeneratorConfigSnapshot = {
  version: 1;
  exportedAt: string;
  dietKey: string;
  templates: Array<{
    template_key: string;
    name_nl: string;
    is_active: boolean;
    max_steps: number;
  }>;
  slots: Array<{
    template_key: string;
    slot_key: string;
    min_g: number;
    default_g: number;
    max_g: number;
  }>;
  poolItems: Array<{
    diet_key: string;
    category: string;
    item_key: string;
    nevo_code: string | null;
    name: string;
    is_active: boolean;
    min_g: number | null;
    default_g: number | null;
    max_g: number | null;
  }>;
  settings: Array<{
    diet_key: string;
    max_ingredients: number;
    max_flavor_items: number;
    protein_repeat_cap_7d: number;
    template_repeat_cap_7d: number;
    signature_retry_limit: number;
    veg_threshold_low_g: number;
    veg_threshold_mid_g: number;
    veg_threshold_high_g: number;
    veg_score_low: number;
    veg_score_mid: number;
    veg_score_high: number;
  }>;
};

const SLOT_ORDER: TemplateSlot[] = ['protein', 'veg1', 'veg2', 'fat'];

/** Build in-memory generator config from a snapshot (no DB writes). Used for compare preview. */
function buildConfigFromSnapshot(
  snapshot: GeneratorConfigSnapshot,
): MealPlanGeneratorConfig {
  const dietKey = snapshot.dietKey?.trim() || 'default';
  const activeTemplates = snapshot.templates.filter((t) => t.is_active);
  const _templateKeys = new Set(activeTemplates.map((t) => t.template_key));

  const templates: RecipeTemplate[] = [];
  for (const t of activeTemplates) {
    const slotRows = snapshot.slots
      .filter((s) => s.template_key === t.template_key)
      .sort(
        (a, b) =>
          SLOT_ORDER.indexOf(a.slot_key as TemplateSlot) -
          SLOT_ORDER.indexOf(b.slot_key as TemplateSlot),
      );
    const slots = slotRows.map((s) => ({
      slot: s.slot_key as TemplateSlot,
      defaultG: s.default_g,
      minG: s.min_g,
      maxG: s.max_g,
    }));
    if (slots.length !== 4) continue;
    templates.push({
      id: t.template_key,
      nameNl: t.name_nl,
      slots,
      stepCount: t.max_steps,
    });
  }

  const poolFiltered = snapshot.poolItems.filter(
    (p) => (p.diet_key === dietKey || p.diet_key === 'default') && p.is_active,
  );
  const byItemKey = new Map<string, (typeof poolFiltered)[0]>();
  for (const p of poolFiltered) {
    byItemKey.set(`${p.diet_key}:${p.category}:${p.item_key}`, p);
  }
  const fromDefault = poolFiltered.filter((p) => p.diet_key === 'default');
  const fromDiet = poolFiltered.filter((p) => p.diet_key === dietKey);
  const poolByCategory = {
    protein: [] as PoolItemFromDb[],
    veg: [] as PoolItemFromDb[],
    fat: [] as PoolItemFromDb[],
    flavor: [] as PoolItemFromDb[],
  };
  for (const cat of ['protein', 'veg', 'fat', 'flavor'] as const) {
    const forCat = [
      ...fromDefault.filter((r) => r.category === cat),
      ...fromDiet.filter((r) => r.category === cat),
    ];
    const seen = new Set<string>();
    for (const r of forCat) {
      if (seen.has(r.item_key)) continue;
      seen.add(r.item_key);
      poolByCategory[cat].push({
        diet_key: r.diet_key,
        category: r.category as 'protein' | 'veg' | 'fat' | 'flavor',
        item_key: r.item_key,
        nevo_code: r.nevo_code,
        name: r.name,
        default_g: r.default_g,
        min_g: r.min_g,
        max_g: r.max_g,
      });
    }
  }

  const dietSetting = snapshot.settings.find((s) => s.diet_key === dietKey);
  const defaultSetting = snapshot.settings.find(
    (s) => s.diet_key === 'default',
  );
  const row = dietSetting ?? defaultSetting;
  const settings: GeneratorSettingsFromDb = row
    ? {
        max_ingredients: row.max_ingredients,
        max_flavor_items: row.max_flavor_items,
        protein_repeat_cap_7d: row.protein_repeat_cap_7d,
        template_repeat_cap_7d: row.template_repeat_cap_7d,
        signature_retry_limit: row.signature_retry_limit,
        veg_threshold_low_g: row.veg_threshold_low_g,
        veg_threshold_mid_g: row.veg_threshold_mid_g,
        veg_threshold_high_g: row.veg_threshold_high_g,
        veg_score_low: row.veg_score_low,
        veg_score_mid: row.veg_score_mid,
        veg_score_high: row.veg_score_high,
      }
    : {
        max_ingredients: 10,
        max_flavor_items: 2,
        protein_repeat_cap_7d: 2,
        template_repeat_cap_7d: 3,
        signature_retry_limit: 8,
        veg_threshold_low_g: 80,
        veg_threshold_mid_g: 150,
        veg_threshold_high_g: 250,
        veg_score_low: 1,
        veg_score_mid: 2,
        veg_score_high: 4,
      };

  return { templates, poolItems: poolByCategory, settings, namePatterns: [] };
}

type ExportResult = { data: GeneratorConfigSnapshot } | { error: string };

export async function exportGeneratorConfigSnapshotAction(input: {
  dietKey: string;
}): Promise<ExportResult> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }
  const dietKey = (input.dietKey ?? 'default').trim() || 'default';

  const result = await getGeneratorConfigAdmin();
  if ('error' in result) {
    return { error: result.error };
  }
  const { templates, slots, poolItems, settings } = result.data;
  const templateById = new Map(templates.map((t) => [t.id, t]));

  const snapshot: GeneratorConfigSnapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    dietKey,
    templates: templates.map((t) => ({
      template_key: t.template_key,
      name_nl: t.name_nl,
      is_active: t.is_active,
      max_steps: t.max_steps,
    })),
    slots: slots
      .map((s) => {
        const t = templateById.get(s.template_id);
        return t
          ? {
              template_key: t.template_key,
              slot_key: s.slot_key,
              min_g: s.min_g,
              default_g: s.default_g,
              max_g: s.max_g,
            }
          : null;
      })
      .filter((s): s is NonNullable<typeof s> => s != null),
    poolItems: poolItems
      .filter((p) => p.diet_key === dietKey || p.diet_key === 'default')
      .map((p) => ({
        diet_key: p.diet_key,
        category: p.category,
        item_key: p.item_key,
        nevo_code: p.nevo_code,
        name: p.name,
        is_active: p.is_active,
        min_g: p.min_g,
        default_g: p.default_g,
        max_g: p.max_g,
      })),
    settings: settings
      .filter((s) => s.diet_key === dietKey || s.diet_key === 'default')
      .map((s) => ({
        diet_key: s.diet_key,
        max_ingredients: s.max_ingredients,
        max_flavor_items: s.max_flavor_items,
        protein_repeat_cap_7d: s.protein_repeat_cap_7d,
        template_repeat_cap_7d: s.template_repeat_cap_7d,
        signature_retry_limit: s.signature_retry_limit,
        veg_threshold_low_g: s.veg_threshold_low_g,
        veg_threshold_mid_g: s.veg_threshold_mid_g,
        veg_threshold_high_g: s.veg_threshold_high_g,
        veg_score_low: s.veg_score_low,
        veg_score_mid: s.veg_score_mid,
        veg_score_high: s.veg_score_high,
      })),
  };
  return { data: snapshot };
}

const snapshotTemplateSchema = z.object({
  template_key: z.string().min(1),
  name_nl: z.string().min(1),
  is_active: z.boolean(),
  max_steps: z.number().int().min(1).max(20),
});
const snapshotSlotSchema = z
  .object({
    template_key: z.string().min(1),
    slot_key: z.enum(['protein', 'veg1', 'veg2', 'fat']),
    min_g: z.number().int().min(1).max(2000),
    default_g: z.number().int().min(1).max(2000),
    max_g: z.number().int().min(1).max(2000),
  })
  .refine((r) => r.min_g <= r.default_g && r.default_g <= r.max_g, {
    message: 'min ≤ default ≤ max',
  });
const snapshotPoolItemSchema = z
  .object({
    diet_key: z.string().min(1),
    category: z.enum(['protein', 'veg', 'fat', 'flavor']),
    item_key: z.string().min(1),
    nevo_code: z.string().nullable(),
    name: z.string().min(1),
    is_active: z.boolean(),
    min_g: z.number().int().min(1).max(500).nullable(),
    default_g: z.number().int().min(1).max(500).nullable(),
    max_g: z.number().int().min(1).max(500).nullable(),
  })
  .refine(
    (r) =>
      (r.min_g == null && r.default_g == null && r.max_g == null) ||
      (r.min_g != null &&
        r.default_g != null &&
        r.max_g != null &&
        r.min_g <= r.default_g &&
        r.default_g <= r.max_g),
    {
      message:
        'flavor: min/default/max all set and min≤default≤max; non-flavor: all null',
    },
  );
const snapshotSettingsSchema = z
  .object({
    diet_key: z.string().min(1),
    max_ingredients: z.number().int().min(1).max(20),
    max_flavor_items: z.number().int().min(0).max(5),
    protein_repeat_cap_7d: z.number().int().min(1).max(14),
    template_repeat_cap_7d: z.number().int().min(1).max(21),
    signature_retry_limit: z.number().int().min(1).max(20),
    veg_threshold_low_g: z.number().int().min(1).max(2000),
    veg_threshold_mid_g: z.number().int().min(1).max(2000),
    veg_threshold_high_g: z.number().int().min(1).max(2000),
    veg_score_low: z.number().int().min(0).max(20),
    veg_score_mid: z.number().int().min(0).max(20),
    veg_score_high: z.number().int().min(0).max(20),
  })
  .refine(
    (d) =>
      d.veg_threshold_low_g <= d.veg_threshold_mid_g &&
      d.veg_threshold_mid_g <= d.veg_threshold_high_g,
    { message: 'Veg thresholds: low ≤ mid ≤ high' },
  )
  .refine(
    (d) =>
      d.veg_score_low <= d.veg_score_mid && d.veg_score_mid <= d.veg_score_high,
    { message: 'Veg scores: low ≤ mid ≤ high' },
  );

const importSnapshotSchema = z
  .object({
    version: z.literal(1),
    exportedAt: z.string(),
    dietKey: z.string(),
    templates: z.array(snapshotTemplateSchema),
    slots: z.array(snapshotSlotSchema),
    poolItems: z.array(snapshotPoolItemSchema),
    settings: z.array(snapshotSettingsSchema),
  })
  .refine(
    (data) => {
      const keys = data.templates.map((t) => t.template_key);
      return keys.length === new Set(keys).size;
    },
    { message: 'template_key must be unique' },
  )
  .refine(
    (data) => {
      const templateKeys = new Set(data.templates.map((t) => t.template_key));
      for (const slot of data.slots) {
        if (!templateKeys.has(slot.template_key)) return false;
      }
      return true;
    },
    { message: 'every slot must reference an existing template_key' },
  )
  .refine(
    (data) => {
      const _templateKeys = new Set(data.templates.map((t) => t.template_key));
      for (const t of data.templates) {
        const slotCount = data.slots.filter(
          (s) => s.template_key === t.template_key,
        ).length;
        if (slotCount !== 4) return false;
      }
      return true;
    },
    { message: 'each template must have exactly 4 slots' },
  )
  .refine(
    (data) => {
      const set = new Set(
        data.poolItems.map((p) => `${p.diet_key}:${p.category}:${p.item_key}`),
      );
      return set.size === data.poolItems.length;
    },
    { message: 'poolItems (diet_key, category, item_key) must be unique' },
  );

export async function importGeneratorConfigSnapshotAction(input: {
  snapshot: unknown;
}): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = importSnapshotSchema.safeParse(input.snapshot);
  if (!parsed.success) {
    const msg =
      parsed.error.errors.map((e) => e.message).join('; ') ||
      'Ongeldige snapshot';
    return { error: msg };
  }

  const snapshot = parsed.data;
  const supabase = await createClient();

  // 1) Upsert templates (by template_key)
  const templateRows = snapshot.templates.map((t) => ({
    template_key: t.template_key,
    name_nl: t.name_nl,
    is_active: t.is_active,
    max_steps: t.max_steps,
  }));
  const { data: templatesAfter, error: errTemplates } = await supabase
    .from('meal_plan_templates')
    .upsert(templateRows, { onConflict: 'template_key' })
    .select('id, template_key');

  if (errTemplates) {
    return { error: `Templates: ${errTemplates.message}` };
  }
  const templateKeyToId = new Map(
    (templatesAfter ?? []).map((t) => [
      t.template_key as string,
      t.id as string,
    ]),
  );

  // 2) Upsert slots (resolve template_key -> template_id)
  const slotRows = snapshot.slots
    .map((s) => {
      const templateId = templateKeyToId.get(s.template_key);
      if (!templateId) return null;
      return {
        template_id: templateId,
        slot_key: s.slot_key,
        min_g: s.min_g,
        default_g: s.default_g,
        max_g: s.max_g,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (slotRows.length !== snapshot.slots.length) {
    return { error: 'Slots: kon template_key niet resolven voor alle slots' };
  }

  const { error: errSlots } = await supabase
    .from('meal_plan_template_slots')
    .upsert(slotRows, { onConflict: 'template_id,slot_key' });

  if (errSlots) {
    return { error: `Slots: ${errSlots.message}` };
  }

  // 3) Upsert pool items
  const poolRows = snapshot.poolItems.map((p) => ({
    diet_key: p.diet_key,
    category: p.category,
    item_key: p.item_key,
    nevo_code: p.nevo_code,
    name: p.name,
    is_active: p.is_active,
    min_g: p.min_g,
    default_g: p.default_g,
    max_g: p.max_g,
  }));
  const { error: errPool } = await supabase
    .from('meal_plan_pool_items')
    .upsert(poolRows, { onConflict: 'diet_key,category,item_key' });

  if (errPool) {
    return { error: `Pool items: ${errPool.message}` };
  }

  // 4) Upsert settings
  const settingsRows = snapshot.settings.map((s) => ({
    diet_key: s.diet_key,
    max_ingredients: s.max_ingredients,
    max_flavor_items: s.max_flavor_items,
    protein_repeat_cap_7d: s.protein_repeat_cap_7d,
    template_repeat_cap_7d: s.template_repeat_cap_7d,
    signature_retry_limit: s.signature_retry_limit,
    veg_threshold_low_g: s.veg_threshold_low_g,
    veg_threshold_mid_g: s.veg_threshold_mid_g,
    veg_threshold_high_g: s.veg_threshold_high_g,
    veg_score_low: s.veg_score_low,
    veg_score_mid: s.veg_score_mid,
    veg_score_high: s.veg_score_high,
  }));
  const { error: errSettings } = await supabase
    .from('meal_plan_generator_settings')
    .upsert(settingsRows, { onConflict: 'diet_key' });

  if (errSettings) {
    return { error: `Settings: ${errSettings.message}` };
  }

  return { data: null };
}

const toggleTemplateSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export async function toggleTemplateActiveAction(
  input: z.infer<typeof toggleTemplateSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = toggleTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Ongeldige invoer' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('meal_plan_templates')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.id)
    .select('id')
    .single();

  if (error) {
    return { error: error.message };
  }
  return { data: null };
}

const togglePoolItemSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export async function togglePoolItemActiveAction(
  input: z.infer<typeof togglePoolItemSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = togglePoolItemSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Ongeldige invoer' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('meal_plan_pool_items')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.id)
    .select('id')
    .single();

  if (error) {
    return { error: error.message };
  }
  return { data: null };
}

const NAME_PATTERN_SLOTS = ['breakfast', 'lunch', 'dinner'] as const;

const toggleNamePatternSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export async function toggleNamePatternActiveAction(
  input: z.infer<typeof toggleNamePatternSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = toggleNamePatternSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Ongeldige invoer' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('meal_plan_name_patterns')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.id)
    .select('id')
    .single();

  if (error) {
    return { error: error.message };
  }
  return { data: null };
}

const createNamePatternSchema = z.object({
  dietKey: z.string().min(1, 'diet_key is verplicht'),
  templateKey: z.string().min(1),
  slot: z.enum(NAME_PATTERN_SLOTS),
  pattern: z
    .string()
    .min(5, 'Patroon min. 5 tekens')
    .max(120, 'Patroon max. 120 tekens'),
  isActive: z.boolean().default(true),
});

export async function createNamePatternAction(
  input: z.infer<typeof createNamePatternSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = createNamePatternSchema.safeParse(input);
  if (!parsed.success) {
    const msg =
      parsed.error.errors.map((e) => e.message).join('; ') ||
      'Ongeldige invoer';
    return { error: msg };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('meal_plan_name_patterns')
    .insert({
      diet_key: parsed.data.dietKey,
      template_key: parsed.data.templateKey,
      slot: parsed.data.slot,
      pattern: parsed.data.pattern.trim(),
      is_active: parsed.data.isActive,
    })
    .select('id')
    .limit(1)
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: 'Patroon bestaat al voor dit dieet/template/slot.' };
    }
    return { error: error.message };
  }
  return { data: null };
}

const updateSettingsSchema = z
  .object({
    dietKey: z.string().min(1),
    max_ingredients: z.number().int().min(1).max(20),
    max_flavor_items: z.number().int().min(0).max(5),
    protein_repeat_cap_7d: z.number().int().min(1).max(14),
    template_repeat_cap_7d: z.number().int().min(1).max(21),
    signature_retry_limit: z.number().int().min(1).max(20),
    veg_threshold_low_g: z.number().int().min(1).max(2000),
    veg_threshold_mid_g: z.number().int().min(1).max(2000),
    veg_threshold_high_g: z.number().int().min(1).max(2000),
    veg_score_low: z.number().int().min(0).max(20),
    veg_score_mid: z.number().int().min(0).max(20),
    veg_score_high: z.number().int().min(0).max(20),
  })
  .refine(
    (d) =>
      d.veg_threshold_low_g <= d.veg_threshold_mid_g &&
      d.veg_threshold_mid_g <= d.veg_threshold_high_g,
    { message: 'Veg thresholds: low ≤ mid ≤ high' },
  )
  .refine(
    (d) =>
      d.veg_score_low <= d.veg_score_mid && d.veg_score_mid <= d.veg_score_high,
    { message: 'Veg scores: low ≤ mid ≤ high' },
  );

export async function updateGeneratorSettingsAction(
  input: z.infer<typeof updateSettingsSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = updateSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Ongeldige invoer' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('meal_plan_generator_settings')
    .upsert(
      {
        diet_key: parsed.data.dietKey,
        max_ingredients: parsed.data.max_ingredients,
        max_flavor_items: parsed.data.max_flavor_items,
        protein_repeat_cap_7d: parsed.data.protein_repeat_cap_7d,
        template_repeat_cap_7d: parsed.data.template_repeat_cap_7d,
        signature_retry_limit: parsed.data.signature_retry_limit,
        veg_threshold_low_g: parsed.data.veg_threshold_low_g,
        veg_threshold_mid_g: parsed.data.veg_threshold_mid_g,
        veg_threshold_high_g: parsed.data.veg_threshold_high_g,
        veg_score_low: parsed.data.veg_score_low,
        veg_score_mid: parsed.data.veg_score_mid,
        veg_score_high: parsed.data.veg_score_high,
      },
      { onConflict: 'diet_key' },
    )
    .select('diet_key')
    .single();

  if (error) {
    return { error: error.message };
  }
  return { data: null };
}

const POOL_CATEGORIES = ['protein', 'veg', 'fat', 'flavor'] as const;

const createPoolItemSchema = z
  .object({
    dietKey: z.string().min(1),
    category: z.enum(POOL_CATEGORIES),
    itemKey: z.string().min(1),
    name: z.string().min(1),
    nevoCode: z.string().optional(),
    isActive: z.boolean().default(true),
    minG: z.number().int().min(1).max(500).optional().nullable(),
    defaultG: z.number().int().min(1).max(500).optional().nullable(),
    maxG: z.number().int().min(1).max(500).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.category === 'flavor') {
        return (
          data.minG != null &&
          data.defaultG != null &&
          data.maxG != null &&
          data.minG <= data.defaultG &&
          data.defaultG <= data.maxG
        );
      }
      return (
        (data.minG == null || data.minG === undefined) &&
        (data.defaultG == null || data.defaultG === undefined) &&
        (data.maxG == null || data.maxG === undefined)
      );
    },
    {
      message:
        'Flavor vereist min/default/max (1–500, min≤default≤max); overige categorieën geen grams',
    },
  );

export async function createPoolItemAction(
  input: z.infer<typeof createPoolItemSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = createPoolItemSchema.safeParse(input);
  if (!parsed.success) {
    const msg =
      parsed.error.errors.map((e) => e.message).join('; ') ||
      'Ongeldige invoer';
    return { error: msg };
  }

  const d = parsed.data;
  const row: Record<string, unknown> = {
    diet_key: d.dietKey,
    category: d.category,
    item_key: d.itemKey,
    name: d.name,
    nevo_code: d.nevoCode ?? null,
    is_active: d.isActive,
  };
  if (
    d.category === 'flavor' &&
    d.minG != null &&
    d.defaultG != null &&
    d.maxG != null
  ) {
    row.min_g = d.minG;
    row.default_g = d.defaultG;
    row.max_g = d.maxG;
  } else {
    row.min_g = null;
    row.default_g = null;
    row.max_g = null;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('meal_plan_pool_items')
    .insert(row)
    .select('id')
    .limit(1)
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: 'Item met dit dieet, categorie en item_key bestaat al.' };
    }
    return { error: error.message };
  }
  return { data: null };
}

// --- Guided Pool Builder: suggest NEVO candidates and bulk create pool items (admin-only) ---

const POOL_CATEGORIES_SUGGEST = ['protein', 'veg', 'fat'] as const;

const suggestPoolCandidatesSchema = z.object({
  dietKey: z.string().min(1),
  category: z.enum(POOL_CATEGORIES_SUGGEST),
  limit: z.number().int().min(1).max(200),
});

export type SuggestPoolCandidateItem = {
  itemKey: string;
  nevoCode: string | null;
  name: string;
};

export type SuggestPoolCandidatesMeta = {
  guardrailsTermsCount: number;
  removedByGuardrailsTerms?: number;
};

export type SuggestPoolCandidatesResult = {
  candidates: SuggestPoolCandidateItem[];
  meta?: SuggestPoolCandidatesMeta;
};

export async function suggestPoolCandidatesAction(
  input: z.infer<typeof suggestPoolCandidatesSchema>,
): Promise<ActionResult<SuggestPoolCandidatesResult>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = suggestPoolCandidatesSchema.safeParse(input);
  if (!parsed.success) {
    const msg =
      parsed.error.errors.map((e) => e.message).join('; ') ||
      'Ongeldige invoer';
    return { error: msg };
  }

  const { dietKey, category, limit } = parsed.data;

  try {
    const supabase = await createClient();
    const guardrailsTerms =
      process.env.ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER === 'true'
        ? await loadHardBlockTermsForDiet(supabase, dietKey, 'nl')
        : [];
    const rawCandidates = await buildCandidatePool(dietKey, []);
    const { pool: candidates, metrics } = sanitizeCandidatePool(
      rawCandidates,
      [],
      guardrailsTerms.length > 0
        ? { extraExcludeTerms: guardrailsTerms }
        : undefined,
    );

    const categoryKey =
      category === 'protein'
        ? 'proteins'
        : category === 'veg'
          ? 'vegetables'
          : 'fats';
    const list = candidates[categoryKey] ?? [];

    function toItemKey(c: { nevoCode?: string; name: string }): string {
      const code = c.nevoCode?.trim();
      if (code) return `nevo:${code}`;
      const slug = normalizeName(c.name).replace(/\s+/g, '_') || 'unknown';
      return `name:${slug}`;
    }

    const withKeys: Array<{
      itemKey: string;
      nevoCode: string | null;
      name: string;
    }> = list.map((c) => ({
      itemKey: toItemKey(c),
      nevoCode: c.nevoCode?.trim() ?? null,
      name: c.name.trim(),
    }));

    const { data: existing, error: fetchError } = await supabase
      .from('meal_plan_pool_items')
      .select('item_key, nevo_code')
      .eq('diet_key', dietKey)
      .eq('category', category);

    if (fetchError) {
      return { error: fetchError.message };
    }

    const existingItemKeys = new Set((existing ?? []).map((r) => r.item_key));
    const existingNevoCodes = new Set(
      (existing ?? [])
        .map((r) => r.nevo_code)
        .filter((c): c is string => c != null && c !== ''),
    );

    const filtered = withKeys.filter(
      (item) =>
        !existingItemKeys.has(item.itemKey) &&
        (item.nevoCode == null || !existingNevoCodes.has(item.nevoCode)),
    );

    const sorted = [...filtered].sort((a, b) =>
      a.name.localeCompare(b.name, 'nl'),
    );
    const suggested = sorted
      .slice(0, limit)
      .map(({ itemKey, nevoCode, name }) => ({
        itemKey,
        nevoCode,
        name,
      }));

    const meta: SuggestPoolCandidatesMeta | undefined =
      guardrailsTerms.length > 0
        ? {
            guardrailsTermsCount: guardrailsTerms.length,
            removedByGuardrailsTerms: metrics.removedByGuardrailsTerms,
          }
        : undefined;

    return { data: { candidates: suggested, meta } };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

const bulkCreatePoolItemsSchema = z.object({
  dietKey: z.string().min(1),
  category: z.enum(POOL_CATEGORIES_SUGGEST),
  items: z
    .array(
      z.object({
        itemKey: z.string().min(1),
        name: z.string().min(1),
        nevoCode: z.string().optional(),
      }),
    )
    .max(50),
});

export async function bulkCreatePoolItemsAction(
  input: z.infer<typeof bulkCreatePoolItemsSchema>,
): Promise<ActionResult<{ createdCount: number }>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = bulkCreatePoolItemsSchema.safeParse(input);
  if (!parsed.success) {
    const msg =
      parsed.error.errors.map((e) => e.message).join('; ') ||
      'Ongeldige invoer';
    return { error: msg };
  }

  const { dietKey, category, items } = parsed.data;
  const supabase = await createClient();
  let createdCount = 0;

  for (const item of items) {
    const row: Record<string, unknown> = {
      diet_key: dietKey,
      category,
      item_key: item.itemKey,
      name: item.name,
      nevo_code: item.nevoCode?.trim() ?? null,
      is_active: true,
      min_g: null,
      default_g: null,
      max_g: null,
    };
    const { error } = await supabase
      .from('meal_plan_pool_items')
      .insert(row)
      .select('id')
      .limit(1)
      .single();

    if (!error) {
      createdCount += 1;
    }
    // 23505 = unique violation; ignore (DO NOTHING)
  }

  return { data: { createdCount } };
}

const updatePoolItemGramsSchema = z
  .object({
    id: z.string().uuid(),
    minG: z.number().int().min(1).max(500),
    defaultG: z.number().int().min(1).max(500),
    maxG: z.number().int().min(1).max(500),
  })
  .refine((r) => r.minG <= r.defaultG && r.defaultG <= r.maxG, {
    message: 'min ≤ default ≤ max',
  });

export async function updatePoolItemGramsAction(
  input: z.infer<typeof updatePoolItemGramsSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = updatePoolItemGramsSchema.safeParse(input);
  if (!parsed.success) {
    const msg =
      parsed.error.errors.map((e) => e.message).join('; ') ||
      'Ongeldige invoer';
    return { error: msg };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('meal_plan_pool_items')
    .update({
      min_g: parsed.data.minG,
      default_g: parsed.data.defaultG,
      max_g: parsed.data.maxG,
    })
    .eq('id', parsed.data.id)
    .select('id')
    .single();

  if (error) {
    return { error: error.message };
  }
  return { data: null };
}

const SLOT_KEYS = ['protein', 'veg1', 'veg2', 'fat'] as const;

const slotRowSchema = z
  .object({
    slotKey: z.enum(SLOT_KEYS),
    minG: z.number().int().min(1).max(2000),
    defaultG: z.number().int().min(1).max(2000),
    maxG: z.number().int().min(1).max(2000),
  })
  .refine((r) => r.minG <= r.defaultG && r.defaultG <= r.maxG, {
    message: 'min ≤ default ≤ max',
  });

const upsertTemplateSlotsSchema = z.object({
  templateId: z.string().uuid(),
  slots: z.array(slotRowSchema).length(4),
});

export async function upsertTemplateSlotsAction(
  input: z.infer<typeof upsertTemplateSlotsSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = upsertTemplateSlotsSchema.safeParse(input);
  if (!parsed.success) {
    const msg =
      parsed.error.errors.map((e) => e.message).join('; ') ||
      'Ongeldige invoer';
    return { error: msg };
  }

  const supabase = await createClient();
  const rows = parsed.data.slots.map((s) => ({
    template_id: parsed.data.templateId,
    slot_key: s.slotKey,
    min_g: s.minG,
    default_g: s.defaultG,
    max_g: s.maxG,
  }));

  const { error } = await supabase
    .from('meal_plan_template_slots')
    .upsert(rows, { onConflict: 'template_id,slot_key' })
    .select('template_id')
    .limit(1);

  if (error) {
    return { error: error.message };
  }
  return { data: null };
}

// --- Preview (template-only, read-only, no DB writes) ---

const previewInputSchema = z.object({
  dietKey: z.string().min(1),
  days: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(14)]),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seed: z.number().int().min(0).max(1000).optional(),
});

export type PreviewMealPlanResult =
  | {
      ok: true;
      preview: MealPlanResponse;
      therapeuticTargets: TherapeuticTargetsSnapshot | null;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      details?: GuardrailsViolationDetails;
    };

export async function previewMealPlanWithCurrentConfigAction(
  input: z.infer<typeof previewInputSchema>,
): Promise<PreviewMealPlanResult> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      ok: false,
      error: 'Geen toegang: alleen admins',
      code: 'FORBIDDEN',
    };
  }

  const parsed = previewInputSchema.safeParse(input);
  if (!parsed.success) {
    const msg =
      parsed.error.errors.map((e) => e.message).join('; ') ||
      'Ongeldige invoer';
    return { ok: false, error: msg };
  }

  if (process.env.USE_TEMPLATE_MEAL_GENERATOR !== 'true') {
    return {
      ok: false,
      error:
        'Preview is alleen beschikbaar wanneer de template-generator is ingeschakeld (USE_TEMPLATE_MEAL_GENERATOR=true).',
      code: 'CONFIG',
    };
  }

  const { dietKey, days, dateFrom, seed } = parsed.data;

  try {
    const supabase = await createClient();
    const config = await loadMealPlanGeneratorConfig(supabase, dietKey);

    const rawCandidates = await buildCandidatePool(dietKey, []);
    const { pool: candidates, metrics: poolMetrics } = sanitizeCandidatePool(
      rawCandidates,
      [],
    );

    const templatePools = mergePoolItemsWithCandidatePool(
      config.poolItems,
      candidates,
    );

    const endDate = new Date(dateFrom);
    endDate.setDate(endDate.getDate() + days - 1);
    const dateRangeEnd = endDate.toISOString().split('T')[0]!;

    const request: MealPlanRequest = {
      dateRange: { start: dateFrom, end: dateRangeEnd },
      slots: ['breakfast', 'lunch', 'dinner'],
      profile: {
        dietKey: dietKey as MealPlanRequest['profile']['dietKey'],
        allergies: [],
        dislikes: [],
        calorieTarget: {},
        prepPreferences: {},
      },
    };

    let result = await generateTemplatePlan(
      request,
      config,
      templatePools,
      seed ?? 0,
    );
    let plan = result.plan;
    let attempts = 1;

    const enforceVNext =
      process.env.ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER === 'true';
    if (enforceVNext) {
      const guardResult = await enforceMealPlannerGuardrails(
        plan,
        dietKey,
        'nl',
      );
      if (!guardResult.ok) {
        const retryResult = await generateTemplatePlan(
          request,
          config,
          templatePools,
          (seed ?? 0) + 1,
        );
        plan = retryResult.plan;
        result = retryResult;
        attempts = 2;
        const retryGuard = await enforceMealPlannerGuardrails(
          plan,
          dietKey,
          'nl',
        );
        if (!retryGuard.ok) {
          return {
            ok: false,
            error: retryGuard.message,
            code: 'GUARDRAILS_VIOLATION',
            details: retryGuard.details,
          };
        }
      }
    }

    const sanity = validateMealPlanSanity(plan);
    if (!sanity.ok) {
      throw new AppError(
        'MEAL_PLAN_SANITY_FAILED',
        'Preview voldoet niet aan kwaliteitscontrole.',
        {
          issues: sanity.issues,
        },
      );
    }

    const meta = (plan.metadata ?? {}) as Record<string, unknown>;
    const generator: GeneratorMeta = {
      mode: 'template',
      attempts,
      templateInfo: result.templateInfo,
      poolMetrics,
      sanity: { ok: sanity.ok, issues: sanity.issues },
    };
    meta.generator = generator;
    plan.metadata = meta as MealPlanResponse['metadata'];

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const therapeuticTargets = user
      ? await buildTherapeuticTargetsSnapshot(supabase, user.id, 'nl').catch(
          () => undefined,
        )
      : undefined;

    return {
      ok: true,
      preview: plan,
      therapeuticTargets: therapeuticTargets ?? null,
    };
  } catch (e) {
    if (e instanceof AppError) {
      return {
        ok: false,
        error: e.message,
        code: e.code,
        ...(e.code === 'GUARDRAILS_VIOLATION' &&
          e.guardrailsDetails && { details: e.guardrailsDetails }),
      };
    }
    if (e instanceof InsufficientAllowedIngredientsError) {
      return {
        ok: false,
        error: e.message,
        code: 'INSUFFICIENT_ALLOWED_INGREDIENTS',
      };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// --- Compare previews (snapshot A vs B, same seed; admin-only, no DB writes) ---

export type PreviewDiff = {
  mealsChanged: number;
  ingredientDeltaTotal: number;
  repeatsForcedDelta: number;
  byDay: Array<{
    date: string;
    rows: Array<{
      slot: string;
      aName: string;
      bName: string;
      aIngredients: number;
      bIngredients: number;
    }>;
  }>;
};

export type ComparePreviewsResult =
  | {
      ok: true;
      a: MealPlanResponse;
      b: MealPlanResponse;
      diff: PreviewDiff;
      therapeuticTargets: TherapeuticTargetsSnapshot | null;
    }
  | { ok: false; error: string };

const compareInputSchema = z.object({
  snapshotA: z.unknown(),
  snapshotB: z.unknown(),
  days: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(14)]),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seed: z.number().int().min(0).max(1000),
});

export async function compareMealPlanPreviewsAction(
  input: z.infer<typeof compareInputSchema>,
): Promise<ComparePreviewsResult> {
  const admin = await isAdmin();
  if (!admin) {
    return { ok: false, error: 'Geen toegang: alleen admins' };
  }

  if (process.env.USE_TEMPLATE_MEAL_GENERATOR !== 'true') {
    return {
      ok: false,
      error:
        'Vergelijken is alleen beschikbaar wanneer de template-generator is ingeschakeld (USE_TEMPLATE_MEAL_GENERATOR=true).',
    };
  }

  const parsed = compareInputSchema.safeParse(input);
  if (!parsed.success) {
    const msg =
      parsed.error.errors.map((e) => e.message).join('; ') ||
      'Ongeldige invoer';
    return { ok: false, error: msg };
  }

  const aParsed = importSnapshotSchema.safeParse(parsed.data.snapshotA);
  const bParsed = importSnapshotSchema.safeParse(parsed.data.snapshotB);
  if (!aParsed.success) {
    return {
      ok: false,
      error: `Snapshot A: ${aParsed.error.errors.map((e) => e.message).join('; ')}`,
    };
  }
  if (!bParsed.success) {
    return {
      ok: false,
      error: `Snapshot B: ${bParsed.error.errors.map((e) => e.message).join('; ')}`,
    };
  }

  const { days, dateFrom, seed } = parsed.data;
  const dietKey = aParsed.data.dietKey?.trim() || 'default';
  if ((bParsed.data.dietKey?.trim() || 'default') !== dietKey) {
    return {
      ok: false,
      error: 'Beide snapshots moeten dezelfde dietKey hebben.',
    };
  }

  const endDate = new Date(dateFrom);
  endDate.setDate(endDate.getDate() + days - 1);
  const dateRangeEnd = endDate.toISOString().split('T')[0]!;
  const request: MealPlanRequest = {
    dateRange: { start: dateFrom, end: dateRangeEnd },
    slots: ['breakfast', 'lunch', 'dinner'],
    profile: {
      dietKey: dietKey as MealPlanRequest['profile']['dietKey'],
      allergies: [],
      dislikes: [],
      calorieTarget: {},
      prepPreferences: {},
    },
  };

  const rawCandidates = await buildCandidatePool(dietKey, []);
  const { pool: candidates } = sanitizeCandidatePool(rawCandidates, []);

  const enforceVNext =
    process.env.ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER === 'true';
  async function runOne(
    snapshot: z.infer<typeof importSnapshotSchema>,
  ): Promise<MealPlanResponse> {
    const config = buildConfigFromSnapshot(snapshot);
    const templatePools = mergePoolItemsWithCandidatePool(
      config.poolItems,
      candidates,
    );
    let result = await generateTemplatePlan(
      request,
      config,
      templatePools,
      seed,
    );
    let plan = result.plan;
    let attempts = 1;
    if (enforceVNext) {
      const guardResult = await enforceMealPlannerGuardrails(
        plan,
        dietKey,
        'nl',
      );
      if (!guardResult.ok) {
        const retryResult = await generateTemplatePlan(
          request,
          config,
          templatePools,
          seed + 1,
        );
        plan = retryResult.plan;
        result = retryResult;
        attempts = 2;
        const retryGuard = await enforceMealPlannerGuardrails(
          plan,
          dietKey,
          'nl',
        );
        if (!retryGuard.ok)
          throw new AppError('GUARDRAILS_VIOLATION', retryGuard.message, {
            guardrailsDetails: retryGuard.details,
          });
      }
    }
    const sanity = validateMealPlanSanity(plan);
    if (!sanity.ok) {
      throw new AppError(
        'MEAL_PLAN_SANITY_FAILED',
        'Plan voldoet niet aan sanity.',
        { issues: sanity.issues },
      );
    }
    const meta = (plan.metadata ?? {}) as Record<string, unknown>;
    meta.generator = {
      mode: 'template' as const,
      attempts,
      templateInfo: result.templateInfo,
      sanity: { ok: sanity.ok, issues: sanity.issues },
    };
    plan.metadata = meta as MealPlanResponse['metadata'];
    return plan;
  }

  try {
    const [planA, planB] = await Promise.all([
      runOne(aParsed.data),
      runOne(bParsed.data),
    ]);
    const byDate = new Map<
      string,
      {
        a: Map<string, { name: string; count: number }>;
        b: Map<string, { name: string; count: number }>;
      }
    >();
    const allDates = new Set<string>();
    for (const d of planA.days) {
      allDates.add(d.date);
      const aBySlot = new Map<string, { name: string; count: number }>();
      for (const m of d.meals) {
        const count = m.ingredientRefs?.length ?? m.ingredients?.length ?? 0;
        aBySlot.set(m.slot, { name: m.name, count });
      }
      byDate.set(d.date, { a: aBySlot, b: new Map() });
    }
    for (const d of planB.days) {
      allDates.add(d.date);
      const entry = byDate.get(d.date);
      if (entry) {
        for (const m of d.meals) {
          const count = m.ingredientRefs?.length ?? m.ingredients?.length ?? 0;
          entry.b.set(m.slot, { name: m.name, count });
        }
      } else {
        const bBySlot = new Map<string, { name: string; count: number }>();
        for (const m of d.meals) {
          const count = m.ingredientRefs?.length ?? m.ingredients?.length ?? 0;
          bBySlot.set(m.slot, { name: m.name, count });
        }
        byDate.set(d.date, { a: new Map(), b: bBySlot });
      }
    }

    const slotsOrder = ['breakfast', 'lunch', 'dinner'];
    let mealsChanged = 0;
    let ingredientDeltaTotal = 0;
    const byDay: PreviewDiff['byDay'] = [];
    for (const date of [...allDates].sort()) {
      const entry = byDate.get(date)!;
      const rows: PreviewDiff['byDay'][0]['rows'] = [];
      for (const slot of slotsOrder) {
        const aCell = entry.a.get(slot) ?? { name: '', count: 0 };
        const bCell = entry.b.get(slot) ?? { name: '', count: 0 };
        if (aCell.name !== bCell.name) mealsChanged += 1;
        ingredientDeltaTotal += bCell.count - aCell.count;
        rows.push({
          slot,
          aName: aCell.name,
          bName: bCell.name,
          aIngredients: aCell.count,
          bIngredients: bCell.count,
        });
      }
      byDay.push({ date, rows });
    }

    const repeatsA =
      (
        planA.metadata as {
          generator?: {
            templateInfo?: { quality?: { repeatsForced?: number } };
          };
        }
      )?.generator?.templateInfo?.quality?.repeatsForced ?? 0;
    const repeatsB =
      (
        planB.metadata as {
          generator?: {
            templateInfo?: { quality?: { repeatsForced?: number } };
          };
        }
      )?.generator?.templateInfo?.quality?.repeatsForced ?? 0;

    const diff: PreviewDiff = {
      mealsChanged,
      ingredientDeltaTotal,
      repeatsForcedDelta: repeatsB - repeatsA,
      byDay,
    };
    const supabaseCompare = await createClient();
    const {
      data: { user: compareUser },
    } = await supabaseCompare.auth.getUser();
    const therapeuticTargetsCompare = compareUser
      ? await buildTherapeuticTargetsSnapshot(
          supabaseCompare,
          compareUser.id,
          'nl',
        ).catch(() => undefined)
      : undefined;
    return {
      ok: true,
      a: planA,
      b: planB,
      diff,
      therapeuticTargets: therapeuticTargetsCompare ?? null,
    };
  } catch (e) {
    if (e instanceof AppError) {
      return { ok: false, error: e.message };
    }
    if (e instanceof InsufficientAllowedIngredientsError) {
      return { ok: false, error: e.message };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
