import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { loadUserPantryAction } from "./actions/pantry-ui.actions";
import { getNevoFoodByCode, calculateNutriScore } from "@/src/lib/nevo/nutrition-calculator";
import { PantryPageClient } from "./components/PantryPageClient";

export const metadata: Metadata = {
  title: "Pantry | NutriCoach",
  description: "Beheer je pantry en voorraad",
};

export default async function PantryPage() {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Load pantry items
  const pantryResult = await loadUserPantryAction();
  const pantryItems = pantryResult.ok ? pantryResult.data : [];

  // Enrich with NEVO names and nutriscore (server-side)
  const itemsWithNames = await Promise.all(
    pantryItems.map(async (item) => {
      try {
        const codeNum = parseInt(item.nevoCode, 10);
        if (isNaN(codeNum)) {
          return { ...item, name: `Onbekend ingrediënt`, nutriscore: null };
        }

        const food = await getNevoFoodByCode(codeNum);
        const name =
          food?.name_nl || food?.name_en || `Onbekend ingrediënt`;
        const nutriscore = food ? calculateNutriScore(food) : null;
        return { ...item, name, nutriscore };
      } catch {
        return { ...item, name: `Onbekend ingrediënt`, nutriscore: null };
      }
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pantry</h1>
        <p className="text-muted-foreground">
          Beheer je voorraad ingrediënten
        </p>
      </div>

      <PantryPageClient items={itemsWithNames} />
    </div>
  );
}
