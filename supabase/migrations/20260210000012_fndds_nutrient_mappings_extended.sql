-- Extended FNDDS nutrient mappings so the edit form shows more nutrients from food_nutrients.
-- FDC nutrient IDs from USDA FNDDS; internal_nutrient_key = nevo_foods / custom_foods columns.

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
  ('fndds_survey', '1051', 'water_g', 'g', 'g', 1, true, 'Water. FDC nutrient.id=1051.'),
  ('fndds_survey', '1092', 'potassium_mg', 'mg', 'mg', 1, true, 'Potassium. FDC nutrient.id=1092.'),
  ('fndds_survey', '1094', 'cholesterol_mg', 'mg', 'mg', 1, true, 'Cholesterol. FDC nutrient.id=1094.'),
  ('fndds_survey', '1095', 'phosphorus_mg', 'mg', 'mg', 1, true, 'Phosphorus. FDC nutrient.id=1095.'),
  ('fndds_survey', '1098', 'magnesium_mg', 'mg', 'mg', 1, true, 'Magnesium. FDC nutrient.id=1098.'),
  ('fndds_survey', '1100', 'zinc_mg', 'mg', 'mg', 1, true, 'Zinc. FDC nutrient.id=1100.'),
  ('fndds_survey', '1103', 'copper_mg', 'mg', 'mg', 1, true, 'Copper. FDC nutrient.id=1103.'),
  ('fndds_survey', '1090', 'selenium_ug', 'µg', 'ug', 1, true, 'Selenium. FDC nutrient.id=1090.'),
  ('fndds_survey', '1106', 'vit_a_rae_ug', 'µg', 'ug', 1, true, 'Vitamin A, RAE. FDC nutrient.id=1106.'),
  ('fndds_survey', '1109', 'vit_e_mg', 'mg', 'mg', 1, true, 'Vitamin E (alpha-tocopherol). FDC nutrient.id=1109.'),
  ('fndds_survey', '1110', 'vit_k_ug', 'µg', 'ug', 1, true, 'Vitamin K. FDC nutrient.id=1110.'),
  ('fndds_survey', '1165', 'vit_b1_mg', 'mg', 'mg', 1, true, 'Thiamin (B1). FDC nutrient.id=1165.'),
  ('fndds_survey', '1166', 'vit_b2_mg', 'mg', 'mg', 1, true, 'Riboflavin (B2). FDC nutrient.id=1166.'),
  ('fndds_survey', '1176', 'vit_b6_mg', 'mg', 'mg', 1, true, 'Vitamin B-6. FDC nutrient.id=1176.'),
  ('fndds_survey', '1185', 'niacin_mg', 'mg', 'mg', 1, true, 'Niacin. FDC nutrient.id=1185.'),
  ('fndds_survey', '1178', 'folic_acid_ug', 'µg', 'ug', 1, true, 'Folic acid. FDC nutrient.id=1178.')
ON CONFLICT (source, nutrient_source_key) DO UPDATE SET
  internal_nutrient_key = EXCLUDED.internal_nutrient_key,
  source_unit = EXCLUDED.source_unit,
  internal_unit = EXCLUDED.internal_unit,
  multiplier = EXCLUDED.multiplier,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  updated_at = NOW();
