-- Add FNDDS as a source for recipe ingredient matches (fdc_id = FNDDS survey food id).

ALTER TABLE public.recipe_ingredient_matches
  DROP CONSTRAINT IF EXISTS recipe_ingredient_matches_ref_check;

ALTER TABLE public.recipe_ingredient_matches
  DROP CONSTRAINT IF EXISTS recipe_ingredient_matches_source_check;

ALTER TABLE public.recipe_ingredient_matches
  ADD COLUMN IF NOT EXISTS fdc_id INTEGER NULL;

ALTER TABLE public.recipe_ingredient_matches
  ADD CONSTRAINT recipe_ingredient_matches_source_check
  CHECK (source IN ('nevo', 'custom', 'fndds'));

ALTER TABLE public.recipe_ingredient_matches
  ADD CONSTRAINT recipe_ingredient_matches_ref_check
  CHECK (
    (source = 'nevo' AND nevo_code IS NOT NULL AND custom_food_id IS NULL AND fdc_id IS NULL)
    OR (source = 'custom' AND custom_food_id IS NOT NULL AND nevo_code IS NULL AND fdc_id IS NULL)
    OR (source = 'fndds' AND fdc_id IS NOT NULL AND nevo_code IS NULL AND custom_food_id IS NULL)
  );

COMMENT ON COLUMN public.recipe_ingredient_matches.fdc_id IS 'FNDDS survey food fdc_id when source = fndds';
