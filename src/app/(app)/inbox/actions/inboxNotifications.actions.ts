'use server';

import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';

/** Explicit columns for list (no SELECT *) */
const INBOX_LIST_COLUMNS = 'id,type,title,message,details,is_read,created_at';

/** Notification record returned by list (camelCase) */
export type InboxNotificationRecord = {
  id: string;
  type: string;
  title: string;
  message: string;
  details: { planId?: string; runId?: string; errorCode?: string } | null;
  isRead: boolean;
  createdAt: string;
};

/** Allowed keys for details (no PII) */
const detailsSchema = z
  .object({
    planId: z.string().uuid().optional(),
    runId: z.string().uuid().optional(),
    errorCode: z.string().max(64).optional(),
  })
  .optional();

const createInboxNotificationInputSchema = z.object({
  type: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  message: z.string().min(1).max(500),
  details: detailsSchema,
});

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR';
        message: string;
      };
    };

/**
 * Create one inbox notification for the current user.
 * RLS: insert in user-context (user_id = auth.uid()).
 */
export async function createInboxNotificationAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
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
          message: 'Je moet ingelogd zijn om een notificatie aan te maken',
        },
      };
    }

    let input: z.infer<typeof createInboxNotificationInputSchema>;
    try {
      input = createInboxNotificationInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input voor notificatie',
        },
      };
    }

    const detailsPayload =
      input.details == null
        ? null
        : {
            ...(input.details.planId != null && {
              planId: input.details.planId,
            }),
            ...(input.details.runId != null && { runId: input.details.runId }),
            ...(input.details.errorCode != null && {
              errorCode: input.details.errorCode,
            }),
          };

    const { data, error: insertError } = await supabase
      .from('user_inbox_notifications')
      .insert({
        user_id: user.id,
        type: input.type,
        title: input.title,
        message: input.message,
        details: detailsPayload,
      })
      .select('id')
      .single();

    if (insertError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Notificatie aanmaken mislukt: ${insertError.message}`,
        },
      };
    }

    if (!data?.id) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Notificatie aanmaken mislukt: geen id terug',
        },
      };
    }

    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij aanmaken notificatie',
      },
    };
  }
}

const listInboxNotificationsInputSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
});

/**
 * List inbox notifications for the current user.
 * RLS: user-context; only own rows.
 */
export async function listInboxNotificationsAction(
  raw: unknown,
): Promise<ActionResult<InboxNotificationRecord[]>> {
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
          message: 'Je moet ingelogd zijn om notificaties te bekijken',
        },
      };
    }

    const input = listInboxNotificationsInputSchema.parse(raw ?? {});
    const limit = input.limit ?? 20;

    const { data, error } = await supabase
      .from('user_inbox_notifications')
      .select(INBOX_LIST_COLUMNS)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Notificaties ophalen mislukt: ${error.message}`,
        },
      };
    }

    const rows = (data ?? []) as Array<{
      id: string;
      type: string;
      title: string;
      message: string;
      details: { planId?: string; runId?: string; errorCode?: string } | null;
      is_read: boolean;
      created_at: string;
    }>;

    const notifications: InboxNotificationRecord[] = rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      details: row.details,
      isRead: row.is_read,
      createdAt: row.created_at,
    }));

    return { ok: true, data: notifications };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            error.errors.map((e) => e.message).join('; ') || 'Ongeldige limit',
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij ophalen notificaties',
      },
    };
  }
}

const markReadInputSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Mark one inbox notification as read.
 * RLS: user-context; only own rows.
 */
export async function markInboxNotificationReadAction(
  raw: unknown,
): Promise<ActionResult<Record<string, never>>> {
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
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const input = markReadInputSchema.parse(raw);

    const { error } = await supabase
      .from('user_inbox_notifications')
      .update({ is_read: true })
      .eq('id', input.id)
      .eq('user_id', user.id);

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Markeren als gelezen mislukt: ${error.message}`,
        },
      };
    }

    return { ok: true, data: {} };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            error.errors.map((e) => e.message).join('; ') || 'Ongeldige id',
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij markeren als gelezen',
      },
    };
  }
}
