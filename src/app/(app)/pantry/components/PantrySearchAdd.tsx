'use client';

import { useState, useCallback, useEffect } from 'react';
import { Input } from '@/components/catalyst/input';
import { Button } from '@/components/catalyst/button';
import { searchNevoFoodsAction } from '../actions/pantry-ui.actions';
import { upsertUserPantryItemAction } from '../actions/pantry-ui.actions';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';

type NevoFoodResult = {
  nevoCode: string;
  name: string;
};

export function PantrySearchAdd() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NevoFoodResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const router = useRouter();

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchNevoFoodsAction(query);
      setIsSearching(false);

      if (result.ok) {
        setResults(result.data);
      } else {
        setResults([]);
        console.error('Search error:', result.error);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleAdd = useCallback(
    async (food: NevoFoodResult) => {
      setIsAdding(food.nevoCode);
      try {
        const result = await upsertUserPantryItemAction({
          nevoCode: food.nevoCode,
          isAvailable: true,
          availableG: null, // Binary available
        });

        if (result.ok) {
          // Refresh page to show new item
          router.refresh();
          // Clear search
          setQuery('');
          setResults([]);
        } else {
          console.error('Error adding item:', result.error);
          alert(`Fout bij toevoegen: ${result.error.message}`);
        }
      } finally {
        setIsAdding(null);
      }
    },
    [router],
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Voeg ingrediënt toe</h2>
      </div>
      <div className="relative">
        <Input
          type="text"
          placeholder="Zoek ingrediënt (bijv. kip, appel, rijst)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border-0 bg-zinc-100 dark:bg-zinc-800 focus-visible:ring-0"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {results.map((food) => (
            <div
              key={food.nevoCode}
              className="flex items-center justify-between p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <span className="text-sm">{food.name}</span>
              <Button
                plain
                onClick={() => handleAdd(food)}
                disabled={isAdding === food.nevoCode}
              >
                {isAdding === food.nevoCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    Toevoegen
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {query && !isSearching && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Geen resultaten gevonden
        </p>
      )}
    </div>
  );
}
