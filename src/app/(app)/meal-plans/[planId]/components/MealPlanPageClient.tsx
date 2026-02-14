'use client';

import { useState } from 'react';
import type { MealPlanResponse } from '@/src/lib/diets';
import type { MealPlanEnrichmentResponse } from '@/src/lib/meal-plans/enrichment.types';
import type { MealPlanStatus } from '@/src/lib/meal-plans/mealPlans.types';
import { Text } from '@/components/catalyst/text';
import { MealPlanCards } from './MealPlanCards';
import { ArrowPathIcon } from '@heroicons/react/20/solid';

export type LinkedRecipe = {
  recipeId: string;
  imageUrl: string | null;
  name?: string;
};

type SlotProvenance = Record<string, { source: string; reason?: string }>;

type MealPlanPageClientProps = {
  planId: string;
  plan: MealPlanResponse;
  enrichment?: MealPlanEnrichmentResponse | null;
  nevoFoodNamesByCode: Record<string, string>;
  planStatus?: MealPlanStatus;
  linkedRecipesByMealId?: Record<string, LinkedRecipe>;
  slotProvenance?: SlotProvenance;
};

export function MealPlanPageClient({
  planId,
  plan,
  enrichment,
  nevoFoodNamesByCode,
  planStatus,
  linkedRecipesByMealId = {},
  slotProvenance,
}: MealPlanPageClientProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="space-y-4">
      {isEditing && (
        <div
          className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <ArrowPathIcon className="mt-0.5 h-5 w-5 flex-shrink-0 animate-spin text-muted-foreground" />
          <div className="space-y-1">
            <Text className="text-sm font-medium text-foreground">
              Bezig met aanpassen…
            </Text>
            <Text className="text-xs text-muted-foreground">
              Dit kan even duren; de pagina ververst zodra de wijziging is
              verwerkt.
            </Text>
          </div>
        </div>
      )}
      <MealPlanCards
        planId={planId}
        plan={plan}
        enrichment={enrichment}
        nevoFoodNamesByCode={nevoFoodNamesByCode}
        planStatus={planStatus}
        linkedRecipesByMealId={linkedRecipesByMealId}
        slotProvenance={slotProvenance}
        onEditStarted={() => setIsEditing(true)}
      />
    </div>
  );
}
