/**
 * Meal Plan Editability Service
 *
 * Business logic for determining when meals can be edited or deleted.
 * Rules:
 * - If products for a meal are purchased (in pantry), the meal cannot be edited/deleted
 * - Tracks locks and changes for audit trail
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import { PantryService } from '@/src/lib/pantry/pantry.service';
import { MealPlansService } from './mealPlans.service';
import { AppError } from '@/src/lib/errors/app-error';
import type { Meal } from '@/src/lib/diets';
import type { MealSlot } from '@/src/lib/diets';

/**
 * Lock information for a meal/day/plan
 */
export type MealPlanLock = {
  id: string;
  mealPlanId: string;
  userId: string;
  lockType: 'meal' | 'day' | 'plan';
  date: string; // YYYY-MM-DD
  mealSlot?: MealSlot;
  mealId?: string;
  lockReason: string;
  lockedIngredients: string[]; // nevoCodes
  createdAt: string;
  updatedAt: string;
};

/**
 * Change record for a meal plan
 */
export type MealPlanChange = {
  id: string;
  mealPlanId: string;
  userId: string;
  changeType: 'meal_edited' | 'meal_deleted' | 'meal_added' | 'day_regenerated';
  date: string; // YYYY-MM-DD
  mealSlot?: MealSlot;
  mealId?: string;
  oldMealData?: Meal;
  newMealData?: Meal;
  changeReason?: string;
  createdAt: string;
};

/**
 * Editability check result
 */
export type EditabilityCheck = {
  canEdit: boolean;
  canDelete: boolean;
  reason?: string;
  lockedIngredients?: string[]; // nevoCodes that are purchased
  lock?: MealPlanLock;
};

/**
 * Meal Plan Editability Service
 */
export class MealPlanEditabilityService {
  private pantryService: PantryService;
  private mealPlansService: MealPlansService;

  constructor() {
    this.pantryService = new PantryService();
    this.mealPlansService = new MealPlansService();
  }

  /**
   * Check if a meal can be edited or deleted
   *
   * Business rules:
   * - If any ingredient from the meal is in pantry (purchased), meal is locked
   * - Lock is at meal level (specific meal slot on specific date)
   *
   * @param userId - User ID
   * @param mealPlanId - Meal plan ID
   * @param date - Date of the meal (YYYY-MM-DD)
   * @param mealSlot - Meal slot (breakfast, lunch, dinner, snack)
   * @param mealId - Optional meal ID for specific meal tracking
   * @returns Editability check result
   */
  async checkMealEditability(
    userId: string,
    mealPlanId: string,
    date: string,
    mealSlot: MealSlot,
    mealId?: string,
  ): Promise<EditabilityCheck> {
    // Load meal plan
    const plan = await this.mealPlansService.loadPlanForUser(
      userId,
      mealPlanId,
    );
    const planSnapshot = plan.planSnapshot;

    // Find the meal
    const day = planSnapshot.days.find((d) => d.date === date);
    if (!day) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Day ${date} not found in meal plan`,
      );
    }

    const meal = day.meals.find((m) => m.slot === mealSlot);
    if (!meal) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Meal ${mealSlot} not found for date ${date}`,
      );
    }

    // Check for existing lock
    const existingLock = await this.getLock(
      userId,
      mealPlanId,
      date,
      mealSlot,
      mealId || meal.id,
    );

    if (existingLock) {
      return {
        canEdit: false,
        canDelete: false,
        reason: `Meal is locked: ${existingLock.lockReason}`,
        lockedIngredients: existingLock.lockedIngredients,
        lock: existingLock,
      };
    }

    // Check if ingredients are in pantry (purchased)
    const ingredientNevoCodes = (meal.ingredientRefs || []).map(
      (ref) => ref.nevoCode,
    );

    if (ingredientNevoCodes.length === 0) {
      // No ingredients = can edit/delete
      return {
        canEdit: true,
        canDelete: true,
      };
    }

    // Check pantry for these ingredients
    const pantryItems = await this.pantryService.loadAvailabilityByNevoCodes(
      userId,
      ingredientNevoCodes,
    );

    // Check if any ingredient is purchased (in pantry)
    const purchasedIngredients = pantryItems
      .filter((item) => {
        // Consider purchased if:
        // - is_available is true AND (available_g is null OR available_g > 0)
        return (
          item.isAvailable &&
          (item.availableG === undefined || (item.availableG ?? 0) > 0)
        );
      })
      .map((item) => item.nevoCode);

    if (purchasedIngredients.length > 0) {
      // Create lock for this meal
      await this.createLock({
        userId,
        mealPlanId,
        lockType: 'meal',
        date,
        mealSlot,
        mealId: mealId || meal.id,
        lockReason: 'products_purchased',
        lockedIngredients: purchasedIngredients,
      });

      return {
        canEdit: false,
        canDelete: false,
        reason: 'Some ingredients for this meal are already purchased',
        lockedIngredients: purchasedIngredients,
      };
    }

    // No purchased ingredients = can edit/delete
    return {
      canEdit: true,
      canDelete: true,
    };
  }

  /**
   * Check if a day can be regenerated
   *
   * Business rules:
   * - If any meal in the day has purchased ingredients, day is locked
   *
   * @param userId - User ID
   * @param mealPlanId - Meal plan ID
   * @param date - Date of the day (YYYY-MM-DD)
   * @returns Editability check result
   */
  async checkDayEditability(
    userId: string,
    mealPlanId: string,
    date: string,
  ): Promise<EditabilityCheck> {
    // Load meal plan
    const plan = await this.mealPlansService.loadPlanForUser(
      userId,
      mealPlanId,
    );
    const planSnapshot = plan.planSnapshot;

    // Find the day
    const day = planSnapshot.days.find((d) => d.date === date);
    if (!day) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Day ${date} not found in meal plan`,
      );
    }

    // Check for existing day lock
    const existingLock = await this.getLock(userId, mealPlanId, date);

    if (existingLock && existingLock.lockType === 'day') {
      return {
        canEdit: false,
        canDelete: false,
        reason: `Day is locked: ${existingLock.lockReason}`,
        lockedIngredients: existingLock.lockedIngredients,
        lock: existingLock,
      };
    }

    // Check all meals in the day
    const allIngredientNevoCodes = new Set<string>();
    for (const meal of day.meals) {
      (meal.ingredientRefs || []).forEach((ref) => {
        allIngredientNevoCodes.add(ref.nevoCode);
      });
    }

    if (allIngredientNevoCodes.size === 0) {
      return {
        canEdit: true,
        canDelete: true,
      };
    }

    // Check pantry
    const pantryItems = await this.pantryService.loadAvailabilityByNevoCodes(
      userId,
      Array.from(allIngredientNevoCodes),
    );

    const purchasedIngredients = pantryItems
      .filter((item) => {
        return (
          item.isAvailable &&
          (item.availableG === undefined || (item.availableG ?? 0) > 0)
        );
      })
      .map((item) => item.nevoCode);

    if (purchasedIngredients.length > 0) {
      // Create day lock
      await this.createLock({
        userId,
        mealPlanId,
        lockType: 'day',
        date,
        lockReason: 'products_purchased',
        lockedIngredients: purchasedIngredients,
      });

      return {
        canEdit: false,
        canDelete: false,
        reason: 'Some ingredients for this day are already purchased',
        lockedIngredients: purchasedIngredients,
      };
    }

    return {
      canEdit: true,
      canDelete: true,
    };
  }

  /**
   * Get lock for a meal/day
   */
  private async getLock(
    userId: string,
    mealPlanId: string,
    date: string,
    mealSlot?: MealSlot,
    mealId?: string,
  ): Promise<MealPlanLock | null> {
    const supabase = await createClient();

    let query = supabase
      .from('meal_plan_locks')
      .select('*')
      .eq('user_id', userId)
      .eq('meal_plan_id', mealPlanId)
      .eq('date', date);

    if (mealSlot) {
      query = query.eq('meal_slot', mealSlot);
    } else {
      query = query.is('meal_slot', null);
    }

    if (mealId) {
      query = query.eq('meal_id', mealId);
    } else {
      query = query.is('meal_id', null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      // If table doesn't exist yet, return null (migration not run)
      if (
        error.message.includes('Could not find the table') ||
        error.message.includes('does not exist')
      ) {
        console.warn(
          'meal_plan_locks table not found. Please run migration: npm run db:push',
        );
        return null;
      }
      console.error('Error getting lock:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      mealPlanId: data.meal_plan_id,
      userId: data.user_id,
      lockType: data.lock_type as 'meal' | 'day' | 'plan',
      date: data.date,
      mealSlot: data.meal_slot as MealSlot | undefined,
      mealId: data.meal_id || undefined,
      lockReason: data.lock_reason,
      lockedIngredients: data.locked_ingredients || [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Create a lock for a meal/day/plan
   */
  private async createLock(args: {
    userId: string;
    mealPlanId: string;
    lockType: 'meal' | 'day' | 'plan';
    date: string;
    mealSlot?: MealSlot;
    mealId?: string;
    lockReason: string;
    lockedIngredients: string[];
  }): Promise<void> {
    const supabase = await createClient();

    // Check if lock already exists
    const existingLock = await this.getLock(
      args.userId,
      args.mealPlanId,
      args.date,
      args.mealSlot,
      args.mealId,
    );

    if (existingLock) {
      // Update existing lock
      const { error } = await supabase
        .from('meal_plan_locks')
        .update({
          lock_reason: args.lockReason,
          locked_ingredients: args.lockedIngredients,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLock.id);

      if (error) {
        // If table doesn't exist yet, just log warning (migration not run)
        if (
          error.message.includes('Could not find the table') ||
          error.message.includes('does not exist')
        ) {
          console.warn(
            'meal_plan_locks table not found. Lock not created. Please run migration: npm run db:push',
          );
          return;
        }
        console.error('Error updating lock:', error);
        throw new AppError(
          'DB_ERROR',
          `Failed to update lock: ${error.message}`,
        );
      }
      return;
    }

    // Create new lock
    const { error: insertError } = await supabase
      .from('meal_plan_locks')
      .insert({
        user_id: args.userId,
        meal_plan_id: args.mealPlanId,
        lock_type: args.lockType,
        date: args.date,
        meal_slot: args.mealSlot || null,
        meal_id: args.mealId || null,
        lock_reason: args.lockReason,
        locked_ingredients: args.lockedIngredients,
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      // If table doesn't exist yet, just log warning (migration not run)
      if (
        insertError.message.includes('Could not find the table') ||
        insertError.message.includes('does not exist')
      ) {
        console.warn(
          'meal_plan_locks table not found. Lock not created. Please run migration: npm run db:push',
        );
        return;
      }
      // Check for unique constraint violation (lock already exists)
      if (
        insertError.message.includes('unique') ||
        insertError.message.includes('duplicate')
      ) {
        // Lock already exists, that's fine - just return
        return;
      }
      console.error('Error creating lock:', insertError);
      throw new AppError(
        'DB_ERROR',
        `Failed to create lock: ${insertError.message}`,
      );
    }
  }

  /**
   * Record a change to a meal plan
   */
  async recordChange(args: {
    userId: string;
    mealPlanId: string;
    changeType:
      | 'meal_edited'
      | 'meal_deleted'
      | 'meal_added'
      | 'day_regenerated';
    date: string;
    mealSlot?: MealSlot;
    mealId?: string;
    oldMealData?: Meal;
    newMealData?: Meal;
    changeReason?: string;
  }): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase.from('meal_plan_changes').insert({
      user_id: args.userId,
      meal_plan_id: args.mealPlanId,
      change_type: args.changeType,
      date: args.date,
      meal_slot: args.mealSlot || null,
      meal_id: args.mealId || null,
      old_meal_data: args.oldMealData || null,
      new_meal_data: args.newMealData || null,
      change_reason: args.changeReason || null,
    });

    if (error) {
      // If table doesn't exist yet, just log warning (migration not run)
      if (
        error.message.includes('Could not find the table') ||
        error.message.includes('does not exist')
      ) {
        console.warn(
          'meal_plan_changes table not found. Change not recorded. Please run migration: npm run db:push',
        );
        return;
      }
      console.error('Error recording change:', error);
      throw new AppError(
        'DB_ERROR',
        `Failed to record change: ${error.message}`,
      );
    }
  }

  /**
   * Get all locks for a meal plan
   */
  async getLocksForPlan(
    userId: string,
    mealPlanId: string,
  ): Promise<MealPlanLock[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('meal_plan_locks')
      .select('*')
      .eq('user_id', userId)
      .eq('meal_plan_id', mealPlanId)
      .order('date', { ascending: true });

    if (error) {
      // If table doesn't exist yet, return empty array (migration not run)
      if (
        error.message.includes('Could not find the table') ||
        error.message.includes('does not exist')
      ) {
        console.warn(
          'meal_plan_locks table not found. Please run migration: npm run db:push',
        );
        return [];
      }
      console.error('Error getting locks:', error);
      throw new AppError('DB_ERROR', `Failed to get locks: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      mealPlanId: row.meal_plan_id,
      userId: row.user_id,
      lockType: row.lock_type as 'meal' | 'day' | 'plan',
      date: row.date,
      mealSlot: row.meal_slot as MealSlot | undefined,
      mealId: row.meal_id || undefined,
      lockReason: row.lock_reason,
      lockedIngredients: row.locked_ingredients || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get all changes for a meal plan
   */
  async getChangesForPlan(
    userId: string,
    mealPlanId: string,
  ): Promise<MealPlanChange[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('meal_plan_changes')
      .select('*')
      .eq('user_id', userId)
      .eq('meal_plan_id', mealPlanId)
      .order('created_at', { ascending: false });

    if (error) {
      // If table doesn't exist yet, return empty array (migration not run)
      if (
        error.message.includes('Could not find the table') ||
        error.message.includes('does not exist')
      ) {
        console.warn(
          'meal_plan_changes table not found. Please run migration: npm run db:push',
        );
        return [];
      }
      console.error('Error getting changes:', error);
      throw new AppError('DB_ERROR', `Failed to get changes: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      mealPlanId: row.meal_plan_id,
      userId: row.user_id,
      changeType: row.change_type as
        | 'meal_edited'
        | 'meal_deleted'
        | 'meal_added'
        | 'day_regenerated',
      date: row.date,
      mealSlot: row.meal_slot as MealSlot | undefined,
      mealId: row.meal_id || undefined,
      oldMealData: row.old_meal_data as Meal | undefined,
      newMealData: row.new_meal_data as Meal | undefined,
      changeReason: row.change_reason || undefined,
      createdAt: row.created_at,
    }));
  }
}
