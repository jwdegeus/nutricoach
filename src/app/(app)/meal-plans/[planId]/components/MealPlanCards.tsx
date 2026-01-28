'use client';

import type { MealPlanResponse, MealPlanDay } from '@/src/lib/diets';
import type { MealPlanEnrichmentResponse } from '@/src/lib/agents/meal-planner/mealPlannerEnrichment.types';
import { MealCard } from './MealCard';
import { QuickEditBar } from './QuickEditBar';
import { Heading } from '@/components/catalyst/heading';

type MealPlanCardsProps = {
  planId: string;
  plan: MealPlanResponse;
  enrichment?: MealPlanEnrichmentResponse | null;
  nevoFoodNamesByCode: Record<string, string>;
};

export function MealPlanCards({
  planId,
  plan,
  enrichment,
  nevoFoodNamesByCode,
}: MealPlanCardsProps) {
  // Create enrichment map for quick lookup
  const enrichmentMap = new Map<
    string,
    MealPlanEnrichmentResponse['meals'][0]
  >();
  if (enrichment) {
    for (const meal of enrichment.meals) {
      const key = `${meal.date}:${meal.mealSlot}`;
      enrichmentMap.set(key, meal);
    }
  }

  // Helper to get enriched meal
  const getEnrichedMeal = (date: string, slot: string) => {
    return enrichmentMap.get(`${date}:${slot}`);
  };

  // Helper to format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Helper to get meal summary (ingredients or enrichment)
  const getMealSummary = (meal: MealPlanDay['meals'][0]) => {
    const enriched = getEnrichedMeal(meal.date, meal.slot);

    if (enriched) {
      // Use enrichment: show first 2 instructions
      return enriched.instructions.slice(0, 2);
    } else {
      // Fallback: show ingredient names
      if (meal.ingredientRefs && meal.ingredientRefs.length > 0) {
        return meal.ingredientRefs
          .slice(0, 5) // Limit to 5 ingredients
          .map((ref) => {
            const name =
              ref.displayName ||
              nevoFoodNamesByCode[ref.nevoCode] ||
              `NEVO ${ref.nevoCode}`;
            return `${name} (${ref.quantityG}g)`;
          });
      }
      return ['Geen ingrediënten beschikbaar'];
    }
  };

  return (
    <div className="space-y-6">
      <Heading>Maaltijden</Heading>

      {plan.days.map((day) => (
        <div key={day.date} className="space-y-4">
          {/* Day Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{formatDate(day.date)}</h2>
            <QuickEditBar planId={planId} date={day.date} />
          </div>

          {/* Meal Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {day.meals.map((meal) => {
              const enriched = getEnrichedMeal(meal.date, meal.slot);
              const summaryLines = getMealSummary(meal);

              // Get cook plan for this day
              const cookPlan = enrichment?.cookPlanDays?.find(
                (cp) => cp.date === meal.date,
              );

              return (
                <MealCard
                  key={meal.id}
                  planId={planId}
                  date={meal.date}
                  mealSlot={meal.slot}
                  mealId={meal.id}
                  meal={meal}
                  title={enriched?.title || meal.name}
                  summaryLines={summaryLines}
                  prepTime={enriched?.prepTimeMin}
                  cookTime={enriched?.cookTimeMin}
                  macros={meal.estimatedMacros}
                  enrichedMeal={enriched}
                  cookPlanDay={cookPlan}
                  nevoFoodNamesByCode={nevoFoodNamesByCode}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
