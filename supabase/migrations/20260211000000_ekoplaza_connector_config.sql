-- Ekoplaza heeft sterkere bot-bescherming dan Pit&Pit en blokkeert te snelle requests.
-- Zie docs/store-catalog-connectors.md: "detailDelayMs: Voor Ekoplaza: 2000"
-- Bij veel FETCH_FAILED: concurrency 1, rate limit 1, pauze 2000 ms.
-- Dit migreert zowel store_templates als bestaande stores met Ekoplaza.

-- 1. Template: nieuwe Ekoplaza-winkels krijgen direct de juiste config
UPDATE public.store_templates
SET connector_config = jsonb_build_object(
  'rateLimitRps', 1,
  'detailBatchSize', 200,
  'detailConcurrency', 1,
  'detailDelayMs', 2000
)
WHERE base_url ILIKE '%ekoplaza%';

-- 2. Bestaande stores: Ekoplaza-winkels updaten
UPDATE public.stores
SET connector_config = connector_config || jsonb_build_object(
  'rateLimitRps', 1,
  'detailBatchSize', 200,
  'detailConcurrency', 1,
  'detailDelayMs', 2000
)
WHERE base_url ILIKE '%ekoplaza%'
   OR name ILIKE 'ekoplaza';
