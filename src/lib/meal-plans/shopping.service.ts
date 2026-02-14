/**
 * Meal Plan Shopping Service
 *
 * Calculates pantry coverage and generates shopping lists based on meal plan ingredientRefs.
 * This service is read-only (no database writes).
 */

import type { MealPlanResponse } from '@/src/lib/diets';
import { getNevoFoodByCode } from '@/src/lib/nevo/nutrition-calculator';
import { PantryService } from '@/src/lib/pantry/pantry.service';
import { getCanonicalIngredientIdsByNevoCodes } from '@/src/lib/ingredients/canonicalIngredients.service';
import type {
  PantryAvailability,
  MealPlanCoverage,
  ShoppingListResponse,
  ShoppingListItem,
  ShoppingListGroup,
  MealCoverage,
  MealIngredientCoverage,
} from './shopping.types';
import {
  mealPlanCoverageSchema,
  shoppingListResponseSchema,
} from './shopping.schemas';

const _NEVO_REF_BATCH_SIZE = 100;

const nevoFoodCache = new Map<
  string,
  { food: Record<string, unknown>; timestamp: number }
>();
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getNevoFoodCached(
  nevoCode: string,
): Promise<Record<string, unknown> | null> {
  const cached = nevoFoodCache.get(nevoCode);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.food;
  }
  const codeNum = parseInt(nevoCode, 10);
  if (isNaN(codeNum)) return null;
  const food = await getNevoFoodByCode(codeNum);
  if (food) {
    nevoFoodCache.set(nevoCode, { food, timestamp: Date.now() });
  }
  return food;
}

function deriveCategory(food: Record<string, unknown>): string | undefined {
  if (food?.food_group_nl) {
    const group = String(food.food_group_nl).toLowerCase();
    if (
      group.includes('vlees') ||
      group.includes('vis') ||
      group.includes('gevogelte') ||
      group.includes('eieren') ||
      group.includes('zuivel') ||
      group.includes('peulvruchten') ||
      group.includes('noten') ||
      group.includes('zaden')
    )
      return 'Eiwit';
    if (group.includes('groente') || group.includes('groenten'))
      return 'Groente';
    if (group.includes('fruit')) return 'Fruit';
    if (
      group.includes('vet') ||
      group.includes('olie') ||
      group.includes('boter')
    )
      return 'Vetten';
    if (
      group.includes('graan') ||
      group.includes('brood') ||
      group.includes('pasta') ||
      group.includes('rijst') ||
      group.includes('aardappel')
    )
      return 'Koolhydraten';
    return food.food_group_nl != null ? String(food.food_group_nl) : undefined;
  }
  return undefined;
}

async function loadPantryAvailabilityByNevoCodes(
  userId: string | undefined,
  nevoCodes: string[],
): Promise<PantryAvailability[]> {
  if (!userId || nevoCodes.length === 0) return [];
  try {
    const service = new PantryService();
    return await service.loadAvailabilityByNevoCodes(userId, nevoCodes);
  } catch {
    return [];
  }
}

function calculateAvailableG(pantry: PantryAvailability | undefined): number {
  if (!pantry) return 0;
  if (pantry.availableG !== undefined) return pantry.availableG;
  if (pantry.isAvailable === true) return Number.MAX_SAFE_INTEGER;
  return 0;
}

export class MealPlannerShoppingService {
  async buildCoverage(args: {
    plan: MealPlanResponse;
    pantry?: PantryAvailability[];
  }): Promise<MealPlanCoverage> {
    const { plan, pantry: providedPantry } = args;
    const pantry = providedPantry || [];
    const pantryMap = new Map<string, PantryAvailability>();
    for (const item of pantry) pantryMap.set(item.nevoCode, item);

    const mealCoverages: MealCoverage[] = [];
    let totalRequiredG = 0;
    let totalMissingG = 0;

    for (const day of plan.days) {
      for (const meal of day.meals) {
        if (!meal.ingredientRefs?.length) continue;
        const ingredientCoverages: MealIngredientCoverage[] = [];
        for (const ref of meal.ingredientRefs) {
          if (!ref.nevoCode) continue;
          const food = await getNevoFoodCached(ref.nevoCode);
          const name = String(
            food?.name_nl ?? food?.name_en ?? `NEVO ${ref.nevoCode}`,
          );
          const tags = ref.tags || [];
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
    mealPlanCoverageSchema.parse(coverage);
    return coverage;
  }

  async buildShoppingList(args: {
    plan: MealPlanResponse;
    pantry?: PantryAvailability[];
  }): Promise<ShoppingListResponse> {
    const { plan, pantry: providedPantry } = args;
    const pantry = providedPantry || [];
    const pantryMap = new Map<string, PantryAvailability>();
    for (const item of pantry) pantryMap.set(item.nevoCode, item);

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

    const groupMap = new Map<string, ShoppingListItem[]>();
    for (const item of shoppingListItems) {
      const category = item.category || 'Overig';
      const existing = groupMap.get(category);
      if (existing) existing.push(item);
      else groupMap.set(category, [item]);
    }

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

    shoppingListResponseSchema.parse(response);
    return response;
  }

  async buildCoverageWithPantry(
    plan: MealPlanResponse,
    userId: string,
  ): Promise<MealPlanCoverage> {
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
    const pantry = await loadPantryAvailabilityByNevoCodes(
      userId,
      Array.from(nevoCodes),
    );
    return this.buildCoverage({ plan, pantry });
  }

  async buildShoppingListWithPantry(
    plan: MealPlanResponse,
    userId: string,
  ): Promise<ShoppingListResponse> {
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
    const pantry = await loadPantryAvailabilityByNevoCodes(
      userId,
      Array.from(nevoCodes),
    );
    return this.buildShoppingList({ plan, pantry });
  }
}
