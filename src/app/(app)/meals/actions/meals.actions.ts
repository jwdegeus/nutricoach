"use server";

import { createClient } from "@/src/lib/supabase/server";
import { CustomMealsService } from "@/src/lib/custom-meals/customMeals.service";
import { analyzeMealImage, recipeAnalysisToMeal } from "@/src/lib/custom-meals/mealImageAnalysis.service";
import type { CustomMealRecord } from "@/src/lib/custom-meals/customMeals.service";
import type { MealSlot } from "@/src/lib/diets";

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: "AUTH_ERROR" | "VALIDATION_ERROR" | "DB_ERROR" | "AI_ERROR";
        message: string;
      };
    };

/**
 * Upload and analyze a meal image
 */
export async function uploadAndAnalyzeMealAction(args: {
  imageData: string; // Base64 or data URL
  mimeType: string;
  mealSlot: MealSlot;
  date: string; // YYYY-MM-DD
}): Promise<ActionResult<{ mealId: string; meal: CustomMealRecord }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn om maaltijden toe te voegen",
        },
      };
    }

    // Analyze image
    let analysis;
    try {
      analysis = await analyzeMealImage(args.imageData, args.mimeType);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "AI_ERROR",
          message: `Fout bij analyseren van afbeelding: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      };
    }

    // Convert to Meal format
    const meal = recipeAnalysisToMeal(analysis, args.mealSlot, args.date);

    // Create custom meal
    const service = new CustomMealsService();
    const customMeal = await service.createMeal({
      userId: user.id,
      name: meal.name,
      mealSlot: args.mealSlot,
      sourceType: "photo", // Could be determined from upload type
      aiAnalysis: analysis,
      originalLanguage: analysis.language,
      mealData: meal,
    });

    return {
      ok: true,
      data: {
        mealId: customMeal.id,
        meal: customMeal,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Get all meals for current user (custom meals + meal history)
 */
export async function getAllMealsAction(): Promise<ActionResult<{
  customMeals: CustomMealRecord[];
  mealHistory: any[]; // TODO: type this properly
}>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn om maaltijden te bekijken",
        },
      };
    }

    const service = new CustomMealsService();
    const customMeals = await service.getUserMeals(user.id);

    // Also get meal history
    const { data: mealHistory } = await supabase
      .from("meal_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

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
        code: "DB_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
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
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn om consumptie te loggen",
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
        code: "DB_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Get top 5 consumed meals for dashboard
 */
export async function getTopConsumedMealsAction(): Promise<ActionResult<CustomMealRecord[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
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
        code: "DB_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}
