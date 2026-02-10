-- Add product_url for external items (e.g. Albert Heijn product page, Open Food Facts)
ALTER TABLE public.pantry_items
  ADD COLUMN IF NOT EXISTS product_url TEXT NULL;

COMMENT ON COLUMN public.pantry_items.product_url IS 'Shop/product page URL for external items (e.g. AH, OFF)';
