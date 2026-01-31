'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Heading } from '@/components/catalyst/heading';
import { Breadcrumbs } from '@/components/catalyst/breadcrumbs';
import { MealDetail } from './MealDetail';
import { getMealByIdAction } from '../../actions/meals.actions';
import { getRecipeComplianceScoresAction } from '../../actions/recipe-compliance.actions';
import {
  getCustomFoodNamesByIdsAction,
  getNevoFoodNamesByCodesAction,
} from '../actions/ingredient-matching.actions';
import type { RecipeComplianceResult } from '../../actions/recipe-compliance.actions';
import { useToast } from '@/src/components/app/ToastContext';

type RecipeDetailPageClientProps = {
  mealId: string;
  mealSource: 'custom' | 'gemini';
};

export function RecipeDetailPageClient({
  mealId,
  mealSource,
}: RecipeDetailPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const { showToast } = useToast();
  const [meal, setMeal] = useState<Record<string, unknown> | null>(null);
  const [nevoFoodNamesByCode, setNevoFoodNamesByCode] = useState<
    Record<string, string>
  >({});
  const [customFoodNamesById, setCustomFoodNamesById] = useState<
    Record<string, string>
  >({});
  const [complianceScore, setComplianceScore] =
    useState<RecipeComplianceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refetch meal data (with or without loading spinner)
  const loadMealInternal = useCallback(
    async (showLoadingSpinner: boolean) => {
      try {
        if (showLoadingSpinner) {
          setLoading(true);
          setError(null);
        }

        // Load meal
        const mealResult = await getMealByIdAction(mealId, mealSource);

        if (!mealResult.ok) {
          if (mealResult.error.code === 'AUTH_ERROR') {
            router.push('/login');
            return;
          }
          setError(mealResult.error.message);
          if (showLoadingSpinner) setLoading(false);
          return;
        }

        const loadedMeal = mealResult.data;
        setMeal(loadedMeal);
        const loaded = loadedMeal as Record<string, unknown>;
        const mealData = (loaded.mealData ?? loaded.meal_data) as
          | { ingredientRefs?: unknown[] }
          | null
          | undefined;
        const nevoCodesList: string[] = [];
        if (mealData?.ingredientRefs) {
          for (const ref of mealData.ingredientRefs) {
            const r = ref as { nevoCode?: string | number } | null;
            if (r != null && r.nevoCode != null)
              nevoCodesList.push(String(r.nevoCode));
          }
        }
        const customFoodIds = (mealData?.ingredientRefs ?? [])
          .filter((ref: unknown) => ref != null)
          .map((ref: { customFoodId?: string }) => ref.customFoodId)
          .filter(
            (id: unknown): id is string =>
              typeof id === 'string' && id.length > 0,
          );

        const base = loaded.mealData ?? loaded.meal_data ?? {};
        const instructions =
          (loaded.aiAnalysis as { instructions?: unknown } | undefined)
            ?.instructions ??
          (loaded.ai_analysis as { instructions?: unknown } | undefined)
            ?.instructions;
        const mealPayload =
          Array.isArray(instructions) && instructions.length > 0
            ? {
                ...(typeof base === 'object' && base !== null ? base : {}),
                instructions,
              }
            : base;

        // Compliance, NEVO-namen en custom-namen parallel opvragen (minder wachttijd)
        const [complianceResult, nevoNamesResult, customNamesResult] =
          await Promise.all([
            getRecipeComplianceScoresAction([
              {
                id: String(loadedMeal.id),
                source: mealSource,
                mealData: mealPayload,
              },
            ]),
            nevoCodesList.length > 0
              ? getNevoFoodNamesByCodesAction(nevoCodesList)
              : Promise.resolve({
                  ok: true as const,
                  data: {} as Record<string, string>,
                }),
            customFoodIds.length > 0
              ? getCustomFoodNamesByIdsAction(customFoodIds)
              : Promise.resolve({
                  ok: true as const,
                  data: {} as Record<string, string>,
                }),
          ]);

        if (
          complianceResult.ok &&
          complianceResult.data[String(loadedMeal.id)]
        ) {
          setComplianceScore(complianceResult.data[String(loadedMeal.id)]);
        } else {
          setComplianceScore(null);
        }

        const nevoNamesMap = nevoNamesResult.ok ? nevoNamesResult.data : {};
        const refs = mealData?.ingredientRefs ?? [];
        for (const code of nevoCodesList) {
          if (!nevoNamesMap[code] && refs.length > 0) {
            const ref = refs.find(
              (r: unknown) =>
                r != null &&
                typeof r === 'object' &&
                'nevoCode' in r &&
                String((r as { nevoCode?: string | number }).nevoCode) === code,
            ) as { displayName?: string } | undefined;
            if (ref?.displayName) nevoNamesMap[code] = ref.displayName;
          }
          if (!nevoNamesMap[code]) nevoNamesMap[code] = `NEVO ${code}`;
        }
        setNevoFoodNamesByCode(nevoNamesMap);

        setCustomFoodNamesById(
          customNamesResult.ok ? customNamesResult.data : {},
        );

        if (showLoadingSpinner) setLoading(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : String(err ?? 'Onbekende fout'),
        );
        if (showLoadingSpinner) setLoading(false);
      }
    },
    [mealId, mealSource, router],
  );

  const loadMeal = useCallback(
    () => loadMealInternal(true),
    [loadMealInternal],
  );
  const loadMealSilent = useCallback(
    () => loadMealInternal(false),
    [loadMealInternal],
  );

  // Listen for recipe source updates
  useEffect(() => {
    if (!meal) return; // Only listen if meal is loaded

    const handleSourceUpdate = (event?: CustomEvent | MessageEvent) => {
      // Reload meal data when source is updated
      const detail =
        (event as CustomEvent)?.detail || (event as MessageEvent)?.data;
      console.log(
        'Recipe source updated event received, reloading meal data...',
        detail,
      );

      // Force reload after a short delay to ensure database is updated
      setTimeout(() => {
        console.log('Reloading meal data after source update...');
        loadMeal();
      }, 1000);
    };

    // Use BroadcastChannel for cross-tab communication
    let broadcastChannel: BroadcastChannel | null = null;

    if (typeof window !== 'undefined') {
      // Listen to custom event
      const eventHandler = handleSourceUpdate as EventListener;
      window.addEventListener('recipeSourceUpdated', eventHandler);

      // Also listen to BroadcastChannel
      try {
        broadcastChannel = new BroadcastChannel('recipe-source-updates');
        broadcastChannel.onmessage = handleSourceUpdate;
      } catch (_e) {
        console.log('BroadcastChannel not supported, using events only');
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(
          'recipeSourceUpdated',
          handleSourceUpdate as EventListener,
        );
      }
      if (broadcastChannel) {
        broadcastChannel.close();
      }
    };
  }, [meal, loadMeal]);

  // Bij terugkeren naar het tabblad opnieuw namen ophalen (ingrediëntomschrijving kan zijn bijgewerkt)
  useEffect(() => {
    if (typeof document === 'undefined' || !meal) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadMealSilent();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [meal, loadMealSilent]);

  // Initial load
  useEffect(() => {
    // Validate mealId
    if (!mealId || mealId === 'undefined' || mealId.trim() === '') {
      queueMicrotask(() => {
        setError('Recept ID is vereist');
        setLoading(false);
      });
      return;
    }

    queueMicrotask(() => loadMeal());
  }, [mealId, mealSource, loadMeal]);

  const recipeBreadcrumbs = [
    { label: tCommon('home'), href: '/dashboard' },
    { label: tNav('recipes'), href: '/recipes' },
    {
      label: String(
        (meal as Record<string, unknown> | null)?.name ??
          (meal as Record<string, unknown> | null)?.mealName ??
          (meal as Record<string, unknown> | null)?.meal_name ??
          (loading ? 'Laden...' : error ? 'Fout' : 'Recept'),
      ),
      href: pathname ?? `/recipes/${mealId}`,
    },
  ];

  if (loading) {
    return (
      <div className="mt-6 space-y-6">
        <div
          className="h-5 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700"
          aria-hidden
        />
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 py-16">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300"
            aria-hidden
          />
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Recept wordt geladen...
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Receptgegevens en ingrediënten worden opgehaald
          </p>
        </div>
      </div>
    );
  }

  if (error || !meal) {
    return (
      <div className="space-y-6">
        <Breadcrumbs
          items={recipeBreadcrumbs}
          currentPageClassName="text-zinc-500 dark:text-zinc-400"
          className="mb-2"
        />
        <Heading level={1}>Fout</Heading>
        <div className="text-center py-12">
          <p className="text-red-600 dark:text-red-400">
            {error || 'Recept niet gevonden'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <Breadcrumbs
        items={recipeBreadcrumbs}
        currentPageClassName="text-zinc-500 dark:text-zinc-400"
        className="mb-2"
      />
      <MealDetail
        meal={meal}
        mealSource={mealSource}
        nevoFoodNamesByCode={nevoFoodNamesByCode}
        customFoodNamesById={customFoodNamesById}
        complianceScore={complianceScore}
        onRecipeApplied={loadMeal}
        onIngredientMatched={() => {
          loadMealSilent();
          showToast({
            type: 'success',
            title: 'Ingrediënt gekoppeld',
            description: 'Het recept is bijgewerkt.',
          });
        }}
        onSourceSaved={loadMealSilent}
      />
    </div>
  );
}
