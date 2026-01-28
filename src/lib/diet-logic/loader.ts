/**
 * Diet Logic (Dieetregels) - Loader
 *
 * Laadt Dieetregels uit diet_category_constraints + ingredient_categories.
 * Bij isInflamed wordt de nightshade-categorie als extra DROP toegevoegd.
 */

import type { DietLogicConstraint, DietLogicRuleset } from "./types";
import type { DietLogic } from "./types";

export type LoadDietLogicOptions = {
  /** Bij true: nightshade-categorie wordt aan DROP toegevoegd (Dieetregels) */
  isInflamed?: boolean;
};

/** Category codes die bij isInflamed als DROP worden toegevoegd */
const NIGHTSHADE_CATEGORY_CODES = ["wahls_nightshades", "nightshades"];

type DbConstraint = {
  id: string;
  diet_type_id: string;
  diet_logic?: string | null;
  constraint_type?: string;
  strictness: "hard" | "soft";
  min_per_day: number | null;
  min_per_week: number | null;
  max_per_day?: number | null;
  max_per_week?: number | null;
  is_active: boolean;
  /** 1 = hoogst, 65500 = laagst. Bij conflict wint laagste waarde. */
  priority?: number | null;
  rule_priority?: number | null;
  category: {
    id: string;
    code: string;
    name_nl: string;
    items: Array<{ term: string; term_nl?: string; synonyms?: string[]; is_active?: boolean }>;
  };
};

function mapDbToConstraint(row: DbConstraint): DietLogicConstraint | null {
  const logic = (row.diet_logic ?? (row.constraint_type === "required" ? "force" : "drop")) as DietLogic;
  if (!["drop", "force", "limit", "pass"].includes(logic)) return null;
  const items = row.category?.items ?? [];
  const terms = new Set<string>();
  for (const it of items) {
    if (it.is_active === false) continue;
    const t = (it.term ?? "").trim().toLowerCase();
    if (t) terms.add(t);
    for (const s of it.synonyms ?? []) {
      const x = String(s).trim().toLowerCase();
      if (x) terms.add(x);
    }
  }
  const priority = row.rule_priority ?? row.priority ?? 50;
  return {
    id: row.id,
    dietTypeId: row.diet_type_id,
    dietLogic: logic,
    categoryCode: row.category?.code ?? "",
    categoryNameNl: row.category?.name_nl ?? "",
    terms: Array.from(terms),
    minPerDay: row.min_per_day ?? null,
    minPerWeek: row.min_per_week ?? null,
    maxPerDay: row.max_per_day ?? null,
    maxPerWeek: row.max_per_week ?? null,
    strictness: row.strictness ?? "hard",
    isActive: row.is_active ?? true,
    priority,
  };
}

/**
 * Laadt Dieetregels (Diet Logic) voor een diet_type.
 * Groepeert constraints op diet_logic (drop/force/limit/pass).
 */
export async function loadDietLogicRuleset(
  dietTypeId: string,
  options?: LoadDietLogicOptions
): Promise<DietLogicRuleset> {
  const { createClient } = await import("@/src/lib/supabase/server");
  const supabase = await createClient();

  const selectCols = `
    id,
    diet_type_id,
    diet_logic,
    constraint_type,
    strictness,
    min_per_day,
    min_per_week,
    max_per_day,
    max_per_week,
    is_active,
    is_paused,
    priority,
    rule_priority,
    category:ingredient_categories(
      id,
      code,
      name_nl,
      items:ingredient_category_items(term, term_nl, synonyms, is_active)
    )
  `;

  // Alleen actieve regels. Prioriteit: 1 = hoogst, 65500 = laagst → ASC (laagste waarde eerst).
  const { data: rows, error } = await supabase
    .from("diet_category_constraints")
    .select(selectCols)
    .eq("diet_type_id", dietTypeId)
    .eq("is_active", true)
    .order("rule_priority", { ascending: true })
    .order("priority", { ascending: true });

  if (error) {
    return {
      dietTypeId,
      constraints: [],
      byLogic: { drop: [], force: [], limit: [], pass: [] },
    };
  }

  const constraints: DietLogicConstraint[] = [];
  for (const row of (rows ?? []) as DbConstraint[]) {
    if ((row as { is_paused?: boolean }).is_paused === true) continue; // Gepauzeerde regels niet meenemen
    const c = mapDbToConstraint(row);
    if (c && c.terms.length > 0) constraints.push(c);
  }

  // Optioneel: nightshade als extra DROP bij isInflamed
  if (options?.isInflamed) {
    const nightshadeConstraints = await loadNightshadeDropConstraints(supabase, dietTypeId);
    for (const c of nightshadeConstraints) {
      if (!constraints.some((x) => x.categoryCode === c.categoryCode)) {
        constraints.push(c);
      }
    }
  }

  // Per logica-type sorteren op prioriteit (1=hoogst); voor conflictresolutie wint laagste waarde.
  const byPriority = (a: DietLogicConstraint, b: DietLogicConstraint) => a.priority - b.priority;
  const byLogic: DietLogicRuleset["byLogic"] = {
    drop: constraints.filter((c) => c.dietLogic === "drop").sort(byPriority),
    force: constraints.filter((c) => c.dietLogic === "force").sort(byPriority),
    limit: constraints.filter((c) => c.dietLogic === "limit").sort(byPriority),
    pass: constraints.filter((c) => c.dietLogic === "pass").sort(byPriority),
  };

  return {
    dietTypeId,
    constraints,
    byLogic,
  };
}

/** Haalt nightshade-categorie(s) op en retourneert ze als DROP-constraints */
async function loadNightshadeDropConstraints(
  supabase: Awaited<ReturnType<typeof import("@/src/lib/supabase/server")["createClient"]>>,
  dietTypeId: string
): Promise<DietLogicConstraint[]> {
  const { data: cats } = await supabase
    .from("ingredient_categories")
    .select(
      `
      id,
      code,
      name_nl,
      items:ingredient_category_items(term, term_nl, synonyms, is_active)
    `
    )
    .in("code", NIGHTSHADE_CATEGORY_CODES)
    .eq("is_active", true);

  const out: DietLogicConstraint[] = [];
  for (const cat of cats ?? []) {
    const items = (cat as { items?: Array<{ term: string; synonyms?: string[]; is_active?: boolean }> }).items ?? [];
    const terms = new Set<string>();
    for (const it of items) {
      if (it.is_active === false) continue;
      const t = (it.term ?? "").trim().toLowerCase();
      if (t) terms.add(t);
      for (const s of it.synonyms ?? []) {
        const x = String(s).trim().toLowerCase();
        if (x) terms.add(x);
      }
    }
    if (terms.size === 0) continue;
    out.push({
      id: `synthetic:nightshade:${(cat as { id: string }).id}`,
      dietTypeId,
      dietLogic: "drop",
      categoryCode: (cat as { code: string }).code,
      categoryNameNl: ((cat as { name_nl: string }).name_nl ?? "Nachtschades") + " (ontstekingsgevoelig)",
      terms: Array.from(terms),
      minPerDay: null,
      minPerWeek: null,
      maxPerDay: null,
      maxPerWeek: null,
      strictness: "hard",
      isActive: true,
      priority: 50,
    });
  }
  return out;
}

/**
 * Laadt Dieetregels (Diet Logic) voor de actieve user-diet-profiel.
 * Gebruikt diet_type_id en is_inflamed uit user_diet_profiles.
 */
export async function loadDietLogicRulesetForUser(userId: string): Promise<DietLogicRuleset | null> {
  const { createClient } = await import("@/src/lib/supabase/server");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("user_diet_profiles")
    .select("diet_type_id, is_inflamed")
    .eq("user_id", userId)
    .or("ends_on.is.null,ends_on.gte." + new Date().toISOString().slice(0, 10))
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();

  const dietTypeId = profile?.diet_type_id ?? null;
  if (!dietTypeId) return null;

  const isInflamed = (profile as { is_inflamed?: boolean } | null)?.is_inflamed ?? false;
  return loadDietLogicRuleset(dietTypeId, { isInflamed });
}
