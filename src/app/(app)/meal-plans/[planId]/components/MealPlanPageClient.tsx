'use client';

import type { MealPlanResponse } from '@/src/lib/diets';
import type { MealPlanEnrichmentResponse } from '@/src/lib/agents/meal-planner/mealPlannerEnrichment.types';
import { MealPlanCards } from './MealPlanCards';

type MealPlanPageClientProps = {
  planId: string;
  plan: MealPlanResponse;
  enrichment?: MealPlanEnrichmentResponse | null;
  nevoFoodNamesByCode: Record<string, string>;
};

export function MealPlanPageClient({
  planId,
  plan,
  enrichment,
  nevoFoodNamesByCode,
}: MealPlanPageClientProps) {
  return (
    <MealPlanCards
      planId={planId}
      plan={plan}
      enrichment={enrichment}
      nevoFoodNamesByCode={nevoFoodNamesByCode}
    />
  );
}
