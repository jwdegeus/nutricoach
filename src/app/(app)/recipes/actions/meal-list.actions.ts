'use server';

import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';

const MEAL_SLOT_VALUES = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'other',
] as const;
export type MealSlotValue = (typeof MEAL_SLOT_VALUES)[number];

import {
  computeWeekMenuStatus,
  effectiveWeekmenuSlots,
  type WeekMenuStatus,
} from './weekMenuStatus';
export type { WeekMenuStatus } from './weekMenuStatus';

const MAX_TAG_LENGTH = 40;
const MAX_TAG_LABELS = 20;
const MAX_QUERY_LENGTH = 120;
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

/** Koppelingsstatus: hoeveel ingrediënten zijn gekoppeld aan een product (NEVO/custom/FNDDS). */
export type IngredientLinkStatus = {
  linked: number;
  total: number;
};

/** Single meal row for list (minimal columns + tags + isFavorited + userRating + weekMenuStatus). */
export type MealListItem = {
  mealId: string;
  title: string;
  /** Recipe image URL for thumbnail (custom_meals.source_image_url). */
  imageUrl: string | null;
  mealSlot: MealSlotValue | null;
  totalMinutes: number | null;
  servings: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  cuisineOptionId: string | null;
  proteinTypeOptionId: string | null;
  tags: string[];
  updatedAt: string | null;
  /** Whether the current user has this meal in meal_favorites (1 query per list, no N+1). */
  isFavorited: boolean;
  /** User rating 1–5 from meal_history (for custom meals). */
  userRating: number | null;
  /** Weekmenu eligibility: ready, or blocked by slot type and/or missing NEVO refs. */
  weekMenuStatus: WeekMenuStatus;
  /** Hoeveel ingrediënten gekoppeld vs totaal (voor zicht op koppelingskwaliteit). */
  ingredientLinkStatus: IngredientLinkStatus | null;
};

export type ListMealsOutput = {
  items: MealListItem[];
  totalCount: number | null;
  limit: number;
  offset: number;
};

const COLLECTION_VALUES = ['all', 'saved'] as const;
export type ListMealsCollection = (typeof COLLECTION_VALUES)[number];

const listMealsInputSchema = z.object({
  collection: z.enum(COLLECTION_VALUES).optional().default('all'),
  q: z
    .string()
    .optional()
    .default('')
    .transform((s) => s.trim())
    .pipe(z.string().max(MAX_QUERY_LENGTH)),
  mealSlot: z.enum(MEAL_SLOT_VALUES).optional(),
  mealSlotOptionId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  maxTotalMinutes: z.number().int().min(0).optional(),
  sourceName: z.string().trim().optional().default(''),
  tagLabelsAny: z
    .array(z.string().max(MAX_TAG_LENGTH))
    .max(MAX_TAG_LABELS)
    .transform((arr) => {
      const normalized = arr
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      return [...new Set(normalized)];
    })
    .optional()
    .default([]),
  cuisineOptionId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  proteinTypeOptionId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.number().int().min(0).default(0),
});

export type ListMealsInput = z.infer<typeof listMealsInputSchema>;

/** Minimal columns for list (no SELECT *). */
const CUSTOM_MEALS_LIST_COLUMNS =
  'id,name,source_image_url,meal_slot,weekmenu_slots,total_minutes,servings,source,source_url,cuisine_option_id,protein_type_option_id,updated_at';

type CustomMealRow = {
  id: string;
  name: string | null;
  source_image_url: string | null;
  meal_slot: string | null;
  weekmenu_slots: string[] | null;
  total_minutes: number | null;
  servings: number | null;
  source: string | null;
  source_url: string | null;
  cuisine_option_id: string | null;
  protein_type_option_id: string | null;
  updated_at: string | null;
  recipe_tag_links?: Array<{ recipe_tags: { label: string } | null }> | null;
};

function rowToMealListItem(
  row: CustomMealRow,
  favoritedSet: Set<string>,
  recipesWithIngredientRefs: Set<string>,
  ingredientLinkByRecipe: Map<string, IngredientLinkStatus>,
): MealListItem {
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
    imageUrl: row.source_image_url ?? null,
    mealSlot,
    totalMinutes: row.total_minutes ?? null,
    servings: row.servings ?? null,
    sourceName: row.source ?? null,
    sourceUrl: row.source_url ?? null,
    cuisineOptionId: row.cuisine_option_id ?? null,
    proteinTypeOptionId: row.protein_type_option_id ?? null,
    tags: uniqueTags,
    updatedAt: row.updated_at ?? null,
    isFavorited: favoritedSet.has(row.id),
    userRating: null,
    weekMenuStatus: computeWeekMenuStatus(slots, hasIngredientRefs),
    ingredientLinkStatus: ingredientLinkByRecipe.get(row.id) ?? null,
  };
}

function attachUserRatings<T extends MealListItem>(
  items: T[],
  ratingsByMealId: Record<string, number>,
): T[] {
  return items.map((item) => ({
    ...item,
    userRating: ratingsByMealId[item.mealId] ?? null,
  }));
}

/**
 * List custom meals with filters (collection, meal slot, max time, source, tags, search).
 * RLS: user context only; no SELECT *; minimal columns.
 * collection 'saved': 2-step filter via meal_favorites (same pattern as tagLabelsAny).
 * Tags filter uses 2-query approach (Supabase relational filter on nested path not reliable for "any of" tag match).
 */
export async function listMealsAction(
  input: ListMealsInput,
): Promise<ActionResult<ListMealsOutput>> {
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

    const parsed = listMealsInputSchema.safeParse(input);
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

    const {
      collection,
      q,
      mealSlot,
      mealSlotOptionId,
      maxTotalMinutes,
      sourceName,
      tagLabelsAny,
      cuisineOptionId,
      proteinTypeOptionId,
      limit,
      offset,
    } = parsed.data;

    let recipeIdsFilter: string[] | null = null;
    if (tagLabelsAny.length > 0) {
      const { data: tagRows } = await supabase
        .from('recipe_tags')
        .select('id')
        .eq('user_id', user.id)
        .in('label', tagLabelsAny);

      const tagIds = (tagRows ?? []).map((r) => (r as { id: string }).id);
      if (tagIds.length === 0) {
        return {
          ok: true,
          data: {
            items: [],
            totalCount: 0,
            limit,
            offset,
          },
        };
      }

      const { data: linkRows } = await supabase
        .from('recipe_tag_links')
        .select('recipe_id')
        .in('tag_id', tagIds);

      const recipeIds = [
        ...new Set(
          (linkRows ?? []).map((r) => (r as { recipe_id: string }).recipe_id),
        ),
      ];
      if (recipeIds.length === 0) {
        return {
          ok: true,
          data: {
            items: [],
            totalCount: 0,
            limit,
            offset,
          },
        };
      }
      recipeIdsFilter = recipeIds;
    }

    let favoriteMealIds: string[] | null = null;
    if (collection === 'saved') {
      const { data: favRows } = await supabase
        .from('meal_favorites')
        .select('meal_id')
        .eq('user_id', user.id);
      const ids = (favRows ?? []).map(
        (r) => (r as { meal_id: string }).meal_id,
      );
      if (ids.length === 0) {
        return {
          ok: true,
          data: {
            items: [],
            totalCount: 0,
            limit,
            offset,
          },
        };
      }
      favoriteMealIds = [...new Set(ids)];
    }

    let idsFilter: string[] | null = null;
    if (recipeIdsFilter != null && favoriteMealIds != null) {
      const set = new Set(favoriteMealIds);
      idsFilter = recipeIdsFilter.filter((id) => set.has(id));
      if (idsFilter.length === 0) {
        return {
          ok: true,
          data: {
            items: [],
            totalCount: 0,
            limit,
            offset,
          },
        };
      }
    } else if (recipeIdsFilter != null) {
      idsFilter = recipeIdsFilter;
    } else if (favoriteMealIds != null) {
      idsFilter = favoriteMealIds;
    }

    let query = supabase
      .from('custom_meals')
      .select(
        `${CUSTOM_MEALS_LIST_COLUMNS},recipe_tag_links(recipe_tags(label))`,
        { count: 'exact' },
      )
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (idsFilter != null) {
      query = query.in('id', idsFilter);
    }
    if (mealSlotOptionId != null) {
      query = query.eq('meal_slot_option_id', mealSlotOptionId);
    } else if (mealSlot != null) {
      query = query.eq('meal_slot', mealSlot);
    }
    if (maxTotalMinutes != null) {
      query = query.lte('total_minutes', maxTotalMinutes);
    }
    if (q.length > 0) {
      const qEscaped = q
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
      query = query.ilike('name', `%${qEscaped}%`);
    }
    if (sourceName.length > 0) {
      const srcEscaped = sourceName
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
      query = query.ilike('source', `%${srcEscaped}%`);
    }
    if (cuisineOptionId != null) {
      query = query.eq('cuisine_option_id', cuisineOptionId);
    }
    if (proteinTypeOptionId != null) {
      query = query.eq('protein_type_option_id', proteinTypeOptionId);
    }

    const { data: rows, error, count } = await query;

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    const mealIds = (rows ?? []).map((r) => (r as unknown as CustomMealRow).id);
    let favoritedSet = new Set<string>();
    const ratingsByMealId: Record<string, number> = {};
    let recipesWithIngredientRefs = new Set<string>();
    const ingredientLinkByRecipe = new Map<string, IngredientLinkStatus>();
    if (mealIds.length > 0) {
      const [favRes, ratingRes, nevoRes, mealDataRes] = await Promise.all([
        supabase
          .from('meal_favorites')
          .select('meal_id')
          .eq('user_id', user.id)
          .in('meal_id', mealIds),
        supabase
          .from('meal_history')
          .select('meal_id, user_rating')
          .eq('user_id', user.id)
          .in('meal_id', mealIds),
        supabase
          .from('recipe_ingredients')
          .select('recipe_id, nevo_food_id')
          .in('recipe_id', mealIds),
        supabase.from('custom_meals').select('id, meal_data').in('id', mealIds),
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
      for (const row of mealDataRes.data ?? []) {
        const r = row as { id: string; meal_data: unknown };
        const mealData = (r.meal_data as Record<string, unknown> | null) ?? {};
        const refs = Array.isArray(mealData.ingredientRefs)
          ? (mealData.ingredientRefs as Record<string, unknown>[])
          : [];
        const ingredients = Array.isArray(mealData.ingredients)
          ? (mealData.ingredients as unknown[])
          : [];
        const total = Math.max(refs.length, ingredients.length) || refs.length;
        const linked = refs.filter(
          (ref) =>
            ref != null &&
            typeof ref === 'object' &&
            (ref.nevoCode != null ||
              ref.customFoodId != null ||
              (ref as Record<string, unknown>).custom_food_id != null ||
              ref.fdcId != null ||
              (ref as Record<string, unknown>).fdc_id != null),
        ).length;
        const hasAnyRef = linked > 0;
        if (hasAnyRef) fromMealData.add(r.id);
        if (total > 0) {
          ingredientLinkByRecipe.set(r.id, { linked, total });
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

    const rawItems = (rows ?? []).map((row) =>
      rowToMealListItem(
        row as unknown as CustomMealRow,
        favoritedSet,
        recipesWithIngredientRefs,
        ingredientLinkByRecipe,
      ),
    );
    const items = attachUserRatings(rawItems, ratingsByMealId);

    return {
      ok: true,
      data: {
        items,
        totalCount: count ?? null,
        limit,
        offset,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/*
 * Test / voorbeelden (comment; geen SELECT *):
 *
 * 1) Geen filters:
 *    listMealsAction({ limit: 24, offset: 0 })
 *    -> { ok: true, data: { items: MealListItem[], totalCount: number | null, limit: 24, offset: 0 } }
 *    items[].tags = sorted unique labels; items[].isFavorited from meal_favorites (1 query)
 *
 * 2) collection 'saved':
 *    listMealsAction({ collection: 'saved', limit: 24, offset: 0 })
 *    -> only meals in meal_favorites for auth user; items[].isFavorited = true
 *
 * 3) Zoekterm + mealSlot:
 *    listMealsAction({ q: 'pasta', mealSlot: 'dinner', limit: 10, offset: 0 })
 *    -> rows where name ilike '%pasta%' and meal_slot = 'dinner'; items[].isFavorited from meal_favorites
 *
 * 4) Tags OR-filter:
 *    listMealsAction({ tagLabelsAny: ['snel', 'vegetarisch'], limit: 20 })
 *    -> only meals that have at least one of those tags; items[].isFavorited from meal_favorites
 *
 * 5) maxTotalMinutes:
 *    listMealsAction({ maxTotalMinutes: 30 })
 *    -> rows where total_minutes <= 30 (or null); items[].isFavorited from meal_favorites
 */
