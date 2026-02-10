-- User-defined pantry storage locations (e.g. Koelkast, Kast, Lade).
-- Replaces fixed enum storage_location on pantry_items with user-managed list.

CREATE TABLE IF NOT EXISTS public.user_pantry_locations (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_pantry_locations_user_id
  ON public.user_pantry_locations(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_pantry_locations_user_sort
  ON public.user_pantry_locations(user_id, sort_order);

COMMENT ON TABLE public.user_pantry_locations IS 'User-defined storage locations for pantry items (e.g. Koelkast, Kast).';

ALTER TABLE public.user_pantry_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own pantry locations" ON public.user_pantry_locations;
CREATE POLICY "Users can manage own pantry locations"
  ON public.user_pantry_locations
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
