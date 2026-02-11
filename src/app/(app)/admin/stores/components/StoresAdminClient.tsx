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
import { Field, Label } from '@/components/catalyst/fieldset';
import { Link } from '@/components/catalyst/link';
import {
  ArrowPathIcon,
  PencilSquareIcon,
  PlusIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/16/solid';
import { useToast } from '@/src/components/app/ToastContext';
import {
  listStoreTemplatesAction,
  addStoreFromTemplateAction,
  createStoreTemplateAction,
  updateStoreAction,
  toggleStoreActiveAction,
  triggerSyncAction,
  type StoreForAdmin,
  type StoreTemplate,
} from '../actions/stores.actions';

type StoreForm = {
  name: string;
  base_url: string;
  sitemap_url: string;
  is_active: boolean;
  rateLimitRps: string;
  detailBatchSize: string;
  detailConcurrency: string;
};

const emptyForm: StoreForm = {
  name: '',
  base_url: '',
  sitemap_url: '',
  is_active: true,
  rateLimitRps: '2',
  detailBatchSize: '200',
  detailConcurrency: '3',
};

function formFromStore(s: StoreForAdmin): StoreForm {
  const c = s.connector_config ?? {};
  return {
    name: s.name,
    base_url: s.base_url,
    sitemap_url: s.sitemap_url ?? '',
    is_active: s.is_active,
    rateLimitRps: String(c.rateLimitRps ?? '2'),
    detailBatchSize: String(c.detailBatchSize ?? '200'),
    detailConcurrency: String(c.detailConcurrency ?? '3'),
  };
}

type Props = {
  initialStores: StoreForAdmin[];
};

export function StoresAdminClient({ initialStores }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [stores, setStores] = useState<StoreForAdmin[]>(initialStores);
  const [_loading, _setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StoreForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<StoreTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [addingTemplateId, setAddingTemplateId] = useState<string | null>(null);
  /** Bij 'Winkel toevoegen': uit catalogus kiezen of nieuwe winkel aanmaken */
  const [addMode, setAddMode] = useState<'catalog' | 'create'>('catalog');

  useEffect(() => {
    setStores(initialStores);
  }, [initialStores]);

  const hasAnySitemap = stores.some(
    (s) => s.sitemap_url != null && s.sitemap_url !== '',
  );

  const openNew = async () => {
    setEditingId(null);
    setForm(emptyForm);
    setAddMode('catalog');
    setDialogOpen(true);
    setTemplatesLoading(true);
    const res = await listStoreTemplatesAction();
    setTemplatesLoading(false);
    if (res.ok) setTemplates(res.data);
    else setTemplates([]);
  };

  const openEdit = (s: StoreForAdmin) => {
    setEditingId(s.id);
    setForm(formFromStore(s));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const num = (v: string): number | null => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const handleAddFromTemplate = async (templateId: string) => {
    setAddingTemplateId(templateId);
    setError(null);
    const result = await addStoreFromTemplateAction(templateId);
    setAddingTemplateId(null);
    if (result.ok) {
      showToast({ type: 'success', title: 'Winkel toegevoegd' });
      closeDialog();
      setSuccessMessage('Winkel toegevoegd.');
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  const handleCreateNewStore = async () => {
    const name = form.name.trim();
    const base_url = form.base_url.trim();
    const sitemap_url = form.sitemap_url.trim() || null;
    const rateLimitRps = num(form.rateLimitRps);
    const detailBatchSize = num(form.detailBatchSize);
    const detailConcurrency = num(form.detailConcurrency);
    if (!name) {
      setError('Naam is verplicht');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await createStoreTemplateAction({
      name,
      base_url,
      sitemap_url,
      connector_type: 'sitemap_xml',
      rateLimitRps: rateLimitRps ?? undefined,
      detailBatchSize: detailBatchSize ?? undefined,
      detailConcurrency: detailConcurrency ?? undefined,
    });
    setSaving(false);
    if (result.ok) {
      showToast({ type: 'success', title: 'Winkel aangemaakt en toegevoegd' });
      closeDialog();
      setSuccessMessage('Winkel aangemaakt.');
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  const handleSave = async () => {
    if (!editingId) return;
    const name = form.name.trim();
    const base_url = form.base_url.trim();
    const sitemap_url = form.sitemap_url.trim() || null;
    const rateLimitRps = num(form.rateLimitRps);
    const detailBatchSize = num(form.detailBatchSize);
    const detailConcurrency = num(form.detailConcurrency);

    setSaving(true);
    setError(null);
    const result = await updateStoreAction(editingId, {
      name: name || undefined,
      base_url: base_url || undefined,
      sitemap_url,
      is_active: form.is_active,
      rateLimitRps: rateLimitRps ?? undefined,
      detailBatchSize: detailBatchSize ?? undefined,
      detailConcurrency: detailConcurrency ?? undefined,
    });
    setSaving(false);
    if (result.ok) {
      showToast({ type: 'success', title: 'Winkel bijgewerkt' });
      closeDialog();
      router.refresh();
      setStores((prev) =>
        prev.map((s) =>
          s.id === editingId
            ? {
                ...s,
                name,
                base_url,
                sitemap_url,
                is_active: form.is_active,
                connector_config: {
                  ...(s.connector_config ?? {}),
                  rateLimitRps: rateLimitRps ?? undefined,
                  detailBatchSize: detailBatchSize ?? undefined,
                  detailConcurrency: detailConcurrency ?? undefined,
                },
              }
            : s,
        ),
      );
    } else {
      setError(result.error);
    }
  };

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    const result = await toggleStoreActiveAction(id);
    setTogglingId(null);
    if (result.ok) {
      showToast({ type: 'success', title: 'Status bijgewerkt' });
      router.refresh();
      setStores((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: !s.is_active } : s)),
      );
    } else {
      showToast({ type: 'error', title: 'Fout', description: result.error });
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setSuccessMessage(null);
    const result = await triggerSyncAction();
    setSyncing(false);
    if (result.ok) {
      const msg = `${result.storesProcessed} winkels verwerkt: ${result.succeeded} geslaagd, ${result.failed} mislukt.`;
      setSuccessMessage(msg);
      showToast({ type: 'success', title: 'Sync voltooid', description: msg });
      router.refresh();
    } else {
      setError(result.error);
      showToast({
        type: 'error',
        title: 'Sync mislukt',
        description: result.error,
      });
    }
  };

  return (
    <div className="space-y-6">
      {successMessage && (
        <div className="rounded-xl bg-green-50 p-4 text-green-800 dark:bg-green-950/40 dark:text-green-200">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-4 text-red-800 dark:bg-red-950/40 dark:text-red-200">
          <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0" />
          <span>{error}</span>
          <Button
            plain
            className="ml-auto shrink-0"
            onClick={() => setError(null)}
          >
            Sluiten
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openNew}>
          <PlusIcon className="size-4" />
          Winkel toevoegen
        </Button>
        {hasAnySitemap ? (
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? (
              <ArrowPathIcon className="size-4 animate-spin" />
            ) : (
              <ArrowPathIcon className="size-4" />
            )}
            Sync nu
          </Button>
        ) : (
          <Button onClick={handleSync} disabled={syncing} plain>
            {syncing ? (
              <ArrowPathIcon className="size-4 animate-spin" />
            ) : (
              <ArrowPathIcon className="size-4" />
            )}
            Sync nu
          </Button>
        )}
        {!hasAnySitemap && stores.length > 0 && (
          <span className="text-sm text-muted-foreground">
            Voeg bij minstens één winkel een sitemap-URL toe om sync te
            gebruiken.
          </span>
        )}
      </div>

      {stores.length === 0 ? (
        <p className="rounded-xl bg-muted/30 p-6 text-center text-muted-foreground">
          Nog geen winkels. Klik op &quot;Winkel toevoegen&quot; om uit de
          beschikbare winkels te kiezen.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-muted/30 shadow-sm">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Naam</TableHeader>
                <TableHeader>Base URL</TableHeader>
                <TableHeader>Sitemap</TableHeader>
                <TableHeader>Actief</TableHeader>
                <TableHeader className="w-0">Acties</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {stores.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/admin/stores/${row.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span
                      className="inline-block max-w-[200px] truncate text-muted-foreground"
                      title={row.base_url}
                    >
                      {row.base_url}
                    </span>
                  </TableCell>
                  <TableCell>
                    {row.sitemap_url ? (
                      <span
                        className="inline-block max-w-[180px] truncate text-muted-foreground"
                        title={row.sitemap_url}
                      >
                        {row.sitemap_url}
                      </span>
                    ) : (
                      <Badge color="amber">Geen sitemap</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      name={`active-${row.id}`}
                      checked={row.is_active}
                      onChange={() => handleToggle(row.id)}
                      disabled={togglingId === row.id}
                    />
                  </TableCell>
                  <TableCell>
                    <Button plain onClick={() => openEdit(row)}>
                      <PencilSquareIcon className="size-4" />
                      Bewerk
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onClose={closeDialog}>
        {editingId ? (
          <>
            <DialogTitle>Winkel bewerken</DialogTitle>
            <DialogBody>
              <DialogDescription>
                Base URL en sitemap-URL moeten geldige https-URL&apos;s zijn.
              </DialogDescription>
              <div className="mt-4 space-y-4">
                <Field>
                  <Label>Naam</Label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="Bijv. Ekoplaza"
                  />
                </Field>
                <Field>
                  <Label>Base URL</Label>
                  <Input
                    type="url"
                    value={form.base_url}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, base_url: e.target.value }))
                    }
                    placeholder="https://www.voorbeeld.nl"
                  />
                </Field>
                <Field>
                  <Label>Sitemap URL (optioneel)</Label>
                  <Input
                    type="url"
                    value={form.sitemap_url}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sitemap_url: e.target.value }))
                    }
                    placeholder="https://www.voorbeeld.nl/sitemap.xml"
                  />
                </Field>
                <Field>
                  <div className="flex items-center gap-2">
                    <Switch
                      name="is_active"
                      checked={form.is_active}
                      onChange={(checked) =>
                        setForm((f) => ({ ...f, is_active: checked }))
                      }
                    />
                    <Label>Actief</Label>
                  </div>
                </Field>
                <div className="space-y-4 border-t border-white/10 pt-4">
                  <p className="text-sm font-medium text-foreground">
                    Sync-instellingen (connector_config)
                  </p>
                  <Field>
                    <Label>Rate limit (requests/sec)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.rateLimitRps}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, rateLimitRps: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    <Label>Detail batch size</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.detailBatchSize}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          detailBatchSize: e.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field>
                    <Label>Detail concurrency</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.detailConcurrency}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          detailConcurrency: e.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>
                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
              </div>
            </DialogBody>
            <DialogActions>
              <Button plain onClick={closeDialog}>
                Annuleren
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <ArrowPathIcon className="size-4 animate-spin" />
                ) : (
                  'Opslaan'
                )}
              </Button>
            </DialogActions>
          </>
        ) : addMode === 'create' ? (
          <>
            <DialogTitle>Nieuwe winkel aanmaken</DialogTitle>
            <DialogBody>
              <DialogDescription>
                Maak een nieuwe winkel aan in de catalogus. Deze komt in je
                eigen lijst en is daarna ook beschikbaar voor gebruikers op
                Boodschappenlijst om te koppelen.
              </DialogDescription>
              <div className="mt-4 space-y-4">
                <Field>
                  <Label>Naam</Label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="Bijv. Ekoplaza"
                  />
                </Field>
                <Field>
                  <Label>Base URL</Label>
                  <Input
                    type="url"
                    value={form.base_url}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, base_url: e.target.value }))
                    }
                    placeholder="https://www.voorbeeld.nl"
                  />
                </Field>
                <Field>
                  <Label>Sitemap URL (optioneel)</Label>
                  <Input
                    type="url"
                    value={form.sitemap_url}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sitemap_url: e.target.value }))
                    }
                    placeholder="https://www.voorbeeld.nl/sitemap.xml"
                  />
                </Field>
                <div className="space-y-4 border-t border-white/10 pt-4">
                  <p className="text-sm font-medium text-foreground">
                    Sync-instellingen
                  </p>
                  <Field>
                    <Label>Rate limit (requests/sec)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.rateLimitRps}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, rateLimitRps: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    <Label>Detail batch size</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.detailBatchSize}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          detailBatchSize: e.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field>
                    <Label>Detail concurrency</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.detailConcurrency}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          detailConcurrency: e.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>
                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
              </div>
            </DialogBody>
            <DialogActions>
              <Button plain onClick={() => setAddMode('catalog')}>
                Terug naar catalogus
              </Button>
              <Button plain onClick={closeDialog}>
                Annuleren
              </Button>
              <Button onClick={handleCreateNewStore} disabled={saving}>
                {saving ? (
                  <ArrowPathIcon className="size-4 animate-spin" />
                ) : (
                  'Aanmaken'
                )}
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle>Winkel toevoegen</DialogTitle>
            <DialogBody>
              <DialogDescription>
                Kies een winkel uit de catalogus of maak een nieuwe aan. Winkels
                met &quot;API&quot; gebruiken een koppeling (bijv. ah.nl);
                overige gebruiken sitemap/XML.
              </DialogDescription>
              <div className="mt-2 flex gap-2">
                <Button plain onClick={() => setAddMode('create')}>
                  + Nieuwe winkel aanmaken
                </Button>
              </div>
              <div className="mt-4">
                {templatesLoading ? (
                  <p className="text-sm text-muted-foreground">Laden...</p>
                ) : templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Geen winkels in de catalogus. Maak hierboven een nieuwe aan.
                  </p>
                ) : (
                  <ul className="max-h-72 divide-y divide-white/10 overflow-y-auto rounded-lg bg-muted/20">
                    {templates.map((t) => (
                      <li
                        key={t.id}
                        className="flex flex-wrap items-center gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-foreground">
                            {t.name}
                          </span>
                          <span
                            className="ml-2 block truncate text-sm text-muted-foreground"
                            title={t.base_url}
                          >
                            {t.base_url}
                          </span>
                        </div>
                        <Badge
                          color={t.connector_type === 'api' ? 'blue' : 'zinc'}
                        >
                          {t.connector_type === 'api' ? 'API' : 'Sitemap/XML'}
                        </Badge>
                        <Button
                          onClick={() => handleAddFromTemplate(t.id)}
                          disabled={addingTemplateId !== null}
                        >
                          {addingTemplateId === t.id ? (
                            <ArrowPathIcon className="size-4 animate-spin" />
                          ) : (
                            'Toevoegen'
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {error && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
              </div>
            </DialogBody>
            <DialogActions>
              <Button plain onClick={closeDialog}>
                Sluiten
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </div>
  );
}
