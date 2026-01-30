'use client';

import { useState } from 'react';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Button } from '@/components/catalyst/button';
import { RecipeSourcesAdminClient } from '@/src/app/(app)/admin/recipe-sources/components/RecipeSourcesAdminClient';

type TabId = 'bronnen' | 'categorieen' | 'tags' | 'keukens' | 'boeken';

const TABS: { id: TabId; label: string }[] = [
  { id: 'bronnen', label: 'Recept bronnen' },
  { id: 'categorieen', label: 'Recept categorieën' },
  { id: 'tags', label: 'Recept tags' },
  { id: 'keukens', label: 'Recept keukens' },
  { id: 'boeken', label: 'Recept boeken' },
];

export function ReceptenbeheerClient() {
  const [activeTab, setActiveTab] = useState<TabId>('bronnen');

  return (
    <div className="space-y-6 p-6">
      <div>
        <Heading level={1}>Receptenbeheer</Heading>
        <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
          Beheer recept bronnen, categorieën, tags, keukens en boeken.
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
                  ? 'border-b-2 border-primary-500 pb-3 pr-4 pt-1 text-sm font-medium text-primary-600 dark:text-primary-400'
                  : 'border-b-2 border-transparent pb-3 pr-4 pt-1 text-sm font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-white'
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
        id="panel-categorieen"
        role="tabpanel"
        aria-labelledby="tab-categorieen"
        hidden={activeTab !== 'categorieen'}
        className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-700 dark:bg-zinc-900/50"
      >
        {activeTab === 'categorieen' && (
          <div className="text-center">
            <Text className="text-zinc-500 dark:text-zinc-400">
              Recept categorieën – binnenkort beschikbaar. Hier kun je straks
              categorieën beheren (bijv. ontbijt, hoofdgerecht, dessert).
            </Text>
          </div>
        )}
      </div>

      <div
        id="panel-tags"
        role="tabpanel"
        aria-labelledby="tab-tags"
        hidden={activeTab !== 'tags'}
        className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-700 dark:bg-zinc-900/50"
      >
        {activeTab === 'tags' && (
          <div className="text-center">
            <Text className="text-zinc-500 dark:text-zinc-400">
              Recept tags – binnenkort beschikbaar. Hier kun je straks tags
              beheren om recepten te labelen en filteren.
            </Text>
          </div>
        )}
      </div>

      <div
        id="panel-keukens"
        role="tabpanel"
        aria-labelledby="tab-keukens"
        hidden={activeTab !== 'keukens'}
        className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-700 dark:bg-zinc-900/50"
      >
        {activeTab === 'keukens' && (
          <div className="text-center">
            <Text className="text-zinc-500 dark:text-zinc-400">
              Recept keukens – binnenkort beschikbaar. Hier kun je straks
              keukens beheren (bijv. Indiaas, Japans, Italiaans, Mexicaans).
            </Text>
          </div>
        )}
      </div>

      <div
        id="panel-boeken"
        role="tabpanel"
        aria-labelledby="tab-boeken"
        hidden={activeTab !== 'boeken'}
        className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-700 dark:bg-zinc-900/50"
      >
        {activeTab === 'boeken' && (
          <div className="text-center">
            <Text className="text-zinc-500 dark:text-zinc-400">
              Recept boeken – binnenkort beschikbaar. Hier kun je straks
              receptenboeken beheren om recepten te groeperen (bijv. per
              kookboek of bron).
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}
