#!/usr/bin/env tsx
/**
 * Map FNDDS Survey normalized nutrients → fndds_survey_food_nutrients_mapped (internal keys).
 * Reads fndds_survey_food_nutrients_normalized in batches; lookup nutrient_source_mappings;
 * only mapped + unit-matched rows are written. Idempotent upsert on (fdc_id, internal_nutrient_key).
 *
 * No derived nutrients, no fallback on nutrient.number, no implicit unit conversion.
 *
 * Usage: npm run map:fndds-nutrients
 * Or: tsx scripts/map-fndds-nutrients.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import { config } from 'dotenv';
import { canonicalizeUnit } from '../src/lib/nutrition/units';

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

const SOURCE = 'fndds_survey';
// Supabase/PostgREST often cap at 1000 rows per request; use 1000 for stable paging
const BATCH_SIZE = 1000;
const PROGRESS_EVERY = 10000;

/** Only these units participate in numeric conversion; all others → skip (unit_convert_failed). */
const MASS_UNITS = new Set<string>(['g', 'mg', 'ug']);

/** Per 100g: skip if |amount| in µg-equivalent exceeds this (guards against bad data / wrong unit). */
const OUTLIER_UG_PER_100G_MAX = 1e9;

type MappingRow = {
  nutrient_source_key: string;
  internal_nutrient_key: string;
  source_unit: string;
  internal_unit: string;
  multiplier: number;
};

type NormalizedRow = {
  fdc_id: number;
  nutrient_source_key: string;
  unit: string;
  amount_per_100g: number | null;
};

type MappedRow = {
  fdc_id: number;
  internal_nutrient_key: string;
  internal_unit: string;
  amount_per_100g: number;
  source: string;
  nutrient_source_key: string;
};

/**
 * Convert amount from row unit to mapping source unit.
 * Allowed ONLY when both units are in { g, mg, ug }. Other units return null (caller counts unit_convert_failed).
 * Explicit mass conversion table: g↔mg (×1000/÷1000), mg↔ug (×1000/÷1000), g↔ug (×1e6/÷1e6).
 */
function convertToSourceUnit(
  rowUnitNorm: string,
  amount: number,
  sourceUnitNorm: string,
): number | null {
  if (rowUnitNorm === sourceUnitNorm) return amount;
  if (!MASS_UNITS.has(rowUnitNorm) || !MASS_UNITS.has(sourceUnitNorm))
    return null;
  // g ↔ mg
  if (sourceUnitNorm === 'g' && rowUnitNorm === 'mg') return amount / 1000;
  if (sourceUnitNorm === 'mg' && rowUnitNorm === 'g') return amount * 1000;
  // mg ↔ ug
  if (sourceUnitNorm === 'mg' && rowUnitNorm === 'ug') return amount / 1000;
  if (sourceUnitNorm === 'ug' && rowUnitNorm === 'mg') return amount * 1000;
  // g ↔ ug
  if (sourceUnitNorm === 'g' && rowUnitNorm === 'ug') return amount / 1e6;
  if (sourceUnitNorm === 'ug' && rowUnitNorm === 'g') return amount * 1e6;
  return null;
}

/** Convert amount in given mass unit to µg-equivalent for outlier check. */
function toUgEquivalent(amount: number, unit: string): number {
  if (unit === 'ug') return amount;
  if (unit === 'mg') return amount * 1000;
  if (unit === 'g') return amount * 1e6;
  return amount;
}

async function run() {
  // 1) Load mappings once (small table)
  console.log(
    '📖 Loading nutrient_source_mappings (source=fndds_survey, is_active=true)...',
  );
  const { data: mappings, error: mapErr } = await supabase
    .from('nutrient_source_mappings')
    .select(
      'nutrient_source_key, internal_nutrient_key, source_unit, internal_unit, multiplier',
    )
    .eq('source', SOURCE)
    .eq('is_active', true);

  if (mapErr) {
    console.error('❌ Failed to load mappings:', mapErr.message);
    process.exit(1);
  }

  const mapByKey = new Map<string, MappingRow>();
  for (const row of mappings ?? []) {
    mapByKey.set(row.nutrient_source_key, row as MappingRow);
  }
  console.log(`   Loaded ${mapByKey.size} mappings`);

  let offset = 0;
  let processedRows = 0;
  let upserted = 0;
  let unmapped = 0;
  let missingAmount = 0;
  let unitMismatch = 0;
  let unitConverted = 0;
  let unitConvertFailed = 0;
  let unitOutlierSkipped = 0;
  let errors = 0;
  const mismatchSamples = new Map<string, string>(); // "key|unit" -> mapping.source_unit (max 20)
  const conversionSamples = new Map<string, string>(); // "key|rowUnit→sourceUnit" (max 10)
  const outlierSamples = new Map<string, number>(); // "fdc_id|key|amount" -> ugEquivalent (max 10)

  console.log(
    '📖 Reading fndds_survey_food_nutrients_normalized in batches...',
  );

  while (true) {
    const { data: rows, error: fetchErr } = await supabase
      .from('fndds_survey_food_nutrients_normalized')
      .select('fdc_id, nutrient_source_key, unit, amount_per_100g')
      .range(offset, offset + BATCH_SIZE - 1)
      .order('fdc_id', { ascending: true })
      .order('nutrient_source_key', { ascending: true });

    if (fetchErr) {
      console.error('❌ Fetch error:', fetchErr.message);
      process.exit(1);
    }

    if (!rows?.length) break;

    const toUpsert: MappedRow[] = [];

    for (const row of rows as NormalizedRow[]) {
      processedRows += 1;

      const mapping = mapByKey.get(row.nutrient_source_key);
      if (!mapping) {
        unmapped += 1;
        continue;
      }

      if (row.amount_per_100g == null) {
        missingAmount += 1;
        continue;
      }

      const sourceUnitNorm = canonicalizeUnit(mapping.source_unit);
      const rowUnitNorm = canonicalizeUnit(row.unit);
      if (rowUnitNorm == null || sourceUnitNorm == null) {
        unitMismatch += 1;
        const sampleKey = `${row.nutrient_source_key}|${row.unit}`;
        if (mismatchSamples.size < 20 && !mismatchSamples.has(sampleKey)) {
          mismatchSamples.set(sampleKey, mapping.source_unit);
        }
        continue;
      }
      const amountInSourceUnit = convertToSourceUnit(
        rowUnitNorm,
        Number(row.amount_per_100g),
        sourceUnitNorm,
      );
      if (amountInSourceUnit == null) {
        unitConvertFailed += 1;
        const sampleKey = `${row.nutrient_source_key}|${row.unit}`;
        if (mismatchSamples.size < 20 && !mismatchSamples.has(sampleKey)) {
          mismatchSamples.set(sampleKey, mapping.source_unit);
        }
        continue;
      }

      if (rowUnitNorm !== sourceUnitNorm) {
        unitConverted += 1;
        const convKey = `${row.nutrient_source_key}|${row.unit}→${mapping.source_unit}`;
        if (conversionSamples.size < 10 && !conversionSamples.has(convKey)) {
          conversionSamples.set(convKey, String(amountInSourceUnit));
        }
      }

      if (MASS_UNITS.has(sourceUnitNorm)) {
        const ugEq = toUgEquivalent(amountInSourceUnit, sourceUnitNorm);
        if (Math.abs(ugEq) > OUTLIER_UG_PER_100G_MAX) {
          unitOutlierSkipped += 1;
          const outKey = `${row.fdc_id}|${row.nutrient_source_key}|${amountInSourceUnit}`;
          if (outlierSamples.size < 10 && !outlierSamples.has(outKey)) {
            outlierSamples.set(outKey, ugEq);
          }
          continue;
        }
      }

      const mappedAmount = amountInSourceUnit * Number(mapping.multiplier);
      toUpsert.push({
        fdc_id: row.fdc_id,
        internal_nutrient_key: mapping.internal_nutrient_key,
        internal_unit: mapping.internal_unit,
        amount_per_100g: mappedAmount,
        source: SOURCE,
        nutrient_source_key: row.nutrient_source_key,
      });
    }

    // Deduplicate by (fdc_id, internal_nutrient_key): multiple FNDDS source keys can map to same internal key (e.g. 1177 and 1190 -> folate_equiv_ug). Keep last per key.
    const byKey = new Map<string, MappedRow>();
    for (const r of toUpsert) {
      byKey.set(`${r.fdc_id}\t${r.internal_nutrient_key}`, r);
    }
    const deduped = Array.from(byKey.values());

    if (deduped.length > 0) {
      const { error: upsertErr } = await supabase
        .from('fndds_survey_food_nutrients_mapped')
        .upsert(deduped, { onConflict: 'fdc_id,internal_nutrient_key' });

      if (upsertErr) {
        console.error(
          `❌ Upsert error at offset ${offset}:`,
          upsertErr.message,
        );
        errors += deduped.length;
      } else {
        upserted += deduped.length;
      }
    }

    offset += rows.length;

    if (processedRows % PROGRESS_EVERY === 0 || rows.length < BATCH_SIZE) {
      console.log(
        `📦 Progress: ${processedRows} processed, ${upserted} upserted, unmapped=${unmapped}, converted=${unitConverted}, convert_failed=${unitConvertFailed}, outlier_skipped=${unitOutlierSkipped}`,
      );
    }

    if (rows.length < BATCH_SIZE) break;
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 FNDDS map nutrients summary');
  console.log('='.repeat(50));
  console.log(`Processed rows:     ${processedRows}`);
  console.log(`Upserted:           ${upserted}`);
  console.log(`Unmapped:           ${unmapped}`);
  console.log(`Missing amount:    ${missingAmount}`);
  console.log(`Unit mismatch:     ${unitMismatch}`);
  console.log(`Unit converted:    ${unitConverted}`);
  console.log(`Unit convert fail: ${unitConvertFailed}`);
  console.log(`Unit outlier skip: ${unitOutlierSkipped}`);
  console.log(`Errors:            ${errors}`);
  if (mismatchSamples.size > 0) {
    console.log(
      '   Sample mismatches (nutrient_source_key|row.unit → mapping.source_unit):',
    );
    for (const [keyUnit, expectedUnit] of mismatchSamples) {
      console.log(`   ${keyUnit} → expected "${expectedUnit}"`);
    }
  }
  if (conversionSamples.size > 0) {
    console.log('   Sample conversions (key|rowUnit→sourceUnit = amount):');
    for (const [convKey, amt] of conversionSamples) {
      console.log(`   ${convKey} = ${amt}`);
    }
  }
  if (outlierSamples.size > 0) {
    console.log('   Sample outliers (fdc_id|key|amount → µg-equiv):');
    for (const [outKey, ugEq] of outlierSamples) {
      console.log(`   ${outKey} → ${ugEq}`);
    }
  }
  console.log('='.repeat(50));

  if (errors > 0) process.exit(1);
}

run().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
