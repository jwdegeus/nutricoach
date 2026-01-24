"use client";

import type { CustomMealRecord } from "@/src/lib/custom-meals/customMeals.service";
import { ChartBarIcon } from "@heroicons/react/20/solid";

type TopMealsWidgetProps = {
  initialMeals: CustomMealRecord[];
};

export function TopMealsWidget({ initialMeals }: TopMealsWidgetProps) {
  const meals = initialMeals;

  return (
    <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <div className="flex items-center gap-2 mb-4">
        <ChartBarIcon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
          Top 5 Meest Geconsumeerde Maaltijden
        </h2>
      </div>

      {meals.length === 0 ? (
        <div className="text-zinc-500 dark:text-zinc-400 text-sm py-4">
          Nog geen maaltijden geconsumeerd. Begin met het toevoegen van maaltijden!
        </div>
      ) : (
        <div className="space-y-3">
          {meals.map((meal, index) => (
            <div
              key={meal.id}
              className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-semibold text-blue-600 dark:text-blue-400">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-zinc-950 dark:text-white truncate">
                    {meal.name}
                  </div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400 capitalize">
                    {meal.mealSlot}
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0 ml-4">
                <div className="text-lg font-semibold text-zinc-950 dark:text-white">
                  {meal.consumptionCount}x
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  geconsumeerd
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
