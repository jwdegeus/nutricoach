-- Allow admins to INSERT into store_templates (create new winkel in catalog).

CREATE POLICY "store_templates_insert_admin"
  ON public.store_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "store_templates_update_admin"
  ON public.store_templates FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
