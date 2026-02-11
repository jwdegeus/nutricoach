'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Step2AllergiesDislikes } from '@/src/app/(app)/onboarding/components/Step2AllergiesDislikes';
import { Button } from '@/components/catalyst/button';
import {
  FieldGroup,
  Field,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import { Input } from '@/components/catalyst/input';
import { useToast } from '@/src/components/app/ToastContext';
import {
  loadFamilyMemberProfileAction,
  saveFamilyMemberProfileAction,
  type FamilyMemberProfileInput,
} from '../actions/familyMemberProfile.actions';
import { getFamilyDietPrefsAction } from '../actions/family-diet.actions';

export function FamilyMemberDietForm({ memberId }: { memberId: string }) {
  const t = useTranslations('family');
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [kcalTarget, setKcalTarget] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadFamilyMemberProfileAction(memberId)
      .then((res) => {
        if (cancelled) return;
        const s = res.summary;
        if (s.kcalTarget !== undefined) setKcalTarget(s.kcalTarget);
        if (s.allergies) setAllergies(s.allergies);
        if (s.dislikes) setDislikes(s.dislikes);
      })
      .catch(() => {
        if (!cancelled) showToast({ type: 'error', title: t('loadError') });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const familyResult = await getFamilyDietPrefsAction();
      const familyPrefs = familyResult.ok ? familyResult.prefs : null;
      const input: FamilyMemberProfileInput = {
        allergies,
        dislikes,
        maxPrepMinutes: familyPrefs?.maxPrepMinutes ?? 30,
        servingsDefault: familyPrefs?.servingsDefault ?? 2,
        kcalTarget: kcalTarget ?? null,
        varietyLevel: familyPrefs?.varietyLevel ?? 'std',
        strictness: familyPrefs?.strictness ?? 'flexible',
        mealPreferences: familyPrefs?.mealPreferences
          ? {
              breakfast: familyPrefs.mealPreferences.breakfast,
              lunch: familyPrefs.mealPreferences.lunch,
              dinner: familyPrefs.mealPreferences.dinner,
            }
          : undefined,
        isInflamed: familyPrefs?.dietIsInflamed ?? false,
      };
      const result = await saveFamilyMemberProfileAction(memberId, input);
      if (result.ok) {
        showToast({ type: 'success', title: t('dietSaved') });
      } else {
        setError(result.error);
        showToast({ type: 'error', title: result.error });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">{t('loading')}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}
      <FieldGroup>
        <div className="rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
          {t('familyPreferencesOnFamilyPage')}{' '}
          <Link
            href="/familie/edit"
            className="font-medium text-zinc-950 underline hover:no-underline dark:text-white"
          >
            {t('familyDietInSettingsLink')}
          </Link>
        </div>
        <div className="space-y-4 pt-6">
          <Step2AllergiesDislikes
            allergies={allergies}
            dislikes={dislikes}
            onAllergiesChange={setAllergies}
            onDislikesChange={setDislikes}
          />
        </div>
        <div className="space-y-4 pt-6">
          <Field>
            <Label htmlFor="kcal-target">{t('familyKcalTargetLabel')}</Label>
            <Input
              id="kcal-target"
              type="number"
              min={800}
              max={6000}
              value={kcalTarget ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setKcalTarget(v === '' ? null : Number.parseInt(v, 10) || null);
              }}
              placeholder="Bijv. 2000"
            />
            <Description>{t('familyKcalTargetHelp')}</Description>
          </Field>
        </div>
        <div className="pt-4">
          <Button type="submit" disabled={saving}>
            {saving ? t('saving') : t('saveDietAndPreferences')}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
