'use client';

import dynamic from 'next/dynamic';
import type { ResolvedIngredientMatch } from '../actions/ingredient-matching.actions';

const RecipeDetailPageClient = dynamic(
  () =>
    import('./MealDetailPageClient').then((mod) => ({
      default: mod.RecipeDetailPageClient,
    })),
  { ssr: false },
);

type Props = {
  mealId: string;
  mealSource: 'custom' | 'gemini';
  initialMeal?: Record<string, unknown> | null;
  initialResolvedLegacyMatches?: (ResolvedIngredientMatch | null)[] | null;
};

export function RecipeDetailPageClientLoader({
  mealId,
  mealSource,
  initialMeal,
  initialResolvedLegacyMatches,
}: Props) {
  return (
    <RecipeDetailPageClient
      mealId={mealId}
      mealSource={mealSource}
      initialMeal={initialMeal}
      initialResolvedLegacyMatches={initialResolvedLegacyMatches}
    />
  );
}
