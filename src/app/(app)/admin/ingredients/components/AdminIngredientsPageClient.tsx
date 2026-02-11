'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { IngredientsAdminClient } from '@/src/app/(app)/admin/ingredients/components/IngredientsAdminClient';
import { IngredientGroupsAdminClient } from '@/src/app/(app)/admin/ingredients/components/IngredientGroupsAdminClient';

type TabId = 'ingredients' | 'groups';

const TABS: { id: TabId; label: string }[] = [
  { id: 'ingredients', label: 'Ingrediënten' },
  { id: 'groups', label: 'Ingredientgroepen' },
];

export function AdminIngredientsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const filterNoCategory = searchParams.get('filter') === 'noCategory';
  const activeTab: TabId = tabParam === 'groups' ? 'groups' : 'ingredients';

  const setActiveTabWithUrl = (tab: TabId) => {
    const url =
      tab === 'ingredients'
        ? '/admin/ingredients'
        : '/admin/ingredients?tab=groups';
    router.replace(url, { scroll: false });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
            Ingrediënten en groepen
          </h1>
          <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Beheer ingrediënten uit alle bronnen (NEVO, AI, NutriCoach, FNDDS)
            en beheer ingredientgroepen (categorieën) voor dieetregels.
          </p>
        </div>
      </div>

      {/* Tabs – grijze lijn, actieve tab in primary-kleur met onderstreping */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav
          className="-mb-px flex min-w-max gap-6 overflow-x-auto"
          aria-label="Tabs"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabWithUrl(tab.id)}
              className={`border-b-2 px-1 py-4 text-sm font-medium whitespace-nowrap transition-colors focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-zinc-900 ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
              }`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'ingredients' && (
        <IngredientsAdminClient
          embedded
          initialFilterNoCategory={filterNoCategory}
        />
      )}
      {activeTab === 'groups' && <IngredientGroupsAdminClient />}
    </div>
  );
}
