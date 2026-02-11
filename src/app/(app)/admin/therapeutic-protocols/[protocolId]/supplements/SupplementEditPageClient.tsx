'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/components/catalyst/link';
import {
  ArrowPathIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/20/solid';
import { useToast } from '@/src/components/app/ToastContext';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Textarea } from '@/components/catalyst/textarea';
import { Switch } from '@/components/catalyst/switch';
import { Badge } from '@/components/catalyst/badge';
import { Field, FieldGroup, Label } from '@/components/catalyst/fieldset';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from '@/components/catalyst/dropdown';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { Text } from '@/components/catalyst/text';
import { whenJsonSchema } from '@/src/lib/therapeutic/whenJson.schema';
import type {
  ProtocolEditorProtocol,
  ProtocolEditorSupplement,
  TherapeuticSupplementRuleRow,
  WhenJsonSnippetRow,
} from '../actions/therapeuticProtocolEditor.actions';
import {
  upsertTherapeuticSupplementAction,
  upsertTherapeuticSupplementRuleAction,
  deleteTherapeuticSupplementRuleAction,
  toggleTherapeuticSupplementRuleActiveAction,
  deleteTherapeuticSupplementAction,
} from '../actions/therapeuticProtocolEditor.actions';

type Props = {
  protocol: ProtocolEditorProtocol;
  supplement: ProtocolEditorSupplement;
  rules: TherapeuticSupplementRuleRow[];
  snippets: WhenJsonSnippetRow[];
};

export function SupplementEditPageClient({
  protocol,
  supplement: initialSupplement,
  rules: initialRules,
  snippets,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const t = useTranslations('admin.therapeuticProtocolEditor');

  const RULE_KINDS = [
    { value: 'warning', label: t('ruleKindWarning') },
    { value: 'condition', label: t('ruleKindCondition') },
    { value: 'contraindication', label: t('ruleKindContraindication') },
  ] as const;
  const RULE_SEVERITIES = [
    { value: 'info', label: t('severityInfo') },
    { value: 'warn', label: t('severityWarn') },
    { value: 'error', label: t('severityError') },
  ] as const;

  const [supplementForm, setSupplementForm] = useState({
    labelNl: initialSupplement.label_nl,
    dosageText: initialSupplement.dosage_text ?? (null as string | null),
    notesNl: initialSupplement.notes_nl ?? (null as string | null),
    isActive: initialSupplement.is_active,
  });
  const [supplementError, setSupplementError] = useState<string | null>(null);
  const [supplementSaving, setSupplementSaving] = useState(false);

  const [ruleModal, setRuleModal] = useState<
    | null
    | { mode: 'new'; supplementKey: string }
    | { mode: 'edit'; rule: TherapeuticSupplementRuleRow }
  >(null);
  const [ruleForm, setRuleForm] = useState({
    supplementKey: initialSupplement.supplement_key,
    ruleKey: '',
    kind: 'warning' as string,
    severity: 'info' as string,
    messageNl: '',
    whenJson: '' as string | null,
    isActive: true,
  });
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
  const [selectedSnippetId, setSelectedSnippetId] = useState<string>('');

  const [deleteSupplementSaving, setDeleteSupplementSaving] = useState(false);
  const [deleteSupplementConfirmOpen, setDeleteSupplementConfirmOpen] =
    useState(false);

  const protocolHref = `/admin/therapeutic-protocols/${protocol.id}?tab=supplements`;
  const _supplementsListHref = `/admin/therapeutic-protocols/${protocol.id}`;

  const saveSupplement = () => {
    setSupplementError(null);
    setSupplementSaving(true);
    startTransition(async () => {
      const result = await upsertTherapeuticSupplementAction({
        protocolId: protocol.id,
        supplementKey: initialSupplement.supplement_key,
        labelNl: supplementForm.labelNl.trim(),
        dosageText: supplementForm.dosageText || null,
        notesNl: supplementForm.notesNl || null,
        isActive: supplementForm.isActive,
        id: initialSupplement.id,
      });
      setSupplementSaving(false);
      if ('error' in result) {
        setSupplementError(result.error);
        return;
      }
      showToast({ type: 'success', title: t('toastSupplementSaved') });
      router.refresh();
    });
  };

  const openNewRule = () => {
    setRuleForm({
      supplementKey: initialSupplement.supplement_key,
      ruleKey: '',
      kind: 'warning',
      severity: 'info',
      messageNl: '',
      whenJson: null,
      isActive: true,
    });
    setRuleError(null);
    setSelectedSnippetId('');
    setRuleModal({
      mode: 'new',
      supplementKey: initialSupplement.supplement_key,
    });
  };
  const openEditRule = (rule: TherapeuticSupplementRuleRow) => {
    setRuleForm({
      supplementKey: rule.supplement_key,
      ruleKey: rule.rule_key,
      kind: rule.kind,
      severity: rule.severity,
      messageNl: rule.message_nl,
      whenJson:
        rule.when_json != null ? JSON.stringify(rule.when_json, null, 2) : null,
      isActive: rule.is_active,
    });
    setRuleError(null);
    setSelectedSnippetId('');
    setRuleModal({ mode: 'edit', rule });
  };
  const saveRule = () => {
    setRuleError(null);
    const supplementKey = ruleForm.supplementKey.trim();
    const ruleKey = ruleForm.ruleKey.trim();
    const messageNl = ruleForm.messageNl.trim();
    if (
      supplementKey.length < 2 ||
      ruleKey.length < 2 ||
      messageNl.length < 5
    ) {
      setRuleError(t('ruleValidationError'));
      return;
    }
    setRuleSaving(true);
    const payload = {
      protocolId: protocol.id,
      supplementKey,
      ruleKey,
      kind: ruleForm.kind as 'warning' | 'condition' | 'contraindication',
      severity: ruleForm.severity as 'info' | 'warn' | 'error',
      messageNl,
      whenJson: ruleForm.whenJson?.trim() || undefined,
      isActive: ruleForm.isActive,
    };
    startTransition(async () => {
      const result =
        ruleModal && ruleModal.mode === 'edit'
          ? await upsertTherapeuticSupplementRuleAction({
              ...payload,
              id: ruleModal.rule.id,
            })
          : await upsertTherapeuticSupplementRuleAction(payload);
      setRuleSaving(false);
      if ('error' in result) {
        setRuleError(result.error);
        return;
      }
      setRuleModal(null);
      showToast({ type: 'success', title: t('toastRuleSaved') });
      router.refresh();
    });
  };
  const confirmDeleteRule = () => {
    if (!deleteRuleId) return;
    startTransition(async () => {
      const result = await deleteTherapeuticSupplementRuleAction({
        id: deleteRuleId,
      });
      setDeleteRuleId(null);
      if ('error' in result) {
        showToast({
          type: 'error',
          title: t('toastDeleteError'),
          description: result.error,
        });
        return;
      }
      showToast({ type: 'success', title: t('toastRuleDeleted') });
      router.refresh();
    });
  };
  const handleRuleToggle = (id: string, nextActive: boolean) => {
    setTogglingRuleId(id);
    startTransition(async () => {
      const result = await toggleTherapeuticSupplementRuleActiveAction({
        id,
        isActive: nextActive,
      });
      setTogglingRuleId(null);
      if ('error' in result) {
        showToast({
          type: 'error',
          title: t('toastToggleError'),
          description: result.error,
        });
        return;
      }
      showToast({ type: 'success', title: t('toastRuleUpdated') });
      router.refresh();
    });
  };

  const invalidWhenCount = initialRules.filter(
    (r) => r.whenJsonStatus === 'invalid',
  ).length;

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
          {t('supplementModalEdit')} · {initialSupplement.supplement_key}
        </h1>
        <Button
          outline
          disabled={deleteSupplementSaving}
          className="text-red-600 dark:text-red-400"
          onClick={() => setDeleteSupplementConfirmOpen(true)}
        >
          {t('delete')}
        </Button>
      </div>

      {/* Supplement form */}
      <section className="mb-10">
        {supplementError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">
            {supplementError}
          </div>
        )}
        <FieldGroup>
          <Field>
            <Label>{t('supplementKeyCol')}</Label>
            <Input
              value={initialSupplement.supplement_key}
              disabled
              className="bg-zinc-50 dark:bg-zinc-800"
            />
          </Field>
          <Field>
            <Label>{t('labelNlCol')}</Label>
            <Input
              value={supplementForm.labelNl}
              onChange={(e) =>
                setSupplementForm((f) => ({ ...f, labelNl: e.target.value }))
              }
              disabled={supplementSaving}
            />
          </Field>
          <Field>
            <Label>{t('dosageOptional')}</Label>
            <Input
              value={supplementForm.dosageText ?? ''}
              onChange={(e) =>
                setSupplementForm((f) => ({
                  ...f,
                  dosageText: e.target.value || null,
                }))
              }
              disabled={supplementSaving}
            />
          </Field>
          <Field>
            <Label>{t('notesOptional')}</Label>
            <Textarea
              value={supplementForm.notesNl ?? ''}
              onChange={(e) =>
                setSupplementForm((f) => ({
                  ...f,
                  notesNl: e.target.value || null,
                }))
              }
              disabled={supplementSaving}
            />
          </Field>
          <Field>
            <div className="flex items-center gap-2">
              <Switch
                checked={supplementForm.isActive}
                onChange={(checked) =>
                  setSupplementForm((f) => ({ ...f, isActive: checked }))
                }
                disabled={supplementSaving}
                color="dark/zinc"
              />
              <Label>{t('activeLabel')}</Label>
            </div>
          </Field>
        </FieldGroup>
        <div className="mt-4 flex gap-3">
          <Button onClick={saveSupplement} disabled={supplementSaving}>
            {supplementSaving ? t('saving') : t('save')}
          </Button>
          <Button
            outline
            disabled={supplementSaving}
            onClick={() => router.push(protocolHref)}
          >
            {t('cancel')}
          </Button>
        </div>
      </section>

      {/* Rules */}
      <section className="border-t border-zinc-200 pt-6 dark:border-zinc-700">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-white">
            {t('supplementRules')}
          </h2>
          <Button outline className="text-sm" onClick={openNewRule}>
            <PlusIcon className="h-4 w-4" />
            {t('newRule')}
          </Button>
        </div>
        {invalidWhenCount > 0 && (
          <p className="mb-2 text-sm text-amber-600 dark:text-amber-400">
            {t('invalidWhenJsonWarning', { count: invalidWhenCount })}
          </p>
        )}
        <div className="max-h-64 overflow-x-auto overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
          <Table className="[--gutter:--spacing(3)]" striped>
            <TableHead>
              <TableRow>
                <TableHeader className="px-3 py-2 text-xs">
                  {t('ruleKeyCol')}
                </TableHeader>
                <TableHeader className="px-3 py-2 text-xs">
                  {t('kindCol')}
                </TableHeader>
                <TableHeader className="px-3 py-2 text-xs">
                  {t('severityCol')}
                </TableHeader>
                <TableHeader className="px-3 py-2 text-xs">
                  {t('activeCol')}
                </TableHeader>
                <TableHeader className="px-3 py-2 text-xs">
                  {t('messageCol')}
                </TableHeader>
                <TableHeader
                  className="w-12 px-2 py-2"
                  aria-label={t('actionsCol')}
                />
              </TableRow>
            </TableHead>
            <TableBody>
              {initialRules.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    {t('noRulesForSupplement')}
                  </TableCell>
                </TableRow>
              ) : (
                initialRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="px-3 py-2 font-mono text-xs font-medium text-zinc-900 dark:text-white">
                      {rule.rule_key}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {rule.kind}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {rule.severity}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <Switch
                        checked={rule.is_active}
                        disabled={togglingRuleId === rule.id || isPending}
                        onChange={(checked) =>
                          handleRuleToggle(rule.id, checked)
                        }
                        color="dark/zinc"
                      />
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {rule.message_nl}
                    </TableCell>
                    <TableCell className="w-12 px-2 py-2">
                      <Dropdown>
                        <DropdownButton
                          as={Button}
                          plain
                          className="rounded p-1.5"
                          aria-label={t('actionsCol')}
                        >
                          <EllipsisVerticalIcon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                        </DropdownButton>
                        <DropdownMenu anchor="bottom end">
                          <DropdownItem onClick={() => openEditRule(rule)}>
                            <PencilIcon className="h-4 w-4" />
                            {t('edit')}
                          </DropdownItem>
                          <DropdownItem
                            onClick={() => setDeleteRuleId(rule.id)}
                            className="text-red-600 data-focus:bg-red-50 data-focus:text-red-700 dark:text-red-400 dark:data-focus:bg-red-900/20 dark:data-focus:text-red-300"
                          >
                            <TrashIcon className="h-4 w-4" />
                            {t('delete')}
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Rule modal */}
      <Dialog
        open={ruleModal !== null}
        onClose={() => {
          if (!ruleSaving) setRuleModal(null);
        }}
        size="md"
      >
        {ruleModal !== null && (
          <>
            <DialogTitle>
              {ruleModal.mode === 'new'
                ? t('ruleModalNew')
                : t('ruleModalEdit')}
            </DialogTitle>
            <DialogBody>
              <Text className="mb-4 block text-sm text-zinc-600 dark:text-zinc-400">
                Definieer een regel voor dit supplement: onder welke
                omstandigheden moet het bericht (message_nl) getoond worden? Vul
                optioneel een voorwaarde in (JSON); een sjabloon kan dat veld
                voor je invullen.
              </Text>
              {ruleError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">
                  {ruleError}
                </div>
              )}
              <FieldGroup>
                <Field>
                  <Label>{t('supplementKeyCol')}</Label>
                  <Input
                    value={ruleForm.supplementKey}
                    disabled
                    className="bg-zinc-50 dark:bg-zinc-800"
                  />
                </Field>
                <Field>
                  <Label>{t('ruleKeyCol')}</Label>
                  <Input
                    value={ruleForm.ruleKey}
                    onChange={(e) =>
                      setRuleForm((f) => ({ ...f, ruleKey: e.target.value }))
                    }
                    disabled={ruleSaving || ruleModal.mode === 'edit'}
                  />
                </Field>
                <Field>
                  <Label>{t('kindLabel')}</Label>
                  <Listbox
                    value={ruleForm.kind}
                    onChange={(v) =>
                      setRuleForm((f) => ({ ...f, kind: v as string }))
                    }
                    disabled={ruleSaving}
                    className="min-w-[180px]"
                  >
                    {RULE_KINDS.map((k) => (
                      <ListboxOption key={k.value} value={k.value}>
                        {k.label}
                      </ListboxOption>
                    ))}
                  </Listbox>
                </Field>
                <Field>
                  <Label>{t('severityLabel')}</Label>
                  <Listbox
                    value={ruleForm.severity}
                    onChange={(v) =>
                      setRuleForm((f) => ({ ...f, severity: v as string }))
                    }
                    disabled={ruleSaving}
                    className="min-w-[120px]"
                  >
                    {RULE_SEVERITIES.map((s) => (
                      <ListboxOption key={s.value} value={s.value}>
                        {s.label}
                      </ListboxOption>
                    ))}
                  </Listbox>
                </Field>
                <Field>
                  <Label>message_nl</Label>
                  <Textarea
                    value={ruleForm.messageNl}
                    onChange={(e) =>
                      setRuleForm((f) => ({ ...f, messageNl: e.target.value }))
                    }
                    disabled={ruleSaving}
                    rows={3}
                  />
                </Field>
                <Field>
                  <Label>Sjabloon</Label>
                  <Listbox
                    value={selectedSnippetId}
                    onChange={(id) => {
                      setSelectedSnippetId(id);
                      if (id === '') return;
                      const snippet = snippets.find((s) => s.id === id);
                      if (snippet) {
                        setRuleForm((f) => ({
                          ...f,
                          whenJson: JSON.stringify(
                            snippet.template_json,
                            null,
                            2,
                          ),
                        }));
                      }
                    }}
                    aria-label="Sjabloon when_json"
                    placeholder="— Kies sjabloon —"
                    className="mt-2"
                  >
                    <ListboxOption value="">— Kies sjabloon —</ListboxOption>
                    {snippets.map((snippet) => (
                      <ListboxOption key={snippet.id} value={snippet.id}>
                        <span className="flex flex-wrap items-center gap-2">
                          <span>{snippet.label_nl}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {snippet.snippet_key}
                          </span>
                          {!snippet.is_active && (
                            <Badge color="zinc">Inactief</Badge>
                          )}
                        </span>
                      </ListboxOption>
                    ))}
                  </Listbox>
                  <Text className="mt-1 text-xs text-muted-foreground">
                    Selecteren vult het veld «Voorwaarde – JSON»; je kunt daarna
                    aanpassen. Sjablonen aanmaken of bewerken kan in{' '}
                    <Link
                      href="/admin/therapeutic-when-json-snippets"
                      className="text-primary-600 hover:underline dark:text-primary-400"
                    >
                      Admin → When JSON-snippets
                    </Link>
                    .
                  </Text>
                </Field>
                <Field>
                  <Label>{t('whenJsonOptional')}</Label>
                  <Textarea
                    value={ruleForm.whenJson ?? ''}
                    onChange={(e) =>
                      setRuleForm((f) => ({
                        ...f,
                        whenJson: e.target.value || null,
                      }))
                    }
                    disabled={ruleSaving}
                    placeholder="{ ... }"
                    rows={3}
                  />
                  {(() => {
                    const whenJsonText = (ruleForm.whenJson ?? '').trim();
                    if (whenJsonText === '') {
                      return (
                        <Text className="mt-1.5 text-xs text-muted-foreground">
                          Geen voorwaarden
                        </Text>
                      );
                    }
                    let parsed: unknown;
                    try {
                      parsed = JSON.parse(whenJsonText);
                    } catch {
                      return (
                        <div className="mt-1.5 space-y-0.5">
                          <span className="inline-flex items-center">
                            <Badge color="red">Ongeldige JSON</Badge>
                          </span>
                          <Text className="block text-xs text-muted-foreground">
                            Controleer komma&apos;s/aanhalingstekens.
                          </Text>
                        </div>
                      );
                    }
                    const result = whenJsonSchema.safeParse(parsed);
                    if (!result.success) {
                      const issues = result.error.issues
                        .slice(0, 2)
                        .map((issue) => {
                          const path =
                            issue.path.length > 0
                              ? issue.path.join('.') + ': '
                              : '';
                          return path + issue.message;
                        });
                      return (
                        <div className="mt-1.5 space-y-0.5">
                          <span className="inline-flex items-center">
                            <Badge color="red">Ongeldige DSL-shape</Badge>
                          </span>
                          {issues.map((msg, i) => (
                            <Text
                              key={i}
                              className="block text-xs text-muted-foreground"
                            >
                              {msg}
                            </Text>
                          ))}
                        </div>
                      );
                    }
                    const keys = Object.keys(result.data).filter(
                      (k) => k === 'all' || k === 'any' || k === 'not',
                    );
                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge color="zinc">OK</Badge>
                        <Text className="text-xs text-muted-foreground">
                          {keys.length > 0
                            ? `Keys: ${keys.join(', ')}`
                            : 'Geen all/any/not'}
                        </Text>
                      </div>
                    );
                  })()}
                </Field>
                <Field>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={ruleForm.isActive}
                      onChange={(checked) =>
                        setRuleForm((f) => ({ ...f, isActive: checked }))
                      }
                      disabled={ruleSaving}
                      color="dark/zinc"
                    />
                    <Label>{t('activeLabel')}</Label>
                  </div>
                </Field>
              </FieldGroup>
            </DialogBody>
            <DialogActions>
              <Button
                outline
                onClick={() => {
                  if (!ruleSaving) setRuleModal(null);
                }}
                disabled={ruleSaving}
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={saveRule}
                disabled={
                  ruleSaving ||
                  ruleForm.ruleKey.trim().length < 2 ||
                  ruleForm.messageNl.trim().length < 5
                }
              >
                {ruleSaving && (
                  <ArrowPathIcon
                    className="mr-2 size-4 animate-spin"
                    data-slot="icon"
                    aria-hidden
                  />
                )}
                {ruleSaving ? t('saving') : t('save')}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleteRuleId !== null}
        onClose={() => setDeleteRuleId(null)}
        onConfirm={confirmDeleteRule}
        title={t('confirmDeleteRule')}
        description={t('confirmDeleteRuleDescription')}
        confirmLabel={t('delete')}
        isLoading={isPending}
      />
      <ConfirmDialog
        open={deleteSupplementConfirmOpen}
        onClose={() => setDeleteSupplementConfirmOpen(false)}
        onConfirm={async () => {
          setDeleteSupplementSaving(true);
          const result = await deleteTherapeuticSupplementAction({
            id: initialSupplement.id,
          });
          setDeleteSupplementSaving(false);
          setDeleteSupplementConfirmOpen(false);
          if ('error' in result) {
            showToast({
              type: 'error',
              title: t('toastDeleteError'),
              description: result.error,
            });
            return;
          }
          showToast({ type: 'success', title: t('toastSupplementDeleted') });
          router.push(protocolHref);
        }}
        title={t('confirmDeleteSupplement')}
        description={t('confirmDeleteSupplementDescription')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        confirmColor="red"
        isLoading={deleteSupplementSaving}
      />
    </>
  );
}
