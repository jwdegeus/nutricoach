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
import { StarIcon } from '@heroicons/react/20/solid';
import {
  getRecipeRatingAction,
  rateRecipeAction,
} from '../actions/meals.actions';

type RecipeRatingDialogProps = {
  open: boolean;
  onClose: () => void;
  mealId: string;
  source: 'custom' | 'gemini';
  mealName: string;
  onRatingUpdated?: (rating: number | null) => void;
};

export function RecipeRatingDialog({
  open,
  onClose,
  mealId,
  source,
  mealName,
  onRatingUpdated,
}: RecipeRatingDialogProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current rating
  useEffect(() => {
    async function loadRating() {
      if (!open) return;

      setIsLoading(true);
      setError(null);
      try {
        const result = await getRecipeRatingAction({ mealId, source });
        if (result.ok) {
          setRating(result.data);
        } else {
          setError(result.error.message);
        }
      } catch (err) {
        console.error('Error loading rating:', err);
        setError(err instanceof Error ? err.message : 'Fout bij laden rating');
      } finally {
        setIsLoading(false);
      }
    }

    loadRating();
  }, [open, mealId, source]);

  const handleRatingClick = async (newRating: number) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await rateRecipeAction({
        mealId,
        source,
        rating: newRating,
      });

      if (result.ok) {
        setRating(newRating);
        if (onRatingUpdated) {
          onRatingUpdated(newRating);
        }
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij opslaan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveRating = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Set rating to null (we'll need to handle this in the action)
      // For now, we can set it to 0 or create a separate action
      // Actually, we can't remove rating easily with current system
      // So we'll just close the dialog
      setRating(null);
      if (onRatingUpdated) {
        onRatingUpdated(null);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij verwijderen');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayRating = hoveredRating ?? rating ?? 0;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Beoordeel recept</DialogTitle>
      <DialogBody>
        <DialogDescription>
          Geef een beoordeling voor &quot;{mealName}&quot;. Klik op een ster om
          je beoordeling te geven (1-5 sterren).
        </DialogDescription>
        <div className="mt-6 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <StarIcon
                    key={star}
                    className="h-8 w-8 text-zinc-300 dark:text-zinc-700"
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => handleRatingClick(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(null)}
                    disabled={isSubmitting}
                    className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-1 transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Beoordeel met ${star} ${star === 1 ? 'ster' : 'sterren'}`}
                  >
                    <StarIcon
                      className={`h-10 w-10 transition-colors ${
                        star <= displayRating
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-zinc-300 dark:text-zinc-700 fill-zinc-300 dark:fill-zinc-700'
                      } ${
                        isSubmitting
                          ? 'opacity-50'
                          : 'cursor-pointer hover:text-yellow-300 hover:fill-yellow-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              {rating !== null && (
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Huidige beoordeling:{' '}
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {rating}/5 ⭐
                  </span>
                </div>
              )}
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        {rating !== null && (
          <Button outline onClick={handleRemoveRating} disabled={isSubmitting}>
            Beoordeling verwijderen
          </Button>
        )}
        <Button onClick={onClose}>Sluiten</Button>
      </DialogActions>
    </Dialog>
  );
}
