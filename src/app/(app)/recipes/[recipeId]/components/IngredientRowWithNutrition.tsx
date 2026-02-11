'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  MagnifyingGlassIcon,
  SparklesIcon,
  PlusIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  LinkIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/16/solid';
import { TrashIcon } from '@heroicons/react/20/solid';
import { Badge } from '@/components/catalyst/badge';
import {
  getIngredientNutritionAction,
  searchIngredientCandidatesAction,
  saveIngredientMatchAction,
  updateRecipeIngredientMatchAction,
  createCustomFoodFromIngredientAction,
  createCustomFoodManualAction,
} from '../actions/ingredient-matching.actions';
import { useToast } from '@/src/components/app/ToastContext';
import type { NutritionalProfile } from '@/src/lib/nevo/nutrition-calculator';
import { quantityUnitToGrams } from '@/src/lib/recipes/quantity-unit-to-grams';
import type {
  IngredientCandidate,
  OptimisticMatchPayload,
} from '../actions/ingredient-matching.actions';

type Match = {
  source: 'nevo' | 'custom' | 'fndds';
  nevoCode?: number;
  customFoodId?: string;
  /** FNDDS survey food fdc_id when source is fndds */
  fdcId?: number;
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
  /** Match met database (NEVO, custom of FNDDS). Bij null toont dropdown "Nog niet gematcht" + suggesties */
  match: Match | null;
  /** Voor legacy-ingrediënten: mealId om ref op te slaan */
  mealId?: string;
  /** Voor legacy-ingrediënten: mealSource */
  mealSource?: 'custom' | 'gemini';
  /** Voor legacy-ingrediënten: index in ingredients-array */
  ingredientIndex?: number;
  /** Na bevestigen van een match: callback met payload voor optimistische update (geen paginareload) */
  onConfirmed?: (payload?: OptimisticMatchPayload) => void;
  /** Wordt true wanneer een andere rij aan het opslaan is; voorkomt gelijktijdige updates */
  externalSaving?: boolean;
  /** Callback wanneer deze rij begint/stopt met opslaan (voor globale lock) */
  onSavingChange?: (saving: boolean) => void;
  /** Callback om dit ingrediënt uit het recept te verwijderen (toont prullenbak bij hover) */
  onRemove?: () => void;
  /** Callback om dit ingrediënt te bewerken (naam, hoeveelheid, eenheid, opmerking). Alleen voor legacy-rijen. */
  onEdit?: (patch: {
    name: string;
    quantity?: string | number | null;
    unit?: string | null;
    note?: string | null;
  }) => void;
};

function _formatNutri(value: number | null | undefined, unit: string): string {
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
  externalSaving = false,
  onSavingChange,
  onRemove,
  onEdit,
}: IngredientRowWithNutritionProps) {
  const { showToast } = useToast();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [_showRelinkUI, setShowRelinkUI] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const quantityForInput =
    quantity != null && Number.isFinite(quantity) ? String(quantity) : '';
  const [editForm, setEditForm] = useState({
    name: displayName,
    quantity: quantityForInput,
    unit: unit ?? '',
    note: note ?? '',
  });
  const [editSaving, setEditSaving] = useState(false);
  useEffect(() => {
    if (editDialogOpen) {
      const q =
        quantity != null && Number.isFinite(quantity) ? String(quantity) : '';
      setEditForm({
        name: displayName,
        quantity: q,
        unit: unit ?? '',
        note: note ?? '',
      });
    }
  }, [editDialogOpen, displayName, quantity, unit, note]);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [nutrition, setNutrition] = useState<
    NutritionalProfile | null | undefined
  >(undefined);
  const [_loading, setLoading] = useState(false);
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
    amountG === 0
      ? 0
      : amountG > 0
        ? amountG
        : unitNorm === 'g' && typeof quantity === 'number' && quantity > 0
          ? quantity
          : typeof quantity === 'number' && quantity > 0 && unit
            ? quantityUnitToGrams(quantity, unit)
            : 100;
  const MIN_CHARS_AUTO_SEARCH = 3;
  const canSearchSuggestions =
    mealId &&
    mealSource != null &&
    ingredientIndex != null &&
    typeof onConfirmed === 'function';
  const isSaving = savingMatch || externalSaving;

  useEffect(() => {
    if (!match) {
      setNutrition(undefined);
      return;
    }
    setNutrition(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- match identity used via specific fields
  }, [match?.source, match?.nevoCode, match?.customFoodId, match?.fdcId]);

  // Reset "opnieuw koppelen" view when closing the dialog
  useEffect(() => {
    if (!linkDialogOpen) setShowRelinkUI(false);
  }, [linkDialogOpen]);

  const loadSuggestionsWithQuery = useCallback(
    async (query: string) => {
      if (!canSearchSuggestions) return;
      const q = query.trim();
      if (!q) return;
      setSuggestionsLoading(true);
      setSuggestions([]);
      setConfirmError(null);
      setHasSearched(true);
      try {
        const searchResult = await searchIngredientCandidatesAction(q, 15);
        if (searchResult.ok) {
          setSuggestions(searchResult.data ?? []);
        } else {
          setConfirmError(searchResult.error.message ?? 'Zoeken mislukt');
        }
      } catch (err) {
        setConfirmError(err instanceof Error ? err.message : 'Zoeken mislukt');
      } finally {
        setSuggestionsLoading(false);
      }
    },
    [canSearchSuggestions],
  );

  // Na 3 tekens direct zoeken in het handmatige zoekveld (debounced 300 ms). Alleen query/canSearch in deps zodat de modal niet herlaadt bij elke state-update.
  const searchQueryRef = useRef(manualSearchQuery);
  searchQueryRef.current = manualSearchQuery;
  const loadSuggestionsRef = useRef(loadSuggestionsWithQuery);
  loadSuggestionsRef.current = loadSuggestionsWithQuery;
  useEffect(() => {
    const q = manualSearchQuery.trim();
    if (q.length < MIN_CHARS_AUTO_SEARCH || !canSearchSuggestions) {
      if (q.length === 0) setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      loadSuggestionsRef.current(searchQueryRef.current.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [manualSearchQuery, canSearchSuggestions]);

  const _loadNutrition = async () => {
    if (!match || nutrition !== undefined) return; // al geladen of geen match
    setLoading(true);
    const result = await getIngredientNutritionAction({
      source: match.source,
      nevoCode: match.nevoCode,
      customFoodId: match.customFoodId,
      fdcId: match.fdcId,
      amountG: effectiveG,
    });
    setLoading(false);
    if (result.ok && result.data) {
      setNutrition(result.data);
    } else {
      setNutrition(null);
    }
  };

  const loadSuggestions = () => {
    setConfirmError(null);
    loadSuggestionsWithQuery(displayName.trim());
  };

  const confirmSuggestion = async (candidate: IngredientCandidate) => {
    if (!canSearchSuggestions || isSaving) return;
    setConfirmError(null);
    setSavingMatch(true);
    onSavingChange?.(true);
    const normalized = normalizeText(displayName);
    const saveResult = await saveIngredientMatchAction({
      normalizedText: normalized,
      source: candidate.source,
      nevoCode: candidate.nevoCode,
      customFoodId: candidate.customFoodId,
      fdcId: candidate.fdcId,
    });
    if (!saveResult.ok) {
      setSavingMatch(false);
      onSavingChange?.(false);
      setConfirmError(saveResult.error.message);
      showToast({
        type: 'error',
        title: 'Koppelen mislukt',
        description: saveResult.error.message,
      });
      return;
    }
    // Gebruik altijd hoeveelheid en eenheid uit het recept; nooit 100g als default.
    const updateResult = await updateRecipeIngredientMatchAction({
      mealId: mealId!,
      source: mealSource!,
      ingredientIndex: ingredientIndex!,
      match: {
        source: candidate.source,
        nevoCode: candidate.nevoCode,
        customFoodId: candidate.customFoodId,
        fdcId: candidate.fdcId,
      },
      displayName: candidate.name_nl,
      quantityG:
        unitNorm === 'g'
          ? typeof quantity === 'number' && quantity > 0
            ? quantity
            : 0
          : undefined,
      quantity: typeof quantity === 'number' ? quantity : undefined,
      unit: unit ?? undefined,
    });
    setSavingMatch(false);
    onSavingChange?.(false);
    if (updateResult.ok) {
      setLinkDialogOpen(false);
      const quantityG =
        unitNorm === 'g'
          ? typeof quantity === 'number' && quantity > 0
            ? quantity
            : 0
          : undefined;
      onConfirmed?.({
        ingredientIndex: ingredientIndex!,
        ref: {
          source: candidate.source,
          nevoCode: candidate.nevoCode,
          customFoodId: candidate.customFoodId,
          fdcId: candidate.fdcId,
          displayName: candidate.name_nl,
          quantity: typeof quantity === 'number' ? quantity : undefined,
          unit: unit ?? undefined,
          quantityG: quantityG ?? undefined,
        },
      });
    } else {
      setConfirmError(updateResult.error.message);
      showToast({
        type: 'error',
        title: 'Koppelen mislukt',
        description: updateResult.error.message,
      });
    }
  };

  const handleAiAdd = async () => {
    if (!canSearchSuggestions || aiLoading || isSaving) return;
    setAiError(null);
    setConfirmError(null);
    setAiLoading(true);
    onSavingChange?.(true);
    const result = await createCustomFoodFromIngredientAction({
      ingredientText: displayName.trim(),
    });
    if (!result.ok) {
      setAiLoading(false);
      onSavingChange?.(false);
      setAiError(result.error.message);
      showToast({
        type: 'error',
        title: 'AI toevoegen mislukt',
        description: result.error.message,
      });
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
      onSavingChange?.(false);
      setAiError(saveResult.error.message);
      showToast({
        type: 'error',
        title: 'Koppelen mislukt',
        description: saveResult.error.message,
      });
      return;
    }
    // Gebruik altijd hoeveelheid en eenheid uit het recept; nooit 100g als default (bij onbekende hoeveelheid 0).
    const updateResult = await updateRecipeIngredientMatchAction({
      mealId: mealId!,
      source: mealSource!,
      ingredientIndex: ingredientIndex!,
      match: { source: 'custom', customFoodId: result.data.customFoodId },
      displayName: result.data.nameNl || displayName.trim(),
      quantityG:
        unitNorm === 'g'
          ? typeof quantity === 'number' && quantity > 0
            ? quantity
            : 0
          : undefined,
      quantity: typeof quantity === 'number' ? quantity : undefined,
      unit: unit ?? undefined,
    });
    setAiLoading(false);
    onSavingChange?.(false);
    if (updateResult.ok) {
      setLinkDialogOpen(false);
      const quantityG =
        unitNorm === 'g'
          ? typeof quantity === 'number' && quantity > 0
            ? quantity
            : 0
          : undefined;
      onConfirmed?.({
        ingredientIndex: ingredientIndex!,
        ref: {
          source: 'custom',
          customFoodId: result.data.customFoodId,
          displayName: result.data.nameNl || displayName.trim(),
          quantity: typeof quantity === 'number' ? quantity : undefined,
          unit: unit ?? undefined,
          quantityG: quantityG ?? undefined,
        },
      });
    } else {
      setAiError(updateResult.error.message);
      showToast({
        type: 'error',
        title: 'Koppelen mislukt',
        description: updateResult.error.message,
      });
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
    if (!canSearchSuggestions || manualSaving || isSaving) return;
    const nameNl = manualForm.name_nl.trim();
    if (!nameNl) {
      setManualError('Naam (NL) is verplicht');
      return;
    }
    setManualSaving(true);
    setManualError(null);
    setConfirmError(null);
    onSavingChange?.(true);
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
      onSavingChange?.(false);
      setManualError(result.error.message);
      showToast({
        type: 'error',
        title: 'Toevoegen mislukt',
        description: result.error.message,
      });
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
      onSavingChange?.(false);
      setManualError(saveResult.error.message);
      showToast({
        type: 'error',
        title: 'Koppelen mislukt',
        description: saveResult.error.message,
      });
      return;
    }
    // Gebruik altijd hoeveelheid en eenheid uit het recept.
    const updateResult = await updateRecipeIngredientMatchAction({
      mealId: mealId!,
      source: mealSource!,
      ingredientIndex: ingredientIndex!,
      match: { source: 'custom', customFoodId: result.data.customFoodId },
      displayName: result.data.nameNl || nameNl,
      quantityG:
        unitNorm === 'g'
          ? typeof quantity === 'number' && quantity > 0
            ? quantity
            : 0
          : undefined,
      quantity: typeof quantity === 'number' ? quantity : undefined,
      unit: unit ?? undefined,
    });
    setManualSaving(false);
    onSavingChange?.(false);
    if (updateResult.ok) {
      setManualModalOpen(false);
      setLinkDialogOpen(false);
      setAiError(null);
      setConfirmError(null);
      const quantityG =
        unitNorm === 'g'
          ? typeof quantity === 'number' && quantity > 0
            ? quantity
            : 0
          : undefined;
      onConfirmed?.({
        ingredientIndex: ingredientIndex!,
        ref: {
          source: 'custom',
          customFoodId: result.data.customFoodId,
          displayName: result.data.nameNl || nameNl,
          quantity: typeof quantity === 'number' ? quantity : undefined,
          unit: unit ?? undefined,
          quantityG: quantityG ?? undefined,
        },
      });
    } else {
      setManualError(updateResult.error.message);
      showToast({
        type: 'error',
        title: 'Koppelen mislukt',
        description: updateResult.error.message,
      });
    }
  };

  // Toon geen "100g" als fallback wanneer het recept geen hoeveelheid opgeeft (bijv. "naar smaak").
  // 100g wordt intern gebruikt voor nutri-berekening per 100g, niet als recepthoeveelheid.
  const displayQuantity =
    quantityLabel ??
    (effectiveG > 0 && effectiveG !== 100 ? `${effectiveG}g` : undefined);

  const handleEditSave = async () => {
    if (!onEdit) return;
    setEditSaving(true);
    try {
      onEdit({
        name: editForm.name.trim(),
        quantity:
          editForm.quantity === '' || editForm.quantity == null
            ? null
            : Number(editForm.quantity) || editForm.quantity,
        unit: editForm.unit?.trim() || null,
        note: editForm.note?.trim() || null,
      });
      setEditDialogOpen(false);
      showToast({
        type: 'success',
        title: 'Ingrediënt bijgewerkt',
        description: 'De wijziging is opgeslagen.',
      });
    } finally {
      setEditSaving(false);
    }
  };

  const canShowEditActions = onEdit != null || onRemove != null;
  const canShowRowMenu = canShowEditActions || canSearchSuggestions;

  const openLinkDialog = () => {
    setShowRelinkUI(!!match);
    setLinkDialogOpen(true);
  };

  return (
    <div className="group flex items-center gap-1 w-full rounded-lg -mx-1 px-1 hover:shadow-sm dark:hover:shadow-black/20 transition-shadow">
      <div className="flex-1 min-w-0 rounded-lg px-2 py-1.5">
        <div className="text-sm">
          {!match && (
            <ExclamationTriangleIcon
              className="mr-1.5 inline-block h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400"
              aria-hidden
              title="Nog niet gematcht – kies Koppelen in het menu"
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
        </div>
        {note && (
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {note}
          </p>
        )}
      </div>

      <Dialog
        key={`link-${mealId ?? 'n'}-${mealSource ?? 'n'}-${ingredientIndex ?? 0}`}
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        size="md"
      >
        <DialogTitle>Koppelen: {displayName}</DialogTitle>
        <DialogBody>
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
                    disabled={suggestionsLoading || isSaving}
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
                        // Voorkom dat het Dropdown-menu Space/Enter pakt (Headless UI gebruikt die voor item-activatie)
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          loadSuggestionsWithQuery(manualSearchQuery);
                        }
                      }}
                      className="min-w-0"
                      disabled={suggestionsLoading || isSaving}
                    />
                    <Button
                      outline={true}
                      className="shrink-0"
                      disabled={
                        suggestionsLoading ||
                        isSaving ||
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
                  <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mt-4">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
                      Mogelijk bedoelde u
                    </p>
                    <ul className="max-h-52 overflow-y-auto">
                      {suggestions.map((c, i) => (
                        <li
                          key={i}
                          className="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
                        >
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => confirmSuggestion(c)}
                            className="flex flex-col items-stretch gap-1.5 w-full rounded py-3 px-4 text-left text-sm text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-50"
                          >
                            <span className="flex items-center gap-2 flex-wrap">
                              <span className="block truncate font-medium min-w-0">
                                {c.name_nl}
                              </span>
                              <Badge
                                color={
                                  c.sourceLabel === 'Nevo'
                                    ? 'blue'
                                    : c.sourceLabel === 'AI'
                                      ? 'purple'
                                      : c.sourceLabel === 'FNDDS'
                                        ? 'emerald'
                                        : 'zinc'
                                }
                                className="shrink-0 text-xs"
                              >
                                {c.sourceLabel}
                              </Badge>
                            </span>
                            {c.food_group_nl && (
                              <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                                {c.food_group_nl}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {confirmError && (
                  <p
                    className="text-xs text-red-600 dark:text-red-400 mt-2"
                    role="alert"
                  >
                    Koppelen mislukt: {confirmError}
                  </p>
                )}
                {!suggestionsLoading && suggestions.length === 0 && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {hasSearched
                      ? 'Geen suggesties gevonden.'
                      : 'Klik op "Zoek suggesties" om te zoeken in NEVO, eigen ingredienten en FNDDS.'}
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
                        disabled={isSaving || manualSaving}
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
                    disabled={aiLoading || isSaving}
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
        </DialogBody>
      </Dialog>

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
                    setManualForm((f) => ({
                      ...f,
                      protein_g: e.target.value,
                    }))
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
                    setManualForm((f) => ({
                      ...f,
                      carbs_g: e.target.value,
                    }))
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
                    setManualForm((f) => ({
                      ...f,
                      fiber_g: e.target.value,
                    }))
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
      {canShowRowMenu && (
        <div className="shrink-0 flex items-center">
          <Dropdown>
            <DropdownButton
              as="button"
              type="button"
              className="flex items-center justify-center w-8 h-8 rounded text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-700"
              title="Opties"
              aria-label={`Opties voor ${displayName}`}
            >
              <EllipsisVerticalIcon className="h-5 w-5" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end" className="min-w-[12rem]">
              {canSearchSuggestions && (
                <DropdownItem onClick={openLinkDialog}>
                  <LinkIcon className="h-4 w-4 mr-2" data-slot="icon" />
                  {match ? 'Opnieuw koppelen' : 'Koppelen'}
                </DropdownItem>
              )}
              {onEdit && (
                <DropdownItem
                  onClick={() => {
                    setEditDialogOpen(true);
                  }}
                >
                  <PencilIcon className="h-4 w-4 mr-2" data-slot="icon" />
                  Bewerken
                </DropdownItem>
              )}
              {onRemove && (
                <DropdownItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                  className="text-red-600 data-focus:bg-red-50 data-focus:text-red-700 dark:text-red-400 dark:data-focus:bg-red-950/30 dark:data-focus:text-red-300"
                >
                  <TrashIcon className="h-4 w-4 mr-2" data-slot="icon" />
                  Verwijderen
                </DropdownItem>
              )}
            </DropdownMenu>
          </Dropdown>
        </div>
      )}

      {/* Dialog: ingrediënt bewerken */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        size="md"
      >
        <DialogTitle>Ingrediënt bewerken</DialogTitle>
        <DialogBody>
          <div className="space-y-4">
            <Field>
              <Label>Naam</Label>
              <Input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Naam ingrediënt"
              />
            </Field>
            <Field>
              <Label>Hoeveelheid</Label>
              <Input
                value={
                  editForm.quantity == null ||
                  (typeof editForm.quantity === 'number' &&
                    !Number.isFinite(editForm.quantity))
                    ? ''
                    : String(editForm.quantity)
                }
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, quantity: e.target.value }))
                }
                placeholder="bijv. 2 of 1/2"
              />
            </Field>
            <Field>
              <Label>Eenheid</Label>
              <Input
                value={editForm.unit}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, unit: e.target.value }))
                }
                placeholder="bijv. g, el, tl"
              />
            </Field>
            <Field>
              <Label>Opmerking</Label>
              <Input
                value={editForm.note}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, note: e.target.value }))
                }
                placeholder="optioneel"
              />
            </Field>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setEditDialogOpen(false)}>
            Annuleren
          </Button>
          <Button
            onClick={handleEditSave}
            disabled={editSaving || !editForm.name.trim()}
          >
            {editSaving ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
