"use server";

import { createClient } from "@/src/lib/supabase/server";
import { RecipeAdaptationDbService } from "../services/recipe-adaptation-db.service";
import type { RecipeAdaptationDraft } from "../recipe-ai.types";
import type { ValidationReport } from "../services/diet-validator";

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: "AUTH_ERROR" | "VALIDATION_ERROR" | "DB_ERROR" | "INTERNAL_ERROR";
        message: string;
      };
    };

/**
 * Get user's current diet ID
 * 
 * @returns Diet ID (diet_type_id from active profile) or null
 */
export async function getCurrentDietIdAction(): Promise<
  ActionResult<{ dietId: string; dietName: string } | null>
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
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Get active diet profile
    const { data: profile, error: profileError } = await supabase
      .from("user_diet_profiles")
      .select("diet_type_id, diet_types!inner(name)")
      .eq("user_id", user.id)
      .is("ends_on", null)
      .maybeSingle();

    if (profileError) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: "Fout bij ophalen dieetprofiel",
        },
      };
    }

    if (!profile?.diet_type_id) {
      return {
        ok: true,
        data: null, // No diet selected
      };
    }

    const dietType = profile.diet_types as { name: string } | null;

    return {
      ok: true,
      data: {
        dietId: profile.diet_type_id,
        dietName: dietType?.name || "Onbekend",
      },
    };
  } catch (error) {
    console.error("Error in getCurrentDietIdAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
      },
    };
  }
}

/**
 * Persist recipe adaptation draft
 * 
 * Creates or updates a recipe adaptation record and creates a run record.
 * 
 * @param raw - Raw input (will be validated)
 * @returns ActionResult with adaptation ID
 */
export async function persistRecipeAdaptationDraftAction(
  raw: unknown
): Promise<ActionResult<{ adaptationId: string }>> {
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
          message: "Je moet ingelogd zijn om aanpassingen op te slaan",
        },
      };
    }

    // Validate input
    if (
      !raw ||
      typeof raw !== "object" ||
      !("recipeId" in raw) ||
      !("dietId" in raw) ||
      !("draft" in raw)
    ) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Ongeldige invoer",
        },
      };
    }

    const input = raw as {
      recipeId: string;
      dietId: string;
      draft: RecipeAdaptationDraft;
      validationReport?: ValidationReport;
      meta?: {
        timestamp?: string;
        locale?: string;
      };
    };

    if (!input.recipeId || !input.dietId || !input.draft) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "recipeId, dietId en draft zijn vereist",
        },
      };
    }

    // Upsert adaptation
    const dbService = new RecipeAdaptationDbService();
    const adaptation = await dbService.upsertAdaptation({
      userId: user.id,
      recipeId: input.recipeId,
      dietId: input.dietId,
      status: "draft",
      adaptation: input.draft,
    });

    // Create run record
    // If validation report not provided, create a minimal one
    const validationReport: ValidationReport =
      input.validationReport || {
        ok: true,
        matches: [],
        summary: "No validation report available",
      };

    await dbService.createRun({
      recipeAdaptationId: adaptation.id,
      inputSnapshot: {
        recipeId: input.recipeId,
        dietId: input.dietId,
        locale: input.meta?.locale,
      },
      outputSnapshot: input.draft,
      validationReport,
      outcome: "success",
    });

    return {
      ok: true,
      data: { adaptationId: adaptation.id },
    };
  } catch (error) {
    console.error("Error in persistRecipeAdaptationDraftAction:", error);
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Fout bij opslaan aanpassing",
      },
    };
  }
}

/**
 * Apply recipe adaptation
 * 
 * Updates the status of a recipe adaptation to 'applied'.
 * 
 * @param raw - Raw input (will be validated)
 * @returns ActionResult
 */
export async function applyRecipeAdaptationAction(
  raw: unknown
): Promise<ActionResult<void>> {
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
          message: "Je moet ingelogd zijn om aanpassingen toe te passen",
        },
      };
    }

    // Validate input
    if (
      !raw ||
      typeof raw !== "object" ||
      !("adaptationId" in raw) ||
      typeof (raw as any).adaptationId !== "string"
    ) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "adaptationId is vereist",
        },
      };
    }

    const { adaptationId } = raw as { adaptationId: string };

    // Update status
    const dbService = new RecipeAdaptationDbService();
    await dbService.updateStatus(adaptationId, user.id, "applied");

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error in applyRecipeAdaptationAction:", error);
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Fout bij toepassen aanpassing",
      },
    };
  }
}
