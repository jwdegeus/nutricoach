'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/catalyst/button';
import { Heading } from '@/components/catalyst/heading';
import { Description } from '@/components/catalyst/fieldset';
import { Input } from '@/components/catalyst/input';
import { Field, Label } from '@/components/catalyst/fieldset';
import { Text } from '@/components/catalyst/text';
import { createMealPlanAction } from '../../actions/mealPlans.actions';
import { getLatestRunningRunAction } from '../../../runs/actions/runs.actions';
import { getCurrentDietIdAction } from '@/src/app/(app)/recipes/[recipeId]/actions/recipe-ai.persist.actions';
import { GuardrailsViolationEmptyState } from '../../[planId]/components/GuardrailsViolationEmptyState';
import { Loader2, Calendar } from 'lucide-react';

type GuardrailsViolationState = {
  reasonCodes: string[];
  contentHash: string;
  rulesetVersion?: number;
  forceDeficits?: Array<{
    categoryCode: string;
    categoryNameNl: string;
    minPerDay?: number;
    minPerWeek?: number;
  }>;
};

export function CreateMealPlanForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardrailsViolation, setGuardrailsViolation] =
    useState<GuardrailsViolationState | null>(null);
  const [dietTypeId, setDietTypeId] = useState<string | undefined>(undefined);
  const [isRetrying, setIsRetrying] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [hasSubmitted, setHasSubmitted] = useState(() => {
    // Check if we just submitted (prevent double submission on remount)
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('meal-plan-submitting') === 'true';
    }
    return false;
  });
  const [dateFrom, setDateFrom] = useState<string>(() => {
    // Default to today
    return new Date().toISOString().split('T')[0];
  });
  const [days, setDays] = useState<string>('7');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear submitting flag when component unmounts
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('meal-plan-submitting');
      }
    };
  }, []);

  // Fetch dietTypeId when violation occurs
  useEffect(() => {
    if (guardrailsViolation && !dietTypeId) {
      getCurrentDietIdAction().then((result) => {
        if (result.ok && result.data) {
          setDietTypeId(result.data.dietId);
        }
      });
    }
  }, [guardrailsViolation, dietTypeId]);

  // Poll for progress when generating
  useEffect(() => {
    if (!isPending) {
      setProgress(null);
      setElapsedTime(0);
      return;
    }

    const startTime = Date.now();

    const checkProgress = async () => {
      const result = await getLatestRunningRunAction();
      if (result.ok && result.data) {
        const elapsed = Date.now() - startTime;
        setElapsedTime(elapsed);

        // Estimate progress based on elapsed time
        // Typical generation takes 10-30 seconds
        if (elapsed < 5000) {
          setProgress('Profiel laden...');
        } else if (elapsed < 15000) {
          setProgress('Meal plan genereren...');
        } else if (elapsed < 25000) {
          setProgress('Plan valideren...');
        } else if (elapsed < 35000) {
          setProgress('Enrichment toevoegen...');
        } else {
          setProgress('Bijna klaar...');
        }
      } else {
        // No running run found, might be done or error
        setProgress(null);
      }
    };

    // Check immediately, then every 2 seconds
    checkProgress();
    const intervalId = setInterval(checkProgress, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isPending]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double submission
    if (isPending || hasSubmitted) {
      return;
    }

    setError(null);
    setGuardrailsViolation(null);
    setHasSubmitted(true);

    // Mark as submitting in sessionStorage to prevent double submission
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('meal-plan-submitting', 'true');
    }

    const daysNum = parseInt(days, 10);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 30) {
      setError('Aantal dagen moet tussen 1 en 30 zijn');
      setHasSubmitted(false);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('meal-plan-submitting');
      }
      return;
    }

    if (!dateFrom) {
      setError('Selecteer een startdatum');
      setHasSubmitted(false);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('meal-plan-submitting');
      }
      return;
    }

    startTransition(async () => {
      try {
        const result = await createMealPlanAction({
          dateFrom,
          days: daysNum,
        });

        if (result.ok) {
          // Clear submitting flag immediately
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('meal-plan-submitting');
          }

          // Dispatch custom event to notify shopping cart (but don't wait)
          window.dispatchEvent(new CustomEvent('meal-plan-changed'));

          // Use replace instead of push to prevent back button issues
          // and immediately navigate away to prevent any re-submission
          router.replace(`/meal-plans/${result.data.planId}`);

          // Don't reset hasSubmitted - we're redirecting anyway
          return; // Early return to prevent any further execution
        } else {
          setHasSubmitted(false);
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('meal-plan-submitting');
          }
          // Check for guardrails violation
          if (
            result.error.code === 'GUARDRAILS_VIOLATION' &&
            result.error.details
          ) {
            const d = result.error.details;
            setGuardrailsViolation({
              reasonCodes: d.reasonCodes,
              contentHash: d.contentHash,
              rulesetVersion: d.rulesetVersion,
              ...('forceDeficits' in d &&
                Array.isArray(d.forceDeficits) && {
                  forceDeficits: d.forceDeficits,
                }),
            });
          } else if (result.error.code === 'CONFLICT') {
            setError(
              'Er is al een generatie bezig. Wacht even en probeer het opnieuw. Als dit probleem aanhoudt, wacht 10 minuten en probeer het dan opnieuw.',
            );
          } else {
            setError(result.error.message);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Fout bij aanmaken meal plan',
        );
        setHasSubmitted(false);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('meal-plan-submitting');
        }
      }
    });
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    setGuardrailsViolation(null);
    setError(null);

    // Trigger form submission again
    const daysNum = parseInt(days, 10);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 30) {
      setError('Aantal dagen moet tussen 1 en 30 zijn');
      setIsRetrying(false);
      return;
    }

    if (!dateFrom) {
      setError('Selecteer een startdatum');
      setIsRetrying(false);
      return;
    }

    setHasSubmitted(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('meal-plan-submitting', 'true');
    }

    startTransition(async () => {
      try {
        const result = await createMealPlanAction({
          dateFrom,
          days: daysNum,
        });

        if (result.ok) {
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('meal-plan-submitting');
          }
          window.dispatchEvent(new CustomEvent('meal-plan-changed'));
          router.replace(`/meal-plans/${result.data.planId}`);
          return;
        } else {
          setHasSubmitted(false);
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('meal-plan-submitting');
          }
          if (
            result.error.code === 'GUARDRAILS_VIOLATION' &&
            result.error.details
          ) {
            const d = result.error.details;
            setGuardrailsViolation({
              reasonCodes: d.reasonCodes,
              contentHash: d.contentHash,
              rulesetVersion: d.rulesetVersion,
              ...('forceDeficits' in d &&
                Array.isArray(d.forceDeficits) && {
                  forceDeficits: d.forceDeficits,
                }),
            });
          } else if (result.error.code === 'CONFLICT') {
            setError(
              'Er is al een generatie bezig. Wacht even en probeer het opnieuw. Als dit probleem aanhoudt, wacht 10 minuten en probeer het dan opnieuw.',
            );
          } else {
            setError(result.error.message);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Fout bij aanmaken meal plan',
        );
        setHasSubmitted(false);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('meal-plan-submitting');
        }
      } finally {
        setIsRetrying(false);
      }
    });
  };

  // Show guardrails violation empty state instead of form
  if (guardrailsViolation) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Heading>Plan Instellingen</Heading>
        <div className="mt-4">
          <GuardrailsViolationEmptyState
            reasonCodes={guardrailsViolation.reasonCodes}
            contentHash={guardrailsViolation.contentHash}
            rulesetVersion={guardrailsViolation.rulesetVersion}
            forceDeficits={guardrailsViolation.forceDeficits}
            dietTypeId={dietTypeId}
            onRetry={handleRetry}
            isRetrying={isRetrying}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <Heading>Plan Instellingen</Heading>
      <div className="mt-4">
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
          onKeyDown={(e) => {
            // Prevent form submission on Enter key if already submitting
            if (e.key === 'Enter' && (isPending || hasSubmitted)) {
              e.preventDefault();
            }
          }}
        >
          <Field>
            <Label>Start Datum</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              disabled={isPending}
              required
            />
            <Description>De eerste dag van je meal plan</Description>
          </Field>

          <Field>
            <Label>Aantal Dagen</Label>
            <Input
              type="number"
              min="1"
              max="30"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={isPending}
              required
            />
            <Description>Aantal dagen voor het meal plan (1-30)</Description>
          </Field>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 p-3 text-sm text-red-600 dark:text-red-400">
              <strong>Fout:</strong> {error}
            </div>
          )}

          {isPending && progress && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/50 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
                <div className="flex-1">
                  <Text className="font-medium text-blue-900 dark:text-blue-100">
                    {progress}
                  </Text>
                  <Text className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    {elapsedTime > 0 && `(${Math.floor(elapsedTime / 1000)}s)`}
                  </Text>
                </div>
              </div>
              <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(90, Math.max(10, (elapsedTime / 40000) * 100))}%`,
                  }}
                />
              </div>
              <Text className="text-xs text-blue-600 dark:text-blue-400">
                Dit kan 20-40 seconden duren. Blijf deze pagina open.
              </Text>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              outline
              onClick={() => router.back()}
              disabled={isPending}
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Genereren...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  Genereer Meal Plan
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
