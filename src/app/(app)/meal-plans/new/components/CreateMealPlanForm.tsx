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
import {
  startMealPlanGenerationJobAction,
  runMealPlanJobNowAction,
} from '../../jobs/actions/mealPlanJobs.actions';
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
  const [progress, setProgress] = useState<string>('');
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
        setProgress('Job aanmaken…');
        const startResult = await startMealPlanGenerationJobAction({
          dateFrom,
          days: daysNum,
          dbFirstSettings: {
            repeatWindowDays,
            aiFillMode,
          },
        });

        if (!startResult.ok) {
          setCreateError({ message: startResult.error.message });
          return;
        }

        setProgress('Weekmenu genereren… (dit duurt 20–40 seconden)');
        const runResult = await runMealPlanJobNowAction({
          jobId: startResult.data.jobId,
        });

        if (runResult.ok && runResult.data?.mealPlanId) {
          showToast({
            type: 'success',
            title: 'Weekmenu klaar',
            description:
              'Je krijgt ook een bericht in je inbox met info over recepten uit je database.',
          });
          window.dispatchEvent(new CustomEvent('meal-plan-changed'));
          router.replace(`/meal-plans/${runResult.data.mealPlanId}`);
          return;
        }
        setCreateError({
          message:
            runResult.ok === false
              ? runResult.error.message
              : 'Generatie mislukt. Check je inbox voor details.',
        });
        setProgress('');
      } catch (err) {
        setCreateError({
          message:
            err instanceof Error ? err.message : 'Fout bij aanmaken weekmenu',
        });
        setProgress('');
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
        setProgress('Job aanmaken…');
        const startResult = await startMealPlanGenerationJobAction({
          dateFrom,
          days: daysNum,
          dbFirstSettings: {
            repeatWindowDays,
            aiFillMode,
          },
        });

        if (!startResult.ok) {
          setCreateError({ message: startResult.error.message });
          setIsRetrying(false);
          return;
        }

        setProgress('Weekmenu genereren… (dit duurt 20–40 seconden)');
        const runResult = await runMealPlanJobNowAction({
          jobId: startResult.data.jobId,
        });

        if (runResult.ok && runResult.data?.mealPlanId) {
          showToast({
            type: 'success',
            title: 'Weekmenu klaar',
            description:
              'Je krijgt ook een bericht in je inbox met info over recepten uit je database.',
          });
          window.dispatchEvent(new CustomEvent('meal-plan-changed'));
          router.replace(`/meal-plans/${runResult.data.mealPlanId}`);
          return;
        }
        setCreateError({
          message:
            runResult.ok === false
              ? runResult.error.message
              : 'Generatie mislukt. Check je inbox voor details.',
        });
        setProgress('');
      } catch (err) {
        setCreateError({
          message:
            err instanceof Error ? err.message : 'Fout bij aanmaken weekmenu',
        });
        setProgress('');
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
            <div className="rounded-lg bg-muted/30 p-4 shadow-sm">
              <p className="text-sm font-medium text-foreground">
                {progress || 'Weekmenu genereren…'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Blijf deze pagina open. Dit duurt 20–40 seconden.
              </p>
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
