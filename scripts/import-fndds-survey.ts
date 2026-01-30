#!/usr/bin/env tsx
/**
 * FNDDS Survey Foods ingest (JSON snapshot)
 *
 * Imports USDA FNDDS (Food and Nutrient Database for Dietary Studies) survey foods
 * from local JSON (e.g. surveyDownload.json) into fndds_survey_foods.
 * No API calls. Idempotent upsert on fdc_id. Provenance: dataset_filename, ingested_at, raw_hash.
 *
 * Usage: npm run import:fndds-survey
 * Or: tsx scripts/import-fndds-survey.ts
 * Optional: FNDDS_JSON_PATH=/path/to/file.json npm run import:fndds-survey
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
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

const DEFAULT_JSON_PATH = path.join(
  process.cwd(),
  'temp',
  'surveyDownload.json',
);

const BATCH_SIZE = 500;
const PROGRESS_EVERY = 1000;

type FnddsSurveyFoodRaw = {
  fdcId?: number;
  description?: string;
  foodCode?: number;
  foodClass?: string;
  wweiaFoodCategory?: { description?: string } | string;
  foodNutrients?: unknown[];
  [key: string]: unknown;
};

type FnddsSurveyFoodRow = {
  fdc_id: number;
  description: string;
  food_code: number | null;
  food_class: string | null;
  wweia_food_category: string | null;
  food_nutrients: unknown;
  dataset_filename: string;
  ingested_at: string;
  raw_hash: string | null;
};

function hashRaw(item: FnddsSurveyFoodRaw): string {
  return createHash('sha256')
    .update(JSON.stringify(item))
    .digest('hex')
    .slice(0, 32);
}

function parseFoodToRow(
  item: FnddsSurveyFoodRaw,
  datasetFilename: string,
  ingestedAt: string,
): FnddsSurveyFoodRow | null {
  const fdcId =
    typeof item.fdcId === 'number' ? item.fdcId : Number(item.fdcId);
  if (!Number.isInteger(fdcId) || fdcId <= 0) return null;

  const description =
    typeof item.description === 'string' && item.description.trim()
      ? item.description.trim()
      : null;
  if (!description) return null;

  const foodCode =
    typeof item.foodCode === 'number' ? item.foodCode : Number(item.foodCode);
  const wweia = item.wweiaFoodCategory;
  const wweiaText =
    typeof wweia === 'string'
      ? wweia
      : wweia &&
          typeof wweia === 'object' &&
          wweia !== null &&
          'description' in wweia
        ? ((wweia as { description?: string }).description ?? null)
        : null;

  return {
    fdc_id: fdcId,
    description,
    food_code: Number.isInteger(foodCode) ? foodCode : null,
    food_class: typeof item.foodClass === 'string' ? item.foodClass : null,
    wweia_food_category: typeof wweiaText === 'string' ? wweiaText : null,
    food_nutrients: Array.isArray(item.foodNutrients) ? item.foodNutrients : [],
    dataset_filename: datasetFilename,
    ingested_at: ingestedAt,
    raw_hash: hashRaw(item),
  };
}

async function runIngest() {
  const jsonPath = process.env.FNDDS_JSON_PATH ?? DEFAULT_JSON_PATH;

  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ JSON file not found: ${jsonPath}`);
    process.exit(1);
  }

  const datasetFilename = path.basename(jsonPath);
  const ingestedAt = new Date().toISOString();

  console.log(`📖 Reading FNDDS Survey JSON: ${jsonPath}`);
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw) as
    | { SurveyFoods?: FnddsSurveyFoodRaw[] }
    | FnddsSurveyFoodRaw[];

  const items = Array.isArray(data)
    ? data
    : ((data as { SurveyFoods?: FnddsSurveyFoodRaw[] }).SurveyFoods ?? []);
  const total = items.length;
  console.log(`📊 Found ${total} food items in SurveyFoods array`);

  let processed = 0;
  let upserted = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const rows: FnddsSurveyFoodRow[] = [];

    for (const item of batch) {
      const row = parseFoodToRow(item, datasetFilename, ingestedAt);
      if (row) rows.push(row);
      else skipped += 1;
    }

    if (rows.length === 0) {
      processed += batch.length;
      if (
        (i + batch.length) % PROGRESS_EVERY === 0 ||
        i + batch.length >= total
      ) {
        console.log(
          `📦 Progress: ${Math.min(i + batch.length, total)}/${total} processed`,
        );
      }
      continue;
    }

    const { error } = await supabase
      .from('fndds_survey_foods')
      .upsert(rows, { onConflict: 'fdc_id', ignoreDuplicates: false });

    if (error) {
      console.error(`❌ Batch error at offset ${i}:`, error.message);
      errors += rows.length;
    } else {
      upserted += rows.length;
    }

    processed += batch.length;

    if (processed % PROGRESS_EVERY === 0 || processed === total) {
      console.log(
        `📦 Progress: ${processed}/${total} processed, ${upserted} upserted`,
      );
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 FNDDS Survey ingest summary');
  console.log('='.repeat(50));
  console.log(`Processed: ${processed}`);
  console.log(`Upserted:  ${upserted}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Errors:    ${errors}`);
  console.log('='.repeat(50));

  if (errors > 0) {
    process.exit(1);
  }
}

runIngest().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
