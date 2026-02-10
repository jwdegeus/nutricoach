/**
 * Pure helper for weekmenu eligibility. Not a Server Action (no 'use server').
 * Used by meal-list and meal-recent actions to compute weekMenuStatus.
 * Slot eligibility is based on weekmenu classification (weekmenu_slots), not on meal_slot/soort.
 */

export type WeekMenuStatus =
  | 'ready'
  | 'blocked_slot'
  | 'blocked_refs'
  | 'blocked_both';

/** Slots that count for weekmenu (ontbijt, lunch, diner). */
export const WEEKMENU_SLOTS = ['breakfast', 'lunch', 'dinner'] as const;

/**
 * @param weekmenuSlots - From DB: weekmenu_slots, or derived from meal_slot when null (meal_slot in breakfast/lunch/dinner → [meal_slot], else [])
 * @param hasIngredientRefs - Whether the recipe has at least one ingredient linked to the DB for nutrients (NEVO, custom or FNDDS)
 */
export function computeWeekMenuStatus(
  weekmenuSlots: string[] | null,
  hasIngredientRefs: boolean,
): WeekMenuStatus {
  const slotEligible = Array.isArray(weekmenuSlots) && weekmenuSlots.length > 0;
  const refsEligible = hasIngredientRefs;
  if (slotEligible && refsEligible) return 'ready';
  if (!slotEligible && !refsEligible) return 'blocked_both';
  if (!slotEligible) return 'blocked_slot';
  return 'blocked_refs';
}

/**
 * Derive effective weekmenu slots for a recipe: use weekmenu_slots when set, else fallback from meal_slot.
 */
export function effectiveWeekmenuSlots(
  weekmenuSlots: string[] | null | undefined,
  mealSlot: string | null,
): string[] {
  if (Array.isArray(weekmenuSlots) && weekmenuSlots.length > 0)
    return weekmenuSlots.filter((s) =>
      (WEEKMENU_SLOTS as readonly string[]).includes(s),
    );
  if (
    mealSlot != null &&
    (WEEKMENU_SLOTS as readonly string[]).includes(mealSlot)
  )
    return [mealSlot];
  return [];
}
