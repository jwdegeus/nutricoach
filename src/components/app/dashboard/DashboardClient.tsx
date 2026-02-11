'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { PageHeader } from '@/src/components/app/PageHeader';
import { FamilyMemberFilter } from './FamilyMemberFilter';
import { DashboardKpiCards } from './DashboardKpiCards';
import { BentoCell } from './BentoCell';
import { DashboardChartSkeleton } from './DashboardChartSkeleton';
import {
  mockCaloriesData,
  mockVitaminData,
  mockMineralData,
  mockSupplementData,
  aggregateCaloriesData,
  aggregateVitaminData,
  aggregateMineralData,
  aggregateSupplementData,
  getMemberIndex,
  type FamilyMember,
} from './DashboardChartData';
import type {
  DashboardTopMeal,
  DashboardFamilyMember,
} from '@/src/app/(app)/dashboard/dashboard.types';

const CaloriesStackedBarChart = dynamic(
  () =>
    import('./CaloriesStackedBarChart').then((m) => m.CaloriesStackedBarChart),
  {
    ssr: false,
    loading: () => <DashboardChartSkeleton minHeight={320} />,
  },
);

const VitaminsAreaChart = dynamic(
  () => import('./VitaminsAreaChart').then((m) => m.VitaminsAreaChart),
  { ssr: false, loading: () => <DashboardChartSkeleton minHeight={280} /> },
);

const MineralsAreaChart = dynamic(
  () => import('./MineralsAreaChart').then((m) => m.MineralsAreaChart),
  { ssr: false, loading: () => <DashboardChartSkeleton minHeight={280} /> },
);

const SupplementsBarChart = dynamic(
  () => import('./SupplementsBarChart').then((m) => m.SupplementsBarChart),
  { ssr: false, loading: () => <DashboardChartSkeleton minHeight={280} /> },
);

const TopMealsWidget = dynamic(
  () => import('./top-meals-widget').then((m) => m.TopMealsWidget),
  {
    ssr: false,
    loading: () => <DashboardChartSkeleton minHeight={240} />,
  },
);

type Props = {
  members: DashboardFamilyMember[];
  topMeals: DashboardTopMeal[];
};

export function DashboardClient({ members, topMeals }: Props) {
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');

  const memberOptions = useMemo(
    () => members.map((m) => ({ id: m.id, name: m.name })),
    [members],
  );

  const memberIdx = useMemo(
    () => getMemberIndex(selectedMemberId, members),
    [selectedMemberId, members],
  );

  const caloriesData = useMemo(() => {
    if (memberIdx >= 0) return mockCaloriesData(memberIdx);
    return aggregateCaloriesData(members);
  }, [memberIdx, members]);

  const vitaminData = useMemo(() => {
    if (memberIdx >= 0) return mockVitaminData(memberIdx);
    return aggregateVitaminData(members);
  }, [memberIdx, members]);

  const mineralData = useMemo(() => {
    if (memberIdx >= 0) return mockMineralData(memberIdx);
    return aggregateMineralData(members);
  }, [memberIdx, members]);

  const supplementData = useMemo(() => {
    if (memberIdx >= 0) return mockSupplementData(memberIdx);
    return aggregateSupplementData(members);
  }, [memberIdx, members]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col py-4 sm:py-6">
      <PageHeader
        title="Dashboard"
        subtitle="Overzicht van je gezin en inname afgelopen week"
      />

      {/* Filter row — hele familie / per persoon */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <FamilyMemberFilter
          members={memberOptions}
          value={selectedMemberId}
          onChange={setSelectedMemberId}
        />
      </div>

      {/* KPI row */}
      <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCards />
      </div>

      {/* Chart widgets — bento grid */}
      <div className="mt-6 grid w-full flex-1 gap-4 lg:grid-cols-2">
        {/* Calories — full width on lg (spans 2 cols) */}
        <BentoCell
          placement="lg:col-span-2"
          round="rounded-lg lg:rounded-tl-4xl lg:rounded-tr-4xl"
          bg="bg-muted"
        >
          <div className="flex h-full min-h-[320px] flex-col p-6 sm:p-8">
            <CaloriesStackedBarChart data={caloriesData} />
          </div>
        </BentoCell>

        {/* Vitamins */}
        <BentoCell round="rounded-lg" bg="bg-muted">
          <div className="flex h-full min-h-[280px] flex-col p-6 sm:p-8">
            <VitaminsAreaChart data={vitaminData} />
          </div>
        </BentoCell>

        {/* Minerals */}
        <BentoCell round="rounded-lg" bg="bg-muted">
          <div className="flex h-full min-h-[280px] flex-col p-6 sm:p-8">
            <MineralsAreaChart data={mineralData} />
          </div>
        </BentoCell>

        {/* Supplements */}
        <BentoCell round="rounded-lg" bg="bg-muted">
          <div className="flex h-full min-h-[280px] flex-col p-6 sm:p-8">
            <SupplementsBarChart data={supplementData} />
          </div>
        </BentoCell>

        {/* Top meals — full width */}
        <BentoCell
          placement="lg:col-span-2"
          round="rounded-lg lg:rounded-bl-4xl lg:rounded-br-4xl"
          bg="bg-muted"
        >
          <div className="flex h-full min-h-[240px] flex-col p-6 sm:p-8">
            <TopMealsWidget initialMeals={topMeals} />
          </div>
        </BentoCell>
      </div>
    </div>
  );
}
