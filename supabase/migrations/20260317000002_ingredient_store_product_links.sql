-- Migration: Ingredient ↔ Store Product links (canonical ingredient identity)
-- Description: Links canonical_ingredients to store_products per store; user_id for
--   user-specific preference (lookup: user first, then global/user_id null in later step).
--   One row per (user_id, store_id, canonical_ingredient_id); v1 product-level only.

-- ============================================================================
-- Table: ingredient_store_product_links
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ingredient_store_product_links (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_ingredient_id UUID NOT NULL REFERENCES public.canonical_ingredients(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  store_product_id UUID NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredient_store_product_links_user_store_ingredient_unique
    UNIQUE (user_id, store_id, canonical_ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_ingredient_store_product_links_canonical_ingredient_id
  ON public.ingredient_store_product_links (canonical_ingredient_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_store_product_links_store_id
  ON public.ingredient_store_product_links (store_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_store_product_links_store_product_id
  ON public.ingredient_store_product_links (store_product_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_store_product_links_lookup
  ON public.ingredient_store_product_links (user_id, store_id, canonical_ingredient_id);

COMMENT ON TABLE public.ingredient_store_product_links IS 'Links canonical ingredient to store product per store; user_id for user preference (lookup: user first, then global).';

-- ============================================================================
-- Trigger: updated_at
-- ============================================================================

CREATE TRIGGER set_updated_at_ingredient_store_product_links
  BEFORE UPDATE ON public.ingredient_store_product_links
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.ingredient_store_product_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredient_store_product_links_select_authenticated"
  ON public.ingredient_store_product_links
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ingredient_store_product_links_insert_admin"
  ON public.ingredient_store_product_links
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "ingredient_store_product_links_update_admin"
  ON public.ingredient_store_product_links
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "ingredient_store_product_links_delete_admin"
  ON public.ingredient_store_product_links
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));
