"use client";

import { useState, useTransition, useEffect } from "react";
import {
  getRecipeAdaptationRulesForAdmin,
  createRecipeAdaptationRule,
  updateRecipeAdaptationRule,
  deleteRecipeAdaptationRule,
  type RecipeAdaptationRuleInput,
  type RecipeAdaptationRuleOutput,
} from "../actions/recipe-adaptation-rules-admin.actions";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Field, FieldGroup, Label, Description } from "@/components/catalyst/fieldset";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import { Checkbox, CheckboxField } from "@/components/catalyst/checkbox";
import { ConfirmDialog } from "@/components/catalyst/confirm-dialog";
import { Badge } from "@/components/catalyst/badge";
import { PencilIcon, TrashIcon, PlusIcon } from "@heroicons/react/16/solid";

type RecipeAdaptationRulesManagerProps = {
  dietTypeId: string;
  dietTypeName: string;
};

export function RecipeAdaptationRulesManager({
  dietTypeId,
  dietTypeName,
}: RecipeAdaptationRulesManagerProps) {
  const [rules, setRules] = useState<RecipeAdaptationRuleOutput[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [formData, setFormData] = useState<RecipeAdaptationRuleInput>({
    dietTypeId,
    term: "",
    synonyms: [],
    ruleCode: "",
    ruleLabel: "",
    substitutionSuggestions: [],
    priority: 50,
    isActive: true,
  });

  const [synonymsText, setSynonymsText] = useState("");
  const [substitutionsText, setSubstitutionsText] = useState("");

  useEffect(() => {
    if (expanded) {
      loadRules();
    }
  }, [expanded, dietTypeId]);

  async function loadRules() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getRecipeAdaptationRulesForAdmin(dietTypeId);
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

  function startEdit(rule: RecipeAdaptationRuleOutput) {
    setFormData({
      dietTypeId: rule.dietTypeId,
      term: rule.term,
      synonyms: rule.synonyms,
      ruleCode: rule.ruleCode,
      ruleLabel: rule.ruleLabel,
      substitutionSuggestions: rule.substitutionSuggestions,
      priority: rule.priority,
      isActive: rule.isActive,
    });
    setSynonymsText(rule.synonyms.join(", "));
    setSubstitutionsText(rule.substitutionSuggestions.join(", "));
    setEditingId(rule.id);
    setIsCreating(false);
    setError(null);
    setSuccess(null);
  }

  function startCreate() {
    setFormData({
      dietTypeId,
      term: "",
      synonyms: [],
      ruleCode: "",
      ruleLabel: "",
      substitutionSuggestions: [],
      priority: 50,
      isActive: true,
    });
    setSynonymsText("");
    setSubstitutionsText("");
    setEditingId(null);
    setIsCreating(true);
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setIsCreating(false);
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Parse synonyms and substitutions from text
    const synonyms = synonymsText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const substitutions = substitutionsText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const submitData: RecipeAdaptationRuleInput = {
      ...formData,
      synonyms,
      substitutionSuggestions: substitutions,
    };

    startTransition(async () => {
      try {
        let result;
        if (editingId) {
          result = await updateRecipeAdaptationRule(editingId, submitData);
        } else {
          result = await createRecipeAdaptationRule(submitData);
        }

        if ("error" in result) {
          setError(result.error);
        } else {
          setSuccess(
            editingId
              ? "Recipe adaptation rule bijgewerkt"
              : "Recipe adaptation rule aangemaakt"
          );
          await loadRules();
          cancelEdit();
        }
      } catch (err) {
        setError("Onverwachte fout bij opslaan");
      }
    });
  }

  async function handleDelete() {
    if (!deleteRuleId) return;

    startTransition(async () => {
      try {
        const result = await deleteRecipeAdaptationRule(deleteRuleId);
        if ("error" in result) {
          setError(result.error);
        } else {
          setSuccess("Recipe adaptation rule verwijderd");
          await loadRules();
        }
        setShowDeleteDialog(false);
        setDeleteRuleId(null);
      } catch (err) {
        setError("Onverwachte fout bij verwijderen");
      }
    });
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">
            Recipe Adaptation Rules
          </h3>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            Regels voor de AI Magician tool voor {dietTypeName}
          </Text>
        </div>
        <div className="flex gap-2">
          {!expanded && (
            <Button onClick={() => setExpanded(true)}>Bekijken</Button>
          )}
          {expanded && !isCreating && !editingId && (
            <Button onClick={startCreate}>
              <PlusIcon />
              Nieuwe regel
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-200">
              {success}
            </div>
          )}

          {(isCreating || editingId) && (
            <form onSubmit={handleSubmit} className="mb-6 space-y-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
              <FieldGroup>
                <Field>
                  <Label htmlFor="term">Term *</Label>
                  <Input
                    id="term"
                    value={formData.term}
                    onChange={(e) =>
                      setFormData({ ...formData, term: e.target.value })
                    }
                    required
                    placeholder="Bijv. pasta, melk, suiker"
                  />
                  <Description>
                    Het verboden ingrediënt (wordt automatisch lowercase opgeslagen)
                  </Description>
                </Field>

                <Field>
                  <Label htmlFor="synonyms">Synoniemen</Label>
                  <Textarea
                    id="synonyms"
                    value={synonymsText}
                    onChange={(e) => setSynonymsText(e.target.value)}
                    rows={2}
                    placeholder="spaghetti, penne, orzo (gescheiden door komma's)"
                  />
                  <Description>
                    Synoniemen voor deze term (gescheiden door komma's)
                  </Description>
                </Field>

                <Field>
                  <Label htmlFor="ruleCode">Rule Code *</Label>
                  <Input
                    id="ruleCode"
                    value={formData.ruleCode}
                    onChange={(e) =>
                      setFormData({ ...formData, ruleCode: e.target.value })
                    }
                    required
                    placeholder="Bijv. GLUTEN_FREE, LACTOSE_FREE"
                  />
                </Field>

                <Field>
                  <Label htmlFor="ruleLabel">Rule Label *</Label>
                  <Input
                    id="ruleLabel"
                    value={formData.ruleLabel}
                    onChange={(e) =>
                      setFormData({ ...formData, ruleLabel: e.target.value })
                    }
                    required
                    placeholder="Bijv. Glutenvrij dieet, Lactose-intolerantie"
                  />
                </Field>

                <Field>
                  <Label htmlFor="substitutionSuggestions">Substitutie Suggesties</Label>
                  <Textarea
                    id="substitutionSuggestions"
                    value={substitutionsText}
                    onChange={(e) => setSubstitutionsText(e.target.value)}
                    rows={2}
                    placeholder="rijstnoedels, zucchininoedels (gescheiden door komma's)"
                  />
                  <Description>
                    Suggesties voor vervanging (gescheiden door komma's)
                  </Description>
                </Field>

                <Field>
                  <Label htmlFor="priority">Prioriteit</Label>
                  <Input
                    id="priority"
                    type="number"
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        priority: parseInt(e.target.value) || 50,
                      })
                    }
                    min={0}
                    max={100}
                  />
                  <Description>
                    Hogere prioriteit = belangrijker (0-100)
                  </Description>
                </Field>

                <CheckboxField>
                  <Checkbox
                    checked={formData.isActive}
                    onChange={(checked) =>
                      setFormData({ ...formData, isActive: checked })
                    }
                  />
                  <Label>Actief</Label>
                </CheckboxField>
              </FieldGroup>

              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>
                  {editingId ? "Bijwerken" : "Aanmaken"}
                </Button>
                <Button type="button" plain onClick={cancelEdit}>
                  Annuleren
                </Button>
              </div>
            </form>
          )}

          {isLoading ? (
            <Text className="text-sm text-zinc-500">Laden...</Text>
          ) : rules.length === 0 ? (
            <Text className="text-sm text-zinc-500">
              Geen recipe adaptation rules gevonden. Maak er een aan om te beginnen.
            </Text>
          ) : (
            <div className="space-y-4">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Text className="font-semibold text-zinc-950 dark:text-white">
                          {rule.term}
                        </Text>
                        <Badge color={rule.isActive ? "green" : "zinc"}>
                          {rule.isActive ? "Actief" : "Inactief"}
                        </Badge>
                        <Badge>{rule.ruleCode}</Badge>
                      </div>
                      <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                        {rule.ruleLabel}
                      </Text>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        plain
                        onClick={() => startEdit(rule)}
                        disabled={isCreating || editingId !== null}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        plain
                        onClick={() => {
                          setDeleteRuleId(rule.id);
                          setShowDeleteDialog(true);
                        }}
                        disabled={isCreating || editingId !== null}
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  </div>

                  {rule.synonyms.length > 0 && (
                    <div className="mb-2">
                      <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                        Synoniemen:
                      </Text>
                      <Text className="text-sm text-zinc-700 dark:text-zinc-300">
                        {rule.synonyms.join(", ")}
                      </Text>
                    </div>
                  )}

                  {rule.substitutionSuggestions.length > 0 && (
                    <div>
                      <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                        Substitutie suggesties:
                      </Text>
                      <Text className="text-sm text-zinc-700 dark:text-zinc-300">
                        {rule.substitutionSuggestions.join(", ")}
                      </Text>
                    </div>
                  )}

                  <Text className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Prioriteit: {rule.priority}
                  </Text>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeleteRuleId(null);
        }}
        onConfirm={handleDelete}
        title="Recipe adaptation rule verwijderen"
        message="Weet je zeker dat je deze regel wilt verwijderen? Dit kan niet ongedaan worden gemaakt."
        confirmText="Verwijderen"
        cancelText="Annuleren"
      />
    </div>
  );
}
