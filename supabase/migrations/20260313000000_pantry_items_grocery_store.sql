-- Migration: Pantry items – link to grocery store + remember source→store for auto-link
-- Description: User can link a product to a favorite store; when a source (e.g. openfoodfacts) is
--              once linked to a store, new products from that source get that store by default.
--              User can always change the store per product.

-- ============================================================================
-- 1) pantry_items: preferred store
-- ============================================================================

ALTER TABLE public.pantry_items
  ADD COLUMN IF NOT EXISTS grocery_store_id UUID NULL REFERENCES public.user_grocery_stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pantry_items_grocery_store_id ON public.pantry_items(grocery_store_id)
  WHERE grocery_store_id IS NOT NULL;

COMMENT ON COLUMN public.pantry_items.grocery_store_id IS 'User-chosen store where they buy this product; optional.';

-- ============================================================================
-- 2) user_product_source_store: remember "source → store" for auto-link
-- ============================================================================
-- When user links a product (with source openfoodfacts/albert_heijn) to a store,
-- we store that. New products from the same source get this store_id by default.

CREATE TABLE IF NOT EXISTS public.user_product_source_store (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  grocery_store_id UUID NOT NULL REFERENCES public.user_grocery_stores(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source)
);

CREATE INDEX IF NOT EXISTS idx_user_product_source_store_user_id ON public.user_product_source_store(user_id);

COMMENT ON TABLE public.user_product_source_store IS 'Default store per product source (openfoodfacts, albert_heijn). New products from that source get this store; user can override per product.';

DROP TRIGGER IF EXISTS set_updated_at_user_product_source_store ON public.user_product_source_store;
CREATE TRIGGER set_updated_at_user_product_source_store
  BEFORE UPDATE ON public.user_product_source_store
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.user_product_source_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_product_source_store_select_own" ON public.user_product_source_store;
CREATE POLICY "user_product_source_store_select_own"
  ON public.user_product_source_store FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_product_source_store_insert_own" ON public.user_product_source_store;
CREATE POLICY "user_product_source_store_insert_own"
  ON public.user_product_source_store FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_product_source_store_update_own" ON public.user_product_source_store;
CREATE POLICY "user_product_source_store_update_own"
  ON public.user_product_source_store FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_product_source_store_delete_own" ON public.user_product_source_store;
CREATE POLICY "user_product_source_store_delete_own"
  ON public.user_product_source_store FOR DELETE TO authenticated USING (auth.uid() = user_id);
