'use client';

import { Heading } from '@/components/catalyst/heading';
import type { MealPlanRecord } from '@/src/lib/meal-plans/mealPlans.types';
type MealPlanSummaryProps = {
  plan: MealPlanRecord;
  dietTypeName: string;
};

export function MealPlanSummary({ plan, dietTypeName }: MealPlanSummaryProps) {
  // Calculate end date
  const startDate = new Date(plan.dateFrom);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.days - 1);
  const endDateStr = endDate.toISOString().split('T')[0];

  // Count total meals
  const totalMeals = plan.planSnapshot.days.reduce(
    (sum, day) => sum + day.meals.length,
    0,
  );

  // Check if enrichment exists
  const hasEnrichment = plan.enrichmentSnapshot !== null;

  // Calculate total macros if available
  const totalMacros = plan.planSnapshot.days.reduce(
    (acc, day) => {
      day.meals.forEach((meal) => {
        if (meal.estimatedMacros) {
          acc.calories += meal.estimatedMacros.calories || 0;
          acc.protein += meal.estimatedMacros.protein || 0;
          acc.carbs += meal.estimatedMacros.carbs || 0;
          acc.fat += meal.estimatedMacros.fat || 0;
        }
      });
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Heading>Plan Overzicht</Heading>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Periode</div>
              <div className="font-medium">
                {plan.dateFrom} tot {endDateStr}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Aantal Dagen</div>
              <div className="font-medium">{plan.days} dagen</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Dieet Type</div>
              <div className="font-medium">{dietTypeName}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">
                Totaal Maaltijden
              </div>
              <div className="font-medium">{totalMeals} maaltijden</div>
            </div>
          </div>

          {totalMacros.calories > 0 && (
            <div className="pt-4 border-t">
              <div className="text-sm text-muted-foreground mb-2">
                Geschatte Totalen (per dag gemiddeld)
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Calorieën</div>
                  <div className="font-medium">
                    {Math.round(totalMacros.calories / plan.days)} kcal
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Eiwit</div>
                  <div className="font-medium">
                    {Math.round(totalMacros.protein / plan.days)}g
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Koolhydraten</div>
                  <div className="font-medium">
                    {Math.round(totalMacros.carbs / plan.days)}g
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Vet</div>
                  <div className="font-medium">
                    {Math.round(totalMacros.fat / plan.days)}g
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasEnrichment && (
            <div className="pt-4 border-t">
              <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                <span className="font-medium">✓</span>
                <span>
                  Enrichment beschikbaar (titels, instructies, cook plan)
                </span>
              </div>
            </div>
          )}

          {!hasEnrichment && (
            <div className="pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                ⚠ Enrichment nog niet beschikbaar (titels en instructies worden
                gegenereerd)
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
