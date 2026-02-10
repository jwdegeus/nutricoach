-- Replace pantry_items.storage_location (enum) with storage_location_id (FK to user_pantry_locations).
-- 1) Add new column
-- 2) Create default locations per user and backfill
-- 3) Drop old column and constraint

ALTER TABLE public.pantry_items
  ADD COLUMN IF NOT EXISTS storage_location_id UUID NULL REFERENCES public.user_pantry_locations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pantry_items.storage_location_id IS 'User-defined storage location (e.g. Koelkast, Kast).';

-- Create default locations for each user who has pantry_items (so every user gets the 4 defaults).
-- Names match current UI labels (NL); sort_order maps to old enum: 0=fridge, 1=freezer, 2=drawer, 3=cupboard.
INSERT INTO public.user_pantry_locations (user_id, name, sort_order)
  SELECT u.user_id, d.name, d.sort_order
  FROM (SELECT DISTINCT user_id FROM public.pantry_items) u
  CROSS JOIN (
    VALUES ('Koelkast', 0), ('Vriezer', 1), ('Lade', 2), ('Kast', 3)
  ) AS d(name, sort_order)
  ON CONFLICT (user_id, sort_order) DO NOTHING;

-- Backfill: set storage_location_id from current storage_location
UPDATE public.pantry_items p
SET storage_location_id = (
  SELECT l.id FROM public.user_pantry_locations l
  WHERE l.user_id = p.user_id
  AND l.sort_order = CASE p.storage_location
    WHEN 'fridge' THEN 0
    WHEN 'freezer' THEN 1
    WHEN 'drawer' THEN 2
    WHEN 'cupboard' THEN 3
    ELSE NULL
  END
  LIMIT 1
)
WHERE p.storage_location IS NOT NULL;

-- Drop old column and constraint
ALTER TABLE public.pantry_items
  DROP CONSTRAINT IF EXISTS pantry_items_storage_location_check;

ALTER TABLE public.pantry_items
  DROP COLUMN IF EXISTS storage_location;
