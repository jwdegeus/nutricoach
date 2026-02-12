'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/catalyst/button';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { Field, Label } from '@/components/catalyst/fieldset';
import { PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/20/solid';

type RecipeSourceEditorProps = {
  currentSource: string | null;
  mealId: string;
  source: 'custom' | 'gemini';
  onSourceUpdated: (newSource: string | null) => void;
};

type RecipeSource = {
  id: string;
  name: string;
  is_system: boolean;
  usage_count: number;
};

export function RecipeSourceEditor({
  currentSource,
  mealId,
  source: mealSource,
  onSourceUpdated,
}: RecipeSourceEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>(
    currentSource || '',
  );
  const [customSource, setCustomSource] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<RecipeSource[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(true);

  // Load sources from database
  useEffect(() => {
    async function loadSources() {
      try {
        const response = await fetch('/api/recipes/sources');
        const result = await response.json();

        if (result.ok) {
          setSources(result.data || []);
        }
      } catch (err) {
        console.error('Error loading sources:', err);
      } finally {
        setIsLoadingSources(false);
      }
    }

    if (isEditing) {
      loadSources();
    }
  }, [isEditing]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      let finalSource: string | null = null;

      if (selectedSource === 'custom') {
        // Custom source entered by user
        const trimmedCustom = customSource.trim();
        if (!trimmedCustom) {
          setError('Voer een bron naam in');
          setIsSaving(false);
          return;
        }

        // First, ensure the custom source exists in the database
        const createResponse = await fetch('/api/recipes/sources', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: trimmedCustom,
          }),
        });

        const createResult = await createResponse.json();
        if (!createResult.ok) {
          throw new Error(
            createResult.error?.message || 'Fout bij aanmaken bron',
          );
        }

        finalSource = trimmedCustom;
      } else if (selectedSource) {
        // Selected from dropdown
        finalSource = selectedSource;
      }

      // Update the meal with the source
      const response = await fetch('/api/recipes/update-source', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mealId,
          source: mealSource,
          recipeSource: finalSource,
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error?.message || 'Bijwerken mislukt');
      }

      onSourceUpdated(finalSource);
      setIsEditing(false);
      setCustomSource('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bijwerken mislukt');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setSelectedSource(currentSource || '');
    setCustomSource('');
    setError(null);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        {currentSource ? (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Bron: <span className="font-medium">{currentSource}</span>
          </span>
        ) : (
          <span className="text-sm text-zinc-500 dark:text-zinc-500">
            Geen bron ingesteld
          </span>
        )}
        <Button plain onClick={() => setIsEditing(true)} className="text-sm">
          <PencilIcon className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (isLoadingSources) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500 dark:text-zinc-500">
          Bronnen laden...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Field>
        <Label>Bron</Label>
        <Listbox
          value={selectedSource}
          onChange={(val) => setSelectedSource(val)}
          disabled={isSaving}
          aria-label="Bron"
        >
          <ListboxOption value="">Geen bron</ListboxOption>
          {sources.map((source) => (
            <ListboxOption key={source.id} value={source.name}>
              {source.name}
            </ListboxOption>
          ))}
          <ListboxOption value="custom">Anders (aangepast)...</ListboxOption>
        </Listbox>
      </Field>

      {selectedSource === 'custom' && (
        <Field>
          <Label>Aangepaste bron</Label>
          <input
            type="text"
            value={customSource}
            onChange={(e) => setCustomSource(e.target.value)}
            placeholder="Bijv. 'Mijn oma's recept' of 'Restaurant X'"
            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500"
            disabled={isSaving}
          />
        </Field>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={handleSave}
          disabled={
            isSaving || (selectedSource === 'custom' && !customSource.trim())
          }
          color="primary"
          className="text-sm"
        >
          <CheckIcon className="mr-1 h-4 w-4" />
          {isSaving ? 'Opslaan...' : 'Opslaan'}
        </Button>
        <Button
          plain
          onClick={handleCancel}
          disabled={isSaving}
          className="text-sm"
        >
          <XMarkIcon className="mr-1 h-4 w-4" />
          Annuleren
        </Button>
      </div>
    </div>
  );
}
