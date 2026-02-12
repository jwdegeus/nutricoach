#!/usr/bin/env tsx
/**
 * Meal Planner NDJSON Log Reporter
 *
 * Reads meal-planner NDJSON log files and outputs a compact console summary.
 * Usage:
 *   npm run mealplan:log:report -- --file ./logs/meal-planner/mealplan-YYYYMMDD-runId.ndjson
 *   npm run mealplan:log:report -- --latest
 *   npm run mealplan:log:report -- --latest --runId <id>
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

const LOG_DIR = path.join(process.cwd(), 'logs', 'meal-planner');

// Tolerant event shapes (partial)
type RunStartEvent = {
  event?: string;
  ts?: string;
  runId?: string;
  planId?: string | null;
  configSnapshot?: Record<string, unknown>;
  numDays?: number;
  slots?: string[];
};

type SlotSummaryEvent = {
  event?: string;
  ts?: string;
  runId?: string;
  planId?: string | null;
  slotKey?: string;
  finalSource?: string;
  finalReasonKey?: string;
  countsByStage?: Record<
    string,
    { before?: number; after?: number; rejected?: number }
  >;
  topReasonsByStage?: Record<string, Array<{ code?: string; count?: number }>>;
  candidateSample?: string[];
};

type RunDiagnosisEvent = {
  event?: string;
  ts?: string;
  runId?: string;
  planId?: string | null;
  slotsTotal?: number;
  slotsFromDb?: number;
  slotsFromHistory?: number;
  slotsFromAi?: number;
  slotsFromAiFailed?: number;
  reasonsHistogram?: Array<{ reason?: string; count?: number }>;
  issueCodesHistogram?: Record<
    string,
    Array<{ code?: string; count?: number }>
  >;
  dominantBlockers?: Array<{
    stage?: string;
    code?: string;
    count?: number;
    share?: number;
  }>;
};

type SlotRankingEvent = {
  event?: string;
  ts?: string;
  runId?: string;
  slotKey?: string;
  candidatesCount?: number;
  top?: Array<{
    candidateKey?: string;
    name?: string;
    signals?: Record<string, unknown>;
  }>;
  chosen?: {
    candidateKey?: string;
    name?: string;
    reason?: string;
  };
  note?: string;
};

type SlotSurvivorsEvent = {
  event?: string;
  ts?: string;
  runId?: string;
  slotKey?: string;
  stage?: string;
  survivorsCount?: number;
  sample?: Array<{
    candidateKey?: string;
    name?: string;
    hasIngredientRefs?: boolean;
    hasNevoRefs?: boolean;
  }>;
};

type DbHealthSnapshotEvent = {
  event?: string;
  ts?: string;
  runId?: string;
  planId?: string | null;
  bySlot?: Record<
    string,
    {
      totalCustomMeals?: number;
      withIngredientRefs?: number;
      withNevoRefs?: number;
      classifiedForSlot?: number;
    }
  >;
  totals?: {
    total?: number;
    withIngredientRefs?: number;
    withNevoRefs?: number;
  };
  error?: string;
};

type ParsedEvent =
  | RunStartEvent
  | SlotSummaryEvent
  | RunDiagnosisEvent
  | SlotSurvivorsEvent
  | SlotRankingEvent
  | DbHealthSnapshotEvent;

function parseArgs(): {
  file?: string;
  latest: boolean;
  runId?: string;
  debug: boolean;
} {
  const args = process.argv.slice(2);
  let file: string | undefined;
  let latest = false;
  let runId: string | undefined;
  let debug = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      file = args[++i];
    } else if (args[i] === '--latest') {
      latest = true;
    } else if (args[i] === '--runId' && args[i + 1]) {
      runId = args[++i];
    } else if (args[i] === '--debug') {
      debug = true;
    }
  }

  return { file, latest, runId, debug };
}

export function findLatestNdjson(): string | null {
  if (!fs.existsSync(LOG_DIR)) return null;
  const files = fs.readdirSync(LOG_DIR);
  const ndjsonFiles = files
    .filter((f) => f.endsWith('.ndjson'))
    .map((f) => path.join(LOG_DIR, f));
  if (ndjsonFiles.length === 0) return null;
  ndjsonFiles.sort((a, b) => {
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    return sb.mtimeMs - sa.mtimeMs;
  });
  return ndjsonFiles[0];
}

function matchesRunId(evt: ParsedEvent, runId: string): boolean {
  const id = (evt as { runId?: string }).runId;
  return id != null && String(id) === runId;
}

export async function parseNdjsonFile(
  filePath: string,
  runIdFilter?: string,
  showUserIdHash = false,
): Promise<{
  runStarts: RunStartEvent[];
  slotSummaries: SlotSummaryEvent[];
  runDiagnoses: RunDiagnosisEvent[];
  slotSurvivorsEvents: SlotSurvivorsEvent[];
  slotRankingEvents: SlotRankingEvent[];
  dbHealthSnapshots: DbHealthSnapshotEvent[];
  parseErrors: number;
  userIdHash?: string;
}> {
  const runStarts: RunStartEvent[] = [];
  const slotSummaries: SlotSummaryEvent[] = [];
  const runDiagnoses: RunDiagnosisEvent[] = [];
  const slotSurvivorsEvents: SlotSurvivorsEvent[] = [];
  const slotRankingEvents: SlotRankingEvent[] = [];
  const dbHealthSnapshots: DbHealthSnapshotEvent[] = [];
  let parseErrors = 0;
  let userIdHash: string | undefined;

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      parseErrors++;
      continue;
    }

    if (typeof obj !== 'object' || obj === null) continue;

    const evt = obj as ParsedEvent & { event?: string; userIdHash?: string };
    const eventName = evt.event;

    if (runIdFilter && !matchesRunId(evt, runIdFilter)) continue;
    if (showUserIdHash && typeof evt.userIdHash === 'string') {
      userIdHash = evt.userIdHash;
    }
    if (!showUserIdHash && 'userIdHash' in evt) delete evt.userIdHash;

    if (eventName === 'run_start') {
      runStarts.push(evt as RunStartEvent);
    } else if (eventName === 'slot_summary') {
      slotSummaries.push(evt as SlotSummaryEvent);
    } else if (eventName === 'run_diagnosis') {
      runDiagnoses.push(evt as RunDiagnosisEvent);
    } else if (eventName === 'slot_survivors') {
      slotSurvivorsEvents.push(evt as SlotSurvivorsEvent);
    } else if (eventName === 'slot_ranking') {
      slotRankingEvents.push(evt as SlotRankingEvent);
    } else if (eventName === 'db_health_snapshot') {
      dbHealthSnapshots.push(evt as DbHealthSnapshotEvent);
    }
  }

  return {
    runStarts,
    slotSummaries,
    runDiagnoses,
    slotSurvivorsEvents,
    slotRankingEvents,
    dbHealthSnapshots,
    parseErrors,
    userIdHash,
  };
}

function sortSlotKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const partsA = a.split('-');
    const partsB = b.split('-');
    const dateA = partsA.length >= 3 ? partsA.slice(0, 3).join('-') : a;
    const dateB = partsB.length >= 3 ? partsB.slice(0, 3).join('-') : b;
    const slotA = partsA[3];
    const slotB = partsB[3];
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const slotOrder = ['breakfast', 'lunch', 'dinner', 'snack'];
    const ia = slotOrder.indexOf(slotA ?? '');
    const ib = slotOrder.indexOf(slotB ?? '');
    if (ia !== -1 && ib !== -1) return ia - ib;
    return (slotA ?? '').localeCompare(slotB ?? '');
  });
}

function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function formatReportAsText(
  filePath: string,
  runStarts: RunStartEvent[],
  slotSummaries: SlotSummaryEvent[],
  runDiagnoses: RunDiagnosisEvent[],
  slotSurvivorsEvents: SlotSurvivorsEvent[],
  slotRankingEvents: SlotRankingEvent[],
  dbHealthSnapshots: DbHealthSnapshotEvent[],
  parseErrors: number,
  runIdFilter?: string,
  userIdHash?: string,
): string {
  const lines: string[] = [];
  const out = (s: string) => lines.push(s);

  out('\n--- Meal Planner Log Report ---\n');
  out(`File: ${filePath}`);
  if (parseErrors > 0) {
    out(`⚠️  Skipped ${parseErrors} invalid JSON line(s)`);
  }
  out('');

  const diagnosis = runDiagnoses[runDiagnoses.length - 1];
  const runStart = runStarts[runStarts.length - 1];
  const runId = diagnosis?.runId ?? runStart?.runId ?? 'unknown';
  const tsRange =
    runStarts.length > 0 && runStarts[0].ts
      ? runStarts[0].ts
      : slotSummaries.length > 0 && slotSummaries[0].ts
        ? slotSummaries[0].ts
        : '';

  out('--- Run Header ---');
  out(`runId:        ${runId}`);
  if (userIdHash) out(`userIdHash:    ${userIdHash} (--debug)`);
  out(`timestamp:    ${tsRange}`);
  if (runStart?.configSnapshot) {
    out(
      `config:       repeat_window_days=${runStart.configSnapshot.repeat_window_days ?? '?'} db_first=${runStart.configSnapshot.db_first ?? '?'} ai_fill_mode=${runStart.configSnapshot.ai_fill_mode ?? '?'}`,
    );
  }
  out('');

  const dbHealth = dbHealthSnapshots[dbHealthSnapshots.length - 1];
  if (dbHealth) {
    out('--- DB Health Snapshot (custom_meals) ---');
    if (dbHealth.error) {
      out(`  error: ${dbHealth.error}`);
    } else if (dbHealth.bySlot && dbHealth.totals) {
      const t = dbHealth.totals;
      out(
        `  totals: ${t.total ?? 0} total | ${t.withIngredientRefs ?? 0} withRefs | ${t.withNevoRefs ?? 0} withNEVO`,
      );
      for (const slot of ['breakfast', 'lunch', 'dinner', 'unclassified']) {
        const s = dbHealth.bySlot[slot];
        if (s)
          out(
            `  ${slot}: total=${s.totalCustomMeals ?? 0} withRefs=${s.withIngredientRefs ?? 0} withNEVO=${s.withNevoRefs ?? 0}`,
          );
      }
    }
    out('');
  }

  if (diagnosis) {
    out('--- Totals ---');
    out(
      `slotsTotal:    ${diagnosis.slotsTotal ?? 0} (db: ${diagnosis.slotsFromDb ?? 0} | history: ${diagnosis.slotsFromHistory ?? 0} | ai: ${diagnosis.slotsFromAi ?? 0} | ai_failed: ${diagnosis.slotsFromAiFailed ?? 0})`,
    );
    out('');

    if (diagnosis.dominantBlockers && diagnosis.dominantBlockers.length > 0) {
      out('--- Dominant Blockers (top 5) ---');
      out('stage              | code                        | count | share');
      out(
        '-'.repeat(20) +
          '-+-' +
          '-'.repeat(28) +
          '-+-' +
          '-'.repeat(6) +
          '-+-' +
          '-'.repeat(7),
      );
      for (const b of diagnosis.dominantBlockers.slice(0, 5)) {
        const stage = (b.stage ?? '?').padEnd(18);
        const code = (b.code ?? '?').slice(0, 28).padEnd(28);
        const count = String(b.count ?? 0).padStart(6);
        const share = formatShare(b.share ?? 0).padStart(7);
        out(`${stage} | ${code} | ${count} | ${share}`);
      }
      out('');
    }
  }

  if (slotSummaries.length > 0) {
    const bySlot = new Map<string, SlotSummaryEvent[]>();
    for (const s of slotSummaries) {
      const key = s.slotKey ?? 'unknown';
      const arr = bySlot.get(key) ?? [];
      arr.push(s);
      bySlot.set(key, arr);
    }
    const keys = sortSlotKeys(Array.from(bySlot.keys()));

    out('--- Per Slot ---');
    for (const slotKey of keys) {
      const list = bySlot.get(slotKey)!;
      const last = list[list.length - 1]!;
      const source = last.finalSource ?? '?';
      const reason = last.finalReasonKey ?? '-';
      out(`\n${slotKey}`);
      out(`  finalSource: ${source} | finalReasonKey: ${reason}`);
      const ranking = slotRankingEvents.find((r) => r.slotKey === slotKey);
      if (ranking && ranking.chosen) {
        out(
          `  chosen: ${ranking.chosen.name ?? ranking.chosen.candidateKey} | reason: ${ranking.chosen.reason ?? '?'}`,
        );
      } else if (ranking?.note) {
        out(`  ranking note: ${ranking.note}`);
      }

      const counts = last.countsByStage ?? {};
      const topReasons = last.topReasonsByStage ?? {};
      const survivorsByStage = new Map<string, SlotSurvivorsEvent>();
      for (const ev of slotSurvivorsEvents) {
        if (ev.slotKey === slotKey && ev.stage) {
          survivorsByStage.set(ev.stage, ev);
        }
      }
      for (const stage of [
        'variety_window',
        'hasRefs_filter',
        'hard_constraints',
      ]) {
        const c = counts[stage];
        const tr = topReasons[stage] ?? [];
        const before = c?.before ?? 0;
        const after = c?.after ?? 0;
        const rejected = c?.rejected ?? 0;
        const countStr = `${before}→${after} (rej:${rejected})`;
        const codesStr =
          tr.length > 0
            ? tr
                .slice(0, 3)
                .map((r) => `${r.code ?? '?'}:${r.count ?? 0}`)
                .join(', ')
            : '-';
        out(`  ${stage}: ${countStr} | top: ${codesStr}`);
        const surv = survivorsByStage.get(stage);
        if (
          surv &&
          (surv.survivorsCount ?? 0) > 0 &&
          surv.sample &&
          surv.sample.length > 0
        ) {
          const labels = surv.sample
            .slice(0, 10)
            .map((s) =>
              s.name && s.name !== '(unnamed)'
                ? s.name
                : (s.candidateKey ?? '?'),
            )
            .join(', ');
          out(`    Survivors (${stage}): ${labels}`);
        }
      }
    }
    out('');
  }

  out('--- End Report ---\n');
  return lines.join('\n');
}

function printReport(
  filePath: string,
  runStarts: RunStartEvent[],
  slotSummaries: SlotSummaryEvent[],
  runDiagnoses: RunDiagnosisEvent[],
  slotSurvivorsEvents: SlotSurvivorsEvent[],
  slotRankingEvents: SlotRankingEvent[],
  dbHealthSnapshots: DbHealthSnapshotEvent[],
  parseErrors: number,
  runIdFilter?: string,
  userIdHash?: string,
): void {
  console.log(
    formatReportAsText(
      filePath,
      runStarts,
      slotSummaries,
      runDiagnoses,
      slotSurvivorsEvents,
      slotRankingEvents,
      dbHealthSnapshots,
      parseErrors,
      runIdFilter,
      userIdHash,
    ),
  );
}

async function main(): Promise<void> {
  const { file, latest, runId, debug } = parseArgs();

  let targetFile = file;
  if (latest) {
    targetFile = findLatestNdjson() ?? undefined;
    if (!targetFile) {
      console.error('No NDJSON files found in', LOG_DIR);
      process.exit(1);
    }
  }

  if (!targetFile) {
    console.error('Usage:');
    console.error(
      '  npm run mealplan:log:report -- --file ./logs/meal-planner/<file>.ndjson',
    );
    console.error('  npm run mealplan:log:report -- --latest');
    console.error('  npm run mealplan:log:report -- --latest --runId <id>');
    process.exit(1);
  }

  const resolvedPath = path.isAbsolute(targetFile)
    ? targetFile
    : path.resolve(process.cwd(), targetFile);

  if (!fs.existsSync(resolvedPath)) {
    console.error('File not found:', resolvedPath);
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
  } = await parseNdjsonFile(resolvedPath, runId, debug);

  printReport(
    resolvedPath,
    runStarts,
    slotSummaries,
    runDiagnoses,
    slotSurvivorsEvents,
    slotRankingEvents,
    dbHealthSnapshots,
    parseErrors,
    runId,
    userIdHash,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
