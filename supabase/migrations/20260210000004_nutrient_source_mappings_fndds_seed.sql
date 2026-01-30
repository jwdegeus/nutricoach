-- Migration: Nutrient source mappings (FNDDS Survey → internal catalog) + seed baseline
-- Description: Maps FNDDS nutrient_source_key (nutrient.id as string) to internal NEVO-style keys.
-- Internal keys and units come from nevo_foods / nutrition-calculator (no new keys).
-- Stap 5 will use this to materialize mapped nutrient values.

-- ============================================================================
-- Table: nutrient_source_mappings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nutrient_source_mappings (
  source TEXT NOT NULL,
  nutrient_source_key TEXT NOT NULL,
  internal_nutrient_key TEXT NOT NULL,
  source_unit TEXT NOT NULL,
  internal_unit TEXT NOT NULL,
  multiplier NUMERIC NOT NULL DEFAULT 1 CHECK (multiplier > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source, nutrient_source_key)
);

CREATE INDEX IF NOT EXISTS idx_nutrient_source_mappings_internal_key
  ON public.nutrient_source_mappings(internal_nutrient_key);

CREATE INDEX IF NOT EXISTS idx_nutrient_source_mappings_source
  ON public.nutrient_source_mappings(source);

CREATE TRIGGER set_updated_at_nutrient_source_mappings
  BEFORE UPDATE ON public.nutrient_source_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.nutrient_source_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutrient source mappings are publicly readable"
  ON public.nutrient_source_mappings
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert nutrient_source_mappings"
  ON public.nutrient_source_mappings
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update nutrient_source_mappings"
  ON public.nutrient_source_mappings
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete nutrient_source_mappings"
  ON public.nutrient_source_mappings
  FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- Seed: FNDDS Survey → internal catalog (MVP set)
-- ============================================================================
-- source = 'fndds_survey'; nutrient_source_key = FDC nutrient.id (from food_nutrients JSON).
-- internal_nutrient_key = keys from nevo_foods / nutrition-calculator (existing codebase).
-- Units: FNDDS uses g, mg, µg, kcal, kJ; we use g, mg, ug, kcal, kj (internal_unit).
-- multiplier: 1 where source_unit and internal_unit same dimension; use for future conversions (e.g. mg→g = 0.001).

INSERT INTO public.nutrient_source_mappings (
  source,
  nutrient_source_key,
  internal_nutrient_key,
  source_unit,
  internal_unit,
  multiplier,
  is_active,
  notes
) VALUES
  ('fndds_survey', '1008', 'energy_kcal', 'kcal', 'kcal', 1, true, 'Energy. FDC nutrient.id=1008; internal key from nevo_foods/nutrition-calculator.'),
  ('fndds_survey', '1007', 'energy_kj', 'kJ', 'kj', 1, true, 'Energy. FDC nutrient.id=1007.'),
  ('fndds_survey', '1003', 'protein_g', 'g', 'g', 1, true, 'Protein. FDC nutrient.id=1003.'),
  ('fndds_survey', '1004', 'fat_g', 'g', 'g', 1, true, 'Total lipid (fat). FDC nutrient.id=1004.'),
  ('fndds_survey', '1005', 'carbs_g', 'g', 'g', 1, true, 'Carbohydrate, by difference. FDC nutrient.id=1005.'),
  ('fndds_survey', '2000', 'sugar_g', 'g', 'g', 1, true, 'Sugars, total. FDC nutrient.id=2000.'),
  ('fndds_survey', '1079', 'fiber_g', 'g', 'g', 1, true, 'Fiber, total dietary. FDC nutrient.id=1079.'),
  ('fndds_survey', '1093', 'sodium_mg', 'mg', 'mg', 1, true, 'Sodium. FDC nutrient.id=1093. Salt derivation (sodium*2.5) is calculation, not mapping.'),
  ('fndds_survey', '1087', 'calcium_mg', 'mg', 'mg', 1, true, 'Calcium. FDC nutrient.id=1087.'),
  ('fndds_survey', '1089', 'iron_mg', 'mg', 'mg', 1, true, 'Iron. FDC nutrient.id=1089.'),
  ('fndds_survey', '1162', 'vit_c_mg', 'mg', 'mg', 1, true, 'Vitamin C, total ascorbic acid. FDC nutrient.id=1162.'),
  ('fndds_survey', '1114', 'vit_d_ug', 'µg', 'ug', 1, true, 'Vitamin D (D2 + D3). FDC nutrient.id=1114. FNDDS unitName may be µg or UG.'),
  ('fndds_survey', '1175', 'vit_b12_ug', 'µg', 'ug', 1, true, 'Vitamin B-12. FDC nutrient.id=1175.'),
  ('fndds_survey', '1177', 'folate_equiv_ug', 'µg', 'ug', 1, true, 'Folate, total. FDC nutrient.id=1177. Mapped to folate_equiv_ug; NEVO has folate_equiv_ug and folate_ug.')
ON CONFLICT (source, nutrient_source_key) DO UPDATE SET
  internal_nutrient_key = EXCLUDED.internal_nutrient_key,
  source_unit = EXCLUDED.source_unit,
  internal_unit = EXCLUDED.internal_unit,
  multiplier = EXCLUDED.multiplier,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  updated_at = NOW();
