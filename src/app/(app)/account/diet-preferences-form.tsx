"use client";

import { useState, useTransition, useEffect } from "react";
import { saveOnboardingAction, loadOnboardingStatusAction } from "@/src/app/(app)/onboarding/actions/onboarding.actions";
import { Step1DietType } from "@/src/app/(app)/onboarding/components/Step1DietType";
import { Step2AllergiesDislikes } from "@/src/app/(app)/onboarding/components/Step2AllergiesDislikes";
import { Step3Practical } from "@/src/app/(app)/onboarding/components/Step3Practical";
import { Step4Goal } from "@/src/app/(app)/onboarding/components/Step4Goal";
import { Button } from "@/components/catalyst/button";
import { FieldGroup, Field, Label, Description } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Badge } from "@/components/catalyst/badge";
import { Text } from "@/components/catalyst/text";
import { XMarkIcon } from "@heroicons/react/24/outline";
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
  const [mealPreferences, setMealPreferences] = useState<{
    breakfast?: string[];
    lunch?: string[];
    dinner?: string[];
  }>({});
  
  // Input states for meal preferences
  const [breakfastInput, setBreakfastInput] = useState("");
  const [lunchInput, setLunchInput] = useState("");
  const [dinnerInput, setDinnerInput] = useState("");

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
          if (summary.mealPreferences) {
            // Ensure arrays are always arrays (defensive check)
            // Also handle legacy string values by converting to arrays
            const normalizeToArray = (value: string | string[] | undefined): string[] | undefined => {
              if (!value) return undefined;
              if (Array.isArray(value)) return value.length > 0 ? value : undefined;
              if (typeof value === 'string' && value.trim()) return [value.trim()];
              return undefined;
            };
            
            setMealPreferences({
              breakfast: normalizeToArray(summary.mealPreferences.breakfast),
              lunch: normalizeToArray(summary.mealPreferences.lunch),
              dinner: normalizeToArray(summary.mealPreferences.dinner),
            });
          }
        }
      } catch (error) {
        console.error("Fout bij laden voorkeuren:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadPreferences();
  }, []);

  // Helper functions for tag management
  const addTag = (
    value: string,
    mealSlot: "breakfast" | "lunch" | "dinner",
    maxItems: number = 20
  ) => {
    const trimmed = value.trim();
    const current = mealPreferences[mealSlot] || [];
    if (
      trimmed &&
      !current.includes(trimmed) &&
      current.length < maxItems
    ) {
      setMealPreferences({
        ...mealPreferences,
        [mealSlot]: [...current, trimmed],
      });
    }
  };

  const removeTag = (
    tag: string,
    mealSlot: "breakfast" | "lunch" | "dinner"
  ) => {
    const current = mealPreferences[mealSlot] || [];
    setMealPreferences({
      ...mealPreferences,
      [mealSlot]: current.filter((t) => t !== tag),
    });
  };

  const handleBreakfastKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(breakfastInput, "breakfast");
      setBreakfastInput("");
    }
  };

  const handleLunchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(lunchInput, "lunch");
      setLunchInput("");
    }
  };

  const handleDinnerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(dinnerInput, "dinner");
      setDinnerInput("");
    }
  };

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
      mealPreferences,
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

          {/* Step 5: Meal Preferences */}
          <div className="space-y-4 pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <div>
              <h3 className="text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
                Maaltijdvoorkeuren
              </h3>
              <Text className="mt-1">
                Geef je voorkeuren op voor ontbijt, lunch en diner. Je kunt meerdere voorkeuren toevoegen door op Enter te drukken. Deze worden gebruikt bij het genereren van je maaltijdplan.
              </Text>
            </div>

            <div className="space-y-6">
              {/* Breakfast */}
              <Field>
                <Label>Ontbijt voorkeuren</Label>
                <Description>
                  Bijvoorbeeld: "eiwit shake", "groene smoothie", "omelet"
                </Description>
                <Input
                  type="text"
                  value={breakfastInput}
                  onChange={(e) => setBreakfastInput(e.target.value)}
                  onKeyDown={handleBreakfastKeyDown}
                  placeholder="Typ en druk op Enter om toe te voegen"
                />
                {Array.isArray(mealPreferences.breakfast) && mealPreferences.breakfast.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {mealPreferences.breakfast.map((tag) => (
                      <Badge
                        key={tag}
                        color="blue"
                        className="group/item flex items-center gap-1.5"
                      >
                        <span>{tag}</span>
                        <button
                          type="button"
                          onClick={() => removeTag(tag, "breakfast")}
                          className="rounded-full hover:bg-blue-600/20 dark:hover:bg-blue-500/20"
                          aria-label={`Verwijder ${tag}`}
                        >
                          <XMarkIcon className="size-3.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </Field>

              {/* Lunch */}
              <Field>
                <Label>Lunch voorkeuren</Label>
                <Description>
                  Bijvoorbeeld: "groene smoothie", "salade", "soep"
                </Description>
                <Input
                  type="text"
                  value={lunchInput}
                  onChange={(e) => setLunchInput(e.target.value)}
                  onKeyDown={handleLunchKeyDown}
                  placeholder="Typ en druk op Enter om toe te voegen"
                />
                {Array.isArray(mealPreferences.lunch) && mealPreferences.lunch.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {mealPreferences.lunch.map((tag) => (
                      <Badge
                        key={tag}
                        color="green"
                        className="group/item flex items-center gap-1.5"
                      >
                        <span>{tag}</span>
                        <button
                          type="button"
                          onClick={() => removeTag(tag, "lunch")}
                          className="rounded-full hover:bg-green-600/20 dark:hover:bg-green-500/20"
                          aria-label={`Verwijder ${tag}`}
                        >
                          <XMarkIcon className="size-3.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </Field>

              {/* Dinner */}
              <Field>
                <Label>Diner voorkeuren</Label>
                <Description>
                  Bijvoorbeeld: "kip met groente", "vis", "vegetarisch"
                </Description>
                <Input
                  type="text"
                  value={dinnerInput}
                  onChange={(e) => setDinnerInput(e.target.value)}
                  onKeyDown={handleDinnerKeyDown}
                  placeholder="Typ en druk op Enter om toe te voegen"
                />
                {Array.isArray(mealPreferences.dinner) && mealPreferences.dinner.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {mealPreferences.dinner.map((tag) => (
                      <Badge
                        key={tag}
                        color="purple"
                        className="group/item flex items-center gap-1.5"
                      >
                        <span>{tag}</span>
                        <button
                          type="button"
                          onClick={() => removeTag(tag, "dinner")}
                          className="rounded-full hover:bg-purple-600/20 dark:hover:bg-purple-500/20"
                          aria-label={`Verwijder ${tag}`}
                        >
                          <XMarkIcon className="size-3.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </Field>
            </div>
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
