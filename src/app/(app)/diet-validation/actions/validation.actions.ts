"use server";

import { createClient } from "@/src/lib/supabase/server";
import { getDietRules } from "@/src/app/(app)/onboarding/queries/diet-rules.queries";
import {
  validateRecipeAgainstDiet,
  validateIngredientAgainstDiet,
  type RecipeInput,
  type IngredientInput,
  type RecipeValidationResult,
  type IngredientValidationResult,
} from "@/src/lib/diet-validation/validation-engine";
import type { ActionResult } from "@/src/lib/types";

/**
 * Validates a recipe against the user's selected diet
 */
export async function validateRecipeAction(
  recipe: RecipeInput,
  dietTypeId?: string
): Promise<ActionResult<RecipeValidationResult>> {
  try {
    const supabase = await createClient();
    
    // Get user's diet type if not provided
    if (!dietTypeId) {
      const { data: profile, error: profileError } = await supabase
        .from("user_diet_profiles")
        .select("diet_type_id")
        .eq("ends_on", null) // Active profile
        .maybeSingle();
      
      if (profileError) {
        return {
          error: "Fout bij ophalen dieetprofiel",
        };
      }
      
      if (!profile?.diet_type_id) {
        return {
          error: "Geen actief dieetprofiel gevonden. Voltooi eerst de onboarding.",
        };
      }
      
      dietTypeId = profile.diet_type_id;
    }
    
    // Get diet rules
    const dietRules = await getDietRules(dietTypeId);
    
    if (dietRules.length === 0) {
      return {
        error: "Geen regels gevonden voor geselecteerd dieettype",
      };
    }
    
    // Validate recipe
    const validationResult = validateRecipeAgainstDiet(recipe, dietRules);
    
    return {
      data: validationResult,
    };
  } catch (error) {
    console.error("Fout bij valideren recept:", error);
    return {
      error: error instanceof Error ? error.message : "Fout bij valideren recept",
    };
  }
}

/**
 * Validates a single ingredient against the user's selected diet
 */
export async function validateIngredientAction(
  ingredient: IngredientInput,
  dietTypeId?: string
): Promise<ActionResult<IngredientValidationResult>> {
  try {
    const supabase = await createClient();
    
    // Get user's diet type if not provided
    if (!dietTypeId) {
      const { data: profile, error: profileError } = await supabase
        .from("user_diet_profiles")
        .select("diet_type_id")
        .eq("ends_on", null) // Active profile
        .maybeSingle();
      
      if (profileError) {
        return {
          error: "Fout bij ophalen dieetprofiel",
        };
      }
      
      if (!profile?.diet_type_id) {
        return {
          error: "Geen actief dieetprofiel gevonden. Voltooi eerst de onboarding.",
        };
      }
      
      dietTypeId = profile.diet_type_id;
    }
    
    // Get diet rules
    const dietRules = await getDietRules(dietTypeId);
    
    if (dietRules.length === 0) {
      return {
        error: "Geen regels gevonden voor geselecteerd dieettype",
      };
    }
    
    // Validate ingredient
    const validationResult = validateIngredientAgainstDiet(ingredient, dietRules);
    
    return {
      data: validationResult,
    };
  } catch (error) {
    console.error("Fout bij valideren ingrediënt:", error);
    return {
      error: error instanceof Error ? error.message : "Fout bij valideren ingrediënt",
    };
  }
}

/**
 * Validates multiple ingredients at once
 */
export async function validateIngredientsAction(
  ingredients: IngredientInput[],
  dietTypeId?: string
): Promise<ActionResult<IngredientValidationResult[]>> {
  try {
    const supabase = await createClient();
    
    // Get user's diet type if not provided
    if (!dietTypeId) {
      const { data: profile, error: profileError } = await supabase
        .from("user_diet_profiles")
        .select("diet_type_id")
        .eq("ends_on", null) // Active profile
        .maybeSingle();
      
      if (profileError) {
        return {
          error: "Fout bij ophalen dieetprofiel",
        };
      }
      
      if (!profile?.diet_type_id) {
        return {
          error: "Geen actief dieetprofiel gevonden. Voltooi eerst de onboarding.",
        };
      }
      
      dietTypeId = profile.diet_type_id;
    }
    
    // Get diet rules
    const dietRules = await getDietRules(dietTypeId);
    
    if (dietRules.length === 0) {
      return {
        error: "Geen regels gevonden voor geselecteerd dieettype",
      };
    }
    
    // Validate each ingredient
    const validationResults = ingredients.map(ingredient =>
      validateIngredientAgainstDiet(ingredient, dietRules)
    );
    
    return {
      data: validationResults,
    };
  } catch (error) {
    console.error("Fout bij valideren ingrediënten:", error);
    return {
      error: error instanceof Error ? error.message : "Fout bij valideren ingrediënten",
    };
  }
}

/**
 * Gets the user's current diet type name
 */
export async function getCurrentDietTypeAction(): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const supabase = await createClient();
    
    const { data: profile, error: profileError } = await supabase
      .from("user_diet_profiles")
      .select("diet_type_id, diet_types!inner(name)")
      .eq("ends_on", null) // Active profile
      .maybeSingle();
    
    if (profileError) {
      return {
        error: "Fout bij ophalen dieetprofiel",
      };
    }
    
    if (!profile?.diet_type_id) {
      return {
        error: "Geen actief dieetprofiel gevonden",
      };
    }
    
    const dietType = profile.diet_types as { name: string } | null;
    
    return {
      data: {
        id: profile.diet_type_id,
        name: dietType?.name || "Onbekend",
      },
    };
  } catch (error) {
    console.error("Fout bij ophalen dieettype:", error);
    return {
      error: error instanceof Error ? error.message : "Fout bij ophalen dieettype",
    };
  }
}
