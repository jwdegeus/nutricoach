'use client';

import { useState } from 'react';
import { Input } from '@/components/catalyst/input';
import { Badge } from '@/components/catalyst/badge';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface Step2AllergiesDislikesProps {
  allergies: string[];
  dislikes: string[];
  onAllergiesChange: (allergies: string[]) => void;
  onDislikesChange: (dislikes: string[]) => void;
}

// Common suggestions
const COMMON_ALLERGIES = [
  'Gluten',
  'Lactose',
  'Noten',
  "Pinda's",
  'Eieren',
  'Vis',
  'Schaal- en schelpdieren',
  'Soja',
];

const COMMON_DISLIKES = [
  'Vis',
  'Noten',
  'Champignons',
  'Olijven',
  'Koriander',
  'Anijs',
  'Knoflook',
];

export function Step2AllergiesDislikes({
  allergies,
  dislikes,
  onAllergiesChange,
  onDislikesChange,
}: Step2AllergiesDislikesProps) {
  const [allergyInput, setAllergyInput] = useState('');
  const [dislikeInput, setDislikeInput] = useState('');

  const addTag = (
    value: string,
    current: string[],
    onChange: (tags: string[]) => void,
    maxItems: number = 50,
  ) => {
    const trimmed = value.trim();
    if (trimmed && !current.includes(trimmed) && current.length < maxItems) {
      onChange([...current, trimmed]);
    }
  };

  const removeTag = (
    tag: string,
    current: string[],
    onChange: (tags: string[]) => void,
  ) => {
    onChange(current.filter((t) => t !== tag));
  };

  const handleAllergyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(allergyInput, allergies, onAllergiesChange);
      setAllergyInput('');
    }
  };

  const handleDislikeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(dislikeInput, dislikes, onDislikesChange);
      setDislikeInput('');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
          {/* TODO: i18n key: onboarding.step2.title */}
          Allergieën en voorkeuren
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {/* TODO: i18n key: onboarding.step2.description */}
          Voeg allergieën en producten toe die je niet lekker vindt. Dit helpt
          ons om maaltijden voor je te plannen die je echt lekker vindt.
        </p>
      </div>

      {/* Allergies */}
      <div className="space-y-3">
        <label
          htmlFor="allergies"
          className="block text-sm font-medium text-zinc-900 dark:text-white"
        >
          {/* TODO: i18n key: onboarding.step2.allergiesLabel */}
          Allergieën
        </label>
        <Input
          id="allergies"
          type="text"
          value={allergyInput}
          onChange={(e) => setAllergyInput(e.target.value)}
          onKeyDown={handleAllergyKeyDown}
          placeholder="Typ en druk op Enter om toe te voegen"
        />
        {allergies.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allergies.map((allergy) => (
              <Badge
                key={allergy}
                color="red"
                className="group/item flex items-center gap-1.5"
              >
                <span>{allergy}</span>
                <button
                  type="button"
                  onClick={() =>
                    removeTag(allergy, allergies, onAllergiesChange)
                  }
                  className="rounded-full hover:bg-red-600/20 dark:hover:bg-red-500/20"
                  aria-label={`Verwijder ${allergy}`}
                >
                  <XMarkIcon className="size-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {COMMON_ALLERGIES.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Veelvoorkomend:
            </p>
            <div className="flex flex-wrap gap-2">
              {COMMON_ALLERGIES.filter((a) => !allergies.includes(a)).map(
                (allergy) => (
                  <button
                    key={allergy}
                    type="button"
                    onClick={() => {
                      addTag(allergy, allergies, onAllergiesChange);
                    }}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    + {allergy}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dislikes */}
      <div className="space-y-3">
        <label
          htmlFor="dislikes"
          className="block text-sm font-medium text-zinc-900 dark:text-white"
        >
          {/* TODO: i18n key: onboarding.step2.dislikesLabel */}
          Producten die je niet lekker vindt
        </label>
        <Input
          id="dislikes"
          type="text"
          value={dislikeInput}
          onChange={(e) => setDislikeInput(e.target.value)}
          onKeyDown={handleDislikeKeyDown}
          placeholder="Typ en druk op Enter om toe te voegen"
        />
        {dislikes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {dislikes.map((dislike) => (
              <Badge
                key={dislike}
                color="orange"
                className="group/item flex items-center gap-1.5"
              >
                <span>{dislike}</span>
                <button
                  type="button"
                  onClick={() => removeTag(dislike, dislikes, onDislikesChange)}
                  className="rounded-full hover:bg-orange-600/20 dark:hover:bg-orange-500/20"
                  aria-label={`Verwijder ${dislike}`}
                >
                  <XMarkIcon className="size-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {COMMON_DISLIKES.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Veelvoorkomend:
            </p>
            <div className="flex flex-wrap gap-2">
              {COMMON_DISLIKES.filter((d) => !dislikes.includes(d)).map(
                (dislike) => (
                  <button
                    key={dislike}
                    type="button"
                    onClick={() => {
                      addTag(dislike, dislikes, onDislikesChange);
                    }}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    + {dislike}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
