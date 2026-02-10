-- Migration: Pantry items – product image and storage location
-- Description: image_url for product photo (upload/API), storage_location (fridge, freezer, drawer, cupboard).

ALTER TABLE public.pantry_items
  ADD COLUMN IF NOT EXISTS image_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS storage_location TEXT NULL;

COMMENT ON COLUMN public.pantry_items.image_url IS 'Product image URL (Vercel Blob or external e.g. Open Food Facts)';
COMMENT ON COLUMN public.pantry_items.storage_location IS 'Where stored at home: fridge, freezer, drawer, cupboard';

-- Optional: constrain to known values (allow null = not set)
ALTER TABLE public.pantry_items
  DROP CONSTRAINT IF EXISTS pantry_items_storage_location_check;

ALTER TABLE public.pantry_items
  ADD CONSTRAINT pantry_items_storage_location_check CHECK (
    storage_location IS NULL
    OR storage_location IN ('fridge', 'freezer', 'drawer', 'cupboard')
  );
