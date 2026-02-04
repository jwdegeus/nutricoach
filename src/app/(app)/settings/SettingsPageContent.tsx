'use client';

import { Link } from '@/components/catalyst/link';
import { useTranslations } from 'next-intl';
import type { User } from '@supabase/supabase-js';
import type { MealPlanSchedulePrefs } from './actions/meal-plan-schedule-preferences.actions';
import {
  SchedulePreferencesSection,
  HouseholdAvoidRulesSection,
  HouseholdServingsSection,
  MealSlotStylePreferencesSection,
  PasswordSection,
  AccountActionsSection,
} from './settings-form';
import { AdminLinks } from './components/AdminLinks';

interface SettingsPageContentProps {
  user: User;
  schedulePrefs: MealPlanSchedulePrefs | null;
  isAdmin: boolean;
}

export function SettingsPageContent({
  user: _user,
  schedulePrefs,
  isAdmin,
}: SettingsPageContentProps) {
  const t = useTranslations('settings');
  const tNav = useTranslations('nav');
  const tAccount = useTranslations('account');

  return (
    <>
      <h1 className="sr-only">{t('title')}</h1>

      <header className="sticky top-16 z-10 border-b border-zinc-200 bg-white lg:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:lg:bg-zinc-950">
        <nav
          className="flex overflow-x-auto py-4"
          aria-label="Instellingen secties"
        >
          <ul
            role="list"
            className="flex min-w-full flex-none gap-x-6 px-4 text-sm/6 font-semibold text-zinc-500 sm:px-6 dark:text-zinc-400 lg:px-8"
          >
            <li>
              <Link
                href="/account"
                className="text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
              >
                {tAccount('title')}
              </Link>
            </li>
            <li>
              <Link href="/settings" className="text-zinc-950 dark:text-white">
                {tNav('settings')}
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
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
            <HouseholdAvoidRulesSection />
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
            <HouseholdServingsSection />
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
            <MealSlotStylePreferencesSection />
          </div>
        </section>

        <section
          id="password"
          className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
          aria-labelledby="password-heading"
        >
          <div>
            <h2
              id="password-heading"
              className="text-base/7 font-semibold text-zinc-950 dark:text-white"
            >
              {t('passwordHeading')}
            </h2>
            <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
              {t('passwordDescription')}
            </p>
          </div>
          <div className="md:col-span-2">
            <PasswordSection />
          </div>
        </section>

        <section
          id="account-actions"
          className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
          aria-labelledby="account-actions-heading"
        >
          <div>
            <h2
              id="account-actions-heading"
              className="text-base/7 font-semibold text-zinc-950 dark:text-white"
            >
              {t('accountActionsHeading')}
            </h2>
            <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
              {t('accountActionsDescription')}
            </p>
          </div>
          <div className="md:col-span-2">
            <AccountActionsSection />
          </div>
        </section>

        {isAdmin && (
          <section
            id="admin"
            className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
            aria-labelledby="admin-heading"
          >
            <div>
              <h2
                id="admin-heading"
                className="text-base/7 font-semibold text-zinc-950 dark:text-white"
              >
                {t('adminHeading')}
              </h2>
              <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
                {t('adminDescription')}
              </p>
            </div>
            <div className="md:col-span-2">
              <AdminLinks hideSectionHeading />
            </div>
          </section>
        )}
      </div>
    </>
  );
}
