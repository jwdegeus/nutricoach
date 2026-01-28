'use client';

import { Input } from '@/components/catalyst/input';
import { Radio, RadioField, RadioGroup } from '@/components/catalyst/radio';
import { Label } from '@/components/catalyst/fieldset';
import type { DietStrictness, VarietyLevel } from '../onboarding.types';

interface Step4GoalProps {
  kcalTarget: number | null;
  varietyLevel: VarietyLevel | undefined;
  strictness: DietStrictness | undefined;
  onKcalTargetChange: (kcal: number | null) => void;
  onVarietyLevelChange: (level: VarietyLevel) => void;
  onStrictnessChange: (strictness: DietStrictness) => void;
}

const VARIETY_OPTIONS: Array<{
  value: VarietyLevel;
  label: string;
  description: string;
}> = [
  {
    value: 'low',
    label: 'Laag',
    description: 'Meer herhaling, minder variatie (3 dagen)',
  },
  {
    value: 'std',
    label: 'Standaard',
    description: 'Gebalanceerde variatie (7 dagen)',
  },
  {
    value: 'high',
    label: 'Hoog',
    description: 'Veel variatie, weinig herhaling (14 dagen)',
  },
];

export function Step4Goal({
  kcalTarget,
  varietyLevel,
  strictness,
  onKcalTargetChange,
  onVarietyLevelChange,
  onStrictnessChange,
}: Step4GoalProps) {
  const handleKcalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') {
      onKcalTargetChange(null);
    } else {
      const num = Number.parseInt(value, 10);
      if (!Number.isNaN(num)) {
        onKcalTargetChange(num);
      }
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
          {/* TODO: i18n key: onboarding.step4.title */}
          Doelen en voorkeuren
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {/* TODO: i18n key: onboarding.step4.description */}
          Stel je caloriedoel in en kies je voorkeuren voor variatie en
          striktheid.
        </p>
      </div>

      <div className="space-y-6">
        {/* Kcal Target */}
        <div className="space-y-2">
          <label
            htmlFor="kcal-target"
            className="block text-sm font-medium text-zinc-900 dark:text-white"
          >
            {/* TODO: i18n key: onboarding.step4.kcalTargetLabel */}
            Dagelijks caloriedoel (optioneel)
          </label>
          <Input
            id="kcal-target"
            type="number"
            min="800"
            max="6000"
            value={kcalTarget ?? ''}
            onChange={handleKcalChange}
            placeholder="Bijv. 2000"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {/* TODO: i18n key: onboarding.step4.kcalTargetHelp */}
            Laat leeg als je geen specifiek caloriedoel hebt. We gebruiken dit
            om maaltijden voor je te plannen.
          </p>
        </div>

        {/* Variety Level */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-900 dark:text-white">
            {/* TODO: i18n key: onboarding.step4.varietyLevelLabel */}
            Variatie niveau
          </label>
          <RadioGroup
            value={varietyLevel ?? 'std'}
            onChange={(value) => onVarietyLevelChange(value as VarietyLevel)}
          >
            {VARIETY_OPTIONS.map((option) => (
              <RadioField key={option.value}>
                <Radio value={option.value} />
                <Label>
                  <div>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {option.description}
                    </div>
                  </div>
                </Label>
              </RadioField>
            ))}
          </RadioGroup>
        </div>

        {/* Strictness */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-900 dark:text-white">
            {/* TODO: i18n key: onboarding.step4.strictnessLabel */}
            Striktheid
          </label>
          <RadioGroup
            value={strictness ?? 'flexible'}
            onChange={(value) => onStrictnessChange(value as DietStrictness)}
          >
            <RadioField>
              <Radio value="flexible" />
              <Label>
                <div>
                  <div className="font-medium">Flexibel</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Af en toe een uitzondering is prima
                  </div>
                </div>
              </Label>
            </RadioField>
            <RadioField>
              <Radio value="strict" />
              <Label>
                <div>
                  <div className="font-medium">Strikt</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Houd je strikt aan het gekozen dieet
                  </div>
                </div>
              </Label>
            </RadioField>
          </RadioGroup>
        </div>
      </div>
    </div>
  );
}
