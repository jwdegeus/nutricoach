"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/components/catalyst/heading";
import { Button } from "@/components/catalyst/button";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { MealDetail } from "./MealDetail";
import { getMealByIdAction } from "../../actions/meals.actions";
import { getNevoFoodByCode } from "@/src/lib/nevo/nutrition-calculator";

type RecipeDetailPageClientProps = {
  mealId: string;
  mealSource: "custom" | "gemini";
};

export function RecipeDetailPageClient({ mealId, mealSource }: RecipeDetailPageClientProps) {
  const router = useRouter();
  const [meal, setMeal] = useState<any>(null);
  const [nevoFoodNamesByCode, setNevoFoodNamesByCode] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Define loadMeal function that can be called from multiple places
  const loadMeal = useCallback(async () => {
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

      const loadedMeal = mealResult.data;
      console.log("[MealDetailPageClient] Meal loaded:", {
        id: loadedMeal.id,
        name: loadedMeal.name,
        sourceImageUrl: loadedMeal.sourceImageUrl,
        source_image_url: loadedMeal.source_image_url,
        sourceImagePath: loadedMeal.sourceImagePath,
        source_image_path: loadedMeal.source_image_path,
        allKeys: Object.keys(loadedMeal),
        fullMeal: JSON.stringify(loadedMeal, null, 2).substring(0, 500),
      });
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

      setNevoFoodNamesByCode(namesMap);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
      setLoading(false);
    }
  }, [mealId, mealSource, router]);

  // Listen for recipe source updates
  useEffect(() => {
    if (!meal) return; // Only listen if meal is loaded

    const handleSourceUpdate = (event?: CustomEvent | MessageEvent) => {
      // Reload meal data when source is updated
      const detail = (event as CustomEvent)?.detail || (event as MessageEvent)?.data;
      console.log("Recipe source updated event received, reloading meal data...", detail);
      
      // Force reload after a short delay to ensure database is updated
      setTimeout(() => {
        console.log("Reloading meal data after source update...");
        loadMeal();
      }, 1000);
    };

    // Use BroadcastChannel for cross-tab communication
    let broadcastChannel: BroadcastChannel | null = null;
    
    if (typeof window !== "undefined") {
      // Listen to custom event
      const eventHandler = handleSourceUpdate as EventListener;
      window.addEventListener("recipeSourceUpdated", eventHandler);
      
      // Also listen to BroadcastChannel
      try {
        broadcastChannel = new BroadcastChannel("recipe-source-updates");
        broadcastChannel.onmessage = handleSourceUpdate;
      } catch (e) {
        console.log("BroadcastChannel not supported, using events only");
      }
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("recipeSourceUpdated", handleSourceUpdate as EventListener);
      }
      if (broadcastChannel) {
        broadcastChannel.close();
      }
    };
  }, [meal, loadMeal]);

  // Initial load
  useEffect(() => {
    // Validate mealId
    if (!mealId || mealId === "undefined" || mealId.trim() === "") {
      setError("Recept ID is vereist");
      setLoading(false);
      return;
    }

    loadMeal();
  }, [mealId, mealSource, loadMeal]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/recipes">
            <Button outline>
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              Terug naar recepten
            </Button>
          </Link>
          <Heading level={1}>Laden...</Heading>
        </div>
        <div className="text-center py-12">
          <p className="text-zinc-500 dark:text-zinc-400">Recept details worden geladen...</p>
        </div>
      </div>
    );
  }

  if (error || !meal) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/recipes">
            <Button outline>
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              Terug naar recepten
            </Button>
          </Link>
          <Heading level={1}>Fout</Heading>
        </div>
        <div className="text-center py-12">
          <p className="text-red-600 dark:text-red-400">
            {error || "Recept niet gevonden"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/recipes">
          <Button outline>
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Terug naar recepten
          </Button>
        </Link>
        <Heading level={1}>
          {meal.name || meal.mealName || meal.meal_name || "Recept Details"}
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
