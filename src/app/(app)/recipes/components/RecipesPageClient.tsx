'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { RecipesList } from './RecipesList';
import type { MealItem } from './RecipesList';
import type { CustomMealRecord } from '@/src/lib/custom-meals/customMeals.service';
import type { DietKey } from '@/src/lib/diets';
import { Link } from '@/components/catalyst/link';
import { Text } from '@/components/catalyst/text';
import type { RecipeComplianceResult } from '../actions/recipe-compliance.actions';

type RecipesPageClientProps = {
  initialMeals: {
    customMeals: CustomMealRecord[];
    mealHistory: unknown[];
  };
  /** Compliance scores per meal id (0–100% volgens dieetregels) */
  initialComplianceScores?: Record<string, RecipeComplianceResult>;
  /** Bij "recepten voor ontbrekende categorieën": toon banner en gefilterde lijst */
  categoryFilter?: { categoryNames: string[] };
};

const ITEMS_PER_PAGE = 15;

export function RecipesPageClient({
  initialMeals,
  initialComplianceScores = {},
  categoryFilter,
}: RecipesPageClientProps) {
  const [meals, setMeals] = useState(initialMeals);
  const [complianceScores] = useState(initialComplianceScores);
  const [currentPage, setCurrentPage] = useState(1);

  // Handle consumption logged - update local state optimistically
  const handleConsumptionLogged = useCallback(
    (mealId: string, source: 'custom' | 'gemini') => {
      // Optimistically update consumption counts in local state
      setMeals((prev) => {
        if (source === 'custom') {
          return {
            ...prev,
            customMeals: prev.customMeals.map((meal) =>
              meal.id === mealId
                ? {
                    ...meal,
                    consumptionCount: (meal.consumptionCount || 0) + 1,
                    lastConsumedAt: new Date().toISOString(),
                    firstConsumedAt:
                      meal.firstConsumedAt || new Date().toISOString(),
                  }
                : meal,
            ),
          };
        } else {
          return {
            ...prev,
            mealHistory: prev.mealHistory.map((meal: unknown) => {
              const m = meal as Record<string, unknown>;
              return String(m.id) === mealId
                ? {
                    ...m,
                    usage_count: (Number(m.usage_count) || 0) + 1,
                    last_used_at: new Date().toISOString(),
                  }
                : meal;
            }),
          };
        }
      });
    },
    [],
  );

  // Handle diet type updated - update local state optimistically
  const handleDietTypeUpdated = useCallback(
    (
      mealId: string,
      source: 'custom' | 'gemini',
      dietTypeName: string | null,
    ) => {
      setMeals((prev) => {
        if (source === 'custom') {
          return {
            ...prev,
            customMeals: prev.customMeals.map((meal) =>
              meal.id === mealId
                ? {
                    ...meal,
                    dietKey: dietTypeName as DietKey | null,
                  }
                : meal,
            ),
          };
        } else {
          return {
            ...prev,
            mealHistory: prev.mealHistory.map((meal: unknown) => {
              const m = meal as Record<string, unknown>;
              return String(m.id) === mealId
                ? { ...m, diet_key: dietTypeName }
                : meal;
            }),
          };
        }
      });
    },
    [],
  );

  // Handle meal deleted - remove from local state
  const handleMealDeleted = useCallback(
    (mealId: string, source: 'custom' | 'gemini') => {
      setMeals((prev) => {
        if (source === 'custom') {
          return {
            ...prev,
            customMeals: prev.customMeals.filter((meal) => meal.id !== mealId),
          };
        } else {
          return {
            ...prev,
            mealHistory: prev.mealHistory.filter(
              (meal: unknown) =>
                String((meal as Record<string, unknown>).id) !== mealId,
            ),
          };
        }
      });
    },
    [],
  );

  // Handle rating updated - update local state optimistically
  const handleRatingUpdated = useCallback(
    (mealId: string, source: 'custom' | 'gemini', rating: number | null) => {
      setMeals((prev) => {
        if (source === 'custom') {
          return {
            ...prev,
            customMeals: prev.customMeals.map((meal) =>
              meal.id === mealId
                ? {
                    ...meal,
                    userRating: rating,
                  }
                : meal,
            ),
          };
        } else {
          return {
            ...prev,
            mealHistory: prev.mealHistory.map((meal: unknown) => {
              const m = meal as Record<string, unknown>;
              return String(m.id) === mealId
                ? { ...m, user_rating: rating }
                : meal;
            }),
          };
        }
      });
    },
    [],
  );

  const allMeals = useMemo<MealItem[]>(
    () => [
      ...meals.customMeals.map((m) => ({ ...m, source: 'custom' as const })),
      ...meals.mealHistory.map((m: unknown) => ({
        ...(m as Record<string, unknown>),
        source: 'gemini' as const,
      })),
    ],
    [meals],
  );

  // Calculate pagination
  const totalItems = allMeals.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));

  // Reset to last valid page if current page is out of bounds (e.g., after deleting items)
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      queueMicrotask(() => setCurrentPage(totalPages));
    }
  }, [totalPages, currentPage]);

  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedMeals = allMeals.slice(startIndex, endIndex);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    // Scroll to top of table
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <>
      {categoryFilter && categoryFilter.categoryNames.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/30">
          <Text className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Recepten die passen bij: {categoryFilter.categoryNames.join(', ')}
          </Text>
          <Text className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            Hieronder alleen recepten die ingrediënten uit deze groepen
            bevatten.{' '}
            <Link
              href="/recipes"
              className="text-amber-700 underline hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
            >
              Toon alle recepten
            </Link>
          </Text>
        </div>
      )}
      <RecipesList
        meals={paginatedMeals}
        totalItems={totalItems}
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        itemsPerPage={ITEMS_PER_PAGE}
        complianceScores={complianceScores}
        onPageChange={handlePageChange}
        onConsumptionLogged={handleConsumptionLogged}
        onDietTypeUpdated={handleDietTypeUpdated}
        onMealDeleted={handleMealDeleted}
        onRatingUpdated={handleRatingUpdated}
      />
    </>
  );
}
