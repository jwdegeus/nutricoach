'use server';

import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import { updateRecipePrepTimeAndServingsAction } from '../../actions/meals.actions';

const MEAL_SLOT_VALUES = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'other',
] as const;
const MAX_TAG_LENGTH = 40;
const MAX_TAGS_COUNT = 20;

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR';
        message: string;
      };
    };

/** Output contract: classification returned by load and save (minimal columns). */
export type MealClassificationData = {
  mealId: string;
  mealSlot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';
  /** When set, use this for display instead of formatMealSlot(mealSlot) (e.g. custom "Bijgerecht"). */
  mealSlotLabel: string | null;
  mealSlotOptionId: string | null;
  totalMinutes: number | null;
  servings: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  cuisineOptionId: string | null;
  proteinTypeOptionId: string | null;
  recipeBookOptionId: string | null;
  tags: string[];
};

const mealSlotSchema = z.enum(MEAL_SLOT_VALUES);

const saveClassificationSchema = z.object({
  mealSlot: mealSlotSchema.optional(),
  totalMinutes: z
    .union([z.number().int().min(0), z.null(), z.undefined()])
    .transform((v) => (v === undefined ? null : v)),
  servings: z
    .union([z.number().int().min(0), z.null(), z.undefined()])
    .transform((v) => (v === undefined ? null : v)),
  tags: z
    .array(z.string().max(MAX_TAG_LENGTH))
    .max(MAX_TAGS_COUNT)
    .transform((arr) => {
      const normalized = arr
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      return [...new Set(normalized)];
    })
    .default([]),
  mealSlotOptionId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  cuisineOptionId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  proteinTypeOptionId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  recipeBookOptionId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  sourceName: z
    .string()
    .max(500)
    .optional()
    .transform((v) => (v == null || v === '' ? null : v.trim())),
  sourceUrl: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v == null || v === '' ? null : v.trim())),
});

export type SaveMealClassificationInput = z.infer<
  typeof saveClassificationSchema
>;

/** Minimal columns for custom_meals classification (no SELECT *). */
const CUSTOM_MEALS_CLASSIFICATION_COLUMNS =
  'id,meal_slot,meal_slot_option_id,total_minutes,servings,source,source_url,cuisine_option_id,protein_type_option_id,recipe_book_option_id';

/**
 * Load classification for a custom meal (custom_meals only; RLS = user context).
 * Returns minimal columns + tags from recipe_tag_links join recipe_tags.
 */
export async function loadMealClassificationAction(args: {
  mealId: string;
}): Promise<ActionResult<MealClassificationData | null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const mealId = args.mealId?.trim();
    if (!mealId) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'mealId is verplicht',
        },
      };
    }

    const { data: row, error: mealError } = await supabase
      .from('custom_meals')
      .select(CUSTOM_MEALS_CLASSIFICATION_COLUMNS)
      .eq('id', mealId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (mealError) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: mealError.message },
      };
    }

    if (!row) {
      return { ok: true, data: null };
    }

    const { data: tagRows, error: tagsError } = await supabase
      .from('recipe_tag_links')
      .select('recipe_tags(label)')
      .eq('recipe_id', mealId);

    if (tagsError) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: tagsError.message },
      };
    }

    const tags: string[] = (tagRows ?? [])
      .map(
        (r) =>
          (r as unknown as { recipe_tags: { label: string } | null })
            .recipe_tags?.label,
      )
      .filter(
        (label): label is string =>
          typeof label === 'string' && label.length > 0,
      );
    tags.sort((a, b) => a.localeCompare(b));

    let mealSlotLabel: string | null = null;
    const optionId = (row.meal_slot_option_id as string | null) ?? null;
    if (optionId) {
      const { data: opt } = await supabase
        .from('catalog_options')
        .select('label')
        .eq('id', optionId)
        .eq('dimension', 'meal_slot')
        .maybeSingle();
      const label =
        opt && typeof (opt as { label: string }).label === 'string'
          ? (opt as { label: string }).label
          : null;
      if (label) mealSlotLabel = label;
    }

    const data: MealClassificationData = {
      mealId: row.id as string,
      mealSlot:
        (row.meal_slot as MealClassificationData['mealSlot']) ?? 'dinner',
      mealSlotLabel,
      mealSlotOptionId: optionId,
      totalMinutes:
        typeof row.total_minutes === 'number' ? row.total_minutes : null,
      servings: typeof row.servings === 'number' ? row.servings : null,
      sourceName: (row.source as string | null) ?? null,
      sourceUrl: (row.source_url as string | null) ?? null,
      cuisineOptionId: (row.cuisine_option_id as string | null) ?? null,
      proteinTypeOptionId:
        (row.protein_type_option_id as string | null) ?? null,
      recipeBookOptionId: (row.recipe_book_option_id as string | null) ?? null,
      tags,
    };

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Save classification: update custom_meals (meal_slot, total_minutes, servings)
 * and sync tags (upsert recipe_tags, replace recipe_tag_links).
 * Returns the same shape as load so UI can update directly.
 */
export async function saveMealClassificationAction(args: {
  mealId: string;
  classification: SaveMealClassificationInput;
}): Promise<ActionResult<MealClassificationData>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const mealId = args.mealId?.trim();
    if (!mealId) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'mealId is verplicht',
        },
      };
    }

    const parsed = saveClassificationSchema.safeParse(args.classification);
    if (!parsed.success) {
      const msg =
        parsed.error.flatten().formErrors?.[0] ?? parsed.error.message;
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: msg,
        },
      };
    }

    const {
      mealSlot,
      mealSlotOptionId,
      totalMinutes,
      servings,
      tags,
      cuisineOptionId,
      proteinTypeOptionId,
      recipeBookOptionId,
      sourceName,
      sourceUrl,
    } = parsed.data;

    let mealSlotValue: string = mealSlot ?? 'dinner';
    if (mealSlotOptionId) {
      const { data: opt } = await supabase
        .from('catalog_options')
        .select('key')
        .eq('id', mealSlotOptionId)
        .eq('dimension', 'meal_slot')
        .maybeSingle();
      const key =
        opt && typeof (opt as { key: string }).key === 'string'
          ? (opt as { key: string }).key
          : null;
      if (key && (MEAL_SLOT_VALUES as readonly string[]).includes(key)) {
        mealSlotValue = key as (typeof MEAL_SLOT_VALUES)[number];
      } else {
        // Custom option (e.g. bijgerecht): DB only allows breakfast/lunch/dinner/snack/other; store 'other' and keep meal_slot_option_id for display
        mealSlotValue = 'other';
      }
    }

    const { data: existing, error: fetchError } = await supabase
      .from('custom_meals')
      .select('id')
      .eq('id', mealId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: fetchError.message },
      };
    }
    if (!existing) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Recept niet gevonden',
        },
      };
    }

    const { error: updateError } = await supabase
      .from('custom_meals')
      .update({
        meal_slot: mealSlotValue,
        meal_slot_option_id: mealSlotOptionId ?? null,
        total_minutes: totalMinutes,
        servings,
        source: sourceName ?? null,
        source_url: sourceUrl ?? null,
        cuisine_option_id: cuisineOptionId ?? null,
        protein_type_option_id: proteinTypeOptionId ?? null,
        recipe_book_option_id: recipeBookOptionId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', mealId)
      .eq('user_id', user.id);

    if (updateError) {
      const msg =
        updateError.code === 'P0001' ||
        updateError.message?.includes('catalog_options')
          ? 'Ongeldige keuze of geen toegang.'
          : updateError.message;
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: msg },
      };
    }

    const tagIds: string[] = [];
    if (tags.length > 0) {
      const { data: upserted, error: upsertError } = await supabase
        .from('recipe_tags')
        .upsert(
          tags.map((label) => ({ user_id: user.id, label })),
          { onConflict: 'user_id,label' },
        )
        .select('id,label');

      if (upsertError) {
        return {
          ok: false,
          error: { code: 'DB_ERROR', message: upsertError.message },
        };
      }

      const byLabel = new Map<string, string>();
      for (const r of upserted ?? []) {
        byLabel.set((r as { label: string }).label, (r as { id: string }).id);
      }
      for (const label of tags) {
        const id = byLabel.get(label);
        if (id) tagIds.push(id);
      }
    }

    const { error: deleteLinksError } = await supabase
      .from('recipe_tag_links')
      .delete()
      .eq('recipe_id', mealId);

    if (deleteLinksError) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: deleteLinksError.message },
      };
    }

    if (tagIds.length > 0) {
      const { error: insertLinksError } = await supabase
        .from('recipe_tag_links')
        .insert(tagIds.map((tag_id) => ({ recipe_id: mealId, tag_id })));

      if (insertLinksError) {
        return {
          ok: false,
          error: { code: 'DB_ERROR', message: insertLinksError.message },
        };
      }
    }

    // Sync meal_data + ai_analysis and run ingredient recalculation when totalMinutes/servings changed
    const prepServingsResult = await updateRecipePrepTimeAndServingsAction({
      mealId,
      source: 'custom',
      prepTime: totalMinutes,
      servings,
    });
    if (!prepServingsResult.ok) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: prepServingsResult.error.message,
        },
      };
    }

    const loadResult = await loadMealClassificationAction({ mealId });
    if (!loadResult.ok) {
      return loadResult;
    }
    if (loadResult.data == null) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Classificatie opgeslagen maar ophalen mislukt',
        },
      };
    }

    return { ok: true, data: loadResult.data };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}
