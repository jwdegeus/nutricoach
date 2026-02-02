'use client';

import type { MealPlanResponse } from '@/src/lib/diets';
import type { MealPlanEnrichmentResponse } from '@/src/lib/agents/meal-planner/mealPlannerEnrichment.types';
import type { MealPlanStatus } from '@/src/lib/meal-plans/mealPlans.types';
import { MealPlanCards } from './MealPlanCards';

type MealPlanPageClientProps = {
  planId: string;
  plan: MealPlanResponse;
  enrichment?: MealPlanEnrichmentResponse | null;
  nevoFoodNamesByCode: Record<string, string>;
  planStatus?: MealPlanStatus;
};

export function MealPlanPageClient({
  planId,
  plan,
  enrichment,
  nevoFoodNamesByCode,
  planStatus,
}: MealPlanPageClientProps) {
  return (
    <MealPlanCards
      planId={planId}
      plan={plan}
      enrichment={enrichment}
      nevoFoodNamesByCode={nevoFoodNamesByCode}
      planStatus={planStatus}
    />
  );
}
