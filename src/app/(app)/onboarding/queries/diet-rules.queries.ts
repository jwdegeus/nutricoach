"use server";

import { createClient } from "@/src/lib/supabase/server";
import type { DietRule } from "../types/diet-rules.types";

/**
 * Haalt alle actieve regels op voor een specifiek dieettype
 */
export async function getDietRules(dietTypeId: string): Promise<DietRule[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("diet_rules")
    .select("*")
    .eq("diet_type_id", dietTypeId)
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .order("rule_type", { ascending: true });

  if (error) {
    console.error("Error fetching diet rules:", error);
    return [];
  }

  return (
    data?.map((dr) => ({
      id: dr.id,
      dietTypeId: dr.diet_type_id,
      ruleType: dr.rule_type,
      ruleKey: dr.rule_key,
      ruleValue: dr.rule_value,
      description: dr.description,
      priority: dr.priority,
    })) ?? []
  );
}

/**
 * Checkt of een dieettype bestaat en actief is
 */
export async function validateDietType(dietTypeId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("diet_types")
    .select("id")
    .eq("id", dietTypeId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return true;
}
