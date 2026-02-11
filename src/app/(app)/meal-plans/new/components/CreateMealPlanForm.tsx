'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/catalyst/button';
import { Heading } from '@/components/catalyst/heading';
import { Input } from '@/components/catalyst/input';
import { Field, Label, Description } from '@/components/catalyst/fieldset';
import { Text } from '@/components/catalyst/text';
import { Select } from '@/components/catalyst/select';
import { SwitchField, Switch } from '@/components/catalyst/switch';
import { createMealPlanAction } from '../../actions/mealPlans.actions';
import { getLatestRunningRunAction } from '../../../runs/actions/runs.actions';
import { getCurrentDietIdAction } from '@/src/app/(app)/recipes/[recipeId]/actions/recipe-ai.persist.actions';
import { GuardrailsViolationEmptyState } from '../../[planId]/components/GuardrailsViolationEmptyState';
import { useToast } from '@/src/components/app/ToastContext';
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/16/solid';

/** Error payload from createMealPlanAction (NL message + hints + optional diagnostics). */
type CreatePlanErrorState = {
  message: string;
  userActionHints?: string[];
  diagnostics?: Record<string, unknown>;
};

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

type CreateMealPlanFormProps = {
  /** When true, show diagnostics block (admin only). */
  showDiagnostics?: boolean;
};

export function CreateMealPlanForm({
  showDiagnostics = false,
}: CreateMealPlanFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [createError, setCreateError] = useState<CreatePlanErrorState | null>(
    null,
  );
  const [guardrailsViolation, setGuardrailsViolation] =
    useState<GuardrailsViolationState | null>(null);
  const [dietTypeId, setDietTypeId] = useState<string | undefined>(undefined);
  const [isRetrying, setIsRetrying] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [days, setDays] = useState<string>('7');
  const [repeatWindowDays, setRepeatWindowDays] = useState<number>(7);
  const [aiFillMode, setAiFillMode] = useState<'strict' | 'normal'>('normal');

  // Clear stale sessionStorage on mount so returning to this page always allows generating again
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('meal-plan-submitting');
    }
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
          setProgress('Weekmenu genereren...');
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

    // Prevent double submission (button is also disabled when isPending)
    if (isPending) {
      return;
    }

    setCreateError(null);
    setGuardrailsViolation(null);

    const daysNum = parseInt(days, 10);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 30) {
      setCreateError({ message: 'Aantal dagen moet tussen 1 en 30 zijn' });
      return;
    }

    if (!dateFrom) {
      setCreateError({ message: 'Selecteer een startdatum' });
      return;
    }

    startTransition(async () => {
      try {
        const result = await createMealPlanAction({
          dateFrom,
          days: daysNum,
          dbFirstSettings: {
            repeatWindowDays,
            aiFillMode,
          },
        });

        if (result.ok) {
          if (result.data.dbCoverageBelowTarget) {
            showToast({
              type: 'success',
              title: 'Menu gegenereerd',
              description:
                'Er staan meer AI-maaltijden in dan de streefwaarde. Voeg meer recepten toe voor een evenwichtiger menu.',
            });
          }
          window.dispatchEvent(new CustomEvent('meal-plan-changed'));
          router.replace(`/meal-plans/${result.data.planId}`);
          return;
        }
        // Check for guardrails violation
        if (
          result.error.code === 'GUARDRAILS_VIOLATION' &&
          result.error.details &&
          'reasonCodes' in result.error.details
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
        } else {
          setCreateError({
            message: result.error.userMessageNl ?? result.error.message,
            userActionHints: result.error.userActionHints,
            diagnostics: result.error.diagnostics,
          });
        }
      } catch (err) {
        setCreateError({
          message:
            err instanceof Error ? err.message : 'Fout bij aanmaken weekmenu',
        });
      }
    });
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    setGuardrailsViolation(null);
    setCreateError(null);

    // Trigger form submission again
    const daysNum = parseInt(days, 10);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 30) {
      setCreateError({ message: 'Aantal dagen moet tussen 1 en 30 zijn' });
      setIsRetrying(false);
      return;
    }

    if (!dateFrom) {
      setCreateError({ message: 'Selecteer een startdatum' });
      setIsRetrying(false);
      return;
    }

    startTransition(async () => {
      try {
        const result = await createMealPlanAction({
          dateFrom,
          days: daysNum,
          dbFirstSettings: {
            repeatWindowDays,
            aiFillMode,
          },
        });

        if (result.ok) {
          if (result.data.dbCoverageBelowTarget) {
            showToast({
              type: 'success',
              title: 'Menu gegenereerd',
              description:
                'Er staan meer AI-maaltijden in dan de streefwaarde. Voeg meer recepten toe voor een evenwichtiger menu.',
            });
          }
          window.dispatchEvent(new CustomEvent('meal-plan-changed'));
          router.replace(`/meal-plans/${result.data.planId}`);
          return;
        }
        if (
          result.error.code === 'GUARDRAILS_VIOLATION' &&
          result.error.details &&
          'reasonCodes' in result.error.details
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
        } else {
          setCreateError({
            message: result.error.userMessageNl ?? result.error.message,
            userActionHints: result.error.userActionHints,
            diagnostics: result.error.diagnostics,
          });
        }
      } catch (err) {
        setCreateError({
          message:
            err instanceof Error ? err.message : 'Fout bij aanmaken weekmenu',
        });
      } finally {
        setIsRetrying(false);
      }
    });
  };

  // Show guardrails violation empty state instead of form
  if (guardrailsViolation) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Heading>Weekmenu-instellingen</Heading>
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
      <Heading>Weekmenu-instellingen</Heading>
      <div className="mt-4">
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isPending) {
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
            <Description>De eerste dag van je weekmenu</Description>
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
            <Description>Aantal dagen voor het weekmenu (1-30)</Description>
          </Field>

          <div className="space-y-4">
            <Text className="text-sm font-medium text-foreground">
              Weekmenu-instellingen
            </Text>
            <Field>
              <Label>Variatie-venster (dagen)</Label>
              <Select
                value={String(repeatWindowDays)}
                onChange={(e) => setRepeatWindowDays(Number(e.target.value))}
                disabled={isPending}
              >
                <option value={3}>3 dagen</option>
                <option value={5}>5 dagen</option>
                <option value={7}>7 dagen</option>
                <option value={10}>10 dagen</option>
                <option value={14}>14 dagen</option>
              </Select>
              <Description>
                Zelfde recept niet opnieuw binnen dit aantal dagen (zelfde
                maaltijdsoort)
              </Description>
            </Field>
            <SwitchField>
              <Label>AI alleen als nodig</Label>
              <Switch
                checked={aiFillMode === 'normal'}
                onChange={(checked) =>
                  setAiFillMode(checked ? 'normal' : 'strict')
                }
                disabled={isPending}
              />
              <Description>
                {aiFillMode === 'normal'
                  ? 'AI vult alleen gaten als er geen geschikt recept uit je database is.'
                  : 'Nooit AI aanvullen — alleen recepten uit je database (kan mislukken als te weinig recepten).'}
              </Description>
            </SwitchField>
            <Text className="text-sm text-muted-foreground">
              Database is leidend; AI vult alleen gaten (tenzij uitgeschakeld).
            </Text>
          </div>

          {createError && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                <div className="flex-1 space-y-3">
                  <div>
                    <Text className="font-semibold text-red-900 dark:text-red-100">
                      Menu genereren mislukt
                    </Text>
                    <Text className="mt-1 text-sm text-red-700 dark:text-red-300">
                      {createError.message}
                    </Text>
                  </div>
                  {createError.userActionHints &&
                    createError.userActionHints.length > 0 && (
                      <ul className="list-inside list-disc space-y-1 text-sm text-red-700 dark:text-red-300">
                        {createError.userActionHints.map((hint, i) => (
                          <li key={i}>{hint}</li>
                        ))}
                      </ul>
                    )}
                  {showDiagnostics &&
                    createError.diagnostics &&
                    Object.keys(createError.diagnostics).length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-red-800 dark:text-red-200">
                          Technische details
                        </summary>
                        <pre className="mt-2 max-h-48 overflow-auto rounded bg-red-100 p-3 font-mono text-xs text-red-900 dark:bg-red-950/80 dark:text-red-100">
                          {JSON.stringify(createError.diagnostics, null, 2)}
                        </pre>
                      </details>
                    )}
                </div>
              </div>
            </div>
          )}

          {isPending && (
            <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center">
              <ArrowPathIcon className="h-10 w-10 animate-spin text-primary-600 dark:text-primary-400" />
              <div className="space-y-1">
                <Text className="font-medium text-foreground">
                  {progress ?? 'Weekmenu genereren...'}
                </Text>
                {(elapsedTime > 0 || progress) && (
                  <Text className="text-sm text-muted-foreground">
                    {elapsedTime > 0 && `${Math.floor(elapsedTime / 1000)}s`}
                    {elapsedTime > 0 && progress && ' · '}
                    Dit kan 20–40 seconden duren. Blijf deze pagina open.
                  </Text>
                )}
              </div>
              <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(95, Math.max(5, (elapsedTime / 40000) * 100))}%`,
                  }}
                />
              </div>
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
                  <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                  Genereren...
                </>
              ) : (
                <>
                  <CalendarDaysIcon className="mr-2 h-4 w-4" />
                  Genereer weekmenu
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
