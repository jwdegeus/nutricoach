-- Allow admins to read all meal_plan_templates and meal_plan_pool_items (including inactive).
-- Needed for admin generator-config UI to list and toggle is_active.

CREATE POLICY "Admins can read all meal_plan_templates"
  ON public.meal_plan_templates
  FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can read all meal_plan_pool_items"
  ON public.meal_plan_pool_items
  FOR SELECT
  USING (public.is_admin(auth.uid()));
