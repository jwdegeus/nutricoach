'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { Badge } from '@/components/catalyst/badge';
import { Text } from '@/components/catalyst/text';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/catalyst/table';
import { useToast } from '@/src/components/app/ToastContext';
import {
  listHouseholdAvoidRulesAction,
  createHouseholdAvoidRuleAction,
  deleteHouseholdAvoidRuleAction,
  type HouseholdAvoidRuleRecord,
} from '../actions/household-avoid-rules.actions';
import { TrashIcon } from '@heroicons/react/16/solid';

const RULE_TYPE_LABELS: Record<string, string> = {
  allergen: 'Allergie',
  avoid: 'Vermijden',
  warning: 'Waarschuwing',
};

const MATCH_MODE_LABELS: Record<string, string> = {
  term: 'Term',
  nevo_code: 'NEVO-code',
};

const STRICTNESS_LABELS: Record<string, string> = {
  hard: 'Hard (blokkeert)',
  soft: 'Soft (waarschuwing)',
};

/** NEVO code: alleen cijfers (simple regex) */
const NEVO_CODE_REGEX = /^\d+$/;

export function HouseholdAvoidRulesClient({
  initialRules,
}: {
  initialRules?: HouseholdAvoidRuleRecord[];
} = {}) {
  const t = useTranslations('settings');
  const { showToast } = useToast();
  const [rules, setRules] = useState<HouseholdAvoidRuleRecord[]>(
    initialRules ?? [],
  );
  const [loading, setLoading] = useState(!initialRules);
  const [addPending, setAddPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [valueError, setValueError] = useState<string | null>(null);

  const [ruleType, setRuleType] = useState<'allergen' | 'avoid' | 'warning'>(
    'avoid',
  );
  const [matchMode, setMatchMode] = useState<'term' | 'nevo_code'>('term');
  const [matchValue, setMatchValue] = useState('');
  const [strictness, setStrictness] = useState<'hard' | 'soft'>('hard');
  const [note, setNote] = useState('');

  const loadRules = useCallback(async () => {
    setLoading(true);
    const result = await listHouseholdAvoidRulesAction();
    setLoading(false);
    if (result.ok) {
      setRules(result.data);
    } else {
      showToast({ type: 'error', title: result.error.message });
    }
  }, [showToast]);

  useEffect(() => {
    if (initialRules != null) return;
    queueMicrotask(() => loadRules());
  }, [initialRules, loadRules]);

  const validateValue = useCallback((): boolean => {
    const v = matchValue.trim();
    if (!v) {
      setValueError('Waarde is verplicht');
      return false;
    }
    if (matchMode === 'nevo_code' && !NEVO_CODE_REGEX.test(v)) {
      setValueError('NEVO-code mag alleen cijfers bevatten');
      return false;
    }
    setValueError(null);
    return true;
  }, [matchValue, matchMode]);

  const handleAdd = async () => {
    if (!validateValue()) return;
    setAddPending(true);
    const result = await createHouseholdAvoidRuleAction({
      ruleType,
      matchMode,
      matchValue: matchValue.trim(),
      strictness: ruleType === 'warning' ? 'soft' : strictness,
      note: note.trim() || undefined,
    });
    setAddPending(false);
    if (result.ok) {
      setRules((prev) => [
        {
          id: result.data.id,
          ruleType,
          matchMode,
          matchValue: matchValue.trim(),
          strictness: ruleType === 'warning' ? 'soft' : strictness,
          note: note.trim() || null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setMatchValue('');
      setNote('');
      showToast({ type: 'success', title: t('householdAvoidAdded') });
    } else {
      showToast({ type: 'error', title: result.error.message });
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const result = await deleteHouseholdAvoidRuleAction({ id });
    setDeletingId(null);
    if (result.ok) {
      setRules((prev) => prev.filter((r) => r.id !== id));
      showToast({ type: 'success', title: t('householdAvoidDeleted') });
    } else {
      showToast({ type: 'error', title: result.error.message });
    }
  };

  const effectiveStrictness = ruleType === 'warning' ? 'soft' : strictness;

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('householdAvoidLoading')}
        </p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('householdAvoidEmpty')}
        </p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('householdAvoidColType')}</TableHeader>
              <TableHeader>{t('householdAvoidColMatch')}</TableHeader>
              <TableHeader>{t('householdAvoidColValue')}</TableHeader>
              <TableHeader>{t('householdAvoidColStrictness')}</TableHeader>
              <TableHeader>{t('householdAvoidColNote')}</TableHeader>
              <TableHeader className="w-24">
                {t('householdAvoidColAction')}
              </TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Badge
                    color={
                      r.ruleType === 'allergen'
                        ? 'red'
                        : r.ruleType === 'warning'
                          ? 'amber'
                          : 'zinc'
                    }
                    className="text-xs"
                  >
                    {RULE_TYPE_LABELS[r.ruleType] ?? r.ruleType}
                  </Badge>
                </TableCell>
                <TableCell>
                  {MATCH_MODE_LABELS[r.matchMode] ?? r.matchMode}
                </TableCell>
                <TableCell>{r.matchValue}</TableCell>
                <TableCell>
                  <Badge
                    color={r.strictness === 'hard' ? 'red' : 'zinc'}
                    className="text-xs"
                  >
                    {STRICTNESS_LABELS[r.strictness] ?? r.strictness}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[120px] truncate">
                  {r.note ?? '—'}
                </TableCell>
                <TableCell>
                  <Button
                    color="red"
                    className="text-sm"
                    disabled={deletingId === r.id}
                    onClick={() => handleDelete(r.id)}
                    aria-label={t('householdAvoidDelete')}
                  >
                    {deletingId === r.id ? (
                      <span className="text-xs">
                        {t('householdAvoidDeleting')}
                      </span>
                    ) : (
                      <TrashIcon className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <Text className="text-base/6 font-medium text-zinc-950 dark:text-white">
          {t('householdAvoidNewBlockTitle')}
        </Text>
        <FieldGroup>
          <Field>
            <Label htmlFor="household-avoid-type">
              {t('householdAvoidTypeLabel')}
            </Label>
            <Listbox
              value={ruleType}
              onChange={(val) =>
                setRuleType(val as 'allergen' | 'avoid' | 'warning')
              }
              disabled={addPending}
              className="mt-2"
              aria-label="Type"
            >
              <ListboxOption value="allergen">
                {RULE_TYPE_LABELS.allergen}
              </ListboxOption>
              <ListboxOption value="avoid">
                {RULE_TYPE_LABELS.avoid}
              </ListboxOption>
              <ListboxOption value="warning">
                {RULE_TYPE_LABELS.warning}
              </ListboxOption>
            </Listbox>
          </Field>
          <Field>
            <Label htmlFor="household-avoid-match-mode">
              {t('householdAvoidMatchModeLabel')}
            </Label>
            <Listbox
              value={matchMode}
              onChange={(val) => {
                setMatchMode(val as 'term' | 'nevo_code');
                setValueError(null);
              }}
              disabled={addPending}
              className="mt-2"
              aria-label="Match mode"
            >
              <ListboxOption value="term">
                {MATCH_MODE_LABELS.term}
              </ListboxOption>
              <ListboxOption value="nevo_code">
                {MATCH_MODE_LABELS.nevo_code}
              </ListboxOption>
            </Listbox>
          </Field>
          <Field>
            <Label htmlFor="household-avoid-value">
              {t('householdAvoidValueLabel')}
            </Label>
            <Input
              id="household-avoid-value"
              value={matchValue}
              onChange={(e) => {
                setMatchValue(e.target.value);
                setValueError(null);
              }}
              placeholder={matchMode === 'nevo_code' ? 'NEVO code' : 'pinda'}
              disabled={addPending}
              className="mt-2"
            />
            {valueError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {valueError}
              </p>
            )}
          </Field>
          <Field>
            <Label htmlFor="household-avoid-strictness">
              {t('householdAvoidStrictnessLabel')}
            </Label>
            {ruleType === 'warning' && (
              <Description>
                {t('householdAvoidStrictnessWarningNote')}
              </Description>
            )}
            <Listbox
              value={effectiveStrictness}
              onChange={(val) => setStrictness(val as 'hard' | 'soft')}
              disabled={addPending || ruleType === 'warning'}
              className="mt-2"
              aria-label="Striktheid"
            >
              <ListboxOption value="hard">
                {STRICTNESS_LABELS.hard}
              </ListboxOption>
              <ListboxOption value="soft">
                {STRICTNESS_LABELS.soft}
              </ListboxOption>
            </Listbox>
          </Field>
          <Field>
            <Label htmlFor="household-avoid-note">
              {t('householdAvoidNoteLabel')}
            </Label>
            <Input
              id="household-avoid-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('householdAvoidNotePlaceholder')}
              disabled={addPending}
              className="mt-2"
            />
          </Field>
          <div className="flex justify-end">
            <Button type="button" onClick={handleAdd} disabled={addPending}>
              {addPending ? t('householdAvoidAdding') : t('householdAvoidAdd')}
            </Button>
          </div>
        </FieldGroup>
      </div>
    </div>
  );
}
