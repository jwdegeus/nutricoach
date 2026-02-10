-- Migration: Grocery stores – website, cutoff times, and orders
-- Description: Add website_url and cutoff_times to stores; add user_grocery_store_orders for order tracking.

-- ============================================================================
-- 1) Alter user_grocery_stores: website_url, cutoff_times
-- ============================================================================

ALTER TABLE public.user_grocery_stores
  ADD COLUMN IF NOT EXISTS website_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS cutoff_times TEXT NULL;

COMMENT ON COLUMN public.user_grocery_stores.website_url IS 'URL to order online (e.g. webshop)';
COMMENT ON COLUMN public.user_grocery_stores.cutoff_times IS 'Free text for order cut-off times (e.g. Ma 12:00, Do 12:00)';

-- ============================================================================
-- 2) Table: user_grocery_store_orders
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_grocery_store_orders (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.user_grocery_stores(id) ON DELETE CASCADE,
  order_date DATE NOT NULL,
  delivery_date DATE NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_grocery_store_orders_user_id ON public.user_grocery_store_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_user_grocery_store_orders_store_id ON public.user_grocery_store_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_user_grocery_store_orders_status ON public.user_grocery_store_orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_user_grocery_store_orders_order_date ON public.user_grocery_store_orders(store_id, order_date DESC);

COMMENT ON TABLE public.user_grocery_store_orders IS 'Orders per grocery store: active (lopend), completed (afgeleverd), cancelled.';

-- ============================================================================
-- Trigger: updated_at for orders
-- ============================================================================

DROP TRIGGER IF EXISTS set_updated_at_user_grocery_store_orders ON public.user_grocery_store_orders;
CREATE TRIGGER set_updated_at_user_grocery_store_orders
  BEFORE UPDATE ON public.user_grocery_store_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS: user_grocery_store_orders
-- ============================================================================

ALTER TABLE public.user_grocery_store_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_grocery_store_orders_select_own" ON public.user_grocery_store_orders;
CREATE POLICY "user_grocery_store_orders_select_own"
  ON public.user_grocery_store_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_grocery_store_orders_insert_own" ON public.user_grocery_store_orders;
CREATE POLICY "user_grocery_store_orders_insert_own"
  ON public.user_grocery_store_orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_grocery_store_orders_update_own" ON public.user_grocery_store_orders;
CREATE POLICY "user_grocery_store_orders_update_own"
  ON public.user_grocery_store_orders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_grocery_store_orders_delete_own" ON public.user_grocery_store_orders;
CREATE POLICY "user_grocery_store_orders_delete_own"
  ON public.user_grocery_store_orders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
