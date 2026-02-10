'use client';

import { AccountSectionTabs } from '@/src/components/app/AccountSectionTabs';
import { useTranslations } from 'next-intl';
import type { User } from '@supabase/supabase-js';
import { PasswordSection, AccountActionsSection } from './settings-form';
import { AdminLinks } from './components/AdminLinks';

interface SettingsPageContentProps {
  user: User;
  isAdmin: boolean;
}

export function SettingsPageContent({
  user: _user,
  isAdmin,
}: SettingsPageContentProps) {
  const t = useTranslations('settings');

  return (
    <>
      <h1 className="sr-only">{t('title')}</h1>
      <AccountSectionTabs />

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
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
