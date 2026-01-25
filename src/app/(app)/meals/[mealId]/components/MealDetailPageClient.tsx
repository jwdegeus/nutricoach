"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/components/catalyst/heading";
import { Button } from "@/components/catalyst/button";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { MealDetail } from "./MealDetail";
import { getMealByIdAction } from "../../actions/meals.actions";
import { getNevoFoodByCode } from "@/src/lib/nevo/nutrition-calculator";

type MealDetailPageClientProps = {
  mealId: string;
  mealSource: "custom" | "gemini";
};

export function MealDetailPageClient({ mealId, mealSource }: MealDetailPageClientProps) {
  const router = useRouter();
  const [meal, setMeal] = useState<any>(null);
  const [nevoFoodNamesByCode, setNevoFoodNamesByCode] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadMeal() {
      try {
        setLoading(true);
        setError(null);

        // Load meal
        const mealResult = await getMealByIdAction(mealId, mealSource);

        if (!mealResult.ok) {
          if (mealResult.error.code === "AUTH_ERROR") {
            router.push("/login");
            return;
          }
          setError(mealResult.error.message);
          setLoading(false);
          return;
        }

        if (!isMounted) return;

        const loadedMeal = mealResult.data;
        setMeal(loadedMeal);

        // Build NEVO food names map
        const nevoCodes = new Set<string>();
        const mealData = loadedMeal.mealData || loadedMeal.meal_data;
        if (mealData?.ingredientRefs) {
          for (const ref of mealData.ingredientRefs) {
            nevoCodes.add(ref.nevoCode);
          }
        }

        const namesMap: Record<string, string> = {};
        for (const code of nevoCodes) {
          try {
            const codeNum = parseInt(code, 10);
            if (!isNaN(codeNum)) {
              // Note: getNevoFoodByCode is server-only, so we'll need to fetch via API
              // For now, just use the displayName or code
              namesMap[code] = `NEVO ${code}`;
            } else {
              namesMap[code] = `NEVO ${code}`;
            }
          } catch {
            namesMap[code] = `NEVO ${code}`;
          }
        }

        // Try to get names from ingredientRefs displayName
        if (mealData?.ingredientRefs) {
          for (const ref of mealData.ingredientRefs) {
            if (ref.displayName) {
              namesMap[ref.nevoCode] = ref.displayName;
            }
          }
        }

        if (!isMounted) return;
        setNevoFoodNamesByCode(namesMap);
        setLoading(false);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Onbekende fout");
        setLoading(false);
      }
    }

    loadMeal();

    return () => {
      isMounted = false;
    };
  }, [mealId, mealSource, router]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/meals">
            <Button outline>
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              Terug naar maaltijden
            </Button>
          </Link>
          <Heading level={1}>Laden...</Heading>
        </div>
        <div className="text-center py-12">
          <p className="text-zinc-500 dark:text-zinc-400">Maaltijd details worden geladen...</p>
        </div>
      </div>
    );
  }

  if (error || !meal) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/meals">
            <Button outline>
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              Terug naar maaltijden
            </Button>
          </Link>
          <Heading level={1}>Fout</Heading>
        </div>
        <div className="text-center py-12">
          <p className="text-red-600 dark:text-red-400">
            {error || "Maaltijd niet gevonden"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/meals">
          <Button outline>
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Terug naar maaltijden
          </Button>
        </Link>
        <Heading level={1}>
          {meal.name || meal.mealName || meal.meal_name || "Maaltijd Details"}
        </Heading>
      </div>

      <MealDetail 
        meal={meal} 
        mealSource={mealSource}
        nevoFoodNamesByCode={nevoFoodNamesByCode}
      />
    </div>
  );
}
