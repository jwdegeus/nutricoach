"use client";

import { useState } from "react";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { Button } from "@/components/catalyst/button";
import { Plus, Loader2, CheckCircle2, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { 
  upsertUserPantryItemAction,
  bulkUpsertUserPantryItemsAction 
} from "@/src/app/(app)/pantry/actions/pantry-ui.actions";
import type {
  ShoppingListResponse,
  MealPlanCoverage,
} from "@/src/lib/agents/meal-planner";

type ShoppingListViewProps = {
  shoppingList: ShoppingListResponse;
  coverage: MealPlanCoverage;
  pantryMap: Record<string, { availableG?: number; isAvailable?: boolean }>;
};

export function ShoppingListView({
  shoppingList,
  coverage,
  pantryMap,
}: ShoppingListViewProps) {
  const router = useRouter();
  const [addingItems, setAddingItems] = useState<Set<string>>(new Set());
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [isBulkAdding, setIsBulkAdding] = useState(false);

  // Get all items that need to be purchased
  const allItemsToBuy = shoppingList.groups.flatMap((group) =>
    group.items.filter((item) => item.missingG > 0)
  );

  const handleAddToPantry = async (nevoCode: string, missingG: number) => {
    setAddingItems(prev => new Set(prev).add(nevoCode));
    
    try {
      const result = await upsertUserPantryItemAction({
        nevoCode,
        isAvailable: true,
        availableG: missingG,
      });

      if (result.ok) {
        // Dispatch custom event to notify shopping cart
        window.dispatchEvent(new CustomEvent('meal-plan-changed'));
        router.refresh();
      }
    } catch (error) {
      console.error("Error adding item to pantry:", error);
    } finally {
      setAddingItems(prev => {
        const next = new Set(prev);
        next.delete(nevoCode);
        return next;
      });
    }
  };

  const handleToggleItem = (nevoCode: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(nevoCode)) {
        next.delete(nevoCode);
      } else {
        next.add(nevoCode);
      }
      return next;
    });
  };

  const handleBulkAddChecked = async () => {
    if (checkedItems.size === 0) return;
    
    setIsBulkAdding(true);
    try {
      const items = Array.from(checkedItems).map(nevoCode => {
        const item = allItemsToBuy.find(i => i.nevoCode === nevoCode);
        return {
          nevoCode,
          isAvailable: true,
          availableG: item?.missingG || null,
        };
      });

      const result = await bulkUpsertUserPantryItemsAction({ items });
      if (result.ok) {
        // Dispatch custom event to notify shopping cart
        window.dispatchEvent(new CustomEvent('meal-plan-changed'));
        setCheckedItems(new Set());
        router.refresh();
      }
    } catch (error) {
      console.error("Error bulk adding items:", error);
    } finally {
      setIsBulkAdding(false);
    }
  };

  const getPantryInfo = (nevoCode: string) => {
    const pantry = pantryMap[nevoCode];
    if (!pantry) {
      return null;
    }
    
    if (pantry.availableG !== undefined) {
      return { type: "quantity" as const, value: pantry.availableG };
    }
    
    if (pantry.isAvailable === true) {
      return { type: "binary" as const, value: null };
    }
    
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Quick Stats Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-6">
          <div>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">Items te kopen</Text>
            <div className="mt-0.5 text-lg font-semibold text-zinc-950 dark:text-white">
              {allItemsToBuy.length}
            </div>
          </div>
          <div>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">Totaal gewicht</Text>
            <div className="mt-0.5 text-lg font-semibold text-red-600 dark:text-red-400">
              {shoppingList.totals.missingG.toFixed(0)}g
            </div>
          </div>
          <div>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">Coverage</Text>
            <div className="mt-0.5 text-lg font-semibold text-zinc-950 dark:text-white">
              {coverage.totals.coveragePct.toFixed(0)}%
            </div>
          </div>
        </div>
        
        {checkedItems.size > 0 && (
          <Button
            onClick={handleBulkAddChecked}
            disabled={isBulkAdding}
            color="green"
          >
            {isBulkAdding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Markeer {checkedItems.size} item{checkedItems.size > 1 ? 's' : ''} als gekocht
          </Button>
        )}
      </div>

      {/* Shopping List Groups - Organized by category */}
      <div className="space-y-3">
        {shoppingList.groups.map((group) => {
          const itemsToBuy = group.items.filter(item => item.missingG > 0);
          
          if (itemsToBuy.length === 0) {
            return null;
          }
          
          return (
            <div 
              key={group.category} 
              className="rounded-lg bg-white p-4 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10"
            >
              <div className="flex items-center gap-2 mb-3">
                <ShoppingBag className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                <Heading level={3} className="text-base font-semibold">
                  {group.category}
                </Heading>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  ({itemsToBuy.length})
                </span>
              </div>
              
              <div className="space-y-1">
                {itemsToBuy.map((item) => {
                  const pantryInfo = getPantryInfo(item.nevoCode);
                  const isAdding = addingItems.has(item.nevoCode);
                  const isChecked = checkedItems.has(item.nevoCode);
                  
                  return (
                    <div
                      key={item.nevoCode}
                      className={`
                        flex items-center gap-3 p-2 rounded-lg transition-colors
                        ${isChecked ? 'bg-green-50 dark:bg-green-950/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}
                      `}
                    >
                      <button
                        onClick={() => handleToggleItem(item.nevoCode)}
                        className={`
                          flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                          ${isChecked 
                            ? 'bg-green-600 border-green-600' 
                            : 'border-zinc-300 dark:border-zinc-600 hover:border-green-500'
                          }
                        `}
                        title={isChecked ? "Geselecteerd" : "Selecteer"}
                      >
                        {isChecked && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                        )}
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-zinc-950 dark:text-white">
                          {item.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                            {item.missingG.toFixed(0)}g nodig
                          </Text>
                          {pantryInfo && (
                            <>
                              <span className="text-zinc-300 dark:text-zinc-700">•</span>
                              <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                                {pantryInfo.type === "quantity" 
                                  ? `${pantryInfo.value.toFixed(0)}g in pantry`
                                  : "Aanwezig in pantry"
                                }
                              </Text>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
                          {item.missingG.toFixed(0)}g
                        </div>
                        <Button
                          onClick={() => handleAddToPantry(item.nevoCode, item.missingG)}
                          disabled={isAdding}
                          plain
                          className="h-7 w-7 !p-0 !min-w-0"
                          title="Voeg toe aan pantry"
                        >
                          {isAdding ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" data-slot="icon" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" data-slot="icon" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
