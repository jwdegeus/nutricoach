'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/catalyst/button';
import { Select } from '@/components/catalyst/select';
import { Radio, RadioField, RadioGroup } from '@/components/catalyst/radio';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import { Input } from '@/components/catalyst/input';
import { Badge } from '@/components/catalyst/badge';
import { useTranslations } from 'next-intl';
import { useToast } from '@/src/components/app/ToastContext';
import { getDietTypes } from '@/src/app/(app)/onboarding/queries/diet-types.queries';
import type { DietType } from '@/src/app/(app)/onboarding/queries/diet-types.queries';
import type {
  DietStrictness,
  VarietyLevel,
} from '@/src/app/(app)/onboarding/onboarding.types';
import {
  getFamilyDietPrefsAction,
  updateFamilyDietPrefsAction,
  type FamilyDietPrefs,
} from '../actions/family-diet.actions';

const PREP_TIME_OPTIONS = [15, 30, 45, 60];

function applyPrefsToState(
  p: FamilyDietPrefs,
): Pick<
  FamilyDietCardState,
  | 'dietTypeId'
  | 'dietIsInflamed'
  | 'maxPrepMinutes'
  | 'servingsDefault'
  | 'varietyLevel'
  | 'strictness'
  | 'mealPreferences'
> {
  return {
    dietTypeId: p.dietTypeId ?? '',
    dietIsInflamed: p.dietIsInflamed,
    maxPrepMinutes: p.maxPrepMinutes,
    servingsDefault: p.servingsDefault,
    varietyLevel: p.varietyLevel,
    strictness: p.strictness,
    mealPreferences: {
      breakfast: p.mealPreferences?.breakfast ?? [],
      lunch: p.mealPreferences?.lunch ?? [],
      dinner: p.mealPreferences?.dinner ?? [],
    },
  };
}

type FamilyDietCardState = {
  dietTypeId: string;
  dietIsInflamed: boolean;
  maxPrepMinutes: number;
  servingsDefault: number;
  varietyLevel: VarietyLevel;
  strictness: DietStrictness;
  mealPreferences: { breakfast: string[]; lunch: string[]; dinner: string[] };
};

export function FamilyDietCard({
  hideHeading,
  initialDietTypes,
  initialPrefs,
}: {
  hideHeading?: boolean;
  initialDietTypes?: DietType[];
  initialPrefs?: FamilyDietPrefs | null;
} = {}) {
  const t = useTranslations('family');
  const { showToast } = useToast();
  const hasInitial = initialDietTypes != null && initialPrefs != null;

  const [dietTypes, setDietTypes] = useState<DietType[]>(
    initialDietTypes ?? [],
  );
  const [prefs, setPrefs] = useState<FamilyDietPrefs | null>(
    initialPrefs ?? null,
  );
  const [loading, setLoading] = useState(!hasInitial);
  const [saving, setSaving] = useState(false);
  const [dietTypeId, setDietTypeId] = useState<string>(
    initialPrefs?.dietTypeId ?? '',
  );
  const [dietIsInflamed, setDietIsInflamed] = useState(
    initialPrefs?.dietIsInflamed ?? false,
  );
  const [maxPrepMinutes, setMaxPrepMinutes] = useState(
    initialPrefs?.maxPrepMinutes ?? 30,
  );
  const [servingsDefault, setServingsDefault] = useState(
    initialPrefs?.servingsDefault ?? 2,
  );
  const [varietyLevel, setVarietyLevel] = useState<VarietyLevel>(
    initialPrefs?.varietyLevel ?? 'std',
  );
  const [strictness, setStrictness] = useState<DietStrictness>(
    initialPrefs?.strictness ?? 'flexible',
  );
  const [mealPreferences, setMealPreferences] = useState<{
    breakfast: string[];
    lunch: string[];
    dinner: string[];
  }>({
    breakfast: initialPrefs?.mealPreferences?.breakfast ?? [],
    lunch: initialPrefs?.mealPreferences?.lunch ?? [],
    dinner: initialPrefs?.mealPreferences?.dinner ?? [],
  });
  const [breakfastInput, setBreakfastInput] = useState('');
  const [lunchInput, setLunchInput] = useState('');
  const [dinnerInput, setDinnerInput] = useState('');

  useEffect(() => {
    if (hasInitial) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getDietTypes(), getFamilyDietPrefsAction()])
      .then(([types, result]) => {
        if (cancelled) return;
        setDietTypes(types);
        if (result.ok) {
          const p = result.prefs;
          setPrefs(p);
          const applied = applyPrefsToState(p);
          setDietTypeId(applied.dietTypeId);
          setDietIsInflamed(applied.dietIsInflamed);
          setMaxPrepMinutes(applied.maxPrepMinutes);
          setServingsDefault(applied.servingsDefault);
          setVarietyLevel(applied.varietyLevel);
          setStrictness(applied.strictness);
          setMealPreferences(applied.mealPreferences);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasInitial]);

  const addTag = (
    value: string,
    slot: 'breakfast' | 'lunch' | 'dinner',
    max = 20,
  ) => {
    const trimmed = value.trim();
    const current = mealPreferences[slot] || [];
    if (trimmed && !current.includes(trimmed) && current.length < max) {
      setMealPreferences({
        ...mealPreferences,
        [slot]: [...current, trimmed],
      });
    }
  };
  const removeTag = (tag: string, slot: 'breakfast' | 'lunch' | 'dinner') => {
    const current = mealPreferences[slot] || [];
    setMealPreferences({
      ...mealPreferences,
      [slot]: current.filter((x) => x !== tag),
    });
  };

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateFamilyDietPrefsAction({
        dietTypeId: dietTypeId || null,
        dietIsInflamed,
        maxPrepMinutes,
        servingsDefault,
        varietyLevel,
        strictness,
        mealPreferences: {
          breakfast: mealPreferences.breakfast,
          lunch: mealPreferences.lunch,
          dinner: mealPreferences.dinner,
        },
      });
      if (result.ok) {
        showToast({ type: 'success', title: t('familyDietSaved') });
        setPrefs(
          prefs
            ? {
                ...prefs,
                dietTypeId: dietTypeId || null,
                dietIsInflamed,
                maxPrepMinutes,
                servingsDefault,
                varietyWindowDays: prefs.varietyWindowDays,
                varietyLevel,
                strictness,
                mealPreferences,
              }
            : null,
        );
      } else {
        showToast({ type: 'error', title: result.error });
      }
    } finally {
      setSaving(false);
    }
  }

  const prevMeal = prefs?.mealPreferences;
  const mealPrefsEqual =
    prevMeal &&
    prevMeal.breakfast.length === mealPreferences.breakfast.length &&
    prevMeal.lunch.length === mealPreferences.lunch.length &&
    prevMeal.dinner.length === mealPreferences.dinner.length &&
    prevMeal.breakfast.every((v, i) => v === mealPreferences.breakfast[i]) &&
    prevMeal.lunch.every((v, i) => v === mealPreferences.lunch[i]) &&
    prevMeal.dinner.every((v, i) => v === mealPreferences.dinner[i]);
  const changed =
    prefs &&
    ((prefs.dietTypeId ?? '') !== dietTypeId ||
      prefs.dietIsInflamed !== dietIsInflamed ||
      prefs.maxPrepMinutes !== maxPrepMinutes ||
      prefs.servingsDefault !== servingsDefault ||
      prefs.varietyLevel !== varietyLevel ||
      prefs.strictness !== strictness ||
      !mealPrefsEqual);

  const content = (
    <FieldGroup>
      <Field>
        <Label htmlFor="family-diet-type">{t('familyDietTypeLabel')}</Label>
        <Description>{t('familyDietTypeDescription')}</Description>
        <Select
          id="family-diet-type"
          value={dietTypeId}
          onChange={(e) => setDietTypeId(e.target.value)}
          disabled={loading}
        >
          <option value="">
            {loading ? t('loading') : t('familyDietTypePlaceholder')}
          </option>
          {dietTypes.map((diet) => (
            <option key={diet.id} value={diet.id}>
              {diet.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={dietIsInflamed}
            onChange={(e) => setDietIsInflamed(e.target.checked)}
            disabled={loading || saving}
            className="rounded border-zinc-300 dark:border-zinc-600"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            {t('familyDietIsInflamed')}
          </span>
        </label>
        <Description>{t('familyDietIsInflamedDescription')}</Description>
      </Field>

      <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mt-4">
        <h3 className="text-base font-medium text-foreground mb-1">
          {t('familyPracticalHeading')}
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          {t('familyPracticalDescription')}
        </p>
        <Field>
          <Label htmlFor="family-max-prep">{t('familyMaxPrepLabel')}</Label>
          <Select
            id="family-max-prep"
            value={maxPrepMinutes.toString()}
            onChange={(e) => setMaxPrepMinutes(Number(e.target.value))}
            disabled={loading}
          >
            {PREP_TIME_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} {t('familyMinutes')}
              </option>
            ))}
          </Select>
          <Description>{t('familyMaxPrepHelp')}</Description>
        </Field>
        <Field>
          <Label htmlFor="family-servings">{t('familyServingsLabel')}</Label>
          <Select
            id="family-servings"
            value={servingsDefault.toString()}
            onChange={(e) => setServingsDefault(Number(e.target.value))}
            disabled={loading}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? t('familyPortion') : t('familyPortions')}
              </option>
            ))}
          </Select>
          <Description>{t('familyServingsHelp')}</Description>
        </Field>
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mt-4">
        <h3 className="text-base font-medium text-foreground mb-1">
          {t('familyGoalsHeading')}
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          {t('familyGoalsDescription')}
        </p>
        <Field>
          <Label>{t('familyVarietyLabel')}</Label>
          <RadioGroup
            value={varietyLevel}
            onChange={(v) => setVarietyLevel(v as VarietyLevel)}
            disabled={loading}
          >
            <RadioField>
              <Radio value="low" />
              <Label>
                <div>
                  <div className="font-medium">{t('familyVarietyLow')}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t('familyVarietyLowDesc')}
                  </div>
                </div>
              </Label>
            </RadioField>
            <RadioField>
              <Radio value="std" />
              <Label>
                <div>
                  <div className="font-medium">{t('familyVarietyStd')}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t('familyVarietyStdDesc')}
                  </div>
                </div>
              </Label>
            </RadioField>
            <RadioField>
              <Radio value="high" />
              <Label>
                <div>
                  <div className="font-medium">{t('familyVarietyHigh')}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t('familyVarietyHighDesc')}
                  </div>
                </div>
              </Label>
            </RadioField>
          </RadioGroup>
        </Field>
        <Field>
          <Label>{t('familyStrictnessLabel')}</Label>
          <RadioGroup
            value={strictness}
            onChange={(v) => setStrictness(v as DietStrictness)}
            disabled={loading}
          >
            <RadioField>
              <Radio value="flexible" />
              <Label>
                <div>
                  <div className="font-medium">
                    {t('familyStrictnessFlexible')}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t('familyStrictnessFlexibleDesc')}
                  </div>
                </div>
              </Label>
            </RadioField>
            <RadioField>
              <Radio value="strict" />
              <Label>
                <div>
                  <div className="font-medium">
                    {t('familyStrictnessStrict')}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t('familyStrictnessStrictDesc')}
                  </div>
                </div>
              </Label>
            </RadioField>
          </RadioGroup>
        </Field>
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mt-4">
        <h3 className="text-base font-medium text-foreground mb-1">
          {t('familyMealPreferencesHeading')}
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          {t('familyMealPreferencesDescription')}
        </p>
        <Field>
          <Label>{t('familyMealBreakfast')}</Label>
          <Input
            value={breakfastInput}
            onChange={(e) => setBreakfastInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(breakfastInput, 'breakfast');
                setBreakfastInput('');
              }
            }}
            placeholder={t('familyMealTypeAndEnter')}
            disabled={loading}
          />
          {mealPreferences.breakfast.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {mealPreferences.breakfast.map((tag) => (
                <Badge key={tag} color="blue" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag, 'breakfast')}
                    aria-label={t('familyMealRemoveTag', { tag })}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </Field>
        <Field>
          <Label>{t('familyMealLunch')}</Label>
          <Input
            value={lunchInput}
            onChange={(e) => setLunchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(lunchInput, 'lunch');
                setLunchInput('');
              }
            }}
            placeholder={t('familyMealTypeAndEnter')}
            disabled={loading}
          />
          {mealPreferences.lunch.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {mealPreferences.lunch.map((tag) => (
                <Badge key={tag} color="blue" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag, 'lunch')}
                    aria-label={t('familyMealRemoveTag', { tag })}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </Field>
        <Field>
          <Label>{t('familyMealDinner')}</Label>
          <Input
            value={dinnerInput}
            onChange={(e) => setDinnerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(dinnerInput, 'dinner');
                setDinnerInput('');
              }
            }}
            placeholder={t('familyMealTypeAndEnter')}
            disabled={loading}
          />
          {mealPreferences.dinner.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {mealPreferences.dinner.map((tag) => (
                <Badge key={tag} color="blue" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag, 'dinner')}
                    aria-label={t('familyMealRemoveTag', { tag })}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </Field>
      </div>

      <div className="pt-2">
        <Button onClick={handleSave} disabled={saving || !changed}>
          {saving ? t('saving') : t('familyDietSave')}
        </Button>
      </div>
    </FieldGroup>
  );

  if (hideHeading) {
    return <div id="family-diet">{content}</div>;
  }
  return (
    <section
      id="family-diet"
      className="rounded-2xl bg-zinc-100 px-6 py-6 dark:bg-white/10 mx-auto max-w-2xl"
      aria-labelledby="family-diet-heading"
    >
      <h2
        id="family-diet-heading"
        className="text-lg font-semibold text-foreground mb-1"
      >
        {t('familyDietHeading')}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t('familyDietDescription')}
      </p>
      {content}
    </section>
  );
}
