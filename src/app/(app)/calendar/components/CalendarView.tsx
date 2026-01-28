/**
 * Calendar View Component
 *
 * Shows all meals from all meal plans organized by date
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import type { MealPlanRecord } from '@/src/lib/meal-plans/mealPlans.types';
import type { Meal } from '@/src/lib/diets';
import { Button } from '@/components/catalyst/button';
import { Lock, ChevronLeft, ChevronRight } from 'lucide-react';
import { MealDetailDialog } from '@/src/app/(app)/meal-plans/[planId]/components/MealDetailDialog';
import { getMealPlanCalendarAction } from '@/src/app/(app)/meal-plans/actions/mealPlanCalendar.actions';

type DayMeals = {
  date: string; // YYYY-MM-DD
  meals: Array<{
    meal: Meal;
    planId: string;
    planName: string;
    canEdit: boolean;
    canDelete: boolean;
    isLocked: boolean;
    lockReason?: string;
  }>;
  hasLocks: boolean;
};

export function CalendarView({ plans }: { plans: MealPlanRecord[] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedMeal, setSelectedMeal] = useState<{
    meal: Meal;
    planId: string;
    date: string;
  } | null>(null);
  const [calendarData, setCalendarData] = useState<Map<string, DayMeals>>(
    new Map(),
  );

  // Load calendar data for all plans
  useEffect(() => {
    const loadAllPlans = async () => {
      const allDays = new Map<string, DayMeals>();

      for (const plan of plans) {
        try {
          const data = await getMealPlanCalendarAction(plan.id);

          // Process each day
          for (const calendarDay of data.calendarDays) {
            const existing = allDays.get(calendarDay.date) || {
              date: calendarDay.date,
              meals: [],
              hasLocks: false,
            };

            // Add meals from this plan
            for (const {
              meal,
              canEdit,
              canDelete,
              isLocked,
              lockReason,
            } of calendarDay.meals) {
              existing.meals.push({
                meal,
                planId: plan.id,
                planName: `${new Date(plan.dateFrom).toLocaleDateString(
                  'nl-NL',
                  {
                    day: 'numeric',
                    month: 'short',
                  },
                )} - ${plan.days} dagen`,
                canEdit,
                canDelete,
                isLocked,
                lockReason,
              });
            }

            if (calendarDay.meals.some((m) => m.isLocked)) {
              existing.hasLocks = true;
            }

            allDays.set(calendarDay.date, existing);
          }
        } catch (error) {
          console.error(`Error loading plan ${plan.id}:`, error);
        }
      }

      setCalendarData(allDays);
    };

    if (plans.length > 0) {
      loadAllPlans();
    }
  }, [plans]);

  // Get days for current month
  const monthDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek =
      firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Monday = 0

    const days: Array<{
      date: Date;
      dateStr: string;
      meals: DayMeals['meals'];
      hasLocks: boolean;
    }> = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({
        date: new Date(year, month, -i),
        dateStr: '',
        meals: [],
        hasLocks: false,
      });
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split('T')[0];
      const dayData = calendarData.get(dateStr);

      days.push({
        date,
        dateStr,
        meals: dayData?.meals || [],
        hasLocks: dayData?.hasLocks || false,
      });
    }

    return days;
  }, [currentMonth, calendarData]);

  const mealSlotLabels: Record<string, string> = {
    breakfast: 'Ontbijt',
    lunch: 'Lunch',
    dinner: 'Diner',
    snack: 'Snack',
  };

  const mealSlotColors: Record<string, string> = {
    breakfast:
      'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200',
    lunch: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200',
    dinner:
      'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200',
    snack:
      'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
  };

  const monthName = currentMonth.toLocaleDateString('nl-NL', {
    month: 'long',
    year: 'numeric',
  });

  const goToPreviousMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1),
    );
  };

  const goToNextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1),
    );
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  return (
    <div className="space-y-6">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button onClick={goToPreviousMonth} outline className="text-sm">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold min-w-[200px] text-center">
            {monthName}
          </h2>
          <Button onClick={goToNextMonth} outline className="text-sm">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={goToToday} outline className="text-sm">
          Vandaag
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-zinc-50 dark:bg-zinc-900/50">
          {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map((day) => (
            <div
              key={day}
              className="p-3 text-center text-sm font-medium text-zinc-700 dark:text-zinc-300 border-r border-zinc-200 dark:border-zinc-800 last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7">
          {monthDays.map((day, index) => {
            const isToday =
              day.dateStr === new Date().toISOString().split('T')[0];
            const isCurrentMonth =
              day.date.getMonth() === currentMonth.getMonth();

            return (
              <div
                key={index}
                className={`
                  min-h-[120px] border-r border-b border-zinc-200 dark:border-zinc-800
                  ${isCurrentMonth ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-950'}
                  ${isToday ? 'ring-2 ring-blue-500' : ''}
                  p-2
                `}
              >
                {day.dateStr && (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`
                          text-sm font-medium
                          ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300'}
                          ${!isCurrentMonth ? 'opacity-50' : ''}
                        `}
                      >
                        {day.date.getDate()}
                      </span>
                      {day.hasLocks && (
                        <Lock className="h-3 w-3 text-red-500" />
                      )}
                    </div>

                    {/* Meals for this day */}
                    <div className="space-y-1">
                      {day.meals.map(({ meal, planId, isLocked }) => (
                        <button
                          key={`${planId}-${meal.id}`}
                          onClick={() =>
                            setSelectedMeal({ meal, planId, date: day.dateStr })
                          }
                          className={`
                            w-full text-left px-2 py-1 rounded text-xs
                            transition-colors
                            ${mealSlotColors[meal.slot] || 'bg-zinc-100 dark:bg-zinc-800'}
                            hover:opacity-80
                            ${isLocked ? 'opacity-60' : ''}
                          `}
                        >
                          <div className="font-medium truncate">
                            {mealSlotLabels[meal.slot] || meal.slot}
                          </div>
                          <div className="truncate text-xs opacity-90">
                            {meal.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Meal detail dialog */}
      {selectedMeal && (
        <MealDetailDialog
          open={!!selectedMeal}
          onClose={() => setSelectedMeal(null)}
          meal={selectedMeal.meal}
          enrichedMeal={undefined} // Could be loaded if needed
          cookPlanDay={undefined} // Could be loaded if needed
          nevoFoodNamesByCode={{}}
        />
      )}
    </div>
  );
}
