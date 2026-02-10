-- Migration: Seed Wahls protocol v2 – uitgebreide supplementen + regels (idempotent)
-- Description: Uitgebreide set supplementen en when_json-regels voor wahls_mitochondria_v1.
-- Geen schema-wijzigingen. Alle when_json voldoet aan whenJsonSchema (override-keys).
-- Bron: Wahls-tabellen/screenshots. Beheer daarna via Admin.

-- ============================================================================
-- A) Protocol upsert (idempotent)
-- ============================================================================

INSERT INTO public.therapeutic_protocols (
  protocol_key,
  name_nl,
  description_nl,
  version,
  is_active,
  source_refs
)
VALUES (
  'wahls_mitochondria_v1',
  'Wahls – Mitochondria (v1)',
  'Mitochondriale ondersteuning en nutriënt-richtlijnen volgens het Wahls-protocol (voeding en supplementen).',
  '1',
  true,
  '{"source": "Wahls tables screenshots", "note": "seed v2"}'::jsonb
)
ON CONFLICT (protocol_key) DO NOTHING;

-- ============================================================================
-- B) Supplementen upsert (idempotent)
-- ============================================================================

INSERT INTO public.therapeutic_protocol_supplements (
  protocol_id,
  supplement_key,
  label_nl,
  dosage_text,
  notes_nl,
  is_active
)
SELECT
  p.id,
  v.supplement_key,
  v.label_nl,
  v.dosage_text,
  v.notes_nl,
  true
FROM public.therapeutic_protocols p
CROSS JOIN (VALUES
  ('vitamin_b1', 'Thiamine B1', 'Tot 100 mg/dag', NULL),
  ('vitamin_b2', 'Riboflavin B2', 'Tot 200 mg/dag', NULL),
  ('vitamin_b3', 'Niacinamide B3', 'Tot 500 mg/dag', NULL),
  ('vitamin_b12', 'Methylcobalamin B12', 'Tot 1000 mcg/dag', 'Methylvorm heeft voorkeur.'),
  ('folate', 'Methylfolaat', 'Tot 800 mcg/dag', NULL),
  ('vitamin_d', 'Vitamine D', 'Tot 2000 IU/dag', 'Boven 2000 IU alleen onder supervisie.'),
  ('magnesium', 'Magnesium', '500 mg elementair', NULL),
  ('theanine', 'L-theanine', '500 mg', NULL),
  ('taurine', 'Taurine', '1–3 g/dag', NULL),
  ('coenzyme_q10', 'Co-enzym Q10', '200 mg (1200 mg voor Parkinson-patiënten)', NULL),
  ('iodine', 'Jodium (zeewier)', '¼–1 tl gedroogd zeewier/dag', NULL),
  ('omega3_fish_oil', 'Omega-3 visolie', '1–4 g/dag', NULL),
  ('flax_or_hemp_oil', 'Lijnzaad- of hennepolie', '1–2 el/dag', NULL),
  ('n_acetylcysteine', 'N-acetylcysteïne', '1–2 g/dag', NULL),
  ('resveratrol', 'Resveratrol', 'Tot 200 mg/dag', NULL),
  ('alpha_lipoic_acid', 'Alfa-liponzuur', '600 mg', NULL),
  ('creatine_monohydrate', 'Creatine monohydraat', '1 tl/dag', 'Let op voldoende vocht.'),
  ('trace_minerals', 'Spoormineralen', '¼–1 tl kelp/algen per dag (naar behoefte)', NULL),
  ('l_carnitine', 'L-carnitine', '500 mg', NULL),
  ('probiotics', 'Probiotica', 'Zie etiket', NULL),
  ('multivitamin_multimineral', 'Multi vitamines/mineralen', 'Volgens aanwijzing', NULL)
) AS v(supplement_key, label_nl, dosage_text, notes_nl)
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key) DO NOTHING;

-- ============================================================================
-- C) Rules upsert (idempotent)
-- ============================================================================

-- 1) Vitamin D – high dose supervision
INSERT INTO public.therapeutic_protocol_supplement_rules (
  protocol_id,
  supplement_key,
  rule_key,
  kind,
  severity,
  when_json,
  message_nl,
  is_active
)
SELECT
  p.id,
  'vitamin_d',
  'high_dose_supervision',
  'warning',
  'warn',
  '{"all":[{"field":"override","key":"supplements.vitamin_d.intended_amount","op":"gte","value":2000}]}'::jsonb,
  'Boven 2000 IU/dag vitamine D: alleen onder supervisie van arts/behandelaar.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- 2) Folate – too much folate with B-complex
INSERT INTO public.therapeutic_protocol_supplement_rules (
  protocol_id,
  supplement_key,
  rule_key,
  kind,
  severity,
  when_json,
  message_nl,
  is_active
)
SELECT
  p.id,
  'folate',
  'too_much_with_b_complex',
  'warning',
  'warn',
  '{"all":[{"field":"override","key":"supplements.b_complex.is_active","op":"exists"}]}'::jsonb,
  'Let op: bij B-complex kun je (methyl)folaat stapelen. Controleer totale folaat-inname.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- 3) Omega-3 – blood thinning caution
INSERT INTO public.therapeutic_protocol_supplement_rules (
  protocol_id,
  supplement_key,
  rule_key,
  kind,
  severity,
  when_json,
  message_nl,
  is_active
)
SELECT
  p.id,
  'omega3_fish_oil',
  'blood_thinning_caution',
  'contraindication',
  'error',
  '{"any":[{"field":"override","key":"meds.blood_thinner","op":"exists"},{"field":"override","key":"meds.aspirin","op":"exists"}]}'::jsonb,
  'Omega-3 kan bloedverdunnend werken. Extra risico bij aspirine/bloedverdunners.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- 4) Iodine – thyroid medication caution
INSERT INTO public.therapeutic_protocol_supplement_rules (
  protocol_id,
  supplement_key,
  rule_key,
  kind,
  severity,
  when_json,
  message_nl,
  is_active
)
SELECT
  p.id,
  'iodine',
  'thyroid_medication_caution',
  'warning',
  'warn',
  '{"all":[{"field":"override","key":"conditions.thyroid_medication","op":"exists"}]}'::jsonb,
  'Jodium (zeewier) kan schildkliermedicatie beïnvloeden; monitor waarden met arts.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- 5) Iodine – hyperthyroid risk note
INSERT INTO public.therapeutic_protocol_supplement_rules (
  protocol_id,
  supplement_key,
  rule_key,
  kind,
  severity,
  when_json,
  message_nl,
  is_active
)
SELECT
  p.id,
  'iodine',
  'hyperthyroid_unmasking_risk',
  'warning',
  'warn',
  '{"all":[{"field":"override","key":"conditions.hyperthyroid_history","op":"exists"}]}'::jsonb,
  'Jodium kan een (latente) overactieve schildklier ontmaskeren. Overleg bij voorgeschiedenis.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- 6) Creatine – hydration / kidney stones caution
INSERT INTO public.therapeutic_protocol_supplement_rules (
  protocol_id,
  supplement_key,
  rule_key,
  kind,
  severity,
  when_json,
  message_nl,
  is_active
)
SELECT
  p.id,
  'creatine_monohydrate',
  'hydration_kidney_stones_caution',
  'warning',
  'warn',
  '{"all":[{"field":"override","key":"conditions.kidney_stones_history","op":"exists"}]}'::jsonb,
  'Creatine vraagt extra hydratatie; bij nierstenen-gevoeligheid extra voorzichtig.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- 7) Probiotics – label caution (when_json null = altijd tonen)
INSERT INTO public.therapeutic_protocol_supplement_rules (
  protocol_id,
  supplement_key,
  rule_key,
  kind,
  severity,
  when_json,
  message_nl,
  is_active
)
SELECT
  p.id,
  'probiotics',
  'label_caution',
  'condition',
  'info',
  NULL,
  'Probiotica: lees het etiket. Vermijd formuleringen met cereal grasses als je daar gevoelig voor bent.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- 8) B12 – vegetarian risk note
INSERT INTO public.therapeutic_protocol_supplement_rules (
  protocol_id,
  supplement_key,
  rule_key,
  kind,
  severity,
  when_json,
  message_nl,
  is_active
)
SELECT
  p.id,
  'vitamin_b12',
  'vegetarian_low_b12_risk',
  'condition',
  'info',
  '{"all":[{"field":"override","key":"diet.vegetarian","op":"exists"}]}'::jsonb,
  'Vegetariërs lopen vaker risico op lage B12-spiegels; overweeg monitoring/suppletie.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- 9) Magnesium – neutrale info (geen when_json)
INSERT INTO public.therapeutic_protocol_supplement_rules (
  protocol_id,
  supplement_key,
  rule_key,
  kind,
  severity,
  when_json,
  message_nl,
  is_active
)
SELECT
  p.id,
  'magnesium',
  'mood_start_low',
  'condition',
  'info',
  NULL,
  'Kan invloed hebben op stemming/impulsiviteit; start laag.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- 10) Alpha-lipoic acid – neutrale info (geen when_json)
INSERT INTO public.therapeutic_protocol_supplement_rules (
  protocol_id,
  supplement_key,
  rule_key,
  kind,
  severity,
  when_json,
  message_nl,
  is_active
)
SELECT
  p.id,
  'alpha_lipoic_acid',
  'gi_build_up',
  'condition',
  'info',
  NULL,
  'Kan GI-klachten geven; bouw op.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- 11) NAC – med interactions risk (user-flag)
INSERT INTO public.therapeutic_protocol_supplement_rules (
  protocol_id,
  supplement_key,
  rule_key,
  kind,
  severity,
  when_json,
  message_nl,
  is_active
)
SELECT
  p.id,
  'n_acetylcysteine',
  'med_interactions_risk',
  'warning',
  'warn',
  '{"all":[{"field":"override","key":"conditions.med_interactions_risk","op":"exists"}]}'::jsonb,
  'Niet combineren zonder overleg bij bepaalde medicatie.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;
