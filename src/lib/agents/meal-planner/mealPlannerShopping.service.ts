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

    // Create pantry map for quick lookup
    const pantryMap = new Map<string, PantryAvailability>();
    for (const item of pantry) {
      pantryMap.set(item.nevoCode, item);
    }

    // Aggregate ingredients by nevoCode
    const ingredientMap = new Map<
      string,
      {
        nevoCode: string;
        requiredG: number;
        name?: string;
        category?: string;
        tags?: string[];
      }
    >();

    // Collect all ingredients
    for (const day of plan.days) {
      for (const meal of day.meals) {
        if (!meal.ingredientRefs) continue;

        for (const ref of meal.ingredientRefs) {
          const existing = ingredientMap.get(ref.nevoCode);
          if (existing) {
            existing.requiredG += ref.quantityG;
          } else {
            ingredientMap.set(ref.nevoCode, {
              nevoCode: ref.nevoCode,
              requiredG: ref.quantityG,
              tags: ref.tags,
            });
          }
        }
      }
    }

    // Enrich with NEVO data and calculate missing quantities
    const shoppingListItems: ShoppingListItem[] = [];
    let totalRequiredG = 0;
    let totalMissingG = 0;

    for (const [nevoCode, data] of ingredientMap.entries()) {
      // Get NEVO food data (with caching)
      const food = await getNevoFoodCached(nevoCode);
      const name = String(food?.name_nl ?? food?.name_en ?? `NEVO ${nevoCode}`);
      const category = deriveCategory(food ?? {}) || data.category || 'Overig';
      const tags = data.tags || [];

      // Get pantry availability
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
            nevoCodes.add(ref.nevoCode);
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
            nevoCodes.add(ref.nevoCode);
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
