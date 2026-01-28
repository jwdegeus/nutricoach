'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import type { ActionResult } from '@/src/lib/types';

export type RecipeAdaptationRuleInput = {
  dietTypeId: string;
  term: string;
  synonyms: string[];
  ruleCode: string;
  ruleLabel: string;
  substitutionSuggestions: string[];
  priority?: number;
  isActive?: boolean;
  target?: 'ingredient' | 'step' | 'metadata';
  matchMode?: 'exact' | 'word_boundary' | 'substring' | 'canonical_id';
};

export type RecipeAdaptationRuleOutput = {
  id: string;
  dietTypeId: string;
  term: string;
  synonyms: string[];
  ruleCode: string;
  ruleLabel: string;
  substitutionSuggestions: string[];
  priority: number;
  isActive: boolean;
  target: 'ingredient' | 'step' | 'metadata';
  matchMode: 'exact' | 'word_boundary' | 'substring' | 'canonical_id';
  createdAt: string;
  updatedAt: string;
};

export type RecipeAdaptationHeuristicInput = {
  dietTypeId: string;
  heuristicType: string;
  terms: string[];
  isActive?: boolean;
};

export type RecipeAdaptationHeuristicOutput = {
  id: string;
  dietTypeId: string;
  heuristicType: string;
  terms: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Get all recipe adaptation rules for a diet type (admin only)
 */
export async function getRecipeAdaptationRulesForAdmin(
  dietTypeId: string,
): Promise<ActionResult<RecipeAdaptationRuleOutput[]>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error: 'Geen toegang: alleen admins kunnen recipe adaptation rules zien',
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recipe_adaptation_rules')
    .select('*')
    .eq('diet_type_id', dietTypeId)
    .order('priority', { ascending: false })
    .order('term', { ascending: true });

  if (error) {
    console.error('Error fetching recipe adaptation rules:', error);
    return {
      error: `Fout bij ophalen recipe adaptation rules: ${error.message}`,
    };
  }

  return {
    data:
      data?.map((rule) => ({
        id: rule.id,
        dietTypeId: rule.diet_type_id,
        term: rule.term,
        synonyms: rule.synonyms || [],
        ruleCode: rule.rule_code,
        ruleLabel: rule.rule_label,
        substitutionSuggestions: rule.substitution_suggestions || [],
        priority: rule.priority,
        isActive: rule.is_active,
        target:
          (rule.target as 'ingredient' | 'step' | 'metadata') || 'ingredient',
        matchMode:
          (rule.match_mode as
            | 'exact'
            | 'word_boundary'
            | 'substring'
            | 'canonical_id') || 'word_boundary',
        createdAt: rule.created_at,
        updatedAt: rule.updated_at,
      })) ?? [],
  };
}

/**
 * Create a new recipe adaptation rule (admin only)
 */
export async function createRecipeAdaptationRule(
  input: RecipeAdaptationRuleInput,
): Promise<ActionResult<RecipeAdaptationRuleOutput>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error:
        'Geen toegang: alleen admins kunnen recipe adaptation rules aanmaken',
    };
  }

  if (!input.dietTypeId || !input.term || !input.ruleCode || !input.ruleLabel) {
    return {
      error: 'Dieettype ID, term, ruleCode en ruleLabel zijn verplicht',
    };
  }

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

  const { data, error } = await supabase
    .from('recipe_adaptation_rules')
    .insert({
      diet_type_id: input.dietTypeId,
      term: input.term.trim().toLowerCase(),
      synonyms: input.synonyms || [],
      rule_code: input.ruleCode,
      rule_label: input.ruleLabel,
      substitution_suggestions: input.substitutionSuggestions || [],
      priority: input.priority ?? 50,
      is_active: input.isActive ?? true,
      target: input.target ?? 'ingredient',
      match_mode: input.matchMode ?? 'word_boundary',
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error creating recipe adaptation rule:', error);
    if (error.code === '23505') {
      return {
        error: 'Een regel met deze term bestaat al voor dit dieettype',
      };
    }
    return {
      error: `Fout bij aanmaken recipe adaptation rule: ${error.message}`,
    };
  }

  return {
    data: {
      id: data.id,
      dietTypeId: data.diet_type_id,
      term: data.term,
      synonyms: data.synonyms || [],
      ruleCode: data.rule_code,
      ruleLabel: data.rule_label,
      substitutionSuggestions: data.substitution_suggestions || [],
      priority: data.priority,
      isActive: data.is_active,
      target: (data.target ?? 'ingredient') as
        | 'ingredient'
        | 'step'
        | 'metadata',
      matchMode: (data.match_mode ?? 'word_boundary') as
        | 'exact'
        | 'word_boundary'
        | 'substring'
        | 'canonical_id',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

/**
 * Update a recipe adaptation rule (admin only)
 */
export async function updateRecipeAdaptationRule(
  id: string,
  input: Partial<RecipeAdaptationRuleInput>,
): Promise<ActionResult<RecipeAdaptationRuleOutput>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error:
        'Geen toegang: alleen admins kunnen recipe adaptation rules bewerken',
    };
  }

  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};
  if (input.term !== undefined) {
    updateData.term = input.term.trim().toLowerCase();
  }
  if (input.synonyms !== undefined) {
    updateData.synonyms = input.synonyms;
  }
  if (input.ruleCode !== undefined) {
    updateData.rule_code = input.ruleCode;
  }
  if (input.ruleLabel !== undefined) {
    updateData.rule_label = input.ruleLabel;
  }
  if (input.substitutionSuggestions !== undefined) {
    updateData.substitution_suggestions = input.substitutionSuggestions;
  }
  if (input.priority !== undefined) {
    updateData.priority = input.priority;
  }
  if (input.isActive !== undefined) {
    updateData.is_active = input.isActive;
  }
  if (input.target !== undefined) {
    updateData.target = input.target;
  }
  if (input.matchMode !== undefined) {
    updateData.match_mode = input.matchMode;
  }

  if (Object.keys(updateData).length === 0) {
    return { error: 'Geen wijzigingen opgegeven' };
  }

  const { data, error } = await supabase
    .from('recipe_adaptation_rules')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Error updating recipe adaptation rule:', error);
    if (error.code === '23505') {
      return {
        error: 'Een regel met deze term bestaat al voor dit dieettype',
      };
    }
    return {
      error: `Fout bij bijwerken recipe adaptation rule: ${error.message}`,
    };
  }

  return {
    data: {
      id: data.id,
      dietTypeId: data.diet_type_id,
      term: data.term,
      synonyms: data.synonyms || [],
      ruleCode: data.rule_code,
      ruleLabel: data.rule_label,
      substitutionSuggestions: data.substitution_suggestions || [],
      priority: data.priority,
      isActive: data.is_active,
      target:
        (data.target as 'ingredient' | 'step' | 'metadata') || 'ingredient',
      matchMode:
        (data.match_mode as
          | 'exact'
          | 'word_boundary'
          | 'substring'
          | 'canonical_id') || 'word_boundary',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

/**
 * Delete a recipe adaptation rule (soft delete by setting is_active = false)
 */
export async function deleteRecipeAdaptationRule(
  id: string,
): Promise<ActionResult<void>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error:
        'Geen toegang: alleen admins kunnen recipe adaptation rules verwijderen',
    };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('recipe_adaptation_rules')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting recipe adaptation rule:', error);
    return {
      error: `Fout bij verwijderen recipe adaptation rule: ${error.message}`,
    };
  }

  return { data: undefined };
}

/**
 * Get heuristics for a diet type (admin only)
 */
export async function getRecipeAdaptationHeuristicsForAdmin(
  dietTypeId: string,
): Promise<ActionResult<RecipeAdaptationHeuristicOutput[]>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins kunnen heuristics zien' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recipe_adaptation_heuristics')
    .select('*')
    .eq('diet_type_id', dietTypeId)
    .order('heuristic_type', { ascending: true });

  if (error) {
    console.error('Error fetching heuristics:', error);
    return { error: `Fout bij ophalen heuristics: ${error.message}` };
  }

  return {
    data:
      data?.map((h) => ({
        id: h.id,
        dietTypeId: h.diet_type_id,
        heuristicType: h.heuristic_type,
        terms: h.terms || [],
        isActive: h.is_active,
        createdAt: h.created_at,
        updatedAt: h.updated_at,
      })) ?? [],
  };
}

/**
 * Create or update a heuristic (admin only)
 */
export async function upsertRecipeAdaptationHeuristic(
  input: RecipeAdaptationHeuristicInput,
): Promise<ActionResult<RecipeAdaptationHeuristicOutput>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins kunnen heuristics bewerken' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recipe_adaptation_heuristics')
    .upsert(
      {
        diet_type_id: input.dietTypeId,
        heuristic_type: input.heuristicType,
        terms: input.terms || [],
        is_active: input.isActive ?? true,
      },
      {
        onConflict: 'diet_type_id,heuristic_type',
      },
    )
    .select('*')
    .single();

  if (error) {
    console.error('Error upserting heuristic:', error);
    return { error: `Fout bij opslaan heuristic: ${error.message}` };
  }

  return {
    data: {
      id: data.id,
      dietTypeId: data.diet_type_id,
      heuristicType: data.heuristic_type,
      terms: data.terms || [],
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}
