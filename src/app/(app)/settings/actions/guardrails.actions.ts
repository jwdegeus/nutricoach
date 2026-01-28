'use server';

import { isAdmin } from '@/src/lib/auth/roles';
import type { ActionResult } from '@/src/lib/types';
import { loadGuardrailsRuleset } from '@/src/lib/guardrails-vnext';
import type {
  GuardrailsRuleset,
  GuardRule,
} from '@/src/lib/guardrails-vnext/types';
import { createClient } from '@/src/lib/supabase/server';

/**
 * View model for Guard Rails vNext ruleset (read-only)
 */
export type GuardRailsRulesetViewModel = {
  rulesetVersion: number;
  contentHash: string;
  provenance: {
    sources: Array<{
      kind: 'db' | 'overlay' | 'fallback';
      ref: string;
      loadedAt: string;
      details?: Record<string, unknown>;
    }>;
    counts: Record<string, number>;
    errors?: string[];
  };
  rules: Array<{
    id: string;
    action: 'allow' | 'block';
    strictness: 'hard' | 'soft';
    priority: number;
    target: 'category' | 'ingredient' | 'step' | 'metadata'; // "category" for constraints, actual target for recipe rules
    matchMode: 'exact' | 'word_boundary' | 'substring' | 'canonical_id';
    matchValue: string;
    reasonCode: string;
    label?: string;
  }>;
};

/**
 * Load Guard Rails vNext ruleset for a diet (admin only)
 *
 * @param dietId - Diet type ID (UUID)
 * @returns Guard Rails vNext ruleset view model
 */
export async function loadDietGuardrailsRulesetAction(
  dietId: string,
): Promise<ActionResult<GuardRailsRulesetViewModel>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error: 'Geen toegang: alleen admins kunnen guard rails rulesets zien',
    };
  }

  if (!dietId) {
    return { error: 'Diet ID is vereist' };
  }

  try {
    // Load vNext ruleset using dietId (loader accepts dietId)
    const ruleset = await loadGuardrailsRuleset({
      dietId,
      mode: 'recipe_adaptation', // Base ruleset mode for overview
      locale: 'nl',
    });

    // Map to view model
    // Extract sources from provenance.metadata.sources (if available)
    const provenanceMetadata = ruleset.provenance.metadata || {};
    const provenanceSources =
      (provenanceMetadata.sources as Array<{
        kind: 'db' | 'overlay' | 'fallback';
        ref: string;
        loadedAt: string;
        details?: Record<string, unknown>;
      }>) || [];

    // Extract counts from provenance.metadata.ruleCounts.bySource
    const ruleCounts =
      (
        provenanceMetadata.ruleCounts as {
          bySource?: Record<string, number>;
        }
      )?.bySource || {};

    // Build counts object from sources
    const counts: Record<string, number> = {};
    for (const source of provenanceSources) {
      const count =
        (source.details?.ruleCount as number) || ruleCounts[source.ref] || 0;
      counts[source.kind] = (counts[source.kind] || 0) + count;
    }

    // Extract errors from provenance.metadata.errors
    const errors = (provenanceMetadata.errors as string[]) || undefined;

    // Sort rules by priority DESC (higher priority first) for display
    const sortedRules = [...ruleset.rules].sort((a, b) => {
      // Primary sort: priority DESC
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Secondary sort: rule ID for stable ordering
      return a.id.localeCompare(b.id);
    });

    const viewModel: GuardRailsRulesetViewModel = {
      rulesetVersion: ruleset.version,
      contentHash: ruleset.contentHash,
      provenance: {
        sources: provenanceSources.map((source) => ({
          kind: source.kind,
          ref: source.ref,
          loadedAt: source.loadedAt,
          details: source.details,
        })),
        counts,
        errors: errors && errors.length > 0 ? errors : undefined,
      },
      rules: sortedRules.map((rule) => {
        // Determine if this is a constraint (category-based) or recipe rule (ingredient-based)
        const parts = rule.id.split(':');
        const isConstraint =
          parts.length >= 3 &&
          parts[0] === 'db' &&
          parts[1] === 'diet_category_constraints';

        // For constraints, the target should be "category" (even though internally it's "ingredient")
        // For recipe_adaptation_rules, use the actual target from database
        const displayTarget: 'category' | 'ingredient' | 'step' | 'metadata' =
          isConstraint ? 'category' : rule.target;

        return {
          id: rule.id,
          action: rule.action,
          strictness: rule.strictness,
          priority: rule.priority,
          target: displayTarget,
          matchMode: rule.match.preferredMatchMode || 'word_boundary',
          matchValue: rule.match.term,
          reasonCode: rule.metadata.ruleCode,
          label: rule.metadata.label,
        };
      }),
    };

    return { data: viewModel };
  } catch (error) {
    console.error('Error loading guard rails ruleset:', error);
    return {
      error: `Fout bij laden guard rails ruleset: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
    };
  }
}

/** Diet Logic type (Dieetregels P0–P3) */
export type DietLogicType = 'drop' | 'force' | 'limit' | 'pass';

/**
 * Group Policy Row view model for consolidated Dieetregels display
 * Inclusief diet_logic (DROP/FORCE/LIMIT/PASS) conform diet-logic-plan.
 */
export type GroupPolicyRow = {
  /** diet_category_constraints.id – gebruikt voor bewerken/verwijderen/prioriteit */
  constraintId: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  action: 'allow' | 'block';
  strictness: 'hard' | 'soft';
  priority: number;
  itemCount: number;
  provenance: 'db';
  /** True = regel gepauzeerd (uit). Los van strictness: zacht = actief met waarschuwing, streng = actief met blokkeren. */
  isPaused: boolean;
  /** Diet Logic (P0–P3): drop, force, limit, pass. Voor weergave in Dieetregels-overzicht. */
  dietLogic?: DietLogicType;
  /** FORCE: min per dag/week */
  minPerDay?: number | null;
  minPerWeek?: number | null;
  /** LIMIT: max per dag/week */
  maxPerDay?: number | null;
  maxPerWeek?: number | null;
};

/**
 * Text Rule Summary for policy coverage visibility
 */
export type TextRuleSummary = {
  count: number;
  rules: Array<{
    id: string;
    label: string;
    action: 'block'; // Recipe adaptation rules are always block
    strictness: 'hard' | 'soft';
    priority: number;
    target: 'ingredient' | 'step' | 'metadata';
    matchMode: 'exact' | 'word_boundary' | 'substring' | 'canonical_id';
    matchValue: string;
    reasonCode: string;
  }>;
};

/**
 * Get diet group policies (consolidated view: 1 policy per ingredient category)
 *
 * Returns only diet_category_constraints (group-level policies), not per-term recipe_adaptation_rules.
 * Each row represents one policy for an ingredient category.
 */
export async function getDietGroupPoliciesAction(
  dietTypeId: string,
): Promise<ActionResult<GroupPolicyRow[]>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins kunnen group policies zien' };
  }

  if (!dietTypeId) {
    return { error: 'Diet ID is vereist' };
  }

  try {
    const supabase = await createClient();

    // Get active constraints for this diet (inclusief diet_logic, is_paused, min/max voor Dieetregels UI)
    const { data: constraints, error: constraintsError } = await supabase
      .from('diet_category_constraints')
      .select(
        `
        id,
        category_id,
        rule_action,
        constraint_type,
        diet_logic,
        strictness,
        priority,
        rule_priority,
        min_per_day,
        min_per_week,
        max_per_day,
        max_per_week,
        is_paused,
        category:ingredient_categories!inner(
          id,
          code,
          name_nl
        )
      `,
      )
      .eq('diet_type_id', dietTypeId)
      .eq('is_active', true);

    if (constraintsError) {
      return {
        error: `Fout bij laden constraints: ${constraintsError.message}`,
      };
    }

    if (!constraints || constraints.length === 0) {
      return { data: [] };
    }

    // Get item counts for all categories
    const categoryIds = constraints
      .map((c: any) => c.category_id)
      .filter((id: string | null) => id !== null);

    const itemsCountMap = new Map<string, number>();

    if (categoryIds.length > 0) {
      const countPromises = categoryIds.map(async (categoryId: string) => {
        const { count, error } = await supabase
          .from('ingredient_category_items')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', categoryId)
          .eq('is_active', true);

        if (!error && count !== null) {
          itemsCountMap.set(categoryId, count);
        }
      });

      await Promise.all(countPromises);
    }

    // Map to GroupPolicyRow (diet_logic voor Diet Logic UI, action voor backwards compat)
    const validDietLogic = (
      v: string | null | undefined,
    ): DietLogicType | undefined => {
      if (v === 'drop' || v === 'force' || v === 'limit' || v === 'pass')
        return v;
      return undefined;
    };

    const policies: GroupPolicyRow[] = (constraints || [])
      .filter((constraint: any) => constraint.category) // Filter out constraints with deleted categories
      .map((constraint: any) => {
        const category = constraint.category;
        const ruleAction =
          constraint.rule_action ||
          (constraint.constraint_type === 'forbidden' ? 'block' : 'allow');
        const dietLogicValue =
          validDietLogic(constraint.diet_logic) ??
          (constraint.constraint_type === 'required' ? 'force' : 'drop');

        return {
          constraintId: constraint.id,
          categoryId: constraint.category_id,
          categoryName: category.name_nl || 'Onbekende categorie',
          categorySlug: category.code || 'unknown',
          action: ruleAction,
          strictness: constraint.strictness || 'hard',
          priority: constraint.rule_priority ?? constraint.priority ?? 100,
          itemCount: itemsCountMap.get(constraint.category_id) || 0,
          provenance: 'db' as const,
          isPaused: constraint.is_paused === true,
          dietLogic: dietLogicValue,
          minPerDay: constraint.min_per_day ?? null,
          minPerWeek: constraint.min_per_week ?? null,
          maxPerDay: constraint.max_per_day ?? null,
          maxPerWeek: constraint.max_per_week ?? null,
        };
      })
      .sort((a, b) => {
        // Prioriteit: 1 = hoogst, 65500 = laagst → sorteer ASC (lagere waarde eerst)
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.categoryName.localeCompare(b.categoryName, 'nl');
      });

    return { data: policies };
  } catch (error) {
    console.error('Error loading diet group policies:', error);
    return {
      error: `Fout bij laden group policies: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
    };
  }
}

/**
 * Get diet text rules summary (recipe_adaptation_rules) for policy coverage visibility
 *
 * Returns count and top N (20) active text rules that affect enforcement but are not
 * shown in the main group policies table.
 */
export async function getDietTextRulesSummaryAction(
  dietTypeId: string,
  limit: number = 20,
): Promise<ActionResult<TextRuleSummary>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error: 'Geen toegang: alleen admins kunnen text rules summary zien',
    };
  }

  if (!dietTypeId) {
    return { error: 'Diet ID is vereist' };
  }

  try {
    const supabase = await createClient();

    // Get total count of active rules
    const { count: totalCount, error: countError } = await supabase
      .from('recipe_adaptation_rules')
      .select('*', { count: 'exact', head: true })
      .eq('diet_type_id', dietTypeId)
      .eq('is_active', true);

    if (countError) {
      return {
        error: `Fout bij tellen text rules: ${countError.message}`,
      };
    }

    // Get top N active rules (sorted by priority DESC)
    const { data: rules, error: rulesError } = await supabase
      .from('recipe_adaptation_rules')
      .select('id, rule_label, rule_code, priority, target, match_mode, term')
      .eq('diet_type_id', dietTypeId)
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('term', { ascending: true })
      .limit(limit);

    if (rulesError) {
      return {
        error: `Fout bij laden text rules: ${rulesError.message}`,
      };
    }

    // Map to summary format
    const mappedRules = (rules || []).map((rule: any) => {
      // Infer strictness from rule_code (same logic as mapRecipeAdaptationRuleToRule)
      const strictness: 'hard' | 'soft' = rule.rule_code?.includes('SOFT')
        ? 'soft'
        : 'hard';

      return {
        id: rule.id,
        label: rule.rule_label || 'Onbekende regel',
        action: 'block' as const, // Recipe adaptation rules are always block
        strictness,
        priority: rule.priority || 50,
        target: (rule.target || 'ingredient') as
          | 'ingredient'
          | 'step'
          | 'metadata',
        matchMode: (rule.match_mode || 'word_boundary') as
          | 'exact'
          | 'word_boundary'
          | 'substring'
          | 'canonical_id',
        matchValue: rule.term || '',
        reasonCode: rule.rule_code || 'UNKNOWN_ERROR',
      };
    });

    return {
      data: {
        count: totalCount || 0,
        rules: mappedRules,
      },
    };
  } catch (error) {
    console.error('Error loading diet text rules summary:', error);
    return {
      error: `Fout bij laden text rules summary: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
    };
  }
}

/**
 * Parse rule ID to extract source information
 * Format: `db:diet_category_constraints:<id>:<itemIndex>` or `db:recipe_adaptation_rules:<id>`
 */
function parseRuleId(ruleId: string): {
  source: 'diet_category_constraints' | 'recipe_adaptation_rules' | 'unknown';
  id: string;
  itemIndex?: number;
} {
  const parts = ruleId.split(':');
  if (parts.length < 3 || parts[0] !== 'db') {
    return { source: 'unknown', id: ruleId };
  }

  const source = parts[1];
  if (source === 'diet_category_constraints' && parts.length >= 4) {
    return {
      source: 'diet_category_constraints',
      id: parts[2],
      itemIndex: parseInt(parts[3], 10),
    };
  } else if (source === 'recipe_adaptation_rules') {
    return {
      source: 'recipe_adaptation_rules',
      id: parts[2],
    };
  }

  return { source: 'unknown', id: ruleId };
}

/**
 * Update guard rail rule (admin only)
 */
export async function updateGuardRailRuleAction(
  ruleId: string,
  updates: {
    priority?: number;
    strictness?: 'hard' | 'soft';
    action?: 'allow' | 'block';
    /** Alleen voor constraints: true = gepauzeerd (uit), false = actief. */
    isPaused?: boolean;
    target?: 'ingredient' | 'step' | 'metadata';
    matchMode?: 'exact' | 'word_boundary' | 'substring' | 'canonical_id';
    matchValue?: string;
    reasonCode?: string;
    label?: string;
  },
): Promise<ActionResult<void>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error: 'Geen toegang: alleen admins kunnen guard rails regels bewerken',
    };
  }

  const parsed = parseRuleId(ruleId);

  if (parsed.source === 'unknown') {
    return { error: 'Onbekend regel type, kan niet worden bijgewerkt' };
  }

  try {
    const { updateDietCategoryConstraintAction } =
      await import('./ingredient-categories-admin.actions');
    const { updateRecipeAdaptationRule } =
      await import('./recipe-adaptation-rules-admin.actions');

    if (parsed.source === 'diet_category_constraints') {
      const updateData: {
        rule_priority?: number;
        priority?: number;
        strictness?: 'hard' | 'soft';
        rule_action?: 'allow' | 'block';
        is_paused?: boolean;
      } = {};

      if (updates.priority !== undefined) {
        updateData.rule_priority = updates.priority;
        updateData.priority = updates.priority;
      }
      if (updates.strictness !== undefined) {
        updateData.strictness = updates.strictness;
      }
      if (updates.action !== undefined) {
        updateData.rule_action = updates.action;
      }
      if (updates.isPaused !== undefined) {
        updateData.is_paused = updates.isPaused;
      }
      // Note: target, matchMode, matchValue, reasonCode, and label are derived from
      // the category for diet_category_constraints, so they cannot be edited directly

      const result = await updateDietCategoryConstraintAction(
        parsed.id,
        updateData,
      );
      if (!result.ok) {
        return { error: result.error.message };
      }
    } else if (parsed.source === 'recipe_adaptation_rules') {
      const updateData: {
        priority?: number;
        term?: string;
        ruleCode?: string;
        ruleLabel?: string;
        target?: 'ingredient' | 'step' | 'metadata';
        matchMode?: 'exact' | 'word_boundary' | 'substring' | 'canonical_id';
      } = {};

      if (updates.priority !== undefined) {
        updateData.priority = updates.priority;
      }
      if (
        updates.matchValue !== undefined &&
        updates.matchValue !== null &&
        updates.matchValue.trim() !== ''
      ) {
        updateData.term = updates.matchValue.trim();
      }
      if (
        updates.reasonCode !== undefined &&
        updates.reasonCode !== null &&
        updates.reasonCode.trim() !== ''
      ) {
        updateData.ruleCode = updates.reasonCode.trim();
      }
      if (updates.label !== undefined) {
        updateData.ruleLabel = updates.label;
      }
      if (updates.target !== undefined) {
        updateData.target = updates.target;
      }
      if (updates.matchMode !== undefined) {
        updateData.matchMode = updates.matchMode;
      }
      // Note: recipe_adaptation_rules don't have strictness/action fields
      // These are derived from the rule_code or are fixed
      // target and matchMode can now be edited

      // Only update if there are actual changes
      if (Object.keys(updateData).length === 0) {
        return { data: undefined };
      }

      const result = await updateRecipeAdaptationRule(parsed.id, updateData);
      if ('error' in result) {
        return { error: result.error };
      }
    } else {
      return { error: `Onbekend regel type: ${parsed.source}` };
    }

    return { data: undefined };
  } catch (error) {
    console.error('Error updating guard rail rule:', error);
    return {
      error: `Fout bij bijwerken regel: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
    };
  }
}

/**
 * Update guard rail rule priority (admin only)
 * @deprecated Use updateGuardRailRuleAction instead
 */
export async function updateGuardRailRulePriorityAction(
  ruleId: string,
  priority: number,
): Promise<ActionResult<void>> {
  return updateGuardRailRuleAction(ruleId, { priority });
}

/**
 * Block or pause a guard rail rule (admin only)
 *
 * Status semantics:
 * - "block" = set is_active to false (regel uit ruleset)
 * - "pause" = set is_paused to true (regel uit ruleset, strictness blijft ongewijzigd)
 * Zacht (soft) = actief met waarschuwing; streng (hard) = actief met blokkeren.
 */
export async function blockOrPauseGuardRailRuleAction(
  ruleId: string,
  action: 'block' | 'pause',
): Promise<ActionResult<void>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error: 'Geen toegang: alleen admins kunnen guard rails regels bewerken',
    };
  }

  const parsed = parseRuleId(ruleId);

  if (parsed.source === 'unknown') {
    return { error: 'Onbekend regel type, kan niet worden bijgewerkt' };
  }

  try {
    const { updateDietCategoryConstraintAction } =
      await import('./ingredient-categories-admin.actions');
    const { updateRecipeAdaptationRule } =
      await import('./recipe-adaptation-rules-admin.actions');

    if (parsed.source === 'diet_category_constraints') {
      if (action === 'block') {
        const result = await updateDietCategoryConstraintAction(parsed.id, {
          is_active: false,
        });
        if (!result.ok) {
          return { error: result.error.message };
        }
      } else {
        // Pause = regel uitzetten (is_paused), strictness blijft wat het is
        const result = await updateDietCategoryConstraintAction(parsed.id, {
          is_paused: true,
        });
        if (!result.ok) {
          return { error: result.error.message };
        }
      }
    } else if (parsed.source === 'recipe_adaptation_rules') {
      if (action === 'block') {
        const result = await updateRecipeAdaptationRule(parsed.id, {
          isActive: false,
        });
        if ('error' in result) {
          return { error: result.error };
        }
      } else {
        // For recipe adaptation rules, pause = set is_active to false (same as block)
        const result = await updateRecipeAdaptationRule(parsed.id, {
          isActive: false,
        });
        if ('error' in result) {
          return { error: result.error };
        }
      }
    }

    return { data: undefined };
  } catch (error) {
    console.error('Error blocking/pausing guard rail rule:', error);
    return {
      error: `Fout bij blokkeren/pauzeren regel: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
    };
  }
}

/**
 * Delete a guard rail rule (admin only)
 *
 * Status semantics (aligned with ruleset-loader):
 * - Sets is_active to false (status: "deleted")
 * - Deleted rules are excluded from ruleset and never appear in enforcement
 */
export async function deleteGuardRailRuleAction(
  ruleId: string,
): Promise<ActionResult<void>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error:
        'Geen toegang: alleen admins kunnen guard rails regels verwijderen',
    };
  }

  const parsed = parseRuleId(ruleId);

  if (parsed.source === 'unknown') {
    return { error: 'Onbekend regel type, kan niet worden verwijderd' };
  }

  try {
    const { deleteDietCategoryConstraintAction } =
      await import('./ingredient-categories-admin.actions');
    const { deleteRecipeAdaptationRule } =
      await import('./recipe-adaptation-rules-admin.actions');

    if (parsed.source === 'diet_category_constraints') {
      const result = await deleteDietCategoryConstraintAction(parsed.id);
      if (!result.ok) {
        return { error: result.error.message };
      }
    } else if (parsed.source === 'recipe_adaptation_rules') {
      const result = await deleteRecipeAdaptationRule(parsed.id);
      if ('error' in result) {
        return { error: result.error };
      }
    }

    return { data: undefined };
  } catch (error) {
    console.error('Error deleting guard rail rule:', error);
    return {
      error: `Fout bij verwijderen regel: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
    };
  }
}

/**
 * Swap priorities of two guard rail rules (admin only)
 *
 * Transactionally swaps the priorities of two rules. Both rules must:
 * - Exist in the database
 * - Belong to the same diet_type_id
 * - Be of the same source type (both constraints or both recipe_adaptation_rules)
 *
 * @param aRuleId - First rule ID
 * @param bRuleId - Second rule ID
 * @returns ActionResult<void>
 */
export async function swapGuardRailRulePriorityAction(
  aRuleId: string,
  bRuleId: string,
): Promise<ActionResult<void>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error: 'Geen toegang: alleen admins kunnen guard rails regels herordenen',
    };
  }

  if (!aRuleId || !bRuleId) {
    return { error: 'Beide rule IDs zijn vereist' };
  }

  if (aRuleId === bRuleId) {
    return { error: 'Kan niet dezelfde regel met zichzelf verwisselen' };
  }

  const parsedA = parseRuleId(aRuleId);
  const parsedB = parseRuleId(bRuleId);

  if (parsedA.source === 'unknown' || parsedB.source === 'unknown') {
    return { error: 'Onbekend regel type, kan niet worden herordend' };
  }

  if (parsedA.source !== parsedB.source) {
    return {
      error:
        'Kan alleen regels van hetzelfde type verwisselen (constraints met constraints, of recipe rules met recipe rules)',
    };
  }

  try {
    const { createClient } = await import('@/src/lib/supabase/server');
    const supabase = await createClient();

    // Load both rules to validate existence and get current priorities and diet_type_id
    let ruleA: {
      id: string;
      diet_type_id: string;
      rule_priority?: number;
      priority?: number;
    } | null = null;
    let ruleB: {
      id: string;
      diet_type_id: string;
      rule_priority?: number;
      priority?: number;
    } | null = null;

    if (parsedA.source === 'diet_category_constraints') {
      const { data: dataA, error: errorA } = await supabase
        .from('diet_category_constraints')
        .select('id, diet_type_id, rule_priority, priority')
        .eq('id', parsedA.id)
        .single();

      if (errorA || !dataA) {
        return {
          error: `Regel A niet gevonden: ${errorA?.message || 'Onbekende fout'}`,
        };
      }
      ruleA = dataA;

      const { data: dataB, error: errorB } = await supabase
        .from('diet_category_constraints')
        .select('id, diet_type_id, rule_priority, priority')
        .eq('id', parsedB.id)
        .single();

      if (errorB || !dataB) {
        return {
          error: `Regel B niet gevonden: ${errorB?.message || 'Onbekende fout'}`,
        };
      }
      ruleB = dataB;
    } else if (parsedA.source === 'recipe_adaptation_rules') {
      const { data: dataA, error: errorA } = await supabase
        .from('recipe_adaptation_rules')
        .select('id, diet_type_id, priority')
        .eq('id', parsedA.id)
        .single();

      if (errorA || !dataA) {
        return {
          error: `Regel A niet gevonden: ${errorA?.message || 'Onbekende fout'}`,
        };
      }
      ruleA = dataA;

      const { data: dataB, error: errorB } = await supabase
        .from('recipe_adaptation_rules')
        .select('id, diet_type_id, priority')
        .eq('id', parsedB.id)
        .single();

      if (errorB || !dataB) {
        return {
          error: `Regel B niet gevonden: ${errorB?.message || 'Onbekende fout'}`,
        };
      }
      ruleB = dataB;
    }

    if (!ruleA || !ruleB) {
      return { error: 'Regel A of B niet gevonden' };
    }

    // Validate both rules belong to the same diet
    if (ruleA.diet_type_id !== ruleB.diet_type_id) {
      return { error: 'Regels moeten tot hetzelfde dieettype behoren' };
    }

    // Get current priorities
    const priorityA = ruleA.rule_priority ?? ruleA.priority ?? 50;
    const priorityB = ruleB.rule_priority ?? ruleB.priority ?? 50;

    // Prioriteit: 1 = hoogst, 65500 = laagst
    if (
      priorityA < 1 ||
      priorityA > 65500 ||
      priorityB < 1 ||
      priorityB > 65500
    ) {
      return { error: 'Prioriteit moet tussen 1 en 65500 liggen (1 = hoogst)' };
    }

    // Swap priorities transactionally
    // Note: Supabase client doesn't have explicit transactions, but we can do both updates
    // and handle errors. For true atomicity, we'd need a Postgres function, but for now
    // we'll do sequential updates and validate both succeed.

    if (parsedA.source === 'diet_category_constraints') {
      // Update rule A with B's priority
      const { error: errorA } = await supabase
        .from('diet_category_constraints')
        .update({
          rule_priority: priorityB,
          priority: priorityB,
        })
        .eq('id', parsedA.id);

      if (errorA) {
        return { error: `Fout bij bijwerken regel A: ${errorA.message}` };
      }

      // Update rule B with A's priority
      const { error: errorB } = await supabase
        .from('diet_category_constraints')
        .update({
          rule_priority: priorityA,
          priority: priorityA,
        })
        .eq('id', parsedB.id);

      if (errorB) {
        // Rollback: restore A's original priority
        await supabase
          .from('diet_category_constraints')
          .update({
            rule_priority: priorityA,
            priority: priorityA,
          })
          .eq('id', parsedA.id);
        return {
          error: `Fout bij bijwerken regel B: ${errorB.message}. Wijziging teruggedraaid.`,
        };
      }
    } else if (parsedA.source === 'recipe_adaptation_rules') {
      // Update rule A with B's priority
      const { error: errorA } = await supabase
        .from('recipe_adaptation_rules')
        .update({
          priority: priorityB,
        })
        .eq('id', parsedA.id);

      if (errorA) {
        return { error: `Fout bij bijwerken regel A: ${errorA.message}` };
      }

      // Update rule B with A's priority
      const { error: errorB } = await supabase
        .from('recipe_adaptation_rules')
        .update({
          priority: priorityA,
        })
        .eq('id', parsedB.id);

      if (errorB) {
        // Rollback: restore A's original priority
        await supabase
          .from('recipe_adaptation_rules')
          .update({
            priority: priorityA,
          })
          .eq('id', parsedA.id);
        return {
          error: `Fout bij bijwerken regel B: ${errorB.message}. Wijziging teruggedraaid.`,
        };
      }
    }

    return { data: undefined };
  } catch (error) {
    console.error('Error swapping guard rail rule priorities:', error);
    return {
      error: `Fout bij verwisselen prioriteiten: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
    };
  }
}

/**
 * Create a new guard rail rule (admin only)
 *
 * Supports creating both recipe_adaptation_rules and diet_category_constraints.
 *
 * @param input - Create input with sourceType and payload
 * @returns Created rule view model
 */
export async function createGuardRailRuleAction(input: {
  dietTypeId: string;
  sourceType: 'recipe_rule' | 'constraint';
  payload: {
    // For recipe_rule:
    term?: string;
    synonyms?: string[];
    ruleCode?: string;
    ruleLabel?: string;
    substitutionSuggestions?: string[];
    priority?: number;
    target?: 'ingredient' | 'step' | 'metadata';
    matchMode?: 'exact' | 'word_boundary' | 'substring' | 'canonical_id';
    // For constraint (conform diet-logic-plan):
    categoryId?: string;
    /** Diet Logic (P0–P3); rule_action wordt afgeleid: drop/limit→block, force/pass→allow */
    dietLogic?: DietLogicType;
    ruleAction?: 'allow' | 'block';
    strictness?: 'hard' | 'soft';
    rulePriority?: number;
    minPerDay?: number | null;
    minPerWeek?: number | null;
    maxPerDay?: number | null;
    maxPerWeek?: number | null;
    /** Optionele AI-instructie: context, uitzonderingen of toelichting voor betere interpretatie */
    aiInstruction?: string | null;
  };
}): Promise<
  ActionResult<{ id: string; sourceType: 'recipe_rule' | 'constraint' }>
> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error: 'Geen toegang: alleen admins kunnen guard rails regels aanmaken',
    };
  }

  if (!input.dietTypeId || !input.sourceType) {
    return { error: 'Diet type ID en source type zijn vereist' };
  }

  try {
    const { createClient } = await import('@/src/lib/supabase/server');
    const supabase = await createClient();

    // Verify diet type exists
    const { data: dietType, error: dietError } = await supabase
      .from('diet_types')
      .select('id')
      .eq('id', input.dietTypeId)
      .single();

    if (dietError || !dietType) {
      return { error: 'Dieettype niet gevonden' };
    }

    if (input.sourceType === 'recipe_rule') {
      // Validate required fields for recipe rule
      if (
        !input.payload.term ||
        !input.payload.ruleCode ||
        !input.payload.ruleLabel
      ) {
        return {
          error: 'Term, ruleCode en ruleLabel zijn verplicht voor recipe rules',
        };
      }

      // Validate priority range
      const priority = input.payload.priority ?? 50;
      if (priority < 0 || priority > 100) {
        return { error: 'Prioriteit moet tussen 0 en 100 liggen' };
      }

      const { createRecipeAdaptationRule } =
        await import('./recipe-adaptation-rules-admin.actions');
      const result = await createRecipeAdaptationRule({
        dietTypeId: input.dietTypeId,
        term: input.payload.term.trim().toLowerCase(),
        synonyms: input.payload.synonyms || [],
        ruleCode: input.payload.ruleCode,
        ruleLabel: input.payload.ruleLabel,
        substitutionSuggestions: input.payload.substitutionSuggestions || [],
        priority: priority,
        isActive: true,
        target: input.payload.target || 'ingredient',
        matchMode: input.payload.matchMode || 'word_boundary',
      });

      if ('error' in result) {
        return { error: result.error };
      }

      return {
        data: {
          id: result.data.id,
          sourceType: 'recipe_rule',
        },
      };
    } else if (input.sourceType === 'constraint') {
      // Validate required fields for constraint
      if (!input.payload.categoryId || !input.payload.strictness) {
        return {
          error: 'Category ID en strictness zijn verplicht voor constraints',
        };
      }
      // diet_logic of rule_action (minimaal één voor backwards compatibility)
      const dietLogic =
        input.payload.dietLogic ??
        (input.payload.ruleAction === 'allow' ? 'force' : 'drop');
      const ruleAction = input.payload.dietLogic
        ? input.payload.dietLogic === 'drop' ||
          input.payload.dietLogic === 'limit'
          ? 'block'
          : 'allow'
        : input.payload.ruleAction!;

      // Prioriteit: 1 = hoogst, 65500 = laagst
      const rulePriority = input.payload.rulePriority ?? 100;
      if (rulePriority < 1 || rulePriority > 65500) {
        return {
          error: 'Prioriteit moet tussen 1 en 65500 liggen (1 = hoogst)',
        };
      }

      // Verify category exists
      const { data: category, error: categoryError } = await supabase
        .from('ingredient_categories')
        .select('id, category_type')
        .eq('id', input.payload.categoryId)
        .single();

      if (categoryError || !category) {
        return { error: 'Categorie niet gevonden' };
      }

      const constraintType = ruleAction === 'block' ? 'forbidden' : 'required';

      // Unieke key: (diet_type_id, category_id, rule_action). Eén rij per categorie in de UI.
      const { data: existing } = await supabase
        .from('diet_category_constraints')
        .select('id, is_active')
        .eq('diet_type_id', input.dietTypeId)
        .eq('category_id', input.payload.categoryId)
        .eq('rule_action', ruleAction)
        .maybeSingle();

      if (existing?.is_active) {
        return {
          error:
            'Er bestaat al een dieetregel voor deze ingrediëntgroep bij dit dieettype',
        };
      }

      const payload = {
        diet_type_id: input.dietTypeId,
        category_id: input.payload.categoryId,
        constraint_type: constraintType,
        rule_action: ruleAction,
        diet_logic: dietLogic,
        strictness: input.payload.strictness,
        rule_priority: rulePriority,
        priority: rulePriority,
        min_per_day: input.payload.minPerDay ?? null,
        min_per_week: input.payload.minPerWeek ?? null,
        max_per_day: input.payload.maxPerDay ?? null,
        max_per_week: input.payload.maxPerWeek ?? null,
        ai_instruction: (input.payload.aiInstruction ?? '').trim() || null,
        is_active: true,
      };

      if (existing && !existing.is_active) {
        // Regel was eerder “verwijderd” (soft delete). Hergebruik de rij: zet weer actief en werk bij.
        const { data: updated, error: updateError } = await supabase
          .from('diet_category_constraints')
          .update(payload)
          .eq('id', existing.id)
          .select('id')
          .single();

        if (updateError) {
          console.error('Error reactivating constraint:', updateError);
          return {
            error: `Fout bij herstellen dieetregel: ${updateError.message}`,
          };
        }
        return {
          data: { id: updated.id, sourceType: 'constraint' as const },
        };
      }

      const { data, error: insertError } = await supabase
        .from('diet_category_constraints')
        .insert(payload)
        .select('id')
        .single();

      if (insertError) {
        console.error('Error creating constraint:', insertError);
        if (insertError.code === '23505') {
          return {
            error:
              'Een constraint met deze categorie bestaat al voor dit dieettype',
          };
        }
        return {
          error: `Fout bij aanmaken constraint: ${insertError.message}`,
        };
      }

      return {
        data: {
          id: data.id,
          sourceType: 'constraint',
        },
      };
    } else {
      return { error: `Onbekend source type: ${input.sourceType}` };
    }
  } catch (error) {
    console.error('Error creating guard rail rule:', error);
    return {
      error: `Fout bij aanmaken regel: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
    };
  }
}
