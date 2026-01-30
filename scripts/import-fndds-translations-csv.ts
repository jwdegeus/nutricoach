#!/usr/bin/env tsx
/**
 * Import FNDDS Dutch translations from a CSV file.
 *
 * You put the CSV in the temp folder; the script matches on the English name
 * (fndds_survey_foods.description) and writes the Dutch name to
 * fndds_survey_food_translations.display_name (locale nl-NL).
 *
 * CSV format:
 *   - First row = headers. Script looks for a column with the English name
 *     (header containing "eng", "en", or "description") and one with the Dutch
 *     name (header containing "nl", "dutch", "nederland", or "display").
 *   - If you don't use headers, use a file with exactly two columns: English, Dutch.
 *
 * Usage:
 *   Place your file at:  temp/translation.csv
 *   Run:                 npm run import:fndds-translations-csv
 *
 *   Or pass a path:      npx tsx scripts/import-fndds-translations-csv.ts temp/translation.csv
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    '❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const DEFAULT_CSV_PATH = path.join(process.cwd(), 'temp', 'translation.csv');
const FNDDS_LOCALE = 'nl-NL';
const DB_PAGE_SIZE = 1000; // Supabase default limit; we paginate to get all rows

/** Parse one CSV/DSV line; supports quoted fields. Delimiter: , or ; */
function parseCsvLine(line: string, delimiter: string = ','): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i += 1;
      let field = '';
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\') {
          i += 1;
          if (i < line.length) field += line[i];
          i += 1;
          continue;
        }
        field += line[i];
        i += 1;
      }
      if (i < line.length) i += 1; // skip closing "
      out.push(field.trim());
      continue;
    }
    let field = '';
    while (i < line.length && line[i] !== delimiter) {
      field += line[i];
      i += 1;
    }
    out.push(field.trim());
    i += 1;
  }
  return out;
}

/** Detect delimiter: semicolon if first line has more columns when split by ; */
function detectDelimiter(firstLine: string): string {
  const byComma = firstLine.split(',').length;
  const bySemicolon = firstLine.split(';').length;
  return bySemicolon >= byComma && bySemicolon >= 2 ? ';' : ',';
}

function detectColumnIndices(headers: string[]): {
  fdcIdIdx: number | null;
  enIdx: number;
  nlIdx: number;
} {
  const lower = headers.map((h) => h.toLowerCase());
  let fdcIdIdx: number | null = null;
  let enIdx = -1;
  let nlIdx = -1;
  for (let i = 0; i < lower.length; i++) {
    const h = lower[i];
    if (
      fdcIdIdx === null &&
      (h === 'fdc_id' ||
        h === 'fdc id' ||
        h === 'fdcid' ||
        (h.includes('fdc') && h.includes('id')))
    ) {
      fdcIdIdx = i;
    }
    if (
      enIdx === -1 &&
      (h.includes('eng') ||
        h === 'description' ||
        h === 'en' ||
        h === 'english')
    ) {
      enIdx = i;
    }
    if (
      nlIdx === -1 &&
      (h.includes('nl') ||
        h.includes('dutch') ||
        h.includes('nederland') ||
        h.includes('display') ||
        h === 'dutch' ||
        h === 'nederlands')
    ) {
      nlIdx = i;
    }
  }
  if (enIdx === -1) enIdx = 0;
  if (nlIdx === -1) nlIdx = 1;
  return { fdcIdIdx, enIdx, nlIdx };
}

async function main() {
  const csvPath =
    process.argv[2] ?? process.env.FNDDS_TRANSLATIONS_CSV ?? DEFAULT_CSV_PATH;
  const resolved = path.resolve(process.cwd(), csvPath);

  if (!fs.existsSync(resolved)) {
    console.error(`❌ Bestand niet gevonden: ${resolved}`);
    console.error(
      '   Zet je CSV in temp/translation.csv of geef het pad als argument.',
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(resolved, 'utf-8');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    console.error('❌ CSV is leeg.');
    process.exit(1);
  }

  const delimiter = detectDelimiter(lines[0]);
  if (delimiter === ';') {
    console.log('   Scheidingsteken: puntkomma (;)');
  }

  const firstRow = parseCsvLine(lines[0], delimiter);
  const firstLower = firstRow[0]?.toLowerCase() ?? '';
  const hasHeader =
    firstRow.length >= 2 &&
    (firstLower.includes('fdc') ||
      firstLower.includes('eng') ||
      firstLower.includes('description') ||
      firstLower.includes('nl') ||
      firstLower.includes('dutch') ||
      (firstRow[1]?.toLowerCase() ?? '').includes('nl') ||
      (firstRow[1]?.toLowerCase() ?? '').includes('dutch'));

  let fdcIdIdx: number | null = null;
  let enIdx: number;
  let nlIdx: number;
  let dataStart: number;

  if (hasHeader && lines.length > 1) {
    const det = detectColumnIndices(firstRow);
    fdcIdIdx = det.fdcIdIdx;
    enIdx = det.enIdx;
    nlIdx = det.nlIdx;
    dataStart = 1;
  } else {
    enIdx = 0;
    nlIdx = 1;
    dataStart = 0;
  }

  const rows: { fdcId?: number; en: string; nl: string }[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    const nl = (cols[nlIdx] ?? '').trim();
    if (!nl) continue;
    if (fdcIdIdx != null) {
      const rawId = (cols[fdcIdIdx] ?? '').trim();
      const fdcId = rawId ? parseInt(rawId, 10) : NaN;
      if (Number.isFinite(fdcId)) {
        rows.push({ fdcId, en: (cols[enIdx] ?? '').trim(), nl });
        continue;
      }
    }
    const en = (cols[enIdx] ?? '').trim();
    if (en) rows.push({ en, nl });
  }

  console.log(`📄 CSV: ${resolved}`);
  console.log(`   Rijen: ${rows.length}`);

  if (rows.length === 0) {
    console.log('   Geen rijen om te importeren.');
    process.exit(0);
  }

  const toUpsert: {
    fdc_id: number;
    locale: string;
    display_name: string;
    status: string;
  }[] = [];

  if (rows[0].fdcId != null) {
    // Match by fdc_id from CSV – fetch all fdc_ids (paginate; Supabase returns max 1000 by default)
    const validFdcIds = new Set<number>();
    let offset = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('fndds_survey_foods')
        .select('fdc_id')
        .range(offset, offset + DB_PAGE_SIZE - 1);
      if (error) {
        console.error('❌ Fout bij laden FNDDS foods:', error.message);
        process.exit(1);
      }
      if (!page?.length) break;
      for (const r of page) validFdcIds.add(r.fdc_id);
      if (page.length < DB_PAGE_SIZE) break;
      offset += DB_PAGE_SIZE;
    }
    console.log(`   FNDDS foods in DB: ${validFdcIds.size} records`);
    let skipped = 0;
    for (const row of rows) {
      const id = row.fdcId!;
      if (!validFdcIds.has(id)) {
        skipped += 1;
        continue;
      }
      toUpsert.push({
        fdc_id: id,
        locale: FNDDS_LOCALE,
        display_name: row.nl,
        status: 'reviewed',
      });
    }
    if (skipped > 0) {
      console.log(`   ⚠️  ${skipped} rijen overgeslagen (fdc_id niet in DB).`);
    }
  } else {
    // Match by description (English) – fetch all (paginate)
    const foods: { fdc_id: number; description: string | null }[] = [];
    let offset = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('fndds_survey_foods')
        .select('fdc_id, description')
        .range(offset, offset + DB_PAGE_SIZE - 1);
      if (error) {
        console.error('❌ Fout bij laden FNDDS foods:', error.message);
        process.exit(1);
      }
      if (!page?.length) break;
      foods.push(...page);
      if (page.length < DB_PAGE_SIZE) break;
      offset += DB_PAGE_SIZE;
    }

    const byDescription = new Map<string, number[]>();
    for (const f of foods) {
      const d = (f.description ?? '').trim();
      if (!d) continue;
      const list = byDescription.get(d) ?? [];
      list.push(f.fdc_id);
      byDescription.set(d, list);
    }

    console.log(
      `   FNDDS foods in DB: ${byDescription.size} unieke beschrijvingen`,
    );

    let noMatch = 0;
    for (const { en, nl } of rows) {
      const fdcIds = byDescription.get(en);
      if (!fdcIds?.length) {
        noMatch += 1;
        continue;
      }
      for (const fdcId of fdcIds) {
        toUpsert.push({
          fdc_id: fdcId,
          locale: FNDDS_LOCALE,
          display_name: nl,
          status: 'reviewed',
        });
      }
    }
    if (noMatch > 0) {
      console.log(
        `   ⚠️  Geen match in DB voor ${noMatch} rijen (Engelse naam niet gevonden).`,
      );
    }
  }

  if (toUpsert.length === 0) {
    console.log('   Geen vertalingen om te schrijven.');
    process.exit(0);
  }

  const BATCH = 200;
  for (let i = 0; i < toUpsert.length; i += BATCH) {
    const chunk = toUpsert.slice(i, i + BATCH);
    const { error } = await supabase
      .from('fndds_survey_food_translations')
      .upsert(chunk, { onConflict: 'fdc_id,locale' });

    if (error) {
      console.error('❌ Fout bij upsert:', error.message);
      process.exit(1);
    }
    process.stdout.write(
      `   Geschreven: ${Math.min(i + BATCH, toUpsert.length)} / ${toUpsert.length}\r`,
    );
  }

  console.log(`\n✅ Klaar. ${toUpsert.length} vertalingen geïmporteerd.`);
}

main();
