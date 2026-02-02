-- Migration: households household_size + servings_policy
-- Description: Basis voor portie-scaling; huishoudgrootte en policy (schalen vs receptporties behouden).
-- Out of scope: UI (stap 54), generator scaling (stap 55), member-level factors.

-- ============================================================================
-- households: household_size + servings_policy
-- ============================================================================

ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS household_size INTEGER NOT NULL DEFAULT 1
    CHECK (household_size >= 1 AND household_size <= 12);

ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS servings_policy TEXT NOT NULL DEFAULT 'scale_to_household'
    CHECK (servings_policy IN ('scale_to_household', 'keep_recipe_servings'));

COMMENT ON COLUMN public.households.household_size IS 'Aantal personen waarvoor het weekmenu wordt geschaald; 1–12.';
COMMENT ON COLUMN public.households.servings_policy IS 'scale_to_household = porties schalen naar household_size; keep_recipe_servings = receptporties behouden.';

-- ============================================================================
-- Verificatiequeries (als commentaar)
-- ============================================================================
-- SELECT id, owner_user_id, name, household_size, servings_policy
--   FROM public.households WHERE owner_user_id = auth.uid();
