-- Multi-select NEVO groups: replace single nevo_food_group_nl/en with arrays.

-- Add new array columns
ALTER TABLE public.ingredient_categories
  ADD COLUMN IF NOT EXISTS nevo_food_groups_nl TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nevo_food_groups_en TEXT[] NOT NULL DEFAULT '{}';

-- Migrate existing single value to array (if columns exist and have data)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ingredient_categories' AND column_name = 'nevo_food_group_nl'
  ) THEN
    UPDATE public.ingredient_categories
    SET
      nevo_food_groups_nl = CASE
        WHEN nevo_food_group_nl IS NOT NULL AND nevo_food_group_nl <> '' THEN ARRAY[nevo_food_group_nl]
        ELSE '{}'
      END,
      nevo_food_groups_en = CASE
        WHEN nevo_food_group_en IS NOT NULL AND nevo_food_group_en <> '' THEN ARRAY[nevo_food_group_en]
        ELSE '{}'
      END
    WHERE nevo_food_group_nl IS NOT NULL AND nevo_food_group_nl <> '';
  END IF;
END $$;

-- Drop old single columns and index
DROP INDEX IF EXISTS public.idx_ingredient_categories_nevo_food_group_nl;
ALTER TABLE public.ingredient_categories
  DROP COLUMN IF EXISTS nevo_food_group_nl,
  DROP COLUMN IF EXISTS nevo_food_group_en;

COMMENT ON COLUMN public.ingredient_categories.nevo_food_groups_nl IS 'NEVO food_group_nl waarden waarmee deze categorie gekoppeld is (multi-select).';
COMMENT ON COLUMN public.ingredient_categories.nevo_food_groups_en IS 'NEVO food_group_en waarden (voor weergave, zelfde volgorde als _nl).';

CREATE INDEX IF NOT EXISTS idx_ingredient_categories_nevo_food_groups_nl
  ON public.ingredient_categories USING GIN (nevo_food_groups_nl)
  WHERE nevo_food_groups_nl <> '{}';
