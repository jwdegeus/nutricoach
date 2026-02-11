'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Textarea } from '@/components/catalyst/textarea';
import { Switch } from '@/components/catalyst/switch';
import { Field, FieldGroup, Label } from '@/components/catalyst/fieldset';
import { useToast } from '@/src/components/app/ToastContext';
import { upsertTherapeuticSupplementAction } from '../actions/therapeuticProtocolEditor.actions';

type Props = {
  protocolId: string;
  protocolTitle: string;
};

export function SupplementNewPageClient({
  protocolId,
  protocolTitle: _protocolTitle,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const t = useTranslations('admin.therapeuticProtocolEditor');

  const [supplementKey, setSupplementKey] = useState('');
  const [labelNl, setLabelNl] = useState('');
  const [dosageText, setDosageText] = useState<string | null>(null);
  const [notesNl, setNotesNl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const protocolHref = `/admin/therapeutic-protocols/${protocolId}?tab=supplements`;
  const _supplementsHref = `/admin/therapeutic-protocols/${protocolId}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await upsertTherapeuticSupplementAction({
        protocolId,
        supplementKey: supplementKey.trim(),
        labelNl: labelNl.trim(),
        dosageText: dosageText?.trim() || null,
        notesNl: notesNl?.trim() || null,
        isActive,
      });
      if ('error' in result) {
        setFormError(result.error);
        return;
      }
      showToast({ type: 'success', title: t('toastSupplementSaved') });
      router.push(
        `/admin/therapeutic-protocols/${protocolId}/supplements/${result.data.id}/edit`,
      );
    });
  };

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-white">
        {t('supplementModalNew')}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">
            {formError}
          </div>
        )}
        <FieldGroup>
          <Field>
            <Label>{t('supplementKeyCol')}</Label>
            <Input
              value={supplementKey}
              onChange={(e) => setSupplementKey(e.target.value)}
              disabled={isPending}
              required
            />
          </Field>
          <Field>
            <Label>{t('labelNlCol')}</Label>
            <Input
              value={labelNl}
              onChange={(e) => setLabelNl(e.target.value)}
              disabled={isPending}
              required
            />
          </Field>
          <Field>
            <Label>{t('dosageOptional')}</Label>
            <Input
              value={dosageText ?? ''}
              onChange={(e) => setDosageText(e.target.value || null)}
              disabled={isPending}
            />
          </Field>
          <Field>
            <Label>{t('notesOptional')}</Label>
            <Textarea
              value={notesNl ?? ''}
              onChange={(e) => setNotesNl(e.target.value || null)}
              disabled={isPending}
            />
          </Field>
          <Field>
            <div className="flex items-center gap-2">
              <Switch
                checked={isActive}
                onChange={setIsActive}
                disabled={isPending}
                color="dark/zinc"
              />
              <Label>{t('activeLabel')}</Label>
            </div>
          </Field>
        </FieldGroup>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? t('saving') : t('save')}
          </Button>
          <Button
            type="button"
            outline
            disabled={isPending}
            onClick={() => router.push(protocolHref)}
          >
            {t('cancel')}
          </Button>
        </div>
      </form>
    </>
  );
}
