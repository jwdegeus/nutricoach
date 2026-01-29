'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { IngredientsAdminClient } from './IngredientsAdminClient';
import { IngredientGroupsAdminClient } from './IngredientGroupsAdminClient';

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
  const initialTab: TabId = tabParam === 'groups' ? 'groups' : 'ingredients';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Sync URL when tab changes
  const setActiveTabWithUrl = (tab: TabId) => {
    setActiveTab(tab);
    const url =
      tab === 'ingredients'
        ? '/admin/ingredients'
        : '/admin/ingredients?tab=groups';
    router.replace(url, { scroll: false });
  };

  // Sync state from URL (e.g. back/forward or direct link)
  useEffect(() => {
    const t = searchParams.get('tab');
    const next: TabId = t === 'groups' ? 'groups' : 'ingredients';
    if (next !== activeTab) setActiveTab(next);
  }, [searchParams]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
          Ingrediënten en groepen
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Beheer NEVO- en eigen ingrediënten, en beheer ingredientgroepen
          (categorieën) voor dieetregels.
        </p>
      </div>

      {/* Tabs –zelfde stijl als dieetpagina: grijze lijn, actieve tab blauw met onderstreping */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabWithUrl(tab.id)}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
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
