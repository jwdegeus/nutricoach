'use server';

import { createClient } from '@/src/lib/supabase/server';
import { CustomMealsService } from '@/src/lib/custom-meals/customMeals.service';
import type { Meal } from '@/src/lib/diets';
import type { EnrichedMeal } from '@/src/lib/agents/meal-planner/mealPlannerEnrichment.types';

export type AddMealToRecipesResult =
  | { ok: true; recipeId: string }
  | { ok: false; error: { code: string; message: string } };

/**
 * Save a meal from a meal plan to the user's recipes database (custom_meals + recipe_ingredients).
 * Verifies the user owns the plan, then creates a new recipe from the meal and optional enrichment.
 */
export async function addMealToRecipesAction(args: {
  planId: string;
  meal: Meal;
  enrichedMeal?: EnrichedMeal | null;
  nevoFoodNamesByCode?: Record<string, string>;
}): Promise<AddMealToRecipesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn.' },
    };
  }

  const { planId, meal, enrichedMeal, nevoFoodNamesByCode = {} } = args;

  if (!meal.name?.trim()) {
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Maaltijdnaam ontbreekt.' },
    };
  }

  if (!meal.ingredientRefs?.length) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Maaltijd heeft geen ingrediënten.',
      },
    };
  }

  // Verify user owns the plan
  const { data: planRow, error: planError } = await supabase
    .from('meal_plans')
    .select('id, user_id')
    .eq('id', planId)
    .single();

  if (planError || !planRow) {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Menu niet gevonden.',
      },
    };
  }

  if ((planRow as { user_id: string }).user_id !== user.id) {
    return {
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Je hebt geen toegang tot dit menu.',
      },
    };
  }

  const customMealsService = new CustomMealsService();

  const mealData: Meal = {
    id: meal.id,
    name: meal.name,
    slot: meal.slot,
    date: meal.date,
    ingredientRefs: meal.ingredientRefs,
    estimatedMacros: meal.estimatedMacros,
    prepTime: meal.prepTime,
    servings: meal.servings,
  };

  const aiAnalysis =
    enrichedMeal && enrichedMeal.instructions?.length
      ? {
          instructions: enrichedMeal.instructions,
          prepTimeMin: enrichedMeal.prepTimeMin,
          cookTimeMin: enrichedMeal.cookTimeMin,
          servings: enrichedMeal.servings,
          kitchenNotes: enrichedMeal.kitchenNotes,
        }
      : undefined;

  const record = await customMealsService.createMeal({
    userId: user.id,
    name: meal.name.trim(),
    mealSlot: meal.slot,
    sourceType: 'meal_plan',
    mealData,
    aiAnalysis: aiAnalysis ?? undefined,
  });

  // Insert recipe_ingredients from ingredientRefs (alleen refs met nevoCode; recipe_ingredients is NEVO-only)
  const inserts = meal.ingredientRefs
    .filter((ref) => ref.nevoCode?.trim())
    .map((ref) => {
      const nevo = ref.nevoCode!.trim();
      const name =
        ref.displayName?.trim() || nevoFoodNamesByCode[nevo] || `NEVO ${nevo}`;
      const quantity = Number(ref.quantityG);
      const nevoId = parseInt(nevo, 10);
      return {
        recipe_id: record.id,
        user_id: user.id,
        original_line: `${Number.isFinite(quantity) ? quantity : 0} g ${name}`,
        quantity: Number.isFinite(quantity) ? quantity : null,
        unit: 'g',
        name,
        note: null,
        nevo_food_id: Number.isNaN(nevoId) ? null : nevoId,
      };
    });

  if (inserts.length > 0) {
    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .insert(inserts);

    if (ingError) {
      // Recipe was created; log and continue (user can fix ingredients on recipe page)
      console.error(
        '[addMealToRecipes] recipe_ingredients insert failed:',
        ingError,
      );
    }
  }

  // Bron + koppeling meal plan zodat wijzigingen in recept (foto, ingrediënten) in het plan zichtbaar zijn
  const { error: linkError } = await supabase
    .from('custom_meals')
    .update({
      source: 'AI gegenereerd',
      linked_meal_plan_id: planId,
      linked_meal_plan_meal_id: meal.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', record.id)
    .eq('user_id', user.id);

  if (linkError) {
    console.error('[addMealToRecipes] set source/link failed:', linkError);
  }

  return { ok: true, recipeId: record.id };
}
