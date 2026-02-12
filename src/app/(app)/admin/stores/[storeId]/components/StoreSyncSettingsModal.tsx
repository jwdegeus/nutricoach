'use client';

import { useState } from 'react';
import { Button } from '@/components/catalyst/button';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Cog6ToothIcon } from '@heroicons/react/16/solid';
import { StoreSyncSettingsForm } from './StoreSyncSettingsForm';

type Props = {
  storeId: string;
  rateLimitRps: number;
  detailBatchSize: number;
  detailConcurrency: number;
  detailDelayMs: number;
  productUrlsOnly: boolean;
};

export function StoreSyncSettingsModal({
  storeId,
  rateLimitRps,
  detailBatchSize,
  detailConcurrency,
  detailDelayMs,
  productUrlsOnly,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        outline
        onClick={() => setOpen(true)}
        aria-label="Sync-instellingen openen"
      >
        <Cog6ToothIcon className="size-4" />
        Instellingen
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="xl">
        <DialogTitle>Sync instellingen</DialogTitle>
        <DialogDescription>
          Configureer hoe producten uit de sitemap worden opgehaald en verwerkt.
        </DialogDescription>
        <DialogBody>
          <StoreSyncSettingsForm
            storeId={storeId}
            rateLimitRps={rateLimitRps}
            detailBatchSize={detailBatchSize}
            detailConcurrency={detailConcurrency}
            detailDelayMs={detailDelayMs}
            productUrlsOnly={productUrlsOnly}
            onSuccess={() => setOpen(false)}
          />
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setOpen(false)}>
            Sluiten
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
