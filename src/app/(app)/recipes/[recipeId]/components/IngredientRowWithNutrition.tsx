'use client';

import { useState, useEffect } from 'react';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
} from '@/components/catalyst/dropdown';
import { Button } from '@/components/catalyst/button';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Field, Label } from '@/components/catalyst/fieldset';
import { Input } from '@/components/catalyst/input';
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  PlusIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/16/solid';
import {
  getIngredientNutritionAction,
  searchIngredientCandidatesAction,
  saveIngredientMatchAction,
  updateRecipeIngredientMatchAction,
  createCustomFoodFromIngredientAction,
  createCustomFoodManualAction,
} from '../actions/ingredient-matching.actions';
import type { NutritionalProfile } from '@/src/lib/nevo/nutrition-calculator';
import { quantityUnitToGrams } from '@/src/lib/recipes/quantity-unit-to-grams';
import type { IngredientCandidate } from '../actions/ingredient-matching.actions';

type Match = {
  source: 'nevo' | 'custom';
  nevoCode?: number;
  customFoodId?: string;
};

function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

type IngredientRowWithNutritionProps = {
  /** Weergavenaam van het ingrediënt */
  displayName: string;
  /** Hoeveelheid in gram (voor nutriwaardes). Bij ontbreken wordt 100g gebruikt voor weergave per 100g */
  amountG: number;
  /** Optioneel: hoeveelheid + eenheid als tekst (bijv. "2 el") */
  quantityLabel?: string;
  /** Originele hoeveelheid uit het recept (wordt bij koppelen opgeslagen, niet overschreven). */
  quantity?: number;
  /** Originele eenheid uit het recept (bijv. g, el, tl). */
  unit?: string;
  /** Optionele opmerking tussen haakjes */
  note?: string;
  /** Match met database (NEVO of custom). Bij null toont dropdown "Nog niet gematcht" + suggesties */
  match: Match | null;
  /** Voor legacy-ingrediënten: mealId om ref op te slaan */
  mealId?: string;
  /** Voor legacy-ingrediënten: mealSource */
  mealSource?: 'custom' | 'gemini';
  /** Voor legacy-ingrediënten: index in ingredients-array */
  ingredientIndex?: number;
  /** Na bevestigen van een match: callback om recept te verversen */
  onConfirmed?: () => void;
};

function formatNutri(value: number | null | undefined, unit: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const n = Number(value);
  return n % 1 === 0 ? `${n} ${unit}` : `${n.toFixed(1)} ${unit}`;
}

export function IngredientRowWithNutrition({
  displayName,
  amountG,
  quantityLabel,
  quantity,
  unit,
  note,
  match,
  mealId,
  mealSource,
  ingredientIndex,
  onConfirmed,
}: IngredientRowWithNutritionProps) {
  const [nutrition, setNutrition] = useState<
    NutritionalProfile | null | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<IngredientCandidate[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [savingMatch, setSavingMatch] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({
    name_nl: '',
    name_en: '',
    food_group_nl: 'Overig',
    energy_kcal: '',
    protein_g: '',
    fat_g: '',
    carbs_g: '',
    fiber_g: '',
  });
  const [manualSearchQuery, setManualSearchQuery] = useState('');

  const unitNorm = (unit ?? 'g').toLowerCase().trim();
  const effectiveG =
    amountG > 0
      ? amountG
      : unitNorm === 'g' && typeof quantity === 'number' && quantity > 0
        ? quantity
        : typeof quantity === 'number' && quantity > 0 && unit
          ? quantityUnitToGrams(quantity, unit)
          : 100;
  const MIN_CHARS_AUTO_SEARCH = 3;
  const canSearchSuggestions =
    !match &&
    mealId &&
    mealSource != null &&
    ingredientIndex != null &&
    typeof onConfirmed === 'function';

  useEffect(() => {
    if (!match) {
      setNutrition(undefined);
      return;
    }
    setNutrition(undefined);
  }, [match?.source, match?.nevoCode, match?.customFoodId]);

  // Na 3 tekens direct zoeken in het handmatige zoekveld (debounced 300 ms)
  useEffect(() => {
    const q = manualSearchQuery.trim();
    if (q.length < MIN_CHARS_AUTO_SEARCH || !canSearchSuggestions) {
      if (q.length === 0) setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      loadSuggestionsWithQuery(q);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSuggestionsWithQuery is stable enough; we only want to run when query/canSearch changes
  }, [manualSearchQuery, canSearchSuggestions]);

  const loadNutrition = async () => {
    if (!match || nutrition !== undefined) return; // al geladen of geen match
    setLoading(true);
    const result = await getIngredientNutritionAction({
      source: match.source,
      nevoCode: match.nevoCode,
      customFoodId: match.customFoodId,
      amountG: effectiveG,
    });
    setLoading(false);
    if (result.ok && result.data) {
      setNutrition(result.data);
    } else {
      setNutrition(null);
    }
  };

  const loadSuggestionsWithQuery = async (query: string) => {
    if (!canSearchSuggestions) return;
    const q = query.trim();
    if (!q) return;
    setSuggestionsLoading(true);
    setSuggestions([]);
    setHasSearched(true);
    const searchResult = await searchIngredientCandidatesAction(q, 15);
    setSuggestionsLoading(false);
    if (searchResult.ok && searchResult.data.length > 0) {
      setSuggestions(searchResult.data);
    }
  };

  const loadSuggestions = () => loadSuggestionsWithQuery(displayName.trim());

  const confirmSuggestion = async (candidate: IngredientCandidate) => {
    if (!canSearchSuggestions || savingMatch) return;
    const normalized = normalizeText(displayName);
    setSavingMatch(true);
    const saveResult = await saveIngredientMatchAction({
      normalizedText: normalized,
      source: candidate.source,
      nevoCode: candidate.nevoCode,
      customFoodId: candidate.customFoodId,
    });
    if (!saveResult.ok) {
      setSavingMatch(false);
      return;
    }
    const updateResult = await updateRecipeIngredientMatchAction({
      mealId: mealId!,
      source: mealSource!,
      ingredientIndex: ingredientIndex!,
      match: {
        source: candidate.source,
        nevoCode: candidate.nevoCode,
        customFoodId: candidate.customFoodId,
      },
      displayName: candidate.name_nl,
      quantityG:
        unitNorm === 'g' && typeof quantity === 'number' && quantity > 0
          ? quantity
          : typeof quantity === 'number' && unit
            ? undefined
            : effectiveG,
      quantity: typeof quantity === 'number' ? quantity : undefined,
      unit: unit ?? undefined,
    });
    setSavingMatch(false);
    if (updateResult.ok) {
      onConfirmed?.();
    }
  };

  const handleAiAdd = async () => {
    if (!canSearchSuggestions || aiLoading) return;
    setAiError(null);
    setAiLoading(true);
    const result = await createCustomFoodFromIngredientAction({
      ingredientText: displayName.trim(),
    });
    if (!result.ok) {
      setAiLoading(false);
      setAiError(result.error.message);
      return;
    }
    const normalized = normalizeText(displayName);
    const saveResult = await saveIngredientMatchAction({
      normalizedText: normalized,
      source: 'custom',
      customFoodId: result.data.customFoodId,
    });
    if (!saveResult.ok) {
      setAiLoading(false);
      setAiError(saveResult.error.message);
      return;
    }
    const updateResult = await updateRecipeIngredientMatchAction({
      mealId: mealId!,
      source: mealSource!,
      ingredientIndex: ingredientIndex!,
      match: { source: 'custom', customFoodId: result.data.customFoodId },
      displayName: result.data.nameNl || displayName.trim(),
      quantityG:
        unitNorm === 'g' && typeof quantity === 'number' && quantity > 0
          ? quantity
          : typeof quantity === 'number' && unit
            ? undefined
            : effectiveG,
      quantity: typeof quantity === 'number' ? quantity : undefined,
      unit: unit ?? undefined,
    });
    setAiLoading(false);
    if (updateResult.ok) {
      onConfirmed?.();
    } else {
      setAiError(updateResult.error.message);
    }
  };

  const openManualModal = () => {
    setManualError(null);
    setManualForm({
      name_nl: displayName.trim(),
      name_en: '',
      food_group_nl: 'Overig',
      energy_kcal: '',
      protein_g: '',
      fat_g: '',
      carbs_g: '',
      fiber_g: '',
    });
    setManualModalOpen(true);
  };

  const handleManualSubmit = async () => {
    if (!canSearchSuggestions || manualSaving) return;
    const nameNl = manualForm.name_nl.trim();
    if (!nameNl) {
      setManualError('Naam (NL) is verplicht');
      return;
    }
    setManualSaving(true);
    setManualError(null);
    const result = await createCustomFoodManualAction({
      name_nl: nameNl,
      name_en: manualForm.name_en.trim() || null,
      food_group_nl: manualForm.food_group_nl || 'Overig',
      food_group_en: 'Other',
      energy_kcal:
        manualForm.energy_kcal !== ''
          ? parseFloat(manualForm.energy_kcal)
          : null,
      protein_g:
        manualForm.protein_g !== '' ? parseFloat(manualForm.protein_g) : null,
      fat_g: manualForm.fat_g !== '' ? parseFloat(manualForm.fat_g) : null,
      carbs_g:
        manualForm.carbs_g !== '' ? parseFloat(manualForm.carbs_g) : null,
      fiber_g:
        manualForm.fiber_g !== '' ? parseFloat(manualForm.fiber_g) : null,
    });
    if (!result.ok) {
      setManualSaving(false);
      setManualError(result.error.message);
      return;
    }
    const normalized = normalizeText(displayName);
    const saveResult = await saveIngredientMatchAction({
      normalizedText: normalized,
      source: 'custom',
      customFoodId: result.data.customFoodId,
    });
    if (!saveResult.ok) {
      setManualSaving(false);
      setManualError(saveResult.error.message);
      return;
    }
    const updateResult = await updateRecipeIngredientMatchAction({
      mealId: mealId!,
      source: mealSource!,
      ingredientIndex: ingredientIndex!,
      match: { source: 'custom', customFoodId: result.data.customFoodId },
      displayName: result.data.nameNl || nameNl,
      quantityG:
        unitNorm === 'g' && typeof quantity === 'number' && quantity > 0
          ? quantity
          : typeof quantity === 'number' && unit
            ? undefined
            : effectiveG,
      quantity: typeof quantity === 'number' ? quantity : undefined,
      unit: unit ?? undefined,
    });
    setManualSaving(false);
    if (updateResult.ok) {
      setManualModalOpen(false);
      setAiError(null);
      onConfirmed?.();
    } else {
      setManualError(updateResult.error.message);
    }
  };

  const displayQuantity = quantityLabel ?? `${effectiveG}g`;

  return (
    <Dropdown>
      <DropdownButton
        as="button"
        type="button"
        onClick={match ? loadNutrition : undefined}
        className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/80"
      >
        {!match && (
          <ExclamationTriangleIcon
            className="mr-1.5 inline-block h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400"
            aria-hidden
            title="Nog niet gematcht – klik om te matchen"
          />
        )}
        <span className="font-medium text-zinc-900 dark:text-white">
          {displayName}
        </span>
        {displayQuantity && (
          <>
            {' '}
            <span className="text-zinc-500 dark:text-zinc-500">
              {displayQuantity}
            </span>
          </>
        )}
        {note && (
          <span className="text-zinc-500 dark:text-zinc-500 italic">
            {' '}
            ({note})
          </span>
        )}
        <ChevronDownIcon className="ml-1 inline-block h-4 w-4 text-zinc-400" />
      </DropdownButton>
      <DropdownMenu
        anchor="bottom start"
        className="w-[var(--button-width)] min-w-[18rem] max-w-[22rem] p-0"
      >
        <div className="p-4">
          {!match && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Nog niet gematcht met de database. Zoek suggesties of laat later
                AI het ingrediënt toevoegen.
              </p>
              {canSearchSuggestions && (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-2">
                    <Button
                      outline={true}
                      className="shrink-0 sm:w-auto"
                      disabled={suggestionsLoading || savingMatch}
                      onClick={loadSuggestions}
                    >
                      <MagnifyingGlassIcon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {suggestionsLoading ? 'Zoeken...' : 'Zoek suggesties'}
                      </span>
                    </Button>
                    <div className="flex min-w-0 flex-1 gap-2">
                      <Input
                        type="search"
                        placeholder="Zoeken vanaf 3 tekens (bijv. uien)"
                        value={manualSearchQuery}
                        onChange={(e) => setManualSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            loadSuggestionsWithQuery(manualSearchQuery);
                          }
                        }}
                        className="min-w-0"
                        disabled={suggestionsLoading || savingMatch}
                      />
                      <Button
                        outline={true}
                        className="shrink-0"
                        disabled={
                          suggestionsLoading ||
                          savingMatch ||
                          !manualSearchQuery.trim()
                        }
                        onClick={() =>
                          loadSuggestionsWithQuery(manualSearchQuery)
                        }
                      >
                        Zoek
                      </Button>
                    </div>
                  </div>
                  {suggestions.length > 0 && (
                    <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mt-4 -mx-4 px-4">
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
                        Mogelijk bedoelde u
                      </p>
                      <ul className="max-h-52 overflow-y-auto -mx-4">
                        {suggestions.map((c, i) => (
                          <li
                            key={i}
                            className="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
                          >
                            <DropdownItem
                              onClick={() => confirmSuggestion(c)}
                              disabled={savingMatch}
                              className="flex flex-col items-stretch gap-1.5 w-full rounded-none py-3 px-4 text-left data-focus:bg-zinc-100 data-focus:text-zinc-950 dark:data-focus:bg-zinc-700 dark:data-focus:text-white [&_.text-zinc-500]:data-focus:text-zinc-600 dark:[&_.text-zinc-400]:data-focus:text-zinc-300"
                            >
                              <span className="block truncate text-sm font-medium text-zinc-900 dark:text-white">
                                {c.name_nl}
                              </span>
                              {c.food_group_nl && (
                                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                                  {c.food_group_nl}
                                </span>
                              )}
                            </DropdownItem>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!suggestionsLoading && suggestions.length === 0 && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {hasSearched
                        ? 'Geen suggesties gevonden.'
                        : 'Klik op "Zoek suggesties" om te zoeken in NEVO en eigen ingredienten.'}
                    </p>
                  )}
                  <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mt-4">
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3 leading-relaxed">
                      Ingrediënt niet gevonden? Laat AI het ingrediënt opzoeken,
                      nutriwaardes invullen en toevoegen aan de database.
                    </p>
                    {aiError && (
                      <div className="mb-3 space-y-2">
                        <p className="text-xs text-red-600 dark:text-red-400">
                          {aiError}
                        </p>
                        <Button
                          outline={true}
                          className="w-full"
                          disabled={savingMatch || manualSaving}
                          onClick={openManualModal}
                        >
                          <PlusIcon className="mr-2 h-4 w-4 shrink-0" />
                          Handmatig toevoegen
                        </Button>
                      </div>
                    )}
                    <Button
                      outline={true}
                      className="w-full"
                      disabled={aiLoading || savingMatch}
                      onClick={handleAiAdd}
                    >
                      <SparklesIcon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {aiLoading
                          ? 'AI zoekt en voegt toe...'
                          : 'Laat AI zoeken en toevoegen'}
                      </span>
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
          {match && loading && (
            <p className="text-sm text-zinc-500 dark:text-zinc-500 py-3">
              Nutriwaardes laden...
            </p>
          )}
          {match && nutrition === null && !loading && (
            <p className="text-sm text-zinc-500 dark:text-zinc-500 py-3">
              Geen nutriwaardes beschikbaar.
            </p>
          )}
          {match && nutrition && (
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
                Nutriwaardes ({effectiveG}g)
              </p>
              <dl className="grid grid-cols-[1fr_auto] gap-y-2 gap-x-6 text-sm">
                <dt className="text-zinc-600 dark:text-zinc-400">Energie</dt>
                <dd className="text-right tabular-nums text-zinc-900 dark:text-white">
                  {formatNutri(nutrition.energy_kcal, 'kcal')}
                </dd>
                <dt className="text-zinc-600 dark:text-zinc-400">Eiwit</dt>
                <dd className="text-right tabular-nums text-zinc-900 dark:text-white">
                  {formatNutri(nutrition.protein_g, 'g')}
                </dd>
                <dt className="text-zinc-600 dark:text-zinc-400">Vet</dt>
                <dd className="text-right tabular-nums text-zinc-900 dark:text-white">
                  {formatNutri(nutrition.fat_g, 'g')}
                </dd>
                <dt className="text-zinc-600 dark:text-zinc-400">
                  Koolhydraten
                </dt>
                <dd className="text-right tabular-nums text-zinc-900 dark:text-white">
                  {formatNutri(nutrition.carbs_g, 'g')}
                </dd>
                <dt className="text-zinc-600 dark:text-zinc-400">Vezels</dt>
                <dd className="text-right tabular-nums text-zinc-900 dark:text-white">
                  {formatNutri(nutrition.fiber_g, 'g')}
                </dd>
                <dt className="text-zinc-600 dark:text-zinc-400">Natrium</dt>
                <dd className="text-right tabular-nums text-zinc-900 dark:text-white">
                  {formatNutri(nutrition.sodium_mg, 'mg')}
                </dd>
              </dl>
            </div>
          )}
        </div>
      </DropdownMenu>

      <Dialog
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        size="md"
      >
        <DialogTitle>Ingrediënt handmatig toevoegen</DialogTitle>
        <DialogBody>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Voeg het ingrediënt toe als eigen ingrediënt. Vul minimaal de
            Nederlandse naam in; voedingswaarden zijn optioneel (per 100 g).
          </p>
          {manualError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {manualError}
            </div>
          )}
          <div className="space-y-4">
            <Field>
              <Label>Naam (NL) *</Label>
              <Input
                value={manualForm.name_nl}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, name_nl: e.target.value }))
                }
                placeholder="bijv. Kokosmelk"
              />
            </Field>
            <Field>
              <Label>Naam (EN)</Label>
              <Input
                value={manualForm.name_en}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, name_en: e.target.value }))
                }
                placeholder="optioneel"
              />
            </Field>
            <Field>
              <Label>Voedingsmiddelgroep (NL)</Label>
              <Input
                value={manualForm.food_group_nl}
                onChange={(e) =>
                  setManualForm((f) => ({
                    ...f,
                    food_group_nl: e.target.value,
                  }))
                }
                placeholder="bijv. Overig, Diversen"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <Label>Energie (kcal/100g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={manualForm.energy_kcal}
                  onChange={(e) =>
                    setManualForm((f) => ({
                      ...f,
                      energy_kcal: e.target.value,
                    }))
                  }
                  placeholder="–"
                />
              </Field>
              <Field>
                <Label>Eiwit (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={manualForm.protein_g}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, protein_g: e.target.value }))
                  }
                  placeholder="–"
                />
              </Field>
              <Field>
                <Label>Vet (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={manualForm.fat_g}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, fat_g: e.target.value }))
                  }
                  placeholder="–"
                />
              </Field>
              <Field>
                <Label>Koolhydraten (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={manualForm.carbs_g}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, carbs_g: e.target.value }))
                  }
                  placeholder="–"
                />
              </Field>
              <Field>
                <Label>Vezel (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={manualForm.fiber_g}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, fiber_g: e.target.value }))
                  }
                  placeholder="–"
                />
              </Field>
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setManualModalOpen(false)}>
            Annuleren
          </Button>
          <Button
            onClick={handleManualSubmit}
            disabled={manualSaving || !manualForm.name_nl.trim()}
          >
            {manualSaving ? 'Toevoegen...' : 'Toevoegen'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dropdown>
  );
}
