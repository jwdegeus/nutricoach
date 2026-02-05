'use server';

import { getCatalogOptionsForPickerAction } from './catalog-options.actions';
import type { CatalogOptionPickerItem } from './catalog-options.actions';
import { getRecipeSourcesForPickerAction } from './recipe-sources.actions';
import type { RecipeSourcePickerItem } from './recipe-sources.actions';

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: string; message: string };
    };

export type ClassificationPickerData = {
  mealSlotOptions: CatalogOptionPickerItem[];
  cuisineOptions: CatalogOptionPickerItem[];
  proteinTypeOptions: CatalogOptionPickerItem[];
  recipeBookOptions: CatalogOptionPickerItem[];
  sourceOptions: RecipeSourcePickerItem[];
};

/**
 * Load all classification dialog picker data in one server round-trip.
 * Runs the 5 fetches in parallel on the server to avoid 5 separate client→server calls.
 */
export async function getClassificationPickerDataAction(args: {
  mealSlotOptionId?: string | null;
  mealSlot?: string;
  cuisineOptionId?: string | null;
  proteinTypeOptionId?: string | null;
  recipeBookOptionId?: string | null;
}): Promise<ActionResult<ClassificationPickerData>> {
  const {
    mealSlotOptionId,
    mealSlot: _mealSlot,
    cuisineOptionId,
    proteinTypeOptionId,
    recipeBookOptionId,
  } = args;

  const [mealSlotRes, cuisineRes, proteinRes, recipeBookRes, sourcesRes] =
    await Promise.all([
      getCatalogOptionsForPickerAction({
        dimension: 'meal_slot',
        selectedId: mealSlotOptionId ?? undefined,
      }),
      getCatalogOptionsForPickerAction({
        dimension: 'cuisine',
        selectedId: cuisineOptionId ?? undefined,
      }),
      getCatalogOptionsForPickerAction({
        dimension: 'protein_type',
        selectedId: proteinTypeOptionId ?? undefined,
      }),
      getCatalogOptionsForPickerAction({
        dimension: 'recipe_book',
        selectedId: recipeBookOptionId ?? undefined,
        sortBy: 'label_az',
      }),
      getRecipeSourcesForPickerAction(),
    ]);

  if (!mealSlotRes.ok) {
    return { ok: false, error: mealSlotRes.error };
  }
  if (!cuisineRes.ok) {
    return { ok: false, error: cuisineRes.error };
  }
  if (!proteinRes.ok) {
    return { ok: false, error: proteinRes.error };
  }
  if (!recipeBookRes.ok) {
    return { ok: false, error: recipeBookRes.error };
  }
  if (!sourcesRes.ok) {
    return { ok: false, error: sourcesRes.error };
  }

  return {
    ok: true,
    data: {
      mealSlotOptions: mealSlotRes.data,
      cuisineOptions: cuisineRes.data,
      proteinTypeOptions: proteinRes.data,
      recipeBookOptions: recipeBookRes.data,
      sourceOptions: sourcesRes.data,
    },
  };
}
