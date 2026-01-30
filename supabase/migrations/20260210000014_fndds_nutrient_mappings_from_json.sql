-- FNDDS nutrient mappings: correcties en uitbreiding op basis van echte FNDDS JSON (food_nutrients).
-- Bron: temp/fcd_id_2709420.json (nutrient.id = nutrient_source_key).
-- Mineralen/vitamines IDs in deze FNDDS: 1090=Magnesium, 1091=Phosphorus, 1095=Zinc, 1098=Copper, 1103=Selenium;
-- 1175=B-6, 1178=B-12, 1167=Niacin, 1185=Vitamin K; 1259/1260/1262 zijn SFA 4:0/6:0/10:0 (niet mono/poly/trans).
-- Totalen vetzuren: 1258=saturated, 1292=monounsaturated, 1293=polyunsaturated. Cholesterol: 1253.

-- 1) Corrigeer verkeerde IDs (extended/seed hadden andere betekenissen in FNDDS)
INSERT INTO public.nutrient_source_mappings (
  source, nutrient_source_key, internal_nutrient_key, source_unit, internal_unit, multiplier, is_active, notes
) VALUES
  ('fndds_survey', '1090', 'magnesium_mg', 'mg', 'mg', 1, true, 'Magnesium, Mg. FNDDS id=1090.'),
  ('fndds_survey', '1091', 'phosphorus_mg', 'mg', 'mg', 1, true, 'Phosphorus, P. FNDDS id=1091.'),
  ('fndds_survey', '1095', 'zinc_mg', 'mg', 'mg', 1, true, 'Zinc, Zn. FNDDS id=1095.'),
  ('fndds_survey', '1098', 'copper_mg', 'mg', 'mg', 1, true, 'Copper, Cu. FNDDS id=1098.'),
  ('fndds_survey', '1103', 'selenium_ug', 'µg', 'ug', 1, true, 'Selenium, Se. FNDDS id=1103.'),
  ('fndds_survey', '1175', 'vit_b6_mg', 'mg', 'mg', 1, true, 'Vitamin B-6. FNDDS id=1175.'),
  ('fndds_survey', '1178', 'vit_b12_ug', 'µg', 'ug', 1, true, 'Vitamin B-12. FNDDS id=1178.'),
  ('fndds_survey', '1185', 'vit_k1_ug', 'µg', 'ug', 1, true, 'Vitamin K (phylloquinone). FNDDS id=1185.'),
  ('fndds_survey', '1167', 'niacin_mg', 'mg', 'mg', 1, true, 'Niacin. FNDDS id=1167.')
ON CONFLICT (source, nutrient_source_key) DO UPDATE SET
  internal_nutrient_key = EXCLUDED.internal_nutrient_key,
  source_unit = EXCLUDED.source_unit,
  internal_unit = EXCLUDED.internal_unit,
  multiplier = EXCLUDED.multiplier,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- 2) Vetzuren: 1259/1260/1262 zijn in FNDDS SFA 4:0, SFA 6:0, SFA 10:0 – niet mono/poly/trans. Uit.
UPDATE public.nutrient_source_mappings
SET is_active = false, notes = 'FNDDS: SFA 4:0/6:0/10:0, niet total mono/poly. Gebruik 1292/1293.'
WHERE source = 'fndds_survey' AND nutrient_source_key IN ('1259', '1260', '1262');

-- 3) Total monounsaturated/polyunsaturated (juiste FNDDS IDs)
INSERT INTO public.nutrient_source_mappings (
  source, nutrient_source_key, internal_nutrient_key, source_unit, internal_unit, multiplier, is_active, notes
) VALUES
  ('fndds_survey', '1292', 'monounsaturated_fat_g', 'g', 'g', 1, true, 'Fatty acids, total monounsaturated. FNDDS id=1292.'),
  ('fndds_survey', '1293', 'polyunsaturated_fat_g', 'g', 'g', 1, true, 'Fatty acids, total polyunsaturated. FNDDS id=1293.')
ON CONFLICT (source, nutrient_source_key) DO UPDATE SET
  internal_nutrient_key = EXCLUDED.internal_nutrient_key,
  source_unit = EXCLUDED.source_unit,
  internal_unit = EXCLUDED.internal_unit,
  multiplier = EXCLUDED.multiplier,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- 4) Cholesterol (FNDDS gebruikt 1253, niet 1094)
INSERT INTO public.nutrient_source_mappings (
  source, nutrient_source_key, internal_nutrient_key, source_unit, internal_unit, multiplier, is_active, notes
) VALUES
  ('fndds_survey', '1253', 'cholesterol_mg', 'mg', 'mg', 1, true, 'Cholesterol. FNDDS id=1253.')
ON CONFLICT (source, nutrient_source_key) DO UPDATE SET
  internal_nutrient_key = EXCLUDED.internal_nutrient_key,
  source_unit = EXCLUDED.source_unit,
  internal_unit = EXCLUDED.internal_unit,
  multiplier = EXCLUDED.multiplier,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- 5) Overige: alcohol, carotenoiden, folate-varianten
INSERT INTO public.nutrient_source_mappings (
  source, nutrient_source_key, internal_nutrient_key, source_unit, internal_unit, multiplier, is_active, notes
) VALUES
  ('fndds_survey', '1018', 'alcohol_g', 'g', 'g', 1, true, 'Alcohol, ethyl. FNDDS id=1018.'),
  ('fndds_survey', '1105', 'retinol_ug', 'µg', 'ug', 1, true, 'Retinol. FNDDS id=1105.'),
  ('fndds_survey', '1107', 'beta_carotene_total_ug', 'µg', 'ug', 1, true, 'Carotene, beta. FNDDS id=1107.'),
  ('fndds_survey', '1108', 'alpha_carotene_ug', 'µg', 'ug', 1, true, 'Carotene, alpha. FNDDS id=1108.'),
  ('fndds_survey', '1120', 'beta_cryptoxanthin_ug', 'µg', 'ug', 1, true, 'Cryptoxanthin, beta. FNDDS id=1120.'),
  ('fndds_survey', '1122', 'lycopene_ug', 'µg', 'ug', 1, true, 'Lycopene. FNDDS id=1122.'),
  ('fndds_survey', '1123', 'lutein_ug', 'µg', 'ug', 1, true, 'Lutein + zeaxanthin (gecombineerd). FNDDS id=1123.'),
  ('fndds_survey', '1186', 'folic_acid_ug', 'µg', 'ug', 1, true, 'Folic acid. FNDDS id=1186.'),
  ('fndds_survey', '1187', 'folate_ug', 'µg', 'ug', 1, true, 'Folate, food. FNDDS id=1187.'),
  ('fndds_survey', '1190', 'folate_equiv_ug', 'µg', 'ug', 1, true, 'Folate, DFE. FNDDS id=1190.')
ON CONFLICT (source, nutrient_source_key) DO UPDATE SET
  internal_nutrient_key = EXCLUDED.internal_nutrient_key,
  source_unit = EXCLUDED.source_unit,
  internal_unit = EXCLUDED.internal_unit,
  multiplier = EXCLUDED.multiplier,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- 6) Vitamine K: 1110 in eerdere migratie; FNDDS gebruikt ook 1185 (phylloquinone). Beide actief houden.
-- 7) Duplicaat folate_equiv: 1177 (Folate, total) en 1190 (Folate, DFE) mappen we beide naar folate_equiv_ug; 1190 heeft voorrang als beide aanwezig (zelfde key, laatste upsert wint niet - we hebben twee rows 1177 en 1190; bij load nemen we alle mappings, dus beide kunnen een waarde geven; we overschrijven per key dus de volgorde in de loop bepaalt welke waarde blijft). Geen wijziging nodig.
