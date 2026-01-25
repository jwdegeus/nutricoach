"use client";

import { useState, useCallback } from "react";
import { MealsList } from "./MealsList";

type MealsPageClientProps = {
  initialMeals: {
    customMeals: CustomMealRecord[];
    mealHistory: any[];
  };
};

export function MealsPageClient({ initialMeals }: MealsPageClientProps) {
  const [meals, setMeals] = useState(initialMeals);

  // Handle consumption logged - update local state optimistically
  const handleConsumptionLogged = useCallback((mealId: string, source: "custom" | "gemini") => {
    // Optimistically update consumption counts in local state
    setMeals((prev) => {
      if (source === "custom") {
        return {
          ...prev,
          customMeals: prev.customMeals.map((meal) =>
            meal.id === mealId
              ? {
                  ...meal,
                  consumptionCount: (meal.consumptionCount || 0) + 1,
                  lastConsumedAt: new Date().toISOString(),
                  firstConsumedAt: meal.firstConsumedAt || new Date().toISOString(),
                }
              : meal
          ),
        };
      } else {
        return {
          ...prev,
          mealHistory: prev.mealHistory.map((meal) =>
            meal.id === mealId
              ? {
                  ...meal,
                  usage_count: (meal.usage_count || 0) + 1,
                  last_used_at: new Date().toISOString(),
                }
              : meal
          ),
        };
      }
    });
  }, []);

  const allMeals = [
    ...meals.customMeals.map((m) => ({ ...m, source: "custom" as const })),
    ...meals.mealHistory.map((m) => ({ ...m, source: "gemini" as const })),
  ];

  return (
    <MealsList 
      meals={allMeals}
      onConsumptionLogged={handleConsumptionLogged}
    />
  );
}
