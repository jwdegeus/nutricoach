"use client";

import { useState, useCallback } from "react";
import { RecipesList } from "./RecipesList";
import type { CustomMealRecord } from "@/src/lib/custom-meals/customMeals.service";

type RecipesPageClientProps = {
  initialMeals: {
    customMeals: CustomMealRecord[];
    mealHistory: any[];
  };
};

export function RecipesPageClient({ initialMeals }: RecipesPageClientProps) {
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

  // Handle diet type updated - update local state optimistically
  const handleDietTypeUpdated = useCallback((mealId: string, source: "custom" | "gemini", dietTypeName: string | null) => {
    setMeals((prev) => {
      if (source === "custom") {
        return {
          ...prev,
          customMeals: prev.customMeals.map((meal) =>
            meal.id === mealId
              ? {
                  ...meal,
                  dietKey: dietTypeName,
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
                  diet_key: dietTypeName,
                }
              : meal
          ),
        };
      }
    });
  }, []);

  // Handle meal deleted - remove from local state
  const handleMealDeleted = useCallback((mealId: string, source: "custom" | "gemini") => {
    setMeals((prev) => {
      if (source === "custom") {
        return {
          ...prev,
          customMeals: prev.customMeals.filter((meal) => meal.id !== mealId),
        };
      } else {
        return {
          ...prev,
          mealHistory: prev.mealHistory.filter((meal) => meal.id !== mealId),
        };
      }
    });
  }, []);

  // Handle rating updated - update local state optimistically
  const handleRatingUpdated = useCallback((mealId: string, source: "custom" | "gemini", rating: number | null) => {
    setMeals((prev) => {
      if (source === "custom") {
        return {
          ...prev,
          customMeals: prev.customMeals.map((meal) =>
            meal.id === mealId
              ? {
                  ...meal,
                  userRating: rating,
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
                  user_rating: rating,
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
    <RecipesList 
      meals={allMeals}
      onConsumptionLogged={handleConsumptionLogged}
      onDietTypeUpdated={handleDietTypeUpdated}
      onMealDeleted={handleMealDeleted}
      onRatingUpdated={handleRatingUpdated}
    />
  );
}
