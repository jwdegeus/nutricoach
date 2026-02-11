'use client';

import type { CustomMealRecord } from '@/src/lib/custom-meals/customMeals.service';
import { ChartBarIcon } from '@heroicons/react/20/solid';

type TopMealsWidgetProps = {
  initialMeals: CustomMealRecord[];
};

export function TopMealsWidget({ initialMeals }: TopMealsWidgetProps) {
  const meals = initialMeals;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ChartBarIcon className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">
          Top 5 Meest Geconsumeerde Maaltijden
        </h2>
      </div>

      {meals.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          Nog geen maaltijden geconsumeerd. Begin met het toevoegen van
          maaltijden!
        </p>
      ) : (
        <ul className="space-y-2">
          {meals.map((meal, index) => (
            <li
              key={meal.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {meal.name}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {meal.mealSlot}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-foreground tabular-nums">
                  {meal.consumptionCount}×
                </p>
                <p className="text-xs text-muted-foreground">geconsumeerd</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
