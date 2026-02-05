-- Allow admins to read all meal_plan_name_patterns (including inactive).
-- Needed for admin generator-config Naming tab to list and toggle is_active.

CREATE POLICY "Admins can read all meal_plan_name_patterns"
  ON public.meal_plan_name_patterns
  FOR SELECT
  USING (public.is_admin(auth.uid()));
