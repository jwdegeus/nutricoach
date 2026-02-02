'use server';

import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR';
        message: string;
      };
    };

const isMealFavoritedSchema = z.object({
  mealId: z.string().uuid(),
});
export type IsMealFavoritedInput = z.infer<typeof isMealFavoritedSchema>;

const setMealFavoritedSchema = z.object({
  mealId: z.string().uuid(),
  isFavorited: z.boolean(),
});
export type SetMealFavoritedInput = z.infer<typeof setMealFavoritedSchema>;

/**
 * Check whether the current user has the meal in favorites (meal_favorites).
 * RLS: user context only; minimal query (select id, limit 1).
 */
export async function isMealFavoritedAction(
  input: IsMealFavoritedInput,
): Promise<ActionResult<{ isFavorited: boolean }>> {
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

    const parsed = isMealFavoritedSchema.safeParse(input);
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

    const { data: row, error } = await supabase
      .from('meal_favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('meal_id', mealId)
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { isFavorited: row != null },
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

/**
 * Add or remove a meal from the current user's favorites.
 * RLS: user context; INSERT policy requires meal to belong to user (custom_meals.user_id = auth.uid()).
 * Idempotent: set true uses upsert; set false delete is ok if row does not exist.
 */
export async function setMealFavoritedAction(
  input: SetMealFavoritedInput,
): Promise<ActionResult<{ isFavorited: boolean }>> {
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

    const parsed = setMealFavoritedSchema.safeParse(input);
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

    const { mealId, isFavorited } = parsed.data;

    if (isFavorited) {
      const { error } = await supabase
        .from('meal_favorites')
        .upsert(
          { user_id: user.id, meal_id: mealId },
          { onConflict: 'user_id,meal_id' },
        );

      if (error) {
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message:
              error.code === '23503'
                ? 'Recept niet gevonden of je hebt geen rechten om het op te slaan.'
                : error.message,
          },
        };
      }
      return { ok: true, data: { isFavorited: true } };
    }

    const { error } = await supabase
      .from('meal_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('meal_id', mealId);

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }
    return { ok: true, data: { isFavorited: false } };
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
 * 1) Is opgeslagen?
 *    isMealFavoritedAction({ mealId: '<uuid>' })
 *    -> { ok: true, data: { isFavorited: true } } of { isFavorited: false }
 *
 * 2) Opslaan (idempotent; al opgeslagen is ook ok)
 *    setMealFavoritedAction({ mealId: '<uuid>', isFavorited: true })
 *    -> { ok: true, data: { isFavorited: true } }
 *    Bij RLS/foreign key fout: DB_ERROR met nette message
 *
 * 3) Ontopslaan (idempotent; niet opgeslagen is ook ok)
 *    setMealFavoritedAction({ mealId: '<uuid>', isFavorited: false })
 *    -> { ok: true, data: { isFavorited: false } }
 */
