-- Allow admins to read all diet types (including inactive).
-- Needed so delete-ingredient-group error message can show diet names
-- when an ingredient group is still used in a diet (including inactive diets).

CREATE POLICY "Admins can read all diet types"
  ON public.diet_types
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );
