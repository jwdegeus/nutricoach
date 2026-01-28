/**
 * Meal Plan Calendar Actions
 *
 * Server actions for calendar view of meal plans
 */

'use server';

import { createClient } from '@/src/lib/supabase/server';
import { MealPlansService } from '@/src/lib/meal-plans/mealPlans.service';
import { MealPlanEditabilityService } from '@/src/lib/meal-plans/mealPlanEditability.service';
import { AppError } from '@/src/lib/errors/app-error';
import type { MealPlanResponse, Meal } from '@/src/lib/diets';
import type { MealSlot } from '@/src/lib/diets';

/**
 * Calendar day with meals and editability info
 */
export type CalendarDay = {
  date: string; // YYYY-MM-DD
  meals: Array<{
    meal: Meal;
    canEdit: boolean;
    canDelete: boolean;
    isLocked: boolean;
    lockReason?: string;
  }>;
  canRegenerate: boolean;
  dayLockReason?: string;
};

/**
 * Get calendar view for a meal plan
 */
export async function getMealPlanCalendarAction(planId: string): Promise<{
  plan: MealPlanResponse;
  calendarDays: CalendarDay[];
  locks: Array<{
    date: string;
    mealSlot?: MealSlot;
    mealId?: string;
    lockReason: string;
    lockedIngredients: string[];
  }>;
}> {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AppError('UNAUTHORIZED', 'Not authenticated');
  }

  // Load meal plan
  const mealPlansService = new MealPlansService();
  const plan = await mealPlansService.loadPlanForUser(user.id, planId);

  // Get editability service
  const editabilityService = new MealPlanEditabilityService();

  // Get all locks for this plan
  const locks = await editabilityService.getLocksForPlan(user.id, planId);

  // Build calendar days
  const calendarDays: CalendarDay[] = [];

  for (const day of plan.planSnapshot.days) {
    const dayMeals: CalendarDay['meals'] = [];

    // Check day-level editability
    const dayEditability = await editabilityService.checkDayEditability(
      user.id,
      planId,
      day.date,
    );

    // Check each meal
    for (const meal of day.meals) {
      const mealEditability = await editabilityService.checkMealEditability(
        user.id,
        planId,
        day.date,
        meal.slot,
        meal.id,
      );

      dayMeals.push({
        meal,
        canEdit: mealEditability.canEdit,
        canDelete: mealEditability.canDelete,
        isLocked: !mealEditability.canEdit || !mealEditability.canDelete,
        lockReason: mealEditability.reason,
      });
    }

    calendarDays.push({
      date: day.date,
      meals: dayMeals,
      canRegenerate: dayEditability.canEdit,
      dayLockReason: dayEditability.reason,
    });
  }

  return {
    plan: plan.planSnapshot,
    calendarDays,
    locks: locks.map((lock) => ({
      date: lock.date,
      mealSlot: lock.mealSlot,
      mealId: lock.mealId,
      lockReason: lock.lockReason,
      lockedIngredients: lock.lockedIngredients,
    })),
  };
}

/**
 * Check editability for a specific meal
 */
export async function checkMealEditabilityAction(
  planId: string,
  date: string,
  mealSlot: MealSlot,
  mealId?: string,
): Promise<{
  canEdit: boolean;
  canDelete: boolean;
  reason?: string;
  lockedIngredients?: string[];
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AppError('UNAUTHORIZED', 'Not authenticated');
  }

  const editabilityService = new MealPlanEditabilityService();
  const result = await editabilityService.checkMealEditability(
    user.id,
    planId,
    date,
    mealSlot,
    mealId,
  );

  return {
    canEdit: result.canEdit,
    canDelete: result.canDelete,
    reason: result.reason,
    lockedIngredients: result.lockedIngredients,
  };
}
