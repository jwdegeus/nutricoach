-- Migration: Product source config (voorraad lookup bronnen)
-- Description: Configuratie voor productbronnen (Open Food Facts, Albert Heijn).
--              Lookup gebruikt alleen actieve bronnen, gesorteerd op priority.

-- ============================================================================
-- Enum: product_source (voor typeveiligheid)
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.product_source_enum AS ENUM ('openfoodfacts', 'albert_heijn');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Table: product_source_config
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.product_source_config (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  source public.product_source_enum NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 1,
  config_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_source_config_priority_positive CHECK (priority >= 1)
);

COMMENT ON COLUMN public.product_source_config.source IS 'Bron: openfoodfacts, albert_heijn';
COMMENT ON COLUMN public.product_source_config.priority IS 'Volgorde bij lookup (lager = eerder)';
COMMENT ON COLUMN public.product_source_config.config_json IS 'Optioneel: credentials of extra instellingen (alleen server-side, nooit naar client)';

CREATE INDEX IF NOT EXISTS idx_product_source_config_is_enabled ON public.product_source_config(is_enabled);
CREATE INDEX IF NOT EXISTS idx_product_source_config_priority ON public.product_source_config(priority);

-- ============================================================================
-- Trigger: updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS set_updated_at_product_source_config ON public.product_source_config;
CREATE TRIGGER set_updated_at_product_source_config
  BEFORE UPDATE ON public.product_source_config
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.product_source_config ENABLE ROW LEVEL SECURITY;

-- Iedereen (authenticated) mag actieve bronnen lezen (voor lookup) - alleen niet-gevoelige kolom
-- We gebruiken één policy: authenticated kan lezen; admin kan alles.
CREATE POLICY "Authenticated can read product_source_config"
  ON public.product_source_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert product_source_config"
  ON public.product_source_config
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update product_source_config"
  ON public.product_source_config
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete product_source_config"
  ON public.product_source_config
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- Seed: standaard bronnen
-- ============================================================================
INSERT INTO public.product_source_config (source, is_enabled, priority)
VALUES
  ('openfoodfacts', true, 1),
  ('albert_heijn', false, 2)
ON CONFLICT (source) DO NOTHING;
