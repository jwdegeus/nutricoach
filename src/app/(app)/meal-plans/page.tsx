import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { listMealPlansAction } from "./actions/mealPlans.actions";
import { MealPlansTable } from "./components/MealPlansTable";

export const metadata: Metadata = {
  title: "Meal Plans | NutriCoach",
  description: "Bekijk je meal plan geschiedenis",
};

export default async function MealPlansPage() {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Load meal plans
  const plansResult = await listMealPlansAction(50);

  if (!plansResult.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Meal Plans</h1>
        <div className="text-destructive">
          Fout bij ophalen meal plans: {plansResult.error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meal Plans</h1>
          <p className="text-muted-foreground">
            Overzicht van al je gegenereerde meal plans
          </p>
        </div>
        {plansResult.data.length > 0 && (
          <a
            href="/meal-plans/new"
            className="inline-flex items-center justify-center rounded-lg border border-transparent bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Nieuw Meal Plan
          </a>
        )}
      </div>

      <MealPlansTable plans={plansResult.data} />
    </div>
  );
}
