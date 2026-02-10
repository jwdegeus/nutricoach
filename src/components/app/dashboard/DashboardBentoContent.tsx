'use client';

import { useState } from 'react';
import type { CustomMealRecord } from '@/src/lib/custom-meals/customMeals.service';
import { BentoCell } from '@/src/components/app/dashboard/BentoCell';
import { TopMealsWidget } from '@/src/components/app/dashboard/top-meals-widget';
import { FamilieIntakeOverviewClient } from '@/src/components/app/dashboard/FamilieIntakeOverviewClient';

type Props = { topMeals: CustomMealRecord[] };

export function DashboardBentoContent({ topMeals }: Props) {
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');

  return (
    <div className="grid gap-4 sm:mt-16 lg:grid-cols-3 lg:grid-rows-2">
      {/* Col 1, row-span-2: Inname summary — left edge rounding */}
      <BentoCell
        placement="lg:row-span-2"
        round="max-lg:rounded-t-4xl lg:rounded-l-4xl"
        bg="bg-muted"
      >
        <div className="flex h-full flex-col p-6 sm:p-8">
          <FamilieIntakeOverviewClient
            variant="summary"
            selectedMemberId={selectedMemberId}
            onMemberChange={setSelectedMemberId}
          />
        </div>
      </BentoCell>

      {/* Col 2, row 1: Top maaltijden — top-right corner on desktop */}
      <BentoCell
        placement="max-lg:row-start-2"
        round="lg:rounded-tr-4xl"
        bg="bg-muted"
      >
        <div className="flex h-full flex-col p-6 sm:p-8">
          <TopMealsWidget initialMeals={topMeals} />
        </div>
      </BentoCell>

      {/* Col 2, row 2: Small card — periode */}
      <BentoCell
        placement="lg:col-start-2 lg:row-start-2"
        round="rounded-lg"
        bg="bg-muted"
      >
        <div className="flex flex-1 flex-col justify-center p-6 sm:p-8">
          <p className="text-sm font-medium text-muted-foreground">Periode</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            Afgelopen 7 dagen
          </p>
        </div>
      </BentoCell>

      {/* Col 3, row-span-2: Detail intake — right edge rounding */}
      <BentoCell
        placement="lg:col-start-3 lg:row-span-2 lg:row-start-1"
        round="max-lg:rounded-b-4xl lg:rounded-r-4xl"
        bg="bg-muted"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
          <FamilieIntakeOverviewClient
            variant="detail"
            selectedMemberId={selectedMemberId}
            onMemberChange={setSelectedMemberId}
          />
        </div>
      </BentoCell>
    </div>
  );
}
