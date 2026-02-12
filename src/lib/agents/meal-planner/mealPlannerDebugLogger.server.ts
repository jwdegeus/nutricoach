/**
 * Meal Planner Debug Logger (server-only)
 *
 * Ultra-verbose structured logging for the meal plan generator. Logs via console
 * (JSON) and optionally appends NDJSON to a local logfile. Fully behind env flags.
 *
 * Env flags:
 *   MEAL_PLANNER_DEBUG_LOG=true      - Master switch
 *   MEAL_PLANNER_DEBUG_VERBOSE=true  - Per-candidate details
 *   MEAL_PLANNER_LOG_TO_FILE=true    - NDJSON file output
 */

import 'server-only';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DEBUG_LOG =
  process.env.MEAL_PLANNER_DEBUG_LOG === 'true' ||
  process.env.MEAL_PLANNER_DEBUG_LOG === '1';
const DEBUG_VERBOSE =
  process.env.MEAL_PLANNER_DEBUG_VERBOSE === 'true' ||
  process.env.MEAL_PLANNER_DEBUG_VERBOSE === '1';
const LOG_TO_FILE =
  process.env.MEAL_PLANNER_LOG_TO_FILE === 'true' ||
  process.env.MEAL_PLANNER_LOG_TO_FILE === '1';

const MAX_EVENTS = Math.max(
  0,
  parseInt(process.env.MEAL_PLANNER_DEBUG_MAX_EVENTS ?? '20000', 10) || 20000,
);
const MAX_CANDIDATE_REJECTS_PER_SLOT = Math.max(
  0,
  parseInt(
    process.env.MEAL_PLANNER_DEBUG_MAX_CANDIDATE_REJECTS_PER_SLOT ?? '500',
    10,
  ) || 500,
);

const LOG_DIR = join(process.cwd(), 'logs', 'meal-planner');
const TOP_N_REJECT_REASONS = 5;
const _SLOT_SUMMARY_TOP_REASONS = 3;
const CANDIDATE_SAMPLE_MAX = 10;
const SURVIVOR_SAMPLE_MAX = 10;
const SURVIVOR_NAME_MAX_LEN = 60;
const _RUN_DIAGNOSIS_TOP_CODES = 10;
const _DOMINANT_BLOCKERS_MAX = 5;

function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 8);
}

function baseEvent(
  runId: string,
  planId: string | null,
  event: string,
  payload: Record<string, unknown>,
) {
  return {
    ts: new Date().toISOString(),
    runId,
    planId,
    event,
    ...payload,
  };
}

/** Check if fs is writable (dev/local). Serverless/edge: false. */
function isFsWritable(): boolean {
  try {
    if (typeof process === 'undefined' || process.env?.VERCEL === '1') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export type CreateRunLoggerParams = {
  planId: string | null;
  userId: string;
  runId?: string;
};

export type ConfigSnapshot = {
  repeat_window_days?: number;
  target_reuse_ratio?: number;
  reuse_ratio?: number;
  db_first?: boolean;
  ai_fill_mode?: string;
};

export type StageCounts = {
  before?: number;
  after?: number;
  rejected?: number;
};

export type ValidationEntry = {
  stage: string;
  ok: boolean;
  issueCode?: string;
  issueDetail?: string;
};

export type IssueEntry = {
  code: string;
  /** Human-readable or structured culprit detail (safe, bounded). */
  detail?: string | Record<string, unknown>;
};

export type CandidateInfo = {
  candidateKey: string;
  name: string;
  hasIngredientRefs: boolean;
  nevoCoverage?: number;
  validation?: ValidationEntry[];
};

export type StageCountsEntry = {
  before: number;
  after: number;
  rejected: number;
};
export type TopReasonEntry = { code: string; count: number };

export type SlotSummaryData = {
  slotKey: string;
  finalSource: 'db' | 'history' | 'ai' | 'ai_failed';
  finalReasonKey?: string;
  countsByStage: Record<string, StageCountsEntry>;
  topReasonsByStage: Record<string, TopReasonEntry[]>;
  candidateSample?: string[];
};

export type RunDiagnosisData = {
  slotsTotal: number;
  slotsFromDb: number;
  slotsFromHistory: number;
  slotsFromAi: number;
  slotsFromAiFailed?: number;
  reasonsHistogram: Array<{ reason: string; count: number }>;
  issueCodesHistogram: Record<string, Array<{ code: string; count: number }>>;
  dominantBlockers: Array<{
    stage: string;
    code: string;
    count: number;
    share: number;
  }>;
};

export function createRunLogger(params: CreateRunLoggerParams) {
  const { planId, userId, runId } = params;
  const effectiveRunId =
    runId ?? `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const userIdHash = hashUserId(userId);
  let logFilePath: string | null = null;
  let fileWriteSkipped = false;

  let eventsCount = 0;
  const candidateRejectCountBySlot = new Map<string, number>();
  let maxEventsLimitEmitted = false;
  const slotLimitEmitted = new Set<string>();

  function canLogVerbose(slotKey?: string): boolean {
    if (maxEventsLimitEmitted) return false;
    if (eventsCount >= MAX_EVENTS) return false;
    if (slotKey) {
      const count = candidateRejectCountBySlot.get(slotKey) ?? 0;
      if (count >= MAX_CANDIDATE_REJECTS_PER_SLOT) return false;
    }
    return true;
  }

  function emitLimitReached(
    limitType: 'max_events' | 'max_candidate_rejects_per_slot',
    slotKey?: string,
    droppedEstimate?: number,
  ): void {
    const payload: Record<string, unknown> = {
      runId: effectiveRunId,
      limitType,
      limit:
        limitType === 'max_events'
          ? MAX_EVENTS
          : MAX_CANDIDATE_REJECTS_PER_SLOT,
      droppedEventsEstimate: droppedEstimate ?? 0,
    };
    if (slotKey) payload.slotKey = slotKey;
    const obj = baseEvent(effectiveRunId, planId, 'log_limit_reached', payload);
    if (DEBUG_LOG) {
      const withUserIdHash = { ...obj, userIdHash };
      console.log(JSON.stringify(withUserIdHash));
      maybeAppendToFile(withUserIdHash);
    }
  }

  if (DEBUG_LOG && LOG_TO_FILE && isFsWritable()) {
    try {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const safeRunId = effectiveRunId
        .replace(/[^a-zA-Z0-9-_]/g, '_')
        .slice(0, 32);
      if (!existsSync(LOG_DIR)) {
        mkdirSync(LOG_DIR, { recursive: true });
      }
      logFilePath = join(LOG_DIR, `mealplan-${dateStr}-${safeRunId}.ndjson`);
    } catch {
      fileWriteSkipped = true;
    }
  } else if (DEBUG_LOG && LOG_TO_FILE && !isFsWritable()) {
    fileWriteSkipped = true;
  }

  function maybeAppendToFile(obj: Record<string, unknown>): void {
    if (!DEBUG_LOG || !LOG_TO_FILE || !logFilePath) return;
    if (fileWriteSkipped) return;
    try {
      const line = JSON.stringify(obj) + '\n';
      writeFileSync(logFilePath!, line, { flag: 'a' });
    } catch {
      fileWriteSkipped = true;
    }
  }

  function emit(obj: Record<string, unknown>): void {
    if (!DEBUG_LOG) return;
    const eventName = (obj as { event?: string }).event;
    const isVerbose =
      eventName === 'candidate_reject' || eventName === 'slot_survivors';
    if (isVerbose && !canLogVerbose((obj as { slotKey?: string }).slotKey)) {
      const slotKey = (obj as { slotKey?: string }).slotKey;
      if (
        slotKey &&
        !slotLimitEmitted.has(slotKey) &&
        (candidateRejectCountBySlot.get(slotKey) ?? 0) >=
          MAX_CANDIDATE_REJECTS_PER_SLOT
      ) {
        slotLimitEmitted.add(slotKey);
        emitLimitReached('max_candidate_rejects_per_slot', slotKey, 1);
      }
      return;
    }
    eventsCount++;
    if (eventName === 'candidate_reject') {
      const sk = (obj as { slotKey?: string }).slotKey;
      if (sk) {
        candidateRejectCountBySlot.set(
          sk,
          (candidateRejectCountBySlot.get(sk) ?? 0) + 1,
        );
      }
    }
    if (eventsCount >= MAX_EVENTS && !maxEventsLimitEmitted) {
      maxEventsLimitEmitted = true;
      emitLimitReached('max_events', undefined, 0);
    }
    const withUserIdHash = { ...obj, userIdHash };
    console.log(JSON.stringify(withUserIdHash));
    maybeAppendToFile(withUserIdHash);
  }

  function event(
    name: string,
    payload: {
      slotKey?: string;
      stage?: string;
      durationMs?: number;
      configSnapshot?: ConfigSnapshot;
      counts?: StageCounts;
      [key: string]: unknown;
    } = {},
  ): void {
    const obj = baseEvent(effectiveRunId, planId, name, payload);
    emit(obj);
  }

  function stage(
    slotKey: string,
    stageName: string,
    counts: StageCounts,
    durationMs?: number,
    extra?: Record<string, unknown>,
  ): void {
    event('stage_result', {
      slotKey,
      stage: stageName,
      counts,
      durationMs,
      ...extra,
    });
  }

  function candidateReject(
    slotKey: string,
    stageName: string,
    candidate: {
      id: string;
      name?: string;
      ingredientRefs?: unknown[];
      recipeSource?: string;
    },
    issues: IssueEntry[],
  ): void {
    if (!DEBUG_VERBOSE) return;
    const hasRefs =
      Array.isArray(candidate.ingredientRefs) &&
      candidate.ingredientRefs.length > 0;
    const refs = candidate.ingredientRefs as
      | Array<{ nevoCode?: string }>
      | undefined;
    const nevoCount = refs?.filter((r) => r?.nevoCode).length ?? 0;
    const nevoCoverage =
      hasRefs && refs?.length
        ? Math.round((nevoCount / refs.length) * 100)
        : undefined;
    const safeName = (candidate.name ?? '').trim().slice(0, 80) || undefined;
    const missingData = !safeName || !hasRefs;
    const firstIssue =
      issues.length > 0
        ? { code: issues[0].code, detail: issues[0].detail }
        : { code: 'unknown' as const, detail: undefined };
    event('candidate_reject', {
      slotKey,
      stage: stageName,
      candidateKey: `${candidate.recipeSource ?? 'unknown'}:${candidate.id}`,
      candidateName: safeName,
      hasIngredientRefs: hasRefs,
      nevoCoverage,
      firstIssue,
      issues,
      ...(issues.length === 0 && { note: 'no_issue_details_exposed' }),
      ...(missingData && { missing_data: true }),
    });
  }

  /** Log top-N issue codes per stage (always when DEBUG_LOG=true, regardless of verbose). */
  function topRejectReasons(
    slotKey: string,
    stageName: string,
    reasonCounts: Map<string, number>,
  ): void {
    const top = Array.from(reasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N_REJECT_REASONS)
      .map(([code, count]) => ({ code, count }));
    if (top.length > 0) {
      event('stage_result', {
        slotKey,
        stage: stageName,
        topRejectReasons: top,
      });
    }
  }

  /** Survivor sample entry - safe fields only. */
  type SurvivorEntry = {
    candidateKey: string;
    name: string;
    hasIngredientRefs: boolean;
    hasNevoRefs?: boolean;
  };

  /** Emit slot_survivors event: sample of candidates still in running after a stage. */
  function slotSurvivors(
    slotKey: string,
    stage: string,
    candidates: Array<{
      id: string;
      name?: string;
      ingredientRefs?: unknown[];
      recipeSource?: string;
    }>,
    survivorsCount: number,
  ): void {
    if (!DEBUG_LOG || survivorsCount <= 0) return;
    const sorted = [...candidates].sort((a, b) => {
      const keyA = `${a.recipeSource ?? 'unknown'}:${a.id}`;
      const keyB = `${b.recipeSource ?? 'unknown'}:${b.id}`;
      return keyA.localeCompare(keyB);
    });
    const sample: SurvivorEntry[] = sorted
      .slice(0, SURVIVOR_SAMPLE_MAX)
      .map((c) => {
        const hasRefs =
          Array.isArray(c.ingredientRefs) && c.ingredientRefs.length > 0;
        const refs = c.ingredientRefs as
          | Array<{ nevoCode?: string }>
          | undefined;
        const hasNevo = refs?.some((r) => r?.nevoCode != null) ?? false;
        const name =
          (c.name ?? '').trim().slice(0, SURVIVOR_NAME_MAX_LEN) || '(unnamed)';
        const entry: SurvivorEntry = {
          candidateKey: `${c.recipeSource ?? 'unknown'}:${c.id}`,
          name,
          hasIngredientRefs: hasRefs,
        };
        if (hasNevo) entry.hasNevoRefs = true;
        return entry;
      });
    event('slot_survivors', {
      slotKey,
      stage,
      survivorsCount,
      sample,
    });
  }

  /** Ranking entry: candidate with signals (only in-memory data). */
  type RankingEntry = {
    candidateKey: string;
    name: string;
    signals: Record<string, unknown>;
  };

  /** Emit slot_ranking event: top-N candidates + chosen, for selection transparency. */
  function slotRanking(
    slotKey: string,
    candidatesCount: number,
    topCandidates: Array<{
      id: string;
      name?: string;
      recipeSource?: string;
      [key: string]: unknown;
    }>,
    chosen?: {
      candidateKey: string;
      name: string;
      reason: string;
    },
    note?: string,
  ): void {
    if (!DEBUG_LOG) return;
    if (candidatesCount === 0 && !note) return;
    const top: RankingEntry[] = topCandidates
      .slice(0, SURVIVOR_SAMPLE_MAX)
      .map((c) => {
        const key = `${c.recipeSource ?? 'unknown'}:${c.id}`;
        const name =
          (c.name ?? '').trim().slice(0, SURVIVOR_NAME_MAX_LEN) || '(unnamed)';
        const source =
          c.recipeSource === 'custom_meals'
            ? 'db'
            : c.recipeSource === 'meal_history'
              ? 'history'
              : 'unknown';
        const signals: Record<string, unknown> = { source };
        return { candidateKey: key, name, signals };
      });
    const payload: Record<string, unknown> = {
      slotKey,
      candidatesCount,
      top,
    };
    if (chosen) payload.chosen = chosen;
    if (note) payload.note = note;
    event('slot_ranking', payload);
  }

  /** Emit slot_summary event: compact per-slot diagnose. */
  function slotSummary(data: SlotSummaryData): void {
    const payload: Record<string, unknown> = {
      slotKey: data.slotKey,
      finalSource: data.finalSource,
      countsByStage: data.countsByStage,
      topReasonsByStage: data.topReasonsByStage,
    };
    if (data.finalReasonKey) payload.finalReasonKey = data.finalReasonKey;
    if (data.candidateSample && data.candidateSample.length > 0) {
      payload.candidateSample = data.candidateSample.slice(
        0,
        CANDIDATE_SAMPLE_MAX,
      );
    }
    event('slot_summary', payload);
  }

  /** Emit run_diagnosis event: run-level aggregates. */
  function runDiagnosis(data: RunDiagnosisData): void {
    const payload: Record<string, unknown> = {
      slotsTotal: data.slotsTotal,
      slotsFromDb: data.slotsFromDb,
      slotsFromHistory: data.slotsFromHistory,
      slotsFromAi: data.slotsFromAi,
      reasonsHistogram: data.reasonsHistogram,
      issueCodesHistogram: data.issueCodesHistogram,
      dominantBlockers: data.dominantBlockers,
    };
    if (data.slotsFromAiFailed != null)
      payload.slotsFromAiFailed = data.slotsFromAiFailed;
    event('run_diagnosis', payload);
  }

  /** Safe debug metadata for API response (no PII, no absolute paths). */
  function getDebugMeta(): { runId: string; logFileRelativePath?: string } {
    const meta: { runId: string; logFileRelativePath?: string } = {
      runId: effectiveRunId,
    };
    if (
      logFilePath &&
      !fileWriteSkipped &&
      process.env.MEAL_PLANNER_LOG_TO_FILE === 'true'
    ) {
      try {
        meta.logFileRelativePath = relative(process.cwd(), logFilePath);
      } catch {
        /* ignore */
      }
    }
    return meta;
  }

  return {
    event,
    stage,
    candidateReject,
    topRejectReasons,
    slotSurvivors,
    slotRanking,
    slotSummary,
    runDiagnosis,
    getDebugMeta,
    runId: effectiveRunId,
    logFilePath,
    fileWriteSkipped: () => fileWriteSkipped,
    emitFileWriteSkipped(): void {
      if (fileWriteSkipped) {
        event('file_write_skipped', { reason: 'fs_not_writable' });
      }
    },
  };
}
