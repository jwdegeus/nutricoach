'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/components/catalyst/link';
import {
  ArrowLeftIcon,
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
import type {
  TherapeuticProtocolEditorData,
  ProtocolEditorTarget,
} from '../actions/therapeuticProtocolEditor.actions';
import {
  upsertTherapeuticTargetAction,
  deleteTherapeuticTargetAction,
  toggleTherapeuticSupplementActiveAction,
  cloneTherapeuticProtocolAction,
  updateProtocolSourceRefsAction,
  deleteTherapeuticSupplementAction,
  type SourceRefItem,
} from '../actions/therapeuticProtocolEditor.actions';

const TARGET_KIND_ALL = '';

function parseSourceRefs(raw: unknown): SourceRefItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): SourceRefItem | null => {
      if (
        r &&
        typeof r === 'object' &&
        'title' in r &&
        typeof (r as { title?: string }).title === 'string'
      ) {
        const t = r as { title: string; url?: string };
        return {
          title: t.title,
          url:
            typeof t.url === 'string' && t.url.trim()
              ? t.url.trim()
              : undefined,
        };
      }
      return null;
    })
    .filter((x): x is SourceRefItem => x != null);
}

type TabId = 'targets' | 'supplements' | 'sources';

type Props = {
  initialData: TherapeuticProtocolEditorData;
};

export function TherapeuticProtocolEditorClient({ initialData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const t = useTranslations('admin.therapeuticProtocolEditor');
  const [activeTab, setActiveTab] = useState<TabId>('targets');

  const PERIODS = [
    { value: 'daily', label: t('periodDaily') },
    { value: 'weekly', label: t('periodWeekly') },
  ] as const;
  const TARGET_KINDS = [
    { value: TARGET_KIND_ALL, label: t('targetKindAll') },
    { value: 'food_group', label: t('targetKindFoodGroup') },
    { value: 'macro', label: t('targetKindMacro') },
    { value: 'micro', label: t('targetKindMicro') },
    { value: 'variety', label: t('targetKindVariety') },
    { value: 'frequency', label: t('targetKindFrequency') },
  ] as const;
  const VALUE_TYPES = [
    { value: 'absolute', label: t('valueTypeAbsolute') },
    { value: 'adh_percent', label: t('valueTypeAdhPercent') },
    { value: 'count', label: t('valueTypeCount') },
  ] as const;
  const [periodFilter, setPeriodFilter] = useState<'daily' | 'weekly'>('daily');
  const [targetSearch, setTargetSearch] = useState('');
  const [targetKindFilter, setTargetKindFilter] =
    useState<string>(TARGET_KIND_ALL);
  const [supplementSearch, setSupplementSearch] = useState('');
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [cloneForm, setCloneForm] = useState({
    protocolKey: '',
    nameNl: '',
    version: '' as string | null,
    descriptionNl: '' as string | null,
    isActive: false,
  });
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneSaving, setCloneSaving] = useState(false);

  const [sourceRefs, setSourceRefs] = useState<SourceRefItem[]>(() =>
    parseSourceRefs(initialData.protocol.source_refs),
  );
  const [sourceModal, setSourceModal] = useState<
    null | 'new' | { editIndex: number }
  >(null);
  const [sourceForm, setSourceForm] = useState({ title: '', url: '' });
  const [sourceSaving, setSourceSaving] = useState(false);
  const [deleteSourceIndex, setDeleteSourceIndex] = useState<number | null>(
    null,
  );
  const [deleteSourceSaving, setDeleteSourceSaving] = useState(false);
  const [deleteSupplementId, setDeleteSupplementId] = useState<string | null>(
    null,
  );
  const [deleteSupplementSaving, setDeleteSupplementSaving] = useState(false);

  useEffect(() => {
    setSourceRefs(parseSourceRefs(initialData.protocol.source_refs));
  }, [initialData.protocol.source_refs]);

  const [targetModal, setTargetModal] = useState<
    null | 'new' | { type: 'edit'; target: ProtocolEditorTarget }
  >(null);
  const [targetForm, setTargetForm] = useState({
    period: 'daily' as 'daily' | 'weekly',
    targetKind: 'macro' as string,
    targetKey: '',
    valueNum: 0,
    valueType: 'absolute' as string,
    unit: '' as string | null,
  });
  const [targetError, setTargetError] = useState<string | null>(null);
  const [targetSaving, setTargetSaving] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [togglingSupplementId, setTogglingSupplementId] = useState<
    string | null
  >(null);

  const { protocol, targets, supplements } = initialData;

  const filteredTargets = (() => {
    let list =
      periodFilter === 'daily'
        ? targets.filter((t) => t.period === 'daily')
        : targets.filter((t) => t.period === 'weekly');
    if (targetKindFilter !== TARGET_KIND_ALL) {
      list = list.filter((t) => t.target_kind === targetKindFilter);
    }
    const q = targetSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => (t.target_key ?? '').toLowerCase().includes(q));
    }
    return list;
  })();

  const filteredSupplements = (() => {
    const q = supplementSearch.trim().toLowerCase();
    if (!q) return supplements;
    return supplements.filter(
      (s) =>
        (s.supplement_key ?? '').toLowerCase().includes(q) ||
        (s.label_nl ?? '').toLowerCase().includes(q),
    );
  })();

  const openNewTarget = () => {
    setTargetForm({
      period: periodFilter,
      targetKind: 'macro',
      targetKey: '',
      valueNum: 0,
      valueType: 'absolute',
      unit: null,
    });
    setTargetError(null);
    setTargetModal('new');
  };
  const openEditTarget = (target: ProtocolEditorTarget) => {
    setTargetForm({
      period: target.period as 'daily' | 'weekly',
      targetKind: target.target_kind,
      targetKey: target.target_key,
      valueNum: target.value_num,
      valueType: target.value_type,
      unit: target.unit ?? null,
    });
    setTargetError(null);
    setTargetModal({ type: 'edit', target });
  };
  const saveTarget = () => {
    setTargetError(null);
    setTargetSaving(true);
    const payload = {
      protocolId: protocol.id,
      period: targetForm.period,
      targetKind: targetForm.targetKind as
        | 'macro'
        | 'micro'
        | 'food_group'
        | 'variety'
        | 'frequency',
      targetKey: targetForm.targetKey.trim(),
      valueNum: Number(targetForm.valueNum),
      valueType: targetForm.valueType as 'absolute' | 'adh_percent' | 'count',
      unit:
        targetForm.valueType === 'adh_percent'
          ? '%_adh'
          : targetForm.valueType === 'count'
            ? null
            : targetForm.unit || null,
    };
    startTransition(async () => {
      const result =
        targetModal && targetModal !== 'new'
          ? await upsertTherapeuticTargetAction({
              ...payload,
              id: targetModal.target.id,
            })
          : await upsertTherapeuticTargetAction(payload);
      setTargetSaving(false);
      if ('error' in result) {
        setTargetError(result.error);
        return;
      }
      setTargetModal(null);
      showToast({ type: 'success', title: t('toastTargetSaved') });
      router.refresh();
    });
  };

  const confirmDeleteTarget = () => {
    if (!deleteTargetId) return;
    startTransition(async () => {
      const result = await deleteTherapeuticTargetAction({
        id: deleteTargetId,
      });
      setDeleteTargetId(null);
      if ('error' in result) {
        showToast({
          type: 'error',
          title: t('toastDeleteError'),
          description: result.error,
        });
        return;
      }
      showToast({ type: 'success', title: t('toastTargetDeleted') });
      router.refresh();
    });
  };

  const handleCloneSubmit = () => {
    setCloneError(null);
    setCloneSaving(true);
    startTransition(async () => {
      const result = await cloneTherapeuticProtocolAction({
        sourceProtocolId: protocol.id,
        protocolKey: cloneForm.protocolKey.trim(),
        nameNl: cloneForm.nameNl.trim(),
        descriptionNl: cloneForm.descriptionNl?.trim() || null,
        version: cloneForm.version?.trim() || null,
        isActive: cloneForm.isActive,
      });
      setCloneSaving(false);
      if ('error' in result) {
        setCloneError(result.error);
        return;
      }
      setCloneModalOpen(false);
      showToast({ type: 'success', title: t('toastProtocolCloned') });
      router.push(`/admin/therapeutic-protocols/${result.data.newProtocolId}`);
    });
  };

  const handleSupplementToggle = (id: string, nextActive: boolean) => {
    setTogglingSupplementId(id);
    startTransition(async () => {
      const result = await toggleTherapeuticSupplementActiveAction({
        id,
        isActive: nextActive,
      });
      setTogglingSupplementId(null);
      if ('error' in result) {
        showToast({
          type: 'error',
          title: t('toastToggleError'),
          description: result.error,
        });
        return;
      }
      showToast({
        type: 'success',
        title: nextActive
          ? t('toastSupplementActivated')
          : t('toastSupplementDeactivated'),
      });
      router.refresh();
    });
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'targets', label: t('tabsTargets') },
    { id: 'supplements', label: t('tabsSupplements') },
    { id: 'sources', label: t('tabsSources') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/therapeutic-protocols"
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label={t('back')}
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
              {protocol.name_nl}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge color={protocol.is_active ? 'green' : 'zinc'}>
                {protocol.is_active ? t('activeLabel') : t('inactiveLabel')}
              </Badge>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                {protocol.protocol_key}
                {protocol.version ? ` · v${protocol.version}` : ''}
              </Text>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button outline href="/admin/therapeutic-when-json-snippets">
            {t('whenJsonSnippetsLink')}
          </Button>
          <Button
            outline
            onClick={() => {
              setCloneForm({
                protocolKey: `${protocol.protocol_key}_kopie`.slice(0, 100),
                nameNl: `${protocol.name_nl} (kopie)`.slice(0, 200),
                version: protocol.version ?? null,
                descriptionNl: protocol.description_nl ?? null,
                isActive: false,
              });
              setCloneError(null);
              setCloneModalOpen(true);
            }}
          >
            {t('copy')}
          </Button>
        </div>
      </div>

      <div className="border-b border-zinc-200 dark:border-zinc-700">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 py-4 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'targets' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Listbox
              value={periodFilter}
              onChange={(v) => setPeriodFilter(v as 'daily' | 'weekly')}
              aria-label={t('period')}
              className="min-w-[140px]"
            >
              {PERIODS.map((p) => (
                <ListboxOption key={p.value} value={p.value}>
                  {p.label}
                </ListboxOption>
              ))}
            </Listbox>
            <Listbox
              value={targetKindFilter}
              onChange={(v) => setTargetKindFilter(v as string)}
              aria-label={t('targetKindCol')}
              className="min-w-[140px]"
            >
              {TARGET_KINDS.map((k) => (
                <ListboxOption key={k.value || 'all'} value={k.value}>
                  {k.label}
                </ListboxOption>
              ))}
            </Listbox>
            <Input
              type="search"
              placeholder={t('searchTargetPlaceholder')}
              value={targetSearch}
              onChange={(e) => setTargetSearch(e.target.value)}
              className="min-w-[200px]"
              aria-label={t('searchTargetsAria')}
            />
            <Button onClick={openNewTarget}>
              <PlusIcon className="h-4 w-4" />
              {t('newTarget')}
            </Button>
          </div>
          <Text className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('resultsCount', { count: filteredTargets.length })}
          </Text>
          <div className="flow-root">
            <Table
              className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]"
              striped
            >
              <TableHead>
                <TableRow>
                  <TableHeader className="py-3 px-4">
                    {t('targetKindCol')}
                  </TableHeader>
                  <TableHeader className="py-3 px-4">
                    {t('targetKeyCol')}
                  </TableHeader>
                  <TableHeader className="py-3 px-4">
                    {t('valueTypeCol')}
                  </TableHeader>
                  <TableHeader className="py-3 px-4">
                    {t('valueNumCol')}
                  </TableHeader>
                  <TableHeader className="py-3 px-4">
                    {t('unitCol')}
                  </TableHeader>
                  <TableHeader
                    className="w-12 py-3 px-2"
                    aria-label={t('actionsCol')}
                  />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTargets.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 px-4 text-center text-zinc-500 dark:text-zinc-400"
                    >
                      {t('noTargetsForFilters')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTargets.map((row) => (
                    <TableRow
                      key={row.id}
                      onClick={() => openEditTarget(row)}
                      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <TableCell className="py-3 px-4 font-mono text-sm font-medium text-zinc-900 dark:text-white">
                        {row.target_kind}
                      </TableCell>
                      <TableCell className="py-3 px-4 font-medium text-zinc-900 dark:text-white max-w-[200px] truncate">
                        {row.target_key}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                        {row.value_type}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                        {row.value_num}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                        {row.unit ?? '—'}
                      </TableCell>
                      <TableCell
                        className="py-3 px-2 w-12"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Dropdown>
                          <DropdownButton
                            as={Button}
                            plain
                            className="rounded-lg p-2"
                            aria-label={t('actionsCol')}
                            onClick={(e: React.MouseEvent) =>
                              e.stopPropagation()
                            }
                          >
                            <EllipsisVerticalIcon className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem onClick={() => openEditTarget(row)}>
                              <PencilIcon className="h-4 w-4" />
                              {t('edit')}
                            </DropdownItem>
                            <DropdownItem
                              onClick={() => setDeleteTargetId(row.id)}
                              className="text-red-600 dark:text-red-400 data-focus:bg-red-50 data-focus:text-red-700 dark:data-focus:bg-red-900/20 dark:data-focus:text-red-300"
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
        </div>
      )}

      {activeTab === 'supplements' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              type="search"
              placeholder={t('searchSupplementPlaceholder')}
              value={supplementSearch}
              onChange={(e) => setSupplementSearch(e.target.value)}
              className="min-w-[200px]"
              aria-label={t('searchSupplementsAria')}
            />
            <Button
              href={`/admin/therapeutic-protocols/${protocol.id}/supplements/new`}
            >
              <PlusIcon className="h-4 w-4" />
              {t('newSupplement')}
            </Button>
          </div>
          <Text className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('resultsCount', { count: filteredSupplements.length })}
          </Text>
          <div className="flow-root">
            <Table
              className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]"
              striped
            >
              <TableHead>
                <TableRow>
                  <TableHeader className="py-3 px-4">
                    {t('supplementKeyCol')}
                  </TableHeader>
                  <TableHeader className="py-3 px-4">
                    {t('labelNlCol')}
                  </TableHeader>
                  <TableHeader className="py-3 px-4">
                    {t('dosageTextCol')}
                  </TableHeader>
                  <TableHeader className="py-3 px-4">
                    {t('activeCol')}
                  </TableHeader>
                  <TableHeader
                    className="w-12 py-3 px-2"
                    aria-label={t('edit')}
                  />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSupplements.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 px-4 text-center text-zinc-500 dark:text-zinc-400"
                    >
                      {t('noSupplements')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSupplements.map((row) => (
                    <TableRow
                      key={row.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <TableCell className="py-3 px-4 font-mono text-sm font-medium text-zinc-900 dark:text-white max-w-[140px] truncate">
                        <Link
                          href={`/admin/therapeutic-protocols/${protocol.id}/supplements/${row.id}/edit`}
                          className="text-primary-600 hover:underline dark:text-primary-400"
                        >
                          {row.supplement_key}
                        </Link>
                      </TableCell>
                      <TableCell className="py-3 px-4 font-medium text-zinc-900 dark:text-white max-w-[200px] truncate">
                        {row.label_nl}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-zinc-600 dark:text-zinc-400 max-w-[240px] truncate">
                        {row.dosage_text ?? '—'}
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <Switch
                          checked={row.is_active}
                          disabled={
                            togglingSupplementId === row.id || isPending
                          }
                          onChange={(checked) =>
                            handleSupplementToggle(row.id, checked)
                          }
                          color="dark/zinc"
                        />
                      </TableCell>
                      <TableCell className="py-3 px-2 w-12">
                        <Dropdown>
                          <DropdownButton
                            as={Button}
                            plain
                            className="rounded-lg p-2"
                            aria-label={t('actionsCol')}
                          >
                            <EllipsisVerticalIcon className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem
                              href={`/admin/therapeutic-protocols/${protocol.id}/supplements/${row.id}/edit`}
                            >
                              <PencilIcon className="h-4 w-4" />
                              {t('edit')}
                            </DropdownItem>
                            <DropdownItem
                              onClick={() => setDeleteSupplementId(row.id)}
                              className="text-red-600 dark:text-red-400 data-focus:bg-red-50 data-focus:text-red-700 dark:data-focus:bg-red-900/20 dark:data-focus:text-red-300"
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
        </div>
      )}

      {activeTab === 'sources' && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="space-y-6 p-6">
            {protocol.description_nl && (
              <div>
                <h3 className="text-sm font-medium text-zinc-900 dark:text-white">
                  {t('description')}
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                  {protocol.description_nl}
                </p>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-medium text-zinc-900 dark:text-white">
                  {t('sourcesRefs')}
                </h3>
                <Button
                  onClick={() => {
                    setSourceForm({ title: '', url: '' });
                    setSourceModal('new');
                  }}
                >
                  <PlusIcon className="h-4 w-4" />
                  {t('sourceAdd')}
                </Button>
              </div>
              {sourceRefs.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {t('noSources')}
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {sourceRefs.map((ref, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        {ref.url ? (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                          >
                            {ref.title}
                          </a>
                        ) : (
                          <span className="text-sm font-medium text-zinc-900 dark:text-white">
                            {ref.title}
                          </span>
                        )}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          plain
                          className="p-2"
                          aria-label={t('edit')}
                          onClick={() => {
                            setSourceForm({
                              title: ref.title,
                              url: ref.url ?? '',
                            });
                            setSourceModal({ editIndex: index });
                          }}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          plain
                          className="p-2 text-red-600 dark:text-red-400"
                          aria-label={t('delete')}
                          onClick={() => setDeleteSourceIndex(index)}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Source ref modal (add/edit) */}
      <Dialog
        open={sourceModal !== null}
        onClose={() => {
          if (!sourceSaving) setSourceModal(null);
        }}
        size="md"
      >
        {sourceModal !== null && (
          <>
            <DialogTitle>
              {sourceModal === 'new'
                ? t('sourceModalNew')
                : t('sourceModalEdit')}
            </DialogTitle>
            <DialogBody>
              <FieldGroup>
                <Field>
                  <Label>{t('sourceTitle')}</Label>
                  <Input
                    value={sourceForm.title}
                    onChange={(e) =>
                      setSourceForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder={t('sourceTitlePlaceholder')}
                    disabled={sourceSaving}
                  />
                </Field>
                <Field>
                  <Label>{t('sourceUrl')}</Label>
                  <Input
                    type="url"
                    value={sourceForm.url}
                    onChange={(e) =>
                      setSourceForm((f) => ({ ...f, url: e.target.value }))
                    }
                    placeholder={t('sourceUrlPlaceholder')}
                    disabled={sourceSaving}
                  />
                </Field>
              </FieldGroup>
            </DialogBody>
            <DialogActions>
              <Button
                plain
                onClick={() => setSourceModal(null)}
                disabled={sourceSaving}
              >
                {t('cancel')}
              </Button>
              <Button
                disabled={sourceSaving || !sourceForm.title.trim()}
                onClick={async () => {
                  const title = sourceForm.title.trim();
                  const url = sourceForm.url.trim() || undefined;
                  const next =
                    sourceModal === 'new'
                      ? [...sourceRefs, { title, url }]
                      : sourceRefs.map((r, i) =>
                          i === sourceModal.editIndex ? { title, url } : r,
                        );
                  setSourceSaving(true);
                  const result = await updateProtocolSourceRefsAction({
                    protocolId: protocol.id,
                    sourceRefs: next,
                  });
                  setSourceSaving(false);
                  if ('error' in result) {
                    showToast({
                      type: 'error',
                      title: t('toastSourcesError'),
                      description: result.error,
                    });
                    return;
                  }
                  setSourceRefs(next);
                  setSourceModal(null);
                  setSourceForm({ title: '', url: '' });
                  router.refresh();
                  showToast({ type: 'success', title: t('toastSourcesSaved') });
                }}
              >
                {sourceSaving ? t('saving') : t('save')}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Confirm delete source */}
      <ConfirmDialog
        open={deleteSourceIndex !== null}
        onClose={() => {
          if (!deleteSourceSaving) setDeleteSourceIndex(null);
        }}
        onConfirm={async () => {
          if (deleteSourceIndex == null) return;
          const next = sourceRefs.filter((_, i) => i !== deleteSourceIndex);
          setDeleteSourceSaving(true);
          const result = await updateProtocolSourceRefsAction({
            protocolId: protocol.id,
            sourceRefs: next,
          });
          setDeleteSourceSaving(false);
          if ('error' in result) {
            showToast({
              type: 'error',
              title: t('toastSourcesError'),
              description: result.error,
            });
            return;
          }
          setDeleteSourceIndex(null);
          setSourceRefs(next);
          router.refresh();
          showToast({ type: 'success', title: t('toastSourcesSaved') });
        }}
        title={t('confirmDeleteSource')}
        description={t('confirmDeleteSourceDescription')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        confirmColor="red"
        isLoading={deleteSourceSaving}
      />

      {/* Target modal */}
      <Dialog
        open={targetModal !== null}
        onClose={() => {
          if (!targetSaving) setTargetModal(null);
        }}
        size="md"
      >
        {targetModal !== null && (
          <>
            <DialogTitle>
              {targetModal === 'new'
                ? t('targetModalNew')
                : t('targetModalEdit')}
            </DialogTitle>
            <DialogBody>
              {targetError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">
                  {targetError}
                </div>
              )}
              <FieldGroup>
                <Field>
                  <Label>{t('period')}</Label>
                  <Listbox
                    value={targetForm.period}
                    onChange={(v) =>
                      setTargetForm((f) => ({
                        ...f,
                        period: v as 'daily' | 'weekly',
                      }))
                    }
                    aria-label={t('period')}
                    className="w-full"
                  >
                    {PERIODS.map((p) => (
                      <ListboxOption key={p.value} value={p.value}>
                        {p.label}
                      </ListboxOption>
                    ))}
                  </Listbox>
                </Field>
                <Field>
                  <Label>{t('targetKindCol')}</Label>
                  <Listbox
                    value={targetForm.targetKind}
                    onChange={(v) =>
                      setTargetForm((f) => ({ ...f, targetKind: v as string }))
                    }
                    aria-label={t('targetKindCol')}
                    className="w-full"
                  >
                    {TARGET_KINDS.map((k) => (
                      <ListboxOption key={k.value} value={k.value}>
                        {k.label}
                      </ListboxOption>
                    ))}
                  </Listbox>
                </Field>
                <Field>
                  <Label>{t('targetKeyCol')}</Label>
                  <Input
                    value={targetForm.targetKey}
                    onChange={(e) =>
                      setTargetForm((f) => ({
                        ...f,
                        targetKey: e.target.value,
                      }))
                    }
                    disabled={targetSaving}
                  />
                </Field>
                <Field>
                  <Label>{t('valueTypeCol')}</Label>
                  <Listbox
                    value={targetForm.valueType}
                    onChange={(v) =>
                      setTargetForm((f) => ({
                        ...f,
                        valueType: v as string,
                        unit:
                          v === 'adh_percent'
                            ? '%_adh'
                            : v === 'count'
                              ? null
                              : f.unit,
                      }))
                    }
                    aria-label={t('valueTypeCol')}
                    className="w-full"
                  >
                    {VALUE_TYPES.map((t) => (
                      <ListboxOption key={t.value} value={t.value}>
                        {t.label}
                      </ListboxOption>
                    ))}
                  </Listbox>
                </Field>
                <Field>
                  <Label>{t('valueNumLabel')}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={targetForm.valueNum || ''}
                    onChange={(e) =>
                      setTargetForm((f) => ({
                        ...f,
                        valueNum: parseFloat(e.target.value) || 0,
                      }))
                    }
                    disabled={targetSaving}
                  />
                </Field>
                <Field>
                  <Label>{t('unitHint')}</Label>
                  <Input
                    value={
                      targetForm.valueType === 'adh_percent'
                        ? '%_adh'
                        : targetForm.valueType === 'count'
                          ? ''
                          : (targetForm.unit ?? '')
                    }
                    onChange={(e) =>
                      setTargetForm((f) => ({
                        ...f,
                        unit:
                          f.valueType === 'count'
                            ? null
                            : f.valueType === 'adh_percent'
                              ? '%_adh'
                              : e.target.value || null,
                      }))
                    }
                    disabled={
                      targetSaving ||
                      targetForm.valueType === 'count' ||
                      targetForm.valueType === 'adh_percent'
                    }
                  />
                </Field>
              </FieldGroup>
            </DialogBody>
            <DialogActions>
              <Button
                outline
                onClick={() => {
                  if (!targetSaving) setTargetModal(null);
                }}
                disabled={targetSaving}
              >
                {t('cancel')}
              </Button>
              <Button onClick={saveTarget} disabled={targetSaving}>
                {targetSaving ? t('saving') : t('save')}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Clone protocol modal */}
      <Dialog
        open={cloneModalOpen}
        onClose={() => {
          if (!cloneSaving) setCloneModalOpen(false);
        }}
        size="md"
      >
        <DialogTitle>{t('cloneTitle')}</DialogTitle>
        <DialogBody>
          <Text className="mb-4 text-sm text-muted-foreground">
            {t('cloneDescription')}
          </Text>
          {cloneError && (
            <div
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300"
              role="alert"
            >
              {cloneError}
            </div>
          )}
          <FieldGroup>
            <Field>
              <Label htmlFor="clone-protocolKey">protocol_key</Label>
              <Input
                id="clone-protocolKey"
                value={cloneForm.protocolKey}
                onChange={(e) =>
                  setCloneForm((f) => ({ ...f, protocolKey: e.target.value }))
                }
                disabled={cloneSaving}
              />
            </Field>
            <Field>
              <Label htmlFor="clone-nameNl">name_nl</Label>
              <Input
                id="clone-nameNl"
                value={cloneForm.nameNl}
                onChange={(e) =>
                  setCloneForm((f) => ({ ...f, nameNl: e.target.value }))
                }
                disabled={cloneSaving}
              />
            </Field>
            <Field>
              <Label htmlFor="clone-version">{t('versionOptional')}</Label>
              <Input
                id="clone-version"
                value={cloneForm.version ?? ''}
                onChange={(e) =>
                  setCloneForm((f) => ({
                    ...f,
                    version: e.target.value || null,
                  }))
                }
                disabled={cloneSaving}
              />
            </Field>
            <Field>
              <Label htmlFor="clone-descriptionNl">
                {t('descriptionNlOptional')}
              </Label>
              <Textarea
                id="clone-descriptionNl"
                value={cloneForm.descriptionNl ?? ''}
                onChange={(e) =>
                  setCloneForm((f) => ({
                    ...f,
                    descriptionNl: e.target.value || null,
                  }))
                }
                disabled={cloneSaving}
              />
            </Field>
            <Field>
              <div className="flex items-center gap-2">
                <Switch
                  checked={cloneForm.isActive}
                  onChange={(checked) =>
                    setCloneForm((f) => ({ ...f, isActive: checked }))
                  }
                  disabled={cloneSaving}
                  color="dark/zinc"
                />
                <Label>{t('isActive')}</Label>
              </div>
            </Field>
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button
            outline
            onClick={() => {
              if (!cloneSaving) setCloneModalOpen(false);
            }}
            disabled={cloneSaving}
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleCloneSubmit} disabled={cloneSaving}>
            {cloneSaving && (
              <ArrowPathIcon
                className="size-4 animate-spin mr-2"
                data-slot="icon"
                aria-hidden
              />
            )}
            {cloneSaving ? t('copying') : t('copy')}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={confirmDeleteTarget}
        title={t('confirmDeleteTarget')}
        description={t('confirmDeleteTargetDescription')}
        confirmLabel={t('delete')}
        isLoading={isPending}
      />
      <ConfirmDialog
        open={deleteSupplementId !== null}
        onClose={() => {
          if (!deleteSupplementSaving) setDeleteSupplementId(null);
        }}
        onConfirm={async () => {
          if (deleteSupplementId == null) return;
          setDeleteSupplementSaving(true);
          const result = await deleteTherapeuticSupplementAction({
            id: deleteSupplementId,
          });
          setDeleteSupplementSaving(false);
          if ('error' in result) {
            showToast({
              type: 'error',
              title: t('toastDeleteError'),
              description: result.error,
            });
            return;
          }
          setDeleteSupplementId(null);
          router.refresh();
          showToast({ type: 'success', title: t('toastSupplementDeleted') });
        }}
        title={t('confirmDeleteSupplement')}
        description={t('confirmDeleteSupplementDescription')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        confirmColor="red"
        isLoading={deleteSupplementSaving}
      />
    </div>
  );
}
