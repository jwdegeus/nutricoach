'use client';

import { useState, useTransition, useEffect } from 'react';
import { updateLanguagePreference } from './account-actions';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import { Text } from '@/components/catalyst/text';
import { Select } from '@/components/catalyst/select';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useToast } from '@/src/components/app/ToastContext';

interface LanguageSelectorProps {
  /** When true, the section heading/description is omitted (provided by parent layout). */
  hideSectionHeading?: boolean;
}

export function LanguageSelector({
  hideSectionHeading,
}: LanguageSelectorProps = {}) {
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useToast();
  const [selectedLanguage, setSelectedLanguage] = useState(locale);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelectedLanguage(locale);
  }, [locale]);

  async function handleLanguageChange(newLanguage: string) {
    setSelectedLanguage(newLanguage);
    setError(null);

    startTransition(async () => {
      const result = await updateLanguagePreference(newLanguage);
      if (result?.error) {
        setError(result.error);
        setSelectedLanguage(locale); // Revert on error
      } else if (result?.success) {
        showToast({
          type: 'success',
          title: tCommon('success'),
          description: result.message,
        });
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      {!hideSectionHeading && (
        <div className="mb-6">
          <h2 className="text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
            {t('languagePreference')}
          </h2>
          <Text className="mt-1">{t('languageDescription')}</Text>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <strong>{tCommon('error')}:</strong> {error}
        </div>
      )}

      <FieldGroup>
        <Field>
          <Label htmlFor="language">{tCommon('language')}</Label>
          <Description>{t('languageDescription')}</Description>
          <Select
            id="language"
            value={selectedLanguage}
            onChange={(e) => handleLanguageChange(e.target.value)}
            disabled={isPending}
            className="mt-2"
          >
            <option value="nl">{tCommon('dutch')}</option>
            <option value="en">{tCommon('english')}</option>
          </Select>
        </Field>
      </FieldGroup>
    </div>
  );
}
