-- Allow authenticated users to add their own AI-generated custom foods (recipe flow).
-- Admins keep full insert/update/delete; users can insert with created_by = auth.uid().

ALTER TABLE public.custom_foods
  ADD COLUMN IF NOT EXISTS created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_custom_foods_created_by ON public.custom_foods(created_by);

-- Authenticated users can insert custom_foods when they set created_by to their own user id
CREATE POLICY "Users can insert own custom_foods"
  ON public.custom_foods
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());
