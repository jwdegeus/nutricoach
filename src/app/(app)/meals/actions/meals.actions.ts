'use server';

import { createClient } from '@/src/lib/supabase/server';
import { CustomMealsService } from '@/src/lib/custom-meals/customMeals.service';
import type { CustomMealRecord } from '@/src/lib/custom-meals/customMeals.service';
import type { MealSlot } from '@/src/lib/diets';

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR' | 'AI_ERROR';
        message: string;
      };
    };

/**
 * Get all meals for current user (custom meals + meal history)
 */
export async function getAllMealsAction(): Promise<
  ActionResult<{
    customMeals: CustomMealRecord[];
    mealHistory: unknown[];
  }>
> {
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
          message: 'Je moet ingelogd zijn om maaltijden te bekijken',
        },
      };
    }

    const service = new CustomMealsService();
    const customMeals = await service.getUserMeals(user.id);

    // Also get meal history
    const { data: mealHistory } = await supabase
      .from('meal_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    return {
      ok: true,
      data: {
        customMeals,
        mealHistory: mealHistory || [],
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Log meal consumption
 */
export async function logMealConsumptionAction(args: {
  customMealId?: string;
  mealHistoryId?: string;
  mealName: string;
  mealSlot: MealSlot;
  notes?: string;
}): Promise<ActionResult<void>> {
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
          message: 'Je moet ingelogd zijn om consumptie te loggen',
        },
      };
    }

    const service = new CustomMealsService();
    await service.logConsumption({
      userId: user.id,
      ...args,
    });

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Get top 5 consumed meals for dashboard
 */
export async function getTopConsumedMealsAction(): Promise<
  ActionResult<CustomMealRecord[]>
> {
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

    const service = new CustomMealsService();
    const topMeals = await service.getTopConsumedMeals(user.id, 5);

    return {
      ok: true,
      data: topMeals,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Get a single meal by ID (custom meal or meal history)
 */
export async function getMealByIdAction(
  mealId: string,
  source: 'custom' | 'gemini',
): Promise<ActionResult<CustomMealRecord | Record<string, unknown>>> {
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
          message: 'Je moet ingelogd zijn om maaltijden te bekijken',
        },
      };
    }

    if (source === 'custom') {
      const service = new CustomMealsService();
      const meal = await service.getMealById(mealId, user.id);

      if (!meal) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Maaltijd niet gevonden',
          },
        };
      }

      return {
        ok: true,
        data: meal,
      };
    } else {
      // Get from meal_history
      const { data, error } = await supabase
        .from('meal_history')
        .select('*')
        .eq('id', mealId)
        .eq('user_id', user.id)
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

      if (!data) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Maaltijd niet gevonden',
          },
        };
      }

      return {
        ok: true,
        data: {
          id: data.id,
          mealId: data.meal_id,
          mealName: data.meal_name,
          mealSlot: data.meal_slot,
          dietKey: data.diet_key,
          mealData: data.meal_data,
          userRating: data.user_rating,
          nutritionScore: data.nutrition_score,
          varietyScore: data.variety_score,
          combinedScore: data.combined_score,
          usageCount: data.usage_count,
          firstUsedAt: data.first_used_at,
          lastUsedAt: data.last_used_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}
