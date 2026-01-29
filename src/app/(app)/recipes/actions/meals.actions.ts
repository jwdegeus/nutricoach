'use server';

import { createClient } from '@/src/lib/supabase/server';
import { CustomMealsService } from '@/src/lib/custom-meals/customMeals.service';
import { MealHistoryService } from '@/src/lib/meal-history';
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
    mealHistory: any[]; // TODO: type this properly
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
 * Delete a meal (custom meal or meal history)
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

    if (args.source === 'custom') {
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
      // Delete from meal_history
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
      updatedMealData.ingredientRefs = updatedMealData.ingredientRefs.map(
        (ref: any) => ({
          ...ref,
          quantityG: Math.round(ref.quantityG * ratio),
        }),
      );
    }

    // Also recalculate legacy ingredients format
    if (
      servingsChanged &&
      updatedMealData.ingredients &&
      Array.isArray(updatedMealData.ingredients)
    ) {
      updatedMealData.ingredients = updatedMealData.ingredients.map(
        (ing: any) => {
          const updated = { ...ing };
          if (ing.quantity !== null && ing.quantity !== undefined) {
            updated.quantity = Math.round(ing.quantity * ratio * 10) / 10; // Round to 1 decimal
          }
          return updated;
        },
      );
    }

    // Update instructions to reflect new portion size
    const updatedAiAnalysis = { ...currentAiAnalysis };
    if (servingsChanged && currentAiAnalysis.instructions) {
      const instructions = currentAiAnalysis.instructions;

      if (Array.isArray(instructions)) {
        // Update each instruction step
        updatedAiAnalysis.instructions = instructions.map(
          (instruction: any) => {
            const instructionText =
              typeof instruction === 'string'
                ? instruction
                : instruction?.text || instruction?.step || String(instruction);

            // Replace common portion references in instructions
            let updatedText = instructionText;

            // Replace "voor X personen" or "voor X personen" patterns
            updatedText = updatedText.replace(
              /voor\s+(\d+)\s+personen?/gi,
              `voor ${newServings} personen`,
            );

            // Replace "X personen" patterns
            updatedText = updatedText.replace(
              /(\d+)\s+personen?/g,
              (match: string, num: string) => {
                const oldNum = parseInt(num);
                if (oldNum === oldServings) {
                  return `${newServings} personen`;
                }
                return match;
              },
            );

            // Replace numeric quantities that might be portion-related
            // This is a simple heuristic - we look for numbers followed by common units
            updatedText = updatedText.replace(
              /(\d+(?:[.,]\d+)?)\s*(?:x|×)\s*(\d+)/g,
              (match: string, qty: string, multiplier: string) => {
                const quantity = parseFloat(qty.replace(',', '.'));
                const mult = parseInt(multiplier);
                if (mult === oldServings) {
                  const newQty = Math.round(quantity * ratio * 10) / 10;
                  return `${newQty} x ${newServings}`;
                }
                return match;
              },
            );

            if (typeof instruction === 'string') {
              return updatedText;
            } else {
              return {
                ...instruction,
                text: updatedText,
                step: updatedText,
              };
            }
          },
        );
      } else if (typeof instructions === 'string') {
        // Single string instruction
        let updatedText = instructions;
        updatedText = updatedText.replace(
          /voor\s+(\d+)\s+personen?/gi,
          `voor ${newServings} personen`,
        );
        updatedText = updatedText.replace(
          /(\d+)\s+personen?/g,
          (match, num) => {
            const oldNum = parseInt(num);
            if (oldNum === oldServings) {
              return `${newServings} personen`;
            }
            return match;
          },
        );
        updatedAiAnalysis.instructions = updatedText;
      }
    }

    // Update database
    const updateData: any = {
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

/**
 * Update recipe content (ingredients and preparation instructions).
 * Updates only the active version; meal_data_original / ai_analysis_original stay unchanged.
 */
export async function updateRecipeContentAction(args: {
  mealId: string;
  source: 'custom' | 'gemini';
  ingredients: Array<{
    name: string;
    quantity?: string | number | null;
    unit?: string | null;
    note?: string | null;
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

    const updatedMealData = {
      ...currentMealData,
      ingredients: args.ingredients.map((ing) => ({
        name: String(ing.name ?? '').trim(),
        quantity: ing.quantity != null ? String(ing.quantity) : '',
        unit: ing.unit != null && ing.unit !== '' ? String(ing.unit) : null,
        note: ing.note != null && ing.note !== '' ? String(ing.note) : null,
        original_line: String(ing.name ?? '').trim(),
      })),
      ingredientRefs: [],
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
 * Get a single meal by ID (custom meal or meal history)
 */
export async function getMealByIdAction(
  mealId: string,
  source: 'custom' | 'gemini',
): Promise<ActionResult<CustomMealRecord | any>> {
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
