import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
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
    mealSlot,
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

export default async function RecipesPage({ searchParams }: RecipesPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const params = await searchParams;
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

  const t = await getTranslations('recipes');

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
  const [cuisineRes, proteinRes] = await Promise.all([
    getCatalogOptionsForPickerAction({
      dimension: 'cuisine',
      selectedId: cuisineParam || undefined,
    }),
    getCatalogOptionsForPickerAction({
      dimension: 'protein_type',
      selectedId: proteinParam || undefined,
    }),
  ]);
  const cuisineOptions = cuisineRes.ok ? cuisineRes.data : [];
  const proteinTypeOptions = proteinRes.ok ? proteinRes.data : [];
  const catalogLoadError = !cuisineRes.ok
    ? cuisineRes.error.message
    : !proteinRes.ok
      ? proteinRes.error.message
      : undefined;

  if (collection === 'recent') {
    // Recent: alleen limit/offset uit URL; q/filters worden niet toegepast (MVP).
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
    const result = await listRecentMealsAction({
      limit: limitNum,
      offset: offsetNum,
    });
    if (!result.ok) {
      return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold tracking-tight mb-4">
            {t('pageTitle')}
          </h1>
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4">
            <p className="text-red-800 dark:text-red-200">
              {t('error')}: {result.error.message}
            </p>
            <Link
              href="/recipes"
              className="mt-2 inline-block text-sm font-medium text-red-700 dark:text-red-300 hover:underline"
            >
              Opnieuw proberen
            </Link>
          </div>
        </div>
      );
    }
    const {
      items,
      totalCount,
      limit: resLimit,
      offset: resOffset,
    } = result.data;
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">
            {t('pageTitle')}
          </h1>
          <Link href="/recipes/import">
            <Button color="primary">
              <PlusIcon className="h-4 w-4 mr-2" />
              {t('addRecipe')}
            </Button>
          </Link>
        </div>
        <RecipesIndexClient
          listResult={{ items, totalCount, limit: resLimit, offset: resOffset }}
          searchParams={params}
          cuisineOptions={cuisineOptions}
          proteinTypeOptions={proteinTypeOptions}
          catalogLoadError={catalogLoadError}
        />
      </div>
    );
  }

  const input = parseListMealsInput(params);
  const result = await listMealsAction(input);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-3xl font-bold tracking-tight mb-4">
          {t('pageTitle')}
        </h1>
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4">
          <p className="text-red-800 dark:text-red-200">
            {t('error')}: {result.error.message}
          </p>
          <Link
            href="/recipes"
            className="mt-2 inline-block text-sm font-medium text-red-700 dark:text-red-300 hover:underline"
          >
            Opnieuw proberen
          </Link>
        </div>
      </div>
    );
  }

  const { items, totalCount, limit, offset } = result.data;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <Link href="/recipes/import">
          <Button color="primary">
            <PlusIcon className="h-4 w-4 mr-2" />
            {t('addRecipe')}
          </Button>
        </Link>
      </div>
      <RecipesIndexClient
        listResult={{ items, totalCount, limit, offset }}
        searchParams={params}
        cuisineOptions={cuisineOptions}
        proteinTypeOptions={proteinTypeOptions}
        catalogLoadError={catalogLoadError}
      />
    </div>
  );
}
