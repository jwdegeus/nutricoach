'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/src/components/app/ToastContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import { Switch } from '@/components/catalyst/switch';
import { Input } from '@/components/catalyst/input';
import { Text } from '@/components/catalyst/text';
import { Textarea } from '@/components/catalyst/textarea';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogDescription,
} from '@/components/catalyst/dialog';
import { Field, Label, FieldGroup } from '@/components/catalyst/fieldset';
import { PlusIcon, PencilIcon, ArrowPathIcon } from '@heroicons/react/16/solid';
import { whenJsonSchema } from '@/src/lib/therapeutic/whenJson.schema';
import type { WhenJsonSnippetRow } from './actions/therapeuticWhenJsonSnippets.actions';
import {
  createWhenJsonSnippetAction,
  updateWhenJsonSnippetAction,
  toggleWhenJsonSnippetActiveAction,
} from './actions/therapeuticWhenJsonSnippets.actions';

type Props = {
  initialData: WhenJsonSnippetRow[] | null;
  loadError: string | null;
};

type TemplateValidation =
  | { status: 'empty' }
  | { status: 'invalid-json' }
  | { status: 'invalid-dsl'; issues: { path: string; message: string }[] }
  | { status: 'ok' };

function validateTemplateJson(raw: string): TemplateValidation {
  const trimmed = raw.trim();
  if (trimmed.length < 2) return { status: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { status: 'invalid-json' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'invalid-json' };
  }
  const result = whenJsonSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.errors.slice(0, 2).map((e) => ({
      path: e.path.join('.') || 'root',
      message: e.message,
    }));
    return { status: 'invalid-dsl', issues };
  }
  return { status: 'ok' };
}

function isTemplateValidFromRow(row: WhenJsonSnippetRow): boolean {
  const t = row.template_json;
  if (t === null || typeof t !== 'object' || Array.isArray(t)) return false;
  return whenJsonSchema.safeParse(t).success;
}

const MAX_DESC_PREVIEW = 80;

const emptyCreateForm = {
  snippetKey: '',
  labelNl: '',
  descriptionNl: '',
  templateJson: '',
  isActive: true,
};

export function TherapeuticWhenJsonSnippetsAdminClient({
  initialData,
  loadError,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '',
    snippetKey: '',
    labelNl: '',
    descriptionNl: '',
    templateJson: '',
    isActive: true,
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const createValidation = validateTemplateJson(createForm.templateJson);
  const editValidation = validateTemplateJson(editForm.templateJson);

  const createCanSubmit =
    createForm.snippetKey.trim().length >= 2 &&
    createForm.labelNl.trim().length >= 2 &&
    createForm.templateJson.trim().length >= 2 &&
    createValidation.status === 'ok';

  const editCanSubmit =
    editForm.labelNl.trim().length >= 2 &&
    editForm.templateJson.trim().length >= 2 &&
    editValidation.status === 'ok';

  const handleToggle = (id: string, nextActive: boolean) => {
    setTogglingId(id);
    startTransition(async () => {
      const result = await toggleWhenJsonSnippetActiveAction({
        id,
        isActive: nextActive,
      });
      setTogglingId(null);
      if ('error' in result) {
        showToast({
          type: 'error',
          title: 'Fout',
          description: result.error,
        });
        return;
      }
      showToast({
        type: 'success',
        title: nextActive ? 'Sjabloon geactiveerd' : 'Sjabloon gedeactiveerd',
      });
      router.refresh();
    });
  };

  const openCreate = () => {
    setCreateForm(emptyCreateForm);
    setCreateError(null);
    setCreateOpen(true);
  };

  const openEdit = (row: WhenJsonSnippetRow) => {
    setEditForm({
      id: row.id,
      snippetKey: row.snippet_key,
      labelNl: row.label_nl,
      descriptionNl: row.description_nl ?? '',
      templateJson:
        typeof row.template_json === 'string'
          ? row.template_json
          : JSON.stringify(row.template_json, null, 2),
      isActive: row.is_active,
    });
    setEditError(null);
    setEditOpen(true);
  };

  const handleCreateSubmit = () => {
    setCreateError(null);
    setCreateSaving(true);
    createWhenJsonSnippetAction({
      snippetKey: createForm.snippetKey.trim(),
      labelNl: createForm.labelNl.trim(),
      descriptionNl:
        createForm.descriptionNl.trim() === ''
          ? undefined
          : createForm.descriptionNl.trim(),
      templateJson: createForm.templateJson.trim(),
      isActive: createForm.isActive,
    }).then((result) => {
      setCreateSaving(false);
      if ('error' in result) {
        setCreateError(result.error);
        return;
      }
      showToast({ type: 'success', title: 'Sjabloon opgeslagen' });
      setCreateOpen(false);
      router.refresh();
    });
  };

  const handleEditSubmit = () => {
    setEditError(null);
    setEditSaving(true);
    updateWhenJsonSnippetAction({
      id: editForm.id,
      labelNl: editForm.labelNl.trim(),
      descriptionNl:
        editForm.descriptionNl.trim() === ''
          ? undefined
          : editForm.descriptionNl.trim(),
      templateJson: editForm.templateJson.trim(),
      isActive: editForm.isActive,
    }).then((result) => {
      setEditSaving(false);
      if ('error' in result) {
        setEditError(result.error);
        return;
      }
      showToast({ type: 'success', title: 'Sjabloon bijgewerkt' });
      setEditOpen(false);
      router.refresh();
    });
  };

  if (loadError) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-950/20">
          <Text className="text-red-800 dark:text-red-200">{loadError}</Text>
        </div>
        <Button outline onClick={() => router.refresh()}>
          Opnieuw laden
        </Button>
      </div>
    );
  }

  if (initialData === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            When JSON sjablonen
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sjablonen vullen when_json in de protocol editor; daarna kun je
            aanpassen.
          </p>
        </div>
        <Button outline onClick={openCreate}>
          <PlusIcon />
          Nieuw sjabloon
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table
          className="[--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]"
          striped
        >
          <TableHead>
            <TableRow>
              <TableHeader>Key</TableHeader>
              <TableHeader>Label</TableHeader>
              <TableHeader>Omschrijving</TableHeader>
              <TableHeader>Template</TableHeader>
              <TableHeader>Actief</TableHeader>
              <TableHeader>Bijgewerkt</TableHeader>
              <TableHeader className="w-24"></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {initialData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nog geen sjablonen.
                </TableCell>
              </TableRow>
            ) : (
              initialData.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Text className="font-mono text-sm text-foreground">
                      {row.snippet_key}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text className="text-sm text-foreground">
                      {row.label_nl}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text className="text-sm text-muted-foreground">
                      {row.description_nl
                        ? row.description_nl.length > MAX_DESC_PREVIEW
                          ? `${row.description_nl.slice(0, MAX_DESC_PREVIEW)}…`
                          : row.description_nl
                        : '—'}
                    </Text>
                  </TableCell>
                  <TableCell>
                    {isTemplateValidFromRow(row) ? (
                      <Badge color="zinc">OK</Badge>
                    ) : (
                      <Badge color="red">Ongeldig</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      {togglingId === row.id && (
                        <ArrowPathIcon className="size-4 animate-spin text-muted-foreground" />
                      )}
                      <Switch
                        checked={row.is_active}
                        disabled={togglingId === row.id || isPending}
                        onChange={(checked) => handleToggle(row.id, checked)}
                        color="dark/zinc"
                      />
                    </span>
                  </TableCell>
                  <TableCell>
                    <Text className="text-sm text-muted-foreground">
                      {row.updated_at
                        ? new Date(row.updated_at).toLocaleDateString('nl-NL', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Button
                      plain
                      className="text-sm underline"
                      onClick={() => openEdit(row)}
                    >
                      <PencilIcon className="size-4" />
                      Bewerken
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create modal */}
      <Dialog
        open={createOpen}
        onClose={() => !createSaving && setCreateOpen(false)}
      >
        <DialogTitle>Nieuw sjabloon</DialogTitle>
        <DialogDescription>
          Voeg een when_json-sjabloon toe. Template moet geldige JSON zijn met
          DSL-structuur (all/any/not).
        </DialogDescription>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>Snippet key</Label>
              <Input
                value={createForm.snippetKey}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, snippetKey: e.target.value }))
                }
                placeholder="bijv. default-when"
                disabled={createSaving}
              />
            </Field>
            <Field>
              <Label>Label (NL)</Label>
              <Input
                value={createForm.labelNl}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, labelNl: e.target.value }))
                }
                placeholder="Weergavenaam"
                disabled={createSaving}
              />
            </Field>
            <Field>
              <Label>Omschrijving (NL, optioneel)</Label>
              <Textarea
                value={createForm.descriptionNl}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    descriptionNl: e.target.value,
                  }))
                }
                placeholder="Korte uitleg"
                rows={2}
                disabled={createSaving}
              />
            </Field>
            <Field>
              <Label>Template JSON</Label>
              <Textarea
                value={createForm.templateJson}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    templateJson: e.target.value,
                  }))
                }
                placeholder='{"all": []}'
                rows={6}
                disabled={createSaving}
                className="font-mono text-sm"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {createValidation.status === 'empty' && (
                  <Text className="text-sm text-muted-foreground">
                    Vul JSON in
                  </Text>
                )}
                {createValidation.status === 'invalid-json' && (
                  <>
                    <Badge color="red">Ongeldige JSON</Badge>
                    <Text className="text-sm text-muted-foreground">
                      Controleer haakjes en komma&apos;s.
                    </Text>
                  </>
                )}
                {createValidation.status === 'invalid-dsl' && (
                  <>
                    <Badge color="red">Ongeldige DSL-shape</Badge>
                    {createValidation.issues.map((i, idx) => (
                      <Text
                        key={idx}
                        className="text-sm text-muted-foreground"
                      >{`${i.path}: ${i.message}`}</Text>
                    ))}
                  </>
                )}
                {createValidation.status === 'ok' && (
                  <Badge color="zinc">OK</Badge>
                )}
              </div>
            </Field>
            <Field>
              <div className="flex items-center gap-2">
                <Switch
                  checked={createForm.isActive}
                  onChange={(checked) =>
                    setCreateForm((f) => ({ ...f, isActive: checked }))
                  }
                  disabled={createSaving}
                  color="dark/zinc"
                />
                <Label>Actief</Label>
              </div>
            </Field>
          </FieldGroup>
          {createError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/30 dark:bg-red-950/20">
              <Text className="text-sm text-red-800 dark:text-red-200">
                {createError}
              </Text>
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => !createSaving && setCreateOpen(false)}>
            Annuleren
          </Button>
          <Button
            onClick={handleCreateSubmit}
            disabled={createSaving || !createCanSubmit}
          >
            {createSaving ? (
              <>
                <ArrowPathIcon className="size-4 animate-spin" />
                Opslaan…
              </>
            ) : (
              'Opslaan'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={editOpen} onClose={() => !editSaving && setEditOpen(false)}>
        <DialogTitle>Sjabloon bewerken</DialogTitle>
        <DialogDescription>
          Pas label, omschrijving, template of actief-status aan. Key is
          vastgezet.
        </DialogDescription>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>Snippet key</Label>
              <Input
                value={editForm.snippetKey}
                disabled
                readOnly
                className="bg-muted/50"
              />
            </Field>
            <Field>
              <Label>Label (NL)</Label>
              <Input
                value={editForm.labelNl}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, labelNl: e.target.value }))
                }
                disabled={editSaving}
              />
            </Field>
            <Field>
              <Label>Omschrijving (NL, optioneel)</Label>
              <Textarea
                value={editForm.descriptionNl}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, descriptionNl: e.target.value }))
                }
                rows={2}
                disabled={editSaving}
              />
            </Field>
            <Field>
              <Label>Template JSON</Label>
              <Textarea
                value={editForm.templateJson}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    templateJson: e.target.value,
                  }))
                }
                rows={6}
                disabled={editSaving}
                className="font-mono text-sm"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {editValidation.status === 'empty' && (
                  <Text className="text-sm text-muted-foreground">
                    Vul JSON in
                  </Text>
                )}
                {editValidation.status === 'invalid-json' && (
                  <>
                    <Badge color="red">Ongeldige JSON</Badge>
                    <Text className="text-sm text-muted-foreground">
                      Controleer haakjes en komma&apos;s.
                    </Text>
                  </>
                )}
                {editValidation.status === 'invalid-dsl' && (
                  <>
                    <Badge color="red">Ongeldige DSL-shape</Badge>
                    {editValidation.issues.map((i, idx) => (
                      <Text
                        key={idx}
                        className="text-sm text-muted-foreground"
                      >{`${i.path}: ${i.message}`}</Text>
                    ))}
                  </>
                )}
                {editValidation.status === 'ok' && (
                  <Badge color="zinc">OK</Badge>
                )}
              </div>
            </Field>
            <Field>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editForm.isActive}
                  onChange={(checked) =>
                    setEditForm((f) => ({ ...f, isActive: checked }))
                  }
                  disabled={editSaving}
                  color="dark/zinc"
                />
                <Label>Actief</Label>
              </div>
            </Field>
          </FieldGroup>
          {editError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/30 dark:bg-red-950/20">
              <Text className="text-sm text-red-800 dark:text-red-200">
                {editError}
              </Text>
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => !editSaving && setEditOpen(false)}>
            Annuleren
          </Button>
          <Button
            onClick={handleEditSubmit}
            disabled={editSaving || !editCanSubmit}
          >
            {editSaving ? (
              <>
                <ArrowPathIcon className="size-4 animate-spin" />
                Opslaan…
              </>
            ) : (
              'Opslaan'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
