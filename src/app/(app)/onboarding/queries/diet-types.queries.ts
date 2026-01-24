"use server";

import { createClient } from "@/src/lib/supabase/server";

export type DietType = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
};

/**
 * Haalt alle actieve dieettypes op (gesorteerd op display_order)
 */
export async function getDietTypes(): Promise<DietType[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("diet_types")
    .select("id, name, description, display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching diet types:", error);
    // Return empty array on error (graceful degradation)
    return [];
  }

  return (
    data?.map((dt) => ({
      id: dt.id,
      name: dt.name,
      description: dt.description,
      displayOrder: dt.display_order,
    })) ?? []
  );
}
