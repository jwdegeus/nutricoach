'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/catalyst/button';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { Checkbox, CheckboxField } from '@/components/catalyst/checkbox';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import {
  getMealSlotStylePreferencesAction,
  updateMealSlotStylePreferencesAction,
} from '../actions/meal-slot-style-preferences.actions';
import type { MealSlotStylePreferences } from '../actions/meal-slot-style-preferences.actions';

const BREAKFAST_VALUES = ['any', 'shake', 'eggs', 'yogurt', 'oatmeal'] as const;
const LUNCH_VALUES = ['any', 'salad', 'smoothie', 'leftovers', 'soup'] as const;
const DINNER_VALUES = ['any', 'quick', 'family', 'high_protein'] as const;
const WEEKEND_DINNER_VALUES = [
  'any',
  'quick',
  'family',
  'high_protein',
  'special',
] as const;

type BreakfastStyle = (typeof BREAKFAST_VALUES)[number] | null;
type LunchStyle = (typeof LUNCH_VALUES)[number] | null;
type DinnerStyle = (typeof DINNER_VALUES)[number] | null;
type WeekendDinnerStyle = (typeof WEEKEND_DINNER_VALUES)[number] | null;

/** 0 = Sunday, 6 = Saturday */
const SATURDAY = 6;
const SUNDAY = 0;

/** i18n key per option value (shared 'any', rest per-slot where needed) */
const BREAKFAST_OPTION_KEYS: Record<string, string> = {
  any: 'mealSlotStyleOptAny',
  shake: 'mealSlotStyleOptShake',
  eggs: 'mealSlotStyleOptEggs',
  yogurt: 'mealSlotStyleOptYogurt',
  oatmeal: 'mealSlotStyleOptOatmeal',
};
const LUNCH_OPTION_KEYS: Record<string, string> = {
  any: 'mealSlotStyleOptAny',
  salad: 'mealSlotStyleOptSalad',
  smoothie: 'mealSlotStyleOptSmoothie',
  leftovers: 'mealSlotStyleOptLeftovers',
  soup: 'mealSlotStyleOptSoup',
};
const DINNER_OPTION_KEYS: Record<string, string> = {
  any: 'mealSlotStyleOptAny',
  quick: 'mealSlotStyleOptQuick',
  family: 'mealSlotStyleOptFamily',
  high_protein: 'mealSlotStyleOptHighProtein',
};
const WEEKEND_DINNER_OPTION_KEYS: Record<string, string> = {
  any: 'mealSlotStyleOptAny',
  quick: 'mealSlotStyleOptQuick',
  family: 'mealSlotStyleOptFamily',
  high_protein: 'mealSlotStyleOptHighProtein',
  special: 'weekendDinnerOptSpecial',
};

export function MealSlotStylePreferencesClient({
  initialPrefs,
}: {
  initialPrefs?: MealSlotStylePreferences;
} = {}) {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const defaultWeekend = useMemo(() => [6, 0], []);
  const initialWeekend =
    initialPrefs?.weekendDays && initialPrefs.weekendDays.length >= 1
      ? [...initialPrefs.weekendDays].sort((a, b) => a - b)
      : defaultWeekend;

  const [loading, setLoading] = useState(!initialPrefs);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);

  const [preferredBreakfastStyle, setPreferredBreakfastStyle] =
    useState<BreakfastStyle>(
      (initialPrefs?.preferredBreakfastStyle ?? null) as BreakfastStyle,
    );
  const [preferredLunchStyle, setPreferredLunchStyle] = useState<LunchStyle>(
    (initialPrefs?.preferredLunchStyle ?? null) as LunchStyle,
  );
  const [preferredDinnerStyle, setPreferredDinnerStyle] = useState<DinnerStyle>(
    (initialPrefs?.preferredDinnerStyle ?? null) as DinnerStyle,
  );
  const [preferredWeekendDinnerStyle, setPreferredWeekendDinnerStyle] =
    useState<WeekendDinnerStyle>(
      (initialPrefs?.preferredWeekendDinnerStyle ?? null) as WeekendDinnerStyle,
    );
  const [weekendDays, setWeekendDays] = useState<number[]>(initialWeekend);
  const [weekendDaysError, setWeekendDaysError] = useState<string | null>(null);

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getMealSlotStylePreferencesAction();
    setLoading(false);
    if (result.ok) {
      setPreferredBreakfastStyle(
        result.data.preferredBreakfastStyle as BreakfastStyle,
      );
      setPreferredLunchStyle(result.data.preferredLunchStyle as LunchStyle);
      setPreferredDinnerStyle(result.data.preferredDinnerStyle as DinnerStyle);
      setPreferredWeekendDinnerStyle(
        result.data.preferredWeekendDinnerStyle as WeekendDinnerStyle,
      );
      setWeekendDays(
        Array.isArray(result.data.weekendDays) &&
          result.data.weekendDays.length >= 1
          ? [...result.data.weekendDays].sort((a, b) => a - b)
          : defaultWeekend,
      );
      setWeekendDaysError(null);
    } else {
      setError(result.error.message);
    }
  }, [defaultWeekend]);

  useEffect(() => {
    if (initialPrefs != null) return;
    queueMicrotask(() => loadPrefs());
  }, [initialPrefs, loadPrefs]);

  const weekendDaysValid = weekendDays.length >= 1;
  const toggleWeekendDay = (day: number) => {
    setWeekendDaysError(null);
    if (weekendDays.includes(day)) {
      const next = weekendDays.filter((d) => d !== day);
      if (next.length === 0) {
        setWeekendDaysError(t('validationMinOneDay'));
        return;
      }
      setWeekendDays(next);
    } else {
      setWeekendDays([...weekendDays, day].sort((a, b) => a - b).slice(0, 2));
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setWeekendDaysError(null);
    if (!weekendDaysValid || weekendDays.length < 1) {
      setWeekendDaysError(t('validationMinOneDay'));
      return;
    }
    setSavePending(true);
    const result = await updateMealSlotStylePreferencesAction({
      preferredBreakfastStyle: preferredBreakfastStyle ?? null,
      preferredLunchStyle: preferredLunchStyle ?? null,
      preferredDinnerStyle: preferredDinnerStyle ?? null,
      preferredWeekendDinnerStyle: preferredWeekendDinnerStyle ?? null,
      weekendDays:
        weekendDays.length >= 1
          ? [...weekendDays].sort((a, b) => a - b)
          : [0, 6],
    });
    setSavePending(false);
    if (result.ok) {
      setPreferredBreakfastStyle(
        result.data.preferredBreakfastStyle as BreakfastStyle,
      );
      setPreferredLunchStyle(result.data.preferredLunchStyle as LunchStyle);
      setPreferredDinnerStyle(result.data.preferredDinnerStyle as DinnerStyle);
      setPreferredWeekendDinnerStyle(
        result.data.preferredWeekendDinnerStyle as WeekendDinnerStyle,
      );
      setWeekendDays(
        Array.isArray(result.data.weekendDays)
          ? [...result.data.weekendDays]
          : [6, 0],
      );
      setSuccess(t('mealSlotStyleSuccess'));
    } else {
      setError(result.error.message);
    }
  };

  const toValue = (v: string | null) => (v == null || v === '' ? '' : v);

  if (loading) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {t('mealSlotStyleLoading')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <strong>{tCommon('error')}:</strong> {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
          {success}
        </div>
      )}
      <FieldGroup>
        <Field>
          <Label htmlFor="meal_slot_style_breakfast">
            {t('mealSlotStyleBreakfastLabel')}
          </Label>
          <Description>{t('mealSlotStyleBreakfastDescription')}</Description>
          <Listbox
            value={toValue(preferredBreakfastStyle)}
            onChange={(val) =>
              setPreferredBreakfastStyle(
                val === '' ? null : (val as BreakfastStyle),
              )
            }
            disabled={savePending}
            className="mt-2"
            aria-label={t('mealSlotStyleBreakfastLabel')}
          >
            <ListboxOption value="">
              {t('mealSlotStyleNoPreference')}
            </ListboxOption>
            {BREAKFAST_VALUES.map((val) => (
              <ListboxOption key={val} value={val}>
                {t(BREAKFAST_OPTION_KEYS[val] as 'mealSlotStyleOptAny')}
              </ListboxOption>
            ))}
          </Listbox>
        </Field>
        <Field>
          <Label htmlFor="meal_slot_style_lunch">
            {t('mealSlotStyleLunchLabel')}
          </Label>
          <Description>{t('mealSlotStyleLunchDescription')}</Description>
          <Listbox
            value={toValue(preferredLunchStyle)}
            onChange={(val) =>
              setPreferredLunchStyle(val === '' ? null : (val as LunchStyle))
            }
            disabled={savePending}
            className="mt-2"
            aria-label={t('mealSlotStyleLunchLabel')}
          >
            <ListboxOption value="">
              {t('mealSlotStyleNoPreference')}
            </ListboxOption>
            {LUNCH_VALUES.map((val) => (
              <ListboxOption key={val} value={val}>
                {t(LUNCH_OPTION_KEYS[val] as 'mealSlotStyleOptAny')}
              </ListboxOption>
            ))}
          </Listbox>
        </Field>
        <Field>
          <Label htmlFor="meal_slot_style_dinner">
            {t('mealSlotStyleDinnerLabel')}
          </Label>
          <Description>{t('mealSlotStyleDinnerDescription')}</Description>
          <Listbox
            value={toValue(preferredDinnerStyle)}
            onChange={(val) =>
              setPreferredDinnerStyle(val === '' ? null : (val as DinnerStyle))
            }
            disabled={savePending}
            className="mt-2"
            aria-label={t('mealSlotStyleDinnerLabel')}
          >
            <ListboxOption value="">
              {t('mealSlotStyleNoPreference')}
            </ListboxOption>
            {DINNER_VALUES.map((val) => (
              <ListboxOption key={val} value={val}>
                {t(DINNER_OPTION_KEYS[val] as 'mealSlotStyleOptAny')}
              </ListboxOption>
            ))}
          </Listbox>
        </Field>
        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <span className="text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">
            {t('weekendDinnerHeading')}
          </span>
          <p className="mt-0.5 text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
            {t('weekendDinnerDescription')}
          </p>
          <Field className="mt-3">
            <Label htmlFor="meal_slot_style_weekend_dinner">
              {t('weekendDinnerStyleLabel')}
            </Label>
            <Listbox
              value={toValue(preferredWeekendDinnerStyle)}
              onChange={(val) =>
                setPreferredWeekendDinnerStyle(
                  val === '' ? null : (val as WeekendDinnerStyle),
                )
              }
              disabled={savePending}
              className="mt-2"
              aria-label={t('weekendDinnerStyleLabel')}
            >
              <ListboxOption value="">
                {t('mealSlotStyleNoPreference')}
              </ListboxOption>
              {WEEKEND_DINNER_VALUES.map((val) => (
                <ListboxOption key={val} value={val}>
                  {t(
                    WEEKEND_DINNER_OPTION_KEYS[
                      val
                    ] as 'weekendDinnerOptSpecial',
                  )}
                </ListboxOption>
              ))}
            </Listbox>
          </Field>
          <Field className="mt-3">
            <Label>{t('weekendDaysLabel')}</Label>
            <div className="mt-2 flex flex-wrap gap-4">
              <CheckboxField>
                <Checkbox
                  checked={weekendDays.includes(SATURDAY)}
                  onChange={(_value) => toggleWeekendDay(SATURDAY)}
                  disabled={savePending}
                />
                <Label>{t('saturday')}</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox
                  checked={weekendDays.includes(SUNDAY)}
                  onChange={(_value) => toggleWeekendDay(SUNDAY)}
                  disabled={savePending}
                />
                <Label>{t('sunday')}</Label>
              </CheckboxField>
            </div>
            {weekendDaysError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {weekendDaysError}
              </p>
            )}
          </Field>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={savePending || !weekendDaysValid}
          >
            {savePending ? t('saving') : t('save')}
          </Button>
        </div>
      </FieldGroup>
    </div>
  );
}
