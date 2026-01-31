'use client';

import { useState, useCallback } from 'react';
import type { CustomMealRecord } from '@/src/lib/custom-meals/customMeals.service';
import { RecipesList } from './RecipesList';
import type { MealItem } from './RecipesList';

type RecipesPageClientProps = {
  initialMeals: {
    customMeals: CustomMealRecord[];
    mealHistory: unknown[];
  };
};

export function RecipesPageClient({ initialMeals }: RecipesPageClientProps) {
  const [meals, setMeals] = useState(initialMeals);

  // Handle consumption logged - update local state optimistically
  const handleConsumptionLogged = useCallback(
    (mealId: string, source: 'custom' | 'gemini') => {
      // Optimistically update consumption counts in local state
      setMeals((prev) => {
        if (source === 'custom') {
          return {
            ...prev,
            customMeals: prev.customMeals.map((meal) =>
              meal.id === mealId
                ? {
                    ...meal,
                    consumptionCount: (meal.consumptionCount || 0) + 1,
                    lastConsumedAt: new Date().toISOString(),
                    firstConsumedAt:
                      meal.firstConsumedAt || new Date().toISOString(),
                  }
                : meal,
            ),
          };
        } else {
          return {
            ...prev,
            mealHistory: prev.mealHistory.map((meal: unknown) => {
              const m = meal as Record<string, unknown>;
              return m.id === mealId
                ? {
                    ...m,
                    usage_count: (Number(m.usage_count) || 0) + 1,
                    last_used_at: new Date().toISOString(),
                  }
                : meal;
            }),
          };
        }
      });
    },
    [],
  );

  const allMeals: MealItem[] = [
    ...meals.customMeals.map((m) => ({
      ...m,
      source: 'custom' as const,
    })),
    ...meals.mealHistory.map((m: unknown) => ({
      ...(m as Record<string, unknown>),
      source: 'gemini' as const,
    })),
  ];

  return (
    <RecipesList
      meals={allMeals}
      onConsumptionLogged={handleConsumptionLogged}
    />
  );
}
