"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Recipe thumbnail component with placeholder
function RecipeThumbnail({ imageUrl, alt }: { imageUrl: string | null; alt: string }) {
  const [imageError, setImageError] = useState(false);

  if (!imageUrl || imageError) {
    return (
      <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center ring-1 ring-zinc-950/5 dark:ring-white/10">
        <PhotoIcon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className="h-10 w-10 rounded-full object-cover ring-1 ring-zinc-950/5 dark:ring-white/10"
      onError={() => setImageError(true)}
    />
  );
}
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
  Pagination,
  PaginationGap,
  PaginationList,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
} from "@/components/catalyst/pagination";
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
  PhotoIcon,
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
  totalItems?: number;
  currentPage?: number;
  totalPages?: number;
  itemsPerPage?: number;
  onPageChange?: (page: number) => void;
  onConsumptionLogged?: (mealId: string, source: "custom" | "gemini") => void;
  onDietTypeUpdated?: (mealId: string, source: "custom" | "gemini", dietTypeName: string | null) => void;
  onMealDeleted?: (mealId: string, source: "custom" | "gemini") => void;
  onRatingUpdated?: (mealId: string, source: "custom" | "gemini", rating: number | null) => void;
};

// Helper function to generate pagination page numbers
function generatePaginationPages(currentPage: number, totalPages: number): (number | 'gap')[] {
  const pages: (number | 'gap')[] = [];
  const maxVisiblePages = 7; // Show up to 7 page numbers
  
  if (totalPages <= maxVisiblePages) {
    // Show all pages if total is less than max
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);
    
    if (currentPage <= 4) {
      // Near the beginning: show 1, 2, 3, 4, 5, gap, last
      for (let i = 2; i <= 5; i++) {
        pages.push(i);
      }
      pages.push('gap');
      pages.push(totalPages);
    } else if (currentPage >= totalPages - 3) {
      // Near the end: show 1, gap, last-4, last-3, last-2, last-1, last
      pages.push('gap');
      for (let i = totalPages - 4; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // In the middle: show 1, gap, current-1, current, current+1, gap, last
      pages.push('gap');
      pages.push(currentPage - 1);
      pages.push(currentPage);
      pages.push(currentPage + 1);
      pages.push('gap');
      pages.push(totalPages);
    }
  }
  
  return pages;
}

export function RecipesList({ 
  meals, 
  totalItems,
  currentPage = 1,
  totalPages = 1,
  itemsPerPage = 15,
  onPageChange,
  onConsumptionLogged, 
  onDietTypeUpdated, 
  onMealDeleted, 
  onRatingUpdated 
}: RecipesListProps) {
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

  // Filter out invalid meals
  const validMeals = meals.filter((meal) => meal.id && meal.id !== "undefined");
  
  // Check if there are no meals at all (not just on this page)
  const hasNoMeals = (totalItems !== undefined && totalItems === 0) || (totalItems === undefined && validMeals.length === 0);
  
  if (hasNoMeals) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500 dark:text-zinc-400">
          Nog geen recepten. Voeg je eerste recept toe via een foto, screenshot of bestand.
        </p>
      </div>
    );
  }

  // If we have meals but none are valid after filtering, show empty state
  if (validMeals.length === 0 && meals.length > 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500 dark:text-zinc-400">
          Geen geldige recepten gevonden.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto -mx-6 sm:-mx-4 lg:-mx-10">
        <div className="inline-block min-w-full px-6 sm:px-4 lg:px-10">
          <Table className="[--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]">
            <TableHead>
              <TableRow>
                <TableHeader className="w-0"></TableHeader>
                <TableHeader>Naam</TableHeader>
                <TableHeader className="whitespace-nowrap">Type</TableHeader>
                <TableHeader className="whitespace-nowrap">Slot</TableHeader>
                <TableHeader className="whitespace-nowrap">Bereidingstijd</TableHeader>
                <TableHeader className="whitespace-nowrap">Porties</TableHeader>
                <TableHeader className="whitespace-nowrap">Gebruikt</TableHeader>
                <TableHeader className="whitespace-nowrap">Beoordeling</TableHeader>
                <TableHeader className="relative w-0">
                  <span className="sr-only">Acties</span>
                </TableHeader>
              </TableRow>
            </TableHead>
        <TableBody>
          {validMeals.map((meal) => {
            const imageUrl = meal.sourceImageUrl || meal.source_image_url || null;
            return (
              <TableRow key={meal.id} href={`/recipes/${meal.id}?source=${meal.source}`}>
              <TableCell>
                <RecipeThumbnail imageUrl={imageUrl} alt={meal.name || meal.meal_name || "Recept"} />
              </TableCell>
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
              <TableCell className="capitalize whitespace-nowrap text-sm">
                {formatMealSlot(meal.mealSlot || meal.meal_slot)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {meal.mealData?.prepTime ? (
                  <div className="flex items-center gap-1">
                    <ClockIcon className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="text-sm">{meal.mealData.prepTime} min</span>
                  </div>
                ) : (
                  <span className="text-zinc-400 text-sm">-</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {meal.mealData?.servings ? (
                  <div className="flex items-center gap-1">
                    <UserGroupIcon className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="text-sm">{meal.mealData.servings}</span>
                  </div>
                ) : (
                  <span className="text-zinc-400 text-sm">-</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {meal.source === "custom" ? (
                  <div className="flex items-center gap-1">
                    <CheckIcon className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-sm">{meal.consumptionCount || 0}x</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <CheckIcon className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-sm">{meal.usage_count || 0}x</span>
                  </div>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {meal.userRating || meal.user_rating ? (
                  <div className="flex items-center gap-0.5">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <StarIcon
                          key={star}
                          className={`h-3.5 w-3.5 ${
                            star <= (meal.userRating || meal.user_rating || 0)
                              ? "text-yellow-400 fill-yellow-400"
                              : "text-zinc-300 dark:text-zinc-700 fill-zinc-300 dark:fill-zinc-700"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 ml-0.5">
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
          );
          })}
        </TableBody>
          </Table>
        </div>
      </div>
      
      {/* Pagination */}
      {totalItems !== undefined && totalPages > 1 && (
        <div className="mt-6 flex justify-center">
          <Pagination aria-label="Recepten paginering">
            <PaginationPrevious 
              href={currentPage > 1 ? undefined : null}
              onClick={(e) => {
                e.preventDefault();
                if (currentPage > 1 && onPageChange) {
                  onPageChange(currentPage - 1);
                }
              }}
            >
              Vorige
            </PaginationPrevious>
            <PaginationList>
              {generatePaginationPages(currentPage, totalPages).map((page, index) => {
                if (page === 'gap') {
                  return <PaginationGap key={`gap-${index}`} />;
                }
                return (
                  <PaginationPage
                    key={page}
                    current={page === currentPage}
                    onClick={(e) => {
                      e.preventDefault();
                      if (onPageChange && page !== currentPage) {
                        onPageChange(page);
                      }
                    }}
                  >
                    {page}
                  </PaginationPage>
                );
              })}
            </PaginationList>
            <PaginationNext
              href={currentPage < totalPages ? undefined : null}
              onClick={(e) => {
                e.preventDefault();
                if (currentPage < totalPages && onPageChange) {
                  onPageChange(currentPage + 1);
                }
              }}
            >
              Volgende
            </PaginationNext>
          </Pagination>
        </div>
      )}
      
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
