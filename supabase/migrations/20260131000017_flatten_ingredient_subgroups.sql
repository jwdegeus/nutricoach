-- Migration: Flatten ingredient categories (remove subcategory assignments)
-- Created: 2026-01-31
-- Description: Zet alle ingredient_category_items terug naar "direct aan categorie".
--              subgroup_id wordt NULL. Tabel ingredient_subgroups blijft bestaan maar wordt niet meer gebruikt in de UI.

BEGIN;

UPDATE public.ingredient_category_items
SET subgroup_id = NULL, updated_at = NOW()
WHERE subgroup_id IS NOT NULL;

COMMIT;
