/**
 * Meal Planner Shopping Service
 *
 * Calculates pantry coverage and generates shopping lists based on meal plan ingredientRefs.
 *
 * This service is read-only (no database writes).
 */

import type { MealPlanResponse } from '@/src/lib/diets';
import { getNevoFoodByCode } from '@/src/lib/nevo/nutrition-calculator';
import { PantryService } from '@/src/lib/pantry/pantry.service';
import { createClient } from '@/src/lib/supabase/server';
import type {
  PantryAvailability,
  MealPlanCoverage,
  ShoppingListResponse,
  ShoppingListItem,
  ShoppingListGroup,
  MealCoverage,
  MealIngredientCoverage,
} from './mealPlannerShopping.types';
import {
  mealPlanCoverageSchema,
  shoppingListResponseSchema,
} from './mealPlannerShopping.schemas';

const CANONICAL_CATALOG_VIEW = 'canonical_ingredient_catalog_v1';
const CANONICAL_LOOKUP_COLUMNS = 'ingredient_id, ref_value';
const NEVO_REF_BATCH_SIZE = 100;

/**
 * In-memory cache for NEVO food lookups
 * Key: nevoCode (string)
 * Value: { food, timestamp }
 */
const nevoFoodCache = new Map<
  string,
  { food: Record<string, unknown>; timestamp: number }
>();

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get NEVO food by code (with caching)
 */
async function getNevoFoodCached(
  nevoCode: string,
): Promise<Record<string, unknown> | null> {
  const cached = nevoFoodCache.get(nevoCode);

  // Check if cache is valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.food;
  }

  // Fetch from database
  const codeNum = parseInt(nevoCode, 10);
  if (isNaN(codeNum)) {
    return null;
  }

  const food = await getNevoFoodByCode(codeNum);

  // Cache it
  if (food) {
    nevoFoodCache.set(nevoCode, {
      food,
      timestamp: Date.now(),
    });
  }

  return food;
}

/**
 * Derive category from NEVO food data
 */
function deriveCategory(food: Record<string, unknown>): string | undefined {
  // Try food_group_nl first
  if (food?.food_group_nl) {
    // Map common food groups to categories
    const group = String(food.food_group_nl).toLowerCase();

    // Protein sources
    if (
      group.includes('vlees') ||
      group.includes('vis') ||
      group.includes('gevogelte') ||
      group.includes('eieren') ||
      group.includes('zuivel') ||
      group.includes('peulvruchten') ||
      group.includes('noten') ||
      group.includes('zaden')
    ) {
      return 'Eiwit';
    }

    // Vegetables
    if (group.includes('groente') || group.includes('groenten')) {
      return 'Groente';
    }

    // Fruits
    if (group.includes('fruit')) {
      return 'Fruit';
    }

    // Fats
    if (
      group.includes('vet') ||
      group.includes('olie') ||
      group.includes('boter')
    ) {
      return 'Vetten';
    }

    // Carbs
    if (
      group.includes('graan') ||
      group.includes('brood') ||
      group.includes('pasta') ||
      group.includes('rijst') ||
      group.includes('aardappel')
    ) {
      return 'Koolhydraten';
    }

    // Return original group name if no mapping found
    return food.food_group_nl != null ? String(food.food_group_nl) : undefined;
  }

  return undefined;
}

/**
 * Load pantry availability by NEVO codes
 *
 * Uses PantryService to load actual pantry data from database.
 *
 * @param userId - User ID (required for real pantry lookup)
 * @param nevoCodes - Array of NEVO codes to check
 * @returns Array of pantry availability
 */
async function loadPantryAvailabilityByNevoCodes(
  userId: string | undefined,
  nevoCodes: string[],
): Promise<PantryAvailability[]> {
  // If no userId provided, return empty array (backward compatibility)
  if (!userId) {
    return [];
  }

  if (nevoCodes.length === 0) {
    return [];
  }

  try {
    const service = new PantryService();
    return await service.loadAvailabilityByNevoCodes(userId, nevoCodes);
  } catch (error) {
    console.error('Error loading pantry availability:', error);
    // Return empty array on error (graceful degradation)
    return [];
  }
}

/**
 * Calculate available quantity from pantry availability
 */
function calculateAvailableG(pantry: PantryAvailability | undefined): number {
  if (!pantry) {
    return 0;
  }

  // If availableG is provided, use it
  if (pantry.availableG !== undefined) {
    return pantry.availableG;
  }

  // If isAvailable is true, treat as "sufficient" (return large number)
  if (pantry.isAvailable === true) {
    return Number.MAX_SAFE_INTEGER; // Effectively unlimited
  }

  // Otherwise, not available
  return 0;
}

/**
 * Bulk lookup: nevoCode -> canonical_ingredients.id via canonical_ingredient_catalog_v1.
 * ref_type = 'nevo', ref_value in (nevoCodes). Chunks in batches to avoid .in() limits.
 * On error returns partial map or empty; does not throw (shopping list still works).
 * Exported for use in meal plan build-flow (write-time canonical enrichment).
 */
export async function getCanonicalIngredientIdsByNevoCodes(
  nevoCodes: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(nevoCodes)].filter(Boolean);
  if (unique.length === 0) return new Map();

  const result = new Map<string, string>();
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += NEVO_REF_BATCH_SIZE) {
    batches.push(unique.slice(i, i + NEVO_REF_BATCH_SIZE));
  }

  try {
    const supabase = await createClient();
    for (const batch of batches) {
      const { data, error } = await supabase
        .from(CANONICAL_CATALOG_VIEW)
        .select(CANONICAL_LOOKUP_COLUMNS)
        .eq('ref_type', 'nevo')
        .in('ref_value', batch);

      if (error) {
        const isSchemaCache =
          /schema cache|relation.*does not exist|could not find/i.test(
            error.message,
          );
        if (isSchemaCache) {
          console.warn(
            'Canonical ingredient catalog view not available (migrations may not be applied). Run: supabase db push',
          );
          return result;
        }
        console.error(
          'Canonical ingredient lookup by nevoCodes failed:',
          error.message,
        );
        continue;
      }
      for (const row of data ?? []) {
        const refValue = row.ref_value as string | null;
        const ingredientId = row.ingredient_id as string | null;
        if (refValue != null && ingredientId != null) {
          result.set(refValue, ingredientId);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Canonical ingredient lookup error:', msg);
  }
  return result;
}

/**
 * Meal Planner Shopping Service
 */
export class MealPlannerShoppingService {
  /**
   * Build coverage for a meal plan
   *
   * Calculates pantry coverage per meal and per day, showing which ingredients
   * are available and which are missing.
   *
   * @param args - Coverage calculation arguments
   * @returns Meal plan coverage with per-meal and totals
   */
  async buildCoverage(args: {
    plan: MealPlanResponse;
    pantry?: PantryAvailability[];
  }): Promise<MealPlanCoverage> {
    const { plan, pantry: providedPantry } = args;

    // Use provided pantry or empty array (backward compatible)
    const pantry = providedPantry || [];

    // Create pantry map for quick lookup
    const pantryMap = new Map<string, PantryAvailability>();
    for (const item of pantry) {
      pantryMap.set(item.nevoCode, item);
    }

    // Build coverage per meal
    const mealCoverages: MealCoverage[] = [];
    let totalRequiredG = 0;
    let totalMissingG = 0;

    for (const day of plan.days) {
      for (const meal of day.meals) {
        if (!meal.ingredientRefs || meal.ingredientRefs.length === 0) {
          continue;
        }

        const ingredientCoverages: MealIngredientCoverage[] = [];

        for (const ref of meal.ingredientRefs) {
          if (!ref.nevoCode) continue;
          // Get NEVO food data (with caching)
          const food = await getNevoFoodCached(ref.nevoCode);
          const name = String(
            food?.name_nl ?? food?.name_en ?? `NEVO ${ref.nevoCode}`,
          );
          const tags = ref.tags || [];

          // Get pantry availability
          const pantryItem = pantryMap.get(ref.nevoCode);
          const availableG = calculateAvailableG(pantryItem);
          const requiredG = ref.quantityG;
          const missingG = Math.max(requiredG - availableG, 0);
          const inPantry = availableG > 0;

          ingredientCoverages.push({
            nevoCode: ref.nevoCode,
            name,
            requiredG,
            availableG,
            missingG,
            inPantry,
            tags,
          });

          totalRequiredG += requiredG;
          totalMissingG += missingG;
        }

        mealCoverages.push({
          date: meal.date,
          mealSlot: meal.slot,
          mealTitle: meal.name,
          ingredients: ingredientCoverages,
        });
      }
    }

    // Calculate coverage percentage
    const coveragePct =
      totalRequiredG === 0
        ? 100
        : Math.round(
            ((totalRequiredG - totalMissingG) / totalRequiredG) * 100 * 10,
          ) / 10;

    const coverage: MealPlanCoverage = {
      days: mealCoverages,
      totals: {
        requiredG: totalRequiredG,
        missingG: totalMissingG,
        coveragePct,
      },
    };

    // Validate output
    mealPlanCoverageSchema.parse(coverage);

    return coverage;
  }

  /**
   * Build shopping list for a meal plan
   *
   * Aggregates ingredients across all meals/days, groups by category,
   * and calculates missing quantities.
   *
   * @param args - Shopping list calculation arguments
   * @returns Shopping list grouped by category
   */
  async buildShoppingList(args: {
    plan: MealPlanResponse;
    pantry?: PantryAvailability[];
  }): Promise<ShoppingListResponse> {
    const { plan, pantry: providedPantry } = args;

    // Use provided pantry or empty array (backward compatible)
    const pantry = providedPantry || [];

    // Create pantry map for quick lookup (keyed by nevoCode)
    const pantryMap = new Map<string, PantryAvailability>();
    for (const item of pantry) {
      pantryMap.set(item.nevoCode, item);
    }

    // Aggregatie: key = canon:<uuid> of nevo:<code>; value = requiredG + representatieve velden
    type AggEntry = {
      requiredG: number;
      canonicalIngredientId?: string;
      nevoCode: string;
      tags?: string[];
    };
    const ingredientMap = new Map<string, AggEntry>();

    for (const day of plan.days) {
      for (const meal of day.meals) {
        if (!meal.ingredientRefs) continue;

        for (const ref of meal.ingredientRefs) {
          const ingredientKey = ref.canonicalIngredientId
            ? `canon:${ref.canonicalIngredientId}`
            : ref.nevoCode?.trim()
              ? `nevo:${ref.nevoCode.trim()}`
              : null;
          if (!ingredientKey) continue;

          const existing = ingredientMap.get(ingredientKey);
          if (existing) {
            existing.requiredG += ref.quantityG;
          } else {
            ingredientMap.set(ingredientKey, {
              requiredG: ref.quantityG,
              canonicalIngredientId: ref.canonicalIngredientId,
              nevoCode: ref.nevoCode?.trim() ?? '',
              tags: ref.tags,
            });
          }
        }
      }
    }

    // Alleen voor nevo:-keys: bulk lookup canonical (fallback-enrichment + missing-lijst)
    const nevoKeysForEnrichment = [...ingredientMap.entries()]
      .filter(([k]) => k.startsWith('nevo:'))
      .map(([, v]) => v.nevoCode)
      .filter(Boolean);
    const nevoToCanonicalId = await getCanonicalIngredientIdsByNevoCodes(
      nevoKeysForEnrichment,
    );
    const missingCanonicalIngredientNevoCodes = [
      ...new Set(nevoKeysForEnrichment),
    ]
      .filter((code) => !nevoToCanonicalId.has(code))
      .sort((a, b) => a.localeCompare(b));

    // Bouw shopping list items (name/category uit NEVO via nevoCode; pantry op nevoCode)
    const shoppingListItems: ShoppingListItem[] = [];
    let totalRequiredG = 0;
    let totalMissingG = 0;

    for (const [ingredientKey, data] of ingredientMap.entries()) {
      const nevoCode = data.nevoCode;
      const canonicalId = ingredientKey.startsWith('canon:')
        ? ingredientKey.slice(6)
        : (nevoToCanonicalId.get(nevoCode) ?? undefined);

      const food = await getNevoFoodCached(nevoCode);
      const name = String(
        food?.name_nl ??
          food?.name_en ??
          (nevoCode ? `NEVO ${nevoCode}` : 'Onbekend'),
      );
      const category = deriveCategory(food ?? {}) || 'Overig';
      const tags = data.tags || [];

      const pantryItem = pantryMap.get(nevoCode);
      const availableG = calculateAvailableG(pantryItem);
      const requiredG = data.requiredG;
      const missingG = Math.max(requiredG - availableG, 0);

      shoppingListItems.push({
        nevoCode,
        name,
        requiredG,
        availableG,
        missingG,
        category,
        tags,
        ...(canonicalId && { canonicalIngredientId: canonicalId }),
      });

      totalRequiredG += requiredG;
      totalMissingG += missingG;
    }

    // Group by category
    const groupMap = new Map<string, ShoppingListItem[]>();
    for (const item of shoppingListItems) {
      const category = item.category || 'Overig';
      const existing = groupMap.get(category);
      if (existing) {
        existing.push(item);
      } else {
        groupMap.set(category, [item]);
      }
    }

    // Convert to groups and sort
    const groups: ShoppingListGroup[] = Array.from(groupMap.entries())
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));

    const response: ShoppingListResponse = {
      groups,
      totals: {
        items: shoppingListItems.length,
        requiredG: totalRequiredG,
        missingG: totalMissingG,
      },
      missingCanonicalIngredientNevoCodes,
    };

    // Validate output
    shoppingListResponseSchema.parse(response);

    return response;
  }

  /**
   * Build coverage for a meal plan with pantry lookup
   *
   * Convenience method that automatically loads pantry data for the user.
   *
   * @param plan - Meal plan
   * @param userId - User ID for pantry lookup
   * @returns Meal plan coverage with per-meal and totals
   */
  async buildCoverageWithPantry(
    plan: MealPlanResponse,
    userId: string,
  ): Promise<MealPlanCoverage> {
    // Collect all unique nevoCodes from plan
    const nevoCodes = new Set<string>();
    for (const day of plan.days) {
      for (const meal of day.meals) {
        if (meal.ingredientRefs) {
          for (const ref of meal.ingredientRefs) {
            if (ref.nevoCode) nevoCodes.add(ref.nevoCode);
          }
        }
      }
    }

    // Load pantry availability
    const pantry = await loadPantryAvailabilityByNevoCodes(
      userId,
      Array.from(nevoCodes),
    );

    return this.buildCoverage({ plan, pantry });
  }

  /**
   * Build shopping list for a meal plan with pantry lookup
   *
   * Convenience method that automatically loads pantry data for the user.
   *
   * @param plan - Meal plan
   * @param userId - User ID for pantry lookup
   * @returns Shopping list grouped by category
   */
  async buildShoppingListWithPantry(
    plan: MealPlanResponse,
    userId: string,
  ): Promise<ShoppingListResponse> {
    // Collect all unique nevoCodes from plan
    const nevoCodes = new Set<string>();
    for (const day of plan.days) {
      for (const meal of day.meals) {
        if (meal.ingredientRefs) {
          for (const ref of meal.ingredientRefs) {
            if (ref.nevoCode) nevoCodes.add(ref.nevoCode);
          }
        }
      }
    }

    // Load pantry availability
    const pantry = await loadPantryAvailabilityByNevoCodes(
      userId,
      Array.from(nevoCodes),
    );

    return this.buildShoppingList({ plan, pantry });
  }
}
