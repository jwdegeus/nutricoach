import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { isAdmin } from "@/src/lib/auth/roles";

/**
 * DELETE /api/admin/recipe-sources/[id]
 * Delete a recipe source (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "AUTH_ERROR",
            message: "Alleen admins kunnen bronnen verwijderen",
          },
        },
        { status: 403 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "ID is vereist",
          },
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if source exists and get usage count
    const { data: source } = await supabase
      .from("recipe_sources")
      .select("id, name, usage_count, is_system")
      .eq("id", id)
      .maybeSingle();

    if (!source) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Bron niet gevonden",
          },
        },
        { status: 404 }
      );
    }

    // Don't allow deleting system sources that are in use
    if (source.is_system && source.usage_count > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Systeembronnen die in gebruik zijn kunnen niet worden verwijderd",
          },
        },
        { status: 400 }
      );
    }

    // Delete the source
    const { error } = await supabase.from("recipe_sources").delete().eq("id", id);

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
      data: { message: "Bron verwijderd" },
    });
  } catch (error) {
    console.error("Error deleting recipe source:", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DELETE_ERROR",
          message: error instanceof Error ? error.message : "Onbekende fout",
        },
      },
      { status: 500 }
    );
  }
}
