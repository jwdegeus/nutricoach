'use server';

import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import { createAdminClient } from '@/src/lib/supabase/admin';
import { createInboxNotificationAction } from '@/src/app/(app)/inbox/actions/inboxNotifications.actions';
import { MealPlansService } from '@/src/lib/meal-plans/mealPlans.service';
import { AppError } from '@/src/lib/errors/app-error';

/** Explicit columns for due-job select (no SELECT *) */
const JOB_CLAIM_SELECT_COLUMNS =
  'id,user_id,scheduled_for,attempt,max_attempts,request_snapshot';

const claimNextMealPlanJobInputSchema = z.object({
  nowIso: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Ongeldige ISO datum')
    .optional(),
  lockId: z.string().min(8).max(64),
});

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code:
          | 'AUTH_ERROR'
          | 'VALIDATION_ERROR'
          | 'DB_ERROR'
          | 'NOT_FOUND_OR_LOCK_MISMATCH'
          | 'MEAL_PLAN_JOB_INVALID_STATE'
          | 'JOB_RUN_FAILED';
        message: string;
      };
    };

/** Claimed job payload (camelCase) */
export type ClaimedMealPlanJob = {
  id: string;
  scheduledFor: string;
  attempt: number;
  maxAttempts: number;
  requestSnapshot: Record<string, unknown> | null;
};

/**
 * Atomically claim at most one due meal plan generation job for the current user.
 * Returns { ok: true, data: null } when no due job or race lost (no error).
 */
export async function claimNextMealPlanJobAction(
  raw: unknown,
): Promise<ActionResult<ClaimedMealPlanJob | null>> {
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
          message: 'Je moet ingelogd zijn om een job te claimen',
        },
      };
    }

    let input: z.infer<typeof claimNextMealPlanJobInputSchema>;
    try {
      input = claimNextMealPlanJobInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input (lockId 8–64 tekens, nowIso optioneel ISO)',
        },
      };
    }

    const nowIso = input.nowIso ?? new Date().toISOString();
    const lockId = input.lockId;

    const { data: candidates, error: selectError } = await supabase
      .from('meal_plan_generation_jobs')
      .select(JOB_CLAIM_SELECT_COLUMNS)
      .eq('status', 'scheduled')
      .eq('user_id', user.id)
      .lte('scheduled_for', nowIso)
      .is('locked_at', null)
      .order('scheduled_for', { ascending: true })
      .limit(10);

    if (selectError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Jobs ophalen mislukt: ${selectError.message}`,
        },
      };
    }

    const rows = (candidates ?? []) as Array<{
      id: string;
      user_id: string;
      scheduled_for: string;
      attempt: number;
      max_attempts: number;
      request_snapshot: Record<string, unknown> | null;
    }>;

    const job = rows.find((r) => r.attempt < r.max_attempts) ?? null;
    if (!job) {
      return { ok: true, data: null };
    }

    const { data: updated, error: updateError } = await supabase
      .from('meal_plan_generation_jobs')
      .update({
        status: 'running',
        locked_at: nowIso,
        locked_by: lockId,
        attempt: job.attempt + 1,
        updated_at: nowIso,
      })
      .eq('id', job.id)
      .eq('status', 'scheduled')
      .is('locked_at', null)
      .eq('attempt', job.attempt)
      .select('id,scheduled_for,attempt,max_attempts,request_snapshot')
      .maybeSingle();

    if (updateError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Job claimen mislukt: ${updateError.message}`,
        },
      };
    }

    if (!updated) {
      return { ok: true, data: null };
    }

    const row = updated as {
      id: string;
      scheduled_for: string;
      attempt: number;
      max_attempts: number;
      request_snapshot: Record<string, unknown> | null;
    };

    return {
      ok: true,
      data: {
        id: row.id,
        scheduledFor: row.scheduled_for,
        attempt: row.attempt,
        maxAttempts: row.max_attempts,
        requestSnapshot: row.request_snapshot,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij claimen van job',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// completeMealPlanJobAction / failMealPlanJobAction
// ---------------------------------------------------------------------------

const completeMealPlanJobInputSchema = z.object({
  jobId: z.string().uuid(),
  lockId: z.string().min(8).max(64),
  mealPlanId: z.string().uuid().optional(),
});

const failMealPlanJobInputSchema = z.object({
  jobId: z.string().uuid(),
  lockId: z.string().min(8).max(64),
  errorCode: z.string().min(1).max(64),
  errorMessage: z.string().min(1).max(500),
});

/** Return payload for complete/fail actions */
type JobStatusResult = { status: string };

/**
 * Mark a claimed job as succeeded. Preconditions: job.status='running', locked_by=lockId.
 * Clears last_error_*; optionally sets meal_plan_id.
 */
export async function completeMealPlanJobAction(
  raw: unknown,
): Promise<ActionResult<JobStatusResult>> {
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
          message: 'Je moet ingelogd zijn om een job af te ronden',
        },
      };
    }

    let input: z.infer<typeof completeMealPlanJobInputSchema>;
    try {
      input = completeMealPlanJobInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input (jobId uuid, lockId 8–64, mealPlanId optioneel)',
        },
      };
    }

    const nowIso = new Date().toISOString();
    const updatePayload: {
      status: string;
      meal_plan_id: string | null;
      last_error_code: null;
      last_error_message: null;
      updated_at: string;
    } = {
      status: 'succeeded',
      meal_plan_id: input.mealPlanId ?? null,
      last_error_code: null,
      last_error_message: null,
      updated_at: nowIso,
    };

    const { data: updated, error: updateError } = await supabase
      .from('meal_plan_generation_jobs')
      .update(updatePayload)
      .eq('id', input.jobId)
      .eq('status', 'running')
      .eq('locked_by', input.lockId)
      .select('id,status')
      .maybeSingle();

    if (updateError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Job voltooien mislukt: ${updateError.message}`,
        },
      };
    }

    if (!updated) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND_OR_LOCK_MISMATCH',
          message: 'Job niet gevonden of lock komt niet overeen',
        },
      };
    }

    const row = updated as { id: string; status: string };
    return { ok: true, data: { status: row.status } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij voltooien van job',
      },
    };
  }
}

/**
 * Mark a claimed job as failed (or reschedule if attempt < max_attempts).
 * Preconditions: job.status='running', locked_by=lockId.
 * Resets locked_at/locked_by so job can be re-claimed when rescheduled.
 */
export async function failMealPlanJobAction(
  raw: unknown,
): Promise<ActionResult<JobStatusResult>> {
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
          message: 'Je moet ingelogd zijn om een job als mislukt te markeren',
        },
      };
    }

    let input: z.infer<typeof failMealPlanJobInputSchema>;
    try {
      input = failMealPlanJobInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input (jobId, lockId 8–64, errorCode 1–64, errorMessage 1–500)',
        },
      };
    }

    const { data: job, error: selectError } = await supabase
      .from('meal_plan_generation_jobs')
      .select('id,attempt,max_attempts')
      .eq('id', input.jobId)
      .eq('status', 'running')
      .eq('locked_by', input.lockId)
      .maybeSingle();

    if (selectError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Job ophalen mislukt: ${selectError.message}`,
        },
      };
    }

    if (!job) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND_OR_LOCK_MISMATCH',
          message: 'Job niet gevonden of lock komt niet overeen',
        },
      };
    }

    const row = job as { id: string; attempt: number; max_attempts: number };
    const nextStatus = row.attempt >= row.max_attempts ? 'failed' : 'scheduled';
    const nowIso = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from('meal_plan_generation_jobs')
      .update({
        status: nextStatus,
        locked_at: null,
        locked_by: null,
        last_error_code: input.errorCode,
        last_error_message: input.errorMessage,
        updated_at: nowIso,
      })
      .eq('id', input.jobId)
      .eq('status', 'running')
      .eq('locked_by', input.lockId)
      .select('id,status')
      .maybeSingle();

    if (updateError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Job als mislukt markeren mislukt: ${updateError.message}`,
        },
      };
    }

    if (!updated) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND_OR_LOCK_MISMATCH',
          message: 'Job niet gevonden of lock komt niet overeen',
        },
      };
    }

    if (nextStatus === 'failed') {
      try {
        await createInboxNotificationAction({
          type: 'meal_plan_generation_failed',
          title: 'Weekmenu generatie mislukt',
          message: 'De automatische generatie is mislukt. Probeer opnieuw.',
          details: { runId: input.jobId, errorCode: input.errorCode },
        });
      } catch {
        // Non-blocking: action still returns { ok: true, data: { status: 'failed' } }
      }
    }

    const out = updated as { id: string; status: string };
    return { ok: true, data: { status: out.status } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij markeren van job als mislukt',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// listMealPlanJobsForUserAction
// ---------------------------------------------------------------------------

/** Explicit columns for jobs list (no SELECT *) */
const JOB_LIST_SELECT_COLUMNS =
  'id,status,scheduled_for,attempt,max_attempts,locked_at,locked_by,last_error_code,created_at,updated_at,request_snapshot,meal_plan_id';

/** Job row for UI (camelCase) */
export type JobRow = {
  id: string;
  status: string;
  scheduledFor: string;
  attempt: number;
  maxAttempts: number;
  lockedAt: string | null;
  lockedBy: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  requestSnapshot: Record<string, unknown> | null;
  mealPlanId: string | null;
};

const listMealPlanJobsInputSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
});

/**
 * List meal plan generation jobs for the current user (read-only).
 */
export async function listMealPlanJobsForUserAction(
  raw: unknown,
): Promise<ActionResult<JobRow[]>> {
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
          message: 'Je moet ingelogd zijn om jobs te bekijken',
        },
      };
    }

    const input = listMealPlanJobsInputSchema.parse(raw ?? {});
    const limit = input.limit ?? 20;

    const { data, error } = await supabase
      .from('meal_plan_generation_jobs')
      .select(JOB_LIST_SELECT_COLUMNS)
      .eq('user_id', user.id)
      .order('scheduled_for', { ascending: false })
      .limit(limit);

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Jobs ophalen mislukt: ${error.message}`,
        },
      };
    }

    const rows = (data ?? []) as Array<{
      id: string;
      status: string;
      scheduled_for: string;
      attempt: number;
      max_attempts: number;
      locked_at: string | null;
      locked_by: string | null;
      last_error_code: string | null;
      created_at: string;
      updated_at: string;
      request_snapshot: Record<string, unknown> | null;
      meal_plan_id: string | null;
    }>;

    const list: JobRow[] = rows.map((r) => ({
      id: r.id,
      status: r.status,
      scheduledFor: r.scheduled_for,
      attempt: r.attempt,
      maxAttempts: r.max_attempts,
      lockedAt: r.locked_at,
      lockedBy: r.locked_by,
      lastErrorCode: r.last_error_code,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      requestSnapshot: r.request_snapshot,
      mealPlanId: r.meal_plan_id ?? null,
    }));

    return { ok: true, data: list };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij ophalen van jobs',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// runMealPlanJobNowAction (claim + run in one call)
// ---------------------------------------------------------------------------

/** Minimal columns for claim check (no SELECT *) */
const JOB_CLAIM_CHECK_COLUMNS = 'id,status,attempt,max_attempts,locked_at';

const runMealPlanJobNowInputSchema = z.object({
  jobId: z.string().uuid(),
});

/** Success: mealPlanId when run succeeded */
type RunJobNowSuccessResult = { status: 'succeeded'; mealPlanId: string };

/**
 * Claim a single job (if claimable) and run it. No cron loop; "run 1 job now".
 * Claimable: status in ('scheduled','failed'), locked_at is null, attempt < max_attempts.
 */
export async function runMealPlanJobNowAction(
  raw: unknown,
): Promise<ActionResult<RunJobNowSuccessResult | null>> {
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
          message: 'Je moet ingelogd zijn om een job uit te voeren',
        },
      };
    }

    let input: z.infer<typeof runMealPlanJobNowInputSchema>;
    try {
      input = runMealPlanJobNowInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input (jobId uuid)',
        },
      };
    }

    const { data: job, error: selectError } = await supabase
      .from('meal_plan_generation_jobs')
      .select(JOB_CLAIM_CHECK_COLUMNS)
      .eq('id', input.jobId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (selectError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Job ophalen mislukt: ${selectError.message}`,
        },
      };
    }

    if (!job) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND_OR_LOCK_MISMATCH',
          message: 'Job niet gevonden',
        },
      };
    }

    const row = job as {
      id: string;
      status: string;
      attempt: number;
      max_attempts: number;
      locked_at: string | null;
    };

    if (row.status !== 'scheduled' && row.status !== 'failed') {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND_OR_LOCK_MISMATCH',
          message: 'Job is niet claimbaar (status niet scheduled/failed)',
        },
      };
    }
    if (row.locked_at != null) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND_OR_LOCK_MISMATCH',
          message: 'Job is al in gebruik',
        },
      };
    }

    if (row.attempt >= row.max_attempts) {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_JOB_INVALID_STATE',
          message: 'Geen pogingen meer over voor deze job',
        },
      };
    }

    const lockId = globalThis.crypto
      .randomUUID()
      .replace(/-/g, '')
      .slice(0, 24);
    const nowIso = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from('meal_plan_generation_jobs')
      .update({
        status: 'running',
        locked_at: nowIso,
        locked_by: lockId,
        attempt: row.attempt + 1,
        updated_at: nowIso,
      })
      .eq('id', input.jobId)
      .eq('status', row.status)
      .is('locked_at', null)
      .eq('attempt', row.attempt)
      .select('id')
      .maybeSingle();

    if (updateError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Job claimen mislukt: ${updateError.message}`,
        },
      };
    }

    if (!updated) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND_OR_LOCK_MISMATCH',
          message: 'Job kon niet geclaimd worden (race of niet meer claimbaar)',
        },
      };
    }

    const runResult = await runClaimedMealPlanJobAction({
      jobId: input.jobId,
      lockId,
    });

    if (!runResult.ok) {
      return runResult;
    }
    return { ok: true, data: runResult.data };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          err instanceof Error ? err.message : 'Fout bij uitvoeren van job',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// runOneDueMealPlanJobAction (cron tick: claim + run 1 due job)
// ---------------------------------------------------------------------------

export type RunOneDueResult =
  | { outcome: 'no_due_job' }
  | { outcome: 'succeeded'; jobId: string; mealPlanId: string }
  | { outcome: 'failed'; jobId: string; errorCode: string };

/**
 * Claim and run exactly one due meal plan job (cron-tick style).
 * Use for manual testing without real cron. Returns compact outcome.
 */
export async function runOneDueMealPlanJobAction(): Promise<
  ActionResult<RunOneDueResult>
> {
  try {
    const lockId = globalThis.crypto
      .randomUUID()
      .replace(/-/g, '')
      .slice(0, 24);

    const claimResult = await claimNextMealPlanJobAction({ lockId });

    if (!claimResult.ok) {
      return claimResult;
    }

    if (claimResult.data === null) {
      return { ok: true, data: { outcome: 'no_due_job' } };
    }

    const claimed = claimResult.data;
    const runResult = await runClaimedMealPlanJobAction({
      jobId: claimed.id,
      lockId,
    });

    if (runResult.ok) {
      return {
        ok: true,
        data: {
          outcome: 'succeeded',
          jobId: claimed.id,
          mealPlanId: runResult.data.mealPlanId,
        },
      };
    }

    return {
      ok: true,
      data: {
        outcome: 'failed',
        jobId: claimed.id,
        errorCode: runResult.error.code,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij uitvoeren due job',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// runOneDueMealPlanJobSystemAction (cron: no user context, service-role)
// ---------------------------------------------------------------------------

/** Explicit columns for system due-job select (no SELECT *) */
const JOB_SYSTEM_DUE_SELECT_COLUMNS =
  'id,user_id,scheduled_for,attempt,max_attempts,request_snapshot';

/** Minimal columns for draft post-processing (no SELECT *) */
const MEAL_PLAN_DRAFT_CHECK_COLUMNS =
  'id,status,plan_snapshot,draft_plan_snapshot';

/**
 * Ensure meal plan is in draft (auto-review default for cron-generated plans).
 * Idempotent: if already draft with draft_plan_snapshot set, no update.
 * Throws if plan not found, plan_snapshot is null, or update fails.
 */
async function ensurePlanIsInDraft(
  admin: ReturnType<typeof createAdminClient>,
  planId: string,
): Promise<void> {
  const { data: plan, error: fetchError } = await admin
    .from('meal_plans')
    .select(MEAL_PLAN_DRAFT_CHECK_COLUMNS)
    .eq('id', planId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Meal plan ophalen mislukt: ${fetchError.message}`);
  }

  if (!plan) {
    throw new Error('Meal plan niet gevonden');
  }

  const row = plan as {
    id: string;
    status: string | null;
    plan_snapshot: unknown;
    draft_plan_snapshot: unknown;
  };

  if (row.status === 'draft' && row.draft_plan_snapshot != null) {
    return;
  }

  if (row.plan_snapshot == null) {
    throw new Error('plan_snapshot ontbreekt');
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from('meal_plans')
    .update({
      status: 'draft',
      draft_plan_snapshot: row.plan_snapshot,
      draft_created_at: now,
      updated_at: now,
    })
    .eq('id', planId);

  if (updateError) {
    throw new Error(`Draft instellen mislukt: ${updateError.message}`);
  }
}

export type RunOneDueSystemResult =
  | { outcome: 'no_due_job' }
  | { outcome: 'succeeded'; jobId: string; userId: string; mealPlanId: string }
  | { outcome: 'failed'; jobId: string; userId: string; errorCode: string };

/**
 * Claim and run exactly one due meal plan job using service-role (no user session).
 * For use by cron endpoint only. Returns compact outcome.
 */
export async function runOneDueMealPlanJobSystemAction(): Promise<
  ActionResult<RunOneDueSystemResult>
> {
  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const lockId = globalThis.crypto
      .randomUUID()
      .replace(/-/g, '')
      .slice(0, 24);

    const { data: candidates, error: selectError } = await admin
      .from('meal_plan_generation_jobs')
      .select(JOB_SYSTEM_DUE_SELECT_COLUMNS)
      .eq('status', 'scheduled')
      .lte('scheduled_for', nowIso)
      .is('locked_at', null)
      .order('scheduled_for', { ascending: true })
      .limit(10);

    if (selectError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Jobs ophalen mislukt: ${selectError.message}`,
        },
      };
    }

    const rows = (candidates ?? []) as Array<{
      id: string;
      user_id: string;
      scheduled_for: string;
      attempt: number;
      max_attempts: number;
      request_snapshot: Record<string, unknown> | null;
    }>;
    const job = rows.find((r) => r.attempt < r.max_attempts) ?? null;

    if (!job) {
      return { ok: true, data: { outcome: 'no_due_job' } };
    }

    const { data: updated, error: updateError } = await admin
      .from('meal_plan_generation_jobs')
      .update({
        status: 'running',
        locked_at: nowIso,
        locked_by: lockId,
        attempt: job.attempt + 1,
        updated_at: nowIso,
      })
      .eq('id', job.id)
      .eq('status', 'scheduled')
      .is('locked_at', null)
      .eq('attempt', job.attempt)
      .select('id,user_id,attempt,max_attempts,request_snapshot')
      .maybeSingle();

    if (updateError || !updated) {
      return { ok: true, data: { outcome: 'no_due_job' } };
    }

    const claimed = updated as {
      id: string;
      user_id: string;
      attempt: number;
      max_attempts: number;
      request_snapshot: Record<string, unknown> | null;
    };

    const snapshot = claimed.request_snapshot;
    const weekStart =
      snapshot &&
      typeof snapshot === 'object' &&
      'week_start' in snapshot &&
      typeof (snapshot as { week_start?: unknown }).week_start === 'string'
        ? (snapshot as { week_start: string }).week_start
        : null;

    if (!weekStart) {
      await systemFailJob(
        admin,
        claimed.id,
        claimed.attempt,
        claimed.max_attempts,
        lockId,
        'MEAL_PLAN_JOB_INVALID_STATE',
        'request_snapshot.week_start ontbreekt',
        claimed.user_id,
      );
      return {
        ok: true,
        data: {
          outcome: 'failed',
          jobId: claimed.id,
          userId: claimed.user_id,
          errorCode: 'MEAL_PLAN_JOB_INVALID_STATE',
        },
      };
    }

    const days =
      typeof snapshot === 'object' &&
      snapshot &&
      'days' in snapshot &&
      typeof (snapshot as { days?: unknown }).days === 'number'
        ? (snapshot as { days: number }).days
        : 7;

    let planId: string;
    try {
      const service = new MealPlansService();
      const result = await service.createPlanForUser(
        claimed.user_id,
        { dateFrom: weekStart, days },
        admin,
      );
      planId = result.planId;
      await ensurePlanIsInDraft(admin, planId);
    } catch (error) {
      const errorCode =
        error instanceof AppError ? String(error.code).slice(0, 64) : 'UNKNOWN';
      const errorMessage = (
        error instanceof AppError
          ? error.safeMessage
          : error instanceof Error
            ? error.message
            : 'Unknown error'
      ).slice(0, 500);
      await systemFailJob(
        admin,
        claimed.id,
        claimed.attempt,
        claimed.max_attempts,
        lockId,
        errorCode,
        errorMessage,
        claimed.user_id,
      );
      return {
        ok: true,
        data: {
          outcome: 'failed',
          jobId: claimed.id,
          userId: claimed.user_id,
          errorCode,
        },
      };
    }

    const nowIso2 = new Date().toISOString();
    const { error: completeError } = await admin
      .from('meal_plan_generation_jobs')
      .update({
        status: 'succeeded',
        meal_plan_id: planId,
        last_error_code: null,
        last_error_message: null,
        updated_at: nowIso2,
      })
      .eq('id', claimed.id)
      .eq('status', 'running')
      .eq('locked_by', lockId);

    if (completeError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Job voltooien mislukt: ${completeError.message}`,
        },
      };
    }

    try {
      await admin.from('user_inbox_notifications').insert({
        user_id: claimed.user_id,
        type: 'meal_plan_ready_for_review',
        title: 'Nieuw weekmenu klaar (concept)',
        message: 'Er staat een nieuw concept-weekmenu klaar om te reviewen.',
        details: { planId, runId: claimed.id },
      });
    } catch {
      // Non-blocking: job stays succeeded
    }

    return {
      ok: true,
      data: {
        outcome: 'succeeded',
        jobId: claimed.id,
        userId: claimed.user_id,
        mealPlanId: planId,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij uitvoeren due job (system)',
      },
    };
  }
}

/** Internal: mark claimed job as failed/rescheduled and optionally create inbox notification. */
async function systemFailJob(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  attempt: number,
  maxAttempts: number,
  lockId: string,
  errorCode: string,
  errorMessage: string,
  userId: string,
): Promise<void> {
  const nextStatus = attempt >= maxAttempts ? 'failed' : 'scheduled';
  const nowIso = new Date().toISOString();
  await admin
    .from('meal_plan_generation_jobs')
    .update({
      status: nextStatus,
      locked_at: null,
      locked_by: null,
      last_error_code: errorCode,
      last_error_message: errorMessage,
      updated_at: nowIso,
    })
    .eq('id', jobId)
    .eq('status', 'running')
    .eq('locked_by', lockId);

  if (nextStatus === 'failed') {
    try {
      await admin.from('user_inbox_notifications').insert({
        user_id: userId,
        type: 'meal_plan_generation_failed',
        title: 'Weekmenu generatie mislukt',
        message: 'De automatische generatie is mislukt. Probeer opnieuw.',
        details: { runId: jobId, errorCode },
      });
    } catch {
      // Non-blocking
    }
  }
}

// ---------------------------------------------------------------------------
// runClaimedMealPlanJobAction
// ---------------------------------------------------------------------------

/** Explicit columns for runner job load (no SELECT *) */
const JOB_RUN_SELECT_COLUMNS =
  'id,user_id,status,locked_by,scheduled_for,request_snapshot';

const runClaimedMealPlanJobInputSchema = z.object({
  jobId: z.string().uuid(),
  lockId: z.string().min(8).max(64),
});

/** Result when run succeeds */
type RunJobSuccessResult = { status: 'succeeded'; mealPlanId: string };

/**
 * Execute a claimed meal plan generation job: run existing create path, then complete or fail.
 * Reuses MealPlansService.createPlanForUser (no HTTP/action); complete/fail update job state.
 */
export async function runClaimedMealPlanJobAction(
  raw: unknown,
): Promise<ActionResult<RunJobSuccessResult>> {
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
          message: 'Je moet ingelogd zijn om een job uit te voeren',
        },
      };
    }

    let input: z.infer<typeof runClaimedMealPlanJobInputSchema>;
    try {
      input = runClaimedMealPlanJobInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input (jobId uuid, lockId 8–64)',
        },
      };
    }

    const { data: job, error: selectError } = await supabase
      .from('meal_plan_generation_jobs')
      .select(JOB_RUN_SELECT_COLUMNS)
      .eq('id', input.jobId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (selectError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Job ophalen mislukt: ${selectError.message}`,
        },
      };
    }

    if (!job) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND_OR_LOCK_MISMATCH',
          message: 'Job niet gevonden',
        },
      };
    }

    const row = job as {
      id: string;
      user_id: string;
      status: string;
      locked_by: string | null;
      scheduled_for: string;
      request_snapshot: Record<string, unknown> | null;
    };

    if (row.status !== 'running' || row.locked_by !== input.lockId) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND_OR_LOCK_MISMATCH',
          message: 'Job niet in running state of lock komt niet overeen',
        },
      };
    }

    const snapshot = row.request_snapshot;
    const weekStart =
      snapshot &&
      typeof snapshot === 'object' &&
      'week_start' in snapshot &&
      typeof (snapshot as { week_start?: unknown }).week_start === 'string'
        ? (snapshot as { week_start: string }).week_start
        : null;

    if (!weekStart) {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_JOB_INVALID_STATE',
          message: 'Job request_snapshot.week_start ontbreekt',
        },
      };
    }

    const days =
      typeof snapshot === 'object' &&
      snapshot &&
      'days' in snapshot &&
      typeof (snapshot as { days?: unknown }).days === 'number'
        ? (snapshot as { days: number }).days
        : 7;

    const createInput = {
      dateFrom: weekStart,
      days,
    };

    let planId: string;
    try {
      const service = new MealPlansService();
      const result = await service.createPlanForUser(user.id, createInput);
      planId = result.planId;
    } catch (error) {
      const errorCode =
        error instanceof AppError ? String(error.code).slice(0, 64) : 'UNKNOWN';
      const errorMessage = (
        error instanceof AppError
          ? error.safeMessage
          : error instanceof Error
            ? error.message
            : 'Unknown error'
      ).slice(0, 500);

      await failMealPlanJobAction({
        jobId: input.jobId,
        lockId: input.lockId,
        errorCode,
        errorMessage,
      });

      return {
        ok: false,
        error: {
          code: 'JOB_RUN_FAILED',
          message: errorMessage,
        },
      };
    }

    await completeMealPlanJobAction({
      jobId: input.jobId,
      lockId: input.lockId,
      mealPlanId: planId,
    });

    return {
      ok: true,
      data: { status: 'succeeded', mealPlanId: planId },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij uitvoeren van job',
      },
    };
  }
}
