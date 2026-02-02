'use server';

import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import type { MealListItem, MealSlotValue } from './meal-list.actions';

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
  'id,name,meal_slot,total_minutes,servings,source,source_url,updated_at';

type CustomMealRow = {
  id: string;
  name: string | null;
  meal_slot: string | null;
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
    if (mealIdsOrdered.length > 0) {
      const { data: favRows } = await supabase
        .from('meal_favorites')
        .select('meal_id')
        .eq('user_id', user.id)
        .in('meal_id', mealIdsOrdered);
      favoritedSet = new Set(
        (favRows ?? []).map((r) => (r as { meal_id: string }).meal_id),
      );
    }

    const items: RecentMealListItem[] = [];
    for (const mealId of mealIdsOrdered) {
      const row = mealRowsById.get(mealId);
      const lastViewedAt = lastViewedByMealId.get(mealId);
      if (row && lastViewedAt) {
        items.push(rowToRecentMealListItem(row, favoritedSet, lastViewedAt));
      }
    }

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
