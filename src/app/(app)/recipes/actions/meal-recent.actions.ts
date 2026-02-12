'use server';

import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import type {
  IngredientLinkStatus,
  MealListItem,
  MealSlotValue,
} from './meal-list.actions';
import { getNormalizedVariantsForMatchLookup } from '../utils/ingredient-match-lookup';
import {
  computeWeekMenuStatus,
  effectiveWeekmenuSlots,
} from './weekMenuStatus';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR';
        message: string;
      };
    };

const MEAL_SLOT_VALUES = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'other',
] as const;

/** MealListItem + lastViewedAt for Recent tab. */
export type RecentMealListItem = MealListItem & { lastViewedAt: string };

export type ListRecentMealsOutput = {
  items: RecentMealListItem[];
  totalCount: number | null;
  limit: number;
  offset: number;
};

const logRecentViewSchema = z.object({
  mealId: z.string().uuid(),
});
export type LogMealRecentViewInput = z.infer<typeof logRecentViewSchema>;

const listRecentMealsSchema = z.object({
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.number().int().min(0).default(0),
});
export type ListRecentMealsInput = z.infer<typeof listRecentMealsSchema>;

/** Minimal columns for custom_meals list (no SELECT *). */
const CUSTOM_MEALS_LIST_COLUMNS =
  'id,name,meal_slot,weekmenu_slots,total_minutes,servings,source,source_url,updated_at';

type CustomMealRow = {
  id: string;
  name: string | null;
  meal_slot: string | null;
  weekmenu_slots: string[] | null;
  total_minutes: number | null;
  servings: number | null;
  source: string | null;
  source_url: string | null;
  updated_at: string | null;
  recipe_tag_links?: Array<{ recipe_tags: { label: string } | null }> | null;
};

function rowToRecentMealListItem(
  row: CustomMealRow,
  favoritedSet: Set<string>,
  lastViewedAt: string,
  recipesWithIngredientRefs: Set<string>,
  ingredientLinkByRecipe: Map<string, IngredientLinkStatus>,
): RecentMealListItem {
  const tags: string[] = [];
  if (row.recipe_tag_links && Array.isArray(row.recipe_tag_links)) {
    for (const link of row.recipe_tag_links) {
      const label = link?.recipe_tags?.label;
      if (typeof label === 'string' && label.length > 0) {
        tags.push(label);
      }
    }
  }
  const uniqueTags = [...new Set(tags)].sort((a, b) => a.localeCompare(b));
  const mealSlot =
    row.meal_slot && MEAL_SLOT_VALUES.includes(row.meal_slot as MealSlotValue)
      ? (row.meal_slot as MealSlotValue)
      : null;
  const hasIngredientRefs = recipesWithIngredientRefs.has(row.id);
  const slots = effectiveWeekmenuSlots(row.weekmenu_slots ?? null, mealSlot);
  return {
    mealId: row.id,
    title: row.name ?? '',
    imageUrl: null,
    mealSlot,
    totalMinutes: row.total_minutes ?? null,
    servings: row.servings ?? null,
    sourceName: row.source ?? null,
    sourceUrl: row.source_url ?? null,
    cuisineOptionId: null,
    proteinTypeOptionId: null,
    tags: uniqueTags,
    updatedAt: row.updated_at ?? null,
    isFavorited: favoritedSet.has(row.id),
    userRating: null,
    weekMenuStatus: computeWeekMenuStatus(slots, hasIngredientRefs),
    ingredientLinkStatus: ingredientLinkByRecipe.get(row.id) ?? null,
    lastViewedAt,
  };
}

/**
 * Log a recent view for a meal (upsert: insert or update last_viewed_at to now).
 * RLS: user context; INSERT policy requires meal to belong to user (custom_meals.user_id = auth.uid()).
 */
export async function logMealRecentViewAction(
  input: LogMealRecentViewInput,
): Promise<ActionResult<{ logged: true }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const parsed = logRecentViewSchema.safeParse(input);
    if (!parsed.success) {
      const msg =
        parsed.error.flatten().formErrors?.[0] ?? parsed.error.message;
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: msg,
        },
      };
    }

    const { mealId } = parsed.data;
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('meal_recent_views')
      .upsert(
        { user_id: user.id, meal_id: mealId, last_viewed_at: now },
        { onConflict: 'user_id,meal_id' },
      );

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message:
            error.code === '23503'
              ? 'Recept niet gevonden of je hebt geen rechten om dit te loggen.'
              : error.message,
        },
      };
    }
    return { ok: true, data: { logged: true } };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: err instanceof Error ? err.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * List recently viewed meals for the current user (ordered by last_viewed_at desc).
 * RLS: user context; minimal columns; tags + isFavorited via 1 query each.
 */
export async function listRecentMealsAction(
  input: ListRecentMealsInput,
): Promise<ActionResult<ListRecentMealsOutput>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const parsed = listRecentMealsSchema.safeParse(input);
    if (!parsed.success) {
      const msg =
        parsed.error.flatten().formErrors?.[0] ?? parsed.error.message;
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: msg,
        },
      };
    }

    const { limit, offset } = parsed.data;

    const {
      data: recentRows,
      error: recentError,
      count,
    } = await supabase
      .from('meal_recent_views')
      .select('meal_id,last_viewed_at', { count: 'exact' })
      .eq('user_id', user.id)
      .order('last_viewed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (recentError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: recentError.message,
        },
      };
    }

    const recentList = recentRows ?? [];
    if (recentList.length === 0) {
      return {
        ok: true,
        data: {
          items: [],
          totalCount: count ?? 0,
          limit,
          offset,
        },
      };
    }

    const mealIdsOrdered = recentList.map(
      (r) => (r as { meal_id: string; last_viewed_at: string }).meal_id,
    );
    const lastViewedByMealId = new Map(
      recentList.map((r) => {
        const row = r as { meal_id: string; last_viewed_at: string };
        return [row.meal_id, row.last_viewed_at];
      }),
    );

    const { data: mealRows, error: mealsError } = await supabase
      .from('custom_meals')
      .select(
        `${CUSTOM_MEALS_LIST_COLUMNS},recipe_tag_links(recipe_tags(label))`,
      )
      .eq('user_id', user.id)
      .in('id', mealIdsOrdered);

    if (mealsError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: mealsError.message,
        },
      };
    }

    const mealRowsById = new Map(
      (mealRows ?? []).map((row) => [
        (row as unknown as CustomMealRow).id,
        row as unknown as CustomMealRow,
      ]),
    );

    let favoritedSet = new Set<string>();
    const ratingsByMealId: Record<string, number> = {};
    let recipesWithIngredientRefs = new Set<string>();
    const ingredientLinkByRecipe = new Map<string, IngredientLinkStatus>();
    if (mealIdsOrdered.length > 0) {
      const [favRes, ratingRes, nevoRes, mealDataRes] = await Promise.all([
        supabase
          .from('meal_favorites')
          .select('meal_id')
          .eq('user_id', user.id)
          .in('meal_id', mealIdsOrdered),
        supabase
          .from('meal_history')
          .select('meal_id, user_rating')
          .eq('user_id', user.id)
          .in('meal_id', mealIdsOrdered),
        supabase
          .from('recipe_ingredients')
          .select('recipe_id, nevo_food_id')
          .in('recipe_id', mealIdsOrdered),
        supabase
          .from('custom_meals')
          .select('id, meal_data')
          .in('id', mealIdsOrdered),
      ]);
      favoritedSet = new Set(
        (favRes.data ?? []).map((r) => (r as { meal_id: string }).meal_id),
      );
      for (const r of ratingRes.data ?? []) {
        const row = r as { meal_id: string; user_rating: number | null };
        if (row.user_rating != null)
          ratingsByMealId[row.meal_id] = row.user_rating;
      }
      for (const row of nevoRes.data ?? []) {
        const r = row as { recipe_id: string; nevo_food_id: number | null };
        const prev = ingredientLinkByRecipe.get(r.recipe_id) ?? {
          linked: 0,
          total: 0,
        };
        prev.total += 1;
        if (r.nevo_food_id != null) prev.linked += 1;
        ingredientLinkByRecipe.set(r.recipe_id, prev);
      }
      const fromMealData = new Set<string>();
      const isLinked = (ref: unknown): boolean => {
        if (ref == null || typeof ref !== 'object') return false;
        const r = ref as Record<string, unknown>;
        return (
          r.nevoCode != null ||
          r.nevo_code != null ||
          r.nevo_food_id != null ||
          r.customFoodId != null ||
          r.custom_food_id != null ||
          r.fdcId != null ||
          r.fdc_id != null
        );
      };

      const normsToLookup = new Set<string>();
      for (const row of mealDataRes.data ?? []) {
        const r = row as { id: string; meal_data: unknown };
        const mealData = (r.meal_data as Record<string, unknown> | null) ?? {};
        const refs = Array.isArray(mealData.ingredientRefs)
          ? (mealData.ingredientRefs as Record<string, unknown>[])
          : [];
        const ingredients = Array.isArray(mealData.ingredients)
          ? (mealData.ingredients as Array<{
              name?: string;
              original_line?: string;
            }>)
          : [];
        for (let i = 0; i < ingredients.length; i++) {
          if (!isLinked(refs[i])) {
            const ing = ingredients[i];
            for (const norm of getNormalizedVariantsForMatchLookup(ing ?? {})) {
              normsToLookup.add(norm);
            }
          }
        }
      }

      const matchSet = new Set<string>();
      if (normsToLookup.size > 0) {
        const { data: matchRows } = await supabase
          .from('recipe_ingredient_matches')
          .select('normalized_text, nevo_code, custom_food_id, fdc_id')
          .in('normalized_text', [...normsToLookup])
          .or(
            'nevo_code.not.is.null,custom_food_id.not.is.null,fdc_id.not.is.null',
          );
        for (const row of matchRows ?? []) {
          const r = row as {
            normalized_text: string;
            nevo_code: number | null;
            custom_food_id: string | null;
            fdc_id: number | null;
          };
          if (
            r.nevo_code != null ||
            r.custom_food_id != null ||
            r.fdc_id != null
          ) {
            matchSet.add(String(r.normalized_text ?? '').trim());
          }
        }
      }

      for (const row of mealDataRes.data ?? []) {
        const r = row as { id: string; meal_data: unknown };
        const mealData = (r.meal_data as Record<string, unknown> | null) ?? {};
        const refs = Array.isArray(mealData.ingredientRefs)
          ? (mealData.ingredientRefs as Record<string, unknown>[])
          : [];
        const ingredients = Array.isArray(mealData.ingredients)
          ? (mealData.ingredients as Array<{
              name?: string;
              original_line?: string;
            }>)
          : [];
        const total = Math.max(refs.length, ingredients.length) || refs.length;
        let linked = refs.filter(isLinked).length;
        for (let i = 0; i < ingredients.length; i++) {
          if (!isLinked(refs[i])) {
            const ing = ingredients[i];
            const variants = getNormalizedVariantsForMatchLookup(ing ?? {});
            if (variants.some((v) => matchSet.has(v))) linked += 1;
          }
        }
        const hasAnyRef = linked > 0;
        if (hasAnyRef) fromMealData.add(r.id);
        const existing = ingredientLinkByRecipe.get(r.id);
        if (total > 0) {
          if (
            existing == null ||
            existing.total === 0 ||
            linked > (existing?.linked ?? 0)
          ) {
            ingredientLinkByRecipe.set(r.id, { linked, total });
          }
        }
      }
      const fromRecipeIngredients = new Set(
        [...ingredientLinkByRecipe.entries()]
          .filter(([, s]) => s.linked > 0)
          .map(([id]) => id),
      );
      recipesWithIngredientRefs = new Set([
        ...fromRecipeIngredients,
        ...fromMealData,
      ]);
    }

    const rawItems: RecentMealListItem[] = [];
    for (const mealId of mealIdsOrdered) {
      const row = mealRowsById.get(mealId);
      const lastViewedAt = lastViewedByMealId.get(mealId);
      if (row && lastViewedAt) {
        rawItems.push(
          rowToRecentMealListItem(
            row,
            favoritedSet,
            lastViewedAt,
            recipesWithIngredientRefs,
            ingredientLinkByRecipe,
          ),
        );
      }
    }
    const items = rawItems.map((item) => ({
      ...item,
      userRating: ratingsByMealId[item.mealId] ?? null,
    }));

    return {
      ok: true,
      data: {
        items,
        totalCount: count ?? null,
        limit,
        offset,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: err instanceof Error ? err.message : 'Onbekende fout',
      },
    };
  }
}

/*
 * Test / voorbeelden (comment):
 *
 * 1) Log view:
 *    logMealRecentViewAction({ mealId: '<uuid>' })
 *    -> upsert meal_recent_views (user_id, meal_id, last_viewed_at = now()); { ok: true, data: { logged: true } }
 *
 * 2) List recent:
 *    listRecentMealsAction({ limit: 24, offset: 0 })
 *    -> { ok: true, data: { items: RecentMealListItem[], totalCount: number | null, limit, offset } }
 *    items ordered by last_viewed_at desc; each item has lastViewedAt, tags, isFavorited
 */
