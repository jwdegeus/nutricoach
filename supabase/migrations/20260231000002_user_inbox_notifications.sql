-- Migration: User Inbox Notifications
-- Description: Tabel voor inbox-notificaties (bijv. meal plan generatie mislukt).
--              Server actions in user-context kunnen INSERT doen met user_id = auth.uid().

-- ============================================================================
-- Table: user_inbox_notifications
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_inbox_notifications (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,       -- e.g. 'meal_plan_generation_failed'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB NULL,       -- safe metadata only: planId, runId, errorCode (no PII)
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_inbox_notifications_user_id ON public.user_inbox_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_inbox_notifications_user_read_created ON public.user_inbox_notifications(user_id, is_read, created_at DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.user_inbox_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view own notifications
CREATE POLICY "Users can view own inbox notifications"
  ON public.user_inbox_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert own notifications (server actions in user-context)
CREATE POLICY "Users can insert own inbox notifications"
  ON public.user_inbox_notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update own notifications (e.g. mark as read)
CREATE POLICY "Users can update own inbox notifications"
  ON public.user_inbox_notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete own notifications
CREATE POLICY "Users can delete own inbox notifications"
  ON public.user_inbox_notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Verification (commented; run manually if needed)
-- ============================================================================
-- Insert test row (as authenticated user):
--   INSERT INTO public.user_inbox_notifications (user_id, type, title, message, details)
--   VALUES (auth.uid(), 'meal_plan_generation_failed', 'Test', 'Test message', '{"planId": null, "runId": null, "errorCode": "TEST"}'::jsonb);
--
-- Select unread count:
--   SELECT COUNT(*) FROM public.user_inbox_notifications WHERE user_id = auth.uid() AND is_read = false;
--
-- Update is_read:
--   UPDATE public.user_inbox_notifications SET is_read = true WHERE id = '<id>' AND user_id = auth.uid();
