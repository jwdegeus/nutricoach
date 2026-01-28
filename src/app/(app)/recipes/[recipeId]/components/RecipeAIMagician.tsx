'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';
import { Text } from '@/components/catalyst/text';
import { Badge } from '@/components/catalyst/badge';
import { Checkbox } from '@/components/catalyst/checkbox';
import {
  SparklesIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/20/solid';
import { ArrowPathIcon } from '@heroicons/react/16/solid';
import {
  requestRecipeAdaptationAction,
  getRecipeAnalysisAction,
} from '../actions/recipe-ai.actions';
import {
  persistRecipeAdaptationDraftAction,
  applyRecipeAdaptationAction,
  getCurrentDietIdAction,
} from '../actions/recipe-ai.persist.actions';
import type {
  RecipeAIState,
  RecipeAIData,
  RecipeAdaptationDraft,
  ViolationDetail,
} from '../recipe-ai.types';
import { GuardrailsViolationCallout } from './GuardrailsViolationCallout';
import { SoftWarningsCallout } from '@/src/app/(app)/components/SoftWarningsCallout';

type RecipeAIMagicianProps = {
  open: boolean;
  onClose: () => void;
  recipeId: string;
  recipeName?: string;
  /** Wordt aangeroepen nadat de aangepaste versie succesvol is toegepast, zodat de pagina kan verversen */
  onApplied?: () => void;
};

/** Severity voor weergave: verboden / beter van niet / niet gewenst */
type ViolationSeverity = 'verboden' | 'niet_gewenst' | 'beter_van_niet';

function getViolationSeverity(v: {
  ruleCode?: string;
  ruleLabel?: string;
  rule?: string;
}): { level: ViolationSeverity; label: string } {
  const code = v.ruleCode ?? '';
  const label = (v.ruleLabel ?? v.rule ?? '').toLowerCase();
  if (
    /HARD|FORBIDDEN_HARD|strikt verboden/i.test(code) ||
    label.includes('strikt verboden')
  ) {
    return { level: 'verboden', label: 'Verboden' };
  }
  if (label.includes('beter') || label.includes('liever niet')) {
    return { level: 'beter_van_niet', label: 'Beter van niet' };
  }
  return { level: 'niet_gewenst', label: 'Niet gewenst' };
}

/**
 * Convert RecipeAdaptationDraft to RecipeAIData format for UI compatibility
 */
function draftToAIData(draft: RecipeAdaptationDraft): RecipeAIData {
  return {
    analysis: {
      violations: draft.analysis.violations.map((v) => ({
        ingredientName: v.ingredientName,
        rule: v.ruleLabel,
        suggestion: v.suggestion,
      })),
      hasDiet: true,
    },
    rewrite: {
      ingredients: draft.rewrite.ingredients,
      steps: draft.rewrite.steps,
    },
  };
}

export function RecipeAIMagician({
  open,
  onClose,
  recipeId,
  recipeName = 'Recept',
  onApplied,
}: RecipeAIMagicianProps) {
  const [state, setState] = useState<RecipeAIState>({ type: 'idle' });
  const [activeTab, setActiveTab] = useState<'analyse' | 'rewrite'>('analyse');
  const [adaptationId, setAdaptationId] = useState<string | null>(null);
  const [isApplied, setIsApplied] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [dietId, setDietId] = useState<string | null>(null);
  const [guardrailsViolation, setGuardrailsViolation] = useState<{
    reasonCodes: string[];
    contentHash: string;
    rulesetVersion?: number;
  } | null>(null);
  const [currentDraft, setCurrentDraft] =
    useState<RecipeAdaptationDraft | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  /** Per index: false = niet laten vervangen. Ongespecificeerd = wel vervangen. */
  const [replaceViolationByIndex, setReplaceViolationByIndex] = useState<
    Record<number, boolean>
  >({});

  // Load diet ID when dialog opens
  useEffect(() => {
    if (open && !dietId) {
      getCurrentDietIdAction().then((result) => {
        if (result.ok && result.data) {
          setDietId(result.data.dietId);
        }
      });
    }
  }, [open, dietId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setState({ type: 'idle' });
      setActiveTab('analyse');
      setAdaptationId(null);
      setIsApplied(false);
      setIsPersisting(false);
      setIsApplying(false);
      setPersistError(null);
      setApplyError(null);
      setGuardrailsViolation(null);
      setCurrentDraft(null);
      setRewriteError(null);
      setReplaceViolationByIndex({});
    }
  }, [open]);

  // Handle recipeId validation
  useEffect(() => {
    if (open && (!recipeId || recipeId === 'undefined')) {
      setState({
        type: 'error',
        message: 'Recept ID ontbreekt. Probeer de pagina te vernieuwen.',
      });
    }
  }, [open, recipeId]);

  const handleStartAnalysis = async () => {
    if (!recipeId || recipeId === 'undefined') {
      setState({ type: 'error', message: 'Recept ID ontbreekt.' });
      return;
    }

    let currentDietId = dietId;
    if (!currentDietId) {
      const dietResult = await getCurrentDietIdAction();
      if (!dietResult.ok) {
        setState({ type: 'error', message: dietResult.error.message });
        return;
      }
      if (!dietResult.data?.dietId) {
        setState({
          type: 'empty',
          reason: 'Selecteer eerst een dieettype in je instellingen.',
        });
        return;
      }
      currentDietId = dietResult.data.dietId;
      setDietId(currentDietId);
    }

    setState({ type: 'loading' });
    setPersistError(null);
    setApplyError(null);

    const ANALYSIS_TIMEOUT_MS = 45_000;
    let timeoutId: ReturnType<typeof setTimeout>;
    try {
      const result = await Promise.race([
        getRecipeAnalysisAction({ recipeId, dietId: currentDietId! }).finally(
          () => clearTimeout(timeoutId),
        ),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () =>
              reject(
                new Error(
                  'Analyse duurde te lang. Controleer je internetverbinding en probeer het opnieuw.',
                ),
              ),
            ANALYSIS_TIMEOUT_MS,
          );
        }),
      ]);
      if (result.ok) {
        setState({
          type: 'analysis_only',
          data: result.data,
        });
      } else {
        if (
          result.error.code === 'NO_DIET_SELECTED' ||
          result.error.message.includes('dieet')
        ) {
          setState({
            type: 'empty',
            reason: result.error.message,
          });
        } else {
          setState({ type: 'error', message: result.error.message });
        }
      }
    } catch (error) {
      setState({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Er is een fout opgetreden bij de analyse.',
      });
    }
  };

  const handleGenerateRewrite = async () => {
    if (
      !recipeId ||
      recipeId === 'undefined' ||
      !dietId ||
      (state.type !== 'analysis_only' && state.type !== 'loading_rewrite')
    ) {
      return;
    }
    const analysisData =
      state.type === 'analysis_only'
        ? state.data
        : (
            state as {
              data: {
                violations: ViolationDetail[];
                summary: string;
                recipeName: string;
              };
            }
          ).data;
    const violationsToReplace = analysisData.violations.filter(
      (_, i) => replaceViolationByIndex[i] !== false,
    );
    setRewriteError(null);
    setPersistError(null);
    setApplyError(null);
    setState({
      type: 'loading_rewrite',
      data: analysisData,
    });

    try {
      const result = await requestRecipeAdaptationAction({
        recipeId,
        dietId,
        existingAnalysis: {
          violations: violationsToReplace,
          recipeName: analysisData.recipeName,
        },
      });

      if (result.outcome === 'success') {
        const data = draftToAIData(result.adaptation);
        setState({ type: 'success', data });
        setCurrentDraft(result.adaptation);
        setIsPersisting(true);
        try {
          const persistResult = await persistRecipeAdaptationDraftAction({
            recipeId,
            dietId,
            draft: result.adaptation,
            meta: result.meta,
          });
          if (persistResult.ok) {
            setAdaptationId(persistResult.data.adaptationId);
          } else {
            setPersistError(persistResult.error.message);
          }
        } catch (error) {
          setPersistError(
            error instanceof Error ? error.message : 'Fout bij opslaan',
          );
        } finally {
          setIsPersisting(false);
        }
      } else if (result.outcome === 'empty') {
        setState({
          type: 'empty',
          reason: result.reason ?? 'Geen dieet geselecteerd',
        });
      } else {
        setState({ type: 'analysis_only', data: analysisData });
        setRewriteError(result.message);
      }
    } catch (error) {
      setState({ type: 'analysis_only', data: analysisData });
      setRewriteError(
        error instanceof Error
          ? error.message
          : 'Fout bij genereren aangepaste versie',
      );
    }
  };

  const handleRetry = () => {
    setState({ type: 'idle' });
    setPersistError(null);
    setApplyError(null);
    setGuardrailsViolation(null);
  };

  const handleApply = async () => {
    if (!adaptationId) {
      return;
    }

    setIsApplying(true);
    setApplyError(null);
    setGuardrailsViolation(null);

    try {
      const result = await applyRecipeAdaptationAction({
        adaptationId,
      });

      if (result.ok) {
        setIsApplied(true);
        onApplied?.();
      } else {
        // Check for GUARDRAILS_VIOLATION
        if (
          result.error.code === 'GUARDRAILS_VIOLATION' &&
          result.error.details
        ) {
          setGuardrailsViolation({
            reasonCodes: result.error.details.reasonCodes,
            contentHash: result.error.details.contentHash,
            rulesetVersion: result.error.details.rulesetVersion,
          });
          // Don't set generic applyError for GUARDRAILS_VIOLATION
        } else {
          setApplyError(result.error.message);
        }
      }
    } catch (error) {
      setApplyError(
        error instanceof Error ? error.message : 'Fout bij toepassen',
      );
    } finally {
      setIsApplying(false);
    }
  };

  const handleClose = () => {
    if (state.type === 'loading' || state.type === 'loading_rewrite') {
      setState({ type: 'idle' });
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} size="2xl">
      <DialogTitle>AI Magician</DialogTitle>
      <DialogDescription>
        Analyseer hoe &quot;{recipeName}&quot; past bij jouw dieet en krijg een
        aangepaste versie.
      </DialogDescription>

      <DialogBody>
        {/* Tabs: tonen bij analyse-only, loading-rewrite, loading of success */}
        {(state.type === 'success' ||
          state.type === 'loading' ||
          state.type === 'analysis_only' ||
          state.type === 'loading_rewrite') && (
          <div
            className="border-b border-zinc-200 dark:border-zinc-800 mb-6"
            role="tablist"
          >
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('analyse')}
                className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-t ${
                  activeTab === 'analyse'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
                }`}
                aria-selected={activeTab === 'analyse'}
                role="tab"
                aria-controls="analyse-panel"
                id="analyse-tab"
              >
                Analyse
              </button>
              <button
                onClick={() => setActiveTab('rewrite')}
                className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-t ${
                  activeTab === 'rewrite'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
                }`}
                aria-selected={activeTab === 'rewrite'}
                role="tab"
                aria-controls="rewrite-panel"
                id="rewrite-tab"
                disabled={
                  state.type === 'loading' ||
                  state.type === 'analysis_only' ||
                  state.type === 'loading_rewrite' ||
                  (state.type === 'success' && !state.data.rewrite)
                }
              >
                Aangepaste versie
              </button>
            </nav>
          </div>
        )}

        {/* Idle State */}
        {state.type === 'idle' && (
          <div className="space-y-4 py-6">
            <div className="text-center">
              <SparklesIcon className="h-12 w-12 text-blue-500 dark:text-blue-400 mx-auto mb-4" />
              <Text className="text-zinc-600 dark:text-zinc-400">
                Laat de AI Magician analyseren hoe dit recept past bij jouw
                dieetvoorkeuren en krijg suggesties voor aanpassingen.
              </Text>
            </div>
            <div className="flex justify-center pt-4">
              <Button onClick={handleStartAnalysis}>
                <SparklesIcon data-slot="icon" />
                Start analyse
              </Button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {state.type === 'loading' && (
          <div className="space-y-4 py-6">
            <div className="text-center">
              <ArrowPathIcon className="h-12 w-12 text-blue-500 dark:text-blue-400 mx-auto mb-4 animate-spin" />
              <Text className="text-zinc-600 dark:text-zinc-400">
                Recept wordt geanalyseerd...
              </Text>
            </div>
            {/* Skeleton for tabs content */}
            <div className="space-y-4 mt-6">
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2 animate-pulse" />
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-5/6 animate-pulse" />
            </div>
          </div>
        )}

        {/* Error State */}
        {state.type === 'error' && (
          <div className="space-y-4 py-6">
            <div className="text-center">
              <ExclamationTriangleIcon className="h-12 w-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
              <Text className="text-red-600 dark:text-red-400 font-medium mb-2">
                Fout
              </Text>
              <Text className="text-zinc-600 dark:text-zinc-400">
                {state.message}
              </Text>
            </div>
            <div className="flex justify-center pt-4">
              <Button onClick={handleRetry} outline>
                Opnieuw proberen
              </Button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {state.type === 'empty' && (
          <div className="space-y-4 py-6">
            <div className="text-center">
              <ExclamationTriangleIcon className="h-12 w-12 text-amber-500 dark:text-amber-400 mx-auto mb-4" />
              <Text className="text-zinc-600 dark:text-zinc-400">
                {state.reason === 'Geen dieet geselecteerd'
                  ? 'Selecteer eerst een dieettype in je instellingen om gebruik te maken van de AI Magician.'
                  : state.reason}
              </Text>
            </div>
          </div>
        )}

        {/* Analyse-tab content: analysis_only of loading_rewrite (fase 1) */}
        {(state.type === 'analysis_only' || state.type === 'loading_rewrite') &&
          activeTab === 'analyse' && (
            <div
              className="space-y-4 py-2"
              role="tabpanel"
              id="analyse-panel"
              aria-labelledby="analyse-tab"
            >
              {'noRulesConfigured' in state.data &&
              state.data.noRulesConfigured ? (
                <div className="space-y-4 py-2">
                  <div className="text-center py-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                    <ExclamationTriangleIcon className="h-12 w-12 text-amber-500 dark:text-amber-400 mx-auto mb-4" />
                    <Text className="text-zinc-700 dark:text-zinc-300 font-medium mb-2">
                      Geen dieetregels geconfigureerd
                    </Text>
                    <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                      Er zijn geen dieetregels ingesteld voor dit dieet. Voeg
                      regels toe via Instellingen → Dieettype bewerken →
                      Dieetregels om afwijkingen te kunnen controleren.
                    </Text>
                  </div>
                </div>
              ) : state.data.violations.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                    <Text className="font-semibold text-zinc-900 dark:text-white">
                      {state.data.violations.length}{' '}
                      {state.data.violations.length === 1
                        ? 'afwijking gevonden'
                        : 'afwijkingen gevonden'}
                    </Text>
                  </div>
                  <div
                    className="max-h-[min(40vh,320px)] overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 p-1 space-y-4 pr-2"
                    role="region"
                    aria-label="Afwijkingsmeldingen"
                  >
                    {state.data.violations.map((violation, idx) => {
                      const severity = getViolationSeverity(violation);
                      const replaceChecked =
                        replaceViolationByIndex[idx] !== false;
                      return (
                        <div
                          key={idx}
                          className={`rounded-lg border p-4 ${
                            severity.level === 'verboden'
                              ? 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/30'
                              : severity.level === 'beter_van_niet'
                                ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-950/20'
                                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 space-y-2 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  color={
                                    severity.level === 'verboden'
                                      ? 'red'
                                      : severity.level === 'beter_van_niet'
                                        ? 'amber'
                                        : 'zinc'
                                  }
                                  className="text-xs"
                                >
                                  {severity.label}
                                </Badge>
                                <Badge color="red" className="text-xs">
                                  {violation.ingredientName}
                                </Badge>
                              </div>
                              <div>
                                <Text className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                  Regel
                                </Text>
                                <Text className="text-sm text-zinc-900 dark:text-white">
                                  {violation.ruleLabel}
                                </Text>
                              </div>
                              <div>
                                <Text className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                  Advies uit dieetregels
                                </Text>
                                <Text className="text-sm text-zinc-700 dark:text-zinc-300">
                                  {violation.suggestion}
                                </Text>
                              </div>
                              <label className="flex items-center gap-2 cursor-pointer mt-3">
                                <Checkbox
                                  checked={replaceChecked}
                                  onChange={(checked) =>
                                    setReplaceViolationByIndex((prev) => ({
                                      ...prev,
                                      [idx]: checked,
                                    }))
                                  }
                                  color="dark/zinc"
                                />
                                <Text className="text-sm text-zinc-700 dark:text-zinc-300">
                                  Vervangen in aangepaste versie
                                </Text>
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    {state.type === 'loading_rewrite' ? (
                      <div className="flex items-center justify-center gap-2 py-4">
                        <ArrowPathIcon className="h-5 w-5 text-blue-500 dark:text-blue-400 animate-spin" />
                        <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                          Aangepaste versie wordt gegenereerd...
                        </Text>
                      </div>
                    ) : (
                      <>
                        {rewriteError && (
                          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3 mb-4">
                            <div className="flex items-start gap-2">
                              <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                              <Text className="text-sm text-amber-800 dark:text-amber-200">
                                {rewriteError}
                              </Text>
                            </div>
                          </div>
                        )}
                        {state.data.violations.filter(
                          (_, i) => replaceViolationByIndex[i] !== false,
                        ).length === 0 && (
                          <Text className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                            Vink ten minste één afwijking aan om te laten
                            vervangen.
                          </Text>
                        )}
                        <Button
                          onClick={handleGenerateRewrite}
                          className="w-full"
                          disabled={
                            state.data.violations.filter(
                              (_, i) => replaceViolationByIndex[i] !== false,
                            ).length === 0
                          }
                        >
                          <SparklesIcon data-slot="icon" />
                          Genereer aangepaste versie
                        </Button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-4 py-2">
                  <div className="text-center py-8">
                    <CheckCircleIcon className="h-12 w-12 text-green-500 dark:text-green-400 mx-auto mb-4" />
                    <Text className="text-zinc-600 dark:text-zinc-400">
                      Geen afwijkingen gevonden! Dit recept past perfect bij
                      jouw dieet.
                    </Text>
                  </div>
                </div>
              )}
            </div>
          )}

        {/* Success State - Analyse Tab */}
        {state.type === 'success' && activeTab === 'analyse' && (
          <div
            className="space-y-4 py-2"
            role="tabpanel"
            id="analyse-panel"
            aria-labelledby="analyse-tab"
          >
            {state.data.analysis.violations.length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                  <Text className="font-semibold text-zinc-900 dark:text-white">
                    {state.data.analysis.violations.length}{' '}
                    {state.data.analysis.violations.length === 1
                      ? 'afwijking gevonden'
                      : 'afwijkingen gevonden'}
                  </Text>
                </div>
                <div
                  className="max-h-[min(40vh,320px)] overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 p-1 space-y-4 pr-2"
                  role="region"
                  aria-label="Afwijkingsmeldingen"
                >
                  {state.data.analysis.violations.map((violation, idx) => {
                    const severity = getViolationSeverity({
                      rule: violation.rule,
                    });
                    return (
                      <div
                        key={idx}
                        className={`rounded-lg border p-4 ${
                          severity.level === 'verboden'
                            ? 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/30'
                            : severity.level === 'beter_van_niet'
                              ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-950/20'
                              : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 space-y-2 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                color={
                                  severity.level === 'verboden'
                                    ? 'red'
                                    : severity.level === 'beter_van_niet'
                                      ? 'amber'
                                      : 'zinc'
                                }
                                className="text-xs"
                              >
                                {severity.label}
                              </Badge>
                              <Badge color="red" className="text-xs">
                                {violation.ingredientName}
                              </Badge>
                            </div>
                            <div>
                              <Text className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                Regel
                              </Text>
                              <Text className="text-sm text-zinc-900 dark:text-white">
                                {violation.rule}
                              </Text>
                            </div>
                            <div>
                              <Text className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                Advies uit dieetregels
                              </Text>
                              <Text className="text-sm text-zinc-700 dark:text-zinc-300">
                                {violation.suggestion}
                              </Text>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <CheckCircleIcon className="h-12 w-12 text-green-500 dark:text-green-400 mx-auto mb-4" />
                <Text className="text-zinc-600 dark:text-zinc-400">
                  Geen afwijkingen gevonden! Dit recept past perfect bij jouw
                  dieet.
                </Text>
              </div>
            )}
          </div>
        )}

        {/* Success State - Rewrite Tab */}
        {state.type === 'success' &&
          activeTab === 'rewrite' &&
          state.data.rewrite && (
            <div
              className="space-y-6 py-2"
              role="tabpanel"
              id="rewrite-panel"
              aria-labelledby="rewrite-tab"
            >
              {/* Ingredients */}
              <div>
                <Text className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
                  Aangepaste ingrediënten
                </Text>
                <ul className="space-y-2">
                  {state.data.rewrite.ingredients.map((ingredient, idx) => (
                    <li
                      key={idx}
                      className="text-sm text-zinc-600 dark:text-zinc-400 flex items-start gap-2"
                    >
                      <span className="text-zinc-400 dark:text-zinc-500">
                        •
                      </span>
                      <span>
                        <span className="font-medium text-zinc-900 dark:text-white">
                          {ingredient.name}
                        </span>
                        {ingredient.quantity && (
                          <>
                            : {ingredient.quantity}
                            {ingredient.unit && ` ${ingredient.unit}`}
                          </>
                        )}
                        {ingredient.note && (
                          <span className="text-zinc-500 dark:text-zinc-500 ml-1">
                            ({ingredient.note})
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Steps */}
              {state.data.rewrite.steps.length > 0 && (
                <div>
                  <Text className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
                    Aangepaste bereidingswijze
                  </Text>
                  <ol className="space-y-3">
                    {state.data.rewrite.steps.map((step, index) => (
                      <li
                        key={`step-${index}`}
                        className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-400"
                      >
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-medium text-xs">
                          {step.step}
                        </span>
                        <span className="flex-1 pt-0.5">{step.text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Persist Error Alert */}
              {persistError && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3">
                  <div className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <Text className="text-xs text-amber-800 dark:text-amber-200">
                        Kon niet automatisch opslaan: {persistError}
                      </Text>
                    </div>
                  </div>
                </div>
              )}

              {/* Soft Warnings (non-blocking) */}
              {currentDraft?.diagnostics?.guardrailsVnext?.outcome ===
                'warned' && (
                <SoftWarningsCallout
                  reasonCodes={
                    currentDraft.diagnostics.guardrailsVnext.reasonCodes
                  }
                  dietTypeId={dietId || undefined}
                  contentHash={
                    currentDraft.diagnostics.guardrailsVnext.contentHash
                  }
                />
              )}

              {/* Guardrails Violation Callout */}
              {guardrailsViolation && (
                <div className="mt-4">
                  <GuardrailsViolationCallout
                    reasonCodes={guardrailsViolation.reasonCodes}
                    contentHash={guardrailsViolation.contentHash}
                    rulesetVersion={guardrailsViolation.rulesetVersion}
                    dietId={dietId || undefined}
                    onDismiss={() => setGuardrailsViolation(null)}
                  />
                </div>
              )}

              {/* Persist Success / Apply Section */}
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                {isApplied ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 justify-center">
                      <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <Text className="text-sm font-medium text-green-600 dark:text-green-400">
                        Aangepaste versie toegepast
                      </Text>
                    </div>
                    <Text className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
                      Je aangepaste versie is nu actief
                    </Text>
                  </div>
                ) : (
                  <>
                    {isPersisting && (
                      <Text className="text-xs text-zinc-500 dark:text-zinc-400 text-center mb-2">
                        Opslaan...
                      </Text>
                    )}
                    {adaptationId && !isPersisting && (
                      <Text className="text-xs text-zinc-500 dark:text-zinc-400 text-center mb-2">
                        Opgeslagen als concept
                      </Text>
                    )}
                    <Button
                      onClick={handleApply}
                      disabled={!adaptationId || isApplying || isPersisting}
                      className="w-full"
                    >
                      {isApplying ? (
                        <>
                          <ArrowPathIcon
                            className="h-4 w-4 animate-spin"
                            data-slot="icon"
                          />
                          Toepassen...
                        </>
                      ) : (
                        'Aangepaste versie toepassen'
                      )}
                    </Button>
                    {applyError && (
                      <Text className="text-xs text-red-600 dark:text-red-400 text-center mt-2">
                        {applyError}
                      </Text>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
      </DialogBody>

      <DialogActions>
        <Button outline onClick={handleClose}>
          Sluiten
        </Button>
      </DialogActions>
    </Dialog>
  );
}
