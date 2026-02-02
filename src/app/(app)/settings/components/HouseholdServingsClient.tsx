'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Select } from '@/components/catalyst/select';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import { useToast } from '@/src/components/app/ToastContext';
import {
  getHouseholdServingsPrefsAction,
  updateHouseholdServingsPrefsAction,
} from '../actions/household-servings.actions';

const MIN_SIZE = 1;
const MAX_SIZE = 12;

function clampSize(n: number): number {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.floor(n)));
}

export function HouseholdServingsClient() {
  const t = useTranslations('settings');
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savePending, setSavePending] = useState(false);

  const [householdSize, setHouseholdSize] = useState<number>(1);
  const [servingsPolicy, setServingsPolicy] = useState<
    'scale_to_household' | 'keep_recipe_servings'
  >('scale_to_household');

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    const result = await getHouseholdServingsPrefsAction();
    setLoading(false);
    if (result.ok) {
      setHouseholdSize(clampSize(result.data.householdSize));
      setServingsPolicy(result.data.servingsPolicy);
    } else {
      showToast({ type: 'error', title: result.error.message });
    }
  }, [showToast]);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  const isValid =
    householdSize >= MIN_SIZE &&
    householdSize <= MAX_SIZE &&
    Number.isInteger(householdSize);

  const handleSave = async () => {
    if (!isValid) return;
    setSavePending(true);
    const result = await updateHouseholdServingsPrefsAction({
      householdSize: clampSize(householdSize),
      servingsPolicy,
    });
    setSavePending(false);
    if (result.ok) {
      setHouseholdSize(result.data.householdSize);
      setServingsPolicy(result.data.servingsPolicy);
      showToast({ type: 'success', title: t('servingsSuccess') });
    } else {
      showToast({ type: 'error', title: result.error.message });
    }
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      setHouseholdSize(MIN_SIZE);
      return;
    }
    const n = Number(raw);
    if (!Number.isNaN(n)) {
      setHouseholdSize(clampSize(n));
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {t('servingsLoading')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <FieldGroup>
        <Field>
          <Label htmlFor="household_size">
            {t('servingsHouseholdSizeLabel')}
          </Label>
          <Description>{t('servingsHouseholdSizeDescription')}</Description>
          <Input
            id="household_size"
            type="number"
            min={MIN_SIZE}
            max={MAX_SIZE}
            value={householdSize}
            onChange={handleSizeChange}
            onBlur={() => setHouseholdSize((prev) => clampSize(prev))}
            disabled={savePending}
            className="mt-2 w-24"
          />
        </Field>
        <Field>
          <Label htmlFor="servings_policy">{t('servingsPolicyLabel')}</Label>
          <Description>{t('servingsPolicyDescription')}</Description>
          <Select
            id="servings_policy"
            value={servingsPolicy}
            onChange={(e) =>
              setServingsPolicy(
                e.target.value as 'scale_to_household' | 'keep_recipe_servings',
              )
            }
            disabled={savePending}
            className="mt-2"
          >
            <option value="scale_to_household">
              {t('servingsPolicyScaleToHousehold')}
            </option>
            <option value="keep_recipe_servings">
              {t('servingsPolicyKeepRecipeServings')}
            </option>
          </Select>
        </Field>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={savePending || !isValid}
          >
            {savePending ? t('saving') : t('save')}
          </Button>
        </div>
      </FieldGroup>
    </div>
  );
}
