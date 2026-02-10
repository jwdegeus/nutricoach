-- Add optional avatar URL to family members (profielfoto).
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;

COMMENT ON COLUMN public.family_members.avatar_url IS 'Optional profile photo URL (e.g. Vercel Blob or local upload).';
