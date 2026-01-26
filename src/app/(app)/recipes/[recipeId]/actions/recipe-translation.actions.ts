"use server";

import { createClient } from "@/src/lib/supabase/server";
import { translateRecipe } from "../services/recipe-translation.service";
import type { CustomMealRecord } from "@/src/lib/custom-meals/customMeals.service";

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
 * Translate a recipe to user's preferred language
 */
export async function translateRecipeAction(args: {
  mealId: string;
  source: "custom" | "gemini";
}): Promise<ActionResult<{
  translated: boolean;
  sourceLanguage: 'nl' | 'en' | 'other';
  targetLanguage: 'nl' | 'en';
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
          message: "Je moet ingelogd zijn om recepten te vertalen",
        },
      };
    }

    // Get current meal data
    const tableName = args.source === "custom" ? "custom_meals" : "meal_history";

    const { data: meal, error: fetchError } = await supabase
      .from(tableName)
      .select("*")
      .eq("id", args.mealId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: fetchError.message,
        },
      };
    }

    if (!meal) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Recept niet gevonden",
        },
      };
    }

    // Prepare recipe data for translation
    const recipe = {
      name: meal.name || meal.meal_name || meal.mealName || "",
      mealData: meal.meal_data || meal.mealData || {},
      aiAnalysis: meal.ai_analysis || meal.aiAnalysis || {},
    };

    // Translate recipe
    const translation = await translateRecipe(recipe, user.id);

    // If already in target language, return early
    if (translation.sourceLanguage === translation.targetLanguage) {
      return {
        ok: true,
        data: {
          translated: false,
          sourceLanguage: translation.sourceLanguage,
          targetLanguage: translation.targetLanguage,
        },
      };
    }

    // Update meal in database
    // Handle different column names for custom_meals vs meal_history
    const updateData: any = {
      meal_data: translation.translatedMealData,
      ai_analysis: translation.translatedAiAnalysis,
      updated_at: new Date().toISOString(),
    };

    if (args.source === "custom") {
      updateData.name = translation.translatedName;
    } else {
      // meal_history uses meal_name instead of name
      updateData.meal_name = translation.translatedName;
    }

    const { error: updateError } = await supabase
      .from(tableName)
      .update(updateData)
      .eq("id", args.mealId)
      .eq("user_id", user.id);

    if (updateError) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: updateError.message,
        },
      };
    }

    return {
      ok: true,
      data: {
        translated: true,
        sourceLanguage: translation.sourceLanguage,
        targetLanguage: translation.targetLanguage,
      },
    };
  } catch (error) {
    console.error("[translateRecipeAction] Error:", error);
    return {
      ok: false,
      error: {
        code: "AI_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout bij vertalen recept",
      },
    };
  }
}
