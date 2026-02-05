'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  getGeneratorConfigAdmin,
  toggleTemplateActiveAction,
  togglePoolItemActiveAction,
  toggleNamePatternActiveAction,
  createNamePatternAction,
  updateGeneratorSettingsAction,
  upsertTemplateSlotsAction,
  createPoolItemAction,
  updatePoolItemGramsAction,
  suggestPoolCandidatesAction,
  bulkCreatePoolItemsAction,
  previewMealPlanWithCurrentConfigAction,
  exportGeneratorConfigSnapshotAction,
  importGeneratorConfigSnapshotAction,
  compareMealPlanPreviewsAction,
  type GeneratorConfigAdminData,
  type GeneratorConfigTemplatesRow,
  type GeneratorConfigPoolItemRow,
  type GeneratorConfigNamePatternRow,
  type ComparePreviewsResult,
  type SuggestPoolCandidateItem,
  type SuggestPoolCandidatesMeta,
} from '../actions/generatorConfig.actions';
import { ClipboardDocumentIcon } from '@heroicons/react/16/solid';
import type { MealPlanResponse } from '@/src/lib/diets';
import {
  getTuningSuggestions,
  type GeneratorConfigForAdvisor,
  type TuningAction,
} from '@/src/lib/meal-plans/generatorTuningAdvisor';
import { useToast } from '@/src/components/app/ToastContext';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Switch } from '@/components/catalyst/switch';
import {
  Fieldset,
  Field,
  FieldGroup,
  Label,
} from '@/components/catalyst/fieldset';
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/catalyst/table';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { Text } from '@/components/catalyst/text';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
} from '@/components/catalyst/dropdown';
import {
  Checkbox,
  CheckboxField,
  CheckboxGroup,
} from '@/components/catalyst/checkbox';
import { ArrowPathIcon, ChevronDownIcon } from '@heroicons/react/16/solid';

const POOL_CATEGORIES = ['protein', 'veg', 'fat', 'flavor'] as const;

const SLOT_KEYS = ['protein', 'veg1', 'veg2', 'fat'] as const;
const SLOT_LABELS: Record<(typeof SLOT_KEYS)[number], string> = {
  protein: 'Eiwit',
  veg1: 'Groente 1',
  veg2: 'Groente 2',
  fat: 'Vet',
};

function buildAdvisorConfig(
  data: GeneratorConfigAdminData,
  dietKey: string,
): GeneratorConfigForAdvisor {
  const dk = dietKey?.trim() || 'default';
  const poolFiltered = (data.poolItems ?? []).filter(
    (p) => (p.diet_key === dk || p.diet_key === 'default') && p.is_active,
  );
  const seenByCat = {
    protein: new Set<string>(),
    veg: new Set<string>(),
    fat: new Set<string>(),
    flavor: new Set<string>(),
  };
  for (const p of poolFiltered) {
    if (p.category in seenByCat)
      seenByCat[p.category as keyof typeof seenByCat].add(p.item_key);
  }
  const dietSetting = (data.settings ?? []).find((s) => s.diet_key === dk);
  const defaultSetting = (data.settings ?? []).find(
    (s) => s.diet_key === 'default',
  );
  const row = dietSetting ?? defaultSetting;
  const templates = (data.templates ?? [])
    .filter((t) => t.is_active)
    .map((t) => ({
      template_key: t.template_key,
      slots: (data.slots ?? [])
        .filter((s) => s.template_id === t.id)
        .sort(
          (a, b) =>
            SLOT_KEYS.indexOf(a.slot_key as (typeof SLOT_KEYS)[number]) -
            SLOT_KEYS.indexOf(b.slot_key as (typeof SLOT_KEYS)[number]),
        )
        .map((s) => ({
          slot_key: s.slot_key,
          default_g: s.default_g,
          min_g: s.min_g,
          max_g: s.max_g,
        })),
    }))
    .filter((t) => t.slots.length > 0);
  return {
    dietKey: dk,
    poolItems: {
      protein: seenByCat.protein.size,
      veg: seenByCat.veg.size,
      fat: seenByCat.fat.size,
      flavor: seenByCat.flavor.size,
    },
    settings: row
      ? {
          max_ingredients: row.max_ingredients,
          max_flavor_items: row.max_flavor_items,
          protein_repeat_cap_7d: row.protein_repeat_cap_7d,
          template_repeat_cap_7d: row.template_repeat_cap_7d,
          signature_retry_limit: row.signature_retry_limit,
        }
      : {
          max_ingredients: 10,
          max_flavor_items: 2,
          protein_repeat_cap_7d: 2,
          template_repeat_cap_7d: 3,
          signature_retry_limit: 8,
        },
    templates: templates.length > 0 ? templates : undefined,
  };
}
const SLOT_DEFAULTS: Record<
  (typeof SLOT_KEYS)[number],
  { minG: number; defaultG: number; maxG: number }
> = {
  protein: { minG: 50, defaultG: 120, maxG: 200 },
  veg1: { minG: 30, defaultG: 80, maxG: 150 },
  veg2: { minG: 30, defaultG: 60, maxG: 120 },
  fat: { minG: 5, defaultG: 10, maxG: 25 },
};

type TabId = 'templates' | 'pools' | 'naming' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'templates', label: 'Templates' },
  { id: 'pools', label: 'Pools' },
  { id: 'naming', label: 'Naming' },
  { id: 'settings', label: 'Instellingen' },
];

const NAME_PATTERN_SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
const NAME_PATTERN_SLOT_LABELS: Record<
  (typeof NAME_PATTERN_SLOTS)[number],
  string
> = {
  breakfast: 'Ontbijt',
  lunch: 'Lunch',
  dinner: 'Avondeten',
};

/** Preset key and payload for guided tuning (settings only). */
type PresetKey =
  | 'wow_variatie'
  | 'rustig_simpel'
  | 'streng'
  | 'meer_proteine_rotatie';
type PresetSettingsPayload = {
  max_ingredients: number;
  max_flavor_items: number;
  protein_repeat_cap_7d: number;
  template_repeat_cap_7d: number;
  signature_retry_limit: number;
};
const TUNING_PRESETS: Record<
  PresetKey,
  { label: string; mergeWithCurrent?: boolean } & Partial<PresetSettingsPayload>
> = {
  wow_variatie: {
    label: 'WOW Variatie',
    max_ingredients: 9,
    max_flavor_items: 2,
    protein_repeat_cap_7d: 1,
    template_repeat_cap_7d: 2,
    signature_retry_limit: 10,
  },
  rustig_simpel: {
    label: 'Rustig & Simpel',
    max_ingredients: 6,
    max_flavor_items: 1,
    protein_repeat_cap_7d: 2,
    template_repeat_cap_7d: 3,
    signature_retry_limit: 6,
  },
  streng: {
    label: 'Streng (Guardrails-first)',
    max_ingredients: 7,
    max_flavor_items: 1,
    protein_repeat_cap_7d: 1,
    template_repeat_cap_7d: 2,
    signature_retry_limit: 10,
  },
  meer_proteine_rotatie: {
    label: 'Meer Proteïne Rotatie',
    mergeWithCurrent: true,
    protein_repeat_cap_7d: 1,
    signature_retry_limit: 10,
  },
};

const DEFAULT_SETTINGS: PresetSettingsPayload = {
  max_ingredients: 10,
  max_flavor_items: 2,
  protein_repeat_cap_7d: 2,
  template_repeat_cap_7d: 3,
  signature_retry_limit: 8,
};

type DeepLinkParams = {
  tab: TabId;
  dietKey?: string;
  category?: string;
  templateKey?: string;
  openSlots?: boolean;
};

/** Parse advisor action.target to URL-friendly params (conservative). */
function parseSuggestionActionToParams(
  action: TuningAction,
  currentDietKey: string,
): DeepLinkParams | null {
  const { kind, target } = action;
  const t = target.trim();
  if (kind === 'setting') {
    return { tab: 'settings', dietKey: currentDietKey };
  }
  if (kind === 'pool') {
    const dietKeyMatch = t.match(/diet_key[=\s]+([a-z0-9_]+)/i);
    const categoryMatch = t.match(/category[=\s]+(protein|veg|fat|flavor)/i);
    const dietKey = dietKeyMatch?.[1] ?? currentDietKey;
    const cat =
      categoryMatch?.[1]?.toLowerCase() ??
      (['protein', 'veg', 'fat', 'flavor'].includes(t) ? t : 'protein');
    return { tab: 'pools', dietKey, category: cat };
  }
  if (kind === 'slot') {
    const lower = t.toLowerCase();
    const key =
      lower === 'templates' || lower.includes('slots')
        ? undefined
        : t.split(/\s+/)[0];
    return { tab: 'templates', templateKey: key ?? undefined, openSlots: true };
  }
  return null;
}

type Props = {
  initialData: GeneratorConfigAdminData | null;
  loadError: string | null;
};

export function GeneratorConfigClient({ initialData, loadError }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('templates');
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<GeneratorConfigAdminData | null>(
    initialData,
  );
  const [error, setError] = useState<string | null>(loadError ?? null);

  const [poolDietKey, setPoolDietKey] = useState<string>('default');
  const [poolCategory, setPoolCategory] = useState<string>('flavor');

  const [namingDietKey, setNamingDietKey] = useState<string>('default');
  const [namingTemplateKey, setNamingTemplateKey] = useState<string>('');
  const [namingSlot, setNamingSlot] = useState<string>('');
  const [togglingPatternId, setTogglingPatternId] = useState<string | null>(
    null,
  );
  const [createNamePatternOpen, setCreateNamePatternOpen] = useState(false);
  const [createNamePatternForm, setCreateNamePatternForm] = useState({
    dietKey: 'default',
    templateKey: '',
    slot: 'breakfast' as (typeof NAME_PATTERN_SLOTS)[number],
    pattern: '',
    isActive: true,
  });
  const [createNamePatternError, setCreateNamePatternError] = useState<
    string | null
  >(null);
  const [createNamePatternSaving, setCreateNamePatternSaving] = useState(false);

  const [settingsDietKey, setSettingsDietKey] = useState<string>('default');
  const [settingsForm, setSettingsForm] = useState({
    max_ingredients: 10,
    max_flavor_items: 2,
    protein_repeat_cap_7d: 2,
    template_repeat_cap_7d: 3,
    signature_retry_limit: 8,
  });
  const [settingsDirty, setSettingsDirty] = useState(false);

  const [slotsModalTemplate, setSlotsModalTemplate] =
    useState<GeneratorConfigTemplatesRow | null>(null);
  const [slotsForm, setSlotsForm] =
    useState<
      Record<
        (typeof SLOT_KEYS)[number],
        { minG: number; defaultG: number; maxG: number }
      >
    >(SLOT_DEFAULTS);
  const [slotsSaveError, setSlotsSaveError] = useState<string | null>(null);
  const [slotsSaving, setSlotsSaving] = useState(false);

  const [createPoolOpen, setCreatePoolOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    dietKey: 'default',
    category: 'flavor' as (typeof POOL_CATEGORIES)[number],
    itemKey: '',
    name: '',
    nevoCode: '',
    isActive: true,
    minG: 5,
    defaultG: 10,
    maxG: 25,
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);

  const [gramsModalItem, setGramsModalItem] =
    useState<GeneratorConfigPoolItemRow | null>(null);
  const [gramsForm, setGramsForm] = useState({
    minG: 5,
    defaultG: 10,
    maxG: 25,
  });
  const [gramsSaveError, setGramsSaveError] = useState<string | null>(null);
  const [gramsSaving, setGramsSaving] = useState(false);

  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestItems, setSuggestItems] = useState<SuggestPoolCandidateItem[]>(
    [],
  );
  const [suggestMeta, setSuggestMeta] =
    useState<SuggestPoolCandidatesMeta | null>(null);
  const [suggestSelectedKeys, setSuggestSelectedKeys] = useState<Set<string>>(
    new Set(),
  );
  const [bulkSaving, setBulkSaving] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewForm, setPreviewForm] = useState({
    dietKey: 'default',
    days: 7 as 3 | 5 | 7 | 14,
    dateFrom: new Date().toISOString().split('T')[0] ?? '',
    seed: '',
  });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<MealPlanResponse | null>(
    null,
  );

  const [exportOpen, setExportOpen] = useState(false);
  const [exportJson, setExportJson] = useState('');
  const [exportDietKey, setExportDietKey] = useState('default');
  const [exportLoading, setExportLoading] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);

  const [compareOpen, setCompareOpen] = useState(false);
  const [compareSnapshotA, setCompareSnapshotA] = useState('');
  const [compareSnapshotB, setCompareSnapshotB] = useState('');
  const [compareForm, setCompareForm] = useState({
    days: 7 as 3 | 5 | 7 | 14,
    dateFrom: new Date().toISOString().split('T')[0] ?? '',
    seed: 42,
  });
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareResult, setCompareResult] =
    useState<ComparePreviewsResult | null>(null);

  const [presetConfirmOpen, setPresetConfirmOpen] = useState(false);
  const [presetConfirmKey, setPresetConfirmKey] = useState<PresetKey | null>(
    null,
  );
  const [presetApplying, setPresetApplying] = useState(false);

  const [expandedPreviewMeal, setExpandedPreviewMeal] = useState<string | null>(
    null,
  );

  const templates = data?.templates ?? [];
  const slotsList = data?.slots ?? [];
  const poolItems = (data?.poolItems ?? []).filter(
    (p) => p.diet_key === poolDietKey && p.category === poolCategory,
  );
  const _settingsList = data?.settings ?? [];
  const namePatternsRaw = data?.namePatterns ?? [];
  const namePatternsFiltered = namePatternsRaw.filter((np) => {
    if (np.diet_key !== namingDietKey) return false;
    if (namingTemplateKey && np.template_key !== namingTemplateKey)
      return false;
    if (namingSlot && np.slot !== namingSlot) return false;
    return true;
  });
  const namingDietKeys = Array.from(
    new Set(namePatternsRaw.map((np) => np.diet_key)),
  ).sort();
  if (namingDietKeys.length === 0) namingDietKeys.push('default');
  const namingTemplateKeys = Array.from(
    new Set(namePatternsRaw.map((np) => np.template_key)),
  ).sort();
  const templateKeysForCreate = templates.map((t) => t.template_key);

  const refresh = () => {
    startTransition(async () => {
      setError(null);
      const result = await getGeneratorConfigAdmin();
      if ('data' in result) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    });
  };

  const openSlotsModal = (row: GeneratorConfigTemplatesRow) => {
    const forTemplate = slotsList.filter((s) => s.template_id === row.id);
    const next: typeof slotsForm = { ...SLOT_DEFAULTS };
    for (const slot of forTemplate) {
      if (SLOT_KEYS.includes(slot.slot_key as (typeof SLOT_KEYS)[number])) {
        next[slot.slot_key as (typeof SLOT_KEYS)[number]] = {
          minG: slot.min_g,
          defaultG: slot.default_g,
          maxG: slot.max_g,
        };
      }
    }
    setSlotsForm(next);
    setSlotsSaveError(null);
    setSlotsModalTemplate(row);
  };

  const applyDeepLink = useCallback(
    (params: DeepLinkParams) => {
      setActiveTab(params.tab);
      if (params.dietKey) {
        setPoolDietKey(params.dietKey);
        setSettingsDietKey(params.dietKey);
      }
      if (params.category) {
        setPoolCategory(params.category);
      }
      if (
        params.tab === 'templates' &&
        params.openSlots &&
        params.templateKey &&
        data?.templates
      ) {
        const row = data.templates.find(
          (t) => t.template_key === params.templateKey,
        );
        if (row) openSlotsModal(row);
      } else if (
        params.tab === 'templates' &&
        params.openSlots &&
        data?.templates?.length
      ) {
        const row = data.templates[0];
        if (row) openSlotsModal(row);
      }
      const q = new URLSearchParams();
      q.set('tab', params.tab);
      if (params.dietKey) q.set('dietKey', params.dietKey);
      if (params.category) q.set('category', params.category);
      if (params.templateKey) q.set('templateKey', params.templateKey);
      if (params.openSlots) q.set('openSlots', '1');
      router.replace(`${pathname}?${q.toString()}`);
    },
    [data, pathname, router, openSlotsModal],
  );

  useEffect(() => {
    const tab = searchParams.get('tab') as TabId | null;
    const dietKey = searchParams.get('dietKey');
    const category = searchParams.get('category');
    const templateKey = searchParams.get('templateKey');
    const openSlots = searchParams.get('openSlots') === '1';
    if (!tab || !['templates', 'pools', 'settings', 'naming'].includes(tab))
      return;
    setActiveTab(tab);
    if (dietKey) {
      setPoolDietKey(dietKey);
      setSettingsDietKey(dietKey);
    }
    if (category && ['protein', 'veg', 'fat', 'flavor'].includes(category)) {
      setPoolCategory(category);
    }
    if (tab === 'templates' && openSlots && data?.templates?.length) {
      const row = templateKey
        ? data.templates.find((t) => t.template_key === templateKey)
        : data.templates[0];
      if (row) openSlotsModal(row);
    }
  }, [searchParams, data?.templates, openSlotsModal]);

  const handleSaveSlots = () => {
    if (!slotsModalTemplate) return;
    setSlotsSaveError(null);
    setSlotsSaving(true);
    const payload = {
      templateId: slotsModalTemplate.id,
      slots: SLOT_KEYS.map((slotKey) => ({
        slotKey,
        ...slotsForm[slotKey],
      })),
    };
    startTransition(async () => {
      const result = await upsertTemplateSlotsAction(payload);
      setSlotsSaving(false);
      if ('error' in result) {
        setSlotsSaveError(result.error);
        return;
      }
      showToast({ type: 'success', title: 'Slots bijgewerkt' });
      setSlotsModalTemplate(null);
      router.refresh();
      refresh();
    });
  };

  const openCreatePool = () => {
    setCreateForm((prev) => ({
      ...prev,
      dietKey: poolDietKey,
      category: poolCategory as (typeof POOL_CATEGORIES)[number],
      itemKey: '',
      name: '',
      nevoCode: '',
      isActive: true,
      minG: 5,
      defaultG: 10,
      maxG: 25,
    }));
    setCreateError(null);
    setCreatePoolOpen(true);
  };

  const handleCreatePoolItem = () => {
    setCreateError(null);
    setCreateSaving(true);
    const payload =
      createForm.category === 'flavor'
        ? {
            dietKey: createForm.dietKey,
            category: createForm.category,
            itemKey: createForm.itemKey.trim(),
            name: createForm.name.trim(),
            nevoCode: createForm.nevoCode.trim() || undefined,
            isActive: createForm.isActive,
            minG: createForm.minG,
            defaultG: createForm.defaultG,
            maxG: createForm.maxG,
          }
        : {
            dietKey: createForm.dietKey,
            category: createForm.category,
            itemKey: createForm.itemKey.trim(),
            name: createForm.name.trim(),
            nevoCode: createForm.nevoCode.trim() || undefined,
            isActive: createForm.isActive,
          };
    startTransition(async () => {
      const result = await createPoolItemAction(payload);
      setCreateSaving(false);
      if ('error' in result) {
        setCreateError(result.error);
        return;
      }
      showToast({ type: 'success', title: 'Pool item toegevoegd' });
      setCreatePoolOpen(false);
      router.refresh();
      refresh();
    });
  };

  const openGramsModal = (row: GeneratorConfigPoolItemRow) => {
    setGramsForm({
      minG: row.min_g ?? 5,
      defaultG: row.default_g ?? 10,
      maxG: row.max_g ?? 25,
    });
    setGramsSaveError(null);
    setGramsModalItem(row);
  };

  const handleSaveGrams = () => {
    if (!gramsModalItem) return;
    setGramsSaveError(null);
    setGramsSaving(true);
    startTransition(async () => {
      const result = await updatePoolItemGramsAction({
        id: gramsModalItem.id,
        minG: gramsForm.minG,
        defaultG: gramsForm.defaultG,
        maxG: gramsForm.maxG,
      });
      setGramsSaving(false);
      if ('error' in result) {
        setGramsSaveError(result.error);
        return;
      }
      showToast({ type: 'success', title: 'Grams bijgewerkt' });
      setGramsModalItem(null);
      router.refresh();
      refresh();
    });
  };

  const openSuggestPoolDialog = () => {
    setSuggestDialogOpen(true);
    setSuggestError(null);
    setSuggestItems([]);
    setSuggestMeta(null);
    setSuggestSelectedKeys(new Set());
    setSuggestLoading(true);
    startTransition(async () => {
      const result = await suggestPoolCandidatesAction({
        dietKey: poolDietKey,
        category: poolCategory as 'protein' | 'veg' | 'fat',
        limit: 100,
      });
      setSuggestLoading(false);
      if ('error' in result) {
        setSuggestError(result.error);
        return;
      }
      const data = result.data;
      setSuggestItems(data?.candidates ?? []);
      setSuggestMeta(data?.meta ?? null);
    });
  };

  /** Open suggest-pool dialog with given diet/category and load suggestions (e.g. from Preview "Vul pool nu"). */
  const openSuggestPoolDialogFor = (
    dietKey: string,
    category: 'protein' | 'veg' | 'fat',
  ) => {
    setPoolDietKey(dietKey);
    setPoolCategory(category);
    setSuggestDialogOpen(true);
    setSuggestError(null);
    setSuggestItems([]);
    setSuggestMeta(null);
    setSuggestSelectedKeys(new Set());
    setSuggestLoading(true);
    startTransition(async () => {
      const result = await suggestPoolCandidatesAction({
        dietKey,
        category,
        limit: 100,
      });
      setSuggestLoading(false);
      if ('error' in result) {
        setSuggestError(result.error);
        return;
      }
      const data = result.data;
      setSuggestItems(data?.candidates ?? []);
      setSuggestMeta(data?.meta ?? null);
    });
  };

  const handleBulkCreatePoolItems = () => {
    const selected = suggestItems.filter((i) =>
      suggestSelectedKeys.has(i.itemKey),
    );
    if (selected.length === 0) return;
    setBulkSaving(true);
    startTransition(async () => {
      const result = await bulkCreatePoolItemsAction({
        dietKey: poolDietKey,
        category: poolCategory as 'protein' | 'veg' | 'fat',
        items: selected.map((i) => ({
          itemKey: i.itemKey,
          name: i.name,
          nevoCode: i.nevoCode ?? undefined,
        })),
      });
      setBulkSaving(false);
      if ('error' in result) {
        setSuggestError(result.error);
        return;
      }
      const count = result.data?.createdCount ?? 0;
      showToast({
        type: 'success',
        title:
          count > 0
            ? `${count} pool item(s) toegevoegd`
            : 'Geen nieuwe items (al aanwezig)',
      });
      setSuggestDialogOpen(false);
      router.refresh();
      refresh();
    });
  };

  const handlePreviewGenerate = () => {
    setPreviewError(null);
    setPreviewResult(null);
    setPreviewLoading(true);
    const daysNum = Number(previewForm.days);
    const seedNum =
      previewForm.seed.trim() === ''
        ? undefined
        : parseInt(previewForm.seed, 10);
    startTransition(async () => {
      const result = await previewMealPlanWithCurrentConfigAction({
        dietKey: previewForm.dietKey,
        days: daysNum as 3 | 5 | 7 | 14,
        dateFrom: previewForm.dateFrom,
        seed:
          seedNum !== undefined && !Number.isNaN(seedNum) ? seedNum : undefined,
      });
      setPreviewLoading(false);
      if (!result.ok) {
        setPreviewError(result.error);
        return;
      }
      setPreviewResult(result.preview);
      showToast({ type: 'success', title: 'Preview gegenereerd' });
    });
  };

  const handleExportOpen = () => {
    setExportJson('');
    setExportOpen(true);
  };
  const handleExportLoad = () => {
    setExportLoading(true);
    startTransition(async () => {
      const result = await exportGeneratorConfigSnapshotAction({
        dietKey: exportDietKey,
      });
      setExportLoading(false);
      if ('error' in result) {
        showToast({
          type: 'error',
          title: 'Export',
          description: result.error,
        });
        return;
      }
      setExportJson(JSON.stringify(result.data, null, 2));
      showToast({ type: 'success', title: 'Config geëxporteerd' });
    });
  };
  const handleExportCopy = () => {
    if (!exportJson) return;
    void navigator.clipboard.writeText(exportJson);
    showToast({ type: 'success', title: 'Gekopieerd naar klembord' });
  };

  const handleImportOpen = () => {
    setImportJson('');
    setImportError(null);
    setImportOpen(true);
  };
  const handleImportConfirm = () => {
    setImportConfirmOpen(false);
    setImportError(null);
    setImportLoading(true);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      setImportError('Ongeldige JSON');
      setImportLoading(false);
      return;
    }
    startTransition(async () => {
      const result = await importGeneratorConfigSnapshotAction({
        snapshot: parsed,
      });
      setImportLoading(false);
      if ('error' in result) {
        setImportError(result.error);
        return;
      }
      showToast({ type: 'success', title: 'Config geïmporteerd' });
      setImportOpen(false);
      router.refresh();
      refresh();
    });
  };

  const handleCompareRun = () => {
    setCompareError(null);
    let snapshotA: unknown;
    let snapshotB: unknown;
    try {
      snapshotA = JSON.parse(compareSnapshotA);
      snapshotB = JSON.parse(compareSnapshotB);
    } catch {
      setCompareError('Ongeldige JSON in Snapshot A of B');
      return;
    }
    setCompareLoading(true);
    startTransition(async () => {
      const result = await compareMealPlanPreviewsAction({
        snapshotA,
        snapshotB,
        days: compareForm.days,
        dateFrom: compareForm.dateFrom,
        seed: compareForm.seed,
      });
      setCompareLoading(false);
      setCompareResult(result);
      if (result.ok) {
        showToast({ type: 'success', title: 'Vergelijking voltooid' });
      }
    });
  };

  const handleToggleTemplate = (
    row: GeneratorConfigTemplatesRow,
    isActive: boolean,
  ) => {
    startTransition(async () => {
      const result = await toggleTemplateActiveAction({ id: row.id, isActive });
      if ('error' in result) {
        showToast({
          type: 'error',
          title: 'Template',
          description: result.error,
        });
        return;
      }
      showToast({ type: 'success', title: 'Template bijgewerkt' });
      router.refresh();
      refresh();
    });
  };

  const handleTogglePoolItem = (
    row: GeneratorConfigPoolItemRow,
    isActive: boolean,
  ) => {
    startTransition(async () => {
      const result = await togglePoolItemActiveAction({ id: row.id, isActive });
      if ('error' in result) {
        showToast({
          type: 'error',
          title: 'Pool item',
          description: result.error,
        });
        return;
      }
      showToast({ type: 'success', title: 'Pool item bijgewerkt' });
      router.refresh();
      refresh();
    });
  };

  const handleToggleNamePattern = (
    row: GeneratorConfigNamePatternRow,
    isActive: boolean,
  ) => {
    setTogglingPatternId(row.id);
    startTransition(async () => {
      const result = await toggleNamePatternActiveAction({
        id: row.id,
        isActive,
      });
      setTogglingPatternId(null);
      if ('error' in result) {
        showToast({
          type: 'error',
          title: 'Patroon',
          description: result.error,
        });
        return;
      }
      showToast({ type: 'success', title: 'Patroon bijgewerkt' });
      router.refresh();
      refresh();
    });
  };

  const openCreateNamePattern = () => {
    setCreateNamePatternForm({
      dietKey: namingDietKey,
      templateKey: templateKeysForCreate[0] ?? '',
      slot: 'breakfast',
      pattern: '',
      isActive: true,
    });
    setCreateNamePatternError(null);
    setCreateNamePatternOpen(true);
  };

  const handleCreateNamePattern = () => {
    setCreateNamePatternError(null);
    setCreateNamePatternSaving(true);
    startTransition(async () => {
      const result = await createNamePatternAction({
        dietKey: createNamePatternForm.dietKey.trim(),
        templateKey: createNamePatternForm.templateKey.trim(),
        slot: createNamePatternForm.slot,
        pattern: createNamePatternForm.pattern.trim(),
        isActive: createNamePatternForm.isActive,
      });
      setCreateNamePatternSaving(false);
      if ('error' in result) {
        setCreateNamePatternError(result.error);
        return;
      }
      showToast({ type: 'success', title: 'Patroon toegevoegd' });
      setCreateNamePatternOpen(false);
      router.refresh();
      refresh();
    });
  };

  const handleSaveSettings = () => {
    startTransition(async () => {
      const result = await updateGeneratorSettingsAction({
        dietKey: settingsDietKey,
        ...settingsForm,
      });
      if ('error' in result) {
        showToast({
          type: 'error',
          title: 'Instellingen',
          description: result.error,
        });
        return;
      }
      showToast({ type: 'success', title: 'Instellingen opgeslagen' });
      setSettingsDirty(false);
      router.refresh();
      refresh();
    });
  };

  function getPresetPayload(
    key: PresetKey,
    dietKey: string,
  ): PresetSettingsPayload {
    const preset = TUNING_PRESETS[key];
    if (preset.mergeWithCurrent) {
      const row = (data?.settings ?? []).find((s) => s.diet_key === dietKey);
      const current: PresetSettingsPayload = row
        ? {
            max_ingredients: row.max_ingredients,
            max_flavor_items: row.max_flavor_items,
            protein_repeat_cap_7d: row.protein_repeat_cap_7d,
            template_repeat_cap_7d: row.template_repeat_cap_7d,
            signature_retry_limit: row.signature_retry_limit,
          }
        : DEFAULT_SETTINGS;
      return { ...current, ...preset };
    }
    return preset as PresetSettingsPayload;
  }

  const handlePresetConfirmApply = () => {
    if (!presetConfirmKey) return;
    const dietKey = settingsDietKey || 'default';
    const payload = getPresetPayload(presetConfirmKey, dietKey);
    setPresetApplying(true);
    startTransition(async () => {
      const result = await updateGeneratorSettingsAction({
        dietKey,
        ...payload,
      });
      setPresetApplying(false);
      setPresetConfirmOpen(false);
      setPresetConfirmKey(null);
      if ('error' in result) {
        showToast({
          type: 'error',
          title: 'Preset',
          description: result.error,
        });
        return;
      }
      showToast({ type: 'success', title: 'Preset toegepast' });
      router.refresh();
      refresh();
    });
  };

  useEffect(() => {
    const list = data?.settings ?? [];
    const row = list.find((s) => s.diet_key === settingsDietKey);
    if (row) {
      setSettingsForm({
        max_ingredients: row.max_ingredients,
        max_flavor_items: row.max_flavor_items,
        protein_repeat_cap_7d: row.protein_repeat_cap_7d,
        template_repeat_cap_7d: row.template_repeat_cap_7d,
        signature_retry_limit: row.signature_retry_limit,
      });
    } else {
      setSettingsForm({
        max_ingredients: 10,
        max_flavor_items: 2,
        protein_repeat_cap_7d: 2,
        template_repeat_cap_7d: 3,
        signature_retry_limit: 8,
      });
    }
    setSettingsDirty(false);
  }, [settingsDietKey, data?.settings]);

  const uniqueDietKeys = Array.from(
    new Set((data?.poolItems ?? []).map((p) => p.diet_key)),
  ).sort();
  if (uniqueDietKeys.length === 0) uniqueDietKeys.push('default');
  const settingsDietKeys = Array.from(
    new Set([
      ...(data?.settings ?? []).map((s) => s.diet_key),
      ...(data?.poolItems ?? []).map((p) => p.diet_key),
      'default',
    ]),
  ).sort();

  const SLOT_LABELS_MEAL: Record<string, string> = {
    breakfast: 'Ontbijt',
    lunch: 'Lunch',
    dinner: 'Avondeten',
    snack: 'Snack',
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
            Generatorconfiguratie
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Beheer templates, pools en instellingen voor de weekmenu-generator.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button outline onClick={handleExportOpen}>
            Export JSON
          </Button>
          <Button outline onClick={handleImportOpen}>
            Import JSON
          </Button>
          <Button
            outline
            onClick={() => {
              setCompareError(null);
              setCompareResult(null);
              setCompareSnapshotA('');
              setCompareSnapshotB('');
              setCompareOpen(true);
            }}
          >
            Compare
          </Button>
          <Button
            onClick={() => {
              setPreviewError(null);
              setPreviewResult(null);
              setPreviewOpen(true);
            }}
          >
            Preview genereren
          </Button>
          <Dropdown>
            <DropdownButton
              outline
              disabled={presetApplying}
              className="inline-flex items-center gap-1"
            >
              Presets
              <ChevronDownIcon className="size-4" aria-hidden />
            </DropdownButton>
            <DropdownMenu anchor="bottom end" className="min-w-[200px]">
              {(Object.keys(TUNING_PRESETS) as PresetKey[]).map((key) => (
                <DropdownItem
                  key={key}
                  onClick={() => {
                    setPresetConfirmKey(key);
                    setPresetConfirmOpen(true);
                  }}
                >
                  {TUNING_PRESETS[key].label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30"
        >
          <Text className="font-medium text-red-800 dark:text-red-200">
            {error}
          </Text>
          <Button plain className="mt-2" onClick={refresh}>
            Opnieuw laden
          </Button>
        </div>
      )}

      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
              }`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'templates' && (
        <div className="space-y-4">
          {templates.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Geen templates gevonden.
            </p>
          ) : (
            <Table className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Key</TableHeader>
                  <TableHeader>Naam (NL)</TableHeader>
                  <TableHeader>Max stappen</TableHeader>
                  <TableHeader className="w-24">Actief</TableHeader>
                  <TableHeader className="text-zinc-500">
                    Bijgewerkt
                  </TableHeader>
                  <TableHeader className="w-24 text-right">Acties</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {templates.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">
                      {row.template_key}
                    </TableCell>
                    <TableCell>{row.name_nl}</TableCell>
                    <TableCell>{row.max_steps}</TableCell>
                    <TableCell>
                      <Switch
                        color="emerald"
                        checked={row.is_active}
                        disabled={isPending}
                        onChange={(checked) =>
                          handleToggleTemplate(row, checked)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                      {row.updated_at
                        ? new Date(row.updated_at).toLocaleDateString('nl-NL', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button outline onClick={() => openSlotsModal(row)}>
                        Slots
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {activeTab === 'pools' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-base/6 font-medium text-zinc-950 select-none sm:text-sm/6 dark:text-white">
                  Dieet
                </span>
                <Listbox
                  value={poolDietKey}
                  onChange={(v) => setPoolDietKey(v ?? 'default')}
                  placeholder="default"
                  aria-label="Filter op dieet"
                  className="min-w-[140px]"
                >
                  {uniqueDietKeys.map((dk) => (
                    <ListboxOption key={dk} value={dk}>
                      {dk}
                    </ListboxOption>
                  ))}
                </Listbox>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base/6 font-medium text-zinc-950 select-none sm:text-sm/6 dark:text-white">
                  Categorie
                </span>
                <Listbox
                  value={poolCategory}
                  onChange={(v) => setPoolCategory(v ?? 'flavor')}
                  placeholder="flavor"
                  aria-label="Filter op categorie"
                  className="min-w-[120px]"
                >
                  {POOL_CATEGORIES.map((c) => (
                    <ListboxOption key={c} value={c}>
                      {c}
                    </ListboxOption>
                  ))}
                </Listbox>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {poolCategory !== 'flavor' && (
                <Button outline onClick={openSuggestPoolDialog}>
                  Vul pool (suggesties)
                </Button>
              )}
              <Button onClick={openCreatePool}>Nieuw pool item</Button>
            </div>
          </div>
          {poolItems.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Geen pool items gevonden voor dit dieet en categorie.
            </p>
          ) : (
            <Table className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Item key</TableHeader>
                  <TableHeader>Naam</TableHeader>
                  <TableHeader>NEVO code</TableHeader>
                  {poolCategory === 'flavor' && (
                    <>
                      <TableHeader className="w-20">min (g)</TableHeader>
                      <TableHeader className="w-20">default (g)</TableHeader>
                      <TableHeader className="w-20">max (g)</TableHeader>
                    </>
                  )}
                  <TableHeader className="w-24">Actief</TableHeader>
                  <TableHeader className="text-zinc-500">
                    Bijgewerkt
                  </TableHeader>
                  {poolCategory === 'flavor' && (
                    <TableHeader className="w-24 text-right">
                      Acties
                    </TableHeader>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {poolItems.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">
                      {row.item_key}
                    </TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                      {row.nevo_code ?? '—'}
                    </TableCell>
                    {poolCategory === 'flavor' && (
                      <>
                        <TableCell className="text-sm">
                          {row.min_g ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.default_g ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.max_g ?? '—'}
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <Switch
                        color="emerald"
                        checked={row.is_active}
                        disabled={isPending}
                        onChange={(checked) =>
                          handleTogglePoolItem(row, checked)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                      {row.updated_at
                        ? new Date(row.updated_at).toLocaleDateString('nl-NL', {
                            day: 'numeric',
                            month: 'short',
                          })
                        : '—'}
                    </TableCell>
                    {poolCategory === 'flavor' && (
                      <TableCell className="text-right">
                        <Button outline onClick={() => openGramsModal(row)}>
                          Grams
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {activeTab === 'naming' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-base/6 font-medium text-zinc-950 select-none sm:text-sm/6 dark:text-white">
                  Dieet
                </span>
                <Listbox
                  value={namingDietKey}
                  onChange={(v) => setNamingDietKey((v as string) ?? 'default')}
                  placeholder="default"
                  aria-label="Filter op dieet"
                  className="min-w-[140px]"
                >
                  {namingDietKeys.map((dk) => (
                    <ListboxOption key={dk} value={dk}>
                      {dk}
                    </ListboxOption>
                  ))}
                </Listbox>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base/6 font-medium text-zinc-950 select-none sm:text-sm/6 dark:text-white">
                  Template
                </span>
                <Listbox
                  value={namingTemplateKey}
                  onChange={(v) => setNamingTemplateKey((v as string) ?? '')}
                  placeholder="Alle"
                  aria-label="Filter op template"
                  className="min-w-[140px]"
                >
                  <ListboxOption value="">Alle</ListboxOption>
                  {namingTemplateKeys.map((tk) => (
                    <ListboxOption key={tk} value={tk}>
                      {tk}
                    </ListboxOption>
                  ))}
                </Listbox>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base/6 font-medium text-zinc-950 select-none sm:text-sm/6 dark:text-white">
                  Slot
                </span>
                <Listbox
                  value={namingSlot}
                  onChange={(v) => setNamingSlot((v as string) ?? '')}
                  placeholder="Alle"
                  aria-label="Filter op slot"
                  className="min-w-[140px]"
                >
                  <ListboxOption value="">Alle</ListboxOption>
                  {NAME_PATTERN_SLOTS.map((s) => (
                    <ListboxOption key={s} value={s}>
                      {NAME_PATTERN_SLOT_LABELS[s]}
                    </ListboxOption>
                  ))}
                </Listbox>
              </div>
            </div>
            <Button onClick={openCreateNamePattern}>Nieuw patroon</Button>
          </div>
          {namePatternsFiltered.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Geen naam-patronen gevonden voor deze filters.
            </p>
          ) : (
            <Table className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Patroon</TableHeader>
                  <TableHeader>Dieet</TableHeader>
                  <TableHeader>Template</TableHeader>
                  <TableHeader>Slot</TableHeader>
                  <TableHeader className="w-24">Actief</TableHeader>
                  <TableHeader className="text-zinc-500">
                    Bijgewerkt
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {namePatternsFiltered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">
                      {row.pattern}
                    </TableCell>
                    <TableCell className="text-sm">{row.diet_key}</TableCell>
                    <TableCell className="text-sm">
                      {row.template_key}
                    </TableCell>
                    <TableCell className="text-sm">
                      {NAME_PATTERN_SLOT_LABELS[
                        row.slot as (typeof NAME_PATTERN_SLOTS)[number]
                      ] ?? row.slot}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {togglingPatternId === row.id && (
                          <ArrowPathIcon
                            className="size-4 animate-spin text-zinc-500"
                            aria-hidden
                          />
                        )}
                        <Switch
                          color="emerald"
                          checked={row.is_active}
                          disabled={togglingPatternId !== null}
                          onChange={(checked) =>
                            handleToggleNamePattern(row, checked)
                          }
                        />
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                      {row.updated_at
                        ? new Date(row.updated_at).toLocaleDateString('nl-NL', {
                            day: 'numeric',
                            month: 'short',
                          })
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="max-w-xl space-y-6">
          <Field>
            <Label>Dieet (diet_key)</Label>
            <Listbox
              value={settingsDietKey}
              onChange={(v) => setSettingsDietKey((v as string) ?? 'default')}
              placeholder="default"
              aria-label="Instellingen voor dieet"
              className="min-w-[140px]"
            >
              {settingsDietKeys.map((dk) => (
                <ListboxOption key={dk} value={dk}>
                  {dk}
                </ListboxOption>
              ))}
            </Listbox>
          </Field>

          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>Max ingrediënten (1–20)</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={settingsForm.max_ingredients}
                  onChange={(e) => {
                    setSettingsForm((s) => ({
                      ...s,
                      max_ingredients: parseInt(e.target.value, 10) || 10,
                    }));
                    setSettingsDirty(true);
                  }}
                />
              </Field>
              <Field>
                <Label>Max smaakitems (0–5)</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={settingsForm.max_flavor_items}
                  onChange={(e) => {
                    setSettingsForm((s) => ({
                      ...s,
                      max_flavor_items: parseInt(e.target.value, 10) || 0,
                    }));
                    setSettingsDirty(true);
                  }}
                />
              </Field>
              <Field>
                <Label>Eiwit herhaling cap 7d (1–14)</Label>
                <Input
                  type="number"
                  min={1}
                  max={14}
                  value={settingsForm.protein_repeat_cap_7d}
                  onChange={(e) => {
                    setSettingsForm((s) => ({
                      ...s,
                      protein_repeat_cap_7d: parseInt(e.target.value, 10) || 2,
                    }));
                    setSettingsDirty(true);
                  }}
                />
              </Field>
              <Field>
                <Label>Template herhaling cap 7d (1–21)</Label>
                <Input
                  type="number"
                  min={1}
                  max={21}
                  value={settingsForm.template_repeat_cap_7d}
                  onChange={(e) => {
                    setSettingsForm((s) => ({
                      ...s,
                      template_repeat_cap_7d: parseInt(e.target.value, 10) || 3,
                    }));
                    setSettingsDirty(true);
                  }}
                />
              </Field>
              <Field>
                <Label>Signature retry limit (1–20)</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={settingsForm.signature_retry_limit}
                  onChange={(e) => {
                    setSettingsForm((s) => ({
                      ...s,
                      signature_retry_limit: parseInt(e.target.value, 10) || 8,
                    }));
                    setSettingsDirty(true);
                  }}
                />
              </Field>
            </FieldGroup>
            <div className="mt-4">
              <Button
                onClick={handleSaveSettings}
                disabled={isPending || !settingsDirty}
              >
                Opslaan
              </Button>
            </div>
          </Fieldset>
        </div>
      )}

      <Dialog
        open={!!slotsModalTemplate}
        onClose={() => {
          if (!slotsSaving) setSlotsModalTemplate(null);
        }}
        size="md"
      >
        {slotsModalTemplate && (
          <>
            <DialogTitle>
              Slots bewerken: {slotsModalTemplate.template_key}
            </DialogTitle>
            <DialogBody>
              <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                min ≤ default ≤ max (g)
              </p>
              {slotsSaveError && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                >
                  {slotsSaveError}
                </div>
              )}
              <Fieldset>
                <FieldGroup>
                  {SLOT_KEYS.map((slotKey) => (
                    <Field key={slotKey}>
                      <Label>
                        {SLOT_LABELS[slotKey]} ({slotKey})
                      </Label>
                      <div className="mt-1 flex flex-wrap gap-3">
                        <Input
                          type="number"
                          min={1}
                          max={2000}
                          placeholder="min"
                          value={slotsForm[slotKey].minG}
                          onChange={(e) =>
                            setSlotsForm((s) => ({
                              ...s,
                              [slotKey]: {
                                ...s[slotKey],
                                minG: parseInt(e.target.value, 10) || 1,
                              },
                            }))
                          }
                          disabled={slotsSaving}
                          className="w-24"
                        />
                        <Input
                          type="number"
                          min={1}
                          max={2000}
                          placeholder="default"
                          value={slotsForm[slotKey].defaultG}
                          onChange={(e) =>
                            setSlotsForm((s) => ({
                              ...s,
                              [slotKey]: {
                                ...s[slotKey],
                                defaultG: parseInt(e.target.value, 10) || 1,
                              },
                            }))
                          }
                          disabled={slotsSaving}
                          className="w-24"
                        />
                        <Input
                          type="number"
                          min={1}
                          max={2000}
                          placeholder="max"
                          value={slotsForm[slotKey].maxG}
                          onChange={(e) =>
                            setSlotsForm((s) => ({
                              ...s,
                              [slotKey]: {
                                ...s[slotKey],
                                maxG: parseInt(e.target.value, 10) || 1,
                              },
                            }))
                          }
                          disabled={slotsSaving}
                          className="w-24"
                        />
                      </div>
                    </Field>
                  ))}
                </FieldGroup>
              </Fieldset>
            </DialogBody>
            <DialogActions>
              <Button
                outline
                onClick={() => !slotsSaving && setSlotsModalTemplate(null)}
                disabled={slotsSaving}
              >
                Annuleren
              </Button>
              <Button onClick={handleSaveSlots} disabled={slotsSaving}>
                {slotsSaving && (
                  <ArrowPathIcon
                    className="size-4 animate-spin"
                    data-slot="icon"
                    aria-hidden
                  />
                )}
                {slotsSaving ? 'Opslaan…' : 'Opslaan'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog
        open={presetConfirmOpen}
        onClose={() => {
          if (!presetApplying) {
            setPresetConfirmOpen(false);
            setPresetConfirmKey(null);
          }
        }}
        size="md"
      >
        {presetConfirmKey && (
          <>
            <DialogTitle>Preset toepassen</DialogTitle>
            <DialogBody>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Preset &quot;{TUNING_PRESETS[presetConfirmKey].label}&quot;
                toepassen op dietKey=&quot;{settingsDietKey || 'default'}&quot;?
              </p>
            </DialogBody>
            <DialogActions>
              <Button
                outline
                onClick={() =>
                  !presetApplying &&
                  (setPresetConfirmOpen(false), setPresetConfirmKey(null))
                }
                disabled={presetApplying}
              >
                Annuleren
              </Button>
              <Button
                onClick={handlePresetConfirmApply}
                disabled={presetApplying}
              >
                {presetApplying && (
                  <ArrowPathIcon
                    className="size-4 animate-spin"
                    data-slot="icon"
                    aria-hidden
                  />
                )}
                {presetApplying ? 'Toepassen…' : 'Toepassen'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog
        open={createPoolOpen}
        onClose={() => {
          if (!createSaving) setCreatePoolOpen(false);
        }}
        size="md"
      >
        <DialogTitle>Nieuw pool item</DialogTitle>
        <DialogBody>
          {createError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
            >
              {createError}
            </div>
          )}
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>Dieet (diet_key)</Label>
                <Input
                  value={createForm.dietKey}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, dietKey: e.target.value }))
                  }
                  disabled={createSaving}
                  placeholder="default"
                />
              </Field>
              <Field>
                <Label>Categorie</Label>
                <Listbox
                  value={createForm.category}
                  onChange={(v) =>
                    setCreateForm((f) => ({
                      ...f,
                      category: (v ??
                        'flavor') as (typeof POOL_CATEGORIES)[number],
                    }))
                  }
                  disabled={createSaving}
                  aria-label="Categorie"
                  className="min-w-[140px]"
                >
                  {POOL_CATEGORIES.map((c) => (
                    <ListboxOption key={c} value={c}>
                      {c}
                    </ListboxOption>
                  ))}
                </Listbox>
              </Field>
              <Field>
                <Label>Item key</Label>
                <Input
                  value={createForm.itemKey}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, itemKey: e.target.value }))
                  }
                  disabled={createSaving}
                  placeholder="bijv. FLAVOR:garlic"
                />
              </Field>
              <Field>
                <Label>Naam</Label>
                <Input
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, name: e.target.value }))
                  }
                  disabled={createSaving}
                  placeholder="Weergavenaam"
                />
              </Field>
              <Field>
                <Label>NEVO code (optioneel)</Label>
                <Input
                  value={createForm.nevoCode}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, nevoCode: e.target.value }))
                  }
                  disabled={createSaving}
                  placeholder="optioneel"
                />
              </Field>
              {createForm.category === 'flavor' && (
                <Field>
                  <Label>Grams (min / default / max)</Label>
                  <p className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">
                    min ≤ default ≤ max (1–500 g)
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      placeholder="min"
                      value={createForm.minG}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          minG: parseInt(e.target.value, 10) || 1,
                        }))
                      }
                      disabled={createSaving}
                      className="w-24"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      placeholder="default"
                      value={createForm.defaultG}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          defaultG: parseInt(e.target.value, 10) || 1,
                        }))
                      }
                      disabled={createSaving}
                      className="w-24"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      placeholder="max"
                      value={createForm.maxG}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          maxG: parseInt(e.target.value, 10) || 1,
                        }))
                      }
                      disabled={createSaving}
                      className="w-24"
                    />
                  </div>
                </Field>
              )}
              <Field>
                <div className="flex items-center gap-2">
                  <Switch
                    color="emerald"
                    checked={createForm.isActive}
                    disabled={createSaving}
                    onChange={(checked) =>
                      setCreateForm((f) => ({ ...f, isActive: checked }))
                    }
                  />
                  <Label>Actief</Label>
                </div>
              </Field>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button
            outline
            onClick={() => !createSaving && setCreatePoolOpen(false)}
            disabled={createSaving}
          >
            Annuleren
          </Button>
          <Button onClick={handleCreatePoolItem} disabled={createSaving}>
            {createSaving && (
              <ArrowPathIcon
                className="size-4 animate-spin"
                data-slot="icon"
                aria-hidden
              />
            )}
            {createSaving ? 'Toevoegen…' : 'Toevoegen'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={suggestDialogOpen}
        onClose={() => {
          if (!suggestLoading && !bulkSaving) setSuggestDialogOpen(false);
        }}
        size="md"
      >
        <DialogTitle>Vul pool (suggesties)</DialogTitle>
        <DialogBody>
          {suggestLoading && (
            <div className="flex items-center gap-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
              <ArrowPathIcon className="size-5 animate-spin" aria-hidden />
              Suggesties laden…
            </div>
          )}
          {!suggestLoading && suggestError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
            >
              {suggestError}
            </div>
          )}
          {!suggestLoading && !suggestError && suggestItems.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Geen suggesties gevonden; verruim dieet/excludes.
            </p>
          )}
          {!suggestLoading && suggestItems.length > 0 && (
            <div className="space-y-3">
              {suggestMeta && suggestMeta.guardrailsTermsCount > 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Guardrails filter actief: {suggestMeta.guardrailsTermsCount}{' '}
                  terms, verwijderd: {suggestMeta.removedByGuardrailsTerms ?? 0}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  outline
                  onClick={() =>
                    setSuggestSelectedKeys(
                      new Set(suggestItems.map((i) => i.itemKey)),
                    )
                  }
                  disabled={bulkSaving}
                >
                  Selecteer alles
                </Button>
                <Button
                  outline
                  onClick={() => setSuggestSelectedKeys(new Set())}
                  disabled={bulkSaving}
                >
                  Deselecteer
                </Button>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                <CheckboxGroup>
                  {suggestItems.map((item) => (
                    <CheckboxField key={item.itemKey}>
                      <Checkbox
                        color="dark/zinc"
                        checked={suggestSelectedKeys.has(item.itemKey)}
                        onChange={(checked) =>
                          setSuggestSelectedKeys((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(item.itemKey);
                            else next.delete(item.itemKey);
                            return next;
                          })
                        }
                        disabled={bulkSaving}
                      />
                      <Label>
                        {item.name}
                        {item.nevoCode && (
                          <span className="ml-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                            {item.nevoCode}
                          </span>
                        )}
                      </Label>
                    </CheckboxField>
                  ))}
                </CheckboxGroup>
              </div>
            </div>
          )}
        </DialogBody>
        {!suggestLoading && suggestItems.length > 0 && (
          <DialogActions>
            <Button
              outline
              onClick={() => !bulkSaving && setSuggestDialogOpen(false)}
              disabled={bulkSaving}
            >
              Sluiten
            </Button>
            <Button
              onClick={handleBulkCreatePoolItems}
              disabled={bulkSaving || suggestSelectedKeys.size === 0}
            >
              {bulkSaving && (
                <ArrowPathIcon
                  className="size-4 animate-spin"
                  data-slot="icon"
                  aria-hidden
                />
              )}
              {bulkSaving
                ? 'Toevoegen…'
                : `Toevoegen (${suggestSelectedKeys.size})`}
            </Button>
          </DialogActions>
        )}
      </Dialog>

      <Dialog
        open={createNamePatternOpen}
        onClose={() => {
          if (!createNamePatternSaving) setCreateNamePatternOpen(false);
        }}
        size="md"
      >
        <DialogTitle>Nieuw patroon</DialogTitle>
        <DialogBody>
          <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
            Beschikbare tokens: {'{templateName}'} {'{protein}'} {'{veg1}'}{' '}
            {'{veg2}'} {'{flavor}'}
          </p>
          {createNamePatternError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
            >
              {createNamePatternError}
            </div>
          )}
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>Dieet (diet_key)</Label>
                <Input
                  value={createNamePatternForm.dietKey}
                  onChange={(e) =>
                    setCreateNamePatternForm((f) => ({
                      ...f,
                      dietKey: e.target.value,
                    }))
                  }
                  disabled={createNamePatternSaving}
                  placeholder="default"
                />
              </Field>
              <Field>
                <Label>Template</Label>
                <Listbox
                  value={createNamePatternForm.templateKey}
                  onChange={(v) =>
                    setCreateNamePatternForm((f) => ({
                      ...f,
                      templateKey: (v as string) ?? '',
                    }))
                  }
                  disabled={createNamePatternSaving}
                  aria-label="Template"
                  className="min-w-[140px]"
                >
                  {templateKeysForCreate.map((tk) => (
                    <ListboxOption key={tk} value={tk}>
                      {tk}
                    </ListboxOption>
                  ))}
                </Listbox>
              </Field>
              <Field>
                <Label>Slot</Label>
                <Listbox
                  value={createNamePatternForm.slot}
                  onChange={(v) =>
                    setCreateNamePatternForm((f) => ({
                      ...f,
                      slot: (v ??
                        'breakfast') as (typeof NAME_PATTERN_SLOTS)[number],
                    }))
                  }
                  disabled={createNamePatternSaving}
                  aria-label="Slot"
                  className="min-w-[140px]"
                >
                  {NAME_PATTERN_SLOTS.map((s) => (
                    <ListboxOption key={s} value={s}>
                      {NAME_PATTERN_SLOT_LABELS[s]}
                    </ListboxOption>
                  ))}
                </Listbox>
              </Field>
              <Field>
                <Label>Patroon (5–120 tekens)</Label>
                <Input
                  value={createNamePatternForm.pattern}
                  onChange={(e) =>
                    setCreateNamePatternForm((f) => ({
                      ...f,
                      pattern: e.target.value,
                    }))
                  }
                  disabled={createNamePatternSaving}
                  placeholder="bijv. {protein} met {veg1} & {veg2}"
                />
              </Field>
              <Field>
                <div className="flex items-center gap-2">
                  <Switch
                    color="emerald"
                    checked={createNamePatternForm.isActive}
                    disabled={createNamePatternSaving}
                    onChange={(checked) =>
                      setCreateNamePatternForm((f) => ({
                        ...f,
                        isActive: checked,
                      }))
                    }
                  />
                  <Label>Actief</Label>
                </div>
              </Field>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button
            outline
            onClick={() =>
              !createNamePatternSaving && setCreateNamePatternOpen(false)
            }
            disabled={createNamePatternSaving}
          >
            Annuleren
          </Button>
          <Button
            onClick={handleCreateNamePattern}
            disabled={
              createNamePatternSaving ||
              !createNamePatternForm.dietKey.trim() ||
              !createNamePatternForm.templateKey.trim() ||
              createNamePatternForm.pattern.trim().length < 5 ||
              createNamePatternForm.pattern.trim().length > 120
            }
          >
            {createNamePatternSaving && (
              <ArrowPathIcon
                className="size-4 animate-spin"
                data-slot="icon"
                aria-hidden
              />
            )}
            {createNamePatternSaving ? 'Toevoegen…' : 'Toevoegen'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!gramsModalItem}
        onClose={() => {
          if (!gramsSaving) setGramsModalItem(null);
        }}
        size="md"
      >
        {gramsModalItem && (
          <>
            <DialogTitle>Grams: {gramsModalItem.name}</DialogTitle>
            <DialogBody>
              <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                min ≤ default ≤ max (g)
              </p>
              {gramsSaveError && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                >
                  {gramsSaveError}
                </div>
              )}
              <Fieldset>
                <FieldGroup>
                  <Field>
                    <Label>min (g)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={gramsForm.minG}
                      onChange={(e) =>
                        setGramsForm((f) => ({
                          ...f,
                          minG: parseInt(e.target.value, 10) || 1,
                        }))
                      }
                      disabled={gramsSaving}
                      className="w-28"
                    />
                  </Field>
                  <Field>
                    <Label>default (g)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={gramsForm.defaultG}
                      onChange={(e) =>
                        setGramsForm((f) => ({
                          ...f,
                          defaultG: parseInt(e.target.value, 10) || 1,
                        }))
                      }
                      disabled={gramsSaving}
                      className="w-28"
                    />
                  </Field>
                  <Field>
                    <Label>max (g)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={gramsForm.maxG}
                      onChange={(e) =>
                        setGramsForm((f) => ({
                          ...f,
                          maxG: parseInt(e.target.value, 10) || 1,
                        }))
                      }
                      disabled={gramsSaving}
                      className="w-28"
                    />
                  </Field>
                </FieldGroup>
              </Fieldset>
            </DialogBody>
            <DialogActions>
              <Button
                outline
                onClick={() => !gramsSaving && setGramsModalItem(null)}
                disabled={gramsSaving}
              >
                Annuleren
              </Button>
              <Button onClick={handleSaveGrams} disabled={gramsSaving}>
                {gramsSaving && (
                  <ArrowPathIcon
                    className="size-4 animate-spin"
                    data-slot="icon"
                    aria-hidden
                  />
                )}
                {gramsSaving ? 'Opslaan…' : 'Opslaan'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog
        open={previewOpen}
        onClose={() => {
          if (!previewLoading) setPreviewOpen(false);
        }}
        size="lg"
      >
        <DialogTitle>Preview weekmenu</DialogTitle>
        <DialogBody>
          {previewError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
            >
              {previewError}
            </div>
          )}
          {!previewResult ? (
            <Fieldset>
              <FieldGroup>
                <Field>
                  <Label>Dieet (diet_key)</Label>
                  <Input
                    value={previewForm.dietKey}
                    onChange={(e) =>
                      setPreviewForm((f) => ({ ...f, dietKey: e.target.value }))
                    }
                    disabled={previewLoading}
                    placeholder="default"
                  />
                </Field>
                <Field>
                  <Label>Aantal dagen</Label>
                  <Listbox
                    value={String(previewForm.days)}
                    onChange={(v) =>
                      setPreviewForm((f) => ({
                        ...f,
                        days: parseInt(v ?? '7', 10) as 3 | 5 | 7 | 14,
                      }))
                    }
                    disabled={previewLoading}
                    aria-label="Dagen"
                    className="min-w-[100px]"
                  >
                    <ListboxOption value="3">3</ListboxOption>
                    <ListboxOption value="5">5</ListboxOption>
                    <ListboxOption value="7">7</ListboxOption>
                    <ListboxOption value="14">14</ListboxOption>
                  </Listbox>
                </Field>
                <Field>
                  <Label>Startdatum</Label>
                  <Input
                    type="date"
                    value={previewForm.dateFrom}
                    onChange={(e) =>
                      setPreviewForm((f) => ({
                        ...f,
                        dateFrom: e.target.value,
                      }))
                    }
                    disabled={previewLoading}
                  />
                </Field>
                <Field>
                  <Label>Seed (optioneel, 0–1000)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    value={previewForm.seed}
                    onChange={(e) =>
                      setPreviewForm((f) => ({ ...f, seed: e.target.value }))
                    }
                    disabled={previewLoading}
                    placeholder="optioneel"
                    className="w-28"
                  />
                </Field>
              </FieldGroup>
            </Fieldset>
          ) : (
            <div className="space-y-4">
              {previewResult.days.map((day) => (
                <div
                  key={day.date}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3"
                >
                  <p className="mb-2 font-medium text-zinc-900 dark:text-white">
                    {new Date(day.date + 'T12:00:00').toLocaleDateString(
                      'nl-NL',
                      {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      },
                    )}
                  </p>
                  <ul className="list-inside space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {day.meals.map((meal) => {
                      const mealQualities = (
                        previewResult.metadata as {
                          generator?: {
                            templateInfo?: {
                              mealQualities?: Array<{
                                date: string;
                                slot: string;
                                score: number;
                                reasons: string[];
                              }>;
                            };
                          };
                        }
                      )?.generator?.templateInfo?.mealQualities;
                      const quality = mealQualities?.find(
                        (q) => q.date === day.date && q.slot === meal.slot,
                      );
                      const mealKey = `${day.date}-${meal.slot}`;
                      const isExpanded = expandedPreviewMeal === mealKey;
                      return (
                        <li key={meal.id} className="flex flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-2">
                            {SLOT_LABELS_MEAL[meal.slot] ?? meal.slot} —{' '}
                            {meal.name} ({meal.ingredientRefs?.length ?? 0}{' '}
                            ingrediënten)
                            {quality != null && (
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                Q: {quality.score}
                              </span>
                            )}
                            {quality != null && quality.reasons.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedPreviewMeal((k) =>
                                    k === mealKey ? null : mealKey,
                                  )
                                }
                                className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                              >
                                {isExpanded ? 'Verberg waarom' : 'Waarom'}
                              </button>
                            )}
                          </span>
                          {isExpanded &&
                            quality?.reasons != null &&
                            quality.reasons.length > 0 && (
                              <ul className="ml-4 list-disc text-xs text-zinc-500 dark:text-zinc-400">
                                {quality.reasons.map((r, i) => (
                                  <li key={i}>{r}</li>
                                ))}
                              </ul>
                            )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {previewResult.metadata &&
                typeof previewResult.metadata === 'object' &&
                'generator' in previewResult.metadata && (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 p-3 text-sm">
                    <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Generator-meta
                    </p>
                    {(() => {
                      const gen = (
                        previewResult.metadata as {
                          generator?: {
                            guardrailsExcludeTermsCount?: number;
                            poolMetrics?: { removedByGuardrailsTerms?: number };
                          };
                        }
                      ).generator;
                      const termsCount = gen?.guardrailsExcludeTermsCount ?? 0;
                      const removedByGuardrails =
                        gen?.poolMetrics?.removedByGuardrailsTerms ?? 0;
                      const showGuardrails =
                        termsCount > 0 || removedByGuardrails > 0;
                      return showGuardrails ? (
                        <ul className="mb-2 space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          {termsCount > 0 && (
                            <li>Guardrails terms toegepast: {termsCount}</li>
                          )}
                          {removedByGuardrails > 0 && (
                            <li>
                              Verwijderd door guardrails: {removedByGuardrails}{' '}
                              items
                            </li>
                          )}
                        </ul>
                      ) : null;
                    })()}
                    <pre className="whitespace-pre-wrap break-words text-xs text-zinc-600 dark:text-zinc-400">
                      {JSON.stringify(
                        {
                          mode: (
                            previewResult.metadata as {
                              generator?: { mode?: string };
                            }
                          ).generator?.mode,
                          attempts: (
                            previewResult.metadata as {
                              generator?: { attempts?: number };
                            }
                          ).generator?.attempts,
                          repeatsForced: (
                            previewResult.metadata as {
                              generator?: {
                                templateInfo?: {
                                  quality?: { repeatsForced?: number };
                                };
                              };
                            }
                          ).generator?.templateInfo?.quality?.repeatsForced,
                          poolMetrics: (
                            previewResult.metadata as {
                              generator?: { poolMetrics?: unknown };
                            }
                          ).generator?.poolMetrics,
                          guardrailsExcludeTermsCount: (
                            previewResult.metadata as {
                              generator?: {
                                guardrailsExcludeTermsCount?: number;
                              };
                            }
                          ).generator?.guardrailsExcludeTermsCount,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                )}
              {data &&
                (() => {
                  const suggestions = getTuningSuggestions(
                    previewResult,
                    buildAdvisorConfig(data, previewForm.dietKey),
                  );
                  if (suggestions.length === 0) return null;
                  return (
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-sm">
                      <p className="font-medium text-zinc-800 dark:text-zinc-200 mb-2">
                        Suggesties
                      </p>
                      <ul className="space-y-3">
                        {suggestions.map((s, i) => (
                          <li key={`${s.code}-${i}`}>
                            <span
                              className={
                                s.severity === 'warn'
                                  ? 'font-medium text-amber-800 dark:text-amber-200'
                                  : 'text-zinc-700 dark:text-zinc-300'
                              }
                            >
                              {s.title}
                            </span>
                            <ul className="mt-1 list-inside space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                              {s.actions.slice(0, 3).map((a, j) => {
                                const params = parseSuggestionActionToParams(
                                  a,
                                  previewForm.dietKey,
                                );
                                const label =
                                  a.kind === 'setting'
                                    ? `${a.target}: ${a.hint}`
                                    : a.kind === 'pool'
                                      ? `${a.target} — ${a.hint}`
                                      : `${a.target} — ${a.hint}`;
                                const poolCategory =
                                  params?.tab === 'pools' &&
                                  params.category &&
                                  ['protein', 'veg', 'fat'].includes(
                                    params.category,
                                  )
                                    ? (params.category as
                                        | 'protein'
                                        | 'veg'
                                        | 'fat')
                                    : null;
                                if (params) {
                                  return (
                                    <li
                                      key={j}
                                      className="list-disc flex flex-wrap items-center gap-1"
                                    >
                                      <Button
                                        plain
                                        type="button"
                                        onClick={() => {
                                          applyDeepLink(params);
                                          setPreviewOpen(false);
                                        }}
                                        className="h-auto p-0 text-left text-inherit underline hover:no-underline"
                                      >
                                        {label}
                                      </Button>
                                      {a.kind === 'pool' && poolCategory && (
                                        <Button
                                          type="button"
                                          outline
                                          onClick={() =>
                                            openSuggestPoolDialogFor(
                                              params.dietKey ??
                                                previewForm.dietKey,
                                              poolCategory,
                                            )
                                          }
                                          className="ml-1 shrink-0 text-xs"
                                        >
                                          Vul pool nu
                                        </Button>
                                      )}
                                    </li>
                                  );
                                }
                                return (
                                  <li key={j} className="list-disc">
                                    {label}
                                  </li>
                                );
                              })}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
            </div>
          )}
        </DialogBody>
        <DialogActions>
          {previewResult ? (
            <Button
              outline
              onClick={() => {
                setPreviewResult(null);
                setPreviewError(null);
                setExpandedPreviewMeal(null);
              }}
            >
              Nieuwe preview
            </Button>
          ) : null}
          <Button
            outline
            onClick={() => !previewLoading && setPreviewOpen(false)}
            disabled={previewLoading}
          >
            Sluiten
          </Button>
          {!previewResult && (
            <Button onClick={handlePreviewGenerate} disabled={previewLoading}>
              {previewLoading && (
                <ArrowPathIcon
                  className="size-4 animate-spin"
                  data-slot="icon"
                  aria-hidden
                />
              )}
              {previewLoading ? 'Genereren…' : 'Genereren'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={exportOpen}
        onClose={() => !exportLoading && setExportOpen(false)}
        size="lg"
      >
        <DialogTitle>Config export</DialogTitle>
        <DialogBody>
          {!exportJson ? (
            <div className="space-y-4">
              <Field>
                <Label>Dieet (diet_key)</Label>
                <Listbox
                  value={exportDietKey}
                  onChange={(v) => setExportDietKey((v as string) ?? 'default')}
                  aria-label="Dieet voor export"
                  className="min-w-[140px]"
                >
                  {settingsDietKeys.map((dk) => (
                    <ListboxOption key={dk} value={dk}>
                      {dk}
                    </ListboxOption>
                  ))}
                </Listbox>
              </Field>
              <Button onClick={handleExportLoad} disabled={exportLoading}>
                {exportLoading && (
                  <ArrowPathIcon
                    className="size-4 animate-spin"
                    data-slot="icon"
                    aria-hidden
                  />
                )}
                {exportLoading ? 'Laden…' : 'Exporteer'}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                readOnly
                value={exportJson}
                className="w-full min-h-[280px] rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
                spellCheck={false}
              />
              <Button outline onClick={handleExportCopy}>
                <ClipboardDocumentIcon className="size-4" aria-hidden />
                Kopieer
              </Button>
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button
            outline
            onClick={() => !exportLoading && setExportOpen(false)}
            disabled={exportLoading}
          >
            Sluiten
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={importOpen}
        onClose={() => {
          if (!importLoading) setImportOpen(false);
        }}
        size="lg"
      >
        <DialogTitle>Config import</DialogTitle>
        <DialogBody>
          <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
            Plak hieronder een eerder geëxporteerde JSON. Importeer overschrijft
            bestaande waarden via upsert.
          </p>
          {importError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
            >
              {importError}
            </div>
          )}
          <textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='{"version":1,"exportedAt":"...","dietKey":"default",...}'
            className="w-full min-h-[200px] rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-800"
            spellCheck={false}
          />
        </DialogBody>
        <DialogActions>
          <Button
            outline
            onClick={() => !importLoading && setImportOpen(false)}
            disabled={importLoading}
          >
            Annuleren
          </Button>
          <Button
            onClick={() => setImportConfirmOpen(true)}
            disabled={importLoading || !importJson.trim()}
          >
            {importLoading && (
              <ArrowPathIcon
                className="size-4 animate-spin"
                data-slot="icon"
                aria-hidden
              />
            )}
            {importLoading ? 'Importeren…' : 'Importeer'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={importConfirmOpen}
        onClose={() => !importLoading && setImportConfirmOpen(false)}
        size="md"
      >
        <DialogTitle>Import bevestigen</DialogTitle>
        <DialogBody>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Dit overschrijft bestaande waarden via upsert. Weet je het zeker?
          </p>
        </DialogBody>
        <DialogActions>
          <Button
            outline
            onClick={() => !importLoading && setImportConfirmOpen(false)}
            disabled={importLoading}
          >
            Annuleren
          </Button>
          <Button onClick={handleImportConfirm} disabled={importLoading}>
            {importLoading ? 'Bezig…' : 'Ja, importeer'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={compareOpen}
        onClose={() => !compareLoading && setCompareOpen(false)}
        size="lg"
      >
        <DialogTitle>Compare snapshots</DialogTitle>
        <DialogBody>
          {(compareError ||
            (compareResult && !compareResult.ok && compareResult.error)) && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
            >
              {compareResult && !compareResult.ok
                ? compareResult.error
                : compareError}
            </div>
          )}
          {!compareResult?.ok ? (
            <div className="space-y-4">
              <Field>
                <Label>Snapshot A (JSON)</Label>
                <textarea
                  value={compareSnapshotA}
                  onChange={(e) => setCompareSnapshotA(e.target.value)}
                  placeholder='{"version":1,"exportedAt":"...","dietKey":"default",...}'
                  className="mt-1 w-full min-h-[120px] rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  spellCheck={false}
                  disabled={compareLoading}
                />
              </Field>
              <Field>
                <Label>Snapshot B (JSON)</Label>
                <textarea
                  value={compareSnapshotB}
                  onChange={(e) => setCompareSnapshotB(e.target.value)}
                  placeholder='{"version":1,"exportedAt":"...","dietKey":"default",...}'
                  className="mt-1 w-full min-h-[120px] rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  spellCheck={false}
                  disabled={compareLoading}
                />
              </Field>
              <FieldGroup className="flex flex-wrap gap-4">
                <Field>
                  <Label>Dagen</Label>
                  <Listbox
                    value={String(compareForm.days)}
                    onChange={(v) =>
                      setCompareForm((f) => ({
                        ...f,
                        days: parseInt(v ?? '7', 10) as 3 | 5 | 7 | 14,
                      }))
                    }
                    disabled={compareLoading}
                    aria-label="Dagen"
                    className="min-w-[100px]"
                  >
                    <ListboxOption value="3">3</ListboxOption>
                    <ListboxOption value="5">5</ListboxOption>
                    <ListboxOption value="7">7</ListboxOption>
                    <ListboxOption value="14">14</ListboxOption>
                  </Listbox>
                </Field>
                <Field>
                  <Label>Startdatum</Label>
                  <Input
                    type="date"
                    value={compareForm.dateFrom}
                    onChange={(e) =>
                      setCompareForm((f) => ({
                        ...f,
                        dateFrom: e.target.value,
                      }))
                    }
                    disabled={compareLoading}
                  />
                </Field>
                <Field>
                  <Label>Seed (0–1000)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    value={compareForm.seed}
                    onChange={(e) =>
                      setCompareForm((f) => ({
                        ...f,
                        seed: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    disabled={compareLoading}
                    className="w-24"
                  />
                </Field>
              </FieldGroup>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 p-3 text-sm">
                <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Samenvatting
                </p>
                <ul className="space-y-1 text-zinc-600 dark:text-zinc-400">
                  <li>
                    Maaltijden gewijzigd: {compareResult.diff.mealsChanged}
                  </li>
                  <li>
                    Totaal ingrediëntenverschil (B − A):{' '}
                    {compareResult.diff.ingredientDeltaTotal}
                  </li>
                  <li>
                    repeatsForced delta (B − A):{' '}
                    {compareResult.diff.repeatsForcedDelta}
                  </li>
                </ul>
              </div>
              <div className="space-y-3">
                <p className="font-medium text-zinc-700 dark:text-zinc-300">
                  Per dag
                </p>
                {compareResult.diff.byDay.map((day) => (
                  <div
                    key={day.date}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden"
                  >
                    <p className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {new Date(day.date + 'T12:00:00').toLocaleDateString(
                        'nl-NL',
                        {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        },
                      )}
                    </p>
                    {(() => {
                      const qualA = (
                        compareResult.a.metadata as {
                          generator?: {
                            templateInfo?: {
                              mealQualities?: Array<{
                                date: string;
                                slot: string;
                                score: number;
                              }>;
                            };
                          };
                        }
                      )?.generator?.templateInfo?.mealQualities;
                      const qualB = (
                        compareResult.b.metadata as {
                          generator?: {
                            templateInfo?: {
                              mealQualities?: Array<{
                                date: string;
                                slot: string;
                                score: number;
                              }>;
                            };
                          };
                        }
                      )?.generator?.templateInfo?.mealQualities;
                      const scoreFor = (arr: typeof qualA, slot: string) =>
                        arr?.find((q) => q.date === day.date && q.slot === slot)
                          ?.score;
                      return (
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableHeader>Slot</TableHeader>
                              <TableHeader>A (naam)</TableHeader>
                              <TableHeader>B (naam)</TableHeader>
                              <TableHeader className="text-zinc-500">
                                Δ ingred.
                              </TableHeader>
                              <TableHeader className="text-zinc-500">
                                Δ Q
                              </TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {day.rows.map((row) => {
                              const sA = scoreFor(qualA, row.slot);
                              const sB = scoreFor(qualB, row.slot);
                              const deltaQ =
                                sA != null && sB != null ? sB - sA : null;
                              return (
                                <TableRow key={row.slot}>
                                  <TableCell>
                                    {SLOT_LABELS_MEAL[row.slot] ?? row.slot}
                                  </TableCell>
                                  <TableCell>{row.aName || '—'}</TableCell>
                                  <TableCell>{row.bName || '—'}</TableCell>
                                  <TableCell>
                                    {row.bIngredients - row.aIngredients >= 0
                                      ? `+${row.bIngredients - row.aIngredients}`
                                      : row.bIngredients - row.aIngredients}
                                  </TableCell>
                                  <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {deltaQ != null
                                      ? deltaQ >= 0
                                        ? `+${deltaQ}`
                                        : String(deltaQ)
                                      : '—'}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      );
                    })()}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 p-3 text-xs">
                  <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Meta A
                  </p>
                  <pre className="whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-400">
                    {JSON.stringify(
                      {
                        mode: (
                          compareResult.a.metadata as {
                            generator?: { mode?: string };
                          }
                        )?.generator?.mode,
                        attempts: (
                          compareResult.a.metadata as {
                            generator?: { attempts?: number };
                          }
                        )?.generator?.attempts,
                        repeatsForced: (
                          compareResult.a.metadata as {
                            generator?: {
                              templateInfo?: {
                                quality?: { repeatsForced?: number };
                              };
                            };
                          }
                        )?.generator?.templateInfo?.quality?.repeatsForced,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 p-3 text-xs">
                  <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Meta B
                  </p>
                  <pre className="whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-400">
                    {JSON.stringify(
                      {
                        mode: (
                          compareResult.b.metadata as {
                            generator?: { mode?: string };
                          }
                        )?.generator?.mode,
                        attempts: (
                          compareResult.b.metadata as {
                            generator?: { attempts?: number };
                          }
                        )?.generator?.attempts,
                        repeatsForced: (
                          compareResult.b.metadata as {
                            generator?: {
                              templateInfo?: {
                                quality?: { repeatsForced?: number };
                              };
                            };
                          }
                        )?.generator?.templateInfo?.quality?.repeatsForced,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogActions>
          {compareResult?.ok ? (
            <Button
              outline
              onClick={() => {
                setCompareResult(null);
                setCompareError(null);
              }}
            >
              Nieuwe vergelijking
            </Button>
          ) : null}
          <Button
            outline
            onClick={() => !compareLoading && setCompareOpen(false)}
            disabled={compareLoading}
          >
            Sluiten
          </Button>
          {!compareResult?.ok && (
            <Button
              onClick={handleCompareRun}
              disabled={
                compareLoading ||
                !compareSnapshotA.trim() ||
                !compareSnapshotB.trim()
              }
            >
              {compareLoading && (
                <ArrowPathIcon
                  className="size-4 animate-spin"
                  data-slot="icon"
                  aria-hidden
                />
              )}
              {compareLoading ? 'Vergelijken…' : 'Vergelijk'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </div>
  );
}
