/**
 * Vercel Cron endpoint: run at most one due meal plan job per tick.
 * Protected by x-cron-secret header (CRON_SECRET env).
 * Logs each run to cron_ticks (service-role insert).
 *
 * @route GET /api/cron/meal-plan-jobs
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/src/lib/supabase/admin';
import { runOneDueMealPlanJobSystemAction } from '@/src/app/(app)/meal-plans/jobs/actions/mealPlanJobs.actions';

const CRON_NAME = 'meal_plan_jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function insertTick(payload: {
  status: 'ok' | 'error';
  outcome?: string | null;
  job_id?: string | null;
  user_id?: string | null;
  meal_plan_id?: string | null;
  error_code?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('cron_ticks').insert({
      cron_name: CRON_NAME,
      status: payload.status,
      outcome: payload.outcome ?? null,
      job_id: payload.job_id ?? null,
      user_id: payload.user_id ?? null,
      meal_plan_id: payload.meal_plan_id ?? null,
      error_code: payload.error_code ?? null,
    });
  } catch {
    // Non-blocking: log failure but do not fail the request
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'CRON_SECRET is not configured',
      },
      { status: 500 },
    );
  }

  const headerSecret = req.headers.get('x-cron-secret');
  if (headerSecret !== secret) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  try {
    const result = await runOneDueMealPlanJobSystemAction();

    if (result.ok) {
      const data = result.data;
      await insertTick({
        status: 'ok',
        outcome: data.outcome,
        job_id: 'jobId' in data ? data.jobId : null,
        user_id: 'userId' in data ? data.userId : null,
        meal_plan_id: 'mealPlanId' in data ? data.mealPlanId : null,
        error_code: 'errorCode' in data ? data.errorCode : null,
      });
    } else {
      await insertTick({
        status: 'error',
        error_code: result.error.code,
      });
      return NextResponse.json(
        {
          ok: false,
          error: result.error.message,
          code: result.error.code,
        },
        { status: 503 },
      );
    }

    const data = result.data;
    const body: {
      ok: true;
      outcome: string;
      jobId?: string;
      userId?: string;
      mealPlanId?: string;
      errorCode?: string;
    } = {
      ok: true,
      outcome: data.outcome,
    };
    if (
      data.outcome === 'succeeded' &&
      'jobId' in data &&
      'mealPlanId' in data
    ) {
      body.jobId = data.jobId;
      body.userId = data.userId;
      body.mealPlanId = data.mealPlanId;
    }
    if (data.outcome === 'failed' && 'jobId' in data && 'errorCode' in data) {
      body.jobId = data.jobId;
      body.userId = data.userId;
      body.errorCode = data.errorCode;
    }

    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    await insertTick({
      status: 'error',
      error_code: err instanceof Error ? err.message.slice(0, 64) : 'EXCEPTION',
    });
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
