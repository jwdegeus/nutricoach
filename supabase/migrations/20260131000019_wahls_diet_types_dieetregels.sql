-- Migration: Wahls Diet Types voor Dieetregels (Diet Logic)
-- Created: 2026-01-31
-- Description: Voegt Wahls Diet (Level 1) en Wahls Paleo Plus (Level 3) toe als diet_types.
-- Dieetregels per niveau worden later via diet_category_constraints.diet_logic ingesteld.

-- ============================================================================
-- Step 1: Voeg Wahls Diet (L1) en Wahls Paleo Plus (L3) toe
-- ============================================================================

INSERT INTO public.diet_types (name, description, display_order) VALUES
  ('Wahls Diet', 'Wahls Protocol Level 1. Minder strikt dan Paleo: beperkt non-gluten granen en peulvruchten toegestaan. DROP: gluten, zuivel, soja, geraffineerde suiker, ultrabewerkt. FORCE: 3-3-3 cups groenten.', 9),
  ('Wahls Paleo Plus', 'Wahls Protocol Level 3. Meest strikt: focus ketose, beperkt fruit en zetmeel. DROP: alles van Level 2 + zetmeelrijke groenten. FORCE: gezonde vetten; LIMIT: fruit (alleen bessen), noten/zaden.', 11)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();
