'use server';

import { del } from '@vercel/blob';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { createClient } from '@/src/lib/supabase/server';
import { CustomMealsService } from '@/src/lib/custom-meals/customMeals.service';
import { MealHistoryService } from '@/src/lib/meal-history';
import { isVercelBlobUrl } from '@/src/lib/storage/storage.service';
import type { CustomMealRecord } from '@/src/lib/custom-meals/customMeals.service';
import type { MealSlot } from '@/src/lib/diets';

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR' | 'AI_ERROR';
        message: string;
      };
    };

/**
 * Get all meals for current user (custom meals + meal history)
 */
export async function getAllMealsAction(): Promise<
  ActionResult<{
    customMeals: CustomMealRecord[];
    mealHistory: Record<string, unknown>[];
  }>
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om recepten te bekijken',
        },
      };
    }

    const service = new CustomMealsService();
    const customMeals = await service.getUserMeals(user.id);

    // Also get meal history
    const { data: mealHistory } = await supabase
      .from('meal_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

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
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om consumptie te loggen',
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
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Get top 5 consumed meals for dashboard
 */
export async function getTopConsumedMealsAction(): Promise<
  ActionResult<CustomMealRecord[]>
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
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
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Update diet type for a meal
 */
export async function updateMealDietTypeAction(args: {
  mealId: string;
  source: 'custom' | 'gemini';
  dietTypeName: string | null; // diet_types.name or null to remove
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om dieettypes bij te werken',
        },
      };
    }

    // Map diet_types.name to diet_key (use name directly, or map to DietKey if needed)
    // For now, we'll use the name directly as diet_key
    const dietKey = args.dietTypeName || null;

    if (args.source === 'custom') {
      const { error } = await supabase
        .from('custom_meals')
        .update({ diet_key: dietKey })
        .eq('id', args.mealId)
        .eq('user_id', user.id);

      if (error) {
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: error.message,
          },
        };
      }
    } else {
      // Update meal_history
      const { error } = await supabase
        .from('meal_history')
        .update({ diet_key: dietKey })
        .eq('id', args.mealId)
        .eq('user_id', user.id);

      if (error) {
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: error.message,
          },
        };
      }
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Delete a meal (custom meal or meal history).
 * - Custom: verwijdert ook de receptafbeelding in Vercel Blob (of lokaal bestand) en
 *   gerelateerde recipe_adaptations. meal_consumption_log en recipe_imports krijgen
 *   ON DELETE SET NULL, recipe_ingredients heeft ON DELETE CASCADE.
 * - Gemini (meal_history): verwijdert gerelateerde recipe_adaptations.
 */
export async function deleteMealAction(args: {
  mealId: string;
  source: 'custom' | 'gemini';
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om maaltijden te verwijderen',
        },
      };
    }

    // Verwijder recipe_adaptations die naar dit recept verwijzen (geen FK, dus handmatig)
    const { error: adaptationsError } = await supabase
      .from('recipe_adaptations')
      .delete()
      .eq('recipe_id', args.mealId)
      .eq('user_id', user.id);

    if (adaptationsError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: adaptationsError.message,
        },
      };
    }

    if (args.source === 'custom') {
      // Haal afbeelding-url/pad op vóór verwijderen, zodat we de blob kunnen verwijderen
      const { data: meal, error: fetchError } = await supabase
        .from('custom_meals')
        .select('source_image_url, source_image_path')
        .eq('id', args.mealId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) {
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: fetchError.message,
          },
        };
      }

      const pathOrUrl = (meal?.source_image_path ?? meal?.source_image_url) as
        | string
        | null
        | undefined;
      if (pathOrUrl) {
        if (isVercelBlobUrl(pathOrUrl)) {
          try {
            await del(pathOrUrl);
          } catch (blobError) {
            console.warn(
              '[deleteMealAction] Failed to delete blob:',
              blobError,
            );
          }
        } else if (existsSync(pathOrUrl)) {
          try {
            await unlink(pathOrUrl);
          } catch (unlinkError) {
            console.warn(
              '[deleteMealAction] Failed to delete local file:',
              unlinkError,
            );
          }
        }
      }

      const { error } = await supabase
        .from('custom_meals')
        .delete()
        .eq('id', args.mealId)
        .eq('user_id', user.id);

      if (error) {
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: error.message,
          },
        };
      }
    } else {
      const { error } = await supabase
        .from('meal_history')
        .delete()
        .eq('id', args.mealId)
        .eq('user_id', user.id);

      if (error) {
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: error.message,
          },
        };
      }
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Rate a meal (custom meal or meal history)
 */
export async function rateRecipeAction(args: {
  mealId: string;
  source: 'custom' | 'gemini';
  rating: number;
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om een recept te beoordelen',
        },
      };
    }

    // Validate rating
    if (args.rating < 1 || args.rating > 5) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Rating moet tussen 1 en 5 zijn',
        },
      };
    }

    const historyService = new MealHistoryService();

    if (args.source === 'custom') {
      // For custom meals, check if meal_history entry exists
      // If not, create one first, then rate it
      const { data: existingHistory } = await supabase
        .from('meal_history')
        .select('id')
        .eq('user_id', user.id)
        .eq('meal_id', args.mealId)
        .maybeSingle();

      if (!existingHistory) {
        // Get custom meal data to create meal_history entry
        const { data: customMeal } = await supabase
          .from('custom_meals')
          .select('id, name, meal_slot, meal_data, diet_key')
          .eq('id', args.mealId)
          .eq('user_id', user.id)
          .single();

        if (!customMeal) {
          return {
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Recept niet gevonden',
            },
          };
        }

        // Create meal_history entry for this custom meal
        const { error: insertError } = await supabase
          .from('meal_history')
          .insert({
            user_id: user.id,
            meal_id: args.mealId,
            meal_name: customMeal.name,
            meal_slot: customMeal.meal_slot,
            diet_key: customMeal.diet_key || 'balanced',
            meal_data: customMeal.meal_data,
          });

        if (insertError) {
          return {
            ok: false,
            error: {
              code: 'DB_ERROR',
              message: insertError.message,
            },
          };
        }
      }

      // Now rate the meal
      await historyService.rateMeal(user.id, args.mealId, args.rating);
    } else {
      // For meal_history (gemini source), use existing rating system
      await historyService.rateMeal(user.id, args.mealId, args.rating);
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Get rating for a meal (custom meal or meal history)
 */
export async function getRecipeRatingAction(args: {
  mealId: string;
  source: 'custom' | 'gemini';
}): Promise<ActionResult<number | null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // For both custom and gemini, check meal_history
    const { data, error } = await supabase
      .from('meal_history')
      .select('user_rating')
      .eq('user_id', user.id)
      .eq('meal_id', args.mealId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: data?.user_rating || null,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Update notes for a meal
 */
export async function updateRecipeNotesAction(args: {
  mealId: string;
  source: 'custom' | 'gemini';
  notes: string | null;
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om notities bij te werken',
        },
      };
    }

    if (args.source === 'custom') {
      const { error } = await supabase
        .from('custom_meals')
        .update({ notes: args.notes || null })
        .eq('id', args.mealId)
        .eq('user_id', user.id);

      if (error) {
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: error.message,
          },
        };
      }
    } else {
      // Update meal_history
      const { error } = await supabase
        .from('meal_history')
        .update({ notes: args.notes || null })
        .eq('id', args.mealId)
        .eq('user_id', user.id);

      if (error) {
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: error.message,
          },
        };
      }
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Update recipe preparation time and servings
 * When servings change, recalculates ingredient quantities and updates instructions
 */
export async function updateRecipePrepTimeAndServingsAction(args: {
  mealId: string;
  source: 'custom' | 'gemini';
  prepTime?: number | null;
  servings?: number | null;
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om receptgegevens bij te werken',
        },
      };
    }

    // Validate servings if provided
    if (
      args.servings !== undefined &&
      args.servings !== null &&
      args.servings < 1
    ) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Portiegrootte moet minimaal 1 zijn',
        },
      };
    }

    // Validate prepTime if provided
    if (
      args.prepTime !== undefined &&
      args.prepTime !== null &&
      args.prepTime < 0
    ) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Bereidingstijd kan niet negatief zijn',
        },
      };
    }

    // Get current meal data
    const tableName =
      args.source === 'custom' ? 'custom_meals' : 'meal_history';

    const { data: currentMeal, error: fetchError } = await supabase
      .from(tableName)
      .select('meal_data, ai_analysis')
      .eq('id', args.mealId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: fetchError.message,
        },
      };
    }

    if (!currentMeal) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Recept niet gevonden',
        },
      };
    }

    const currentMealData = currentMeal.meal_data || {};
    const currentAiAnalysis = currentMeal.ai_analysis || {};

    // Calculate ratio if servings changed
    const oldServings = currentMealData.servings || null;
    const newServings =
      args.servings !== undefined ? args.servings : oldServings;
    const servingsChanged =
      oldServings !== null &&
      newServings !== null &&
      oldServings !== newServings;
    const ratio =
      servingsChanged && oldServings > 0 ? newServings / oldServings : 1;

    // Update meal_data
    const updatedMealData = { ...currentMealData };

    if (args.prepTime !== undefined) {
      updatedMealData.prepTime = args.prepTime;
    }

    if (args.servings !== undefined) {
      updatedMealData.servings = args.servings;
    }

    // Recalculate ingredient quantities if servings changed
    if (
      servingsChanged &&
      updatedMealData.ingredientRefs &&
      Array.isArray(updatedMealData.ingredientRefs)
    ) {
      type RefLike = {
        quantityG?: number;
        quantity_g?: number;
        quantity?: number;
      };
      updatedMealData.ingredientRefs = updatedMealData.ingredientRefs.map(
        (ref: RefLike) => {
          const next: Record<string, unknown> = { ...ref };
          const currentG = ref.quantityG ?? ref.quantity_g;
          if (typeof currentG === 'number' && currentG > 0) {
            next.quantityG = Math.round(currentG * ratio);
            if (ref.quantity_g != null) next.quantity_g = next.quantityG;
          }
          if (
            typeof ref.quantity === 'number' &&
            Number.isFinite(ref.quantity)
          ) {
            next.quantity = Math.round(ref.quantity * ratio * 10) / 10;
          }
          return next;
        },
      );
    }

    // Also recalculate legacy ingredients format
    if (
      servingsChanged &&
      updatedMealData.ingredients &&
      Array.isArray(updatedMealData.ingredients)
    ) {
      updatedMealData.ingredients = updatedMealData.ingredients.map(
        (ing: Record<string, unknown>) => {
          const updated = { ...ing };
          if (ing.quantity !== null && ing.quantity !== undefined) {
            const q =
              typeof ing.quantity === 'number'
                ? ing.quantity
                : parseFloat(String(ing.quantity));
            if (Number.isFinite(q)) {
              updated.quantity = Math.round(q * ratio * 10) / 10; // Round to 1 decimal
            }
          }
          if (ing.amount !== null && ing.amount !== undefined) {
            const amt =
              typeof ing.amount === 'number'
                ? ing.amount
                : parseFloat(String(ing.amount));
            if (Number.isFinite(amt)) {
              updated.amount = Math.round(amt * ratio * 10) / 10;
            }
          }
          return updated;
        },
      );
    }

    // Update instructions to reflect new portion size (voor X persoon/personen)
    const portionLabel =
      newServings === 1 ? '1 persoon' : `${newServings} personen`;
    const updatedAiAnalysis = { ...currentAiAnalysis };
    if (servingsChanged && currentAiAnalysis.instructions) {
      const instructions = currentAiAnalysis.instructions;

      const applyInstructionPortionUpdates = (text: string): string => {
        let updatedText = text;
        // "voor X personen" / "voor X persoon"
        updatedText = updatedText.replace(
          /voor\s+(\d+)\s+personen?/gi,
          `voor ${portionLabel}`,
        );
        // Losse "X personen" / "X persoon" (alleen als dat het oude portieaantal was)
        updatedText = updatedText.replace(
          /(\d+)\s+personen?/g,
          (match: string, num: string) => {
            const oldNum = parseInt(num, 10);
            if (oldNum === oldServings) return portionLabel;
            return match;
          },
        );
        // "qty x porties" → nieuwe qty en porties
        updatedText = updatedText.replace(
          /(\d+(?:[.,]\d+)?)\s*(?:x|×)\s*(\d+)/g,
          (match: string, qty: string, multiplier: string) => {
            const quantity = parseFloat(qty.replace(',', '.'));
            const mult = parseInt(multiplier, 10);
            if (mult === oldServings && Number.isFinite(quantity)) {
              const newQty = Math.round(quantity * ratio * 10) / 10;
              return `${newQty} x ${portionLabel}`;
            }
            return match;
          },
        );
        return updatedText;
      };

      if (Array.isArray(instructions)) {
        updatedAiAnalysis.instructions = instructions.map(
          (instruction: string | { text?: string; step?: string }) => {
            const instructionText =
              typeof instruction === 'string'
                ? instruction
                : instruction?.text || instruction?.step || String(instruction);
            const updatedText = applyInstructionPortionUpdates(instructionText);
            if (typeof instruction === 'string') {
              return updatedText;
            }
            return {
              ...instruction,
              text: updatedText,
              step: updatedText,
            };
          },
        );
      } else if (typeof instructions === 'string') {
        updatedAiAnalysis.instructions =
          applyInstructionPortionUpdates(instructions);
      }
    }

    // Update database
    const updateData: {
      meal_data: Record<string, unknown>;
      updated_at: string;
      ai_analysis?: unknown;
    } = {
      meal_data: updatedMealData,
      updated_at: new Date().toISOString(),
    };

    // Only update ai_analysis if it was modified
    if (servingsChanged) {
      updateData.ai_analysis = updatedAiAnalysis;
    }

    const { error: updateError } = await supabase
      .from(tableName)
      .update(updateData)
      .eq('id', args.mealId)
      .eq('user_id', user.id);

    if (updateError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: updateError.message,
        },
      };
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/** Normaliseer ingrediënttekst voor lookup in recipe_ingredient_matches */
function normalizeIngredientText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Schat quantityG uit quantity + unit (bijv. 200 + "g" → 200; anders 100). */
function quantityGFromIngredient(ing: {
  quantity?: string | number | null;
  unit?: string | null;
}): number {
  const q = ing.quantity;
  const u = (ing.unit ?? 'g').toString().toLowerCase();
  if (u === 'g' && q != null) {
    const n = typeof q === 'number' ? q : parseFloat(String(q));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 100;
}

/**
 * Update recipe content (ingredients and preparation instructions).
 * Updates only the active version; meal_data_original / ai_analysis_original stay unchanged.
 * Na opslaan worden ingrediënten automatisch gematcht waar mogelijk via recipe_ingredient_matches.
 */
export async function updateRecipeContentAction(args: {
  mealId: string;
  source: 'custom' | 'gemini';
  ingredients: Array<{
    name: string;
    quantity?: string | number | null;
    unit?: string | null;
    note?: string | null;
    section?: string | null;
  }>;
  instructions: Array<{ step: number; text: string }>;
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om receptgegevens bij te werken',
        },
      };
    }

    const tableName =
      args.source === 'custom' ? 'custom_meals' : 'meal_history';

    const { data: current, error: fetchError } = await supabase
      .from(tableName)
      .select('meal_data, ai_analysis')
      .eq('id', args.mealId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError || !current) {
      return {
        ok: false,
        error: {
          code: fetchError ? 'DB_ERROR' : 'VALIDATION_ERROR',
          message: fetchError?.message ?? 'Recept niet gevonden',
        },
      };
    }

    const currentMealData =
      (current.meal_data as Record<string, unknown>) || {};
    const currentAiAnalysis =
      (current.ai_analysis as Record<string, unknown>) || {};

    const ingredientRows = args.ingredients.map((ing) => ({
      name: String(ing.name ?? '').trim(),
      quantity: ing.quantity != null ? String(ing.quantity) : '',
      unit: ing.unit != null && ing.unit !== '' ? String(ing.unit) : null,
      note: ing.note != null && ing.note !== '' ? String(ing.note) : null,
      original_line: String(ing.name ?? '').trim(),
      section:
        ing.section != null && String(ing.section).trim() !== ''
          ? String(ing.section).trim()
          : null,
    }));

    const ingredientRefs: Array<{
      displayName: string;
      quantityG: number;
      nevoCode?: string;
      customFoodId?: string;
    }> = [];
    const ingredientsUnmatched: typeof ingredientRows = [];

    for (const ing of ingredientRows) {
      const norm = normalizeIngredientText(ing.name || ing.original_line);
      if (!norm) {
        ingredientsUnmatched.push(ing);
        continue;
      }
      const { data: match } = await supabase
        .from('recipe_ingredient_matches')
        .select('source, nevo_code, custom_food_id, fdc_id')
        .eq('normalized_text', norm)
        .maybeSingle();

      if (
        match &&
        (match.nevo_code != null ||
          match.custom_food_id != null ||
          match.fdc_id != null)
      ) {
        const quantityG = quantityGFromIngredient(ing);
        ingredientRefs.push({
          displayName: ing.name || ing.original_line,
          quantityG,
          ...(match.source === 'nevo' && match.nevo_code != null
            ? { nevoCode: String(match.nevo_code) }
            : {}),
          ...(match.source === 'custom' && match.custom_food_id != null
            ? { customFoodId: match.custom_food_id }
            : {}),
          ...(match.source === 'fndds' && match.fdc_id != null
            ? { fdcId: match.fdc_id }
            : {}),
        });
      } else {
        ingredientsUnmatched.push(ing);
      }
    }

    // Bewaar de volledige ingrediëntenlijst (niet alleen unmatched), zodat de editor
    // na opslaan nog steeds alle rijen toont en gekoppelde ingrediënten (ingredientRefs)
    // niet verdwijnen bij een volgende bewerking.
    const updatedMealData = {
      ...currentMealData,
      ingredients: ingredientRows,
      ingredientRefs,
    };

    const updatedAiAnalysis = {
      ...currentAiAnalysis,
      instructions: args.instructions.map((inst) => ({
        step: inst.step,
        text: String(inst.text ?? '').trim(),
      })),
    };

    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        meal_data: updatedMealData,
        ai_analysis: updatedAiAnalysis,
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.mealId)
      .eq('user_id', user.id);

    if (updateError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: updateError.message,
        },
      };
    }

    return { ok: true, data: undefined };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Verwijder één ingrediënt uit een recept (op index). Werkt voor zowel
 * ingredientRefs-only als legacy ingredients; verwijdert op dezelfde index uit beide.
 */
export async function removeRecipeIngredientAction(args: {
  mealId: string;
  source: 'custom' | 'gemini';
  index: number;
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
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const tableName =
      args.source === 'custom' ? 'custom_meals' : 'meal_history';

    const { data: row, error: fetchError } = await supabase
      .from(tableName)
      .select('meal_data')
      .eq('id', args.mealId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError || !row) {
      return {
        ok: false,
        error: {
          code: fetchError ? 'DB_ERROR' : 'VALIDATION_ERROR',
          message: fetchError?.message ?? 'Recept niet gevonden',
        },
      };
    }

    const mealData = (row.meal_data as Record<string, unknown>) || {};
    const ingredients = Array.isArray(mealData.ingredients)
      ? [...(mealData.ingredients as unknown[])]
      : [];
    const ingredientRefs = Array.isArray(mealData.ingredientRefs)
      ? [...(mealData.ingredientRefs as unknown[])]
      : [];

    const i = args.index;
    if (i < 0 || i >= Math.max(ingredients.length, ingredientRefs.length)) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ongeldige index',
        },
      };
    }

    const newIngredients = ingredients.filter((_, idx) => idx !== i);
    const newRefs = ingredientRefs.filter((_, idx) => idx !== i);

    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        meal_data: {
          ...mealData,
          ingredients: newIngredients,
          ingredientRefs: newRefs,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.mealId)
      .eq('user_id', user.id);

    if (updateError) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: updateError.message },
      };
    }

    return { ok: true, data: undefined };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Get a single meal by ID (custom meal or meal history)
 */
export async function getMealByIdAction(
  mealId: string,
  source: 'custom' | 'gemini',
): Promise<ActionResult<CustomMealRecord | Record<string, unknown>>> {
  try {
    // Validate mealId
    if (!mealId || mealId === 'undefined' || mealId.trim() === '') {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Recept ID is vereist',
        },
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om recepten te bekijken',
        },
      };
    }

    if (source === 'custom') {
      const service = new CustomMealsService();
      const meal = await service.getMealById(mealId, user.id);

      if (!meal) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Recept niet gevonden',
          },
        };
      }

      // Get rating from meal_history if it exists
      const { data: ratingData } = await supabase
        .from('meal_history')
        .select('user_rating')
        .eq('user_id', user.id)
        .eq('meal_id', mealId)
        .maybeSingle();

      // Get notes
      const notes = meal.notes || null;

      const mealData = {
        ...meal,
        userRating: ratingData?.user_rating || null,
        notes,
      };

      // Debug logging for image URL
      console.log('[getMealByIdAction] Custom meal loaded:', {
        id: meal.id,
        name: meal.name,
        sourceImageUrl: meal.sourceImageUrl,
        sourceImagePath: meal.sourceImagePath,
      });

      return {
        ok: true,
        data: mealData,
      };
    } else {
      // Get from meal_history
      const { data, error } = await supabase
        .from('meal_history')
        .select('*')
        .eq('id', mealId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: error.message,
          },
        };
      }

      if (!data) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Recept niet gevonden',
          },
        };
      }

      return {
        ok: true,
        data: {
          id: data.id,
          mealId: data.meal_id,
          mealName: data.meal_name,
          mealSlot: data.meal_slot,
          dietKey: data.diet_key,
          mealData: data.meal_data,
          aiAnalysis: data.ai_analysis ?? null,
          userRating: data.user_rating,
          nutritionScore: data.nutrition_score,
          varietyScore: data.variety_score,
          combinedScore: data.combined_score,
          usageCount: data.usage_count,
          firstUsedAt: data.first_used_at,
          lastUsedAt: data.last_used_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          notes: data.notes || null,
          source: data.source || null,
          sourceImageUrl: null, // meal_history doesn't have source images
          sourceImagePath: null,
        },
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}
