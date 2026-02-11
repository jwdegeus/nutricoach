'use client';

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import {
  rateMealAction,
  getMealRatingAction,
} from '@/src/app/(app)/meal-plans/actions/mealRating.actions';
type MealRatingProps = {
  mealId: string;
  className?: string;
};

export function MealRating({ mealId, className }: MealRatingProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current rating
  useEffect(() => {
    async function loadRating() {
      setIsLoading(true);
      try {
        const result = await getMealRatingAction(mealId);
        if (result.ok) {
          setRating(result.rating);
        }
      } catch (err) {
        console.error('Error loading rating:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadRating();
  }, [mealId]);

  const handleRatingClick = async (newRating: number) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await rateMealAction(mealId, newRating);
      if (result.ok) {
        setRating(newRating);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij opslaan');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-1 ${className || ''}`}>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className="h-4 w-4 text-zinc-300 dark:text-zinc-700"
              fill="currentColor"
            />
          ))}
        </div>
      </div>
    );
  }

  const displayRating = hoveredRating ?? rating ?? 0;

  return (
    <div className={`flex flex-col gap-1 ${className || ''}`}>
      <div className="flex items-center gap-1">
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => handleRatingClick(star)}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(null)}
              disabled={isSubmitting}
              className="rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
              aria-label={`Beoordeel met ${star} ${star === 1 ? 'ster' : 'sterren'}`}
            >
              <Star
                className={`h-4 w-4 transition-colors ${
                  star <= displayRating
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'fill-zinc-300 text-zinc-300 dark:fill-zinc-700 dark:text-zinc-700'
                } ${
                  isSubmitting
                    ? 'cursor-not-allowed opacity-50'
                    : 'cursor-pointer hover:fill-yellow-300 hover:text-yellow-300'
                }`}
              />
            </button>
          ))}
        </div>
        {rating !== null && (
          <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
            {rating}/5
          </span>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
