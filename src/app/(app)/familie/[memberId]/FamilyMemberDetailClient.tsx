'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Field, FieldGroup, Label } from '@/components/catalyst/fieldset';
import { Avatar } from '@/components/catalyst/avatar';
import { useToast } from '@/src/components/app/ToastContext';
import { AccountSectionTabs } from '@/src/components/app/AccountSectionTabs';
import { ArrowLeftIcon, CameraIcon } from '@heroicons/react/16/solid';
import type { FamilyMemberRow } from '../actions/family.actions';
import {
  updateFamilyMemberAction,
  uploadFamilyMemberAvatarAction,
} from '../actions/family.actions';
import { FamilyMemberDietForm } from './FamilyMemberDietForm';
import { FamilyTherapeuticSection } from './FamilyTherapeuticSection';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function FamilyMemberDetailClient({
  member,
}: {
  member: FamilyMemberRow;
}) {
  const t = useTranslations('family');
  const tAccount = useTranslations('account');
  const { showToast } = useToast();
  const [name, setName] = useState(member.name);
  const [isSelf, setIsSelf] = useState(member.is_self);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(member.avatar_url);
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSaveGeneral() {
    setSaving(true);
    try {
      const result = await updateFamilyMemberAction(member.id, {
        name: name.trim(),
        is_self: isSelf,
      });
      if (result.ok) {
        showToast({ type: 'success', title: t('saved') });
      } else {
        showToast({ type: 'error', title: result.error });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await uploadFamilyMemberAvatarAction(member.id, formData);
      if (result.ok) {
        setAvatarUrl(result.avatarUrl);
        showToast({ type: 'success', title: tAccount('avatarUpdated') });
      } else {
        showToast({ type: 'error', title: result.error });
      }
    });
  }

  return (
    <>
      <h1 className="sr-only">{member.name}</h1>
      <AccountSectionTabs />

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        <section
          id="general"
          className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
          aria-labelledby="general-heading"
        >
          <div>
            <Link
              href="/familie"
              className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
            >
              <ArrowLeftIcon className="size-4" />
              {t('backToList')}
            </Link>
            <h2
              id="general-heading"
              className="text-base/7 font-semibold text-zinc-950 dark:text-white"
            >
              {t('general')}
            </h2>
            <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
              {t('generalDescription')}
            </p>
          </div>
          <div className="space-y-8 md:col-span-2">
            {/* Profielfoto */}
            <div className="flex flex-wrap items-center gap-6">
              <Avatar
                src={avatarUrl ?? undefined}
                initials={!avatarUrl ? initials(member.name) : undefined}
                alt={member.name}
                className="size-24 shrink-0"
              />
              <form action={handleAvatarSubmit} className="flex flex-col gap-2">
                <input
                  type="file"
                  name="avatar"
                  accept="image/jpeg,image/png,image/webp"
                  className="block w-full text-sm text-zinc-500 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:file:bg-zinc-700 dark:file:text-zinc-200 dark:hover:file:bg-zinc-600"
                  aria-label={tAccount('choosePhoto')}
                />
                <Button type="submit" disabled={isPending} plain>
                  <CameraIcon className="size-4" />
                  {tAccount('uploadPhoto')}
                </Button>
              </form>
            </div>

            <FieldGroup>
              <Field>
                <Label>{t('name')}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
              </Field>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isSelf}
                  onChange={(e) => setIsSelf(e.target.checked)}
                  disabled={saving}
                  className="rounded border-zinc-300 dark:border-zinc-600"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  {t('markAsSelf')}
                </span>
              </label>
              <div className="pt-2">
                <Button
                  onClick={handleSaveGeneral}
                  disabled={saving || !name.trim()}
                >
                  {saving ? t('saving') : t('saveGeneral')}
                </Button>
              </div>
            </FieldGroup>
          </div>
        </section>

        <section
          id="diet-preferences"
          className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
          aria-labelledby="diet-preferences-heading"
        >
          <div>
            <h2
              id="diet-preferences-heading"
              className="text-base/7 font-semibold text-zinc-950 dark:text-white"
            >
              {t('dietAndPreferences')}
            </h2>
            <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
              {t('dietAndPreferencesDescription')}
            </p>
          </div>
          <div className="md:col-span-2">
            <FamilyMemberDietForm memberId={member.id} />
          </div>
        </section>

        <section
          id="therapeutic"
          className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
          aria-labelledby="therapeutic-heading"
        >
          <div>
            <h2
              id="therapeutic-heading"
              className="text-base/7 font-semibold text-zinc-950 dark:text-white"
            >
              {t('therapeuticModel')}
            </h2>
            <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
              {t('therapeuticDescription')}
            </p>
          </div>
          <div className="md:col-span-2">
            <FamilyTherapeuticSection memberId={member.id} />
          </div>
        </section>
      </div>
    </>
  );
}
