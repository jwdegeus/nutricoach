/**
 * Web Vitals telemetry endpoint (privacy-safe).
 * Only active in production when NEXT_PUBLIC_VITALS=1.
 * Logs compact to Vercel logs for route-level performance follow-ups.
 */

import { type NextRequest, NextResponse } from 'next/server';

const ALLOWED_NAMES = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;

type VitalsPayload = {
  name: string;
  value: number;
  rating?: string;
  delta?: number;
  id?: string;
  navigationType?: string;
  pathname?: string;
};

function isValidPayload(body: unknown): body is VitalsPayload {
  if (!body || typeof body !== 'object') return false;
  const p = body as Record<string, unknown>;
  const value = p.value;
  return (
    typeof p.name === 'string' &&
    ALLOWED_NAMES.includes(p.name as (typeof ALLOWED_NAMES)[number]) &&
    typeof value === 'number' &&
    isFinite(value)
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as unknown;
    if (!isValidPayload(body)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const pathname =
      typeof body.pathname === 'string' && body.pathname.startsWith('/')
        ? body.pathname
        : '/';
    const rating = body.rating ?? '-';
    const delta = body.delta ?? body.value;

    console.info(
      `[vitals] ${body.name} ${body.value.toFixed(0)} ${rating} delta=${delta.toFixed(0)} path=${pathname}`,
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
