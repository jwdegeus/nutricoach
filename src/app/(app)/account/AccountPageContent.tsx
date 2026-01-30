'use client';

import { Link } from '@/components/catalyst/link';
import { AccountProfile } from './account-profile';
import { DietPreferencesForm } from './diet-preferences-form';
import { LanguageSelector } from './language-selector';
import type { User } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';

interface AccountPageContentProps {
  user: User;
}

export function AccountPageContent({ user }: AccountPageContentProps) {
  const t = useTranslations('account');
  const tNav = useTranslations('nav');

  return (
    <>
      <h1 className="sr-only">{t('title')}</h1>

      <header className="sticky top-16 z-10 border-b border-zinc-200 bg-white lg:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:lg:bg-zinc-950">
        <nav className="flex overflow-x-auto py-4" aria-label="Account secties">
          <ul
            role="list"
            className="flex min-w-full flex-none gap-x-6 px-4 text-sm/6 font-semibold text-zinc-500 sm:px-6 dark:text-zinc-400 lg:px-8"
          >
            <li>
              <Link href="/account" className="text-zinc-950 dark:text-white">
                {t('title')}
              </Link>
            </li>
            <li>
              <Link
                href="/account#diet"
                className="text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
              >
                {t('dietPreferences')}
              </Link>
            </li>
            <li>
              <Link
                href="/account#language"
                className="text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
              >
                {t('languagePreference')}
              </Link>
            </li>
            <li>
              <Link
                href="/settings"
                className="text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
              >
                {tNav('settings')}
              </Link>
            </li>
          </ul>
        </nav>
      </header>

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
          id="diet"
          className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
          aria-labelledby="diet-heading"
        >
          <div>
            <h2
              id="diet-heading"
              className="text-base/7 font-semibold text-zinc-950 dark:text-white"
            >
              {t('dietPreferences')}
            </h2>
            <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
              Pas je dieetvoorkeuren aan. Deze instellingen worden gebruikt voor
              het plannen van je maaltijden.
            </p>
          </div>
          <div className="md:col-span-2">
            <DietPreferencesForm hideSectionHeading />
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
