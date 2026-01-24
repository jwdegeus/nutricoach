"use server";

import { createClient } from "@/src/lib/supabase/server";
import { isAdmin } from "@/src/lib/auth/roles";
import type { ActionResult } from "@/src/lib/types";
import type {
  DietRule,
  DietRuleType,
  ExcludeIngredientRule,
  RequireIngredientRule,
  MacroConstraintRule,
  MealStructureRule,
} from "@/src/app/(app)/onboarding/types/diet-rules.types";

export type DietRuleInput = {
  dietTypeId: string;
  ruleType: DietRuleType;
  ruleKey: string;
  ruleValue: ExcludeIngredientRule | RequireIngredientRule | MacroConstraintRule | MealStructureRule;
  description: string | null;
  priority: number;
  isActive?: boolean;
};

export type DietRuleOutput = DietRule & {
  isActive: boolean;
};

/**
 * Get all rules for a specific diet type (admin only)
 */
export async function getDietRulesForAdmin(
  dietTypeId: string
): Promise<ActionResult<DietRuleOutput[]>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: "Geen toegang: alleen admins kunnen dieetregels zien" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("diet_rules")
    .select("*")
    .eq("diet_type_id", dietTypeId)
    .order("priority", { ascending: false })
    .order("rule_type", { ascending: true })
    .order("rule_key", { ascending: true });

  if (error) {
    console.error("Error fetching diet rules:", error);
    return { error: `Fout bij ophalen dieetregels: ${error.message}` };
  }

  return {
    data:
      data?.map((dr) => ({
        id: dr.id,
        dietTypeId: dr.diet_type_id,
        ruleType: dr.rule_type as DietRuleType,
        ruleKey: dr.rule_key,
        ruleValue: dr.rule_value,
        description: dr.description,
        priority: dr.priority,
        isActive: dr.is_active,
      })) ?? [],
  };
}

/**
 * Create a new diet rule (admin only)
 */
export async function createDietRule(
  input: DietRuleInput
): Promise<ActionResult<DietRuleOutput>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: "Geen toegang: alleen admins kunnen dieetregels aanmaken" };
  }

  if (!input.dietTypeId || !input.ruleType || !input.ruleKey) {
    return { error: "Dieettype ID, regeltype en regelkey zijn verplicht" };
  }

  const supabase = await createClient();

  // Verify diet type exists
  const { data: dietType, error: dietError } = await supabase
    .from("diet_types")
    .select("id")
    .eq("id", input.dietTypeId)
    .single();

  if (dietError || !dietType) {
    return { error: "Dieettype niet gevonden" };
  }

  const { data, error } = await supabase
    .from("diet_rules")
    .insert({
      diet_type_id: input.dietTypeId,
      rule_type: input.ruleType,
      rule_key: input.ruleKey,
      rule_value: input.ruleValue as unknown,
      description: input.description?.trim() || null,
      priority: input.priority,
      is_active: input.isActive ?? true,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating diet rule:", error);
    // Check for unique constraint violation
    if (error.code === "23505") {
      return {
        error: "Een regel met dit type en key bestaat al voor dit dieettype",
      };
    }
    return { error: `Fout bij aanmaken dieetregel: ${error.message}` };
  }

  return {
    data: {
      id: data.id,
      dietTypeId: data.diet_type_id,
      ruleType: data.rule_type as DietRuleType,
      ruleKey: data.rule_key,
      ruleValue: data.rule_value,
      description: data.description,
      priority: data.priority,
      isActive: data.is_active,
    },
  };
}

/**
 * Update a diet rule (admin only)
 */
export async function updateDietRule(
  id: string,
  input: Partial<DietRuleInput>
): Promise<ActionResult<DietRuleOutput>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: "Geen toegang: alleen admins kunnen dieetregels bewerken" };
  }

  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};
  if (input.ruleType !== undefined) {
    updateData.rule_type = input.ruleType;
  }
  if (input.ruleKey !== undefined) {
    updateData.rule_key = input.ruleKey;
  }
  if (input.ruleValue !== undefined) {
    updateData.rule_value = input.ruleValue as unknown;
  }
  if (input.description !== undefined) {
    updateData.description = input.description?.trim() || null;
  }
  if (input.priority !== undefined) {
    updateData.priority = input.priority;
  }
  if (input.isActive !== undefined) {
    updateData.is_active = input.isActive;
  }

  if (Object.keys(updateData).length === 0) {
    return { error: "Geen wijzigingen opgegeven" };
  }

  const { data, error } = await supabase
    .from("diet_rules")
    .update(updateData)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("Error updating diet rule:", error);
    if (error.code === "23505") {
      return {
        error: "Een regel met dit type en key bestaat al voor dit dieettype",
      };
    }
    return { error: `Fout bij bijwerken dieetregel: ${error.message}` };
  }

  return {
    data: {
      id: data.id,
      dietTypeId: data.diet_type_id,
      ruleType: data.rule_type as DietRuleType,
      ruleKey: data.rule_key,
      ruleValue: data.rule_value,
      description: data.description,
      priority: data.priority,
      isActive: data.is_active,
    },
  };
}

/**
 * Delete a diet rule (soft delete by setting is_active = false)
 */
export async function deleteDietRule(id: string): Promise<ActionResult<void>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: "Geen toegang: alleen admins kunnen dieetregels verwijderen" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("diet_rules")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    console.error("Error deleting diet rule:", error);
    return { error: `Fout bij verwijderen dieetregel: ${error.message}` };
  }

  return { data: undefined };
}
