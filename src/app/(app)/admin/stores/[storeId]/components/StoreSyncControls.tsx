'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/catalyst/button';
import { Switch } from '@/components/catalyst/switch';
import { Field, Label } from '@/components/catalyst/fieldset';
import { ArrowPathIcon } from '@heroicons/react/16/solid';
import { triggerStoreSyncAction } from '../../actions/stores.actions';

type Props = {
  storeId: string;
  hasSitemap: boolean;
};

export function StoreSyncControls({ storeId, hasSitemap }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fullRun, setFullRun] = useState(false);

  const handleSync = async () => {
    if (!hasSitemap || loading) return;
    setLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    const result = await triggerStoreSyncAction({ storeId, full: fullRun });
    setLoading(false);
    if (result.ok) {
      const msg =
        result.storesProcessed === 0
          ? 'Geen actieve store met sitemap gevonden.'
          : `Sync afgerond: ${result.storesProcessed} winkel(s) verwerkt, ${result.succeeded} geslaagd, ${result.failed} mislukt.`;
      setSuccessMessage(msg);
      router.refresh();
    } else {
      setErrorMessage(result.error);
    }
  };

  return (
    <div className="space-y-3">
      {!hasSitemap && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Geen sitemap URL ingesteld. Stel op de winkellijst een sitemap in om
          te syncen.
        </div>
      )}
      {successMessage && (
        <div className="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-200">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          {errorMessage}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {hasSitemap ? (
          <Button onClick={handleSync} disabled={loading}>
            {loading ? (
              <ArrowPathIcon className="size-4 animate-spin" />
            ) : (
              <ArrowPathIcon className="size-4" />
            )}
            {loading ? 'Syncen…' : 'Sync nu'}
          </Button>
        ) : (
          <Button onClick={handleSync} disabled={loading} plain>
            {loading ? (
              <ArrowPathIcon className="size-4 animate-spin" />
            ) : (
              <ArrowPathIcon className="size-4" />
            )}
            {loading ? 'Syncen…' : 'Sync nu'}
          </Button>
        )}
        <Field className="flex items-center gap-2">
          <Switch
            name="fullRun"
            checked={fullRun}
            onChange={setFullRun}
            disabled={loading}
          />
          <Label>Full run (deactiveer ontbrekende producten)</Label>
        </Field>
      </div>
    </div>
  );
}
