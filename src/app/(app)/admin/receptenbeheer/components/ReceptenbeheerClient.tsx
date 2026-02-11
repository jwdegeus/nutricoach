'use client';

import { useState } from 'react';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { RecipeSourcesAdminClient } from '@/src/app/(app)/admin/recipe-sources/components/RecipeSourcesAdminClient';
import { CatalogAdminClient } from '@/src/app/(app)/admin/catalog/components/CatalogAdminClient';

type TabId = 'bronnen' | 'keukens';

const TABS: { id: TabId; label: string }[] = [
  { id: 'bronnen', label: 'Recept bronnen' },
  { id: 'keukens', label: 'Classificatie beheer' },
];

type ReceptenbeheerClientProps = {
  /** Initial tab from URL (e.g. ?tab=keukens). */
  initialTab?: TabId;
};

export function ReceptenbeheerClient({
  initialTab,
}: ReceptenbeheerClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'bronnen');

  return (
    <div className="space-y-6 p-6">
      <div>
        <Heading level={1}>Receptenbeheer</Heading>
        <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
          Beheer recept bronnen en catalog opties (keuken, proteïne-type).
        </Text>
      </div>

      {/* Tabs */}
      <nav
        role="tablist"
        aria-label="Receptenbeheer secties"
        className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-700"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                isActive
                  ? 'border-b-2 border-primary-500 pt-1 pr-4 pb-3 text-sm font-medium text-primary-600 dark:text-primary-400'
                  : 'border-b-2 border-transparent pt-1 pr-4 pb-3 text-sm font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-white'
              }
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab panels */}
      <div
        id="panel-bronnen"
        role="tabpanel"
        aria-labelledby="tab-bronnen"
        hidden={activeTab !== 'bronnen'}
        className="focus:outline-none"
      >
        {activeTab === 'bronnen' && <RecipeSourcesAdminClient />}
      </div>

      <div
        id="panel-keukens"
        role="tabpanel"
        aria-labelledby="tab-keukens"
        hidden={activeTab !== 'keukens'}
        className="focus:outline-none"
      >
        {activeTab === 'keukens' && <CatalogAdminClient />}
      </div>
    </div>
  );
}
