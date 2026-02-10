'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/catalyst/table';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import { Switch } from '@/components/catalyst/switch';
import { Input } from '@/components/catalyst/input';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogDescription,
  DialogActions,
} from '@/components/catalyst/dialog';
import { ArrowPathIcon, KeyIcon, PlayIcon } from '@heroicons/react/16/solid';
import {
  getProductSourceConfigAction,
  updateProductSourceConfigAction,
  updateProductSourceCredentialsAction,
  testAlbertHeijnConnectionAction,
} from '../actions/productSourceConfig.actions';
import type { ProductSourceConfigForAdmin } from '@/src/lib/pantry/sources';
import { useToast } from '@/src/components/app/ToastContext';

const SOURCE_LABELS: Record<string, string> = {
  openfoodfacts: 'Open Food Facts',
  albert_heijn: 'Albert Heijn',
};

export function ProductSourcesAdminClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const [configs, setConfigs] = useState<ProductSourceConfigForAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [priorityEdits, setPriorityEdits] = useState<Record<string, string>>(
    {},
  );
  const [credentialsDialogRow, setCredentialsDialogRow] =
    useState<ProductSourceConfigForAdmin | null>(null);
  const [credentialsBaseUrl, setCredentialsBaseUrl] = useState('');
  const [credentialsClientId, setCredentialsClientId] = useState('');
  const [credentialsInstallationId, setCredentialsInstallationId] =
    useState('');
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [testingAh, setTestingAh] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    const result = await getProductSourceConfigAction();
    if (result.ok) {
      setConfigs(result.data);
      setPriorityEdits(
        result.data.reduce(
          (acc, c) => ({ ...acc, [c.id]: String(c.priority) }),
          {} as Record<string, string>,
        ),
      );
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggleEnabled = async (row: ProductSourceConfigForAdmin) => {
    setUpdatingId(row.id);
    const result = await updateProductSourceConfigAction(row.id, {
      isEnabled: !row.isEnabled,
    });
    setUpdatingId(null);
    if (result.ok) {
      showToast({
        type: 'success',
        title: 'Bijgewerkt',
        description: `${SOURCE_LABELS[row.source] ?? row.source} is ${row.isEnabled ? 'uit' : 'aan'} gezet.`,
      });
      router.refresh();
      await load();
    } else {
      showToast({ type: 'error', title: 'Fout', description: result.error });
    }
  };

  const handlePriorityBlur = async (row: ProductSourceConfigForAdmin) => {
    const raw = priorityEdits[row.id];
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 1 || num === row.priority) return;
    setUpdatingId(row.id);
    const result = await updateProductSourceConfigAction(row.id, {
      priority: num,
    });
    setUpdatingId(null);
    if (result.ok) {
      showToast({
        type: 'success',
        title: 'Prioriteit bijgewerkt',
      });
      router.refresh();
      await load();
    } else {
      showToast({ type: 'error', title: 'Fout', description: result.error });
    }
  };

  const openCredentialsDialog = (row: ProductSourceConfigForAdmin) => {
    setCredentialsDialogRow(row);
    setCredentialsBaseUrl('');
    setCredentialsClientId('');
    setCredentialsInstallationId('');
  };

  const closeCredentialsDialog = () => {
    setCredentialsDialogRow(null);
    setCredentialsBaseUrl('');
    setCredentialsClientId('');
    setCredentialsInstallationId('');
  };

  const handleTestAhConnection = async () => {
    setTestingAh(true);
    const result = await testAlbertHeijnConnectionAction();
    setTestingAh(false);
    if (result.ok) {
      showToast({
        type: 'success',
        title: 'AH API OK',
        description: result.message,
      });
    } else {
      showToast({
        type: 'error',
        title: 'AH API test mislukt',
        description: result.error,
      });
    }
  };

  const handleSaveCredentials = async () => {
    if (!credentialsDialogRow) return;
    setCredentialsSaving(true);
    const result = await updateProductSourceCredentialsAction(
      credentialsDialogRow.id,
      {
        baseUrl: credentialsBaseUrl.trim() || undefined,
        clientId: credentialsClientId.trim() || undefined,
        installationId: credentialsInstallationId.trim() || undefined,
      },
    );
    setCredentialsSaving(false);
    if (result.ok) {
      showToast({
        type: 'success',
        title: 'Credentials opgeslagen',
        description: `${SOURCE_LABELS[credentialsDialogRow.source] ?? credentialsDialogRow.source} – waarden zijn opgeslagen.`,
      });
      closeCredentialsDialog();
      router.refresh();
      await load();
    } else {
      showToast({ type: 'error', title: 'Fout', description: result.error });
    }
  };

  if (loading && configs.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <ArrowPathIcon className="size-5 animate-spin" />
        Laden…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Productbronnen voor barcode- en zoeklookup in de voorraad. Alleen
        ingeschakelde bronnen worden gebruikt, in volgorde van prioriteit (lager
        = eerder).
      </p>
      <div className="overflow-hidden rounded-2xl bg-muted/30 shadow-sm">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Bron</TableHeader>
              <TableHeader>Aan</TableHeader>
              <TableHeader>Prioriteit</TableHeader>
              <TableHeader>Credentials</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {configs.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <span className="font-medium">
                    {SOURCE_LABELS[row.source] ?? row.source}
                  </span>
                </TableCell>
                <TableCell>
                  <Switch
                    name={`enabled-${row.id}`}
                    checked={row.isEnabled}
                    onChange={() => handleToggleEnabled(row)}
                    disabled={updatingId === row.id}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    value={priorityEdits[row.id] ?? row.priority}
                    onChange={(e) =>
                      setPriorityEdits((prev) => ({
                        ...prev,
                        [row.id]: e.target.value,
                      }))
                    }
                    onBlur={() => handlePriorityBlur(row)}
                    disabled={updatingId === row.id}
                    className="w-20"
                  />
                </TableCell>
                <TableCell>
                  {row.source === 'albert_heijn' ? (
                    <div className="flex items-center gap-2">
                      {row.hasCredentials ? (
                        <Badge color="green">Ingesteld</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <Button
                        plain
                        onClick={() => openCredentialsDialog(row)}
                        disabled={updatingId === row.id}
                      >
                        <KeyIcon className="size-4" />
                        {row.hasCredentials ? 'Wijzigen' : 'Instellen'}
                      </Button>
                      <Button
                        plain
                        onClick={handleTestAhConnection}
                        disabled={testingAh}
                        title="Test AH API-verbinding"
                      >
                        {testingAh ? (
                          <ArrowPathIcon className="size-4 animate-spin" />
                        ) : (
                          <PlayIcon className="size-4" />
                        )}
                        {testingAh ? 'Bezig…' : 'Test verbinding'}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {row.hasCredentials ? (
                        <Badge color="green">Ingesteld</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={credentialsDialogRow !== null}
        onClose={closeCredentialsDialog}
      >
        <DialogTitle>
          Credentials{' '}
          {credentialsDialogRow
            ? (SOURCE_LABELS[credentialsDialogRow.source] ??
              credentialsDialogRow.source)
            : ''}
        </DialogTitle>
        <DialogBody>
          <DialogDescription>
            Albert Heijn gebruikt anonymous token-auth (geen API-sleutel). Base
            URL en optioneel clientId en installation-id (UUID) voor de vereiste
            headers. Zie{' '}
            <a
              href="https://github.com/gwillem/appie-go/blob/main/doc/albertheijn_api.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary"
            >
              API-documentatie
            </a>
            .
          </DialogDescription>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-foreground">
                Base URL (optioneel)
              </span>
              <Input
                type="url"
                value={credentialsBaseUrl}
                onChange={(e) => setCredentialsBaseUrl(e.target.value)}
                placeholder="https://api.ah.nl"
                className="mt-1 block w-full"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">
                Client ID (optioneel)
              </span>
              <Input
                type="text"
                value={credentialsClientId}
                onChange={(e) => setCredentialsClientId(e.target.value)}
                placeholder="appie-ios"
                className="mt-1 block w-full font-mono text-sm"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">
                Installation ID (optioneel, UUID)
              </span>
              <Input
                type="text"
                value={credentialsInstallationId}
                onChange={(e) => setCredentialsInstallationId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="mt-1 block w-full font-mono text-sm"
                autoComplete="off"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Voor x-fraud-detection-installation-id. Leeg = per request
                gegenereerd.
              </span>
            </label>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={closeCredentialsDialog}>
            Annuleren
          </Button>
          <Button onClick={handleSaveCredentials} disabled={credentialsSaving}>
            {credentialsSaving ? (
              <ArrowPathIcon className="size-4 animate-spin" />
            ) : (
              'Opslaan'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
