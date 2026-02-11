import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/src/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/catalyst/button';
import { Link } from '@/components/catalyst/link';
import { PlusIcon } from '@heroicons/react/16/solid';
import {
  listMealsAction,
  type ListMealsInput,
} from './actions/meal-list.actions';
import { listRecentMealsAction } from './actions/meal-recent.actions';
import { getCatalogOptionsForPickerAction } from './actions/catalog-options.actions';
import { RecipesIndexClient } from '@/src/app/(app)/recipes/components/RecipesIndexClient';
import RecipesIndexLoading from './loading';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('recipes');
  return {
    title: t('pageTitle'),
    description: t('pageDescription'),
  };
}

export const revalidate = 30;

const MEAL_SLOT_VALUES = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'other',
] as const;

function parseListMealsInput(
  params: Record<string, string | string[] | undefined>,
): ListMealsInput {
  const collectionParam =
    typeof params.collection === 'string'
      ? params.collection
      : Array.isArray(params.collection)
        ? (params.collection[0] ?? '')
        : '';
  const collection =
    collectionParam === 'recent'
      ? ('recent' as const)
      : collectionParam === 'saved'
        ? ('saved' as const)
        : ('all' as const);

  const q =
    typeof params.q === 'string'
      ? params.q
      : Array.isArray(params.q)
        ? (params.q[0] ?? '')
        : '';
  const mealSlotParam =
    typeof params.mealSlot === 'string' ? params.mealSlot : undefined;
  const mealSlot =
    mealSlotParam &&
    MEAL_SLOT_VALUES.includes(
      mealSlotParam as (typeof MEAL_SLOT_VALUES)[number],
    )
      ? (mealSlotParam as (typeof MEAL_SLOT_VALUES)[number])
      : undefined;
  const maxTotalMinutes =
    typeof params.maxTotalMinutes === 'string' &&
    params.maxTotalMinutes.trim() !== ''
      ? parseInt(params.maxTotalMinutes, 10)
      : undefined;
  const sourceName =
    typeof params.sourceName === 'string' ? params.sourceName : '';
  const tagsParam = params.tags;
  const tagLabelsAny =
    typeof tagsParam === 'string'
      ? tagsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : Array.isArray(tagsParam)
        ? tagsParam
            .flatMap((t) =>
              typeof t === 'string' ? t.split(',').map((s) => s.trim()) : [],
            )
            .filter(Boolean)
        : [];
  const cuisineParam =
    typeof params.cuisine === 'string'
      ? params.cuisine
      : Array.isArray(params.cuisine)
        ? (params.cuisine[0] ?? '')
        : '';
  const proteinParam =
    typeof params.protein === 'string'
      ? params.protein
      : Array.isArray(params.protein)
        ? (params.protein[0] ?? '')
        : '';
  const cuisineOptionId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      cuisineParam,
    )
      ? cuisineParam
      : undefined;
  const proteinTypeOptionId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      proteinParam,
    )
      ? proteinParam
      : undefined;
  const mealSlotOptionIdParam =
    typeof params.mealSlotOptionId === 'string'
      ? params.mealSlotOptionId
      : Array.isArray(params.mealSlotOptionId)
        ? (params.mealSlotOptionId[0] ?? '')
        : '';
  const mealSlotOptionId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      mealSlotOptionIdParam,
    )
      ? mealSlotOptionIdParam
      : undefined;
  const limit =
    typeof params.limit === 'string' && params.limit.trim() !== ''
      ? parseInt(params.limit, 10)
      : 12;
  const offset =
    typeof params.offset === 'string' && params.offset.trim() !== ''
      ? parseInt(params.offset, 10)
      : 0;
  // listMealsAction only accepts 'all' | 'saved'; map 'recent' to 'all' (page branches on 'recent' before calling listMealsAction)
  const listCollection = collection === 'recent' ? 'all' : collection;
  return {
    collection: listCollection,
    q: q.trim(),
    mealSlot: mealSlotOptionId ? undefined : mealSlot,
    mealSlotOptionId: mealSlotOptionId ?? null,
    maxTotalMinutes:
      Number.isFinite(maxTotalMinutes) && maxTotalMinutes! >= 0
        ? maxTotalMinutes
        : undefined,
    sourceName: sourceName.trim(),
    tagLabelsAny,
    cuisineOptionId: cuisineOptionId ?? null,
    proteinTypeOptionId: proteinTypeOptionId ?? null,
    limit: Number.isFinite(limit) && limit >= 1 && limit <= 50 ? limit : 12,
    offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
  };
}

type RecipesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Async content: fetches catalog + list + i18n in parallel, then renders. Wrapped in Suspense so shell can stream first. */
async function RecipesListContent({
  params,
}: {
  params: Record<string, string | string[] | undefined>;
}) {
  const collectionParam =
    typeof params.collection === 'string'
      ? params.collection
      : Array.isArray(params.collection)
        ? (params.collection[0] ?? '')
        : '';
  const collection =
    collectionParam === 'recent'
      ? 'recent'
      : collectionParam === 'saved'
        ? 'saved'
        : 'all';

  const cuisineParam =
    typeof params.cuisine === 'string'
      ? params.cuisine
      : Array.isArray(params.cuisine)
        ? (params.cuisine[0] ?? '')
        : '';
  const proteinParam =
    typeof params.protein === 'string'
      ? params.protein
      : Array.isArray(params.protein)
        ? (params.protein[0] ?? '')
        : '';

  const listPromise =
    collection === 'recent'
      ? (() => {
          const limit =
            typeof params.limit === 'string' && params.limit.trim() !== ''
              ? parseInt(params.limit, 10)
              : 12;
          const offset =
            typeof params.offset === 'string' && params.offset.trim() !== ''
              ? parseInt(params.offset, 10)
              : 0;
          const limitNum =
            Number.isFinite(limit) && limit >= 1 && limit <= 50 ? limit : 12;
          const offsetNum = Number.isFinite(offset) && offset >= 0 ? offset : 0;
          return listRecentMealsAction({ limit: limitNum, offset: offsetNum });
        })()
      : listMealsAction(parseListMealsInput(params));

  const [t, cuisineRes, proteinRes, mealSlotRes, listResult] =
    await Promise.all([
      getTranslations('recipes'),
      getCatalogOptionsForPickerAction({
        dimension: 'cuisine',
        selectedId: cuisineParam || undefined,
      }),
      getCatalogOptionsForPickerAction({
        dimension: 'protein_type',
        selectedId: proteinParam || undefined,
      }),
      getCatalogOptionsForPickerAction({
        dimension: 'meal_slot',
      }),
      listPromise,
    ]);

  const cuisineOptions = cuisineRes.ok ? cuisineRes.data : [];
  const proteinTypeOptions = proteinRes.ok ? proteinRes.data : [];
  const mealSlotOptions = mealSlotRes.ok ? mealSlotRes.data : [];
  const catalogLoadError = !cuisineRes.ok
    ? cuisineRes.error.message
    : !proteinRes.ok
      ? proteinRes.error.message
      : !mealSlotRes.ok
        ? mealSlotRes.error.message
        : undefined;

  if (!listResult.ok) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
        <p className="text-red-800 dark:text-red-200">
          {t('error')}: {listResult.error.message}
        </p>
        <Link
          href="/recipes"
          className="mt-2 inline-block text-sm font-medium text-red-700 hover:underline dark:text-red-300"
        >
          Opnieuw proberen
        </Link>
      </div>
    );
  }

  const { items, totalCount, limit, offset } = listResult.data;

  return (
    <RecipesIndexClient
      listResult={{ items, totalCount, limit, offset }}
      searchParams={params}
      cuisineOptions={cuisineOptions}
      proteinTypeOptions={proteinTypeOptions}
      mealSlotOptions={mealSlotOptions}
      catalogLoadError={catalogLoadError}
    />
  );
}

export default async function RecipesPage({ searchParams }: RecipesPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [params, t] = await Promise.all([
    searchParams,
    getTranslations('recipes'),
  ]);

  const resolvedParams = await params;

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <Link href="/recipes/import">
          <Button color="primary">
            <PlusIcon className="mr-2 h-4 w-4" />
            {t('addRecipe')}
          </Button>
        </Link>
      </div>
      <Suspense fallback={<RecipesIndexLoading />}>
        <RecipesListContent params={resolvedParams} />
      </Suspense>
    </div>
  );
}
