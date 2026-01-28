import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { CustomMealsService } from '@/src/lib/custom-meals/customMeals.service';
import { RecipesPageClient } from './components/RecipesPageClient';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/catalyst/button';
import { Link } from '@/components/catalyst/link';
import { PlusIcon } from '@heroicons/react/16/solid';
import {
  getTermsForCategoryCodes,
  filterMealsByIngredientTerms,
} from '@/src/lib/ingredient-categories/get-terms-for-codes';
import {
  getRecipeComplianceScoresAction,
  type RecipeComplianceResult,
} from './actions/recipe-compliance.actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('recipes');
  return {
    title: t('pageTitle'),
    description: t('pageDescription'),
  };
}

// Prevent automatic revalidation and caching issues
export const dynamic = 'force-dynamic';
export const revalidate = false;
export const fetchCache = 'force-no-store';

type RecipesPageProps = {
  searchParams: Promise<{ categories?: string; categoryNames?: string }>;
};

export default async function RecipesPage({ searchParams }: RecipesPageProps) {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Load meals directly (not using server action to avoid POST request loops)
  type PageData = {
    customMealsWithRatings: Awaited<
      ReturnType<CustomMealsService['getUserMeals']>
    >;
    mealHistory: unknown[] | null;
    complianceScores: Record<string, RecipeComplianceResult>;
    categoryFilter: { categoryNames: string[] } | undefined;
    t: Awaited<ReturnType<typeof getTranslations>>;
  };
  let data: PageData | null = null;
  let loadError: unknown = null;

  try {
    const service = new CustomMealsService();
    let customMeals = await service.getUserMeals(user.id);

    const params = await searchParams;
    const categoryCodes = (params.categories ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const categoryNames = (params.categoryNames ?? '')
      .split(',')
      .map((s) => decodeURIComponent(s.trim()))
      .filter(Boolean);
    let categoryFilter: { categoryNames: string[] } | undefined;
    if (categoryCodes.length > 0) {
      const terms = await getTermsForCategoryCodes(categoryCodes);
      customMeals = filterMealsByIngredientTerms(customMeals, terms);
      categoryFilter = {
        categoryNames: categoryNames.length > 0 ? categoryNames : categoryCodes,
      };
    }

    const { data: mealHistory } = await supabase
      .from('meal_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const customMealIds = customMeals.map((m) => m.id);
    const { data: customMealRatings } = await supabase
      .from('meal_history')
      .select('meal_id, user_rating')
      .eq('user_id', user.id)
      .in('meal_id', customMealIds.length > 0 ? customMealIds : ['no-match']);

    const ratingMap = new Map(
      (customMealRatings || []).map((r) => [r.meal_id, r.user_rating]),
    );
    const customMealsWithRatings = customMeals.map((meal) => ({
      ...meal,
      userRating: ratingMap.get(meal.id) || null,
    }));

    const complianceItems = [
      ...customMealsWithRatings.map((m) => {
        const base = m.mealData ?? {};
        const instructions = m.aiAnalysis?.instructions;
        const mealData =
          Array.isArray(instructions) && instructions.length > 0
            ? { ...base, instructions }
            : base;
        return { id: m.id, source: 'custom' as const, mealData };
      }),
      ...(mealHistory || []).map(
        (m: {
          id: string;
          meal_data?: unknown;
          ai_analysis?: { instructions?: unknown };
        }) => {
          const base = m.meal_data ?? {};
          const instructions = m.ai_analysis?.instructions;
          const meal_data =
            Array.isArray(instructions) && instructions.length > 0
              ? {
                  ...(typeof base === 'object' && base !== null ? base : {}),
                  instructions,
                }
              : base;
          return { id: m.id, source: 'gemini' as const, meal_data };
        },
      ),
    ];
    const complianceResult =
      await getRecipeComplianceScoresAction(complianceItems);
    const complianceScores = complianceResult.ok ? complianceResult.data : {};

    const t = await getTranslations('recipes');
    data = {
      customMealsWithRatings,
      mealHistory,
      complianceScores,
      categoryFilter,
      t,
    };
  } catch (e) {
    loadError = e;
  }

  if (loadError !== null) {
    const t = await getTranslations('recipes');
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold tracking-tight mb-4">
          {t('pageTitle')}
        </h1>
        <div className="text-red-600">
          {t('error')}:{' '}
          {loadError instanceof Error ? loadError.message : t('unknownError')}
        </div>
      </div>
    );
  }

  const d = data!;
  return (
    <div className="w-full max-w-none">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          {d.t('pageTitle')}
        </h1>
        <Link href="/recipes/import">
          <Button color="primary">
            <PlusIcon className="h-4 w-4 mr-2" />
            {d.t('addRecipe')}
          </Button>
        </Link>
      </div>
      <RecipesPageClient
        initialMeals={{
          customMeals: d.customMealsWithRatings,
          mealHistory: d.mealHistory || [],
        }}
        initialComplianceScores={d.complianceScores}
        categoryFilter={d.categoryFilter}
      />
    </div>
  );
}
