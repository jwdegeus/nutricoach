-- Migration: User grocery stores (favoriete winkels)
-- Description: Per-user list of favorite grocery stores; later link ingredients to stores.

-- ============================================================================
-- Table: user_grocery_stores
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_grocery_stores (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NULL,
  notes TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_grocery_stores_user_id ON public.user_grocery_stores(user_id);
CREATE INDEX IF NOT EXISTS idx_user_grocery_stores_user_sort ON public.user_grocery_stores(user_id, sort_order);

COMMENT ON TABLE public.user_grocery_stores IS 'User favorite grocery stores; later link ingredients to stores.';
COMMENT ON COLUMN public.user_grocery_stores.name IS 'Display name, e.g. Albert Heijn Centrum';
COMMENT ON COLUMN public.user_grocery_stores.sort_order IS 'Order in list (lower first)';

-- ============================================================================
-- Trigger: updated_at
-- ============================================================================

CREATE TRIGGER set_updated_at_user_grocery_stores
  BEFORE UPDATE ON public.user_grocery_stores
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.user_grocery_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_grocery_stores_select_own"
  ON public.user_grocery_stores FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_grocery_stores_insert_own"
  ON public.user_grocery_stores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_grocery_stores_update_own"
  ON public.user_grocery_stores FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_grocery_stores_delete_own"
  ON public.user_grocery_stores FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
