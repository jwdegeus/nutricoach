'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveOnboardingAction } from '../actions/onboarding.actions';
import type { OnboardingInput } from '../onboarding.types';
import { ProgressIndicator } from './ProgressIndicator';
import { Step1DietType } from './Step1DietType';
import { Step2AllergiesDislikes } from './Step2AllergiesDislikes';
import { Step3Practical } from './Step3Practical';
import { Step4Goal } from './Step4Goal';
import { Button } from '@/components/catalyst/button';

const TOTAL_STEPS = 4;

export function OnboardingWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [formData, setFormData] = useState<Partial<OnboardingInput>>({
    dietTypeId: '',
    strictness: undefined,
    allergies: [],
    dislikes: [],
    maxPrepMinutes: 30,
    servingsDefault: 1,
    kcalTarget: null,
    varietyLevel: undefined,
  });

  const updateFormData = (updates: Partial<OnboardingInput>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    setError(null);
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1:
        return !!formData.dietTypeId;
      case 2:
        return true; // Allergies/dislikes are optional
      case 3:
        return (
          !!formData.maxPrepMinutes &&
          !!formData.servingsDefault &&
          formData.servingsDefault >= 1 &&
          formData.servingsDefault <= 6
        );
      case 4:
        return true; // kcalTarget and varietyLevel are optional
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS && canProceed()) {
      setCurrentStep((prev) => prev + 1);
      setError(null);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      setError(null);
    }
  };

  const handleSubmit = () => {
    if (!canProceed()) {
      setError('Vul alle verplichte velden in');
      return;
    }

    setError(null);
    startTransition(async () => {
      const input: OnboardingInput = {
        dietTypeId: formData.dietTypeId!,
        strictness: formData.strictness,
        allergies: formData.allergies || [],
        dislikes: formData.dislikes || [],
        maxPrepMinutes: formData.maxPrepMinutes!,
        servingsDefault: formData.servingsDefault!,
        kcalTarget: formData.kcalTarget ?? null,
        varietyLevel: formData.varietyLevel,
      };

      const result = await saveOnboardingAction(input);

      if ('error' in result) {
        setError(result.error);
      } else {
        // Refresh to ensure middleware picks up the new onboarding status
        // Then redirect to dashboard
        router.refresh();
        router.push('/dashboard');
      }
    });
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1DietType
            value={formData.dietTypeId || ''}
            onChange={(dietTypeId) => updateFormData({ dietTypeId })}
          />
        );
      case 2:
        return (
          <Step2AllergiesDislikes
            allergies={formData.allergies || []}
            dislikes={formData.dislikes || []}
            onAllergiesChange={(allergies) => updateFormData({ allergies })}
            onDislikesChange={(dislikes) => updateFormData({ dislikes })}
          />
        );
      case 3:
        return (
          <Step3Practical
            maxPrepMinutes={formData.maxPrepMinutes || 30}
            servingsDefault={formData.servingsDefault || 1}
            onMaxPrepMinutesChange={(maxPrepMinutes) =>
              updateFormData({ maxPrepMinutes })
            }
            onServingsDefaultChange={(servingsDefault) =>
              updateFormData({ servingsDefault })
            }
          />
        );
      case 4:
        return (
          <Step4Goal
            kcalTarget={formData.kcalTarget ?? null}
            varietyLevel={formData.varietyLevel}
            strictness={formData.strictness}
            onKcalTargetChange={(kcalTarget) => updateFormData({ kcalTarget })}
            onVarietyLevelChange={(varietyLevel) =>
              updateFormData({ varietyLevel })
            }
            onStrictnessChange={(strictness) => updateFormData({ strictness })}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10 sm:p-8">
      <ProgressIndicator currentStep={currentStep} totalSteps={TOTAL_STEPS} />

      {error && (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <strong>Fout:</strong> {error}
        </div>
      )}

      <div className="mt-8">{renderStep()}</div>

      <div className="mt-8 flex items-center justify-between border-t border-zinc-950/5 pt-6 dark:border-white/10">
        <Button
          onClick={handleBack}
          disabled={currentStep === 1 || isPending}
          outline
        >
          {/* TODO: i18n key: onboarding.back */}
          Terug
        </Button>

        {currentStep < TOTAL_STEPS ? (
          <Button
            onClick={handleNext}
            disabled={!canProceed() || isPending}
            color="dark/zinc"
          >
            {/* TODO: i18n key: onboarding.next */}
            Volgende
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!canProceed() || isPending}
            color="dark/zinc"
          >
            {isPending ? (
              <>
                {/* TODO: i18n key: onboarding.saving */}
                Opslaan...
              </>
            ) : (
              <>
                {/* TODO: i18n key: onboarding.save */}
                Opslaan
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
