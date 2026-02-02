'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { Field, Label } from '@/components/catalyst/fieldset';
import { Text } from '@/components/catalyst/text';
import { XMarkIcon } from '@heroicons/react/16/solid';
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid';

/** Meal slot values for classification (legacy / resolve from catalog key). */
export type MealSlotValue =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snack'
  | 'other';

const MEAL_SLOT_KEYS: MealSlotValue[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'other',
];
function isValidMealSlotKey(k: string): k is MealSlotValue {
  return (MEAL_SLOT_KEYS as readonly string[]).includes(k);
}

/** Classification draft: local state for the Classificeren modal (no DB in this step). */
export type RecipeClassificationDraft = {
  mealSlot: MealSlotValue;
  /** Display label when custom option (e.g. Bijgerecht); overrides formatMealSlot(mealSlot). */
  mealSlotLabel?: string | null;
  mealSlotOptionId: string | null;
  totalMinutes: number | null;
  servings: number | null;
  sourceName: string;
  sourceUrl: string;
  recipeBookOptionId: string | null;
  cuisineOptionId: string | null;
  proteinTypeOptionId: string | null;
  tags: string[];
};

export type CatalogOptionItem = {
  id: string;
  label: string;
  isActive?: boolean;
  /** Option key (e.g. breakfast, lunch); used to sync mealSlot when Soort changes. */
  key?: string | null;
};

type RecipeClassificationDialogProps = {
  value: RecipeClassificationDraft;
  onChange: (next: RecipeClassificationDraft) => void;
  open: boolean;
  onClose: () => void;
  /** Called when user clicks Opslaan; caller performs save and passes back error/saving state. */
  onSave?: (draft: RecipeClassificationDraft) => void;
  /** Save error message from parent (e.g. after saveMealClassificationAction failed). */
  errorMessage?: string | null;
  /** Whether save is in progress (parent-controlled). */
  isSaving?: boolean;
  /** Catalog options for Soort (meal_slot). */
  mealSlotOptions?: CatalogOptionItem[];
  /** Catalog options for Keuken (cuisine). */
  cuisineOptions?: CatalogOptionItem[];
  /** Catalog options for Proteïne-type. */
  proteinTypeOptions?: CatalogOptionItem[];
  /** Catalog options for Receptenboek. */
  recipeBookOptions?: CatalogOptionItem[];
  /** Options still loading: show disabled selects + "Laden…". */
  optionsLoading?: boolean;
  /** Create user cuisine option; returns { id, label } or { error }. */
  onCreateCuisineOption?: (
    label: string,
  ) => Promise<{ id: string; label: string } | { error: string }>;
  /** Create user protein type option; returns { id, label } or { error }. */
  onCreateProteinTypeOption?: (
    label: string,
  ) => Promise<{ id: string; label: string } | { error: string }>;
  /** Create user recipe book option; returns { id, label } or { error }. */
  onCreateRecipeBookOption?: (
    label: string,
  ) => Promise<{ id: string; label: string } | { error: string }>;
};

export function RecipeClassificationDialog({
  value,
  onChange,
  open,
  onClose,
  onSave,
  errorMessage = null,
  isSaving = false,
  mealSlotOptions = [],
  cuisineOptions = [],
  proteinTypeOptions = [],
  recipeBookOptions = [],
  optionsLoading = false,
  onCreateCuisineOption,
  onCreateProteinTypeOption,
  onCreateRecipeBookOption,
}: RecipeClassificationDialogProps) {
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [cuisineAddInput, setCuisineAddInput] = useState('');
  const [cuisineAddSaving, setCuisineAddSaving] = useState(false);
  const [cuisineAddError, setCuisineAddError] = useState<string | null>(null);
  const [proteinAddInput, setProteinAddInput] = useState('');
  const [proteinAddSaving, setProteinAddSaving] = useState(false);
  const [proteinAddError, setProteinAddError] = useState<string | null>(null);
  const [recipeBookAddInput, setRecipeBookAddInput] = useState('');
  const [recipeBookAddSaving, setRecipeBookAddSaving] = useState(false);
  const [recipeBookAddError, setRecipeBookAddError] = useState<string | null>(
    null,
  );

  const update = useCallback(
    (patch: Partial<RecipeClassificationDraft>) => {
      onChange({ ...value, ...patch });
    },
    [value, onChange],
  );

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (!trimmed || value.tags.includes(trimmed)) {
      setTagInput('');
      return;
    }
    update({ tags: [...value.tags, trimmed] });
    setTagInput('');
    tagInputRef.current?.focus();
  }, [tagInput, value.tags, update]);

  const removeTag = useCallback(
    (index: number) => {
      update({
        tags: value.tags.filter((_, i) => i !== index),
      });
    },
    [value.tags, update],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTag();
      }
    },
    [addTag],
  );

  const handleSave = useCallback(() => {
    onSave?.(value);
  }, [onSave, value]);

  const handleAddCuisine = useCallback(async () => {
    const label = cuisineAddInput.trim();
    if (!label || !onCreateCuisineOption) return;
    setCuisineAddError(null);
    setCuisineAddSaving(true);
    try {
      const result = await onCreateCuisineOption(label);
      if ('error' in result) {
        setCuisineAddError(result.error);
      } else {
        update({ cuisineOptionId: result.id });
        setCuisineAddInput('');
      }
    } finally {
      setCuisineAddSaving(false);
    }
  }, [cuisineAddInput, onCreateCuisineOption, update]);

  const handleAddProteinType = useCallback(async () => {
    const label = proteinAddInput.trim();
    if (!label || !onCreateProteinTypeOption) return;
    setProteinAddError(null);
    setProteinAddSaving(true);
    try {
      const result = await onCreateProteinTypeOption(label);
      if ('error' in result) {
        setProteinAddError(result.error);
      } else {
        update({ proteinTypeOptionId: result.id });
        setProteinAddInput('');
      }
    } finally {
      setProteinAddSaving(false);
    }
  }, [proteinAddInput, onCreateProteinTypeOption, update]);

  const handleAddRecipeBook = useCallback(async () => {
    const label = recipeBookAddInput.trim();
    if (!label || !onCreateRecipeBookOption) return;
    setRecipeBookAddError(null);
    setRecipeBookAddSaving(true);
    try {
      const result = await onCreateRecipeBookOption(label);
      if ('error' in result) {
        setRecipeBookAddError(result.error);
      } else {
        update({ recipeBookOptionId: result.id });
        setRecipeBookAddInput('');
      }
    } finally {
      setRecipeBookAddSaving(false);
    }
  }, [recipeBookAddInput, onCreateRecipeBookOption, update]);

  return (
    <Dialog open={open} onClose={onClose} size="xl">
      <DialogTitle>Classificeren</DialogTitle>
      <DialogDescription>
        Beheer soort, tags, bron en receptenboek voor dit recept. Later kun je
        hierop filteren en navigeren.
      </DialogDescription>
      <DialogBody>
        <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-1">
          {/* 1) Soort (meal_slot from catalog) — Catalyst Listbox (non-native) */}
          <Field>
            <Label>Soort</Label>
            <Listbox
              value={value.mealSlotOptionId ?? ''}
              onChange={(v) => {
                const id = v === '' ? null : (v as string);
                const opt = id
                  ? mealSlotOptions.find((o) => o.id === id)
                  : null;
                const slotKey =
                  opt?.key && isValidMealSlotKey(opt.key)
                    ? opt.key
                    : value.mealSlot;
                update({
                  mealSlotOptionId: id,
                  mealSlot: id && slotKey ? slotKey : value.mealSlot,
                });
              }}
              disabled={isSaving || optionsLoading}
              placeholder="Geen gekozen"
              aria-label="Soort maaltijd"
            >
              <ListboxOption value="">Geen gekozen</ListboxOption>
              {mealSlotOptions.map((opt) => (
                <ListboxOption key={opt.id} value={opt.id}>
                  {opt.isActive !== false
                    ? opt.label
                    : `${opt.label} (inactief)`}
                </ListboxOption>
              ))}
            </Listbox>
            {optionsLoading && mealSlotOptions.length === 0 && (
              <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Laden…
              </Text>
            )}
          </Field>

          {/* 2) Bereidingstijd */}
          <Field>
            <Label>Bereidingstijd (minuten)</Label>
            <Input
              type="number"
              min={0}
              placeholder="bijv. 30"
              value={value.totalMinutes ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                update({
                  totalMinutes: v === '' ? null : parseInt(v, 10) || null,
                });
              }}
              disabled={isSaving}
            />
          </Field>

          {/* 3) Porties */}
          <Field>
            <Label>Porties</Label>
            <Input
              type="number"
              min={1}
              placeholder="bijv. 4"
              value={value.servings ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                update({
                  servings: v === '' ? null : parseInt(v, 10) || null,
                });
              }}
              disabled={isSaving}
            />
          </Field>

          {/* 4) Keuken (cuisine) — Catalyst Listbox (non-native) */}
          <Field>
            <Label>Keuken</Label>
            <Listbox
              value={value.cuisineOptionId ?? ''}
              onChange={(v) =>
                update({
                  cuisineOptionId: v === '' ? null : (v as string),
                })
              }
              disabled={isSaving || optionsLoading}
              placeholder="Geen gekozen"
              aria-label="Keuken"
            >
              <ListboxOption value="">Geen gekozen</ListboxOption>
              {cuisineOptions.map((opt) => (
                <ListboxOption key={opt.id} value={opt.id}>
                  {opt.isActive !== false
                    ? opt.label
                    : `${opt.label} (inactief)`}
                </ListboxOption>
              ))}
            </Listbox>
            {optionsLoading && (
              <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Laden…
              </Text>
            )}
            {onCreateCuisineOption && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Eigen keuken toevoegen"
                    value={cuisineAddInput}
                    onChange={(e) => {
                      setCuisineAddInput(e.target.value);
                      setCuisineAddError(null);
                    }}
                    disabled={isSaving || cuisineAddSaving}
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      (e.preventDefault(), handleAddCuisine())
                    }
                  />
                  <Button
                    type="button"
                    outline
                    onClick={handleAddCuisine}
                    disabled={
                      isSaving || cuisineAddSaving || !cuisineAddInput.trim()
                    }
                  >
                    {cuisineAddSaving ? '…' : 'Toevoegen'}
                  </Button>
                </div>
                {cuisineAddError && (
                  <div
                    className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                    role="alert"
                  >
                    {cuisineAddError}
                  </div>
                )}
              </div>
            )}
          </Field>

          {/* 5) Proteïne-type — Catalyst Listbox (non-native) */}
          <Field>
            <Label>Proteïne-type</Label>
            <Listbox
              value={value.proteinTypeOptionId ?? ''}
              onChange={(v) =>
                update({
                  proteinTypeOptionId: v === '' ? null : (v as string),
                })
              }
              disabled={isSaving || optionsLoading}
              placeholder="Geen gekozen"
              aria-label="Proteïne-type"
            >
              <ListboxOption value="">Geen gekozen</ListboxOption>
              {proteinTypeOptions.map((opt) => (
                <ListboxOption key={opt.id} value={opt.id}>
                  {opt.isActive !== false
                    ? opt.label
                    : `${opt.label} (inactief)`}
                </ListboxOption>
              ))}
            </Listbox>
            {optionsLoading && (
              <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Laden…
              </Text>
            )}
            {onCreateProteinTypeOption && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Eigen type toevoegen"
                    value={proteinAddInput}
                    onChange={(e) => {
                      setProteinAddInput(e.target.value);
                      setProteinAddError(null);
                    }}
                    disabled={isSaving || proteinAddSaving}
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      (e.preventDefault(), handleAddProteinType())
                    }
                  />
                  <Button
                    type="button"
                    outline
                    onClick={handleAddProteinType}
                    disabled={
                      isSaving || proteinAddSaving || !proteinAddInput.trim()
                    }
                  >
                    {proteinAddSaving ? '…' : 'Toevoegen'}
                  </Button>
                </div>
                {proteinAddError && (
                  <div
                    className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                    role="alert"
                  >
                    {proteinAddError}
                  </div>
                )}
              </div>
            )}
          </Field>

          {/* 7) Bron */}
          <div className="space-y-4">
            <span className="text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">
              Bron
            </span>
            <div className="space-y-3">
              <Field>
                <Label className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
                  Naam
                </Label>
                <Input
                  type="text"
                  placeholder="bijv. Allerhande, Oma's kookboek"
                  value={value.sourceName}
                  onChange={(e) => update({ sourceName: e.target.value })}
                  disabled={isSaving}
                />
              </Field>
              <Field>
                <Label className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
                  URL
                </Label>
                <Input
                  type="url"
                  placeholder="https://..."
                  value={value.sourceUrl}
                  onChange={(e) => update({ sourceUrl: e.target.value })}
                  disabled={isSaving}
                />
              </Field>
            </div>
          </div>

          {/* 6) Receptenboek — Catalyst Listbox (from catalog_options) */}
          <Field>
            <Label>Receptenboek</Label>
            <Listbox
              value={value.recipeBookOptionId ?? ''}
              onChange={(v) =>
                update({
                  recipeBookOptionId: v === '' ? null : (v as string),
                })
              }
              disabled={isSaving || optionsLoading}
              placeholder="Niet ingesteld"
              aria-label="Receptenboek"
            >
              <ListboxOption value="">Niet ingesteld</ListboxOption>
              {recipeBookOptions.map((opt) => (
                <ListboxOption key={opt.id} value={opt.id}>
                  {opt.isActive !== false
                    ? opt.label
                    : `${opt.label} (inactief)`}
                </ListboxOption>
              ))}
            </Listbox>
            {optionsLoading && (
              <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Laden…
              </Text>
            )}
            {onCreateRecipeBookOption && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Eigen receptenboek toevoegen"
                    value={recipeBookAddInput}
                    onChange={(e) => {
                      setRecipeBookAddInput(e.target.value);
                      setRecipeBookAddError(null);
                    }}
                    disabled={isSaving || recipeBookAddSaving}
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      (e.preventDefault(), handleAddRecipeBook())
                    }
                  />
                  <Button
                    type="button"
                    outline
                    onClick={handleAddRecipeBook}
                    disabled={
                      isSaving ||
                      recipeBookAddSaving ||
                      !recipeBookAddInput.trim()
                    }
                  >
                    {recipeBookAddSaving ? '…' : 'Toevoegen'}
                  </Button>
                </div>
                {recipeBookAddError && (
                  <div
                    className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                    role="alert"
                  >
                    {recipeBookAddError}
                  </div>
                )}
              </div>
            )}
          </Field>

          {/* 9) Tags */}
          <Field>
            <Label>Tags</Label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  ref={tagInputRef}
                  type="text"
                  placeholder="Tag toevoegen (Enter)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isSaving}
                />
                <Button
                  type="button"
                  outline
                  onClick={addTag}
                  disabled={isSaving}
                >
                  Toevoegen
                </Button>
              </div>
              {value.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {value.tags.map((tag, idx) => (
                    <span
                      key={`${tag}-${idx}`}
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-sm text-zinc-800 dark:text-zinc-200"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(idx)}
                        className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        aria-label={`Tag "${tag}" verwijderen`}
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {/* Error callout (from parent save error) */}
          {errorMessage && (
            <div
              className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <Text className="font-semibold text-red-900 dark:text-red-100">
                    Opslaan mislukt
                  </Text>
                  <Text className="mt-1 text-sm text-red-700 dark:text-red-300">
                    {errorMessage}
                  </Text>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={isSaving}>
          Annuleren
        </Button>
        <Button color="primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Opslaan…' : 'Opslaan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
