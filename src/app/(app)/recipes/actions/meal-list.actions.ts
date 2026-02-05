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

/** Single meal row for list (minimal columns + tags + isFavorited + userRating). */
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
  'id,name,source_image_url,meal_slot,total_minutes,servings,source,source_url,cuisine_option_id,protein_type_option_id,updated_at';

type CustomMealRow = {
  id: string;
  name: string | null;
  source_image_url: string | null;
  meal_slot: string | null;
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
    if (mealSlot != null) {
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
    if (mealIds.length > 0) {
      const [favRes, ratingRes] = await Promise.all([
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
      ]);
      favoritedSet = new Set(
        (favRes.data ?? []).map((r) => (r as { meal_id: string }).meal_id),
      );
      for (const r of ratingRes.data ?? []) {
        const row = r as { meal_id: string; user_rating: number | null };
        if (row.user_rating != null)
          ratingsByMealId[row.meal_id] = row.user_rating;
      }
    }

    const rawItems = (rows ?? []).map((row) =>
      rowToMealListItem(row as unknown as CustomMealRow, favoritedSet),
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
