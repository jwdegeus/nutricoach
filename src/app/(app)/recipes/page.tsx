import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { CustomMealsService } from "@/src/lib/custom-meals/customMeals.service";
import { RecipesPageClient } from "./components/RecipesPageClient";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/catalyst/button";
import { Link } from "@/components/catalyst/link";
import { PlusIcon } from "@heroicons/react/16/solid";

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

export default async function RecipesPage() {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Load meals directly (not using server action to avoid POST request loops)
  try {
    const service = new CustomMealsService();
    const customMeals = await service.getUserMeals(user.id);

    // Also get meal history
    const { data: mealHistory } = await supabase
      .from("meal_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // Get ratings for custom meals from meal_history
    // Custom meals can be rated, and ratings are stored in meal_history with meal_id = custom_meal.id
    const customMealIds = customMeals.map((m) => m.id);
    const { data: customMealRatings } = await supabase
      .from("meal_history")
      .select("meal_id, user_rating")
      .eq("user_id", user.id)
      .in("meal_id", customMealIds.length > 0 ? customMealIds : ["no-match"]);

    // Map ratings to custom meals
    const ratingMap = new Map(
      (customMealRatings || []).map((r) => [r.meal_id, r.user_rating])
    );
    const customMealsWithRatings = customMeals.map((meal) => ({
      ...meal,
      userRating: ratingMap.get(meal.id) || null,
    }));

    const t = await getTranslations('recipes');

    return (
      <div className="w-full max-w-none">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
          <Link href="/recipes/import">
            <Button color="primary">
              <PlusIcon className="h-4 w-4 mr-2" />
              {t('addRecipe')}
            </Button>
          </Link>
        </div>
        <RecipesPageClient 
          initialMeals={{
            customMeals: customMealsWithRatings,
            mealHistory: mealHistory || [],
          }} 
        />
      </div>
    );
  } catch (error) {
    const t = await getTranslations('recipes');
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold tracking-tight mb-4">{t('pageTitle')}</h1>
        <div className="text-red-600">
          {t('error')}: {error instanceof Error ? error.message : t('unknownError')}
        </div>
      </div>
    );
  }
}
