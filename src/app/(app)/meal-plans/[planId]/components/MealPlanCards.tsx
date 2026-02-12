'use client';

import type { MealPlanResponse, MealPlanDay } from '@/src/lib/diets';
import type { MealPlanEnrichmentResponse } from '@/src/lib/agents/meal-planner/mealPlannerEnrichment.types';
import type { MealPlanStatus } from '@/src/lib/meal-plans/mealPlans.types';
import type { LinkedRecipe } from './MealPlanPageClient';
import { MealCard } from './MealCard';
import { QuickEditBar } from './QuickEditBar';
import { Heading } from '@/components/catalyst/heading';

type SlotProvenance = Record<string, { source: string; reason?: string }>;

type MealPlanCardsProps = {
  planId: string;
  plan: MealPlanResponse;
  enrichment?: MealPlanEnrichmentResponse | null;
  nevoFoodNamesByCode: Record<string, string>;
  planStatus?: MealPlanStatus;
  linkedRecipesByMealId?: Record<string, LinkedRecipe>;
  slotProvenance?: SlotProvenance;
  /** Called when a per-meal edit (Wissel/Verwijder/QuickEditBar) is started */
  onEditStarted?: () => void;
};

export function MealPlanCards({
  planId,
  plan,
  enrichment,
  nevoFoodNamesByCode,
  planStatus,
  linkedRecipesByMealId = {},
  slotProvenance,
  onEditStarted,
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
              (ref.nevoCode && nevoFoodNamesByCode[ref.nevoCode]) ||
              (ref.nevoCode ? `NEVO ${ref.nevoCode}` : null) ||
              (ref.customFoodId
                ? `Ingrediënt`
                : ref.fdcId
                  ? `Ingrediënt`
                  : 'Onbekend');
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
            <QuickEditBar
              planId={planId}
              date={day.date}
              onEditStarted={onEditStarted}
            />
          </div>

          {/* Meal Cards Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {day.meals.map((meal) => {
              const enriched = getEnrichedMeal(meal.date, meal.slot);
              const summaryLines = getMealSummary(meal);

              // Get cook plan for this day
              const cookPlan = enrichment?.cookPlanDays?.find(
                (cp) => cp.date === meal.date,
              );

              const linkedRecipe = linkedRecipesByMealId[meal.id];
              const provKey = `${meal.date}-${meal.slot}`;
              const provenanceSource = slotProvenance?.[provKey]?.source;
              // Alleen "Database" tonen als er een gekoppeld recept bestaat. slotProvenance 'db'
              // kan betekenen: uit meal_history (waar óók AI-maaltijden uit vorige plannen terechtkomen),
              // dus dat is niet hetzelfde als "bestaat in receptendatabase".
              const sourceFromProvenance = linkedRecipe
                ? 'db'
                : provenanceSource === 'ai'
                  ? 'ai'
                  : undefined;
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
                  linkedRecipe={linkedRecipe}
                  sourceFromProvenance={sourceFromProvenance}
                  cookPlanDay={cookPlan}
                  nevoFoodNamesByCode={nevoFoodNamesByCode}
                  planStatus={planStatus}
                  onEditStarted={onEditStarted}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
