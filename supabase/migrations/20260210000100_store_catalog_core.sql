-- Migration: Store catalog core (stores, store_products, store_product_variants, store_catalog_runs)
-- Description: Ekoplaza/Pit&Pit-ready catalog storage; RLS owner-only (+ admin); no sync/UI.
-- Security: RLS on all tables; no SELECT * in policies; soft-deactivate via is_active + last_seen_at.

-- ============================================================================
-- Table: stores
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stores (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  sitemap_url TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sync_frequency TEXT NOT NULL DEFAULT 'weekly',
  connector_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stores_owner_id_idx ON public.stores(owner_id);

COMMENT ON TABLE public.stores IS 'Store definitions for catalog sync; connector_config holds adapter settings (rate_limit, user_agent, etc.).';
COMMENT ON COLUMN public.stores.connector_config IS 'DB-managed adapter config (jsonb); no hardcoded adapter lists.';

-- ============================================================================
-- Table: store_products
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.store_products (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  external_key TEXT NOT NULL,
  product_url TEXT NOT NULL,
  title TEXT NOT NULL,
  brand TEXT NULL,
  category_path TEXT NULL,
  image_url TEXT NULL,
  currency TEXT NULL,
  price_cents INTEGER NULL,
  availability TEXT NULL,
  unit_label TEXT NULL,
  sku TEXT NULL,
  gtin TEXT NULL,
  lastmod TIMESTAMPTZ NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  raw_source JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_products_store_external_key_unique UNIQUE (store_id, external_key)
);

CREATE INDEX IF NOT EXISTS store_products_store_active_title_idx ON public.store_products(store_id, is_active, title);
CREATE INDEX IF NOT EXISTS store_products_store_last_seen_idx ON public.store_products(store_id, last_seen_at);
CREATE INDEX IF NOT EXISTS store_products_gtin_idx ON public.store_products(gtin) WHERE gtin IS NOT NULL;

COMMENT ON TABLE public.store_products IS 'Product catalog per store; soft-deactivate via is_active=false, last_seen_at.';
COMMENT ON COLUMN public.store_products.external_key IS 'Canonical url/handle/id from source.';
COMMENT ON COLUMN public.store_products.raw_source IS 'Optional limited payload; no HTML.';

-- ============================================================================
-- Table: store_product_variants
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.store_product_variants (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  store_product_id UUID NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
  variant_key TEXT NOT NULL,
  title TEXT NULL,
  price_cents INTEGER NULL,
  currency TEXT NULL,
  sku TEXT NULL,
  gtin TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_product_variants_product_variant_key_unique UNIQUE (store_product_id, variant_key)
);

COMMENT ON TABLE public.store_product_variants IS 'Optional variants per store product (e.g. size/weight).';

-- ============================================================================
-- Table: store_catalog_runs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.store_catalog_runs (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NULL,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_summary TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_catalog_runs_store_started_idx ON public.store_catalog_runs(store_id, started_at DESC);

COMMENT ON TABLE public.store_catalog_runs IS 'Per-store sync run log; stats: urls_seen, upserts, deactivated, errors.';
COMMENT ON COLUMN public.store_catalog_runs.error_summary IS 'Short summary; no PII/URLs.';

-- ============================================================================
-- Triggers: updated_at (public.handle_updated_at)
-- ============================================================================

CREATE TRIGGER set_updated_at_stores
  BEFORE UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_store_products
  BEFORE UPDATE ON public.store_products
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_store_product_variants
  BEFORE UPDATE ON public.store_product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS: stores
-- ============================================================================

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stores_select_owner"
  ON public.stores FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "stores_insert_owner"
  ON public.stores FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "stores_update_owner"
  ON public.stores FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "stores_delete_owner"
  ON public.stores FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "stores_select_admin"
  ON public.stores FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "stores_insert_admin"
  ON public.stores FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "stores_update_admin"
  ON public.stores FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "stores_delete_admin"
  ON public.stores FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- RLS: store_products (via store ownership)
-- ============================================================================

ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_products_select_via_store"
  ON public.store_products FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "store_products_insert_via_store"
  ON public.store_products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "store_products_update_via_store"
  ON public.store_products FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "store_products_delete_via_store"
  ON public.store_products FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

-- ============================================================================
-- RLS: store_product_variants (via product -> store -> owner)
-- ============================================================================

ALTER TABLE public.store_product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_product_variants_select_via_product"
  ON public.store_product_variants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.store_products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = store_product_id AND s.owner_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "store_product_variants_insert_via_product"
  ON public.store_product_variants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.store_products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = store_product_id AND s.owner_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "store_product_variants_update_via_product"
  ON public.store_product_variants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.store_products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = store_product_id AND s.owner_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.store_products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = store_product_id AND s.owner_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "store_product_variants_delete_via_product"
  ON public.store_product_variants FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.store_products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = store_product_id AND s.owner_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
  );

-- ============================================================================
-- RLS: store_catalog_runs (via store -> owner)
-- ============================================================================

ALTER TABLE public.store_catalog_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_catalog_runs_select_via_store"
  ON public.store_catalog_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "store_catalog_runs_insert_via_store"
  ON public.store_catalog_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "store_catalog_runs_update_via_store"
  ON public.store_catalog_runs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "store_catalog_runs_delete_via_store"
  ON public.store_catalog_runs FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    OR public.is_admin(auth.uid())
  );
