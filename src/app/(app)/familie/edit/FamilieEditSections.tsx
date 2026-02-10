'use client';

import { useTranslations } from 'next-intl';
import type { MealPlanSchedulePrefs } from '@/src/app/(app)/settings/actions/meal-plan-schedule-preferences.actions';
import type { HouseholdAvoidRuleRecord } from '@/src/app/(app)/settings/actions/household-avoid-rules.actions';
import type { HouseholdServingsPrefs } from '@/src/app/(app)/settings/actions/household-servings.actions';
import type { MealSlotStylePreferences } from '@/src/app/(app)/settings/actions/meal-slot-style-preferences.actions';
import {
  SchedulePreferencesSection,
  HouseholdAvoidRulesSection,
  HouseholdServingsSection,
  MealSlotStylePreferencesSection,
} from '@/src/app/(app)/settings/settings-form';

interface FamilieEditSectionsProps {
  schedulePrefs: MealPlanSchedulePrefs | null;
  initialAvoidRules?: HouseholdAvoidRuleRecord[] | null;
  initialHouseholdServings?: HouseholdServingsPrefs | null;
  initialMealSlotStylePrefs?: MealSlotStylePreferences | null;
}

export function FamilieEditSections({
  schedulePrefs,
  initialAvoidRules,
  initialHouseholdServings,
  initialMealSlotStylePrefs,
}: FamilieEditSectionsProps) {
  const t = useTranslations('settings');

  return (
    <>
      <section
        id="schedule"
        className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
        aria-labelledby="schedule-heading"
      >
        <div>
          <h2
            id="schedule-heading"
            className="text-base/7 font-semibold text-zinc-950 dark:text-white"
          >
            {t('scheduleHeading')}
          </h2>
          <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
            {t('scheduleDescription')}
          </p>
        </div>
        <div className="md:col-span-2">
          <SchedulePreferencesSection schedulePrefs={schedulePrefs} />
        </div>
      </section>

      <section
        id="household-avoid"
        className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
        aria-labelledby="household-avoid-heading"
      >
        <div>
          <h2
            id="household-avoid-heading"
            className="text-base/7 font-semibold text-zinc-950 dark:text-white"
          >
            {t('householdAvoidHeading')}
          </h2>
          <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
            {t('householdAvoidDescription')}
          </p>
        </div>
        <div className="md:col-span-2">
          <HouseholdAvoidRulesSection
            initialRules={initialAvoidRules ?? undefined}
          />
        </div>
      </section>

      <section
        id="servings"
        className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
        aria-labelledby="servings-heading"
      >
        <div>
          <h2
            id="servings-heading"
            className="text-base/7 font-semibold text-zinc-950 dark:text-white"
          >
            {t('servingsHeading')}
          </h2>
          <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
            {t('servingsDescription')}
          </p>
        </div>
        <div className="md:col-span-2">
          <HouseholdServingsSection
            initialPrefs={initialHouseholdServings ?? undefined}
          />
        </div>
      </section>

      <section
        id="meal-slot-styles"
        className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
        aria-labelledby="meal-slot-styles-heading"
      >
        <div>
          <h2
            id="meal-slot-styles-heading"
            className="text-base/7 font-semibold text-zinc-950 dark:text-white"
          >
            {t('mealSlotStyleHeading')}
          </h2>
          <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
            {t('mealSlotStyleDescription')}
          </p>
        </div>
        <div className="md:col-span-2">
          <MealSlotStylePreferencesSection
            initialPrefs={initialMealSlotStylePrefs ?? undefined}
          />
        </div>
      </section>
    </>
  );
}
