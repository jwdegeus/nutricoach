'use client';

import { ClockIcon, UserGroupIcon } from '@heroicons/react/20/solid';

type RecipePrepTimeAndServingsEditorProps = {
  currentPrepTime: number | null | undefined;
  currentServings: number | null | undefined;
  mealId: string;
  source: 'custom' | 'gemini';
  onUpdated: () => void;
};

/**
 * Toont bereidingstijd en porties (alleen-lezen).
 * Portiegrootte wordt gewijzigd via Classificeren; die waarde wordt gebruikt voor alle berekeningen (ingrediënten, voeding per portie).
 */
export function RecipePrepTimeAndServingsEditor({
  currentPrepTime,
  currentServings,
}: RecipePrepTimeAndServingsEditorProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {currentPrepTime !== null && currentPrepTime !== undefined && (
        <div className="flex items-center gap-2">
          <ClockIcon className="h-4 w-4 text-zinc-500" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Bereidingstijd:{' '}
            <span className="font-medium">{currentPrepTime} minuten</span>
          </span>
        </div>
      )}
      {currentServings !== null && currentServings !== undefined && (
        <div className="flex items-center gap-2">
          <UserGroupIcon className="h-4 w-4 text-zinc-500" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Porties: <span className="font-medium">{currentServings}</span>
          </span>
        </div>
      )}
      {(currentPrepTime === null || currentPrepTime === undefined) &&
        (currentServings === null || currentServings === undefined) && (
          <span className="text-sm text-zinc-500 dark:text-zinc-500">
            Geen bereidingstijd of portiegrootte ingesteld. Stel in via
            Classificeren.
          </span>
        )}
    </div>
  );
}
