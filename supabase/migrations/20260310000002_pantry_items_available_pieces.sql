-- Aantal stuks op voorraad (naast available_g)
ALTER TABLE public.pantry_items
  ADD COLUMN IF NOT EXISTS available_pieces INTEGER NULL;

COMMENT ON COLUMN public.pantry_items.available_pieces IS 'Number of items/pieces in stock (user-facing); optional alongside available_g';
