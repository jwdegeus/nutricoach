"use server";

import { createClient } from "@/src/lib/supabase/server";
import { MealPlansService } from "@/src/lib/meal-plans/mealPlans.service";
import { MealPlannerShoppingService } from "@/src/lib/agents/meal-planner";
import type { ShoppingListResponse } from "@/src/lib/agents/meal-planner";

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: "AUTH_ERROR" | "DB_ERROR" | "NOT_FOUND";
        message: string;
      };
    };

/**
 * Get shopping list for the most recent meal plan
 */
export async function getShoppingCartAction(): Promise<
  ActionResult<{ shoppingList: ShoppingListResponse; planId: string } | null>
> {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn om de shopping cart te bekijken",
        },
      };
    }

    // Get most recent meal plan
    const service = new MealPlansService();
    const plans = await service.listPlansForUser(user.id, 1);

    if (plans.length === 0) {
      return {
        ok: true,
        data: null,
      };
    }

    const plan = plans[0];

    // Build shopping list with pantry
    const shoppingService = new MealPlannerShoppingService();
    const shoppingList = await shoppingService.buildShoppingListWithPantry(
      plan.planSnapshot,
      user.id
    );

    return {
      ok: true,
      data: {
        shoppingList,
        planId: plan.id,
      },
    };
  } catch (error) {
    console.error("Error getting shopping cart:", error);
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Fout bij ophalen shopping cart",
      },
    };
  }
}
