'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import { Select } from '@/components/catalyst/select';
import { useToast } from '@/src/components/app/ToastContext';
import { ArrowPathIcon } from '@heroicons/react/16/solid';
import {
  getHealthProfileForFamilyMemberAction,
  upsertHealthProfileForFamilyMemberAction,
  listActiveTherapeuticProtocolsForFamilyAction,
  getActiveTherapeuticProfileForFamilyMemberAction,
  setActiveTherapeuticProtocolForFamilyMemberAction,
} from '../actions/familyTherapeutic.actions';

const SEX_OPTIONS: Array<{
  value: 'female' | 'male' | 'other' | 'unknown';
  label: string;
}> = [
  { value: 'female', label: 'Vrouw' },
  { value: 'male', label: 'Man' },
  { value: 'other', label: 'Anders' },
  { value: 'unknown', label: 'Onbekend' },
];

export function FamilyTherapeuticSection({ memberId }: { memberId: string }) {
  const t = useTranslations('settingsTherapeutic');
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [protocols, setProtocols] = useState<
    Array<{ id: string; nameNl: string }>
  >([]);
  const [activeProtocolId, setActiveProtocolId] = useState<string | null>(null);
  const [activeProtocolLabel, setActiveProtocolLabel] = useState<string | null>(
    null,
  );
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<'female' | 'male' | 'other' | 'unknown'>(
    'unknown',
  );
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [healthSaving, setHealthSaving] = useState(false);
  const [protocolSaving, setProtocolSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getHealthProfileForFamilyMemberAction(memberId),
      listActiveTherapeuticProtocolsForFamilyAction(),
      getActiveTherapeuticProfileForFamilyMemberAction(memberId),
    ])
      .then(([healthRes, protocolsRes, activeRes]) => {
        if (cancelled) return;
        const profile = healthRes.ok ? healthRes.profile : null;
        if (profile) {
          if (profile.birthDate) setBirthDate(profile.birthDate);
          if (profile.sex) setSex(profile.sex);
          if (profile.heightCm != null) setHeightCm(String(profile.heightCm));
          if (profile.weightKg != null) setWeightKg(String(profile.weightKg));
        }
        if (protocolsRes.ok) {
          setProtocols(
            protocolsRes.protocols.map((p) => ({ id: p.id, nameNl: p.nameNl })),
          );
        }
        if (activeRes.ok && activeRes.active?.protocol) {
          const id = protocolsRes.ok
            ? protocolsRes.protocols.find(
                (p) => p.protocolKey === activeRes.active!.protocol.protocolKey,
              )?.id
            : null;
          setActiveProtocolId(id ?? null);
          setActiveProtocolLabel(activeRes.active.protocol.labelNl ?? null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : 'Kon gegevens niet laden.';
          showToast({
            type: 'error',
            title: 'Laden mislukt',
            description: msg,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when memberId changes; showToast is unstable
  }, [memberId]);

  async function handleHealthSave() {
    setHealthSaving(true);
    try {
      const height = heightCm.trim() ? parseInt(heightCm, 10) : undefined;
      const weight = weightKg.trim() ? parseFloat(weightKg) : undefined;
      if (
        height !== undefined &&
        (Number.isNaN(height) || height < 50 || height > 250)
      ) {
        showToast({
          type: 'error',
          title: 'Validatie',
          description: 'Lengte moet tussen 50 en 250 cm zijn.',
        });
        setHealthSaving(false);
        return;
      }
      if (
        weight !== undefined &&
        (Number.isNaN(weight) || weight < 10 || weight > 400)
      ) {
        showToast({
          type: 'error',
          title: 'Validatie',
          description: 'Gewicht moet tussen 10 en 400 kg zijn.',
        });
        setHealthSaving(false);
        return;
      }
      await upsertHealthProfileForFamilyMemberAction(memberId, {
        birthDate: birthDate.trim() || undefined,
        sex,
        heightCm: height,
        weightKg: weight,
      });
      showToast({ type: 'success', title: 'Opgeslagen' });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Kon gezondheidsprofiel niet opslaan.';
      showToast({ type: 'error', title: 'Opslaan mislukt', description: msg });
    } finally {
      setHealthSaving(false);
    }
  }

  async function handleProtocolSave() {
    if (!activeProtocolId) return;
    setProtocolSaving(true);
    try {
      const result = await setActiveTherapeuticProtocolForFamilyMemberAction(
        memberId,
        {
          protocolId: activeProtocolId,
        },
      );
      if (result.ok && result.active?.protocol) {
        setActiveProtocolLabel(result.active.protocol.labelNl ?? null);
        showToast({ type: 'success', title: 'Opgeslagen' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('couldNotSetProtocol');
      showToast({
        type: 'error',
        title: t('overridesSaveFailed'),
        description: msg,
      });
    } finally {
      setProtocolSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <ArrowPathIcon className="size-4 animate-spin" aria-hidden />
        Laden…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FieldGroup>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
          {t('healthDataHint')}
        </p>
        <Field>
          <Label htmlFor="fm-birthdate">{t('birthDate')}</Label>
          <Input
            id="fm-birthdate"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            disabled={healthSaving}
          />
        </Field>
        <Field>
          <Label htmlFor="fm-sex">{t('sex')}</Label>
          <Select
            id="fm-sex"
            value={sex}
            onChange={(e) =>
              setSex(e.target.value as 'female' | 'male' | 'other' | 'unknown')
            }
            disabled={healthSaving}
            className="mt-2"
          >
            {SEX_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="fm-height">{t('heightCm')}</Label>
          <Input
            id="fm-height"
            type="number"
            min={50}
            max={250}
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            disabled={healthSaving}
            placeholder={t('heightPlaceholder')}
          />
        </Field>
        <Field>
          <Label htmlFor="fm-weight">{t('weightKg')}</Label>
          <Input
            id="fm-weight"
            type="number"
            min={10}
            max={400}
            step={0.1}
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            disabled={healthSaving}
            placeholder={t('weightPlaceholder')}
          />
        </Field>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleHealthSave}
            disabled={healthSaving}
          >
            {healthSaving && (
              <ArrowPathIcon className="size-4 animate-spin mr-2" aria-hidden />
            )}
            {healthSaving ? t('saving') : t('saveHealthProfile')}
          </Button>
        </div>
      </FieldGroup>

      <FieldGroup>
        <Field>
          <Label htmlFor="fm-protocol">{t('protocolLabel')}</Label>
          <Description>{t('protocolDescription')}</Description>
          {protocols.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {t('noProtocolsAvailable')}
            </p>
          ) : (
            <>
              {activeProtocolLabel && (
                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                  {t('activeLabel')}: {activeProtocolLabel}
                </p>
              )}
              <Select
                id="fm-protocol"
                value={activeProtocolId ?? ''}
                onChange={(e) => setActiveProtocolId(e.target.value || null)}
                disabled={protocolSaving}
                className="mt-2"
              >
                <option value="">{t('chooseProtocol')}</option>
                {protocols.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameNl}
                  </option>
                ))}
              </Select>
              <div className="flex justify-end mt-2">
                <Button
                  type="button"
                  onClick={handleProtocolSave}
                  disabled={protocolSaving || !activeProtocolId}
                >
                  {protocolSaving && (
                    <ArrowPathIcon
                      className="size-4 animate-spin mr-2"
                      aria-hidden
                    />
                  )}
                  {protocolSaving ? t('saving') : t('saveProtocol')}
                </Button>
              </div>
            </>
          )}
        </Field>
      </FieldGroup>
    </div>
  );
}
