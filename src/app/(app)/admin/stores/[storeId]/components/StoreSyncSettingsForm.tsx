'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Field, Label } from '@/components/catalyst/fieldset';
import { useToast } from '@/src/components/app/ToastContext';
import { updateStoreAction } from '../../actions/stores.actions';

type Props = {
  storeId: string;
  rateLimitRps: number;
  detailBatchSize: number;
  detailConcurrency: number;
  detailDelayMs: number;
};

export function StoreSyncSettingsForm({
  storeId,
  rateLimitRps: initialRateLimitRps,
  detailBatchSize: initialDetailBatchSize,
  detailConcurrency: initialDetailConcurrency,
  detailDelayMs: initialDetailDelayMs,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [rateLimitRps, setRateLimitRps] = useState(String(initialRateLimitRps));
  const [detailBatchSize, setDetailBatchSize] = useState(
    String(initialDetailBatchSize),
  );
  const [detailConcurrency, setDetailConcurrency] = useState(
    String(initialDetailConcurrency),
  );
  const [detailDelayMs, setDetailDelayMs] = useState(
    initialDetailDelayMs > 0 ? String(initialDetailDelayMs) : '',
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rps = Number(rateLimitRps);
    const batch = Number(detailBatchSize);
    const concurrency = Number(detailConcurrency);
    const delay = detailDelayMs === '' ? 0 : Number(detailDelayMs);
    if (
      !Number.isFinite(rps) ||
      rps < 1 ||
      !Number.isFinite(batch) ||
      batch < 10 ||
      !Number.isFinite(concurrency) ||
      concurrency < 1
    ) {
      showToast({
        type: 'error',
        title: 'Ongeldige waarden',
        description: 'Rate limit ≥1, batch size ≥10, concurrency ≥1.',
      });
      return;
    }
    if (detailDelayMs !== '' && (!Number.isFinite(delay) || delay < 0)) {
      showToast({
        type: 'error',
        title: 'Ongeldige waarden',
        description: 'Pauze moet ≥0 zijn.',
      });
      return;
    }
    setSaving(true);
    const result = await updateStoreAction(storeId, {
      rateLimitRps: rps,
      detailBatchSize: batch,
      detailConcurrency: concurrency,
      detailDelayMs: delay > 0 ? delay : null,
    });
    setSaving(false);
    if (result.ok) {
      showToast({ type: 'success', title: 'Sync-instellingen opgeslagen' });
      router.refresh();
    } else {
      showToast({
        type: 'error',
        title: 'Opslaan mislukt',
        description: result.error,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <Label>Rate limit (rps)</Label>
          <Input
            type="number"
            min={1}
            value={rateLimitRps}
            onChange={(e) => setRateLimitRps(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Detail batch size</Label>
          <Input
            type="number"
            min={10}
            value={detailBatchSize}
            onChange={(e) => setDetailBatchSize(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Detail concurrency</Label>
          <Input
            type="number"
            min={1}
            value={detailConcurrency}
            onChange={(e) => setDetailConcurrency(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Pauze tussen requests (ms)</Label>
          <Input
            type="number"
            min={0}
            placeholder="0 = uit"
            value={detailDelayMs}
            onChange={(e) => setDetailDelayMs(e.target.value)}
          />
        </Field>
      </div>
      <p className="text-sm text-muted-foreground">
        Bij veel FETCH_FAILED: concurrency 1, rate limit 1, en pauze 2000 ms
        (Ekoplaza).
      </p>
      <Button type="submit" disabled={saving}>
        {saving ? 'Opslaan…' : 'Opslaan'}
      </Button>
    </form>
  );
}
