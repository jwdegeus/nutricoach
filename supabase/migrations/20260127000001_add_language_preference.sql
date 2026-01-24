-- Migration: Add language preference to user_preferences
-- Created: 2026-01-27
-- Description: Adds language field to store user's preferred language (nl or en)

ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'nl' CHECK (language IN ('nl', 'en'));

-- Create index for language queries (optional, but can be useful)
CREATE INDEX IF NOT EXISTS idx_user_preferences_language ON public.user_preferences(language);

-- Update existing records to have 'nl' as default if NULL (shouldn't happen due to DEFAULT, but safe)
UPDATE public.user_preferences
SET language = 'nl'
WHERE language IS NULL;
