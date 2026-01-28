'use client';

import { useState } from 'react';
import { PantryItemRow } from './PantryItemRow';
import { Button } from '@/components/catalyst/button';
import { deleteAllPantryItemsAction } from '../actions/pantry-ui.actions';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import { Trash2, Loader2 } from 'lucide-react';

type PantryItemWithName = {
  id: string;
  nevoCode: string;
  name: string;
  availableG: number | null;
  isAvailable: boolean;
  nutriscore: 'A' | 'B' | 'C' | 'D' | 'E' | null;
};

type PantryListProps = {
  items: PantryItemWithName[];
  onUpdate: () => void;
};

export function PantryList({ items, onUpdate }: PantryListProps) {
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClearAll = async () => {
    setIsClearing(true);
    setError(null);

    try {
      const result = await deleteAllPantryItemsAction();

      if (result.ok) {
        setShowClearDialog(false);
        onUpdate();
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Fout bij leegmaken pantry',
      );
    } finally {
      setIsClearing(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Mijn Pantry</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Je pantry is nog leeg. Zoek en voeg ingrediënten toe hierboven.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Mijn Pantry ({items.length} items)
        </h2>
        <Button
          plain
          onClick={() => setShowClearDialog(true)}
          disabled={isClearing}
          className="text-destructive hover:text-destructive"
        >
          {isClearing ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Bezig...
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4 mr-1" />
              Pantry leegmaken
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="text-sm text-destructive p-3 rounded-lg bg-destructive/10">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <PantryItemRow key={item.id} item={item} onUpdate={onUpdate} />
        ))}
      </div>

      <ConfirmDialog
        open={showClearDialog}
        onClose={() => {
          setShowClearDialog(false);
          setError(null);
        }}
        onConfirm={handleClearAll}
        title="Pantry leegmaken"
        description={`Weet je zeker dat je alle ${items.length} items uit je pantry wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`}
        confirmLabel="Alles verwijderen"
        cancelLabel="Annuleren"
        confirmColor="red"
        isLoading={isClearing}
      />
    </div>
  );
}
