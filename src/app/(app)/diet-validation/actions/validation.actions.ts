'use server';

import { createClient } from '@/src/lib/supabase/server';
import { getDefaultFamilyMemberId } from '@/src/lib/family/defaultFamilyMember';
import { getDietRules } from '@/src/app/(app)/onboarding/queries/diet-rules.queries';
import {
  validateRecipeAgainstDiet,
  validateIngredientAgainstDiet,
  type RecipeInput,
  type IngredientInput,
  type RecipeValidationResult,
  type IngredientValidationResult,
} from '@/src/lib/diet-validation/validation-engine';
import type { ActionResult } from '@/src/lib/types';

/** Resolve current user's diet_type_id (family as source of truth, then user_diet_profiles). */
async function getCurrentUserDietTypeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const familyMemberId = await getDefaultFamilyMemberId(supabase, user.id);
  if (familyMemberId) {
    const { data: fm } = await supabase
      .from('family_member_diet_profiles')
      .select('diet_type_id')
      .eq('family_member_id', familyMemberId)
      .is('ends_on', null)
      .maybeSingle();
    if (fm?.diet_type_id) return fm.diet_type_id;
  }

  const { data: profile } = await supabase
    .from('user_diet_profiles')
    .select('diet_type_id')
    .eq('user_id', user.id)
    .is('ends_on', null)
    .maybeSingle();
  return profile?.diet_type_id ?? null;
}

/**
 * Validates a recipe against the user's selected diet
 */
export async function validateRecipeAction(
  recipe: RecipeInput,
  dietTypeId?: string,
): Promise<ActionResult<RecipeValidationResult>> {
  try {
    const supabase = await createClient();

    if (!dietTypeId) {
      dietTypeId = (await getCurrentUserDietTypeId(supabase)) ?? undefined;
      if (!dietTypeId) {
        return {
          error:
            'Geen actief dieetprofiel gevonden. Voeg een familielid toe en stel dieet in onder Familie.',
        };
      }
    }

    // Get diet rules
    const dietRules = await getDietRules(dietTypeId);

    if (dietRules.length === 0) {
      return {
        error: 'Geen regels gevonden voor geselecteerd dieettype',
      };
    }

    // Validate recipe
    const validationResult = validateRecipeAgainstDiet(recipe, dietRules);

    return {
      data: validationResult,
    };
  } catch (error) {
    console.error('Fout bij valideren recept:', error);
    return {
      error:
        error instanceof Error ? error.message : 'Fout bij valideren recept',
    };
  }
}

/**
 * Validates a single ingredient against the user's selected diet
 */
export async function validateIngredientAction(
  ingredient: IngredientInput,
  dietTypeId?: string,
): Promise<ActionResult<IngredientValidationResult>> {
  try {
    const supabase = await createClient();

    if (!dietTypeId) {
      dietTypeId = (await getCurrentUserDietTypeId(supabase)) ?? undefined;
      if (!dietTypeId) {
        return {
          error:
            'Geen actief dieetprofiel gevonden. Voeg een familielid toe en stel dieet in onder Familie.',
        };
      }
    }

    const dietRules = await getDietRules(dietTypeId);

    if (dietRules.length === 0) {
      return {
        error: 'Geen regels gevonden voor geselecteerd dieettype',
      };
    }

    // Validate ingredient
    const validationResult = validateIngredientAgainstDiet(
      ingredient,
      dietRules,
    );

    return {
      data: validationResult,
    };
  } catch (error) {
    console.error('Fout bij valideren ingrediënt:', error);
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Fout bij valideren ingrediënt',
    };
  }
}

/**
 * Validates multiple ingredients at once
 */
export async function validateIngredientsAction(
  ingredients: IngredientInput[],
  dietTypeId?: string,
): Promise<ActionResult<IngredientValidationResult[]>> {
  try {
    const supabase = await createClient();

    if (!dietTypeId) {
      dietTypeId = (await getCurrentUserDietTypeId(supabase)) ?? undefined;
      if (!dietTypeId) {
        return {
          error:
            'Geen actief dieetprofiel gevonden. Voeg een familielid toe en stel dieet in onder Familie.',
        };
      }
    }

    const dietRules = await getDietRules(dietTypeId);

    if (dietRules.length === 0) {
      return {
        error: 'Geen regels gevonden voor geselecteerd dieettype',
      };
    }

    // Validate each ingredient
    const validationResults = ingredients.map((ingredient) =>
      validateIngredientAgainstDiet(ingredient, dietRules),
    );

    return {
      data: validationResults,
    };
  } catch (error) {
    console.error('Fout bij valideren ingrediënten:', error);
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Fout bij valideren ingrediënten',
    };
  }
}

/**
 * Gets the user's current diet type (id + name). Family as source of truth.
 */
export async function getCurrentDietTypeAction(): Promise<
  ActionResult<{ id: string; name: string }>
> {
  try {
    const supabase = await createClient();
    const dietTypeId = await getCurrentUserDietTypeId(supabase);
    if (!dietTypeId) {
      return { error: 'Geen actief dieetprofiel gevonden' };
    }

    const { data: dietType, error } = await supabase
      .from('diet_types')
      .select('id, name')
      .eq('id', dietTypeId)
      .maybeSingle();

    if (error || !dietType) {
      return {
        error: 'Fout bij ophalen dieettype',
      };
    }

    return {
      data: {
        id: dietType.id,
        name: (dietType as { name: string }).name || 'Onbekend',
      },
    };
  } catch (error) {
    console.error('Fout bij ophalen dieettype:', error);
    return {
      error:
        error instanceof Error ? error.message : 'Fout bij ophalen dieettype',
    };
  }
}
