import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { RecipeDetailPageClientLoader } from './components/RecipeDetailPageClientLoader';
import { getMealByIdAction } from '../actions/meals.actions';
import {
  getResolvedIngredientMatchesAction,
  type ResolvedIngredientMatch,
} from './actions/ingredient-matching.actions';
import { buildLineOptionsFromIngredients } from './utils/ingredient-line-options';

export const metadata: Metadata = {
  title: 'Recept Details | NutriCoach',
  description: 'Bekijk details van een recept',
};

// Prevent automatic revalidation and caching issues
export const dynamic = 'force-dynamic';
export const revalidate = false;
export const fetchCache = 'force-no-store';

type PageProps = {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ source?: string }>;
};

/**
 * Recipe detail page - prefetches meal + ingredient matches on server voor snellere TTI
 */
export default async function RecipeDetailPage({
  params,
  searchParams,
}: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { recipeId } = await params;
  const { source } = await searchParams;
  const mealSource = (source === 'gemini' ? 'gemini' : 'custom') as
    | 'custom'
    | 'gemini';

  if (!recipeId || recipeId === 'undefined') {
    redirect('/recipes');
  }

  let initialMeal: Record<string, unknown> | null = null;
  let initialResolvedLegacyMatches: (ResolvedIngredientMatch | null)[] | null =
    null;

  const mealResult = await getMealByIdAction(recipeId, mealSource);
  if (mealResult.ok) {
    const meal = mealResult.data as Record<string, unknown>;
    initialMeal = meal;
    const mealData = (meal.mealData ?? meal.meal_data) as
      | {
          ingredients?: Array<{
            name?: string;
            original_line?: string;
            quantity?: string | number;
            amount?: string | number;
            unit?: string | null;
          }>;
        }
      | null
      | undefined;
    const ingredients = mealData?.ingredients ?? [];
    if (ingredients.length > 0) {
      const lineOptions = buildLineOptionsFromIngredients(ingredients);
      const matchResult = await getResolvedIngredientMatchesAction(lineOptions);
      if (matchResult.ok) {
        initialResolvedLegacyMatches = matchResult.data;
      }
    }
  }

  return (
    <RecipeDetailPageClientLoader
      mealId={recipeId}
      mealSource={mealSource}
      initialMeal={initialMeal}
      initialResolvedLegacyMatches={initialResolvedLegacyMatches}
    />
  );
}
