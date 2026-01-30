#!/usr/bin/env tsx
/**
 * Normalize FNDDS Survey food_nutrients JSONB into fndds_survey_food_nutrients_normalized.
 * Reads from fndds_survey_foods in batches; idempotent upsert on (fdc_id, nutrient_source_key).
 * No API calls. No NEVO or canonical tables touched.
 *
 * Per-100g: FNDDS Survey nutrient values in food_nutrients are per 100g (USDA convention).
 * We set amount_per_100g = amount. If a nutrient had a per-serving basis (gramWeight on
 * portion), we would use foodPortions.gramWeight and set amount_per_100g = amount / gramWeight * 100;
 * the current JSON shape does not attach portion to each nutrient, so we do not have that path.
 *
 * Usage: npm run normalize:fndds-nutrients
 * Or: tsx scripts/normalize-fndds-nutrients.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    '❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BATCH_SIZE_FOODS = 300;
const PROGRESS_EVERY = 500;

/** FNDDS food_nutrients array item shape (from SurveyFoods JSON). */
type FoodNutrientItem = {
  id?: number;
  nutrient?: {
    id?: number;
    number?: string;
    name?: string;
    unitName?: string;
  };
  amount?: number;
  median?: number;
  foodNutrientDerivation?: { code?: string; description?: string };
  [key: string]: unknown;
};

type NormalizedRow = {
  fdc_id: number;
  nutrient_source_key: string;
  nutrient_name: string | null;
  unit: string;
  amount: number | null;
  amount_per_100g: number | null;
  derivation: string | null;
  raw: Record<string, unknown> | null;
};

/**
 * Choose stable identifier: nutrient.id (prefer) -> nutrient.number -> "name:unit" (fallback).
 */
function nutrientSourceKey(
  n: FoodNutrientItem,
  name: string,
  unit: string,
): { key: string; warn: boolean } {
  const nut = n.nutrient;
  if (nut == null) return { key: `${name}:${unit}`, warn: true };
  const id = nut.id;
  if (id != null && Number.isInteger(id))
    return { key: String(id), warn: false };
  const num = nut.number;
  if (typeof num === 'string' && num.trim())
    return { key: num.trim(), warn: false };
  return { key: `${(name || 'unknown').trim()}:${unit}`, warn: true };
}

function parseNutrient(
  fdcId: number,
  item: FoodNutrientItem,
): NormalizedRow | null {
  const nut = item.nutrient;
  const name = nut?.name != null ? String(nut.name).trim() : '';
  const unit =
    nut?.unitName != null && String(nut.unitName).trim()
      ? String(nut.unitName).trim()
      : 'g';

  const { key: nutrient_source_key, warn } = nutrientSourceKey(
    item,
    name,
    unit,
  );
  if (warn) {
    console.warn(
      `[normalize] Fallback key for fdc_id=${fdcId}: "${nutrient_source_key}"`,
    );
  }

  const amount =
    item.amount != null && typeof item.amount === 'number'
      ? item.amount
      : item.median != null && typeof item.median === 'number'
        ? item.median
        : null;

  // FNDDS Survey amounts are per 100g (USDA). No per-nutrient gramWeight in this JSON shape.
  const amount_per_100g = amount;

  const derivation =
    item.foodNutrientDerivation?.code != null
      ? String(item.foodNutrientDerivation.code).trim()
      : item.foodNutrientDerivation?.description != null
        ? String(item.foodNutrientDerivation.description).trim()
        : null;

  const raw: Record<string, unknown> = {
    id: item.id,
    nutrient: nut,
    amount: item.amount ?? item.median,
    foodNutrientDerivation: item.foodNutrientDerivation,
  };

  return {
    fdc_id: fdcId,
    nutrient_source_key,
    nutrient_name: name || null,
    unit,
    amount,
    amount_per_100g,
    derivation: derivation || null,
    raw,
  };
}

async function run() {
  let offset = 0;
  let foodsProcessed = 0;
  let nutrientRowsUpserted = 0;
  let errors = 0;

  console.log('📖 Fetching FNDDS survey foods in batches...');

  while (true) {
    const { data: foods, error: fetchError } = await supabase
      .from('fndds_survey_foods')
      .select('fdc_id, food_nutrients')
      .range(offset, offset + BATCH_SIZE_FOODS - 1)
      .order('fdc_id', { ascending: true });

    if (fetchError) {
      console.error('❌ Fetch error:', fetchError.message);
      process.exit(1);
    }

    if (!foods?.length) break;

    const rows: NormalizedRow[] = [];

    for (const food of foods) {
      const fdcId = food.fdc_id;
      const arr = food.food_nutrients;
      if (!Array.isArray(arr)) {
        foodsProcessed += 1;
        continue;
      }

      for (const item of arr as FoodNutrientItem[]) {
        const row = parseNutrient(fdcId, item);
        if (row) rows.push(row);
      }
      foodsProcessed += 1;
    }

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from('fndds_survey_food_nutrients_normalized')
        .upsert(rows, { onConflict: 'fdc_id,nutrient_source_key' });

      if (upsertError) {
        console.error(
          `❌ Upsert error at offset ${offset}:`,
          upsertError.message,
        );
        errors += rows.length;
      } else {
        nutrientRowsUpserted += rows.length;
      }
    }

    offset += foods.length;

    if (
      foodsProcessed % PROGRESS_EVERY === 0 ||
      foods.length < BATCH_SIZE_FOODS
    ) {
      console.log(
        `📦 Progress: ${foodsProcessed} foods processed, ${nutrientRowsUpserted} nutrient rows upserted`,
      );
    }

    if (foods.length < BATCH_SIZE_FOODS) break;
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 FNDDS nutrients normalize summary');
  console.log('='.repeat(50));
  console.log(`Foods processed:     ${foodsProcessed}`);
  console.log(`Nutrient rows:       ${nutrientRowsUpserted}`);
  console.log(`Errors:              ${errors}`);
  console.log('='.repeat(50));

  if (errors > 0) process.exit(1);
}

run().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
