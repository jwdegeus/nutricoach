import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { isAdmin } from "@/src/lib/auth/roles";
import { revalidatePath } from "next/cache";

/**
 * GET /api/admin/recipe-sources
 * Get all recipe sources (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "AUTH_ERROR",
            message: "Alleen admins kunnen bronnen bekijken",
          },
        },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // Get all sources
    const { data: sources, error: sourcesError } = await supabase
      .from("recipe_sources")
      .select("*")
      .order("name", { ascending: true });

    if (sourcesError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "DB_ERROR",
            message: sourcesError.message,
          },
        },
        { status: 500 }
      );
    }

    // Calculate actual usage count for each source
    const sourcesWithUsage = await Promise.all(
      (sources || []).map(async (source) => {
        // Count usage in custom_meals
        const { count: customMealsCount } = await supabase
          .from("custom_meals")
          .select("*", { count: "exact", head: true })
          .eq("source", source.name);

        // Count usage in meal_history
        const { count: mealHistoryCount } = await supabase
          .from("meal_history")
          .select("*", { count: "exact", head: true })
          .eq("source", source.name);

        const actualUsage = (customMealsCount || 0) + (mealHistoryCount || 0);

        // Update usage_count in database if it differs
        if (actualUsage !== source.usage_count) {
          await supabase
            .from("recipe_sources")
            .update({ usage_count: actualUsage })
            .eq("id", source.id);
        }

        return {
          ...source,
          usage_count: actualUsage,
        };
      })
    );

    // Sort by usage count (descending), then by name
    sourcesWithUsage.sort((a, b) => {
      if (b.usage_count !== a.usage_count) {
        return b.usage_count - a.usage_count;
      }
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      ok: true,
      data: sourcesWithUsage,
    });
  } catch (error) {
    console.error("Error fetching recipe sources:", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Onbekende fout",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/recipe-sources
 * Create a new recipe source (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "AUTH_ERROR",
            message: "Alleen admins kunnen bronnen aanmaken",
          },
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Bron naam is vereist",
          },
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const trimmedName = name.trim();

    // Check if source already exists
    const { data: existing } = await supabase
      .from("recipe_sources")
      .select("id")
      .eq("name", trimmedName)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Een bron met deze naam bestaat al",
          },
        },
        { status: 400 }
      );
    }

    // Insert new source as system source
    const { data: newSource, error } = await supabase
      .from("recipe_sources")
      .insert({
        name: trimmedName,
        is_system: true,
        created_by_user_id: user?.id || null,
        usage_count: 0,
      })
      .select("*")
      .single();

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

    return NextResponse.json({
      ok: true,
      data: newSource,
    });
  } catch (error) {
    console.error("Error creating recipe source:", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "CREATE_ERROR",
          message: error instanceof Error ? error.message : "Onbekende fout",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/recipe-sources
 * Update a recipe source (admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "AUTH_ERROR",
            message: "Alleen admins kunnen bronnen bijwerken",
          },
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, name } = body;

    if (!id || !name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "ID en naam zijn vereist",
          },
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const trimmedName = name.trim();

    // Get the current source to find the old name
    const { data: currentSource, error: fetchError } = await supabase
      .from("recipe_sources")
      .select("name")
      .eq("id", id)
      .single();

    if (fetchError || !currentSource) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "DB_ERROR",
            message: "Bron niet gevonden",
          },
        },
        { status: 404 }
      );
    }

    const oldName = currentSource.name;

    // Check if another source with this name exists
    const { data: existing } = await supabase
      .from("recipe_sources")
      .select("id")
      .eq("name", trimmedName)
      .neq("id", id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Een bron met deze naam bestaat al",
          },
        },
        { status: 400 }
      );
    }

    // If the name is changing, update all meals that use this source
    if (oldName !== trimmedName) {
      console.log(`Updating source name from "${oldName}" to "${trimmedName}"`);
      
      // Update all custom_meals using this source
      const { data: customMealsData, error: customMealsError } = await supabase
        .from("custom_meals")
        .update({ source: trimmedName })
        .eq("source", oldName)
        .select("id");

      if (customMealsError) {
        console.error("Error updating custom_meals:", customMealsError);
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "DB_ERROR",
              message: `Fout bij bijwerken custom_meals: ${customMealsError.message}`,
            },
          },
          { status: 500 }
        );
      }

      console.log(`Updated ${customMealsData?.length || 0} custom_meals records`);

      // Update all meal_history using this source
      const { data: mealHistoryData, error: mealHistoryError } = await supabase
        .from("meal_history")
        .update({ source: trimmedName })
        .eq("source", oldName)
        .select("id");

      if (mealHistoryError) {
        console.error("Error updating meal_history:", mealHistoryError);
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "DB_ERROR",
              message: `Fout bij bijwerken meal_history: ${mealHistoryError.message}`,
            },
          },
          { status: 500 }
        );
      }

      console.log(`Updated ${mealHistoryData?.length || 0} meal_history records`);
    }

    // Update the source name in recipe_sources
    const { data: updatedSource, error } = await supabase
      .from("recipe_sources")
      .update({ name: trimmedName })
      .eq("id", id)
      .select("*")
      .single();

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

    // Revalidate recipe pages to show updated source names
    if (oldName !== trimmedName) {
      revalidatePath("/recipes");
      revalidatePath("/recipes/[recipeId]", "page");
    }

    return NextResponse.json({
      ok: true,
      data: updatedSource,
    });
  } catch (error) {
    console.error("Error updating recipe source:", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UPDATE_ERROR",
          message: error instanceof Error ? error.message : "Onbekende fout",
        },
      },
      { status: 500 }
    );
  }
}
