import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { CustomMealsService } from "@/src/lib/custom-meals/customMeals.service";
import { MealsPageClient } from "./components/MealsPageClient";

export const metadata: Metadata = {
  title: "Maaltijden Database | NutriCoach",
  description: "Bekijk en beheer alle maaltijden",
};

// Prevent automatic revalidation and caching issues
export const dynamic = 'force-dynamic';
export const revalidate = false;
export const fetchCache = 'force-no-store';

export default async function MealsPage() {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Load meals directly (not using server action to avoid POST request loops)
  try {
    const service = new CustomMealsService();
    const customMeals = await service.getUserMeals(user.id);

    // Also get meal history
    const { data: mealHistory } = await supabase
      .from("meal_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    return (
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Maaltijden Database</h1>
        </div>
        <MealsPageClient 
          initialMeals={{
            customMeals,
            mealHistory: mealHistory || [],
          }} 
        />
      </div>
    );
  } catch (error) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold tracking-tight mb-4">Maaltijden Database</h1>
        <div className="text-red-600">
          Fout: {error instanceof Error ? error.message : "Onbekende fout"}
        </div>
      </div>
    );
  }
}
