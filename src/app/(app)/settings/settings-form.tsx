'use client';

import { useState, useTransition } from 'react';
import { updatePassword } from '@/src/app/(auth)/actions';
import { setCurrentUserAsAdmin } from './actions/set-admin.action';
import { updateMealPlanSchedulePreferencesAction } from './actions/meal-plan-schedule-preferences.actions';
import type { MealPlanSchedulePrefs } from './actions/meal-plan-schedule-preferences.actions';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { FavoritesPickerDialog } from './components/FavoritesPickerDialog';
import { HouseholdAvoidRulesClient } from './components/HouseholdAvoidRulesClient';
import { HouseholdServingsClient } from './components/HouseholdServingsClient';
import { MealSlotStylePreferencesClient } from './components/MealSlotStylePreferencesClient';
import { Badge } from '@/components/catalyst/badge';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import { useTranslations } from 'next-intl';

const SHOPPING_DAY_LABELS: Record<number, string> = {
  0: 'Zondag',
  1: 'Maandag',
  2: 'Dinsdag',
  3: 'Woensdag',
  4: 'Donderdag',
  5: 'Vrijdag',
  6: 'Zaterdag',
};

const LEAD_TIME_OPTIONS = [
  { value: 24, label: '24 uur' },
  { value: 48, label: '48 uur' },
  { value: 72, label: '72 uur' },
] as const;

interface SchedulePreferencesSectionProps {
  schedulePrefs: MealPlanSchedulePrefs | null;
}

export function SchedulePreferencesSection({
  schedulePrefs,
}: SchedulePreferencesSectionProps) {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);
  const [schedulePending, setSchedulePending] = useState(false);
  const [shoppingDay, setShoppingDay] = useState(
    schedulePrefs?.shoppingDay ?? 5,
  );
  const [leadTimeHours, setLeadTimeHours] = useState<24 | 48 | 72>(
    schedulePrefs?.leadTimeHours ?? 48,
  );
  const [favoriteMealIds, setFavoriteMealIds] = useState<string[]>(
    schedulePrefs?.favoriteMealIds ?? [],
  );
  const [favoriteLabelsById, setFavoriteLabelsById] = useState<
    Record<string, { name: string; mealSlot: string }>
  >({});
  const [favoritesPickerOpen, setFavoritesPickerOpen] = useState(false);

  const removeFavorite = (id: string) => {
    setFavoriteMealIds((prev) => prev.filter((x) => x !== id));
    setFavoriteLabelsById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  async function handleScheduleSave() {
    setScheduleError(null);
    setScheduleSuccess(null);
    setSchedulePending(true);
    const result = await updateMealPlanSchedulePreferencesAction({
      shoppingDay,
      leadTimeHours,
      favoriteMealIds: favoriteMealIds.slice(0, 10),
    });
    setSchedulePending(false);
    if (result.ok) {
      setScheduleSuccess(t('scheduleSuccess'));
    } else {
      setScheduleError(result.error);
    }
  }

  return (
    <>
      {scheduleError && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <strong>{tCommon('error')}:</strong> {scheduleError}
        </div>
      )}
      {scheduleSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
          {scheduleSuccess}
        </div>
      )}
      <FieldGroup>
        <Field>
          <Label htmlFor="shopping_day">{t('shoppingDayLabel')}</Label>
          <Description>{t('shoppingDayDescription')}</Description>
          <Listbox
            value={shoppingDay}
            onChange={(val) => setShoppingDay(Number(val))}
            disabled={schedulePending}
            className="mt-2"
            aria-label={t('shoppingDayLabel')}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <ListboxOption key={d} value={d}>
                {SHOPPING_DAY_LABELS[d]}
              </ListboxOption>
            ))}
          </Listbox>
        </Field>
        <Field>
          <Label htmlFor="lead_time">{t('leadTimeLabel')}</Label>
          <Description>{t('leadTimeDescription')}</Description>
          <Listbox
            value={leadTimeHours}
            onChange={(val) => setLeadTimeHours(Number(val) as 24 | 48 | 72)}
            disabled={schedulePending}
            className="mt-2"
            aria-label={t('leadTimeLabel')}
          >
            {LEAD_TIME_OPTIONS.map((opt) => (
              <ListboxOption key={opt.value} value={opt.value}>
                {opt.label}
              </ListboxOption>
            ))}
          </Listbox>
        </Field>
        <Field>
          <Label htmlFor="favorite_meal_ids">{t('favoriteMealIdsLabel')}</Label>
          <Description>{t('favoriteMealIdsDescription')}</Description>
          <div className="mt-2 flex flex-col gap-2">
            <Button
              type="button"
              outline
              onClick={() => setFavoritesPickerOpen(true)}
              disabled={schedulePending}
            >
              {t('favoritesChooseButton')}
            </Button>
            {favoriteMealIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {favoriteMealIds.map((id) => {
                  const label = favoriteLabelsById[id];
                  const display =
                    label?.name && label?.mealSlot
                      ? `${label.name} · ${label.mealSlot}`
                      : `${id.slice(0, 8)}…`;
                  return (
                    <Badge key={id} className="flex items-center gap-1 text-xs">
                      {display}
                      <button
                        type="button"
                        onClick={() => removeFavorite(id)}
                        className="ml-1 rounded hover:bg-white/20 dark:hover:bg-white/10"
                        aria-label={t('favoritesRemove')}
                      >
                        ×
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
          <FavoritesPickerDialog
            open={favoritesPickerOpen}
            onClose={() => setFavoritesPickerOpen(false)}
            selectedIds={favoriteMealIds}
            onChange={(nextIds) => setFavoriteMealIds(nextIds.slice(0, 10))}
            onLabels={(labels) =>
              setFavoriteLabelsById((prev) => ({ ...prev, ...labels }))
            }
          />
        </Field>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleScheduleSave}
            disabled={schedulePending}
          >
            {schedulePending ? t('saving') : t('save')}
          </Button>
        </div>
      </FieldGroup>
    </>
  );
}

export function PasswordSection() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handlePasswordSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updatePassword(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <strong>{tCommon('error')}:</strong> {error}
        </div>
      )}
      <form action={handlePasswordSubmit}>
        <FieldGroup>
          <Field>
            <Label htmlFor="password">{t('newPasswordLabel')}</Label>
            <Description>{t('newPasswordDescription')}</Description>
            <Input
              id="password"
              type="password"
              name="password"
              required
              autoComplete="new-password"
              placeholder="••••••••"
              minLength={6}
            />
          </Field>
          <Field>
            <Label htmlFor="passwordConfirm">{t('confirmPasswordLabel')}</Label>
            <Input
              id="passwordConfirm"
              type="password"
              name="passwordConfirm"
              required
              autoComplete="new-password"
              placeholder="••••••••"
              minLength={6}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? t('updatePasswordPending') : t('updatePassword')}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </>
  );
}

export function HouseholdAvoidRulesSection({
  initialRules,
}: {
  initialRules?: import('./actions/household-avoid-rules.actions').HouseholdAvoidRuleRecord[];
}) {
  return <HouseholdAvoidRulesClient initialRules={initialRules} />;
}

export function HouseholdServingsSection({
  initialPrefs,
}: {
  initialPrefs?: import('./actions/household-servings.actions').HouseholdServingsPrefs;
}) {
  return <HouseholdServingsClient initialPrefs={initialPrefs} />;
}

export function MealSlotStylePreferencesSection({
  initialPrefs,
}: {
  initialPrefs?: import('./actions/meal-slot-style-preferences.actions').MealSlotStylePreferences;
}) {
  return <MealSlotStylePreferencesClient initialPrefs={initialPrefs} />;
}

export function AccountActionsSection() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <strong>{tCommon('error')}:</strong> {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
          {success}
        </div>
      )}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">
              {t('requestAdmin')}
            </p>
            <p className="mt-1 text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
              {t('requestAdminDescription')}
            </p>
          </div>
          <Button
            onClick={async () => {
              setError(null);
              setSuccess(null);
              startTransition(async () => {
                const result = await setCurrentUserAsAdmin();
                if (result.error) {
                  setError(result.error);
                } else if (result.success) {
                  setSuccess(t('adminSuccess'));
                }
              });
            }}
            disabled={isPending}
          >
            {isPending ? t('makeAdminPending') : t('makeAdmin')}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">
              {t('deleteAccount')}
            </p>
            <p className="mt-1 text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
              {t('deleteAccountDescription')}
            </p>
          </div>
          <Button color="red">{t('deleteAccount')}</Button>
        </div>
      </div>
    </>
  );
}
