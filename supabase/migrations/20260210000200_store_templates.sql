-- Store templates: vooraf gedefinieerde winkels die gebruikers kunnen "toevoegen".
-- connector_type: 'sitemap_xml' = sitemap/XML-scraping; 'api' = API-koppeling (bijv. ah.nl, geen scraping).

CREATE TABLE IF NOT EXISTS public.store_templates (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  sitemap_url TEXT NULL,
  connector_type TEXT NOT NULL DEFAULT 'sitemap_xml' CHECK (connector_type IN ('sitemap_xml', 'api')),
  connector_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_templates_name_idx ON public.store_templates(name);

COMMENT ON TABLE public.store_templates IS 'Vooraf gedefinieerde winkels; "Winkel toevoegen" kiest hieruit. connector_type: api (bijv. ah.nl) vs sitemap_xml (scraping).';
COMMENT ON COLUMN public.store_templates.connector_type IS 'api = API-koppeling (geen XML/sitemap scraping); sitemap_xml = sitemap/JSON-LD scraping.';

-- RLS: alleen lezen voor ingelogde gebruikers (admin-pagina toont lookup).
ALTER TABLE public.store_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_templates_select_authenticated"
  ON public.store_templates FOR SELECT
  TO authenticated
  USING (true);

-- Alleen service role / backend mag wijzigen (seed of admin tooling).
CREATE POLICY "store_templates_insert_service"
  ON public.store_templates FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "store_templates_update_service"
  ON public.store_templates FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_store_templates
  BEFORE UPDATE ON public.store_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Seed: voorbeelden (sitemap_xml). ah.nl later handmatig toevoegen met connector_type = 'api'.
INSERT INTO public.store_templates (name, base_url, sitemap_url, connector_type, connector_config)
SELECT * FROM (VALUES
  ('Ekoplaza'::text, 'https://www.ekoplaza.nl'::text, 'https://www.ekoplaza.nl/sitemap.xml'::text, 'sitemap_xml'::text, '{"rateLimitRps": 2, "detailBatchSize": 200, "detailConcurrency": 3}'::jsonb),
  ('Pit&Pit'::text, 'https://www.pitenpit.nl'::text, 'https://www.pitenpit.nl/sitemap.xml'::text, 'sitemap_xml'::text, '{"rateLimitRps": 2, "detailBatchSize": 200, "detailConcurrency": 3}'::jsonb)
) AS v(name, base_url, sitemap_url, connector_type, connector_config)
WHERE NOT EXISTS (SELECT 1 FROM public.store_templates LIMIT 1);
