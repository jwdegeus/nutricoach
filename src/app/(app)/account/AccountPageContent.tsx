'use client';

import { AccountSectionTabs } from '@/src/components/app/AccountSectionTabs';
import { AccountProfile } from './account-profile';
import { LanguageSelector } from './language-selector';
import type { User } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';

interface AccountPageContentProps {
  user: User;
}

export function AccountPageContent({ user }: AccountPageContentProps) {
  const t = useTranslations('account');

  return (
    <>
      <h1 className="sr-only">{t('title')}</h1>
      <AccountSectionTabs />

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        <section
          id="profile"
          className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
          aria-labelledby="profile-heading"
        >
          <div>
            <h2
              id="profile-heading"
              className="text-base/7 font-semibold text-zinc-950 dark:text-white"
            >
              {t('profileData')}
            </h2>
            <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
              {t('profileDescription')}
            </p>
          </div>
          <div className="md:col-span-2">
            <AccountProfile user={user} hideSectionHeading />
          </div>
        </section>

        <section
          id="language"
          className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
          aria-labelledby="language-heading"
        >
          <div>
            <h2
              id="language-heading"
              className="text-base/7 font-semibold text-zinc-950 dark:text-white"
            >
              {t('languagePreference')}
            </h2>
            <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
              {t('languageDescription')}
            </p>
          </div>
          <div className="md:col-span-2">
            <LanguageSelector hideSectionHeading />
          </div>
        </section>
      </div>
    </>
  );
}
