import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "AUTH_ERROR",
            message: "Je moet ingelogd zijn om de bron bij te werken",
          },
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { mealId, source, recipeSource } = body;

    if (!mealId || !source) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Meal ID en source zijn vereist",
          },
        },
        { status: 400 }
      );
    }

    // If a source is provided, ensure it exists in recipe_sources
    if (recipeSource && recipeSource.trim()) {
      const sourceName = recipeSource.trim();
      
      // Check if source exists
      const { data: existingSource } = await supabase
        .from("recipe_sources")
        .select("id")
        .eq("name", sourceName)
        .maybeSingle();

      if (!existingSource) {
        // Create new source (user-created)
        await supabase
          .from("recipe_sources")
          .insert({
            name: sourceName,
            is_system: false,
            created_by_user_id: user.id,
            usage_count: 0, // Will be recalculated on next admin page load
          });
      }
    }

    // Get old source name before update (to decrement its usage)
    let oldSourceName: string | null = null;
    if (source === "custom") {
      const { data: oldMeal } = await supabase
        .from("custom_meals")
        .select("source")
        .eq("id", mealId)
        .eq("user_id", user.id)
        .maybeSingle();
      oldSourceName = oldMeal?.source || null;
    } else {
      const { data: oldMeal } = await supabase
        .from("meal_history")
        .select("source")
        .eq("id", mealId)
        .eq("user_id", user.id)
        .maybeSingle();
      oldSourceName = oldMeal?.source || null;
    }

    // Update meal record
    if (source === "custom") {
      const { error } = await supabase
        .from("custom_meals")
        .update({ source: recipeSource || null })
        .eq("id", mealId)
        .eq("user_id", user.id);

      if (error) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "DB_ERROR",
              message: error.message,
            },
          },
          { status: 500 }
        );
      }
    } else {
      // Update meal_history
      const { error } = await supabase
        .from("meal_history")
        .update({ source: recipeSource || null })
        .eq("id", mealId)
        .eq("user_id", user.id);

      if (error) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "DB_ERROR",
              message: error.message,
            },
          },
          { status: 500 }
        );
      }
    }

    // Recalculate usage counts for old and new sources
    const newSourceName = recipeSource?.trim() || null;
    
    if (oldSourceName && oldSourceName !== newSourceName) {
      // Recalculate old source usage
      const { count: oldCustomCount } = await supabase
        .from("custom_meals")
        .select("*", { count: "exact", head: true })
        .eq("source", oldSourceName);
      
      const { count: oldHistoryCount } = await supabase
        .from("meal_history")
        .select("*", { count: "exact", head: true })
        .eq("source", oldSourceName);

      const oldTotal = (oldCustomCount || 0) + (oldHistoryCount || 0);
      
      await supabase
        .from("recipe_sources")
        .update({ usage_count: oldTotal })
        .eq("name", oldSourceName);
    }

    if (newSourceName) {
      // Recalculate new source usage
      const { count: newCustomCount } = await supabase
        .from("custom_meals")
        .select("*", { count: "exact", head: true })
        .eq("source", newSourceName);
      
      const { count: newHistoryCount } = await supabase
        .from("meal_history")
        .select("*", { count: "exact", head: true })
        .eq("source", newSourceName);

      const newTotal = (newCustomCount || 0) + (newHistoryCount || 0);
      
      await supabase
        .from("recipe_sources")
        .update({ usage_count: newTotal })
        .eq("name", newSourceName);
    }

    return NextResponse.json({
      ok: true,
      data: { message: "Bron bijgewerkt" },
    });
  } catch (error) {
    console.error("Error updating source:", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UPDATE_ERROR",
          message: error instanceof Error ? error.message : "Onbekende fout bij bijwerken",
        },
      },
      { status: 500 }
    );
  }
}
