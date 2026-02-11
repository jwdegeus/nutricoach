-- Migration: RLS user-owned CRUD on ingredient_store_product_links
-- Description: Allow authenticated users to INSERT/UPDATE/DELETE only their own rows
--   (user_id = auth.uid()). Admin policies unchanged. Rows with user_id IS NULL stay admin-only.

-- ============================================================================
-- User-owned policies (OR with existing admin policies)
-- ============================================================================

CREATE POLICY "ingredient_store_product_links_insert_own"
  ON public.ingredient_store_product_links
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ingredient_store_product_links_update_own"
  ON public.ingredient_store_product_links
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ingredient_store_product_links_delete_own"
  ON public.ingredient_store_product_links
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
