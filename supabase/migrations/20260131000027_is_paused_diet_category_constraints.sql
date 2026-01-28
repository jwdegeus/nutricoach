-- Migration: Gepauzeerd-status voor dieetregels (los van strictness)
-- Description: Voegt is_paused toe aan diet_category_constraints.
--   - strictness "hard"/"soft" = streng/zacht (blokkeren vs waarschuwing)
--   - is_paused = true = regel staat uit, wordt niet geëvalueerd
--   Zacht (soft) blijft actief en geeft alleen waarschuwing; gepauzeerd betekent uit.

ALTER TABLE public.diet_category_constraints
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.diet_category_constraints.is_paused IS
  'True = regel gepauzeerd (niet in ruleset). False = actief. Los van strictness: zacht = actief met waarschuwing, streng = actief met blokkeren.';
