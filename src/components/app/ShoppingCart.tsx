'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ShoppingCartIcon } from '@heroicons/react/20/solid';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownHeader,
  DropdownDivider,
} from '@/components/catalyst/dropdown';
import { NavbarItem } from '@/components/catalyst/navbar';
import { Text } from '@/components/catalyst/text';
import { getShoppingCartAction } from '@/src/app/(app)/meal-plans/actions/shopping-cart.actions';
import type { ShoppingListResponse } from '@/src/lib/agents/meal-planner';

export function ShoppingCart() {
  const pathname = usePathname();
  const [shoppingList, setShoppingList] = useState<ShoppingListResponse | null>(
    null,
  );
  const [planId, setPlanId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadShoppingCart = useCallback(async () => {
    setIsLoading(true);
    const result = await getShoppingCartAction();
    if (result.ok && result.data) {
      setShoppingList(result.data.shoppingList);
      setPlanId(result.data.planId);
    } else {
      // If no meal plan exists, clear the shopping cart
      setShoppingList(null);
      setPlanId(null);
    }
    setIsLoading(false);
  }, []);

  // Track previous pathname to avoid unnecessary refreshes
  const prevPathnameRef = useRef<string | null>(null);

  // Load on mount only
  useEffect(() => {
    loadShoppingCart();
    prevPathnameRef.current = pathname;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Refresh when pathname changes (e.g., after deleting a meal plan)
  // But only if pathname actually changed and we're not on a shopping page
  useEffect(() => {
    if (
      prevPathnameRef.current !== pathname &&
      !pathname.includes('/shopping')
    ) {
      // Debounce to avoid rapid successive calls
      const timeoutId = setTimeout(() => {
        loadShoppingCart();
        prevPathnameRef.current = pathname;
      }, 300);

      return () => clearTimeout(timeoutId);
    } else {
      prevPathnameRef.current = pathname;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]); // Remove loadShoppingCart from deps to prevent loops

  // Refresh when window gains focus (user comes back to tab)
  useEffect(() => {
    const handleFocus = () => {
      loadShoppingCart();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only set up listener once

  // Listen for custom events (e.g., when meal plan is deleted)
  useEffect(() => {
    const handleMealPlanChange = () => {
      loadShoppingCart();
    };

    window.addEventListener('meal-plan-changed', handleMealPlanChange);
    return () =>
      window.removeEventListener('meal-plan-changed', handleMealPlanChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only set up listener once

  // Count items that need to be purchased
  const itemCount = shoppingList
    ? shoppingList.groups.reduce(
        (sum, group) =>
          sum + group.items.filter((item) => item.missingG > 0).length,
        0,
      )
    : 0;

  // Show loading state briefly to prevent flicker
  if (isLoading) {
    return null;
  }

  // Only show shopping cart if there are items to buy
  if (!shoppingList || itemCount === 0) {
    return null;
  }

  return (
    <Dropdown>
      <DropdownButton as={NavbarItem} className="relative">
        <ShoppingCartIcon className="h-5 w-5" />
        {itemCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white">
            {itemCount > 9 ? '9+' : itemCount}
          </span>
        )}
      </DropdownButton>
      <DropdownMenu anchor="bottom end" className="w-80 max-h-[32rem]">
        <DropdownHeader>
          <div className="flex items-center justify-between w-full">
            <span className="font-semibold text-zinc-950 dark:text-white">
              Boodschappenlijst
            </span>
            {planId && (
              <DropdownItem
                href={`/meal-plans/${planId}/shopping`}
                className="!px-2 !py-1 text-xs font-normal"
              >
                Bekijk alles
              </DropdownItem>
            )}
          </div>
        </DropdownHeader>
        <DropdownDivider />
        <div className="overflow-y-auto max-h-[24rem]">
          {shoppingList.groups.map((group, groupIndex) => {
            const itemsToBuy = group.items.filter((item) => item.missingG > 0);
            if (itemsToBuy.length === 0) return null;

            return (
              <div key={group.category}>
                <div className="px-3.5 pt-2 pb-1 text-sm/5 font-medium text-zinc-500 sm:px-3 sm:text-xs/5 dark:text-zinc-400 uppercase tracking-wide">
                  {group.category}
                </div>
                {itemsToBuy.map((item) => (
                  <div
                    key={item.nevoCode}
                    className="px-3.5 py-2.5 sm:px-3 sm:py-1.5"
                  >
                    <div className="text-sm/6 font-medium text-zinc-950 dark:text-white sm:text-base/6 truncate">
                      {item.name}
                    </div>
                    <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400 sm:text-sm/5">
                      {item.missingG.toFixed(0)}g te kopen
                    </div>
                  </div>
                ))}
                {groupIndex < shoppingList.groups.length - 1 && (
                  <DropdownDivider />
                )}
              </div>
            );
          })}
        </div>
        <DropdownDivider />
        <div className="px-3.5 py-2.5 sm:px-3 sm:py-2">
          <Text className="text-sm/6 font-medium text-zinc-950 dark:text-white sm:text-xs/6">
            Totaal: {shoppingList.totals.missingG.toFixed(0)}g te kopen
          </Text>
        </div>
      </DropdownMenu>
    </Dropdown>
  );
}
