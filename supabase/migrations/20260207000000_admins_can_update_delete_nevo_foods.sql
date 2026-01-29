-- Admins may update and delete nevo_foods (e.g. corrections, deduplication).
CREATE POLICY "Admins can update nevo_foods"
  ON public.nevo_foods
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete nevo_foods"
  ON public.nevo_foods
  FOR DELETE
  USING (public.is_admin(auth.uid()));
