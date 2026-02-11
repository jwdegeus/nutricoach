'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table';
import { Button } from '@/components/catalyst/button';
import { Heading } from '@/components/catalyst/heading';
import type { MealPlanRecord } from '@/src/lib/meal-plans/mealPlans.types';
import { Eye } from 'lucide-react';
import { PlusIcon } from '@heroicons/react/16/solid';

type MealPlansTableProps = {
  plans: MealPlanRecord[];
};

export function MealPlansTable({ plans }: MealPlansTableProps) {
  if (plans.length === 0) {
    return (
      <div className="rounded-lg bg-background p-12 shadow-sm">
        <div className="text-center">
          <svg
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
            className="mx-auto size-12 text-muted-foreground"
          >
            <path
              d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h3 className="mt-2 text-sm font-semibold text-foreground">
            Geen weekmenu&apos;s
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Genereer er een om te beginnen.
          </p>
          <div className="mt-6">
            <Button href="/meal-plans/new" color="primary">
              <PlusIcon aria-hidden className="mr-1.5 -ml-0.5 size-5" />
              Nieuw weekmenu
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-xs dark:bg-zinc-900">
      <Heading>Weekmenu&apos;s ({plans.length})</Heading>
      <div className="mt-4">
        <Table className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
          <TableHead>
            <TableRow>
              <TableHeader>Start Datum</TableHeader>
              <TableHeader>Dagen</TableHeader>
              <TableHeader>Dieet</TableHeader>
              <TableHeader>Aangemaakt</TableHeader>
              <TableHeader className="text-right">Acties</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {plans.map((plan) => {
              const createdDate = new Date(plan.createdAt);
              const formattedDate = createdDate.toLocaleDateString('nl-NL', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

              return (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.dateFrom}</TableCell>
                  <TableCell>{plan.days} dagen</TableCell>
                  <TableCell>
                    <span className="capitalize">
                      {plan.dietKey.replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formattedDate}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button outline href={`/meal-plans/${plan.id}`}>
                        <Eye className="mr-1 h-4 w-4" />
                        Details
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
