"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import { Badge } from "@/components/catalyst/badge";
import { SparklesIcon, ExclamationTriangleIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { requestRecipeAdaptationAction } from "../actions/recipe-ai.actions";
import {
  persistRecipeAdaptationDraftAction,
  applyRecipeAdaptationAction,
  getCurrentDietIdAction,
} from "../actions/recipe-ai.persist.actions";
import type { RecipeAIState, RecipeAIData, RecipeAdaptationDraft } from "../recipe-ai.types";

type RecipeAIMagicianProps = {
  open: boolean;
  onClose: () => void;
  recipeId: string;
  recipeName?: string;
};

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
  recipeName = "Recept",
}: RecipeAIMagicianProps) {
  const [state, setState] = useState<RecipeAIState>({ type: "idle" });
  const [activeTab, setActiveTab] = useState<"analyse" | "rewrite">("analyse");
  const [adaptationId, setAdaptationId] = useState<string | null>(null);
  const [isApplied, setIsApplied] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [dietId, setDietId] = useState<string | null>(null);

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
      setState({ type: "idle" });
      setActiveTab("analyse");
      setAdaptationId(null);
      setIsApplied(false);
      setIsPersisting(false);
      setIsApplying(false);
      setPersistError(null);
      setApplyError(null);
    }
  }, [open]);

  // Handle recipeId validation
  useEffect(() => {
    if (open && (!recipeId || recipeId === "undefined")) {
      setState({
        type: "error",
        message: "Recept ID ontbreekt. Probeer de pagina te vernieuwen.",
      });
    }
  }, [open, recipeId]);

  const handleStartAnalysis = async () => {
    console.log("[RecipeAIMagician] handleStartAnalysis called");
    console.log("[RecipeAIMagician] recipeId:", recipeId);
    console.log("[RecipeAIMagician] dietId:", dietId);
    
    if (!recipeId || recipeId === "undefined") {
      console.error("[RecipeAIMagician] Invalid recipeId");
      setState({
        type: "error",
        message: "Recept ID ontbreekt.",
      });
      return;
    }

    // Get diet ID if not already loaded
    let currentDietId = dietId;
    if (!currentDietId) {
      console.log("[RecipeAIMagician] Fetching diet ID...");
      const dietResult = await getCurrentDietIdAction();
      console.log("[RecipeAIMagician] Diet result:", dietResult);
      
      if (!dietResult.ok) {
        console.error("[RecipeAIMagician] Diet fetch failed:", dietResult.error);
        setState({
          type: "error",
          message: dietResult.error.message,
        });
        return;
      }
      if (!dietResult.data) {
        console.warn("[RecipeAIMagician] No diet selected");
        setState({
          type: "empty",
          reason: "NO_DIET_SELECTED",
        });
        return;
      }
      currentDietId = dietResult.data.dietId;
      setDietId(currentDietId);
      console.log("[RecipeAIMagician] Diet ID set to:", currentDietId);
    }

    console.log("[RecipeAIMagician] Starting analysis with:", { recipeId, dietId: currentDietId });
    setState({ type: "loading" });
    setPersistError(null);
    setApplyError(null);

    try {
      console.log("[RecipeAIMagician] Calling requestRecipeAdaptationAction...");
      const result = await requestRecipeAdaptationAction({
        recipeId,
        dietId: currentDietId,
      });
      console.log("[RecipeAIMagician] Result received:", result.outcome);

      if (result.outcome === "success") {
        // Convert draft to UI format
        const data = draftToAIData(result.adaptation);
        setState({ type: "success", data });

        // Persist draft
        setIsPersisting(true);
        try {
          const persistResult = await persistRecipeAdaptationDraftAction({
            recipeId,
            dietId: currentDietId,
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
            error instanceof Error ? error.message : "Fout bij opslaan"
          );
        } finally {
          setIsPersisting(false);
        }
      } else if (result.outcome === "empty") {
        setState({
          type: "empty",
          reason: result.reason,
        });
      } else {
        setState({
          type: "error",
          message: result.message,
        });
      }
    } catch (error) {
      setState({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Er is een fout opgetreden bij de analyse.",
      });
    }
  };

  const handleRetry = () => {
    setState({ type: "idle" });
    setPersistError(null);
    setApplyError(null);
  };

  const handleApply = async () => {
    if (!adaptationId) {
      return;
    }

    setIsApplying(true);
    setApplyError(null);

    try {
      const result = await applyRecipeAdaptationAction({
        adaptationId,
      });

      if (result.ok) {
        setIsApplied(true);
      } else {
        setApplyError(result.error.message);
      }
    } catch (error) {
      setApplyError(
        error instanceof Error ? error.message : "Fout bij toepassen"
      );
    } finally {
      setIsApplying(false);
    }
  };

  const handleClose = () => {
    // Reset to idle when closing during loading
    if (state.type === "loading") {
      setState({ type: "idle" });
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} size="2xl">
      <DialogTitle>AI Magician</DialogTitle>
      <DialogDescription>
        Analyseer hoe "{recipeName}" past bij jouw dieet en krijg een aangepaste versie.
      </DialogDescription>

      <DialogBody>
        {/* Tabs */}
        {(state.type === "success" || state.type === "loading") && (
          <div className="border-b border-zinc-200 dark:border-zinc-800 mb-6" role="tablist">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab("analyse")}
                className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-t ${
                  activeTab === "analyse"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                }`}
                aria-selected={activeTab === "analyse"}
                role="tab"
                aria-controls="analyse-panel"
                id="analyse-tab"
              >
                Analyse
              </button>
              <button
                onClick={() => setActiveTab("rewrite")}
                className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-t ${
                  activeTab === "rewrite"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                }`}
                aria-selected={activeTab === "rewrite"}
                role="tab"
                aria-controls="rewrite-panel"
                id="rewrite-tab"
                disabled={state.type === "loading" || (state.type === "success" && !state.data.rewrite)}
              >
                Aangepaste versie
              </button>
            </nav>
          </div>
        )}

        {/* Idle State */}
        {state.type === "idle" && (
          <div className="space-y-4 py-6">
            <div className="text-center">
              <SparklesIcon className="h-12 w-12 text-blue-500 dark:text-blue-400 mx-auto mb-4" />
              <Text className="text-zinc-600 dark:text-zinc-400">
                Laat de AI Magician analyseren hoe dit recept past bij jouw dieetvoorkeuren en krijg suggesties voor aanpassingen.
              </Text>
            </div>
            <div className="flex justify-center pt-4">
              <Button onClick={handleStartAnalysis} disabled={state.type === "loading"}>
                <SparklesIcon data-slot="icon" />
                Start analyse
              </Button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {state.type === "loading" && (
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
        {state.type === "error" && (
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
        {state.type === "empty" && (
          <div className="space-y-4 py-6">
            <div className="text-center">
              <ExclamationTriangleIcon className="h-12 w-12 text-amber-500 dark:text-amber-400 mx-auto mb-4" />
              <Text className="text-zinc-600 dark:text-zinc-400">
                {state.reason === "Geen dieet geselecteerd"
                  ? "Selecteer eerst een dieettype in je instellingen om gebruik te maken van de AI Magician."
                  : state.reason}
              </Text>
            </div>
          </div>
        )}

        {/* Success State - Analyse Tab */}
        {state.type === "success" && activeTab === "analyse" && (
          <div className="space-y-4 py-2" role="tabpanel" id="analyse-panel" aria-labelledby="analyse-tab">
            {state.data.analysis.violations.length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                  <Text className="font-semibold text-zinc-900 dark:text-white">
                    {state.data.analysis.violations.length} {state.data.analysis.violations.length === 1 ? "afwijking gevonden" : "afwijkingen gevonden"}
                  </Text>
                </div>
                <div className="space-y-4">
                  {state.data.analysis.violations.map((violation, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-900/50"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge color="red" className="text-xs">
                              {violation.ingredientName}
                            </Badge>
                            <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                              {violation.rule}
                            </Text>
                          </div>
                          <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                            <span className="font-medium">Suggestie:</span> {violation.suggestion}
                          </Text>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <CheckCircleIcon className="h-12 w-12 text-green-500 dark:text-green-400 mx-auto mb-4" />
                <Text className="text-zinc-600 dark:text-zinc-400">
                  Geen afwijkingen gevonden! Dit recept past perfect bij jouw dieet.
                </Text>
              </div>
            )}
          </div>
        )}

        {/* Success State - Rewrite Tab */}
        {state.type === "success" && activeTab === "rewrite" && state.data.rewrite && (
          <div className="space-y-6 py-2" role="tabpanel" id="rewrite-panel" aria-labelledby="rewrite-tab">
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
                    <span className="text-zinc-400 dark:text-zinc-500">•</span>
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
                  {state.data.rewrite.steps.map((step) => (
                    <li
                      key={step.step}
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
                        <ArrowPathIcon className="h-4 w-4 animate-spin" data-slot="icon" />
                        Toepassen...
                      </>
                    ) : (
                      "Aangepaste versie toepassen"
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
