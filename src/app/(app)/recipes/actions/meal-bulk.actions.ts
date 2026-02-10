'use server';

import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';

const BULK_SLOT_VALUES = ['breakfast', 'lunch', 'dinner'] as const;
type BulkMealSlot = (typeof BULK_SLOT_VALUES)[number];

const bulkUpdateMealSlotSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Minimaal één recept vereist'),
  mealSlot: z.enum(BULK_SLOT_VALUES),
});

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR';
        message: string;
      };
    };

/**
 * Bulk update meal_slot for current user's recipes. RLS scoped; minimal columns.
 */
export async function bulkUpdateMealSlotAction(
  input: z.infer<typeof bulkUpdateMealSlotSchema>,
): Promise<ActionResult<{ updatedCount: number }>> {
  try {
    const parsed = bulkUpdateMealSlotSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.flatten().formErrors[0] ?? 'Ongeldige invoer',
        },
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Niet ingelogd' },
      };
    }

    const { ids, mealSlot } = parsed.data;

    const { data: updated, error } = await supabase
      .from('custom_meals')
      .update({ meal_slot: mealSlot })
      .eq('user_id', user.id)
      .in('id', ids)
      .select('id');

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    return {
      ok: true,
      data: { updatedCount: updated?.length ?? 0 },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: err instanceof Error ? err.message : 'Onbekende fout',
      },
    };
  }
}
