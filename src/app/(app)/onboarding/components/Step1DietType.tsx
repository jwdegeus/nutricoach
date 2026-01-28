'use client';

import { useEffect, useState } from 'react';
import { Select } from '@/components/catalyst/select';
import { getDietTypes } from '../queries/diet-types.queries';
import type { DietType } from '../queries/diet-types.queries';

interface Step1DietTypeProps {
  value: string;
  onChange: (dietTypeId: string) => void;
}

export function Step1DietType({ value, onChange }: Step1DietTypeProps) {
  const [dietTypes, setDietTypes] = useState<DietType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDietTypes() {
      setIsLoading(true);
      try {
        const types = await getDietTypes();
        setDietTypes(types);
      } catch (error) {
        console.error('Failed to load diet types:', error);
        // Fallback to empty array
        setDietTypes([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadDietTypes();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
          {/* TODO: i18n key: onboarding.step1.title */}
          Kies je dieettype
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {/* TODO: i18n key: onboarding.step1.description */}
          Selecteer het dieettype dat het beste bij je past.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="diet-type"
          className="block text-sm font-medium text-zinc-900 dark:text-white"
        >
          {/* TODO: i18n key: onboarding.step1.dietTypeLabel */}
          Dieettype
        </label>
        <Select
          id="diet-type"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          disabled={isLoading}
        >
          <option value="">
            {/* TODO: i18n key: onboarding.step1.selectPlaceholder */}
            {isLoading ? 'Laden...' : '-- Selecteer een dieettype --'}
          </option>
          {dietTypes.map((diet) => (
            <option key={diet.id} value={diet.id}>
              {diet.name}
            </option>
          ))}
        </Select>
        {dietTypes.length > 0 && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {dietTypes.find((d) => d.id === value)?.description}
          </p>
        )}
      </div>
    </div>
  );
}
