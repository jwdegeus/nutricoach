'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { getDietTypes } from '@/src/app/(app)/onboarding/queries/diet-types.queries';
import type { DietType } from '@/src/app/(app)/onboarding/queries/diet-types.queries';

type SelectDietTypeDialogProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (dietTypeName: string | null) => void;
  currentDietTypeName: string | null;
  mealName: string;
};

export function SelectDietTypeDialog({
  open,
  onClose,
  onSelect,
  currentDietTypeName,
  mealName,
}: SelectDietTypeDialogProps) {
  const [dietTypes, setDietTypes] = useState<DietType[]>([]);
  const [selectedDietTypeId, setSelectedDietTypeId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDietTypes() {
      setIsLoading(true);
      try {
        const types = await getDietTypes();
        setDietTypes(types);
        // Find current diet type by name
        if (currentDietTypeName) {
          const currentType = types.find(
            (dt) => dt.name === currentDietTypeName,
          );
          if (currentType) {
            setSelectedDietTypeId(currentType.id);
          }
        } else {
          setSelectedDietTypeId('');
        }
      } catch (error) {
        console.error('Failed to load diet types:', error);
        setDietTypes([]);
      } finally {
        setIsLoading(false);
      }
    }

    if (open) {
      loadDietTypes();
    }
  }, [open, currentDietTypeName]);

  const handleSave = () => {
    if (selectedDietTypeId === '') {
      onSelect(null);
    } else {
      const selectedType = dietTypes.find((dt) => dt.id === selectedDietTypeId);
      if (selectedType) {
        onSelect(selectedType.name);
      }
    }
    onClose();
  };

  const handleRemove = () => {
    onSelect(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Label met dieettype</DialogTitle>
      <DialogBody>
        <DialogDescription>
          Selecteer het primaire dieettype voor &quot;{mealName}&quot;. Dit
          helpt bij het filteren en organiseren van je recepten.
        </DialogDescription>
        <div className="mt-4 space-y-2">
          <label
            htmlFor="diet-type-select"
            className="block text-sm font-medium text-zinc-900 dark:text-white"
          >
            Dieettype
          </label>
          <Listbox
            value={selectedDietTypeId}
            onChange={(val) => setSelectedDietTypeId(val)}
            disabled={isLoading}
            aria-label="Dieettype"
          >
            <ListboxOption value="">
              {isLoading ? 'Laden...' : '-- Geen dieettype --'}
            </ListboxOption>
            {dietTypes.map((diet) => (
              <ListboxOption key={diet.id} value={diet.id}>
                {diet.name}
              </ListboxOption>
            ))}
          </Listbox>
          {selectedDietTypeId && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {dietTypes.find((d) => d.id === selectedDietTypeId)?.description}
            </p>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        {currentDietTypeName && (
          <Button outline onClick={handleRemove}>
            Label verwijderen
          </Button>
        )}
        <Button onClick={handleSave}>Opslaan</Button>
      </DialogActions>
    </Dialog>
  );
}
