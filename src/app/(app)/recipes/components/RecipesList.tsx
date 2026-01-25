"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
  DropdownDivider,
} from "@/components/catalyst/dropdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import {
  ClockIcon,
  UserGroupIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  TrashIcon,
  CalendarIcon,
  PlusIcon,
  TagIcon,
} from "@heroicons/react/20/solid";
import { logMealConsumptionAction, updateMealDietTypeAction, deleteMealAction } from "../actions/meals.actions";
import { SelectDietTypeDialog } from "./SelectDietTypeDialog";
import { RecipeRatingDialog } from "./RecipeRatingDialog";
import { ConfirmDialog } from "@/components/catalyst/confirm-dialog";
import { StarIcon } from "@heroicons/react/20/solid";
import type { CustomMealRecord } from "@/src/lib/custom-meals/customMeals.service";
import type { MealSlot } from "@/src/lib/diets";
import { getRecipeRatingAction } from "../actions/meals.actions";

type MealItem = (CustomMealRecord & { source: "custom" }) | (any & { source: "gemini" });

type RecipesListProps = {
  meals: MealItem[];
  onConsumptionLogged?: (mealId: string, source: "custom" | "gemini") => void;
  onDietTypeUpdated?: (mealId: string, source: "custom" | "gemini", dietTypeName: string | null) => void;
  onMealDeleted?: (mealId: string, source: "custom" | "gemini") => void;
  onRatingUpdated?: (mealId: string, source: "custom" | "gemini", rating: number | null) => void;
};

export function RecipesList({ meals, onConsumptionLogged, onDietTypeUpdated, onMealDeleted, onRatingUpdated }: RecipesListProps) {
  const router = useRouter();
  const [loggingMealId, setLoggingMealId] = useState<string | null>(null);
  const [dietTypeDialogOpen, setDietTypeDialogOpen] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mealToDelete, setMealToDelete] = useState<MealItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false);
  const [mealToRate, setMealToRate] = useState<MealItem | null>(null);

  const handleLogConsumption = async (meal: MealItem) => {
    // Prevent double submission
    if (loggingMealId) {
      return;
    }

    setLoggingMealId(meal.id);

    try {
      const result = await logMealConsumptionAction({
        customMealId: meal.source === "custom" ? meal.id : undefined,
        mealHistoryId: meal.source === "gemini" ? meal.id : undefined,
        mealName: meal.name || meal.meal_name,
        mealSlot: (meal.mealSlot || meal.meal_slot) as MealSlot,
      });

      if (result.ok) {
        // Update local state optimistically - no page refresh needed
        if (onConsumptionLogged) {
          onConsumptionLogged(meal.id, meal.source);
        }
      } else {
        alert(`Fout: ${result.error.message}`);
      }
    } catch (error) {
      alert(`Fout: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoggingMealId(null);
    }
  };

  const formatMealSlot = (slot: string) => {
    const slotMap: Record<string, string> = {
      breakfast: "Ontbijt",
      lunch: "Lunch",
      dinner: "Diner",
      snack: "Snack",
      smoothie: "Smoothie",
    };
    return slotMap[slot] || slot;
  };

  const formatDietTypeName = (dietKey: string | null | undefined): string | null => {
    if (!dietKey) return null;
    // Replace underscores with spaces and capitalize first letter of each word
    return dietKey
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const handleView = (meal: MealItem) => {
    if (!meal.id || meal.id === "undefined") {
      alert("Recept ID ontbreekt");
      return;
    }
    router.push(`/recipes/${meal.id}?source=${meal.source}`);
  };

  const handleDelete = (meal: MealItem) => {
    setMealToDelete(meal);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!mealToDelete) return;

    setIsDeleting(true);
    try {
      const result = await deleteMealAction({
        mealId: mealToDelete.id,
        source: mealToDelete.source,
      });

      if (result.ok) {
        // Update local state - remove meal from list
        if (onMealDeleted) {
          onMealDeleted(mealToDelete.id, mealToDelete.source);
        }
        setDeleteDialogOpen(false);
        setMealToDelete(null);
      } else {
        alert(`Fout: ${result.error.message}`);
        setDeleteDialogOpen(false);
      }
    } catch (error) {
      alert(`Fout: ${error instanceof Error ? error.message : "Unknown error"}`);
      setDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddToMealPlan = (meal: MealItem) => {
    // TODO: Implement add to meal plan functionality
    console.log("Add to meal plan:", meal.id);
  };

  const handleRateRecipe = (meal: MealItem) => {
    setMealToRate(meal);
    setRatingDialogOpen(true);
  };

  const handleLabelDietType = (meal: MealItem) => {
    setSelectedMeal(meal);
    setDietTypeDialogOpen(true);
  };

  const handleDietTypeSelected = async (dietTypeName: string | null) => {
    if (!selectedMeal) return;

    try {
      const result = await updateMealDietTypeAction({
        mealId: selectedMeal.id,
        source: selectedMeal.source,
        dietTypeName,
      });

      if (result.ok) {
        // Update local state optimistically - no page refresh needed
        if (onDietTypeUpdated) {
          onDietTypeUpdated(selectedMeal.id, selectedMeal.source, dietTypeName);
        }
      } else {
        alert(`Fout: ${result.error.message}`);
      }
    } catch (error) {
      alert(`Fout: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSelectedMeal(null);
    }
  };

  if (meals.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500 dark:text-zinc-400">
          Nog geen recepten. Voeg je eerste recept toe via een foto, screenshot of bestand.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
        <TableHead>
          <TableRow>
            <TableHeader>Naam</TableHeader>
            <TableHeader>Type</TableHeader>
            <TableHeader>Slot</TableHeader>
          <TableHeader>Bereidingstijd</TableHeader>
          <TableHeader>Porties</TableHeader>
          <TableHeader>Gebruikt</TableHeader>
          <TableHeader>Beoordeling</TableHeader>
          <TableHeader className="relative w-0">
            <span className="sr-only">Acties</span>
          </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {meals
            .filter((meal) => meal.id && meal.id !== "undefined")
            .map((meal) => (
              <TableRow key={meal.id} href={`/recipes/${meal.id}?source=${meal.source}`}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{meal.name || meal.meal_name}</span>
                  {formatDietTypeName(meal.dietKey || meal.diet_key) && (
                    <Badge color="green" className="text-xs">
                      {formatDietTypeName(meal.dietKey || meal.diet_key)}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge color={meal.source === "custom" ? "blue" : "zinc"}>
                  {meal.source === "custom" ? "Custom" : "Gemini"}
                </Badge>
              </TableCell>
              <TableCell className="capitalize">
                {formatMealSlot(meal.mealSlot || meal.meal_slot)}
              </TableCell>
              <TableCell>
                {meal.mealData?.prepTime ? (
                  <div className="flex items-center gap-1.5">
                    <ClockIcon className="h-4 w-4 text-zinc-500" />
                    <span>{meal.mealData.prepTime} min</span>
                  </div>
                ) : (
                  <span className="text-zinc-400">-</span>
                )}
              </TableCell>
              <TableCell>
                {meal.mealData?.servings ? (
                  <div className="flex items-center gap-1.5">
                    <UserGroupIcon className="h-4 w-4 text-zinc-500" />
                    <span>{meal.mealData.servings}</span>
                  </div>
                ) : (
                  <span className="text-zinc-400">-</span>
                )}
              </TableCell>
              <TableCell>
                {meal.source === "custom" ? (
                  <div className="flex items-center gap-1.5">
                    <CheckIcon className="h-4 w-4 text-green-600" />
                    <span>{meal.consumptionCount || 0}x</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <CheckIcon className="h-4 w-4 text-green-600" />
                    <span>{meal.usage_count || 0}x</span>
                  </div>
                )}
              </TableCell>
              <TableCell>
                {meal.userRating || meal.user_rating ? (
                  <div className="flex items-center gap-1">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <StarIcon
                          key={star}
                          className={`h-4 w-4 ${
                            star <= (meal.userRating || meal.user_rating || 0)
                              ? "text-yellow-400 fill-yellow-400"
                              : "text-zinc-300 dark:text-zinc-700 fill-zinc-300 dark:fill-zinc-700"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 ml-1">
                      {meal.userRating || meal.user_rating}/5
                    </span>
                  </div>
                ) : (
                  <span className="text-zinc-400 text-sm">-</span>
                )}
              </TableCell>
              <TableCell>
                <Dropdown>
                  <DropdownButton plain>
                    <EllipsisVerticalIcon />
                    <span className="sr-only">Acties</span>
                  </DropdownButton>
                  <DropdownMenu anchor="bottom end">
                    <DropdownSection>
                      <DropdownItem onClick={() => handleView(meal)}>
                        <EyeIcon data-slot="icon" />
                        <span>Bekijken</span>
                      </DropdownItem>
                      <DropdownItem onClick={() => handleLogConsumption(meal)} disabled={!!loggingMealId}>
                        <CalendarIcon data-slot="icon" />
                        <span>{loggingMealId === meal.id ? "Loggen..." : "Log consumptie"}</span>
                      </DropdownItem>
                    </DropdownSection>
                    <DropdownDivider />
                    <DropdownSection>
                      <DropdownItem onClick={() => handleAddToMealPlan(meal)}>
                        <PlusIcon data-slot="icon" />
                        <span>Toevoegen aan receptenplan</span>
                      </DropdownItem>
                    <DropdownItem onClick={() => handleLabelDietType(meal)}>
                      <TagIcon data-slot="icon" />
                      <span>Label met dieettype</span>
                    </DropdownItem>
                    <DropdownItem onClick={() => handleRateRecipe(meal)}>
                      <StarIcon data-slot="icon" />
                      <span>Beoordelen</span>
                    </DropdownItem>
                      <DropdownItem 
                        onClick={() => handleDelete(meal)}
                        className="text-red-600 data-focus:text-white data-focus:bg-red-600 dark:text-red-400"
                      >
                        <TrashIcon data-slot="icon" />
                        <span>Verwijderen</span>
                      </DropdownItem>
                    </DropdownSection>
                  </DropdownMenu>
                </Dropdown>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selectedMeal && (
        <SelectDietTypeDialog
          open={dietTypeDialogOpen}
          onClose={() => {
            setDietTypeDialogOpen(false);
            setSelectedMeal(null);
          }}
          onSelect={handleDietTypeSelected}
          currentDietTypeName={selectedMeal.dietKey || selectedMeal.diet_key || null}
          mealName={selectedMeal.name || selectedMeal.meal_name}
        />
      )}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setMealToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Recept verwijderen"
        description={`Weet je zeker dat je het recept "${mealToDelete?.name || mealToDelete?.meal_name}" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`}
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        confirmColor="red"
        isLoading={isDeleting}
      />
      {mealToRate && (
        <RecipeRatingDialog
          open={ratingDialogOpen}
          onClose={() => {
            setRatingDialogOpen(false);
            setMealToRate(null);
          }}
          mealId={mealToRate.id}
          source={mealToRate.source}
          mealName={mealToRate.name || mealToRate.meal_name}
          onRatingUpdated={(rating) => {
            if (onRatingUpdated) {
              onRatingUpdated(mealToRate.id, mealToRate.source, rating);
            }
          }}
        />
      )}
    </>
  );
}
