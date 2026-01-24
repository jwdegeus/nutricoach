"use client";

import { useState } from "react";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { bulkUpsertUserPantryItemsAction } from "@/src/app/(app)/pantry/actions/pantry-ui.actions";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingCart } from "lucide-react";
import type {
  ShoppingListResponse,
  MealPlanCoverage,
} from "@/src/lib/agents/meal-planner";

type MissingIngredientsPanelProps = {
  shoppingList: ShoppingListResponse;
  coverage: MealPlanCoverage;
};

export function MissingIngredientsPanel({
  shoppingList,
  coverage,
}: MissingIngredientsPanelProps) {
  const router = useRouter();
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collect all missing items
  const missingItems = shoppingList.groups.flatMap((group) =>
    group.items.filter((item) => item.missingG > 0)
  );

  if (missingItems.length === 0) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Heading>Ontbrekende Ingrediënten</Heading>
        <div className="mt-4">
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            Alle ingrediënten zijn aanwezig in je pantry! 🎉
          </Text>
        </div>
      </div>
    );
  }

  const handleBulkAddBinary = async () => {
    setIsBulkAdding(true);
    setError(null);

    try {
      const items = missingItems.map((item) => ({
        nevoCode: item.nevoCode,
        isAvailable: true,
        availableG: null, // Binary available
      }));

      const result = await bulkUpsertUserPantryItemsAction({ items });

      if (result.ok) {
        // Dispatch custom event to notify shopping cart
        window.dispatchEvent(new CustomEvent('meal-plan-changed'));
        router.refresh();
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fout bij toevoegen");
    } finally {
      setIsBulkAdding(false);
    }
  };

  const handleBulkAddWithQuantity = async () => {
    setIsBulkAdding(true);
    setError(null);

    try {
      const items = missingItems.map((item) => ({
        nevoCode: item.nevoCode,
        isAvailable: true,
        availableG: item.missingG, // Set to missing quantity
      }));

      const result = await bulkUpsertUserPantryItemsAction({ items });

      if (result.ok) {
        // Dispatch custom event to notify shopping cart
        window.dispatchEvent(new CustomEvent('meal-plan-changed'));
        router.refresh();
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fout bij toevoegen");
    } finally {
      setIsBulkAdding(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <Heading>
        Ontbrekende Ingrediënten ({missingItems.length} items)
      </Heading>
      <div className="mt-4 space-y-4">
        <div className="divide-y divide-zinc-950/5 dark:divide-white/5">
          {missingItems.map((item) => (
            <div
              key={item.nevoCode}
              className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
            >
              <div>
                <div className="font-medium text-zinc-950 dark:text-white">{item.name}</div>
                <Text className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  Ontbreekt: {item.missingG.toFixed(0)}g
                </Text>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-4 border-t border-zinc-950/5 dark:border-white/5">
          <Button
            onClick={handleBulkAddBinary}
            disabled={isBulkAdding}
          >
            {isBulkAdding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4 mr-2" />
            )}
            Markeer alles als aanwezig
          </Button>

          <Button
            onClick={handleBulkAddWithQuantity}
            disabled={isBulkAdding}
            variant="outline"
          >
            {isBulkAdding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4 mr-2" />
            )}
            Zet hoeveelheid op ontbrekend ({missingItems.reduce((sum, item) => sum + item.missingG, 0).toFixed(0)}g)
          </Button>
        </div>

        {error && (
          <Text className="text-sm text-red-600 dark:text-red-400">{error}</Text>
        )}
      </div>
    </div>
  );
}
