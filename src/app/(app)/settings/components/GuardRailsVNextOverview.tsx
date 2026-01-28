'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table';
import { Badge } from '@/components/catalyst/badge';
import { Text } from '@/components/catalyst/text';
import { Button } from '@/components/catalyst/button';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from '@/components/catalyst/dropdown';
import { Input } from '@/components/catalyst/input';
import { Textarea } from '@/components/catalyst/textarea';
import { Select } from '@/components/catalyst/select';
import {
  Listbox,
  ListboxLabel,
  ListboxOption,
} from '@/components/catalyst/listbox';
import { Checkbox } from '@/components/catalyst/checkbox';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import clsx from 'clsx';
import type { GuardReasonCode } from '@/src/lib/guardrails-vnext/types';
import { getGuardReasonLabel } from '@/src/lib/guardrails-vnext/ui/reasonLabels';
import { DIET_LOGIC_LABELS } from '@/src/lib/diet-logic/types';
import type { DietLogicType } from '../actions/guardrails.actions';
import {
  loadDietGuardrailsRulesetAction,
  updateGuardRailRuleAction,
  updateGuardRailRulePriorityAction,
  blockOrPauseGuardRailRuleAction,
  deleteGuardRailRuleAction,
  createGuardRailRuleAction,
  getDietGroupPoliciesAction,
  swapGuardRailRulePriorityAction,
  type GuardRailsRulesetViewModel,
  type GroupPolicyRow,
} from '../actions/guardrails.actions';
import {
  getIngredientCategoriesForDietAction,
  updateDietCategoryConstraintAction,
} from '../actions/ingredient-categories-admin.actions';
import { Link } from '@/components/catalyst/link';
import {
  Bars3Icon,
  ClipboardIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EllipsisVerticalIcon,
  ExclamationTriangleIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/20/solid';
import { useRouter } from 'next/navigation';
import {
  analyzeDietRulesWithAI,
  suggestConstraintSettingsWithAI,
  applyDietRuleAnalysisAction,
  type DietRulesAnalysis,
  type DietRuleSuggestion,
} from '../actions/diet-rules-ai.actions';

/** Striktheid-badgekleur uit (diet_logic, strictness): DROP+Streng=rood, LIMIT+Zacht=oranje. */
function strictnessBadgeColor(
  dietLogic: string | undefined,
  strictness: 'hard' | 'soft',
): 'red' | 'orange' | 'amber' | 'zinc' {
  if (dietLogic === 'drop' && strictness === 'hard') return 'red';
  if (dietLogic === 'limit' && strictness === 'soft') return 'orange';
  if (strictness === 'hard') return 'red';
  return 'amber';
}

type GuardRailsVNextOverviewProps = {
  dietTypeId: string;
  dietTypeName: string;
};

/**
 * Copy to clipboard helper component
 */
function CopyHashButton({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <Button
      onClick={handleCopy}
      plain
      className="ml-2 text-zinc-600 dark:text-zinc-400"
    >
      {copied ? (
        <>
          <CheckIcon className="h-4 w-4" />
          Gekopieerd
        </>
      ) : (
        <>
          <ClipboardIcon className="h-4 w-4" />
          Kopieer
        </>
      )}
    </Button>
  );
}

/**
 * Guard Rails vNext Overview Component
 *
 * Displays interactive overview of Guard Rails vNext ruleset with edit, block/pause, delete, and drag-and-drop functionality.
 */
export function GuardRailsVNextOverview({
  dietTypeId,
  dietTypeName,
}: GuardRailsVNextOverviewProps) {
  const router = useRouter();
  const [groupPolicies, setGroupPolicies] = useState<GroupPolicyRow[]>([]);
  const [data, setData] = useState<GuardRailsRulesetViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [draggedRuleId, setDraggedRuleId] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<
    GuardRailsRulesetViewModel['rules'][0] | null
  >(null);
  const [editFormData, setEditFormData] = useState({
    priority: 50,
    strictness: 'hard' as 'hard' | 'soft',
    action: 'block' as 'allow' | 'block',
    target: 'ingredient' as 'ingredient' | 'step' | 'metadata' | 'category',
    matchMode: 'word_boundary' as
      | 'exact'
      | 'word_boundary'
      | 'substring'
      | 'canonical_id',
    matchValue: '',
    reasonCode: '',
    label: '',
  });
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<
    'recipe_rule' | 'constraint' | null
  >(null);
  const [createFormData, setCreateFormData] = useState({
    // Common
    priority: 50,
    strictness: 'hard' as 'hard' | 'soft',
    action: 'block' as 'allow' | 'block',
    // Recipe rule specific
    target: 'ingredient' as 'ingredient' | 'step' | 'metadata' | 'category',
    matchMode: 'word_boundary' as
      | 'exact'
      | 'word_boundary'
      | 'substring'
      | 'canonical_id',
    matchValue: '',
    reasonCode: '',
    label: '',
    // Constraint specific (Dieetregel: diet_logic + category)
    categoryId: '',
    dietLogic: 'drop' as DietLogicType,
    minPerDay: null as number | null,
    minPerWeek: null as number | null,
    maxPerDay: null as number | null,
    maxPerWeek: null as number | null,
    aiInstruction: '',
  });
  const [categories, setCategories] = useState<
    Array<{
      id: string;
      code: string;
      name_nl: string;
      category_type: 'forbidden' | 'required';
      is_diet_specific: boolean;
    }>
  >([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Dieetregel (groepsregel) bewerken: dialog + form
  const [editingPolicy, setEditingPolicy] = useState<GroupPolicyRow | null>(
    null,
  );
  const [showPolicyEditDialog, setShowPolicyEditDialog] = useState(false);
  const [policyEditFormData, setPolicyEditFormData] = useState<{
    dietLogic: DietLogicType;
    priority: number;
    strictness: 'hard' | 'soft';
    minPerDay: number | null;
    minPerWeek: number | null;
    maxPerDay: number | null;
    maxPerWeek: number | null;
  }>({
    dietLogic: 'drop',
    priority: 50,
    strictness: 'hard',
    minPerDay: null,
    minPerWeek: null,
    maxPerDay: null,
    maxPerWeek: null,
  });
  const [deletingConstraintId, setDeletingConstraintId] = useState<
    string | null
  >(null);
  /** Bulk delete: lijst constraint-ids die in één keer verwijderd worden */
  const [deletingConstraintIds, setDeletingConstraintIds] = useState<string[]>(
    [],
  );
  /** Multi-select voor dieetregels (groepsregels) */
  const [selectedConstraintIds, setSelectedConstraintIds] = useState<
    Set<string>
  >(new Set());
  const [draggedPolicyConstraintId, setDraggedPolicyConstraintId] = useState<
    string | null
  >(null);
  // AI analyse dialog
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);
  const [analysisResult, setAnalysisResult] =
    useState<DietRulesAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  /** Per advies: 'accepted' = toegepast, 'dismissed' = genegeerd */
  const [suggestionStatus, setSuggestionStatus] = useState<
    Record<number, 'accepted' | 'dismissed'>
  >({});
  /** Index van het advies dat momenteel wordt toegepast (actie naar backend) */
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  // AI suggest bij nieuwe constraint
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    loadCategories();
  }, [dietTypeId]);

  async function loadCategories() {
    try {
      const result = await getIngredientCategoriesForDietAction(dietTypeId);
      if (result.ok && result.data) {
        setCategories(result.data);
      }
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  }

  function loadData() {
    setIsLoading(true);
    setError(null);
    startTransition(async () => {
      try {
        // Load group policies (consolidated view: only constraints)
        const policiesResult = await getDietGroupPoliciesAction(dietTypeId);
        if ('error' in policiesResult) {
          setError(policiesResult.error);
        } else if (policiesResult.data) {
          setGroupPolicies(policiesResult.data);
        }

        // Load full ruleset for metadata (hash, version)
        const result = await loadDietGuardrailsRulesetAction(dietTypeId);
        if ('error' in result) {
          // Don't fail if this errors, we still have group policies
          console.warn('Could not load full ruleset:', result.error);
        } else if (result.data) {
          setData(result.data);
        }
      } catch (err) {
        setError('Onverwachte fout bij laden guard rails ruleset');
      } finally {
        setIsLoading(false);
      }
    });
  }

  /** RuleId-formaat voor guardrail-actions (delete/swap priority) wanneer we alleen constraintId hebben */
  function ruleIdForConstraint(constraintId: string): string {
    return `db:diet_category_constraints:${constraintId}:0`;
  }

  function handlePolicyRowClick(policy: GroupPolicyRow) {
    setEditingPolicy(policy);
    setPolicyEditFormData({
      dietLogic:
        policy.dietLogic ?? (policy.action === 'block' ? 'drop' : 'force'),
      priority: policy.priority,
      strictness: policy.strictness,
      minPerDay: policy.minPerDay ?? null,
      minPerWeek: policy.minPerWeek ?? null,
      maxPerDay: policy.maxPerDay ?? null,
      maxPerWeek: policy.maxPerWeek ?? null,
    });
    setShowPolicyEditDialog(true);
  }

  async function handleSavePolicyEdit() {
    if (!editingPolicy) return;
    startTransition(async () => {
      try {
        setError(null);
        const result = await updateDietCategoryConstraintAction(
          editingPolicy.constraintId,
          {
            diet_logic: policyEditFormData.dietLogic,
            rule_priority: policyEditFormData.priority,
            strictness: policyEditFormData.strictness,
            min_per_day: policyEditFormData.minPerDay,
            min_per_week: policyEditFormData.minPerWeek,
            max_per_day: policyEditFormData.maxPerDay,
            max_per_week: policyEditFormData.maxPerWeek,
          },
        );
        if (!result.ok) {
          setError(result.error?.message ?? 'Fout bij opslaan');
          return;
        }
        setShowPolicyEditDialog(false);
        setEditingPolicy(null);
        await loadData();
      } catch (err) {
        setError(
          `Onverwachte fout: ${err instanceof Error ? err.message : 'Onbekende fout'}`,
        );
      }
    });
  }

  function handleDeletePolicyClick(
    policy: GroupPolicyRow,
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    setDeletingRuleId(null);
    setDeletingConstraintId(policy.constraintId);
    setShowDeleteDialog(true);
  }

  async function handlePriorityUp(policy: GroupPolicyRow, e: React.MouseEvent) {
    e.stopPropagation();
    const idx = groupPolicies.findIndex(
      (p) => p.constraintId === policy.constraintId,
    );
    if (idx <= 0) return;
    const prev = groupPolicies[idx - 1];
    startTransition(async () => {
      try {
        const result = await swapGuardRailRulePriorityAction(
          ruleIdForConstraint(prev.constraintId),
          ruleIdForConstraint(policy.constraintId),
        );
        if ('error' in result) setError(result.error);
        else await loadData();
      } catch (err) {
        setError('Onverwachte fout bij prioriteit wijzigen');
      }
    });
  }

  async function handlePriorityDown(
    policy: GroupPolicyRow,
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    const idx = groupPolicies.findIndex(
      (p) => p.constraintId === policy.constraintId,
    );
    if (idx < 0 || idx >= groupPolicies.length - 1) return;
    const next = groupPolicies[idx + 1];
    startTransition(async () => {
      try {
        const result = await swapGuardRailRulePriorityAction(
          ruleIdForConstraint(policy.constraintId),
          ruleIdForConstraint(next.constraintId),
        );
        if ('error' in result) setError(result.error);
        else await loadData();
      } catch (err) {
        setError('Onverwachte fout bij prioriteit wijzigen');
      }
    });
  }

  async function handlePolicyPauseOrActivate(policy: GroupPolicyRow) {
    const ruleId = ruleIdForConstraint(policy.constraintId);
    startTransition(async () => {
      try {
        if (policy.isPaused) {
          const result = await updateGuardRailRuleAction(ruleId, {
            isPaused: false,
          });
          if ('error' in result) setError(result.error);
          else await loadData();
        } else {
          const result = await blockOrPauseGuardRailRuleAction(ruleId, 'pause');
          if ('error' in result) setError(result.error);
          else await loadData();
        }
      } catch (err) {
        setError('Onverwachte fout bij pauzeren/activeren');
      }
    });
  }

  function handlePolicyDragStart(e: React.DragEvent, constraintId: string) {
    e.stopPropagation();
    setDraggedPolicyConstraintId(constraintId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', constraintId);
  }

  function handlePolicyDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }

  async function handlePolicyDrop(
    e: React.DragEvent,
    targetConstraintId: string,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const sourceId =
      draggedPolicyConstraintId ?? e.dataTransfer.getData('text/plain');
    setDraggedPolicyConstraintId(null);
    if (!sourceId || sourceId === targetConstraintId) return;
    startTransition(async () => {
      try {
        const result = await swapGuardRailRulePriorityAction(
          ruleIdForConstraint(sourceId),
          ruleIdForConstraint(targetConstraintId),
        );
        if ('error' in result) setError(result.error);
        else await loadData();
      } catch (err) {
        setError('Onverwachte fout bij verplaatsen');
      }
    });
  }

  function handlePolicyDragEnd() {
    setDraggedPolicyConstraintId(null);
  }

  function handleRowClick(rule: GuardRailsRulesetViewModel['rules'][0]) {
    setEditingRule(rule);
    setEditFormData({
      priority: rule.priority,
      strictness: rule.strictness,
      action: rule.action,
      target: rule.target,
      matchMode: rule.matchMode,
      matchValue: rule.matchValue,
      reasonCode: rule.reasonCode,
      label: rule.label || '',
    });
    setValidationErrors({});
    setShowEditDialog(true);
  }

  /**
   * Check if a rule is a constraint (category-based)
   * Only checks rule ID format - do not use label patterns as fallback
   * because recipe_adaptation_rules can also have similar labels
   */
  function isConstraintRule(ruleId: string): boolean {
    const parts = ruleId.split(':');
    return (
      parts.length >= 3 &&
      parts[0] === 'db' &&
      parts[1] === 'diet_category_constraints'
    );
  }

  /**
   * Check if a rule is a recipe adaptation rule (ingredient-based)
   */
  function isRecipeAdaptationRule(ruleId: string): boolean {
    const parts = ruleId.split(':');
    return (
      parts.length >= 3 &&
      parts[0] === 'db' &&
      parts[1] === 'recipe_adaptation_rules'
    );
  }

  /**
   * Get display label for target type
   * Uses the actual target value from the view model (which is already adjusted for constraints)
   */
  function getTargetDisplayLabel(target: string): string {
    // The target value is already correct from the view model:
    // - Constraints have target: "category"
    // - Recipe adaptation rules have their actual target from database
    const targetLabels: Record<string, string> = {
      category: 'Categorie',
      ingredient: 'Ingrediënt',
      step: 'Stap',
      metadata: 'Metadata',
    };
    return (
      targetLabels[target] || target.charAt(0).toUpperCase() + target.slice(1)
    );
  }

  /**
   * Determine which fields are editable based on rule source type
   * All fields are now editable - the backend will only save supported fields
   */
  function getEditableFields(ruleId: string): {
    priority: boolean;
    strictness: boolean;
    action: boolean;
    target: boolean;
    matchMode: boolean;
    matchValue: boolean;
    reasonCode: boolean;
    label: boolean;
  } {
    // All fields are now editable
    // Note: The backend will only persist fields that are supported for each rule type
    return {
      priority: true,
      strictness: true,
      action: true,
      target: true,
      matchMode: true,
      matchValue: true,
      reasonCode: true,
      label: true,
    };
  }

  /**
   * Validate form data and return validation state
   */
  function validateForm(): boolean {
    if (!editingRule) return false;

    const errors: Record<string, string> = {};
    const editableFields = getEditableFields(editingRule.id);

    // Priority validation (only if editable)
    if (editableFields.priority) {
      if (editFormData.priority < 1 || editFormData.priority > 65500) {
        errors.priority =
          'Prioriteit moet tussen 1 en 65500 liggen (1 = hoogst)';
      }
    }

    // Match value validation (only if field is editable)
    if (editableFields.matchValue) {
      if (editFormData.matchMode === 'canonical_id') {
        if (!editFormData.matchValue || editFormData.matchValue.trim() === '') {
          errors.matchValue = 'Canonical ID is vereist';
        }
      } else {
        if (!editFormData.matchValue || editFormData.matchValue.trim() === '') {
          errors.matchValue = 'Match waarde is vereist';
        }
      }
    }

    // Substring + step validation (only if both fields are editable)
    if (editableFields.matchMode && editableFields.target) {
      if (
        editFormData.matchMode === 'substring' &&
        editFormData.target === 'step'
      ) {
        errors.matchMode =
          'Substring match mode is niet toegestaan voor step target';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  /**
   * Check if form is valid (without setting errors, for button state)
   */
  function isFormValid(): boolean {
    if (!editingRule) return false;

    const errors: Record<string, string> = {};
    const editableFields = getEditableFields(editingRule.id);

    // Priority validation (only if editable)
    if (editableFields.priority) {
      if (editFormData.priority < 1 || editFormData.priority > 65500) {
        errors.priority =
          'Prioriteit moet tussen 1 en 65500 liggen (1 = hoogst)';
      }
    }

    // Match value validation (only if field is editable)
    if (editableFields.matchValue) {
      if (editFormData.matchMode === 'canonical_id') {
        if (!editFormData.matchValue || editFormData.matchValue.trim() === '') {
          errors.matchValue = 'Canonical ID is vereist';
        }
      } else {
        if (!editFormData.matchValue || editFormData.matchValue.trim() === '') {
          errors.matchValue = 'Match waarde is vereist';
        }
      }
    }

    // Substring + step validation (only if both fields are editable)
    if (editableFields.matchMode && editableFields.target) {
      if (
        editFormData.matchMode === 'substring' &&
        editFormData.target === 'step'
      ) {
        errors.matchMode =
          'Substring match mode is niet toegestaan voor step target';
      }
    }

    return Object.keys(errors).length === 0;
  }

  /**
   * Validate create form and return validation state
   */
  function validateCreateForm(): boolean {
    if (!createMode) return false;

    const errors: Record<string, string> = {};

    if (createMode === 'recipe_rule') {
      // Match value is required
      if (
        !createFormData.matchValue ||
        createFormData.matchValue.trim() === ''
      ) {
        errors.matchValue = 'Match waarde is vereist';
      }

      // Target is required
      if (!createFormData.target) {
        errors.target = 'Target is vereist';
      }

      // Match mode is required
      if (!createFormData.matchMode) {
        errors.matchMode = 'Match mode is vereist';
      }

      // Substring + step validation
      if (
        createFormData.matchMode === 'substring' &&
        createFormData.target === 'step'
      ) {
        errors.matchMode =
          'Substring match mode is niet toegestaan voor step target';
      }

      // Reason code is required
      if (
        !createFormData.reasonCode ||
        createFormData.reasonCode.trim() === ''
      ) {
        errors.reasonCode = 'Reason code is vereist';
      }
    } else if (createMode === 'constraint') {
      if (
        !createFormData.categoryId ||
        createFormData.categoryId.trim() === ''
      ) {
        errors.categoryId = 'Ingrediëntgroep is vereist';
      }
      if (!createFormData.strictness) {
        errors.strictness = 'Striktheid is vereist';
      }
    }

    // Priority validation (common)
    if (createFormData.priority < 1 || createFormData.priority > 65500) {
      errors.priority = 'Prioriteit moet tussen 1 en 65500 liggen (1 = hoogst)';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  /**
   * Check if create form is valid (without setting errors, for button state)
   */
  function isCreateFormValid(): boolean {
    if (!createMode) return false;

    const errors: Record<string, string> = {};

    if (createMode === 'recipe_rule') {
      if (
        !createFormData.matchValue ||
        createFormData.matchValue.trim() === ''
      ) {
        errors.matchValue = 'Match waarde is vereist';
      }
      if (!createFormData.target) {
        errors.target = 'Target is vereist';
      }
      if (!createFormData.matchMode) {
        errors.matchMode = 'Match mode is vereist';
      }
      if (
        createFormData.matchMode === 'substring' &&
        createFormData.target === 'step'
      ) {
        errors.matchMode =
          'Substring match mode is niet toegestaan voor step target';
      }
      if (
        !createFormData.reasonCode ||
        createFormData.reasonCode.trim() === ''
      ) {
        errors.reasonCode = 'Reason code is vereist';
      }
    } else if (createMode === 'constraint') {
      if (
        !createFormData.categoryId ||
        createFormData.categoryId.trim() === ''
      ) {
        errors.categoryId = 'Ingrediëntgroep is vereist';
      }
      if (!createFormData.strictness) {
        errors.strictness = 'Striktheid is vereist';
      }
    }

    if (createFormData.priority < 1 || createFormData.priority > 65500) {
      errors.priority = 'Prioriteit moet tussen 1 en 65500 liggen (1 = hoogst)';
    }

    return Object.keys(errors).length === 0;
  }

  async function handleCreate() {
    if (!createMode) return;

    // Validate before creating
    if (!validateCreateForm()) {
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        setSuccessMessage(null);

        if (createMode === 'recipe_rule') {
          const result = await createGuardRailRuleAction({
            dietTypeId,
            sourceType: 'recipe_rule',
            payload: {
              term: createFormData.matchValue.trim(),
              ruleCode: createFormData.reasonCode.trim(),
              ruleLabel:
                createFormData.label.trim() || createFormData.reasonCode.trim(),
              priority: createFormData.priority,
              target:
                createFormData.target === 'category'
                  ? undefined
                  : createFormData.target,
              matchMode: createFormData.matchMode,
            },
          });

          if ('error' in result) {
            setError(result.error);
            return;
          }

          setSuccessMessage('Dieetregel aangemaakt');
          setTimeout(() => {
            setShowCreateDialog(false);
            setCreateMode(null);
            setValidationErrors({});
            setError(null);
            setSuccessMessage(null);
            loadData();
          }, 1000);
        } else if (createMode === 'constraint') {
          const result = await createGuardRailRuleAction({
            dietTypeId,
            sourceType: 'constraint',
            payload: {
              categoryId: createFormData.categoryId,
              dietLogic: createFormData.dietLogic,
              strictness: createFormData.strictness,
              rulePriority: createFormData.priority,
              minPerDay: createFormData.minPerDay,
              minPerWeek: createFormData.minPerWeek,
              maxPerDay: createFormData.maxPerDay,
              maxPerWeek: createFormData.maxPerWeek,
              aiInstruction: createFormData.aiInstruction.trim() || null,
            },
          });

          if ('error' in result) {
            setError(result.error);
            return;
          }

          setSuccessMessage('Dieetregel aangemaakt');
          setTimeout(() => {
            setShowCreateDialog(false);
            setCreateMode(null);
            setValidationErrors({});
            setError(null);
            setSuccessMessage(null);
            loadData();
          }, 1000);
        }
      } catch (err) {
        console.error('Error creating rule:', err);
        setError(
          `Onverwachte fout bij aanmaken: ${err instanceof Error ? err.message : 'Onbekende fout'}`,
        );
      }
    });
  }

  /**
   * Get all available reason codes
   */
  function getReasonCodeOptions(): GuardReasonCode[] {
    return [
      'FORBIDDEN_INGREDIENT',
      'ALLERGEN_PRESENT',
      'DISLIKED_INGREDIENT',
      'MISSING_REQUIRED_CATEGORY',
      'INVALID_CATEGORY',
      'INVALID_NEVO_CODE',
      'INVALID_CANONICAL_ID',
      'CALORIE_TARGET_MISS',
      'MACRO_TARGET_MISS',
      'MEAL_PREFERENCE_MISS',
      'MEAL_STRUCTURE_VIOLATION',
      'SOFT_CONSTRAINT_VIOLATION',
      'EVALUATOR_ERROR',
      'EVALUATOR_WARNING',
      'RULESET_LOAD_ERROR',
      'UNKNOWN_ERROR',
    ];
  }

  async function handleSaveEdit() {
    if (!editingRule) return;

    // Validate before saving
    if (!validateForm()) {
      return;
    }

    startTransition(async () => {
      try {
        const editableFields = getEditableFields(editingRule.id);

        // Only send fields that are editable
        const updates: Parameters<typeof updateGuardRailRuleAction>[1] = {};

        if (editableFields.priority) {
          updates.priority = editFormData.priority;
        }
        if (editableFields.strictness) {
          updates.strictness = editFormData.strictness;
        }
        if (editableFields.action) {
          updates.action = editFormData.action;
        }
        if (editableFields.target && editFormData.target !== 'category') {
          updates.target = editFormData.target;
        }
        if (editableFields.matchMode) {
          updates.matchMode = editFormData.matchMode;
        }
        if (editableFields.matchValue) {
          updates.matchValue = editFormData.matchValue.trim();
        }
        if (editableFields.reasonCode) {
          updates.reasonCode = editFormData.reasonCode.trim();
        }
        if (editableFields.label) {
          updates.label = editFormData.label.trim();
        }

        const result = await updateGuardRailRuleAction(editingRule.id, updates);
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setShowEditDialog(false);
        setEditingRule(null);
        setValidationErrors({});
        await loadData();
      } catch (err) {
        console.error('Error saving rule:', err);
        setError(
          `Onverwachte fout bij opslaan: ${err instanceof Error ? err.message : 'Onbekende fout'}`,
        );
      }
    });
  }

  async function handleBlockOrPause(ruleId: string, action: 'block' | 'pause') {
    startTransition(async () => {
      try {
        const result = await blockOrPauseGuardRailRuleAction(ruleId, action);
        if ('error' in result) {
          setError(result.error);
          return;
        }
        await loadData();
      } catch (err) {
        setError('Onverwachte fout bij blokkeren/pauzeren');
      }
    });
  }

  function handleDeleteClick(ruleId: string) {
    setDeletingConstraintId(null);
    setDeletingRuleId(ruleId);
    setShowDeleteDialog(true);
  }

  async function handleDeleteConfirm() {
    if (deletingConstraintIds.length > 0) {
      startTransition(async () => {
        try {
          setError(null);
          for (const id of deletingConstraintIds) {
            const result = await deleteGuardRailRuleAction(
              ruleIdForConstraint(id),
            );
            if ('error' in result) {
              setError(result.error);
              return;
            }
          }
          setShowDeleteDialog(false);
          setDeletingConstraintIds([]);
          setSelectedConstraintIds(new Set());
          await loadData();
        } catch (err) {
          setError('Onverwachte fout bij verwijderen');
        }
      });
      return;
    }
    if (deletingConstraintId) {
      startTransition(async () => {
        try {
          const result = await deleteGuardRailRuleAction(
            ruleIdForConstraint(deletingConstraintId),
          );
          if ('error' in result) setError(result.error);
          else {
            setShowDeleteDialog(false);
            setDeletingConstraintId(null);
            await loadData();
          }
        } catch (err) {
          setError('Onverwachte fout bij verwijderen');
        }
      });
      return;
    }
    if (!deletingRuleId) return;
    startTransition(async () => {
      try {
        const result = await deleteGuardRailRuleAction(deletingRuleId);
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setShowDeleteDialog(false);
        setDeletingRuleId(null);
        await loadData();
      } catch (err) {
        setError('Onverwachte fout bij verwijderen');
      }
    });
  }

  function togglePolicySelection(constraintId: string) {
    setSelectedConstraintIds((prev) => {
      const next = new Set(prev);
      if (next.has(constraintId)) next.delete(constraintId);
      else next.add(constraintId);
      return next;
    });
  }

  function toggleAllPoliciesSelection() {
    if (selectedConstraintIds.size === groupPolicies.length) {
      setSelectedConstraintIds(new Set());
    } else {
      setSelectedConstraintIds(
        new Set(groupPolicies.map((p) => p.constraintId)),
      );
    }
  }

  function handleDragStart(e: React.DragEvent, ruleId: string) {
    setDraggedRuleId(ruleId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  async function handleDrop(e: React.DragEvent, targetRuleId: string) {
    e.preventDefault();
    if (!draggedRuleId || !data || draggedRuleId === targetRuleId) {
      setDraggedRuleId(null);
      return;
    }

    const draggedRule = data.rules.find((r) => r.id === draggedRuleId);
    const targetRule = data.rules.find((r) => r.id === targetRuleId);
    if (!draggedRule || !targetRule) {
      setDraggedRuleId(null);
      return;
    }

    // Find indices in the sorted list
    const draggedIndex = data.rules.findIndex((r) => r.id === draggedRuleId);
    const targetIndex = data.rules.findIndex((r) => r.id === targetRuleId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedRuleId(null);
      return;
    }

    // Calculate new priority based on position
    // Rules are sorted by priority DESC (higher = first)
    let newPriority: number;

    if (draggedIndex < targetIndex) {
      // Dragging down: place after target (lower priority)
      // We want dragged rule to appear after target, so it needs lower priority
      const nextIndex = targetIndex + 1;
      if (nextIndex < data.rules.length) {
        const nextRule = data.rules[nextIndex];
        // Calculate priority between target and next
        const diff = targetRule.priority - nextRule.priority;
        if (diff >= 2) {
          // Enough space, place in middle (closer to target)
          newPriority = targetRule.priority - Math.max(1, Math.floor(diff / 2));
        } else if (diff === 1) {
          // Only 1 difference, need to adjust next rule or use target - 1
          newPriority = targetRule.priority - 1;
        } else {
          // Same priority or next is higher, place just below target
          newPriority = Math.max(0, targetRule.priority - 1);
        }
      } else {
        // No next rule, place just below target
        newPriority = Math.max(0, targetRule.priority - 1);
      }
    } else {
      // Dragging up: place before target (higher priority)
      // We want dragged rule to appear before target, so it needs higher priority
      const prevIndex = targetIndex - 1;
      if (prevIndex >= 0) {
        const prevRule = data.rules[prevIndex];
        // Calculate priority between previous and target
        const diff = prevRule.priority - targetRule.priority;
        if (diff >= 2) {
          // Enough space, place in middle (closer to target)
          newPriority = prevRule.priority - Math.max(1, Math.floor(diff / 2));
        } else if (diff === 1) {
          // Only 1 difference, need to adjust or use target + 1
          newPriority = targetRule.priority + 1;
        } else {
          // Same priority or prev is lower, place just above target
          newPriority = Math.min(100, targetRule.priority + 1);
        }
      } else {
        // No previous rule, place just above target
        newPriority = Math.min(100, targetRule.priority + 1);
      }
    }

    // Ensure priority is within valid range
    newPriority = Math.max(0, Math.min(100, newPriority));

    // If calculated priority is same as current or same as target, adjust to ensure change
    if (
      newPriority === draggedRule.priority ||
      newPriority === targetRule.priority
    ) {
      if (draggedIndex < targetIndex) {
        // Dragging down, ensure lower than target
        newPriority = Math.max(0, targetRule.priority - 1);
      } else {
        // Dragging up, ensure higher than target
        newPriority = Math.min(100, targetRule.priority + 1);
      }
    }

    startTransition(async () => {
      try {
        const result = await updateGuardRailRulePriorityAction(
          draggedRuleId,
          newPriority,
        );
        if ('error' in result) {
          setError(result.error);
        } else {
          await loadData();
        }
      } catch (err) {
        console.error('Error updating priority:', err);
        setError(
          `Onverwachte fout bij bijwerken prioriteit: ${err instanceof Error ? err.message : 'Onbekende fout'}`,
        );
      } finally {
        setDraggedRuleId(null);
      }
    });
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <div className="h-6 w-64 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-2" />
          <div className="h-4 w-96 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
        </div>

        {/* Table skeleton */}
        <div className="rounded-lg bg-white shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <div className="p-6">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state (load, create, update, delete)
  if (error) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <Text className="font-semibold">Er is een fout opgetreden</Text>
          <Text className="mt-1">{error}</Text>
          <Button onClick={loadData} color="red" className="mt-4">
            Opnieuw proberen
          </Button>
        </div>
      </div>
    );
  }

  // Empty state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <Text className="text-zinc-500 dark:text-zinc-400">
            Geen guard rails regels gevonden voor dit dieet.
          </Text>
        </div>
      </div>
    );
  }

  const shortHash = data.contentHash.substring(0, 8);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Dieetregels
            </h2>
            <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Diet Logic (P0–P3): DROP → FORCE → LIMIT → PASS. Guard Rails vNext
              voor validatie en enforcement.
            </Text>
            <Text className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              Basis ruleset (mode: recipe_adaptation)
            </Text>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                Hash:
              </Text>
              <code className="ml-2 text-xs font-mono text-zinc-700 dark:text-zinc-300">
                {shortHash}
              </code>
              <CopyHashButton hash={data.contentHash} />
            </div>
            <Badge color="zinc">Version: {data.rulesetVersion}</Badge>
          </div>
        </div>
      </div>

      {/* Group Policies Table - Consolidated view (only constraints) */}
      <div className="rounded-lg bg-white shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Groepsregels ({groupPolicies.length}) – klik op een regel om
                dieetlogic/prioriteit te bewerken
              </Text>
              <Text className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Diet Logic: DROP (Geblokkeerd) / FORCE (Verplicht) / LIMIT
                (Beperkt) / PASS (Toegestaan).
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={async () => {
                  setShowAnalysisDialog(true);
                  setAnalysisResult(null);
                  setAnalysisError(null);
                  setSuggestionStatus({});
                  setIsAnalyzing(true);
                  try {
                    const result = await analyzeDietRulesWithAI(dietTypeId);
                    if ('error' in result) {
                      setAnalysisError(result.error);
                    } else if (result.data) {
                      setAnalysisResult(result.data);
                      setSuggestionStatus({});
                    }
                  } finally {
                    setIsAnalyzing(false);
                  }
                }}
                color="zinc"
                disabled={isAnalyzing}
              >
                <SparklesIcon className="h-4 w-4" />
                {isAnalyzing ? 'Analyseren…' : 'AI analyse'}
              </Button>
              <Button
                onClick={() => {
                  setCreateMode('constraint');
                  setCreateFormData((prev) => ({
                    ...prev,
                    categoryId: '',
                    dietLogic: 'drop',
                    minPerDay: null,
                    minPerWeek: null,
                    maxPerDay: null,
                    maxPerWeek: null,
                    aiInstruction: '',
                  }));
                  setShowCreateDialog(true);
                }}
              >
                <PlusIcon className="h-4 w-4" />
                Nieuwe regel
              </Button>
              {selectedConstraintIds.size > 0 && (
                <Button
                  color="red"
                  onClick={() => {
                    setDeletingConstraintId(null);
                    setDeletingRuleId(null);
                    setDeletingConstraintIds([...selectedConstraintIds]);
                    setShowDeleteDialog(true);
                  }}
                >
                  <TrashIcon className="h-4 w-4" />
                  Verwijder geselecteerde ({selectedConstraintIds.size})
                </Button>
              )}
            </div>
          </div>
          {groupPolicies.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Geen groepsregels geconfigureerd. Voeg een nieuwe regel toe via
              &quot;Nieuwe regel&quot;.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader className="w-10" title="Selecteer">
                      <Checkbox
                        checked={
                          groupPolicies.length > 0 &&
                          selectedConstraintIds.size === groupPolicies.length
                        }
                        indeterminate={
                          selectedConstraintIds.size > 0 &&
                          selectedConstraintIds.size < groupPolicies.length
                        }
                        onChange={toggleAllPoliciesSelection}
                        aria-label="Alles selecteren"
                      />
                    </TableHeader>
                    <TableHeader
                      className="w-10"
                      title="Sleep om volgorde te wijzigen"
                    />
                    <TableHeader className="w-10" title="Actief / Gepauzeerd" />
                    <TableHeader>Categorie</TableHeader>
                    <TableHeader>Diet Logic (P0–P3)</TableHeader>
                    <TableHeader>Actie</TableHeader>
                    <TableHeader>Striktheid</TableHeader>
                    <TableHeader>Prioriteit</TableHeader>
                    <TableHeader>Items</TableHeader>
                    <TableHeader className="w-32">Acties</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {groupPolicies.map((policy, idx) => {
                    const logic: DietLogicType | undefined = policy.dietLogic;
                    const logicLabel = logic ? DIET_LOGIC_LABELS[logic] : null;
                    const logicBadgeColor =
                      logic === 'drop'
                        ? 'red'
                        : logic === 'force'
                          ? 'green'
                          : logic === 'limit'
                            ? 'amber'
                            : 'zinc';
                    const isPaused = policy.isPaused;
                    const isDragging =
                      draggedPolicyConstraintId === policy.constraintId;
                    return (
                      <TableRow
                        key={policy.constraintId}
                        draggable
                        onDragStart={(e) =>
                          handlePolicyDragStart(e, policy.constraintId)
                        }
                        onDragOver={handlePolicyDragOver}
                        onDrop={(e) => handlePolicyDrop(e, policy.constraintId)}
                        onDragEnd={handlePolicyDragEnd}
                        className={`cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${isPaused ? 'opacity-60 grayscale' : ''} ${isDragging ? 'opacity-50' : ''}`}
                        onClick={() => handlePolicyRowClick(policy)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedConstraintIds.has(
                              policy.constraintId,
                            )}
                            onChange={() =>
                              togglePolicySelection(policy.constraintId)
                            }
                            aria-label={`${policy.categoryName} selecteren`}
                          />
                        </TableCell>
                        <TableCell
                          onClick={(e) => e.stopPropagation()}
                          className="cursor-grab active:cursor-grabbing text-zinc-400"
                          title="Sleep om volgorde te wijzigen"
                        >
                          <Bars3Icon className="h-5 w-5" aria-hidden />
                        </TableCell>
                        <TableCell
                          onClick={(e) => e.stopPropagation()}
                          title={
                            isPaused
                              ? 'Gepauzeerd – klik om te activeren'
                              : 'Actief – klik om regel te pauzeren'
                          }
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePolicyPauseOrActivate(policy);
                            }}
                            className="p-0.5 rounded text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label={isPaused ? 'Activeren' : 'Pauzeren'}
                          >
                            {isPaused ? (
                              <PlayIcon className="h-5 w-5 text-amber-500" />
                            ) : (
                              <PauseIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div>
                            <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                              {policy.categoryName}
                            </Text>
                            <code className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                              {policy.categorySlug}
                            </code>
                          </div>
                        </TableCell>
                        <TableCell>
                          {logicLabel ? (
                            <Badge
                              color={logicBadgeColor}
                              title={logicLabel.description}
                            >
                              {logicLabel.name}
                            </Badge>
                          ) : (
                            <Badge
                              color={
                                policy.action === 'block' ? 'red' : 'green'
                              }
                            >
                              {policy.action === 'block'
                                ? 'Blokkeren'
                                : 'Toestaan'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            color={policy.action === 'block' ? 'red' : 'green'}
                          >
                            {policy.action === 'block'
                              ? 'Blokkeren'
                              : 'Toestaan'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1">
                            {policy.dietLogic === 'drop' &&
                              policy.strictness === 'hard' && (
                                <XCircleIcon
                                  className="h-4 w-4 text-red-500"
                                  aria-hidden
                                />
                              )}
                            {policy.dietLogic === 'limit' &&
                              policy.strictness === 'soft' && (
                                <ExclamationTriangleIcon
                                  className="h-4 w-4 text-orange-500"
                                  aria-hidden
                                />
                              )}
                            <Badge
                              color={
                                strictnessBadgeColor(
                                  policy.dietLogic,
                                  policy.strictness,
                                ) as 'red' | 'orange' | 'amber' | 'zinc'
                              }
                            >
                              {policy.strictness === 'hard'
                                ? 'Streng'
                                : 'Zacht'}
                            </Badge>
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              plain
                              className="!p-0.5 text-zinc-600 dark:text-zinc-400"
                              onClick={(e) => handlePriorityUp(policy, e)}
                              disabled={idx === 0}
                              title="Prioriteit omhoog"
                            >
                              <ChevronUpIcon className="h-4 w-4" />
                            </Button>
                            <Text className="text-sm w-6 text-center">
                              {policy.priority}
                            </Text>
                            <Button
                              plain
                              className="!p-0.5 text-zinc-600 dark:text-zinc-400"
                              onClick={(e) => handlePriorityDown(policy, e)}
                              disabled={idx === groupPolicies.length - 1}
                              title="Prioriteit omlaag"
                            >
                              <ChevronDownIcon className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                            {policy.itemCount}
                          </Text>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Dropdown>
                            <DropdownButton
                              as={Button}
                              plain
                              color="zinc"
                              className="!p-0.5"
                              title="Acties"
                            >
                              <EllipsisVerticalIcon className="h-5 w-5" />
                            </DropdownButton>
                            <DropdownMenu anchor="bottom end">
                              <DropdownItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  handlePolicyRowClick(policy);
                                }}
                              >
                                Bewerken
                              </DropdownItem>
                              <DropdownItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  handlePolicyPauseOrActivate(policy);
                                }}
                              >
                                {policy.isPaused ? 'Activeren' : 'Pauzeren'}
                              </DropdownItem>
                              <DropdownItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  setDeletingRuleId(null);
                                  setDeletingConstraintId(policy.constraintId);
                                  setShowDeleteDialog(true);
                                }}
                                className="text-red-600 dark:text-red-400"
                              >
                                Verwijderen
                              </DropdownItem>
                            </DropdownMenu>
                          </Dropdown>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Policy Edit Dialog – Dieetregel (groepsregel) bewerken */}
      <Dialog
        open={showPolicyEditDialog}
        onClose={() => {
          setShowPolicyEditDialog(false);
          setEditingPolicy(null);
        }}
      >
        <DialogTitle>Dieetregel bewerken</DialogTitle>
        <DialogBody>
          <DialogDescription>
            Pas Diet Logic, prioriteit en striktheid aan. FORCE: min per
            dag/week; LIMIT: max per dag/week.
          </DialogDescription>
          {editingPolicy && (
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {editingPolicy.categoryName}{' '}
                <code className="text-xs text-zinc-500">
                  ({editingPolicy.categorySlug})
                </code>
              </div>
              <FieldGroup>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field>
                    <Label>Diet Logic (P0–P3)</Label>
                    <Select
                      value={policyEditFormData.dietLogic}
                      onChange={(e) =>
                        setPolicyEditFormData({
                          ...policyEditFormData,
                          dietLogic: e.target.value as DietLogicType,
                        })
                      }
                    >
                      {(Object.keys(DIET_LOGIC_LABELS) as DietLogicType[]).map(
                        (key) => (
                          <option key={key} value={key}>
                            {DIET_LOGIC_LABELS[key].name}
                          </option>
                        ),
                      )}
                    </Select>
                  </Field>
                  <Field>
                    <Label>Prioriteit</Label>
                    <Input
                      type="number"
                      min={1}
                      max={65500}
                      value={policyEditFormData.priority}
                      onChange={(e) =>
                        setPolicyEditFormData({
                          ...policyEditFormData,
                          priority: parseInt(e.target.value, 10) || 1,
                        })
                      }
                    />
                    <Description>1 = hoogst, 65500 = laagst</Description>
                  </Field>
                  <Field>
                    <Label>Striktheid</Label>
                    <Select
                      value={policyEditFormData.strictness}
                      onChange={(e) =>
                        setPolicyEditFormData({
                          ...policyEditFormData,
                          strictness: e.target.value as 'hard' | 'soft',
                        })
                      }
                    >
                      <option value="hard">Streng</option>
                      <option value="soft">Zacht</option>
                    </Select>
                  </Field>
                  {/* FORCE: min per dag/week – altijd tonen, bij FORCE gebruikt */}
                  <Field>
                    <Label>Min per dag (bij FORCE)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={policyEditFormData.minPerDay ?? ''}
                      onChange={(e) => {
                        const v =
                          e.target.value === ''
                            ? null
                            : parseInt(e.target.value, 10);
                        setPolicyEditFormData({
                          ...policyEditFormData,
                          minPerDay: v ?? null,
                        });
                      }}
                      placeholder="—"
                    />
                  </Field>
                  <Field>
                    <Label>Min per week (bij FORCE)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={policyEditFormData.minPerWeek ?? ''}
                      onChange={(e) => {
                        const v =
                          e.target.value === ''
                            ? null
                            : parseInt(e.target.value, 10);
                        setPolicyEditFormData({
                          ...policyEditFormData,
                          minPerWeek: v ?? null,
                        });
                      }}
                      placeholder="—"
                    />
                  </Field>
                  {/* LIMIT: max per dag/week – altijd tonen, bij LIMIT gebruikt */}
                  <Field>
                    <Label>Max per dag (bij LIMIT)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={policyEditFormData.maxPerDay ?? ''}
                      onChange={(e) => {
                        const v =
                          e.target.value === ''
                            ? null
                            : parseInt(e.target.value, 10);
                        setPolicyEditFormData({
                          ...policyEditFormData,
                          maxPerDay: v ?? null,
                        });
                      }}
                      placeholder="—"
                    />
                  </Field>
                  <Field>
                    <Label>Max per week (bij LIMIT)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={policyEditFormData.maxPerWeek ?? ''}
                      onChange={(e) => {
                        const v =
                          e.target.value === ''
                            ? null
                            : parseInt(e.target.value, 10);
                        setPolicyEditFormData({
                          ...policyEditFormData,
                          maxPerWeek: v ?? null,
                        });
                      }}
                      placeholder="—"
                    />
                  </Field>
                </div>
              </FieldGroup>
              <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                <Link
                  href={`/settings/diets/${dietTypeId}/edit?tab=ingredient-groups&categoryId=${editingPolicy.categoryId}`}
                  className="underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Termen van deze groep beheren →
                </Link>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button
            color="zinc"
            onClick={() => {
              setShowPolicyEditDialog(false);
              setEditingPolicy(null);
            }}
          >
            Annuleren
          </Button>
          <Button
            onClick={handleSavePolicyEdit}
            disabled={isPending || !editingPolicy}
          >
            {isPending ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={showEditDialog}
        onClose={() => {
          setShowEditDialog(false);
          setEditingRule(null);
          setValidationErrors({});
        }}
      >
        <DialogTitle>Regel bewerken</DialogTitle>
        <DialogBody>
          <DialogDescription>
            Bewerk de eigenschappen van deze guard rail regel.
          </DialogDescription>
          {editingRule &&
            (() => {
              const editableFields = getEditableFields(editingRule.id);

              return (
                <div className="mt-4">
                  {error && (
                    <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
                      <strong>Fout:</strong> {error}
                    </div>
                  )}
                  <FieldGroup>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Label */}
                      <Field>
                        <Label htmlFor="edit-label">Label</Label>
                        <Input
                          id="edit-label"
                          type="text"
                          value={editFormData.label}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              label: e.target.value,
                            });
                            if (validationErrors.label) {
                              setValidationErrors({
                                ...validationErrors,
                                label: '',
                              });
                            }
                          }}
                          placeholder="Beschrijving van de regel"
                          disabled={!editableFields.label}
                        />
                      </Field>

                      {/* Actie */}
                      <Field>
                        <Label htmlFor="edit-action">Actie</Label>
                        <Select
                          id="edit-action"
                          value={editFormData.action}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              action: e.target.value as 'allow' | 'block',
                            });
                          }}
                          disabled={!editableFields.action}
                        >
                          <option value="allow">Allow</option>
                          <option value="block">Block</option>
                        </Select>
                      </Field>

                      {/* Striktheid */}
                      <Field>
                        <Label htmlFor="edit-strictness">Striktheid</Label>
                        <Select
                          id="edit-strictness"
                          value={editFormData.strictness}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              strictness: e.target.value as 'hard' | 'soft',
                            });
                          }}
                          disabled={!editableFields.strictness}
                        >
                          <option value="hard">Hard</option>
                          <option value="soft">Soft</option>
                        </Select>
                      </Field>

                      {/* Prioriteit */}
                      <Field>
                        <Label htmlFor="edit-priority">Prioriteit</Label>
                        <Input
                          id="edit-priority"
                          type="number"
                          min="1"
                          max="65500"
                          value={editFormData.priority}
                          onChange={(e) => {
                            const value = parseInt(e.target.value, 10) || 0;
                            setEditFormData({
                              ...editFormData,
                              priority: value,
                            });
                            if (validationErrors.priority) {
                              setValidationErrors({
                                ...validationErrors,
                                priority: '',
                              });
                            }
                          }}
                          disabled={!editableFields.priority}
                        />
                        {validationErrors.priority && (
                          <Description className="text-red-600 dark:text-red-400">
                            {validationErrors.priority}
                          </Description>
                        )}
                        {!validationErrors.priority && (
                          <Description>1 = hoogst, 65500 = laagst</Description>
                        )}
                      </Field>

                      {/* Target */}
                      <Field>
                        <Label htmlFor="edit-target">Target</Label>
                        <Select
                          id="edit-target"
                          value={editFormData.target}
                          onChange={(e) => {
                            const newTarget = e.target.value as
                              | 'ingredient'
                              | 'step'
                              | 'metadata';
                            setEditFormData({
                              ...editFormData,
                              target: newTarget,
                            });
                            // Re-validate if matchMode is substring
                            if (
                              editFormData.matchMode === 'substring' &&
                              newTarget === 'step'
                            ) {
                              setValidationErrors({
                                ...validationErrors,
                                matchMode:
                                  'Substring match mode is niet toegestaan voor step target',
                              });
                            } else if (validationErrors.matchMode) {
                              setValidationErrors({
                                ...validationErrors,
                                matchMode: '',
                              });
                            }
                          }}
                          disabled={!editableFields.target}
                        >
                          <option value="ingredient">Ingredient</option>
                          <option value="step">Step</option>
                          <option value="metadata">Metadata</option>
                        </Select>
                        {editingRule && isConstraintRule(editingRule.id) && (
                          <Description>
                            Categorie (afgeleid van categorie) - kan worden
                            aangepast
                          </Description>
                        )}
                      </Field>

                      {/* Match Mode */}
                      <Field>
                        <Label htmlFor="edit-match-mode">Match Mode</Label>
                        <Select
                          id="edit-match-mode"
                          value={editFormData.matchMode}
                          onChange={(e) => {
                            const newMode = e.target.value as
                              | 'exact'
                              | 'word_boundary'
                              | 'substring'
                              | 'canonical_id';
                            setEditFormData({
                              ...editFormData,
                              matchMode: newMode,
                            });
                            // Validate substring + step combination
                            if (
                              newMode === 'substring' &&
                              editFormData.target === 'step'
                            ) {
                              setValidationErrors({
                                ...validationErrors,
                                matchMode:
                                  'Substring match mode is niet toegestaan voor step target',
                              });
                            } else if (validationErrors.matchMode) {
                              setValidationErrors({
                                ...validationErrors,
                                matchMode: '',
                              });
                            }
                          }}
                          disabled={!editableFields.matchMode}
                        >
                          <option value="exact">Exact</option>
                          <option value="word_boundary">Word Boundary</option>
                          <option value="substring">Substring</option>
                          <option value="canonical_id">Canonical ID</option>
                        </Select>
                        {validationErrors.matchMode && (
                          <Description className="text-red-600 dark:text-red-400">
                            {validationErrors.matchMode}
                          </Description>
                        )}
                      </Field>

                      {/* Match Value / Canonical ID */}
                      <Field className="md:col-span-2">
                        <Label htmlFor="edit-match-value">
                          {editFormData.matchMode === 'canonical_id'
                            ? 'Canonical ID'
                            : 'Match waarde'}
                        </Label>
                        <Input
                          id="edit-match-value"
                          type="text"
                          value={editFormData.matchValue}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              matchValue: e.target.value,
                            });
                            if (validationErrors.matchValue) {
                              setValidationErrors({
                                ...validationErrors,
                                matchValue: '',
                              });
                            }
                          }}
                          placeholder={
                            editFormData.matchMode === 'canonical_id'
                              ? 'bijv. NEVO-12345'
                              : 'bijv. seaweed, kelp, nori'
                          }
                          disabled={!editableFields.matchValue}
                        />
                        {validationErrors.matchValue && (
                          <Description className="text-red-600 dark:text-red-400">
                            {validationErrors.matchValue}
                          </Description>
                        )}
                      </Field>

                      {/* Reason Code */}
                      <Field className="md:col-span-2">
                        <Label htmlFor="edit-reason-code">Reason Code</Label>
                        <Select
                          id="edit-reason-code"
                          value={editFormData.reasonCode}
                          onChange={(e) => {
                            setEditFormData({
                              ...editFormData,
                              reasonCode: e.target.value,
                            });
                          }}
                          disabled={!editableFields.reasonCode}
                        >
                          <option value="">Selecteer reason code</option>
                          {getReasonCodeOptions().map((code) => (
                            <option key={code} value={code} title={code}>
                              {getGuardReasonLabel(code)}
                            </option>
                          ))}
                        </Select>
                        <Description>
                          Selecteer de reason code voor deze regel
                        </Description>
                      </Field>
                    </div>
                  </FieldGroup>
                </div>
              );
            })()}
        </DialogBody>
        <DialogActions>
          <Button
            onClick={() => {
              setShowEditDialog(false);
              setEditingRule(null);
              setValidationErrors({});
            }}
            color="zinc"
          >
            Annuleren
          </Button>
          <Button
            onClick={handleSaveEdit}
            disabled={isPending || !isFormValid()}
          >
            {isPending ? 'Opslaan...' : 'Opslaan'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Dialog */}
      <Dialog
        open={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setCreateMode(null);
          setValidationErrors({});
          setSuggestError(null);
          setError(null);
          setSuccessMessage(null);
        }}
      >
        <DialogTitle>Nieuwe regel aanmaken</DialogTitle>
        <DialogBody>
          <DialogDescription>
            Kies het type regel dat je wilt aanmaken.
          </DialogDescription>
          {successMessage && (
            <div className="mt-4 rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
              {successMessage}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <strong>Fout:</strong> {error}
            </div>
          )}
          <div className="mt-4">
            {!createMode ? (
              <FieldGroup>
                <Field>
                  <Label htmlFor="create-rule-type">Regeltype *</Label>
                  <Select
                    id="create-rule-type"
                    value=""
                    onChange={(e) => {
                      const mode = e.target.value as
                        | 'recipe_rule'
                        | 'constraint'
                        | '';
                      if (mode) {
                        setCreateMode(mode);
                        setValidationErrors({});
                      }
                    }}
                  >
                    <option value="">Selecteer regeltype</option>
                    <option value="recipe_rule">
                      Ingredient/tekst regel (Recipe Adaptation Rule)
                    </option>
                    <option value="constraint">
                      Category constraint (Diet Category Constraint)
                    </option>
                  </Select>
                  <Description>
                    Kies het type regel dat je wilt aanmaken. Recipe rules zijn
                    voor specifieke ingredient/tekst matching, constraints zijn
                    voor categorieën.
                  </Description>
                </Field>
              </FieldGroup>
            ) : createMode === 'recipe_rule' ? (
              <FieldGroup>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Match Value */}
                  <Field className="md:col-span-2">
                    <Label htmlFor="create-match-value">Match waarde *</Label>
                    <Input
                      id="create-match-value"
                      type="text"
                      value={createFormData.matchValue}
                      onChange={(e) => {
                        setCreateFormData({
                          ...createFormData,
                          matchValue: e.target.value,
                        });
                        if (validationErrors.matchValue) {
                          setValidationErrors({
                            ...validationErrors,
                            matchValue: '',
                          });
                        }
                      }}
                      placeholder="bijv. seaweed, kelp, nori"
                    />
                    {validationErrors.matchValue && (
                      <Description className="text-red-600 dark:text-red-400">
                        {validationErrors.matchValue}
                      </Description>
                    )}
                    {!validationErrors.matchValue && (
                      <Description>
                        De term om te matchen (bijv. ingredient naam)
                      </Description>
                    )}
                  </Field>

                  {/* Target */}
                  <Field>
                    <Label htmlFor="create-target">Target *</Label>
                    <Select
                      id="create-target"
                      value={createFormData.target}
                      onChange={(e) => {
                        const newTarget = e.target.value as
                          | 'ingredient'
                          | 'step'
                          | 'metadata';
                        setCreateFormData({
                          ...createFormData,
                          target: newTarget,
                        });
                        // Re-validate if matchMode is substring
                        if (
                          createFormData.matchMode === 'substring' &&
                          newTarget === 'step'
                        ) {
                          setValidationErrors({
                            ...validationErrors,
                            matchMode:
                              'Substring match mode is niet toegestaan voor step target',
                          });
                        } else if (validationErrors.matchMode) {
                          setValidationErrors({
                            ...validationErrors,
                            matchMode: '',
                          });
                        }
                      }}
                    >
                      <option value="ingredient">Ingredient</option>
                      <option value="step">Step</option>
                      <option value="metadata">Metadata</option>
                    </Select>
                    {validationErrors.target && (
                      <Description className="text-red-600 dark:text-red-400">
                        {validationErrors.target}
                      </Description>
                    )}
                  </Field>

                  {/* Match Mode */}
                  <Field>
                    <Label htmlFor="create-match-mode">Match Mode *</Label>
                    <Select
                      id="create-match-mode"
                      value={createFormData.matchMode}
                      onChange={(e) => {
                        const newMode = e.target.value as
                          | 'exact'
                          | 'word_boundary'
                          | 'substring'
                          | 'canonical_id';
                        setCreateFormData({
                          ...createFormData,
                          matchMode: newMode,
                        });
                        // Validate substring + step combination
                        if (
                          newMode === 'substring' &&
                          createFormData.target === 'step'
                        ) {
                          setValidationErrors({
                            ...validationErrors,
                            matchMode:
                              'Substring match mode is niet toegestaan voor step target',
                          });
                        } else if (validationErrors.matchMode) {
                          setValidationErrors({
                            ...validationErrors,
                            matchMode: '',
                          });
                        }
                      }}
                    >
                      <option value="exact">Exact</option>
                      <option value="word_boundary">Word Boundary</option>
                      <option value="substring">Substring</option>
                      <option value="canonical_id">Canonical ID</option>
                    </Select>
                    {validationErrors.matchMode && (
                      <Description className="text-red-600 dark:text-red-400">
                        {validationErrors.matchMode}
                      </Description>
                    )}
                  </Field>

                  {/* Reason Code */}
                  <Field className="md:col-span-2">
                    <Label htmlFor="create-reason-code">Reason Code *</Label>
                    <Select
                      id="create-reason-code"
                      value={createFormData.reasonCode}
                      onChange={(e) => {
                        setCreateFormData({
                          ...createFormData,
                          reasonCode: e.target.value,
                        });
                        if (validationErrors.reasonCode) {
                          setValidationErrors({
                            ...validationErrors,
                            reasonCode: '',
                          });
                        }
                      }}
                    >
                      <option value="">Selecteer reason code</option>
                      {getReasonCodeOptions().map((code) => (
                        <option key={code} value={code} title={code}>
                          {getGuardReasonLabel(code)}
                        </option>
                      ))}
                    </Select>
                    {validationErrors.reasonCode && (
                      <Description className="text-red-600 dark:text-red-400">
                        {validationErrors.reasonCode}
                      </Description>
                    )}
                  </Field>

                  {/* Label */}
                  <Field className="md:col-span-2">
                    <Label htmlFor="create-label">Label</Label>
                    <Input
                      id="create-label"
                      type="text"
                      value={createFormData.label}
                      onChange={(e) => {
                        setCreateFormData({
                          ...createFormData,
                          label: e.target.value,
                        });
                      }}
                      placeholder="Beschrijving van de regel (optioneel)"
                    />
                    <Description>
                      Human-readable label voor deze regel (optioneel)
                    </Description>
                  </Field>

                  {/* Priority */}
                  <Field>
                    <Label htmlFor="create-priority">Prioriteit *</Label>
                    <Input
                      id="create-priority"
                      type="number"
                      min="1"
                      max="65500"
                      value={createFormData.priority}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10) || 0;
                        setCreateFormData({
                          ...createFormData,
                          priority: value,
                        });
                        if (validationErrors.priority) {
                          setValidationErrors({
                            ...validationErrors,
                            priority: '',
                          });
                        }
                      }}
                    />
                    {validationErrors.priority && (
                      <Description className="text-red-600 dark:text-red-400">
                        {validationErrors.priority}
                      </Description>
                    )}
                    {!validationErrors.priority && (
                      <Description>1 = hoogst, 65500 = laagst</Description>
                    )}
                  </Field>
                </div>
              </FieldGroup>
            ) : (
              <FieldGroup>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Category (Ingrediëntgroep) – alleen groepen zonder bestaande regel, om "al bestaat" te voorkomen */}
                  <Field className="md:col-span-2">
                    <Label htmlFor="create-category">Ingrediëntgroep *</Label>
                    <Listbox
                      value={createFormData.categoryId || ''}
                      onChange={(value) => {
                        setCreateFormData({
                          ...createFormData,
                          categoryId: value ?? '',
                        });
                        if (validationErrors.categoryId) {
                          setValidationErrors({
                            ...validationErrors,
                            categoryId: '',
                          });
                        }
                      }}
                      placeholder="Selecteer ingrediëntgroep"
                      aria-label="Selecteer ingrediëntgroep"
                      className="w-full"
                    >
                      {categories
                        .filter(
                          (cat) =>
                            !groupPolicies.some((p) => p.categoryId === cat.id),
                        )
                        .sort((a, b) =>
                          a.is_diet_specific === b.is_diet_specific
                            ? 0
                            : a.is_diet_specific
                              ? -1
                              : 1,
                        )
                        .map((cat) => (
                          <ListboxOption key={cat.id} value={cat.id}>
                            <ListboxLabel>{cat.name_nl}</ListboxLabel>
                          </ListboxOption>
                        ))}
                    </Listbox>
                    {validationErrors.categoryId && (
                      <Description className="text-red-600 dark:text-red-400">
                        {validationErrors.categoryId}
                      </Description>
                    )}
                    <Description>
                      Alleen ingrediëntgroepen zonder bestaande dieetregel.
                      Termen beheer je in{' '}
                      <Link
                        href={`/settings/diets/${dietTypeId}/edit?tab=ingredient-groups`}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                      >
                        Ingrediëntgroepen
                      </Link>
                      .
                    </Description>
                    {categories.filter(
                      (c) => !groupPolicies.some((p) => p.categoryId === c.id),
                    ).length === 0 && (
                      <Text className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                        Alle ingrediëntgroepen hebben al een dieetregel. Bewerk
                        bestaande regels via de tabel.
                      </Text>
                    )}
                    {createFormData.categoryId && (
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          onClick={async () => {
                            setSuggestError(null);
                            setIsSuggesting(true);
                            try {
                              const result =
                                await suggestConstraintSettingsWithAI({
                                  dietTypeId,
                                  categoryId: createFormData.categoryId,
                                });
                              if ('error' in result) {
                                setSuggestError(result.error);
                              } else if (result.data) {
                                const s = result.data;
                                setCreateFormData((prev) => ({
                                  ...prev,
                                  dietLogic: s.dietLogic,
                                  strictness: s.strictness,
                                  priority: s.priority,
                                  minPerDay: s.minPerDay,
                                  minPerWeek: s.minPerWeek,
                                  maxPerDay: s.maxPerDay,
                                  maxPerWeek: s.maxPerWeek,
                                }));
                                setSuggestError(null);
                              }
                            } finally {
                              setIsSuggesting(false);
                            }
                          }}
                          color="zinc"
                          disabled={isSuggesting}
                        >
                          <SparklesIcon className="h-4 w-4" />
                          {isSuggesting ? 'Bezig…' : 'AI invullen'}
                        </Button>
                        <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                          Vul Diet Logic, striktheid, prioriteit en min/max voor
                          deze groep in op basis van bestaande regels en
                          richtlijnen.
                        </Text>
                      </div>
                    )}
                    {suggestError && (
                      <Description className="text-red-600 dark:text-red-400">
                        {suggestError}
                      </Description>
                    )}
                  </Field>

                  {/* Diet Logic (P0–P3) */}
                  <Field>
                    <Label htmlFor="create-diet-logic">
                      Diet Logic (P0–P3) *
                    </Label>
                    <Select
                      id="create-diet-logic"
                      value={createFormData.dietLogic}
                      onChange={(e) => {
                        setCreateFormData({
                          ...createFormData,
                          dietLogic: e.target.value as DietLogicType,
                        });
                      }}
                    >
                      {(Object.keys(DIET_LOGIC_LABELS) as DietLogicType[]).map(
                        (key) => (
                          <option key={key} value={key}>
                            {DIET_LOGIC_LABELS[key].name}
                          </option>
                        ),
                      )}
                    </Select>
                    <Description>
                      DROP (blokkeren), FORCE (verplicht), LIMIT (beperkt), PASS
                      (toegestaan)
                    </Description>
                  </Field>

                  {/* Strictness */}
                  <Field>
                    <Label htmlFor="create-strictness">Striktheid *</Label>
                    <Select
                      id="create-strictness"
                      value={createFormData.strictness}
                      onChange={(e) => {
                        setCreateFormData({
                          ...createFormData,
                          strictness: e.target.value as 'hard' | 'soft',
                        });
                      }}
                    >
                      <option value="hard">Streng</option>
                      <option value="soft">Zacht</option>
                    </Select>
                  </Field>

                  {/* Priority */}
                  <Field>
                    <Label htmlFor="create-priority-constraint">
                      Prioriteit *
                    </Label>
                    <Input
                      id="create-priority-constraint"
                      type="number"
                      min="1"
                      max="65500"
                      value={createFormData.priority}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10) || 0;
                        setCreateFormData({
                          ...createFormData,
                          priority: value,
                        });
                        if (validationErrors.priority) {
                          setValidationErrors({
                            ...validationErrors,
                            priority: '',
                          });
                        }
                      }}
                    />
                    {validationErrors.priority && (
                      <Description className="text-red-600 dark:text-red-400">
                        {validationErrors.priority}
                      </Description>
                    )}
                    {!validationErrors.priority && (
                      <Description>1 = hoogst, 65500 = laagst</Description>
                    )}
                  </Field>

                  {/* AI instructie – optioneel, voor betere AI-interpretatie */}
                  <Field className="md:col-span-2">
                    <Label htmlFor="create-ai-instruction">AI instructie</Label>
                    <Textarea
                      id="create-ai-instruction"
                      value={createFormData.aiInstruction}
                      onChange={(e) =>
                        setCreateFormData({
                          ...createFormData,
                          aiInstruction: e.target.value,
                        })
                      }
                      placeholder="bijv. Uitzondering: gefermenteerde zuivel mag wel. Of: Alleen strenge fase Wahls."
                      rows={3}
                    />
                    <Description>
                      Optioneel: extra instructie voor AI zodat de regel beter
                      begrepen wordt (context, uitzonderingen, toelichting).
                    </Description>
                  </Field>

                  {/* FORCE: min per dag/week */}
                  {createFormData.dietLogic === 'force' && (
                    <>
                      <Field>
                        <Label>Min per dag</Label>
                        <Input
                          type="number"
                          min={0}
                          value={createFormData.minPerDay ?? ''}
                          onChange={(e) => {
                            const v =
                              e.target.value === ''
                                ? null
                                : parseInt(e.target.value, 10);
                            setCreateFormData({
                              ...createFormData,
                              minPerDay: v ?? null,
                            });
                          }}
                          placeholder="—"
                        />
                      </Field>
                      <Field>
                        <Label>Min per week</Label>
                        <Input
                          type="number"
                          min={0}
                          value={createFormData.minPerWeek ?? ''}
                          onChange={(e) => {
                            const v =
                              e.target.value === ''
                                ? null
                                : parseInt(e.target.value, 10);
                            setCreateFormData({
                              ...createFormData,
                              minPerWeek: v ?? null,
                            });
                          }}
                          placeholder="—"
                        />
                      </Field>
                    </>
                  )}

                  {/* LIMIT: max per dag/week */}
                  {createFormData.dietLogic === 'limit' && (
                    <>
                      <Field>
                        <Label>Max per dag</Label>
                        <Input
                          type="number"
                          min={0}
                          value={createFormData.maxPerDay ?? ''}
                          onChange={(e) => {
                            const v =
                              e.target.value === ''
                                ? null
                                : parseInt(e.target.value, 10);
                            setCreateFormData({
                              ...createFormData,
                              maxPerDay: v ?? null,
                            });
                          }}
                          placeholder="—"
                        />
                      </Field>
                      <Field>
                        <Label>Max per week</Label>
                        <Input
                          type="number"
                          min={0}
                          value={createFormData.maxPerWeek ?? ''}
                          onChange={(e) => {
                            const v =
                              e.target.value === ''
                                ? null
                                : parseInt(e.target.value, 10);
                            setCreateFormData({
                              ...createFormData,
                              maxPerWeek: v ?? null,
                            });
                          }}
                          placeholder="—"
                        />
                      </Field>
                    </>
                  )}
                </div>
              </FieldGroup>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button
            onClick={() => {
              setShowCreateDialog(false);
              setCreateMode(null);
              setValidationErrors({});
              setSuggestError(null);
              setError(null);
              setSuccessMessage(null);
            }}
            color="zinc"
          >
            Annuleren
          </Button>
          {createMode && (
            <Button
              onClick={handleCreate}
              disabled={isPending || !isCreateFormValid()}
            >
              {isPending ? 'Aanmaken...' : 'Aanmaken'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* AI Analyse Dialog */}
      <Dialog
        open={showAnalysisDialog}
        onClose={() => {
          setShowAnalysisDialog(false);
          setAnalysisResult(null);
          setAnalysisError(null);
          setSuggestionStatus({});
          setApplyingIndex(null);
        }}
      >
        <DialogTitle>AI-analyse van dieetregels</DialogTitle>
        <DialogBody>
          <DialogDescription>
            Gemini heeft de huidige dieetregels geanalyseerd op basis van de
            dieetrichtlijnen.
          </DialogDescription>
          {isAnalyzing && (
            <div className="mt-4 flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <SparklesIcon className="h-5 w-5 animate-pulse" />
              <Text>Analyseren…</Text>
            </div>
          )}
          {!isAnalyzing && analysisResult && (
            <div className="mt-4 space-y-4">
              {/* Compliance score + bevestiging als alles goed */}
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-sm font-semibold',
                    (analysisResult.complianceScore ?? 0) >= 90
                      ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                      : (analysisResult.complianceScore ?? 0) >= 70
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
                  )}
                >
                  Compliance: {Math.round(analysisResult.complianceScore ?? 0)}%
                </div>
                {(analysisResult.complianceScore ?? 0) >= 90 &&
                  (analysisResult.suggestions?.length ?? 0) === 0 &&
                  (analysisResult.weaknesses?.length ?? 0) === 0 && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-green-100 px-3 py-1.5 text-sm font-medium text-green-800 dark:bg-green-950/50 dark:text-green-300">
                      <CheckIcon className="h-4 w-4" />
                      De dieetregels zijn goed toegepast. Geen verbeterpunten.
                    </div>
                  )}
                {(analysisResult.complianceScore ?? 0) >= 90 &&
                  (analysisResult.suggestions?.length ?? 0) > 0 &&
                  analysisResult.suggestions.every(
                    (_, i) =>
                      suggestionStatus[i] === 'accepted' ||
                      suggestionStatus[i] === 'dismissed',
                  ) && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-green-100 px-3 py-1.5 text-sm font-medium text-green-800 dark:bg-green-950/50 dark:text-green-300">
                      <CheckIcon className="h-4 w-4" />
                      Alle adviezen verwerkt.
                    </div>
                  )}
              </div>
              <div>
                <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Samenvatting
                </Text>
                <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {analysisResult.summary}
                </Text>
              </div>
              {analysisResult.strengths &&
                analysisResult.strengths.length > 0 && (
                  <div>
                    <Text className="text-sm font-medium text-green-700 dark:text-green-400">
                      Sterke punten
                    </Text>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-zinc-600 dark:text-zinc-400">
                      {analysisResult.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              {analysisResult.weaknesses &&
                analysisResult.weaknesses.length > 0 && (
                  <div>
                    <Text className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Zwakke punten
                    </Text>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-zinc-600 dark:text-zinc-400">
                      {analysisResult.weaknesses.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              {analysisResult.suggestions &&
                analysisResult.suggestions.length > 0 && (
                  <div>
                    <Text className="text-sm font-medium text-blue-700 dark:text-blue-400">
                      Verbeteradviezen
                    </Text>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      Klik op Toepassen om het advies door te voeren, of Negeren
                      om het te verwerpen.
                    </p>
                    <ul className="mt-2 space-y-2">
                      {analysisResult.suggestions.map((s, i) => {
                        const suggestion: DietRuleSuggestion =
                          typeof s === 'string'
                            ? { text: s }
                            : (s as DietRuleSuggestion);
                        const status = suggestionStatus[i];
                        const isApplying = applyingIndex === i;
                        return (
                          <li
                            key={i}
                            className={clsx(
                              'flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm',
                              status === 'accepted'
                                ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                                : status === 'dismissed'
                                  ? 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50'
                                  : 'border-zinc-200 dark:border-zinc-700',
                            )}
                          >
                            <span className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-300">
                              {suggestion.text}
                            </span>
                            <span className="flex shrink-0 gap-1.5">
                              {status === 'accepted' ? (
                                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                  <CheckIcon className="h-4 w-4" />
                                  Toegepast
                                </span>
                              ) : status === 'dismissed' ? (
                                <span className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                                  <XCircleIcon className="h-4 w-4" />
                                  Genegeerd
                                </span>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    className="text-sm"
                                    disabled={isApplying}
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (suggestion.action) {
                                        setApplyingIndex(i);
                                        setAnalysisError(null);
                                        try {
                                          const result =
                                            await applyDietRuleAnalysisAction(
                                              dietTypeId,
                                              suggestion.action,
                                            );
                                          if ('error' in result) {
                                            setAnalysisError(result.error);
                                          } else {
                                            setSuggestionStatus((prev) => ({
                                              ...prev,
                                              [i]: 'accepted',
                                            }));
                                            loadData();
                                          }
                                        } finally {
                                          setApplyingIndex(null);
                                        }
                                      } else {
                                        setSuggestionStatus((prev) => ({
                                          ...prev,
                                          [i]: 'accepted',
                                        }));
                                      }
                                    }}
                                  >
                                    {isApplying ? 'Bezig…' : 'Toepassen'}
                                  </Button>
                                  <Button
                                    type="button"
                                    className="text-sm"
                                    color="zinc"
                                    disabled={isApplying}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSuggestionStatus((prev) => ({
                                        ...prev,
                                        [i]: 'dismissed',
                                      }));
                                    }}
                                  >
                                    Negeren
                                  </Button>
                                </>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
            </div>
          )}
          {!isAnalyzing && !analysisResult && analysisError && (
            <Text className="mt-4 text-sm text-red-600 dark:text-red-400">
              {analysisError}
            </Text>
          )}
        </DialogBody>
        <DialogActions>
          <Button
            onClick={() => {
              setShowAnalysisDialog(false);
              setAnalysisResult(null);
              setAnalysisError(null);
              setSuggestionStatus({});
              setApplyingIndex(null);
            }}
            color="zinc"
          >
            Sluiten
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingRuleId(null);
          setDeletingConstraintId(null);
          setDeletingConstraintIds([]);
        }}
      >
        <DialogTitle>
          {deletingConstraintIds.length > 0
            ? `Dieetregels verwijderen (${deletingConstraintIds.length})`
            : deletingConstraintId
              ? 'Dieetregel verwijderen'
              : 'Regel verwijderen'}
        </DialogTitle>
        <DialogBody>
          <DialogDescription>
            {deletingConstraintIds.length > 0
              ? `Weet je zeker dat je ${deletingConstraintIds.length} dieetregel${deletingConstraintIds.length === 1 ? '' : 's'} wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`
              : `Weet je zeker dat je ${deletingConstraintId ? 'deze dieetregel' : 'deze regel'} wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`}
          </DialogDescription>
        </DialogBody>
        <DialogActions>
          <Button
            onClick={() => {
              setShowDeleteDialog(false);
              setDeletingRuleId(null);
              setDeletingConstraintId(null);
              setDeletingConstraintIds([]);
            }}
            color="zinc"
          >
            Annuleren
          </Button>
          <Button onClick={handleDeleteConfirm} color="red">
            Verwijderen
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
