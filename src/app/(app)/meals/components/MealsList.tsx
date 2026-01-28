'use client';

import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
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
  ClockIcon,
  UserGroupIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  CalendarIcon,
} from '@heroicons/react/20/solid';
import { logMealConsumptionAction } from '../actions/meals.actions';
import type { CustomMealRecord } from '@/src/lib/custom-meals/customMeals.service';
import type { MealSlot } from '@/src/lib/diets';

type MealItem =
  | (CustomMealRecord & { source: 'custom' })
  | (any & { source: 'gemini' });

type MealsListProps = {
  meals: MealItem[];
  onConsumptionLogged?: (mealId: string, source: 'custom' | 'gemini') => void;
};

export function MealsList({ meals, onConsumptionLogged }: MealsListProps) {
  const router = useRouter();
  const [loggingMealId, setLoggingMealId] = useState<string | null>(null);

  const handleLogConsumption = async (meal: MealItem) => {
    // Prevent double submission
    if (loggingMealId) {
      return;
    }

    setLoggingMealId(meal.id);

    try {
      const result = await logMealConsumptionAction({
        customMealId: meal.source === 'custom' ? meal.id : undefined,
        mealHistoryId: meal.source === 'gemini' ? meal.id : undefined,
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

  const handleView = (meal: MealItem) => {
    router.push(`/meals/${meal.id}?source=${meal.source}`);
  };

  const handleEdit = (meal: MealItem) => {
    // TODO: Implement edit functionality
    console.log('Edit meal:', meal.id);
  };

  const handleDelete = (meal: MealItem) => {
    // TODO: Implement delete functionality
    if (
      confirm(
        `Weet je zeker dat je "${meal.name || meal.meal_name}" wilt verwijderen?`,
      )
    ) {
      console.log('Delete meal:', meal.id);
    }
  };

  const handleAddToMealPlan = (meal: MealItem) => {
    // TODO: Implement add to meal plan functionality
    console.log('Add to meal plan:', meal.id);
  };

  if (meals.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500 dark:text-zinc-400">
          Nog geen maaltijden. Voeg je eerste maaltijd toe via een foto,
          screenshot of bestand.
        </p>
      </div>
    );
  }

  return (
    <Table className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
      <TableHead>
        <TableRow>
          <TableHeader>Naam</TableHeader>
          <TableHeader>Type</TableHeader>
          <TableHeader>Slot</TableHeader>
          <TableHeader>Bereidingstijd</TableHeader>
          <TableHeader>Porties</TableHeader>
          <TableHeader>Gebruikt</TableHeader>
          <TableHeader className="relative w-0">
            <span className="sr-only">Acties</span>
          </TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {meals.map((meal) => (
          <TableRow
            key={meal.id}
            href={`/meals/${meal.id}?source=${meal.source}`}
          >
            <TableCell className="font-medium">
              {meal.name || meal.meal_name}
            </TableCell>
            <TableCell>
              <Badge color={meal.source === 'custom' ? 'blue' : 'zinc'}>
                {meal.source === 'custom' ? 'Custom' : 'Gemini'}
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
            <TableCell className="text-zinc-500">
              {meal.source === 'custom'
                ? `${meal.consumptionCount || 0}x geconsumeerd`
                : `${meal.usage_count || 0}x gebruikt`}
            </TableCell>
            <TableCell>
              <div
                className="-mx-3 -my-1.5 sm:-mx-2.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Dropdown>
                  <DropdownButton
                    plain
                    className="p-1 no-hover-bg"
                    onClick={(e: MouseEvent) => e.stopPropagation()}
                  >
                    <EllipsisVerticalIcon className="size-6 text-zinc-500" />
                  </DropdownButton>
                  <DropdownMenu anchor="bottom end">
                    <DropdownSection>
                      <DropdownItem
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation();
                          handleView(meal);
                        }}
                      >
                        <EyeIcon data-slot="icon" />
                        <span>Bekijken</span>
                      </DropdownItem>
                      <DropdownItem
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation();
                          handleEdit(meal);
                        }}
                      >
                        <PencilIcon data-slot="icon" />
                        <span>Wijzigen</span>
                      </DropdownItem>
                    </DropdownSection>
                    <DropdownDivider />
                    <DropdownSection>
                      <DropdownItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLogConsumption(meal);
                        }}
                        disabled={loggingMealId === meal.id}
                      >
                        <CheckIcon data-slot="icon" />
                        <span>
                          {loggingMealId === meal.id
                            ? 'Loggen...'
                            : 'Geconsumeerd'}
                        </span>
                      </DropdownItem>
                      <DropdownItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToMealPlan(meal);
                        }}
                      >
                        <CalendarIcon data-slot="icon" />
                        <span>Toevoegen aan maaltijdplan</span>
                      </DropdownItem>
                    </DropdownSection>
                    <DropdownDivider />
                    <DropdownSection>
                      <DropdownItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(meal);
                        }}
                        className="text-red-600 data-focus:text-white data-focus:bg-red-600 dark:text-red-400"
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
  );
}
