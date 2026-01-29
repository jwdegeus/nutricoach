-- Link ingredient_category_items to NEVO foods: items can be "from NEVO" (one NEVO food per group globally).
-- NEVO ingredients can only be added to one ingredient group; custom (hand/AI) items have nevo_food_id NULL.

ALTER TABLE public.ingredient_category_items
  ADD COLUMN IF NOT EXISTS nevo_food_id INTEGER NULL REFERENCES public.nevo_foods(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ingredient_category_items.nevo_food_id IS 'If set, this item is a NEVO ingredient; each NEVO food can only be in one category (enforced by unique constraint).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredient_category_items_nevo_food_id_unique
  ON public.ingredient_category_items(nevo_food_id)
  WHERE nevo_food_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingredient_category_items_nevo_food_id
  ON public.ingredient_category_items(nevo_food_id)
  WHERE nevo_food_id IS NOT NULL;
