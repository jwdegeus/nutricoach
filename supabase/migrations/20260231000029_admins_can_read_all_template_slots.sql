-- Allow admins to read all meal_plan_template_slots (including for inactive templates).
-- Needed for admin generator-config slot editor.

CREATE POLICY "Admins can read all meal_plan_template_slots"
  ON public.meal_plan_template_slots
  FOR SELECT
  USING (public.is_admin(auth.uid()));
