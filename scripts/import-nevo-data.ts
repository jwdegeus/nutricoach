#!/usr/bin/env tsx
/**
 * NEVO Data Import Script
 *
 * Imports all NEVO CSV data into Supabase database.
 * Handles pipe-delimited CSV with Dutch comma notation for decimals.
 *
 * Usage: npm run import:nevo
 * Or: tsx scripts/import-nevo-data.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: path.join(process.cwd(), '.env.local') });

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:');
  console.error(
    '   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Convert Dutch comma notation to dot notation (1,8 -> 1.8)
 */
function parseDutchNumber(value: string | undefined): number | null {
  if (!value || value.trim() === '' || value === '""' || value === '') {
    return null;
  }

  // Remove quotes if present
  const cleaned = value.replace(/^"|"$/g, '').trim();

  if (cleaned === '' || cleaned === '0' || cleaned === '""') {
    return null;
  }

  // Replace comma with dot
  const normalized = cleaned.replace(',', '.');

  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Simple CSV parser for pipe-delimited files
 */
function parsePipeDelimitedCSV(csvContent: string): string[][] {
  const lines = csvContent.split('\n').filter((line) => line.trim() !== '');
  const dataRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Parse pipe-delimited line, handling quoted fields
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === '|' && !inQuotes) {
        fields.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField); // Add last field
    dataRows.push(fields);
  }

  return dataRows;
}

/**
 * Parse CSV row and convert to nevo_foods database record
 */
function parseNevoFoodRow(row: string[]): any {
  const record: any = {
    nevo_version: row[0]?.replace(/^"|"$/g, '') || null,
    food_group_nl: row[1]?.replace(/^"|"$/g, '') || null,
    food_group_en: row[2]?.replace(/^"|"$/g, '') || null,
    nevo_code: parseInt(row[3]?.replace(/^"|"$/g, '') || '0', 10),
    name_nl: row[4]?.replace(/^"|"$/g, '') || null,
    name_en: row[5]?.replace(/^"|"$/g, '') || null,
    synonym: row[6]?.replace(/^"|"$/g, '') || null,
    quantity: row[7]?.replace(/^"|"$/g, '') || 'per 100g',
    note: row[8]?.replace(/^"|"$/g, '') || null,
    contains_traces_of: row[9]?.replace(/^"|"$/g, '') || null,
    is_fortified_with: row[10]?.replace(/^"|"$/g, '') || null,

    // Energie en macronutriënten
    energy_kj: parseDutchNumber(row[11]),
    energy_kcal: parseDutchNumber(row[12]),
    water_g: parseDutchNumber(row[13]),
    protein_g: parseDutchNumber(row[14]),
    protein_pl_g: parseDutchNumber(row[15]),
    protein_drl_g: parseDutchNumber(row[16]),
    nitrogen_g: parseDutchNumber(row[17]),
    tryptophan_mg: parseDutchNumber(row[18]),
    fat_g: parseDutchNumber(row[19]),
    fatty_acids_g: parseDutchNumber(row[20]),
    saturated_fat_g: parseDutchNumber(row[21]),
    monounsaturated_fat_g: parseDutchNumber(row[22]),
    polyunsaturated_fat_g: parseDutchNumber(row[23]),
    omega3_fat_g: parseDutchNumber(row[24]),
    omega6_fat_g: parseDutchNumber(row[25]),
    trans_fat_g: parseDutchNumber(row[26]),
    carbs_g: parseDutchNumber(row[27]),
    sugar_g: parseDutchNumber(row[28]),
    free_sugars_g: parseDutchNumber(row[29]),
    starch_g: parseDutchNumber(row[30]),
    polyols_g: parseDutchNumber(row[31]),
    fiber_g: parseDutchNumber(row[32]),
    alcohol_g: parseDutchNumber(row[33]),
    organic_acids_g: parseDutchNumber(row[34]),
    ash_g: parseDutchNumber(row[35]),

    // Mineralen en spoorelementen
    cholesterol_mg: parseDutchNumber(row[36]),
    sodium_mg: parseDutchNumber(row[37]),
    potassium_mg: parseDutchNumber(row[38]),
    calcium_mg: parseDutchNumber(row[39]),
    phosphorus_mg: parseDutchNumber(row[40]),
    magnesium_mg: parseDutchNumber(row[41]),
    iron_mg: parseDutchNumber(row[42]),
    iron_haem_mg: parseDutchNumber(row[43]),
    iron_non_haem_mg: parseDutchNumber(row[44]),
    copper_mg: parseDutchNumber(row[45]),
    selenium_ug: parseDutchNumber(row[46]),
    zinc_mg: parseDutchNumber(row[47]),
    iodine_ug: parseDutchNumber(row[48]),

    // Vitamines (vetoplosbaar)
    vit_a_rae_ug: parseDutchNumber(row[49]),
    vit_a_re_ug: parseDutchNumber(row[50]),
    retinol_ug: parseDutchNumber(row[51]),
    beta_carotene_total_ug: parseDutchNumber(row[52]),
    alpha_carotene_ug: parseDutchNumber(row[53]),
    lutein_ug: parseDutchNumber(row[54]),
    zeaxanthin_ug: parseDutchNumber(row[55]),
    beta_cryptoxanthin_ug: parseDutchNumber(row[56]),
    lycopene_ug: parseDutchNumber(row[57]),
    vit_d_ug: parseDutchNumber(row[58]),
    vit_d3_ug: parseDutchNumber(row[59]),
    vit_d2_ug: parseDutchNumber(row[60]),
    vit_e_mg: parseDutchNumber(row[61]),
    alpha_tocopherol_mg: parseDutchNumber(row[62]),
    beta_tocopherol_mg: parseDutchNumber(row[63]),
    delta_tocopherol_mg: parseDutchNumber(row[64]),
    gamma_tocopherol_mg: parseDutchNumber(row[65]),
    vit_k_ug: parseDutchNumber(row[66]),
    vit_k1_ug: parseDutchNumber(row[67]),
    vit_k2_ug: parseDutchNumber(row[68]),

    // Vitamines (wateroplosbaar)
    vit_b1_mg: parseDutchNumber(row[69]),
    vit_b2_mg: parseDutchNumber(row[70]),
    vit_b6_mg: parseDutchNumber(row[71]),
    vit_b12_ug: parseDutchNumber(row[72]),
    niacin_equiv_mg: parseDutchNumber(row[73]),
    niacin_mg: parseDutchNumber(row[74]),
    folate_equiv_ug: parseDutchNumber(row[75]),
    folate_ug: parseDutchNumber(row[76]),
    folic_acid_ug: parseDutchNumber(row[77]),
    vit_c_mg: parseDutchNumber(row[78]),
  };

  return record;
}

/**
 * Parse recipe ingredients row
 */
function parseRecipeRow(row: string[]): any {
  return {
    nevo_version: row[0]?.replace(/^"|"$/g, '') || null,
    recipe_nevo_code: parseInt(row[1]?.replace(/^"|"$/g, '') || '0', 10),
    recipe_name_nl: row[2]?.replace(/^"|"$/g, '') || null,
    recipe_name_en: row[3]?.replace(/^"|"$/g, '') || null,
    ingredient_nevo_code: parseInt(row[4]?.replace(/^"|"$/g, '') || '0', 10),
    ingredient_name_nl: row[5]?.replace(/^"|"$/g, '') || null,
    ingredient_name_en: row[6]?.replace(/^"|"$/g, '') || null,
    relative_amount: parseDutchNumber(row[7]) || 0,
  };
}

/**
 * Parse nutrients row
 */
function parseNutrientRow(row: string[]): any {
  return {
    nutrient_group_nl: row[0]?.replace(/^"|"$/g, '') || null,
    nutrient_group_en: row[1]?.replace(/^"|"$/g, '') || null,
    nutrient_code: row[2]?.replace(/^"|"$/g, '') || null,
    nutrient_name_nl: row[3]?.replace(/^"|"$/g, '') || null,
    nutrient_name_en: row[4]?.replace(/^"|"$/g, '') || null,
    unit: row[5]?.replace(/^"|"$/g, '') || null,
  };
}

/**
 * Parse references row
 */
function parseReferenceRow(row: string[]): any {
  // The references file has a pipe-delimited format: source_code|reference
  // But the header might be malformed, so we handle it carefully
  if (row.length < 2) {
    return null;
  }

  const sourceCode = row[0]?.replace(/^"|"$/g, '').trim() || '';
  // Join remaining fields as reference (in case reference contains pipes)
  const reference =
    row
      .slice(1)
      .map((f) => f.replace(/^"|"$/g, ''))
      .join('|')
      .trim() || null;

  if (!sourceCode) {
    return null;
  }

  return {
    source_code: sourceCode,
    reference: reference,
  };
}

/**
 * Import NEVO foods from CSV
 */
async function importNevoFoods() {
  const csvPath = path.join(process.cwd(), 'temp', 'NEVO2025_v9.0.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    return false;
  }

  console.log('📖 Reading NEVO foods CSV...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parsePipeDelimitedCSV(csvContent);

  // Skip header row
  const dataRows = rows.slice(1);
  const totalRows = dataRows.length;

  console.log(`📊 Found ${totalRows} food items to import`);

  const batchSize = 100;
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < totalRows; i += batchSize) {
    const batch = dataRows.slice(i, i + batchSize);
    const records = batch.map(parseNevoFoodRow).filter((r) => r.nevo_code > 0);

    console.log(
      `📦 Importing foods batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalRows / batchSize)} (${records.length} items)...`,
    );

    const { error } = await supabase.from('nevo_foods').upsert(records, {
      onConflict: 'nevo_code',
      ignoreDuplicates: false,
    });

    if (error) {
      console.error(`❌ Error importing batch:`, error);
      errors += records.length;
    } else {
      imported += records.length;
      console.log(`✅ Imported ${imported}/${totalRows} food items`);
    }
  }

  console.log(
    `\n✨ Foods import complete: ${imported} items imported, ${errors} errors`,
  );
  return errors === 0;
}

/**
 * Import recipe ingredients from CSV
 */
async function importRecipeIngredients() {
  const csvPath = path.join(
    process.cwd(),
    'temp',
    'NEVO2025_v9.0_Recepten_Recipes.csv',
  );

  if (!fs.existsSync(csvPath)) {
    console.log(`⚠️  Recipe CSV not found: ${csvPath} - skipping`);
    return true;
  }

  console.log('\n📖 Reading recipe ingredients CSV...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parsePipeDelimitedCSV(csvContent);

  // Skip header row
  const dataRows = rows.slice(1);
  const totalRows = dataRows.length;

  console.log(`📊 Found ${totalRows} recipe ingredient entries to import`);

  const batchSize = 500;
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < totalRows; i += batchSize) {
    const batch = dataRows.slice(i, i + batchSize);
    const records = batch
      .map(parseRecipeRow)
      .filter((r) => r.recipe_nevo_code > 0 && r.ingredient_nevo_code > 0);

    console.log(
      `📦 Importing recipes batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalRows / batchSize)} (${records.length} items)...`,
    );

    const { error } = await supabase
      .from('nevo_recipe_ingredients')
      .upsert(records, {
        onConflict: 'id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`❌ Error importing batch:`, error);
      errors += records.length;
    } else {
      imported += records.length;
      console.log(`✅ Imported ${imported}/${totalRows} recipe ingredients`);
    }
  }

  console.log(
    `\n✨ Recipe ingredients import complete: ${imported} items imported, ${errors} errors`,
  );
  return errors === 0;
}

/**
 * Import nutrients definitions from CSV
 */
async function importNutrients() {
  const csvPath = path.join(
    process.cwd(),
    'temp',
    'NEVO2025_v9.0_Nutrienten_Nutrients.csv',
  );

  if (!fs.existsSync(csvPath)) {
    console.log(`⚠️  Nutrients CSV not found: ${csvPath} - skipping`);
    return true;
  }

  console.log('\n📖 Reading nutrients CSV...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parsePipeDelimitedCSV(csvContent);

  // Skip header row
  const dataRows = rows.slice(1);
  const totalRows = dataRows.length;

  console.log(`📊 Found ${totalRows} nutrient definitions to import`);

  const allRecords = dataRows
    .map(parseNutrientRow)
    .filter((r) => r.nutrient_code);

  // Remove duplicates based on nutrient_code
  const uniqueRecords = Array.from(
    new Map(allRecords.map((r) => [r.nutrient_code, r])).values(),
  );

  console.log(
    `📦 Importing ${uniqueRecords.length} unique nutrient definitions (${allRecords.length - uniqueRecords.length} duplicates removed)...`,
  );

  const { error } = await supabase
    .from('nevo_nutrients')
    .upsert(uniqueRecords, {
      onConflict: 'nutrient_code',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error(`❌ Error importing nutrients:`, error);
    return false;
  }

  console.log(
    `\n✨ Nutrients import complete: ${uniqueRecords.length} items imported`,
  );
  return true;
}

/**
 * Import references from CSV
 */
async function importReferences() {
  const csvPath = path.join(
    process.cwd(),
    'temp',
    'NEVO2025_v9.0_Referenties_References.csv',
  );

  if (!fs.existsSync(csvPath)) {
    console.log(`⚠️  References CSV not found: ${csvPath} - skipping`);
    return true;
  }

  console.log('\n📖 Reading references CSV...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parsePipeDelimitedCSV(csvContent);

  // Skip header row
  const dataRows = rows.slice(1);
  const totalRows = dataRows.length;

  console.log(`📊 Found ${totalRows} references to import`);

  const batchSize = 500;
  let imported = 0;
  let errors = 0;

  // First, collect all records and remove duplicates
  const allRecords = dataRows
    .map(parseReferenceRow)
    .filter((r) => r !== null && r !== undefined && r.source_code);
  const uniqueRecords = Array.from(
    new Map(allRecords.map((r) => [r.source_code, r])).values(),
  );

  console.log(
    `📊 Processing ${uniqueRecords.length} unique references (${allRecords.length - uniqueRecords.length} duplicates removed)...`,
  );

  for (let i = 0; i < uniqueRecords.length; i += batchSize) {
    const batch = uniqueRecords.slice(i, i + batchSize);

    console.log(
      `📦 Importing references batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueRecords.length / batchSize)} (${batch.length} items)...`,
    );

    const { error } = await supabase.from('nevo_references').upsert(batch, {
      onConflict: 'source_code',
      ignoreDuplicates: false,
    });

    if (error) {
      console.error(`❌ Error importing batch:`, error);
      errors += batch.length;
    } else {
      imported += batch.length;
      console.log(`✅ Imported ${imported}/${uniqueRecords.length} references`);
    }
  }

  console.log(
    `\n✨ References import complete: ${imported} items imported, ${errors} errors`,
  );
  return errors === 0;
}

/**
 * Main import function
 */
async function importAllNevoData() {
  console.log('🚀 Starting NEVO data import...\n');

  const results = {
    foods: await importNevoFoods(),
    recipes: await importRecipeIngredients(),
    nutrients: await importNutrients(),
    references: await importReferences(),
  };

  console.log('\n' + '='.repeat(50));
  console.log('📊 Import Summary:');
  console.log('='.repeat(50));
  console.log(`Foods:        ${results.foods ? '✅' : '❌'}`);
  console.log(`Recipes:     ${results.recipes ? '✅' : '❌'}`);
  console.log(`Nutrients:   ${results.nutrients ? '✅' : '❌'}`);
  console.log(`References:  ${results.references ? '✅' : '❌'}`);
  console.log('='.repeat(50));

  const allSuccess = Object.values(results).every((r) => r === true);

  if (allSuccess) {
    console.log('\n🎉 All imports completed successfully!');
  } else {
    console.log('\n⚠️  Some imports had errors. Check the logs above.');
  }

  return allSuccess;
}

// Run import
importAllNevoData()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
