'use client';

import { Select } from '@/components/catalyst/select';

interface Step3PracticalProps {
  maxPrepMinutes: number;
  servingsDefault: number;
  onMaxPrepMinutesChange: (minutes: number) => void;
  onServingsDefaultChange: (servings: number) => void;
}

const PREP_TIME_OPTIONS = [
  { value: 15, label: '15 minuten' },
  { value: 30, label: '30 minuten' },
  { value: 45, label: '45 minuten' },
  { value: 60, label: '60 minuten' },
];

const SERVINGS_OPTIONS = Array.from({ length: 6 }, (_, i) => i + 1);

export function Step3Practical({
  maxPrepMinutes,
  servingsDefault,
  onMaxPrepMinutesChange,
  onServingsDefaultChange,
}: Step3PracticalProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
          {/* TODO: i18n key: onboarding.step3.title */}
          Praktische voorkeuren
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {/* TODO: i18n key: onboarding.step3.description */}
          Vertel ons over je kookvoorkeuren en hoeveel porties je meestal nodig
          hebt.
        </p>
      </div>

      <div className="space-y-6">
        {/* Max Prep Minutes */}
        <div className="space-y-2">
          <label
            htmlFor="max-prep-minutes"
            className="block text-sm font-medium text-zinc-900 dark:text-white"
          >
            {/* TODO: i18n key: onboarding.step3.maxPrepMinutesLabel */}
            Maximale bereidingstijd
          </label>
          <Select
            id="max-prep-minutes"
            value={maxPrepMinutes.toString()}
            onChange={(e) => onMaxPrepMinutesChange(Number(e.target.value))}
            required
          >
            {PREP_TIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value.toString()}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {/* TODO: i18n key: onboarding.step3.maxPrepMinutesHelp */}
            We zullen alleen recepten voorstellen die binnen deze tijd kunnen
            worden bereid.
          </p>
        </div>

        {/* Servings Default */}
        <div className="space-y-2">
          <label
            htmlFor="servings-default"
            className="block text-sm font-medium text-zinc-900 dark:text-white"
          >
            {/* TODO: i18n key: onboarding.step3.servingsDefaultLabel */}
            Standaard aantal porties
          </label>
          <Select
            id="servings-default"
            value={servingsDefault.toString()}
            onChange={(e) => onServingsDefaultChange(Number(e.target.value))}
            required
          >
            {SERVINGS_OPTIONS.map((servings) => (
              <option key={servings} value={servings.toString()}>
                {servings} {servings === 1 ? 'portie' : 'porties'}
              </option>
            ))}
          </Select>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {/* TODO: i18n key: onboarding.step3.servingsDefaultHelp */}
            Het standaard aantal porties per maaltijd.
          </p>
        </div>
      </div>
    </div>
  );
}
