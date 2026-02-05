/**
 * Loads meal plan generator config from DB (templates + slots, pool items, settings).
 * RLS: runs in user context; SELECT only required columns.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/src/lib/errors/app-error';
import type {
  CandidatePool,
  NevoFoodCandidate,
} from '@/src/lib/agents/meal-planner/mealPlannerAgent.tools';
import type {
  RecipeTemplate,
  TemplateSlot,
  TemplateIngredientPools,
  PoolIngredient,
  FlavorPoolItem,
} from '@/src/lib/meal-plans/templateFallbackGenerator';
import { normalizeName } from '@/src/lib/meal-plans/candidatePoolSanitizer';

const REQUIRED_SLOTS: TemplateSlot[] = ['protein', 'veg1', 'veg2', 'fat'];

/** One pool item from DB (category protein/veg/fat/flavor). */
export type PoolItemFromDb = {
  diet_key: string;
  category: 'protein' | 'veg' | 'fat' | 'flavor';
  item_key: string;
  nevo_code: string | null;
  name: string;
  default_g: number | null;
  min_g: number | null;
  max_g: number | null;
};

/** Generator settings from DB (per diet_key, fallback default). */
export type GeneratorSettingsFromDb = {
  max_ingredients: number;
  max_flavor_items: number;
  protein_repeat_cap_7d: number;
  template_repeat_cap_7d: number;
  signature_retry_limit: number;
};

/** Name pattern row (diet_key, template_key, slot, pattern). */
export type NamePatternRow = {
  diet_key: string;
  template_key: string;
  slot: string;
  pattern: string;
};

/** Loaded config: templates (with slots), pool items by category, settings, name patterns. */
export type MealPlanGeneratorConfig = {
  templates: RecipeTemplate[];
  poolItems: {
    protein: PoolItemFromDb[];
    veg: PoolItemFromDb[];
    fat: PoolItemFromDb[];
    flavor: PoolItemFromDb[];
  };
  settings: GeneratorSettingsFromDb;
  /** Name patterns for meal naming (diet + default merged). */
  namePatterns: NamePatternRow[];
};

const DEFAULT_SETTINGS: GeneratorSettingsFromDb = {
  max_ingredients: 10,
  max_flavor_items: 2,
  protein_repeat_cap_7d: 2,
  template_repeat_cap_7d: 3,
  signature_retry_limit: 8,
};

/**
 * Load generator config for a diet key. Fallbacks: pool/settings to 'default' when missing.
 * Throws AppError MEAL_PLAN_CONFIG_INVALID if no active templates or required slots missing.
 */
export async function loadMealPlanGeneratorConfig(
  supabase: SupabaseClient,
  dietKey: string,
): Promise<MealPlanGeneratorConfig> {
  const effectiveDietKey = dietKey?.trim() || 'default';

  // 1) Active templates: id, template_key, name_nl, max_steps
  const { data: templatesRows, error: templatesError } = await supabase
    .from('meal_plan_templates')
    .select('id, template_key, name_nl, max_steps')
    .eq('is_active', true);

  if (templatesError) {
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Kon generatorconfiguratie niet laden.',
      { cause: templatesError },
    );
  }
  if (!templatesRows?.length) {
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Geen actieve recepttemplates gevonden. Voeg templates toe in de configuratie.',
    );
  }

  const templateIds = templatesRows.map((r) => r.id);

  // 2) Slots for those templates: template_id, slot_key, default_g, min_g, max_g
  const { data: slotsRows, error: slotsError } = await supabase
    .from('meal_plan_template_slots')
    .select('template_id, slot_key, default_g, min_g, max_g')
    .in('template_id', templateIds);

  if (slotsError) {
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Kon templateslots niet laden.',
      { cause: slotsError },
    );
  }

  const slotsByTemplateId = new Map<string, typeof slotsRows>();
  for (const row of slotsRows ?? []) {
    const list = slotsByTemplateId.get(row.template_id) ?? [];
    list.push(row);
    slotsByTemplateId.set(row.template_id, list);
  }

  const templates: RecipeTemplate[] = [];
  for (const t of templatesRows) {
    const id = t.id as string;
    const key = t.template_key as string;
    const slotsRaw = slotsByTemplateId.get(id) ?? [];
    const slotMap = new Map<string, (typeof slotsRaw)[0]>();
    for (const s of slotsRaw) {
      slotMap.set(s.slot_key as string, s);
    }
    const slots: RecipeTemplate['slots'] = [];
    for (const slotKey of REQUIRED_SLOTS) {
      const s = slotMap.get(slotKey);
      if (!s) {
        throw new AppError(
          'MEAL_PLAN_CONFIG_INVALID',
          `Template "${key}" mist verplichte slot: ${slotKey}.`,
        );
      }
      slots.push({
        slot: slotKey,
        defaultG: Number(s.default_g),
        minG: Number(s.min_g),
        maxG: Number(s.max_g),
      });
    }
    templates.push({
      id: key,
      nameNl: (t.name_nl as string) ?? key,
      slots,
      stepCount: Number(t.max_steps) || 6,
    });
  }

  // 3) Pool items: single query diet_key in (effectiveDietKey, 'default'); union with diet overrides default by item_key
  const { data: poolRows, error: poolError } = await supabase
    .from('meal_plan_pool_items')
    .select(
      'diet_key, category, item_key, nevo_code, name, min_g, default_g, max_g',
    )
    .eq('is_active', true)
    .in('diet_key', [effectiveDietKey, 'default']);

  if (poolError) {
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Kon pool items niet laden.',
      { cause: poolError },
    );
  }

  const mapPoolRow = (r: (typeof poolRows)[0]): PoolItemFromDb => ({
    diet_key: r.diet_key as string,
    category: r.category as PoolItemFromDb['category'],
    item_key: r.item_key as string,
    nevo_code: r.nevo_code as string | null,
    name: (r.name as string) ?? r.item_key,
    default_g: r.default_g != null ? Number(r.default_g) : null,
    min_g: r.min_g != null ? Number(r.min_g) : null,
    max_g: r.max_g != null ? Number(r.max_g) : null,
  });

  const poolByCategory = {
    protein: [] as PoolItemFromDb[],
    veg: [] as PoolItemFromDb[],
    fat: [] as PoolItemFromDb[],
    flavor: [] as PoolItemFromDb[],
  };
  const categories = ['protein', 'veg', 'fat', 'flavor'] as const;
  for (const cat of categories) {
    const forCat = (poolRows ?? []).filter((r) => r.category === cat);
    const fromDefault = forCat.filter((r) => r.diet_key === 'default');
    const fromDiet = forCat.filter((r) => r.diet_key === effectiveDietKey);
    const byItemKey = new Map<string, PoolItemFromDb>();
    for (const r of fromDefault)
      byItemKey.set(r.item_key as string, mapPoolRow(r));
    for (const r of fromDiet)
      byItemKey.set(r.item_key as string, mapPoolRow(r));
    poolByCategory[cat] = [...byItemKey.values()];
  }

  if (
    poolByCategory.protein.length === 0 ||
    poolByCategory.veg.length === 0 ||
    poolByCategory.fat.length === 0
  ) {
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Pool items ontbreken voor een verplichte categorie (eiwit, groente of vet). Configureer pools in de generatorconfiguratie.',
    );
  }

  // 4) Settings: single query diet_key in (effectiveDietKey, 'default'); prefer diet then default then code defaults
  const { data: settingsRows, error: settingsError } = await supabase
    .from('meal_plan_generator_settings')
    .select(
      'diet_key, max_ingredients, max_flavor_items, protein_repeat_cap_7d, template_repeat_cap_7d, signature_retry_limit',
    )
    .in('diet_key', [effectiveDietKey, 'default']);

  if (settingsError) {
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Kon generatorinstellingen niet laden.',
      { cause: settingsError },
    );
  }

  const dietSetting = (settingsRows ?? []).find(
    (r) => r.diet_key === effectiveDietKey,
  );
  const defaultSetting = (settingsRows ?? []).find(
    (r) => r.diet_key === 'default',
  );
  const row = dietSetting ?? defaultSetting;
  const settings: GeneratorSettingsFromDb = row
    ? {
        max_ingredients:
          Number(row.max_ingredients) ?? DEFAULT_SETTINGS.max_ingredients,
        max_flavor_items:
          Number(row.max_flavor_items) ?? DEFAULT_SETTINGS.max_flavor_items,
        protein_repeat_cap_7d:
          Number(row.protein_repeat_cap_7d) ??
          DEFAULT_SETTINGS.protein_repeat_cap_7d,
        template_repeat_cap_7d:
          Number(row.template_repeat_cap_7d) ??
          DEFAULT_SETTINGS.template_repeat_cap_7d,
        signature_retry_limit:
          Number(row.signature_retry_limit) ??
          DEFAULT_SETTINGS.signature_retry_limit,
      }
    : { ...DEFAULT_SETTINGS };

  // 5) Name patterns: diet_key in (effectiveDietKey, 'default'), is_active; merge additive
  const { data: patternRows, error: patternsError } = await supabase
    .from('meal_plan_name_patterns')
    .select('diet_key, template_key, slot, pattern')
    .eq('is_active', true)
    .in('diet_key', [effectiveDietKey, 'default']);

  if (patternsError) {
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Kon naampatronen niet laden.',
      { cause: patternsError },
    );
  }

  const fromDefaultPatterns = (patternRows ?? []).filter(
    (r) => r.diet_key === 'default',
  );
  const fromDietPatterns = (patternRows ?? []).filter(
    (r) => r.diet_key === effectiveDietKey,
  );
  const patternKey = (r: {
    template_key: string;
    slot: string;
    pattern: string;
  }) => `${r.template_key}:${r.slot}:${r.pattern}`;
  const seenPatterns = new Set<string>();
  const namePatterns: NamePatternRow[] = [];
  for (const r of fromDefaultPatterns) {
    const key = patternKey(r);
    if (seenPatterns.has(key)) continue;
    seenPatterns.add(key);
    namePatterns.push({
      diet_key: r.diet_key as string,
      template_key: r.template_key as string,
      slot: r.slot as string,
      pattern: r.pattern as string,
    });
  }
  for (const r of fromDietPatterns) {
    const key = patternKey(r);
    if (seenPatterns.has(key)) continue;
    seenPatterns.add(key);
    namePatterns.push({
      diet_key: r.diet_key as string,
      template_key: r.template_key as string,
      slot: r.slot as string,
      pattern: r.pattern as string,
    });
  }

  return {
    templates,
    poolItems: poolByCategory,
    settings,
    namePatterns,
  };
}

export function mergePoolItemsWithCandidatePool(
  poolItems: MealPlanGeneratorConfig['poolItems'],
  candidatePool: CandidatePool,
): TemplateIngredientPools {
  const toPool = (list: NevoFoodCandidate[]): PoolIngredient[] =>
    list.map((c) => ({ nevoCode: c.nevoCode, name: c.name }));

  const vegetables = candidatePool.vegetables ?? [];
  const fruits = candidatePool.fruits ?? [];
  const vegFromNevo = [...toPool(vegetables), ...toPool(fruits)];

  const protein =
    poolItems.protein.length > 0
      ? poolItems.protein.map((r) => ({
          nevoCode: r.nevo_code ?? r.item_key,
          name: r.name,
        }))
      : toPool(candidatePool.proteins ?? []);
  const veg =
    poolItems.veg.length > 0
      ? poolItems.veg.map((r) => ({
          nevoCode: r.nevo_code ?? r.item_key,
          name: r.name,
        }))
      : vegFromNevo.length > 0
        ? vegFromNevo
        : toPool(vegetables);
  const fat =
    poolItems.fat.length > 0
      ? poolItems.fat.map((r) => ({
          nevoCode: r.nevo_code ?? r.item_key,
          name: r.name,
        }))
      : toPool(candidatePool.fats ?? []);

  const flavor: FlavorPoolItem[] = poolItems.flavor.map((r) => ({
    nevoCode: r.nevo_code ?? r.item_key,
    name: r.name,
    defaultG: r.default_g ?? 2,
    minG: r.min_g ?? 1,
    maxG: r.max_g ?? 5,
  }));

  return { protein, veg, fat, flavor };
}

/**
 * Filter template pools by allergy/dislike/exclude terms so ingredients whose
 * name contains any term are removed. Ensures DB pool items are excluded when
 * user has e.g. Rijst allergy (rice drink would otherwise still appear from pool).
 */
export function filterTemplatePoolsByExcludeTerms(
  pools: TemplateIngredientPools,
  excludeTerms: string[],
): TemplateIngredientPools {
  if (!excludeTerms?.length) return pools;
  const normalizedTerms = excludeTerms
    .map((t) => normalizeName(t))
    .filter(Boolean);
  if (normalizedTerms.length === 0) return pools;

  const keep = (item: PoolIngredient): boolean => {
    const nameNorm = normalizeName(item.name);
    return !normalizedTerms.some((term) => nameNorm.includes(term));
  };

  return {
    protein: pools.protein.filter(keep),
    veg: pools.veg.filter(keep),
    fat: pools.fat.filter(keep),
    flavor: pools.flavor.filter(keep),
  };
}
