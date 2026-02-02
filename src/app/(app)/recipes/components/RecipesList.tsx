'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Recipe thumbnail component with placeholder
function RecipeThumbnail({
  imageUrl,
  alt,
}: {
  imageUrl: string | null;
  alt: string;
}) {
  const [imageError, setImageError] = useState(false);

  if (!imageUrl || imageError) {
    return (
      <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center ring-1 ring-zinc-950/5 dark:ring-white/10">
        <PhotoIcon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
      </div>
    );
  }

  return (
    <span className="relative block h-10 w-10 rounded-full overflow-hidden ring-1 ring-zinc-950/5 dark:ring-white/10">
      <Image
        src={imageUrl}
        alt={alt}
        fill
        className="object-cover"
        sizes="40px"
        unoptimized
        onError={() => setImageError(true)}
      />
    </span>
  );
}
import { Badge } from '@/components/catalyst/badge';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
  DropdownDivider,
} from '@/components/catalyst/dropdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table';
import {
  Pagination,
  PaginationGap,
  PaginationList,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
} from '@/components/catalyst/pagination';
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
} from '@heroicons/react/20/solid';
import {
  logMealConsumptionAction,
  updateMealDietTypeAction,
  deleteMealAction,
} from '../actions/meals.actions';
import { SelectDietTypeDialog } from './SelectDietTypeDialog';
import { RecipeRatingDialog } from './RecipeRatingDialog';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import { StarIcon } from '@heroicons/react/20/solid';
import type { CustomMealRecord } from '@/src/lib/custom-meals/customMeals.service';
import type { MealSlot } from '@/src/lib/diets';
import type { RecipeComplianceResult } from '../actions/recipe-compliance.actions';

export type MealItem =
  | (CustomMealRecord & { source: 'custom' })
  | (Record<string, unknown> & { source: 'gemini' });

type RecipesListProps = {
  meals: MealItem[];
  totalItems?: number;
  currentPage?: number;
  totalPages?: number;
  itemsPerPage?: number;
  /** Compliance scores per meal id (0–100% volgens dieetregels) */
  complianceScores?: Record<string, RecipeComplianceResult>;
  /** True while compliance scores for the current page are being fetched */
  complianceLoading?: boolean;
  onPageChange?: (page: number) => void;
  onConsumptionLogged?: (mealId: string, source: 'custom' | 'gemini') => void;
  onDietTypeUpdated?: (
    mealId: string,
    source: 'custom' | 'gemini',
    dietTypeName: string | null,
  ) => void;
  onMealDeleted?: (mealId: string, source: 'custom' | 'gemini') => void;
  onRatingUpdated?: (
    mealId: string,
    source: 'custom' | 'gemini',
    rating: number | null,
  ) => void;
};

// Helper function to generate pagination page numbers
function generatePaginationPages(
  currentPage: number,
  totalPages: number,
): (number | 'gap')[] {
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

function ComplianceScoreBadge({ score }: { score: RecipeComplianceResult }) {
  if (score.noRulesConfigured) {
    return (
      <Badge
        color="zinc"
        className="text-xs"
        title="Geen dieetregels geconfigureerd voor dit dieet"
      >
        N.v.t.
      </Badge>
    );
  }
  const p = score.scorePercent;
  const color = p >= 80 ? 'green' : p >= 50 ? 'amber' : p >= 20 ? 'red' : 'red';
  return (
    <Badge
      color={color}
      className="font-mono text-xs"
      title={
        score.ok ? 'Voldoet aan dieetregels' : 'Schendt één of meer dieetregels'
      }
    >
      {p}%
    </Badge>
  );
}

export function RecipesList({
  meals,
  totalItems,
  currentPage = 1,
  totalPages = 1,
  itemsPerPage: _itemsPerPage = 15,
  complianceScores = {},
  complianceLoading = false,
  onPageChange,
  onConsumptionLogged,
  onDietTypeUpdated,
  onMealDeleted,
  onRatingUpdated,
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

    const mealIdStr = String(meal.id);
    setLoggingMealId(mealIdStr);

    const mealR = meal as Record<string, unknown>;
    try {
      const result = await logMealConsumptionAction({
        customMealId: meal.source === 'custom' ? mealIdStr : undefined,
        mealHistoryId: meal.source === 'gemini' ? mealIdStr : undefined,
        mealName: String(mealR.name ?? mealR.meal_name ?? mealR.mealName ?? ''),
        mealSlot: (mealR.mealSlot ?? mealR.meal_slot ?? '') as MealSlot,
      });

      if (result.ok) {
        // Update local state optimistically - no page refresh needed
        if (onConsumptionLogged) {
          onConsumptionLogged(mealIdStr, meal.source);
        }
      } else {
        alert(`Fout: ${result.error.message}`);
      }
    } catch (error) {
      alert(
        `Fout: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setLoggingMealId(null);
    }
  };

  const formatMealSlot = (slot: string) => {
    const slotMap: Record<string, string> = {
      breakfast: 'Ontbijt',
      lunch: 'Lunch',
      dinner: 'Diner',
      snack: 'Snack',
      smoothie: 'Smoothie',
    };
    return slotMap[slot] || slot;
  };

  const formatDietTypeName = (
    dietKey: string | null | undefined,
  ): string | null => {
    if (!dietKey) return null;
    // Replace underscores with spaces and capitalize first letter of each word
    return dietKey
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const handleView = (meal: MealItem) => {
    const id = String(meal.id);
    if (!id || id === 'undefined') {
      alert('Recept ID ontbreekt');
      return;
    }
    router.push(`/recipes/${id}?source=${meal.source}`);
  };

  const handleDelete = (meal: MealItem) => {
    setMealToDelete(meal);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!mealToDelete) return;

    setIsDeleting(true);
    try {
      const deleteId = String(mealToDelete.id);
      const result = await deleteMealAction({
        mealId: deleteId,
        source: mealToDelete.source,
      });

      if (result.ok) {
        // Update local state - remove meal from list
        if (onMealDeleted) {
          onMealDeleted(deleteId, mealToDelete.source);
        }
        setDeleteDialogOpen(false);
        setMealToDelete(null);
      } else {
        alert(`Fout: ${result.error.message}`);
        setDeleteDialogOpen(false);
      }
    } catch (error) {
      alert(
        `Fout: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      setDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddToMealPlan = (meal: MealItem) => {
    // TODO: Implement add to meal plan functionality
    console.log('Add to meal plan:', String(meal.id));
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

    const selectedId = String(selectedMeal.id);
    try {
      const result = await updateMealDietTypeAction({
        mealId: selectedId,
        source: selectedMeal.source,
        dietTypeName,
      });

      if (result.ok) {
        // Update local state optimistically - no page refresh needed
        if (onDietTypeUpdated) {
          onDietTypeUpdated(selectedId, selectedMeal.source, dietTypeName);
        }
      } else {
        alert(`Fout: ${result.error.message}`);
      }
    } catch (error) {
      alert(
        `Fout: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setSelectedMeal(null);
    }
  };

  // Filter out invalid meals
  const validMeals = meals.filter(
    (meal) => meal.id != null && String(meal.id) !== 'undefined',
  );

  // Check if there are no meals at all (not just on this page)
  const hasNoMeals =
    (totalItems !== undefined && totalItems === 0) ||
    (totalItems === undefined && validMeals.length === 0);

  if (hasNoMeals) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500 dark:text-zinc-400">
          Nog geen recepten. Voeg je eerste recept toe via een foto, screenshot
          of bestand.
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
          <Table className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
            <TableHead>
              <TableRow>
                <TableHeader className="w-0"></TableHeader>
                <TableHeader>Naam</TableHeader>
                <TableHeader className="whitespace-nowrap">Slot</TableHeader>
                <TableHeader className="whitespace-nowrap">
                  Bereidingstijd
                </TableHeader>
                <TableHeader className="whitespace-nowrap">Porties</TableHeader>
                <TableHeader className="whitespace-nowrap">
                  Gebruikt
                </TableHeader>
                <TableHeader className="whitespace-nowrap">
                  Beoordeling
                </TableHeader>
                <TableHeader className="whitespace-nowrap">
                  Compliance
                </TableHeader>
                <TableHeader className="relative w-0">
                  <span className="sr-only">Acties</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {validMeals.map((meal) => {
                const mealR = meal as Record<string, unknown>;
                const imageUrl =
                  ((mealR.sourceImageUrl ?? mealR.source_image_url) as
                    | string
                    | null) ?? null;
                const name = String(
                  mealR.name ?? mealR.meal_name ?? mealR.mealName ?? 'Recept',
                );
                return (
                  <TableRow
                    key={String(meal.id)}
                    href={`/recipes/${String(meal.id)}?source=${meal.source}`}
                  >
                    <TableCell>
                      <RecipeThumbnail imageUrl={imageUrl} alt={name} />
                    </TableCell>
                    <TableCell className="font-medium min-w-[180px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{name}</span>
                        {formatDietTypeName(
                          String(mealR.dietKey ?? mealR.diet_key ?? ''),
                        ) && (
                          <Badge color="green" className="text-xs">
                            {formatDietTypeName(
                              String(mealR.dietKey ?? mealR.diet_key ?? ''),
                            )}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize whitespace-nowrap text-sm">
                      {formatMealSlot(
                        String(mealR.mealSlot ?? mealR.meal_slot ?? ''),
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {(mealR.mealData as Record<string, unknown> | undefined)
                        ?.prepTime ? (
                        <div className="flex items-center gap-1">
                          <ClockIcon className="h-3.5 w-3.5 text-zinc-500" />
                          <span className="text-sm">
                            {String(
                              (mealR.mealData as Record<string, unknown>)
                                .prepTime ?? '',
                            )}{' '}
                            min
                          </span>
                        </div>
                      ) : (
                        <span className="text-zinc-400 text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {(mealR.mealData as Record<string, unknown> | undefined)
                        ?.servings ? (
                        <div className="flex items-center gap-1">
                          <UserGroupIcon className="h-3.5 w-3.5 text-zinc-500" />
                          <span className="text-sm">
                            {String(
                              (mealR.mealData as Record<string, unknown>)
                                .servings ?? '',
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="text-zinc-400 text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {meal.source === 'custom' ? (
                        <div className="flex items-center gap-1">
                          <CheckIcon className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-sm">
                            {Number(mealR.consumptionCount ?? 0)}x
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <CheckIcon className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-sm">
                            {Number(mealR.usage_count ?? 0)}x
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {(mealR.userRating ?? mealR.user_rating) != null ? (
                        <div className="flex items-center gap-0.5">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <StarIcon
                                key={star}
                                className={`h-3.5 w-3.5 ${
                                  star <=
                                  Number(
                                    mealR.userRating ?? mealR.user_rating ?? 0,
                                  )
                                    ? 'text-yellow-400 fill-yellow-400'
                                    : 'text-zinc-300 dark:text-zinc-700 fill-zinc-300 dark:fill-zinc-700'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-zinc-600 dark:text-zinc-400 ml-0.5">
                            {Number(mealR.userRating ?? mealR.user_rating)}/5
                          </span>
                        </div>
                      ) : (
                        <span className="text-zinc-400 text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {complianceScores[String(meal.id)] ? (
                        <ComplianceScoreBadge
                          score={complianceScores[String(meal.id)]}
                        />
                      ) : complianceLoading ? (
                        <span className="text-zinc-400 text-sm">...</span>
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
                            <DropdownItem
                              onClick={() => handleLogConsumption(meal)}
                              disabled={!!loggingMealId}
                            >
                              <CalendarIcon data-slot="icon" />
                              <span>
                                {loggingMealId === meal.id
                                  ? 'Loggen...'
                                  : 'Log consumptie'}
                              </span>
                            </DropdownItem>
                          </DropdownSection>
                          <DropdownDivider />
                          <DropdownSection>
                            <DropdownItem
                              onClick={() => handleAddToMealPlan(meal)}
                            >
                              <PlusIcon data-slot="icon" />
                              <span>Toevoegen aan receptenplan</span>
                            </DropdownItem>
                            <DropdownItem
                              onClick={() => handleLabelDietType(meal)}
                            >
                              <TagIcon data-slot="icon" />
                              <span>Label met dieettype</span>
                            </DropdownItem>
                            <DropdownItem
                              onClick={() => handleRateRecipe(meal)}
                            >
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

      {/* Pagination - Tailwind UI Plus style */}
      {totalItems !== undefined && totalPages > 1 && (
        <div className="mt-6 w-full">
          <Pagination aria-label="Recepten paginering" className="w-full">
            <PaginationPrevious
              disabled={currentPage <= 1}
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
              {generatePaginationPages(currentPage, totalPages).map(
                (page, index) => {
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
                },
              )}
            </PaginationList>
            <PaginationNext
              disabled={currentPage >= totalPages}
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
          currentDietTypeName={
            String(
              (selectedMeal as Record<string, unknown>).dietKey ??
                (selectedMeal as Record<string, unknown>).diet_key ??
                '',
            ) || null
          }
          mealName={String(
            (selectedMeal as Record<string, unknown>).name ??
              (selectedMeal as Record<string, unknown>).meal_name ??
              '',
          )}
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
        description={`Weet je zeker dat je het recept "${String((mealToDelete as Record<string, unknown> | null)?.name ?? (mealToDelete as Record<string, unknown> | null)?.meal_name ?? '')}" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`}
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
          mealId={String(mealToRate.id)}
          source={mealToRate.source}
          mealName={String(
            (mealToRate as Record<string, unknown>).name ??
              (mealToRate as Record<string, unknown>).meal_name ??
              '',
          )}
          onRatingUpdated={(rating) => {
            if (onRatingUpdated) {
              onRatingUpdated(String(mealToRate.id), mealToRate.source, rating);
            }
          }}
        />
      )}
    </>
  );
}
