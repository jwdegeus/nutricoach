"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  getDietCategoryConstraintsAction,
  getIngredientCategoryItemsAction,
  updateDietCategoryConstraintAction,
  deleteDietCategoryConstraintAction,
  migrateLegacyRulesToNewSystemAction,
} from "../actions/ingredient-categories-admin.actions";
import { getDietRulesForAdmin, deleteDietRule, updateDietRule } from "../actions/diet-rules-admin.actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/catalyst/table";
import { Badge } from "@/components/catalyst/badge";
import { Text } from "@/components/catalyst/text";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Field, FieldGroup, Label, Description } from "@/components/catalyst/fieldset";
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from "@/components/catalyst/dialog";
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@/components/catalyst/dropdown";
import {
  EllipsisVerticalIcon,
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";

type GuardRailsOverviewProps = {
  dietTypeId: string;
  dietTypeName: string;
  onEdit?: () => void;
};

type Constraint = {
  id: string;
  category_id: string;
  category_code: string;
  category_name_nl: string;
  category_type: "forbidden" | "required";
  constraint_type: "forbidden" | "required";
  rule_action: "allow" | "block";
  strictness: "hard" | "soft";
  min_per_day: number | null;
  min_per_week: number | null;
  priority: number;
  rule_priority: number;
  is_active: boolean;
  // For legacy diet_rules
  isLegacy?: boolean;
  description?: string;
};

type CategoryItem = {
  id: string;
  term: string;
  term_nl: string | null;
  synonyms: string[];
};

export function GuardRailsOverview({
  dietTypeId,
  dietTypeName,
  onEdit,
}: GuardRailsOverviewProps) {
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [categoryItems, setCategoryItems] = useState<Record<string, CategoryItem[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  
  // Edit dialog state
  const [editingConstraint, setEditingConstraint] = useState<Constraint | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editFormData, setEditFormData] = useState({
    rule_action: "block" as "allow" | "block",
    strictness: "hard" as "hard" | "soft",
    min_per_day: null as number | null,
    min_per_week: null as number | null,
    priority: 50,
    rule_priority: 50,
  });
  
  // Delete dialog state
  const [deletingConstraintId, setDeletingConstraintId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingIsLegacy, setDeletingIsLegacy] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [hasLegacyRules, setHasLegacyRules] = useState(false);

  useEffect(() => {
    loadData();
  }, [dietTypeId]);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const constraintsResult = await getDietCategoryConstraintsAction(dietTypeId);

      if (!constraintsResult.ok) {
        console.error("[GuardRailsOverview] Error loading constraints:", constraintsResult.error);
        setError(constraintsResult.error.message);
        setIsLoading(false);
        return;
      }

      let loadedConstraints = constraintsResult.data || [];
      console.log("[GuardRailsOverview] Loaded constraints:", loadedConstraints.length);
      console.log("[GuardRailsOverview] Diet ID:", dietTypeId);
      
      // Check if there are legacy rules that need migration
      const legacyRulesResult = await getDietRulesForAdmin(dietTypeId);
      const legacyRulesExist =
        legacyRulesResult.data &&
        legacyRulesResult.data.length > 0 &&
        legacyRulesResult.data.some(
          (r) => r.ruleType === "exclude_ingredient" || r.ruleType === "require_ingredient"
        );
      
      setHasLegacyRules(legacyRulesExist || false);
      
      // If we have new constraints, don't show legacy rules
      if (loadedConstraints.length > 0) {
        setHasLegacyRules(false);
      }

      // If no new constraints but legacy rules exist, show migration option
      if (loadedConstraints.length === 0 && legacyRulesExist) {
        console.warn("[GuardRailsOverview] ⚠️ No new constraints found, but legacy rules exist");
        // Don't show legacy rules anymore - user needs to migrate
        setConstraints([]);
        setCategoryItems({});
        setIsLoading(false);
        return;
      }

      // OLD CODE: Convert legacy rules (DISABLED - only show new system)
      if (false && loadedConstraints.length === 0) {
        console.warn("[GuardRailsOverview] ⚠️ No constraints found, checking legacy diet_rules...");
        const legacyRulesResult = await getDietRulesForAdmin(dietTypeId);
        
        if (legacyRulesResult.data && legacyRulesResult.data.length > 0) {
          console.log(`[GuardRailsOverview] Found ${legacyRulesResult.data.length} legacy rules, converting...`);
          
          // Convert legacy diet_rules to constraint format - include ALL rule types
          const convertedConstraints: Constraint[] = legacyRulesResult.data.map((rule) => {
            const ruleValue = rule.ruleValue as any;
            const isForbidden = rule.ruleType === "exclude_ingredient";
            const isRequired = rule.ruleType === "require_ingredient";
            const isMealStructure = rule.ruleType === "meal_structure";
            const isMacroConstraint = rule.ruleType === "macro_constraint";
            
            // Extract category names from rule_value based on rule type
            let categoryName = rule.description || rule.ruleKey || "Legacy Rule";
            
            if (isForbidden && Array.isArray(ruleValue)) {
              categoryName = ruleValue.join(", ");
            } else if (isForbidden && typeof ruleValue === "object" && ruleValue.excluded_categories) {
              categoryName = Array.isArray(ruleValue.excluded_categories)
                ? ruleValue.excluded_categories.join(", ")
                : String(ruleValue.excluded_categories);
            } else if (isRequired && ruleValue?.requiredIngredients) {
              categoryName = Array.isArray(ruleValue.requiredIngredients) 
                ? ruleValue.requiredIngredients.join(", ")
                : String(ruleValue.requiredIngredients);
            } else if (isMealStructure) {
              // For meal_structure rules, show the key requirement
              if (ruleValue?.totalCups) {
                categoryName = `${ruleValue.totalCups} cups groenten/dag (${ruleValue.leafyCups || 0} blad, ${ruleValue.sulfurCups || 0} zwavel, ${ruleValue.coloredCups || 0} gekleurd)`;
              } else {
                categoryName = rule.description || rule.ruleKey;
              }
            } else if (isMacroConstraint) {
              // For macro constraints, show the constraint
              if (ruleValue?.maxSaturatedFatGrams) {
                categoryName = `Max ${ruleValue.maxSaturatedFatGrams}g verzadigd vet/dag`;
              } else if (ruleValue?.minAmountMl && ruleValue?.maxAmountMl) {
                categoryName = `${ruleValue.minAmountMl}-${ruleValue.maxAmountMl}ml/dag`;
              } else {
                categoryName = rule.description || rule.ruleKey;
              }
            }
            
            // Determine constraint type
            let constraintType: "forbidden" | "required" = isForbidden ? "forbidden" : "required";
            if (isMealStructure || isMacroConstraint) {
              // These are requirements, not forbidden
              constraintType = "required";
            }
            
            return {
              id: rule.id,
              category_id: `legacy-${rule.id}`,
              category_code: rule.ruleKey,
              category_name_nl: categoryName,
              category_type: constraintType,
              constraint_type: constraintType,
              rule_action: constraintType === "forbidden" ? "block" : "allow",
              strictness: "hard" as const,
              min_per_day: ruleValue?.frequency === "daily" ? (ruleValue?.minimumAmount || ruleValue?.minAmountMl || 1) : null,
              min_per_week: ruleValue?.frequency === "2x_weekly" || ruleValue?.frequency === "weekly" 
                ? (ruleValue?.minimumAmount || 1) 
                : null,
              priority: rule.priority,
              rule_priority: rule.priority,
              is_active: rule.isActive,
              isLegacy: true,
              description: rule.description || undefined,
            };
          });
          
          loadedConstraints = convertedConstraints;
          console.log(`[GuardRailsOverview] Converted ${convertedConstraints.length} legacy rules to constraints`);
        } else {
          console.warn("[GuardRailsOverview] No legacy rules found either. Use GuardRailsManager to add constraints.");
        }
      } else {
        console.log("[GuardRailsOverview] ✓ Found constraints, will display them");
      }
      
      console.log("[GuardRailsOverview] Final constraints data:", JSON.stringify(loadedConstraints, null, 2));
      setConstraints(loadedConstraints);

      // Load items for each category that has constraints (skip legacy rules)
      const itemsMap: Record<string, CategoryItem[]> = {};
      const categoryIds = new Set(
        loadedConstraints
          .filter((c) => !c.isLegacy && !c.category_id.startsWith("legacy-"))
          .map((c) => c.category_id)
      );
      
      const itemsPromises = Array.from(categoryIds).map(async (categoryId) => {
        try {
          const itemsResult = await getIngredientCategoryItemsAction(categoryId);
          if (itemsResult.ok && itemsResult.data) {
            itemsMap[categoryId] = itemsResult.data.filter((item) => item.is_active);
          }
        } catch (err) {
          console.error(`Error loading items for category ${categoryId}:`, err);
        }
      });

      await Promise.all(itemsPromises);
      setCategoryItems(itemsMap);
    } catch (err) {
      console.error("[GuardRailsOverview] Error loading data:", err);
      setError("Onverwachte fout bij laden data");
    } finally {
      setIsLoading(false);
    }
  }

  function handleEdit(constraint: Constraint) {
    setEditingConstraint(constraint);
    setEditFormData({
      rule_action: constraint.rule_action || (constraint.constraint_type === 'forbidden' ? 'block' : 'allow'),
      strictness: constraint.strictness,
      min_per_day: constraint.min_per_day,
      min_per_week: constraint.min_per_week,
      priority: constraint.priority,
      rule_priority: constraint.rule_priority ?? constraint.priority ?? 50,
    });
    setShowEditDialog(true);
    setError(null);
    setSuccess(null);
  }

  async function handleSave() {
    if (!editingConstraint) return;
    
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        let result;
        if (editingConstraint.isLegacy) {
          // Update legacy rule - only priority can be updated for legacy rules
          result = await updateDietRule(editingConstraint.id, {
            priority: editFormData.priority,
          });
          if ("error" in result) {
            setError(result.error);
            return;
          }
        } else {
          // Update new constraint
          result = await updateDietCategoryConstraintAction(
            editingConstraint.id,
            {
              rule_action: editFormData.rule_action,
              strictness: editFormData.strictness,
              min_per_day: editFormData.min_per_day,
              min_per_week: editFormData.min_per_week,
              priority: editFormData.priority,
              rule_priority: editFormData.rule_priority,
            }
          );
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
        }
        setSuccess("Guard rail succesvol bijgewerkt");
        setShowEditDialog(false);
        setEditingConstraint(null);
        await loadData();
      } catch (err) {
        setError("Onverwachte fout bij opslaan");
      }
    });
  }

  function handleDelete(constraint: Constraint) {
    setDeletingConstraintId(constraint.id);
    setDeletingIsLegacy(constraint.isLegacy || false);
    setShowDeleteDialog(true);
  }

  async function handleDeleteConfirm() {
    if (!deletingConstraintId) return;

    setShowDeleteDialog(false);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        let result;
        if (deletingIsLegacy) {
          // Delete legacy rule
          result = await deleteDietRule(deletingConstraintId);
          if ("error" in result) {
            setError(result.error);
            return;
          }
        } else {
          // Delete new constraint
          result = await deleteDietCategoryConstraintAction(deletingConstraintId);
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
        }
        setSuccess("Guard rail succesvol verwijderd");
        await loadData();
      } catch (err) {
        setError("Onverwachte fout bij verwijderen");
      } finally {
        setDeletingConstraintId(null);
        setDeletingIsLegacy(false);
      }
    });
  }

  async function handleMigrate() {
    setIsMigrating(true);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const result = await migrateLegacyRulesToNewSystemAction(dietTypeId);
        if (!result.ok) {
          setError(result.error.message);
        } else {
          setSuccess(
            `Migratie voltooid: ${result.data.migrated} regels gemigreerd, ${result.data.skipped} overgeslagen`
          );
          // Reload data to show new constraints
          await loadData();
        }
      } catch (err) {
        setError("Onverwachte fout bij migreren");
      } finally {
        setIsMigrating(false);
      }
    });
  }

  function handleToggleActive(constraint: Constraint) {
    if (constraint.isLegacy) {
      // Toggle legacy rule
      startTransition(async () => {
        try {
          const result = await updateDietRule(constraint.id, {
            isActive: !constraint.is_active,
          });
          if ("error" in result) {
            setError(result.error);
          } else {
            setSuccess(`Guard rail ${constraint.is_active ? "gedeactiveerd" : "geactiveerd"}`);
            await loadData();
          }
        } catch (err) {
          setError("Onverwachte fout bij bijwerken");
        }
      });
    } else {
      // Toggle new constraint
      startTransition(async () => {
        try {
          const result = await updateDietCategoryConstraintAction(constraint.id, {
            is_active: !constraint.is_active,
          });
          if (!result.ok) {
            setError(result.error.message);
          } else {
            setSuccess(`Guard rail ${constraint.is_active ? "gedeactiveerd" : "geactiveerd"}`);
            await loadData();
          }
        } catch (err) {
          setError("Onverwachte fout bij bijwerken");
        }
      });
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Text>Guard rails laden...</Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
        <strong>Fout:</strong> {error}
      </div>
    );
  }

  // Get synonyms for each constraint - show ALL constraints (not filtered by is_active)
  console.log(`[GuardRailsOverview] Rendering - Total constraints in state: ${constraints.length}`);
  console.log(`[GuardRailsOverview] Rendering - Constraints:`, constraints);
  
  if (constraints.length === 0) {
    console.warn("[GuardRailsOverview] ⚠️ No constraints to display!");
  }
  
  const constraintsWithSynonyms = constraints.map((constraint) => {
    // Skip loading items for legacy rules
    if (constraint.isLegacy || constraint.category_id.startsWith("legacy-")) {
      return {
        ...constraint,
        rule_action: constraint.rule_action || (constraint.constraint_type === 'forbidden' ? 'block' : 'allow'),
        rule_priority: constraint.rule_priority ?? constraint.priority ?? 50,
        synonyms: [],
        itemsCount: 0,
      };
    }
    
    const items = categoryItems[constraint.category_id] || [];
    const synonyms = items.flatMap((item) => [
      item.term,
      item.term_nl || "",
      ...item.synonyms,
    ]).filter(Boolean);
    
    return {
      ...constraint,
      rule_action: constraint.rule_action || (constraint.constraint_type === 'forbidden' ? 'block' : 'allow'),
      rule_priority: constraint.rule_priority ?? constraint.priority ?? 50,
      synonyms,
      itemsCount: items.length,
    };
  });

  // Sort by rule_priority (firewall evaluatie volgorde - hoog naar laag)
  const sortedConstraints = constraintsWithSynonyms.sort((a, b) => {
    const priorityA = a.rule_priority ?? a.priority ?? 50;
    const priorityB = b.rule_priority ?? b.priority ?? 50;
    return priorityB - priorityA;
  });
  
  console.log(`[GuardRailsOverview] Final sorted constraints to display: ${sortedConstraints.length}`);
  if (sortedConstraints.length > 0) {
    console.log(`[GuardRailsOverview] First constraint to display:`, sortedConstraints[0]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
            Dieetregels Overzicht
          </h2>
          <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Alle dieetregels voor {dietTypeName} ({sortedConstraints.length} regels, gesorteerd op prioriteit)
          </Text>
        </div>
        <div className="flex gap-2">
          {hasLegacyRules && (
            <Button
              onClick={handleMigrate}
              disabled={isMigrating}
              color="amber"
            >
              {isMigrating ? "Migreren..." : "Migreer Legacy Regels"}
            </Button>
          )}
          {onEdit && (
            <Button
              onClick={onEdit}
              color="zinc"
            >
              Guard Rails Beheren
            </Button>
          )}
        </div>
      </div>

      {success && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
          <strong>Succes:</strong> {success}
        </div>
      )}

      <div className="rounded-lg bg-white shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="p-6">
          {sortedConstraints.length === 0 ? (
            <div className="py-8 text-center">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                Geen guard rails geconfigureerd voor dit dieet.
              </Text>
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Categorie</TableHeader>
                  <TableHeader>Rule Actie</TableHeader>
                  <TableHeader>Striktheid</TableHeader>
                  <TableHeader>Rule Prioriteit</TableHeader>
                  <TableHeader>Prioriteit (Legacy)</TableHeader>
                  <TableHeader>Min. per dag/week</TableHeader>
                  <TableHeader className="w-12 text-right">Acties</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedConstraints.map((constraint) => (
                  <TableRow key={constraint.id}>
                    <TableCell>
                      <div>
                        <Text className="font-medium text-zinc-950 dark:text-white">
                          {constraint.category_name_nl}
                        </Text>
                        {constraint.isLegacy && (
                          <Badge color="amber" className="ml-2 text-xs">
                            Legacy
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={constraint.rule_action === "block" ? "red" : "green"}
                      >
                        {constraint.rule_action === "block" ? "Block" : "Allow"}
                      </Badge>
                      {constraint.isLegacy && (
                        <Badge color="amber" className="ml-2 text-xs">
                          Legacy
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge color="zinc">
                        {constraint.strictness === "hard" ? "Hard" : "Soft"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Text className="font-medium">{constraint.rule_priority ?? constraint.priority ?? 50}</Text>
                    </TableCell>
                    <TableCell>
                      <Text className="text-sm text-zinc-500">{constraint.priority}</Text>
                    </TableCell>
                    <TableCell>
                      {constraint.rule_action === "allow" && (
                        <>
                          {constraint.min_per_day ? `${constraint.min_per_day}/dag` : ""}
                          {constraint.min_per_day && constraint.min_per_week ? " | " : ""}
                          {constraint.min_per_week ? `${constraint.min_per_week}/week` : ""}
                          {!constraint.min_per_day && !constraint.min_per_week && "-"}
                        </>
                      )}
                      {constraint.rule_action === "block" && (
                        <Text className="text-zinc-400">-</Text>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <Dropdown>
                          <DropdownButton plain className="p-1">
                            <EllipsisVerticalIcon className="h-5 w-5 text-zinc-500" />
                            <span className="sr-only">Acties</span>
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                          <DropdownSection>
                            <DropdownItem
                              onClick={() => handleEdit(constraint)}
                            >
                              <PencilIcon data-slot="icon" />
                              <span>Bewerken</span>
                            </DropdownItem>
                              <DropdownItem
                                onClick={() => handleToggleActive(constraint)}
                              >
                                {constraint.is_active ? (
                                  <>
                                    <XCircleIcon data-slot="icon" />
                                    <span>Deactiveren</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircleIcon data-slot="icon" />
                                    <span>Activeren</span>
                                  </>
                                )}
                              </DropdownItem>
                              <DropdownItem
                                onClick={() => handleDelete(constraint)}
                                className="text-red-600 dark:text-red-400"
                              >
                                <TrashIcon data-slot="icon" />
                                <span>Verwijderen</span>
                              </DropdownItem>
                            </DropdownSection>
                          </DropdownMenu>
                        </Dropdown>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onClose={() => {
        setShowEditDialog(false);
        setEditingConstraint(null);
        setError(null);
        setSuccess(null);
      }}>
        <DialogTitle>Guard Rail Bewerken</DialogTitle>
        <DialogBody>
          {editingConstraint && (
            <>
              <DialogDescription>
                Bewerk de instellingen voor {editingConstraint.category_name_nl}
              </DialogDescription>
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
                  <strong>Fout:</strong> {error}
                </div>
              )}
              {success && (
                <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
                  <strong>Succes:</strong> {success}
                </div>
              )}
              <FieldGroup>
                {!editingConstraint.isLegacy && (
                  <>
                    <Field>
                      <Label htmlFor="edit-rule-action">Rule Actie</Label>
                      <select
                        id="edit-rule-action"
                        value={editFormData.rule_action}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            rule_action: e.target.value as "allow" | "block",
                          })
                        }
                        className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <option value="allow">Allow (Toestaan)</option>
                        <option value="block">Block (Blokkeren)</option>
                      </select>
                      <Description>
                        Regel actie. Block heeft voorrang over allow bij gelijke prioriteit.
                      </Description>
                    </Field>
                    <Field>
                      <Label htmlFor="edit-strictness">Striktheid</Label>
                      <select
                        id="edit-strictness"
                        value={editFormData.strictness}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            strictness: e.target.value as "hard" | "soft",
                          })
                        }
                        className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <option value="hard">Hard</option>
                        <option value="soft">Soft</option>
                      </select>
                    </Field>
                    {editFormData.rule_action === "allow" && (
                      <>
                        <Field>
                          <Label htmlFor="edit-min-per-day">Min. per dag</Label>
                          <Input
                            id="edit-min-per-day"
                            type="number"
                            min={0}
                            value={editFormData.min_per_day || ""}
                            onChange={(e) =>
                              setEditFormData({
                                ...editFormData,
                                min_per_day: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                            placeholder="0"
                          />
                        </Field>
                        <Field>
                          <Label htmlFor="edit-min-per-week">Min. per week</Label>
                          <Input
                            id="edit-min-per-week"
                            type="number"
                            min={0}
                            value={editFormData.min_per_week || ""}
                            onChange={(e) =>
                              setEditFormData({
                                ...editFormData,
                                min_per_week: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                            placeholder="0"
                          />
                        </Field>
                      </>
                    )}
                  </>
                )}
                {editingConstraint.isLegacy && (
                  <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                    <Text className="font-medium">Legacy Regel</Text>
                    <Text className="mt-1 text-xs">
                      Voor legacy regels kan alleen de prioriteit worden aangepast. 
                      Voor volledige bewerking, migreer de regel naar het nieuwe systeem.
                    </Text>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Field>
                    <Label htmlFor="edit-priority">Prioriteit (Legacy)</Label>
                    <Input
                      id="edit-priority"
                      type="number"
                      min={0}
                      max={100}
                      value={editFormData.priority}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          priority: parseInt(e.target.value) || 50,
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="edit-rule-priority">Rule Prioriteit *</Label>
                    <Input
                      id="edit-rule-priority"
                      type="number"
                      min={0}
                      max={100}
                      value={editFormData.rule_priority}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          rule_priority: parseInt(e.target.value) || 50,
                        })
                      }
                    />
                    <Description>
                      Evaluatie prioriteit (0-100, hoger = belangrijker). Regels worden geëvalueerd in volgorde van prioriteit.
                    </Description>
                  </Field>
                </div>
              </FieldGroup>
            </>
          )}
        </DialogBody>
        <DialogActions>
          <Button
            onClick={() => {
              setShowEditDialog(false);
              setEditingConstraint(null);
              setError(null);
              setSuccess(null);
            }}
            color="zinc"
          >
            Annuleren
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Opslaan..." : "Opslaan"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onClose={() => {
        setShowDeleteDialog(false);
        setDeletingConstraintId(null);
        setDeletingIsLegacy(false);
        setError(null);
        setSuccess(null);
      }}>
        <DialogTitle>Guard Rail Verwijderen</DialogTitle>
        <DialogBody>
          <DialogDescription>
            Weet je zeker dat je deze guard rail wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
          </DialogDescription>
          {error && (
            <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <strong>Fout:</strong> {error}
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button
            onClick={() => {
              setShowDeleteDialog(false);
              setDeletingConstraintId(null);
              setDeletingIsLegacy(false);
              setError(null);
              setSuccess(null);
            }}
            color="zinc"
          >
            Annuleren
          </Button>
          <Button onClick={handleDeleteConfirm} color="red" disabled={isPending}>
            {isPending ? "Verwijderen..." : "Verwijderen"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
