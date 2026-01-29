-- Migration: Add UPDATE policy for recipe_ingredient_matches
-- Description: Upsert (INSERT ... ON CONFLICT DO UPDATE) requires both INSERT and UPDATE.
--  Zonder UPDATE-policy faalt de upsert met "new row violates row-level security policy (USING expression)".

DROP POLICY IF EXISTS "Authenticated can update recipe ingredient matches" ON public.recipe_ingredient_matches;

CREATE POLICY "Authenticated can update recipe ingredient matches"
  ON public.recipe_ingredient_matches
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
