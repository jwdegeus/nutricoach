-- FNDDS mappings for fatty acids (verzadigd, enkelvoudig/meervoudig onverzadigd, trans).
-- FDC nutrient IDs: 1258/1259/1260/1262 (FNDDS Survey) and 606/646/647/605 (alternate scheme).

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
  ('fndds_survey', '1258', 'saturated_fat_g', 'g', 'g', 1, true, 'Fatty acids, total saturated. FDC id=1258.'),
  ('fndds_survey', '1259', 'monounsaturated_fat_g', 'g', 'g', 1, true, 'Fatty acids, total monounsaturated. FDC id=1259.'),
  ('fndds_survey', '1260', 'polyunsaturated_fat_g', 'g', 'g', 1, true, 'Fatty acids, total polyunsaturated. FDC id=1260.'),
  ('fndds_survey', '1262', 'trans_fat_g', 'g', 'g', 1, true, 'Fatty acids, total trans. FDC id=1262.'),
  ('fndds_survey', '606', 'saturated_fat_g', 'g', 'g', 1, true, 'Fatty acids, saturated (alternate ID 606).'),
  ('fndds_survey', '646', 'monounsaturated_fat_g', 'g', 'g', 1, true, 'Fatty acids, monounsaturated (alternate ID 646).'),
  ('fndds_survey', '647', 'polyunsaturated_fat_g', 'g', 'g', 1, true, 'Fatty acids, polyunsaturated (alternate ID 647).'),
  ('fndds_survey', '605', 'trans_fat_g', 'g', 'g', 1, true, 'Fatty acids, trans (alternate ID 605).')
ON CONFLICT (source, nutrient_source_key) DO UPDATE SET
  internal_nutrient_key = EXCLUDED.internal_nutrient_key,
  source_unit = EXCLUDED.source_unit,
  internal_unit = EXCLUDED.internal_unit,
  multiplier = EXCLUDED.multiplier,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  updated_at = NOW();
