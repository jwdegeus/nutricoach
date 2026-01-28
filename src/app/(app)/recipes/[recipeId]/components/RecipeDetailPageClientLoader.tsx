'use client';

import dynamic from 'next/dynamic';

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
};

export function RecipeDetailPageClientLoader({ mealId, mealSource }: Props) {
  return <RecipeDetailPageClient mealId={mealId} mealSource={mealSource} />;
}
