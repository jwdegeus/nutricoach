"use client";

import { useState, useTransition, useEffect } from "react";
import { saveOnboardingAction, loadOnboardingStatusAction } from "@/src/app/(app)/onboarding/actions/onboarding.actions";
import { Step1DietType } from "@/src/app/(app)/onboarding/components/Step1DietType";
import { Step2AllergiesDislikes } from "@/src/app/(app)/onboarding/components/Step2AllergiesDislikes";
import { Step3Practical } from "@/src/app/(app)/onboarding/components/Step3Practical";
import { Step4Goal } from "@/src/app/(app)/onboarding/components/Step4Goal";
import { Button } from "@/components/catalyst/button";
import { FieldGroup } from "@/components/catalyst/fieldset";
import { Text } from "@/components/catalyst/text";
import type { OnboardingInput, DietStrictness, VarietyLevel } from "@/src/app/(app)/onboarding/onboarding.types";

export function DietPreferencesForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [dietTypeId, setDietTypeId] = useState<string>("");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [maxPrepMinutes, setMaxPrepMinutes] = useState<number>(30);
  const [servingsDefault, setServingsDefault] = useState<number>(2);
  const [kcalTarget, setKcalTarget] = useState<number | null>(null);
  const [varietyLevel, setVarietyLevel] = useState<VarietyLevel>("std");
  const [strictness, setStrictness] = useState<DietStrictness | undefined>(undefined);

  // Load current preferences
  useEffect(() => {
    async function loadPreferences() {
      setIsLoading(true);
      try {
        const result = await loadOnboardingStatusAction();
        if ("data" in result && result.data) {
          const { summary } = result.data;
          if (summary.dietTypeId) setDietTypeId(summary.dietTypeId);
          if (summary.maxPrepMinutes) setMaxPrepMinutes(summary.maxPrepMinutes);
          if (summary.servingsDefault) setServingsDefault(summary.servingsDefault);
          if (summary.kcalTarget !== undefined) setKcalTarget(summary.kcalTarget);
          if (summary.varietyLevel) setVarietyLevel(summary.varietyLevel);
          if (summary.strictness) setStrictness(summary.strictness);
          if (summary.allergies) setAllergies(summary.allergies);
          if (summary.dislikes) setDislikes(summary.dislikes);
        }
      } catch (error) {
        console.error("Fout bij laden voorkeuren:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadPreferences();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!dietTypeId) {
      setError("Selecteer een dieettype");
      return;
    }

    const input: OnboardingInput = {
      dietTypeId,
      allergies,
      dislikes,
      maxPrepMinutes,
      servingsDefault,
      kcalTarget: kcalTarget ?? null,
      varietyLevel,
      strictness,
    };

    startTransition(async () => {
      const result = await saveOnboardingAction(input);
      if ("error" in result) {
        setError(result.error);
      } else {
        setSuccess("Dieetvoorkeuren succesvol bijgewerkt!");
      }
    });
  }

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="text-center py-8">
          <Text>Voorkeuren laden...</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <div className="mb-6">
        <h2 className="text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
          Dieetvoorkeuren
        </h2>
        <Text className="mt-1">
          Pas je dieetvoorkeuren aan. Deze instellingen worden gebruikt voor het plannen van je maaltijden.
        </Text>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <strong>Fout:</strong> {error}
        </div>
      )}

      {success && (
        <div className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
          <strong>Succes:</strong> {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <FieldGroup>
          {/* Step 1: Diet Type */}
          <div className="space-y-4">
            <Step1DietType value={dietTypeId} onChange={setDietTypeId} />
          </div>

          {/* Step 2: Allergies & Dislikes */}
          <div className="space-y-4 pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <Step2AllergiesDislikes
              allergies={allergies}
              dislikes={dislikes}
              onAllergiesChange={setAllergies}
              onDislikesChange={setDislikes}
            />
          </div>

          {/* Step 3: Practical Preferences */}
          <div className="space-y-4 pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <Step3Practical
              maxPrepMinutes={maxPrepMinutes}
              servingsDefault={servingsDefault}
              onMaxPrepMinutesChange={setMaxPrepMinutes}
              onServingsDefaultChange={setServingsDefault}
            />
          </div>

          {/* Step 4: Goals */}
          <div className="space-y-4 pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <Step4Goal
              kcalTarget={kcalTarget}
              varietyLevel={varietyLevel}
              strictness={strictness}
              onKcalTargetChange={setKcalTarget}
              onVarietyLevelChange={setVarietyLevel}
              onStrictnessChange={setStrictness}
            />
          </div>

          <div className="flex justify-end pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <Button type="submit" disabled={isPending || !dietTypeId}>
              {isPending ? "Opslaan..." : "Voorkeuren opslaan"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}
