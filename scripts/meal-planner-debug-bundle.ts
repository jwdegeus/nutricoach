#!/usr/bin/env tsx
/**
 * Meal Planner Debug Bundle
 *
 * Creates a self-contained debug bundle with reporter output + sanitized env/config.
 * Usage: npm run mealplan:debug:bundle
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  findLatestNdjson,
  parseNdjsonFile,
  formatReportAsText,
} from './meal-planner-log-report';

const LOG_DIR = path.join(process.cwd(), 'logs', 'meal-planner');
const BUNDLES_DIR = path.join(LOG_DIR, 'bundles');

const ENV_WHITELIST = [
  'MEAL_PLANNER_DEBUG_LOG',
  'MEAL_PLANNER_DEBUG_VERBOSE',
  'MEAL_PLANNER_LOG_TO_FILE',
  'MEAL_PLANNER_TARGET_REUSE_RATIO',
  'MEAL_PLANNER_PREFILL_FETCH_LIMIT_MAX',
  'MEAL_PLANNER_DEBUG_MAX_EVENTS',
  'MEAL_PLANNER_DEBUG_MAX_CANDIDATE_REJECTS_PER_SLOT',
  'MEAL_PLANNER_DB_FIRST',
];

function getSanitizedEnvSnapshot(): Record<string, string | boolean | number> {
  const snap: Record<string, string | boolean | number> = {};
  for (const key of ENV_WHITELIST) {
    const v = process.env[key];
    if (v === undefined) continue;
    if (v === 'true' || v === '1') snap[key] = true;
    else if (v === 'false' || v === '0') snap[key] = false;
    else if (/^\d+$/.test(v)) snap[key] = parseInt(v, 10);
    else snap[key] = v;
  }
  return snap;
}

function extractRunId(
  runStarts: Array<{ runId?: string }>,
  runDiagnoses: Array<{ runId?: string }>,
): string {
  const d = runDiagnoses[runDiagnoses.length - 1];
  const s = runStarts[runStarts.length - 1];
  return d?.runId ?? s?.runId ?? 'unknown';
}

async function main(): Promise<void> {
  const latestPath = findLatestNdjson();
  if (!latestPath) {
    console.error('No NDJSON files found in', LOG_DIR);
    process.exit(1);
  }

  const {
    runStarts,
    slotSummaries,
    runDiagnoses,
    slotSurvivorsEvents,
    slotRankingEvents,
    dbHealthSnapshots,
    parseErrors,
    userIdHash,
  } = await parseNdjsonFile(latestPath, undefined, true);

  const runId = extractRunId(runStarts, runDiagnoses);
  const safeRunId = runId.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const createdAt = new Date().toISOString();

  const reportText = formatReportAsText(
    latestPath,
    runStarts,
    slotSummaries,
    runDiagnoses,
    slotSurvivorsEvents,
    slotRankingEvents,
    dbHealthSnapshots,
    parseErrors,
    undefined,
    userIdHash,
  );

  const envSnap = getSanitizedEnvSnapshot();
  const envLines = Object.entries(envSnap)
    .map(([k, v]) => `  ${k}=${typeof v === 'boolean' ? v : v}`)
    .join('\n');

  const runStart = runStarts[runStarts.length - 1];
  const configKeys: string[] = [];
  if (runStart?.configSnapshot) {
    const c = runStart.configSnapshot as Record<string, unknown>;
    if (c.repeat_window_days != null)
      configKeys.push(`repeat_window_days=${c.repeat_window_days}`);
    if (c.db_first != null) configKeys.push(`db_first=${c.db_first}`);
    if (c.ai_fill_mode != null)
      configKeys.push(`ai_fill_mode=${c.ai_fill_mode}`);
    if (c.target_reuse_ratio != null)
      configKeys.push(`target_reuse_ratio=${c.target_reuse_ratio}`);
  }
  const configLine = configKeys.length > 0 ? configKeys.join(' ') : '(none)';

  const bundleContent = [
    '=== Meal Planner Debug Bundle ===',
    '',
    `runId:       ${runId}`,
    `ndjsonPath:  ${path.relative(process.cwd(), latestPath)}`,
    `createdAt:   ${createdAt}`,
    '',
    '--- Config (from run_start) ---',
    configLine,
    '',
    '--- Env Snapshot (sanitized) ---',
    envLines || '  (none of whitelisted keys set)',
    '',
    '--- Reporter Output ---',
    reportText,
    '',
    '=== End Bundle ===',
  ].join('\n');

  if (!fs.existsSync(BUNDLES_DIR)) {
    fs.mkdirSync(BUNDLES_DIR, { recursive: true });
  }

  const bundleFilename = `bundle-${dateStr}-${safeRunId}.txt`;
  const bundlePath = path.join(BUNDLES_DIR, bundleFilename);
  fs.writeFileSync(bundlePath, bundleContent, 'utf8');

  console.log('Bundle written:', path.relative(process.cwd(), bundlePath));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
