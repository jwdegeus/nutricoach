"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import type { MealPlanRecord } from "@/src/lib/meal-plans/mealPlans.types";
import { Eye, Calendar } from "lucide-react";

type MealPlansTableProps = {
  plans: MealPlanRecord[];
};

export function MealPlansTable({ plans }: MealPlansTableProps) {
  if (plans.length === 0) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Heading>Meal Plans</Heading>
        <div className="mt-4 space-y-4">
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            Je hebt nog geen meal plans. Genereer er een om te beginnen.
          </Text>
          <Button href="/meal-plans/new">
            <Calendar className="h-4 w-4 mr-2" />
            Nieuw Meal Plan
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <Heading>Meal Plans ({plans.length})</Heading>
      <div className="mt-4">
        <Table>
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
              const formattedDate = createdDate.toLocaleDateString("nl-NL", {
                year: "numeric",
                month: "short",
                day: "numeric",
              });

              return (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">
                    {plan.dateFrom}
                  </TableCell>
                  <TableCell>{plan.days} dagen</TableCell>
                  <TableCell>
                    <span className="capitalize">
                      {plan.dietKey.replace(/_/g, " ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formattedDate}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        outline
                        href={`/meal-plans/${plan.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1" />
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
