"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { ClockIcon, UserGroupIcon, CheckIcon } from "@heroicons/react/20/solid";
import { logMealConsumptionAction } from "../actions/meals.actions";
import type { CustomMealRecord } from "@/src/lib/custom-meals/customMeals.service";
import type { MealSlot } from "@/src/lib/diets";

type MealItem = (CustomMealRecord & { source: "custom" }) | (any & { source: "gemini" });

type MealsListProps = {
  meals: MealItem[];
  onConsumptionLogged?: () => void;
};

export function MealsList({ meals, onConsumptionLogged }: MealsListProps) {
  const router = useRouter();
  const [loggingMealId, setLoggingMealId] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  const handleLogConsumption = async (meal: MealItem) => {
    // Prevent double submission
    if (loggingMealId) {
      return;
    }

    setLoggingMealId(meal.id);
    
    // Clear any pending refresh
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    try {
      const result = await logMealConsumptionAction({
        customMealId: meal.source === "custom" ? meal.id : undefined,
        mealHistoryId: meal.source === "gemini" ? meal.id : undefined,
        mealName: meal.name || meal.meal_name,
        mealSlot: (meal.mealSlot || meal.meal_slot) as MealSlot,
      });

      if (result.ok) {
        // Update local state optimistically instead of full page refresh
        // This prevents infinite reload loops
        if (onConsumptionLogged) {
          onConsumptionLogged();
        }
        // Use a delayed refresh to update server data without causing loops
        // Only refresh once, even if multiple consumptions are logged quickly
        if (!refreshTimeoutRef.current) {
          refreshTimeoutRef.current = setTimeout(() => {
            router.refresh();
            refreshTimeoutRef.current = null;
          }, 500); // Increased delay to batch multiple updates
        }
      } else {
        alert(`Fout: ${result.error.message}`);
      }
    } catch (error) {
      alert(`Fout: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoggingMealId(null);
    }
  };
  if (meals.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500 dark:text-zinc-400">
          Nog geen maaltijden. Voeg je eerste maaltijd toe via een foto, screenshot of bestand.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {meals.map((meal) => (
        <div key={meal.id} className="rounded-lg bg-white p-4 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">
              {meal.name || meal.meal_name}
            </h3>
            <Badge color={meal.source === "custom" ? "blue" : "zinc"}>
              {meal.source === "custom" ? "Custom" : "Gemini"}
            </Badge>
          </div>

          <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="font-medium">Slot:</span>
              <span className="capitalize">
                {meal.mealSlot || meal.meal_slot}
              </span>
            </div>

            {meal.source === "custom" && (
              <>
                {meal.mealData?.prepTime && (
                  <div className="flex items-center gap-2">
                    <ClockIcon className="h-4 w-4" />
                    <span>{meal.mealData.prepTime} min</span>
                  </div>
                )}

                {meal.mealData?.servings && (
                  <div className="flex items-center gap-2">
                    <UserGroupIcon className="h-4 w-4" />
                    <span>{meal.mealData.servings} porties</span>
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                  <span className="font-medium">
                    {meal.consumptionCount || 0}x geconsumeerd
                  </span>
                  <Button
                    size="sm"
                    onClick={() => handleLogConsumption(meal)}
                    disabled={loggingMealId === meal.id}
                  >
                    {loggingMealId === meal.id ? (
                      "Loggen..."
                    ) : (
                      <>
                        <CheckIcon className="h-4 w-4 mr-1" />
                        Geconsumeerd
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}

            {meal.source === "gemini" && (
              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                <span className="font-medium">
                  {meal.usage_count || 0}x gebruikt
                </span>
                <Button
                  size="sm"
                  onClick={() => handleLogConsumption(meal)}
                  disabled={loggingMealId === meal.id}
                >
                  {loggingMealId === meal.id ? (
                    "Loggen..."
                  ) : (
                    <>
                      <CheckIcon className="h-4 w-4 mr-1" />
                      Geconsumeerd
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
