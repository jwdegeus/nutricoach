'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/catalyst/button';
import { Text } from '@/components/catalyst/text';
import { Badge } from '@/components/catalyst/badge';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import { Textarea } from '@/components/catalyst/textarea';
import {
  evaluateDietGuardrailsAction,
  type GuardrailsPreviewResult,
} from '../actions/guardrails-preview.actions';
import { getGuardReasonLabel } from '@/src/lib/guardrails-vnext/ui/reasonLabels';
import { ClipboardIcon, CheckIcon } from '@heroicons/react/20/solid';

type GuardrailsPreviewPanelProps = {
  dietTypeId: string;
};

export function GuardrailsPreviewPanel({
  dietTypeId,
}: GuardrailsPreviewPanelProps) {
  const [recipeText, setRecipeText] = useState('');
  const [result, setResult] = useState<GuardrailsPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copiedHash, setCopiedHash] = useState(false);

  const handleEvaluate = () => {
    setError(null);
    setResult(null);

    startTransition(async () => {
      try {
        const response = await evaluateDietGuardrailsAction({
          dietTypeId,
          recipeText: recipeText.trim(),
        });

        if ('error' in response) {
          setError(response.error);
        } else if (response.data) {
          setResult(response.data);
        }
      } catch (err) {
        setError(
          `Onverwachte fout: ${err instanceof Error ? err.message : 'Onbekende fout'}`,
        );
      }
    });
  };

  const handleCopyHash = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.contentHash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    } catch (err) {
      console.error('Failed to copy hash:', err);
    }
  };

  const getOutcomeBadgeColor = (outcome: string): 'green' | 'amber' | 'red' => {
    if (outcome === 'allowed') return 'green';
    if (outcome === 'warned') return 'amber';
    return 'red';
  };

  const getOutcomeLabel = (outcome: string): string => {
    if (outcome === 'allowed') return 'Toegestaan';
    if (outcome === 'warned') return 'Gewaarschuwd';
    return 'Geblokkeerd';
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/10">
      <div className="mb-6">
        <Text className="text-lg font-semibold text-zinc-900 dark:text-white">
          Regels testen
        </Text>
        <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Plak een recept om te controleren of het voldoet aan de dieetregels.
          Je ziet daarna waarom het wel of niet voldoet. Geen wijzigingen worden
          opgeslagen.
        </Text>
      </div>

      {/* Form */}
      <FieldGroup>
        <Field>
          <Label htmlFor="preview-recipe">Recept</Label>
          <Textarea
            id="preview-recipe"
            value={recipeText}
            onChange={(e) => setRecipeText(e.target.value)}
            placeholder={
              'Plak hier een recept (tekst). Bijv.:\n\nIngrediënten:\n- 200 g pasta\n- 100 ml melk\n- 1 el olie\n\nBereiding:\n1. Kook de pasta volgens de verpakking.\n2. Voeg melk en olie toe en serveer.'
            }
            rows={12}
            disabled={isPending}
          />
          <Description>
            Ondersteunt secties zoals &quot;Ingrediënten&quot; en
            &quot;Bereiding&quot; (NL/EN). Zonder kopjes wordt de tekst
            automatisch in ingrediënten en stappen verdeeld.
          </Description>
        </Field>

        <div className="mt-4">
          <Button
            onClick={handleEvaluate}
            disabled={isPending || !recipeText.trim()}
          >
            {isPending ? 'Analyseren...' : 'Evalueren'}
          </Button>
        </div>
      </FieldGroup>

      {/* Error */}
      {error && (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <strong>Fout:</strong> {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-6 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-950/50">
          {/* Waarom wel/niet - prominent */}
          <div
            className={
              result.ok
                ? 'rounded-lg border border-green-200 bg-green-50/80 p-4 dark:border-green-800 dark:bg-green-950/30'
                : 'rounded-lg border border-red-200 bg-red-50/80 p-4 dark:border-red-800 dark:bg-red-950/30'
            }
          >
            <Text className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Waarom voldoet dit recept {result.ok ? 'wel' : 'niet'}?
            </Text>
            <Text
              className={
                result.ok
                  ? 'mt-1 text-sm text-green-800 dark:text-green-200'
                  : 'mt-1 text-sm text-red-800 dark:text-red-200'
              }
            >
              {result.explanation}
            </Text>
          </div>

          {/* Outcome */}
          <div className="flex items-center gap-3">
            <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Resultaat:
            </Text>
            <Badge color={getOutcomeBadgeColor(result.outcome)}>
              {getOutcomeLabel(result.outcome)}
            </Badge>
            {result.ok ? (
              <Badge color="green" className="text-xs">
                OK
              </Badge>
            ) : (
              <Badge color="red" className="text-xs">
                GEBLOKKEERD
              </Badge>
            )}
          </div>

          {/* Ontleed recept (als geplakt) */}
          {result.parsedRecipe &&
            (result.parsedRecipe.ingredients ||
              result.parsedRecipe.steps ||
              result.parsedRecipe.metadata) && (
              <details className="rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                <summary className="cursor-pointer p-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Ontleed als ingrediënten, stappen en metadata
                </summary>
                <div className="grid grid-cols-1 gap-3 border-t border-zinc-200 p-3 md:grid-cols-3 dark:border-zinc-700">
                  {result.parsedRecipe.ingredients ? (
                    <div>
                      <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Ingrediënten
                      </Text>
                      <pre className="mt-1 max-h-32 overflow-auto font-mono text-xs break-words whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                        {result.parsedRecipe.ingredients}
                      </pre>
                    </div>
                  ) : null}
                  {result.parsedRecipe.steps ? (
                    <div>
                      <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Stappen
                      </Text>
                      <pre className="mt-1 max-h-32 overflow-auto font-mono text-xs break-words whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                        {result.parsedRecipe.steps}
                      </pre>
                    </div>
                  ) : null}
                  {result.parsedRecipe.metadata ? (
                    <div>
                      <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Metadata
                      </Text>
                      <pre className="mt-1 max-h-32 overflow-auto font-mono text-xs break-words whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                        {result.parsedRecipe.metadata}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </details>
            )}

          {/* Reason Codes */}
          {result.reasonCodes.length > 0 && (
            <div>
              <Text className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Redenen:
              </Text>
              <div className="flex flex-wrap gap-2">
                {result.reasonCodes.map((code, idx) => (
                  <Badge
                    key={idx}
                    color="zinc"
                    className="text-xs"
                    title={code}
                  >
                    {getGuardReasonLabel(code)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Hash and Version */}
          <div className="flex items-center gap-4">
            <div>
              <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Content Hash:
              </Text>
              <div className="mt-1 flex items-center gap-2">
                <Text className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  {result.contentHash.substring(0, 16)}...
                </Text>
                <Button
                  onClick={handleCopyHash}
                  plain
                  className="h-6 text-zinc-600 dark:text-zinc-400"
                >
                  {copiedHash ? (
                    <>
                      <CheckIcon className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      <ClipboardIcon className="h-3 w-3" />
                    </>
                  )}
                </Button>
              </div>
            </div>
            <div>
              <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Ruleset Versie:
              </Text>
              <Badge color="zinc" className="mt-1 text-xs">
                v{result.rulesetVersion}
              </Badge>
            </div>
          </div>

          {/* Matches Summary */}
          <div>
            <Text className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Match Samenvatting:
            </Text>
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  Totaal Matches
                </Text>
                <Text className="text-base font-semibold text-zinc-900 dark:text-white">
                  {result.matchesSummary.totalMatches}
                </Text>
              </div>
              <div>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  Toegepaste Regels
                </Text>
                <Text className="text-base font-semibold text-zinc-900 dark:text-white">
                  {result.matchesSummary.appliedRules}
                </Text>
              </div>
              <div>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  Allow Matches
                </Text>
                <Text className="text-base font-semibold text-green-600 dark:text-green-400">
                  {result.matchesSummary.byAction.allow}
                </Text>
              </div>
              <div>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  Block Matches
                </Text>
                <Text className="text-base font-semibold text-red-600 dark:text-red-400">
                  {result.matchesSummary.byAction.block}
                </Text>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
              <div>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  Ingrediënten
                </Text>
                <Text className="text-base font-semibold text-zinc-900 dark:text-white">
                  {result.matchesSummary.byTarget.ingredient}
                </Text>
              </div>
              <div>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  Stappen
                </Text>
                <Text className="text-base font-semibold text-zinc-900 dark:text-white">
                  {result.matchesSummary.byTarget.step}
                </Text>
              </div>
              <div>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  Metadata
                </Text>
                <Text className="text-base font-semibold text-zinc-900 dark:text-white">
                  {result.matchesSummary.byTarget.metadata}
                </Text>
              </div>
            </div>
          </div>

          {/* Top Matches */}
          {result.topMatches.length > 0 && (
            <div>
              <Text className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Top Matches (max 5):
              </Text>
              <div className="space-y-2">
                {result.topMatches.map((match, idx) => (
                  <div
                    key={idx}
                    className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Text className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            {match.ruleLabel || match.ruleId}
                          </Text>
                          <Badge color="zinc" className="text-xs">
                            {match.matchMode}
                          </Badge>
                        </div>
                        <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {match.matchedText}
                        </Text>
                        <Text className="mt-1 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                          {match.targetPath}
                        </Text>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
