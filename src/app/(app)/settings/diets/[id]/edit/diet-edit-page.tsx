"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  updateDietType,
  type DietTypeOutput,
  type DietTypeInput,
} from "../../../actions/diet-admin.actions";
import {
  getDietRulesForAdmin,
  createDietRule,
  updateDietRule,
  deleteDietRule,
  type DietRuleInput,
  type DietRuleOutput,
} from "../../../actions/diet-rules-admin.actions";
import type { DietRuleType } from "@/src/app/(app)/onboarding/types/diet-rules.types";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Field, FieldGroup, Label, Description } from "@/components/catalyst/fieldset";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import { Checkbox, CheckboxField } from "@/components/catalyst/checkbox";
import { Select } from "@/components/catalyst/select";
import { ConfirmDialog } from "@/components/catalyst/confirm-dialog";

type DietEditPageProps = {
  dietType: DietTypeOutput;
};

export function DietEditPage({ dietType: initialDietType }: DietEditPageProps) {
  const router = useRouter();
  const [dietType, setDietType] = useState<DietTypeOutput>(initialDietType);
  const [rules, setRules] = useState<DietRuleOutput[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isCreatingRule, setIsCreatingRule] = useState(false);
  const [activeTab, setActiveTab] = useState<"diet" | "rules">("diet");
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Diet form state
  const [dietFormData, setDietFormData] = useState<DietTypeInput>({
    name: dietType.name,
    description: dietType.description || "",
    displayOrder: dietType.displayOrder,
    isActive: dietType.isActive,
  });

  // Rule form state
  const [ruleFormData, setRuleFormData] = useState<DietRuleInput>({
    dietTypeId: dietType.id,
    ruleType: "exclude_ingredient",
    ruleKey: "",
    ruleValue: {},
    description: "",
    priority: 50,
    isActive: true,
  });

  useEffect(() => {
    loadRules();
  }, [dietType.id]);

  async function loadRules() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getDietRulesForAdmin(dietType.id);
      if ("error" in result) {
        setError(result.error);
      } else if (result.data) {
        setRules(result.data);
      }
    } catch (err) {
      setError("Onverwachte fout bij laden regels");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDietSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!dietFormData.name.trim()) {
      setError("Naam is verplicht");
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateDietType(dietType.id, dietFormData);
        if ("error" in result) {
          setError(result.error);
        } else if (result.data) {
          setSuccess("Dieettype succesvol bijgewerkt");
          setDietType(result.data);
        }
      } catch (err) {
        setError("Onverwachte fout bij opslaan");
      }
    });
  }

  function startEditRule(rule: DietRuleOutput) {
    setRuleFormData({
      dietTypeId: rule.dietTypeId,
      ruleType: rule.ruleType,
      ruleKey: rule.ruleKey,
      ruleValue: rule.ruleValue as DietRuleInput["ruleValue"],
      description: rule.description || "",
      priority: rule.priority,
      isActive: rule.isActive,
    });
    setEditingRuleId(rule.id);
    setIsCreatingRule(false);
    setError(null);
    setSuccess(null);
  }

  function startCreateRule() {
    setRuleFormData({
      dietTypeId: dietType.id,
      ruleType: "exclude_ingredient",
      ruleKey: "",
      ruleValue: {},
      description: "",
      priority: 50,
      isActive: true,
    });
    setEditingRuleId(null);
    setIsCreatingRule(true);
    setError(null);
    setSuccess(null);
  }

  function cancelRuleEdit() {
    setEditingRuleId(null);
    setIsCreatingRule(false);
    setRuleFormData({
      dietTypeId: dietType.id,
      ruleType: "exclude_ingredient",
      ruleKey: "",
      ruleValue: {},
      description: "",
      priority: 50,
      isActive: true,
    });
    setError(null);
    setSuccess(null);
  }

  function updateRuleValue(field: string, value: unknown) {
    setRuleFormData({
      ...ruleFormData,
      ruleValue: {
        ...(ruleFormData.ruleValue as Record<string, unknown>),
        [field]: value,
      },
    });
  }

  async function handleRuleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!ruleFormData.ruleKey.trim()) {
      setError("Regelkey is verplicht");
      return;
    }

    startTransition(async () => {
      try {
        let result;
        if (isCreatingRule) {
          result = await createDietRule(ruleFormData);
        } else if (editingRuleId) {
          result = await updateDietRule(editingRuleId, ruleFormData);
        } else {
          setError("Geen actie geselecteerd");
          return;
        }

        if ("error" in result) {
          setError(result.error);
        } else {
          setSuccess(
            isCreatingRule ? "Regel succesvol aangemaakt" : "Regel succesvol bijgewerkt"
          );
          cancelRuleEdit();
          await loadRules();
        }
      } catch (err) {
        setError("Onverwachte fout bij opslaan");
      }
    });
  }

  function handleDeleteRule(id: string) {
    setDeleteRuleId(id);
    setShowDeleteDialog(true);
  }

  async function handleDeleteRuleConfirm() {
    if (!deleteRuleId) return;

    setShowDeleteDialog(false);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const result = await deleteDietRule(deleteRuleId);
        if ("error" in result) {
          setError(result.error);
        } else {
          setSuccess("Regel succesvol verwijderd");
          await loadRules();
        }
      } catch (err) {
        setError("Onverwachte fout bij verwijderen");
      } finally {
        setDeleteRuleId(null);
      }
    });
  }

  function renderRuleValueEditor() {
    const ruleType = ruleFormData.ruleType;
    const ruleValue = ruleFormData.ruleValue as Record<string, unknown>;

    switch (ruleType) {
      case "exclude_ingredient": {
        const value = ruleValue as {
          excludedCategories?: string[];
          excludedIngredients?: string[];
        };
        return (
          <>
            <Field>
              <Label htmlFor="excludedCategories">Uitgesloten categorieën</Label>
              <Textarea
                id="excludedCategories"
                value={value.excludedCategories?.join(", ") || ""}
                onChange={(e) =>
                  updateRuleValue(
                    "excludedCategories",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                rows={2}
                placeholder="Bijv. grains, dairy, legumes (gescheiden door komma's)"
              />
              <Description>
                Categorieën die uitgesloten moeten worden (gescheiden door komma's)
              </Description>
            </Field>
            <Field>
              <Label htmlFor="excludedIngredients">Uitgesloten ingrediënten</Label>
              <Textarea
                id="excludedIngredients"
                value={value.excludedIngredients?.join(", ") || ""}
                onChange={(e) =>
                  updateRuleValue(
                    "excludedIngredients",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                rows={2}
                placeholder="Bijv. tomato, potato, gluten (gescheiden door komma's)"
              />
              <Description>
                Specifieke ingrediënten die uitgesloten moeten worden
              </Description>
            </Field>
          </>
        );
      }
      case "require_ingredient": {
        const value = ruleValue as {
          requiredIngredients?: string[];
          frequency?: string;
          minAmountMl?: number;
          maxAmountMl?: number;
          recommendedIngredients?: string[];
        };
        return (
          <>
            <Field>
              <Label htmlFor="requiredIngredients">Vereiste ingrediënten</Label>
              <Textarea
                id="requiredIngredients"
                value={value.requiredIngredients?.join(", ") || ""}
                onChange={(e) =>
                  updateRuleValue(
                    "requiredIngredients",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                rows={2}
                placeholder="Bijv. liver, heart, flaxseed_oil (gescheiden door komma's)"
              />
            </Field>
            <Field>
              <Label htmlFor="frequency">Frequentie</Label>
              <Select
                id="frequency"
                value={value.frequency || ""}
                onChange={(e) => updateRuleValue("frequency", e.target.value)}
              >
                <option value="">Geen</option>
                <option value="daily">Dagelijks</option>
                <option value="weekly">Wekelijks</option>
                <option value="2x_weekly">2x per week</option>
                <option value="monthly">Maandelijks</option>
              </Select>
            </Field>
            <Field>
              <Label htmlFor="minAmountMl">Min hoeveelheid (ml)</Label>
              <Input
                id="minAmountMl"
                type="number"
                value={value.minAmountMl || ""}
                onChange={(e) =>
                  updateRuleValue("minAmountMl", e.target.value ? parseFloat(e.target.value) : undefined)
                }
                placeholder="Bijv. 20"
              />
            </Field>
            <Field>
              <Label htmlFor="maxAmountMl">Max hoeveelheid (ml)</Label>
              <Input
                id="maxAmountMl"
                type="number"
                value={value.maxAmountMl || ""}
                onChange={(e) =>
                  updateRuleValue("maxAmountMl", e.target.value ? parseFloat(e.target.value) : undefined)
                }
                placeholder="Bijv. 40"
              />
            </Field>
            <Field>
              <Label htmlFor="recommendedIngredients">Aanbevolen ingrediënten</Label>
              <Textarea
                id="recommendedIngredients"
                value={value.recommendedIngredients?.join(", ") || ""}
                onChange={(e) =>
                  updateRuleValue(
                    "recommendedIngredients",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                rows={2}
                placeholder="Aanbevolen maar niet verplicht (gescheiden door komma's)"
              />
            </Field>
          </>
        );
      }
      case "macro_constraint": {
        const value = ruleValue as {
          maxCarbsPer100g?: number;
          dailyCarbLimit?: number;
          maxSaturatedFatGrams?: number;
          allowedTypes?: string[];
          forbiddenTypes?: string[];
        };
        return (
          <>
            <Field>
              <Label htmlFor="maxCarbsPer100g">Max koolhydraten per 100g</Label>
              <Input
                id="maxCarbsPer100g"
                type="number"
                value={value.maxCarbsPer100g || ""}
                onChange={(e) =>
                  updateRuleValue("maxCarbsPer100g", e.target.value ? parseFloat(e.target.value) : undefined)
                }
              />
            </Field>
            <Field>
              <Label htmlFor="dailyCarbLimit">Dagelijkse koolhydraat limiet (g)</Label>
              <Input
                id="dailyCarbLimit"
                type="number"
                value={value.dailyCarbLimit || ""}
                onChange={(e) =>
                  updateRuleValue("dailyCarbLimit", e.target.value ? parseFloat(e.target.value) : undefined)
                }
              />
            </Field>
            <Field>
              <Label htmlFor="maxSaturatedFatGrams">Max verzadigd vet per dag (g)</Label>
              <Input
                id="maxSaturatedFatGrams"
                type="number"
                value={value.maxSaturatedFatGrams || ""}
                onChange={(e) =>
                  updateRuleValue("maxSaturatedFatGrams", e.target.value ? parseFloat(e.target.value) : undefined)
                }
              />
            </Field>
            <Field>
              <Label htmlFor="allowedTypes">Toegestane types</Label>
              <Textarea
                id="allowedTypes"
                value={value.allowedTypes?.join(", ") || ""}
                onChange={(e) =>
                  updateRuleValue(
                    "allowedTypes",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                rows={2}
                placeholder="Bijv. monosaccharides (gescheiden door komma's)"
              />
            </Field>
            <Field>
              <Label htmlFor="forbiddenTypes">Verboden types</Label>
              <Textarea
                id="forbiddenTypes"
                value={value.forbiddenTypes?.join(", ") || ""}
                onChange={(e) =>
                  updateRuleValue(
                    "forbiddenTypes",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                rows={2}
                placeholder="Bijv. disaccharides, polysaccharides (gescheiden door komma's)"
              />
            </Field>
          </>
        );
      }
      case "meal_structure": {
        const value = ruleValue as {
          vegetableCupsRequirement?: {
            totalCups: number;
            leafyCups: number;
            sulfurCups: number;
            coloredCups: number;
          };
          freshnessRequirement?: {
            maxLeftoverHours: number;
            meatRequirement: string;
          };
        };
        return (
          <>
            {value.vegetableCupsRequirement && (
              <>
                <Field>
                  <Label htmlFor="totalCups">Totaal aantal koppen groente</Label>
                  <Input
                    id="totalCups"
                    type="number"
                    value={value.vegetableCupsRequirement.totalCups || ""}
                    onChange={(e) =>
                      updateRuleValue("vegetableCupsRequirement", {
                        ...value.vegetableCupsRequirement,
                        totalCups: e.target.value ? parseInt(e.target.value) : 0,
                      })
                    }
                  />
                </Field>
                <Field>
                  <Label htmlFor="leafyCups">Bladgroenten koppen</Label>
                  <Input
                    id="leafyCups"
                    type="number"
                    value={value.vegetableCupsRequirement.leafyCups || ""}
                    onChange={(e) =>
                      updateRuleValue("vegetableCupsRequirement", {
                        ...value.vegetableCupsRequirement,
                        leafyCups: e.target.value ? parseInt(e.target.value) : 0,
                      })
                    }
                  />
                </Field>
                <Field>
                  <Label htmlFor="sulfurCups">Zwavelrijke groenten koppen</Label>
                  <Input
                    id="sulfurCups"
                    type="number"
                    value={value.vegetableCupsRequirement.sulfurCups || ""}
                    onChange={(e) =>
                      updateRuleValue("vegetableCupsRequirement", {
                        ...value.vegetableCupsRequirement,
                        sulfurCups: e.target.value ? parseInt(e.target.value) : 0,
                      })
                    }
                  />
                </Field>
                <Field>
                  <Label htmlFor="coloredCups">Gekleurde groenten koppen</Label>
                  <Input
                    id="coloredCups"
                    type="number"
                    value={value.vegetableCupsRequirement.coloredCups || ""}
                    onChange={(e) =>
                      updateRuleValue("vegetableCupsRequirement", {
                        ...value.vegetableCupsRequirement,
                        coloredCups: e.target.value ? parseInt(e.target.value) : 0,
                      })
                    }
                  />
                </Field>
              </>
            )}
            {value.freshnessRequirement && (
              <>
                <Field>
                  <Label htmlFor="maxLeftoverHours">Max restjes uren</Label>
                  <Input
                    id="maxLeftoverHours"
                    type="number"
                    value={value.freshnessRequirement.maxLeftoverHours || ""}
                    onChange={(e) =>
                      updateRuleValue("freshnessRequirement", {
                        ...value.freshnessRequirement,
                        maxLeftoverHours: e.target.value ? parseInt(e.target.value) : 0,
                      })
                    }
                  />
                </Field>
                <Field>
                  <Label htmlFor="meatRequirement">Vlees vereiste</Label>
                  <Select
                    id="meatRequirement"
                    value={value.freshnessRequirement.meatRequirement || ""}
                    onChange={(e) =>
                      updateRuleValue("freshnessRequirement", {
                        ...value.freshnessRequirement,
                        meatRequirement: e.target.value,
                      })
                    }
                  >
                    <option value="any">Elk</option>
                    <option value="fresh_or_flash_frozen">Vers of diepvries</option>
                  </Select>
                </Field>
              </>
            )}
          </>
        );
      }
      default:
        return (
          <Field>
            <Label>Regelwaarde (JSON)</Label>
            <Textarea
              value={JSON.stringify(ruleValue, null, 2)}
              onChange={(e) => {
                try {
                  updateRuleValue("", JSON.parse(e.target.value));
                } catch {
                  // Invalid JSON, ignore
                }
              }}
              rows={6}
            />
            <Description>Voer JSON in voor complexe regelwaarden</Description>
          </Field>
        );
    }
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeleteRuleId(null);
        }}
        onConfirm={handleDeleteRuleConfirm}
        title="Regel verwijderen"
        description="Weet je zeker dat je deze regel wilt verwijderen?"
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        confirmColor="red"
        isLoading={isPending}
      />
      <div className="flex items-center justify-between">
        <div>
          <Button onClick={() => router.push("/settings")} color="zinc">
            ← Terug naar instellingen
          </Button>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            {dietType.name} bewerken
          </h1>
          <Text className="mt-2 text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
            Bewerk dieettype instellingen en regels
          </Text>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <strong>Fout:</strong> {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
          <strong>Succes:</strong> {success}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("diet")}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === "diet"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            Dieettype
          </button>
          <button
            onClick={() => setActiveTab("rules")}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === "rules"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            Regels ({rules.length})
          </button>
        </nav>
      </div>

      {/* Diet Tab */}
      {activeTab === "diet" && (
        <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <form onSubmit={handleDietSubmit} className="space-y-4">
            <FieldGroup>
              <Field>
                <Label htmlFor="name">Naam *</Label>
                <Input
                  id="name"
                  value={dietFormData.name}
                  onChange={(e) =>
                    setDietFormData({ ...dietFormData, name: e.target.value })
                  }
                  required
                  placeholder="Bijv. Keto, Vegetarisch, etc."
                />
              </Field>

              <Field>
                <Label htmlFor="description">Beschrijving</Label>
                <Textarea
                  id="description"
                  value={dietFormData.description}
                  onChange={(e) =>
                    setDietFormData({ ...dietFormData, description: e.target.value })
                  }
                  rows={3}
                  placeholder="Beschrijving van het dieettype"
                />
              </Field>

              <Field>
                <Label htmlFor="displayOrder">Weergave volgorde</Label>
                <Input
                  id="displayOrder"
                  type="number"
                  value={dietFormData.displayOrder}
                  onChange={(e) =>
                    setDietFormData({
                      ...dietFormData,
                      displayOrder: parseInt(e.target.value) || 0,
                    })
                  }
                  min={0}
                />
                <Description>
                  Lagere nummers verschijnen eerst in de lijst
                </Description>
              </Field>

              <CheckboxField>
                <Checkbox
                  checked={dietFormData.isActive}
                  onChange={(value) =>
                    setDietFormData({ ...dietFormData, isActive: value })
                  }
                />
                <Label>Actief</Label>
                <Description>
                  Alleen actieve dieettypes zijn zichtbaar voor gebruikers
                </Description>
              </CheckboxField>

              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Opslaan..." : "Bijwerken"}
                </Button>
                <Button type="button" onClick={() => router.push("/settings")} color="zinc">
                  Annuleren
                </Button>
              </div>
            </FieldGroup>
          </form>
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === "rules" && (
        <div className="space-y-6">
          {!isCreatingRule && !editingRuleId && (
            <div className="flex justify-end">
              <Button onClick={startCreateRule}>Nieuwe regel</Button>
            </div>
          )}

          {(isCreatingRule || editingRuleId) && (
            <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
              <form onSubmit={handleRuleSubmit} className="space-y-4">
                <FieldGroup>
                  <Field>
                    <Label htmlFor="ruleType">Regeltype *</Label>
                    <Select
                      id="ruleType"
                      value={ruleFormData.ruleType}
                      onChange={(e) =>
                        setRuleFormData({
                          ...ruleFormData,
                          ruleType: e.target.value as DietRuleType,
                          ruleValue: {},
                        })
                      }
                      required
                    >
                      <option value="exclude_ingredient">Uitsluiten ingrediënt</option>
                      <option value="require_ingredient">Vereisen ingrediënt</option>
                      <option value="macro_constraint">Macro constraint</option>
                      <option value="meal_structure">Maaltijd structuur</option>
                    </Select>
                  </Field>

                  <Field>
                    <Label htmlFor="ruleKey">Regelkey *</Label>
                    <Input
                      id="ruleKey"
                      value={ruleFormData.ruleKey}
                      onChange={(e) =>
                        setRuleFormData({ ...ruleFormData, ruleKey: e.target.value })
                      }
                      required
                      placeholder="Bijv. excluded_categories, daily_flaxseed_oil"
                    />
                    <Description>
                      Unieke identifier voor deze regel binnen dit dieettype
                    </Description>
                  </Field>

                  <Field>
                    <Label htmlFor="description">Beschrijving</Label>
                    <Textarea
                      id="description"
                      value={ruleFormData.description || ""}
                      onChange={(e) =>
                        setRuleFormData({ ...ruleFormData, description: e.target.value })
                      }
                      rows={2}
                      placeholder="Human-readable beschrijving van de regel"
                    />
                  </Field>

                  <Field>
                    <Label htmlFor="priority">Prioriteit</Label>
                    <Input
                      id="priority"
                      type="number"
                      value={ruleFormData.priority}
                      onChange={(e) =>
                        setRuleFormData({
                          ...ruleFormData,
                          priority: parseInt(e.target.value) || 0,
                        })
                      }
                      min={0}
                      max={100}
                    />
                    <Description>
                      Hogere prioriteit = belangrijker (0-100, guard rails zijn meestal 90+)
                    </Description>
                  </Field>

                  {renderRuleValueEditor()}

                  <CheckboxField>
                    <Checkbox
                      checked={ruleFormData.isActive ?? true}
                      onChange={(value) =>
                        setRuleFormData({ ...ruleFormData, isActive: value })
                      }
                    />
                    <Label>Actief</Label>
                  </CheckboxField>

                  <div className="flex gap-2">
                    <Button type="submit" disabled={isPending}>
                      {isPending
                        ? "Opslaan..."
                        : isCreatingRule
                        ? "Aanmaken"
                        : "Bijwerken"}
                    </Button>
                    <Button type="button" onClick={cancelRuleEdit} color="zinc">
                      Annuleren
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            </div>
          )}

          {isLoading ? (
            <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
              <Text>Regels laden...</Text>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.length === 0 ? (
                <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
                  <Text className="text-zinc-500 dark:text-zinc-400">
                    Geen regels gevonden. Klik op "Nieuwe regel" om er een toe te voegen.
                  </Text>
                </div>
              ) : (
                rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-start justify-between rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Text className="font-medium text-zinc-950 dark:text-white">
                          {rule.ruleType} / {rule.ruleKey}
                        </Text>
                        {!rule.isActive && (
                          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            Inactief
                          </span>
                        )}
                        {rule.priority >= 90 && (
                          <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 dark:bg-red-950/50 dark:text-red-400">
                            Guard Rail
                          </span>
                        )}
                      </div>
                      {rule.description && (
                        <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                          {rule.description}
                        </Text>
                      )}
                      <Text className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        Prioriteit: {rule.priority}
                      </Text>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-zinc-500 dark:text-zinc-400">
                          Regelwaarde bekijken
                        </summary>
                        <pre className="mt-2 overflow-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
                          {JSON.stringify(rule.ruleValue, null, 2)}
                        </pre>
                      </details>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => startEditRule(rule)}
                        color="zinc"
                        disabled={editingRuleId === rule.id || isCreatingRule}
                      >
                        Bewerken
                      </Button>
                      <Button
                        onClick={() => handleDeleteRule(rule.id)}
                        color="red"
                        disabled={isPending}
                      >
                        Verwijderen
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
