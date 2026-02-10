-- Migration: Seed Wahls protocol + supplements + supplement rules (idempotent)
-- Description: DB-only seed for protocol wahls_mitochondria_v1 with supplement guidance and when_json rules.
-- No UI, no service code. All content admin-editable later.

-- ============================================================================
-- 1) Protocol "Wahls – Mitochondria (v1)"
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
  '[
    {"title": "The Wahls Protocol", "url": null},
    {"title": "The Wahls Protocol Cooking for Life", "url": null}
  ]'::jsonb
)
ON CONFLICT (protocol_key) DO NOTHING;

-- ============================================================================
-- 2) Seed therapeutic_protocol_supplements (idempotent)
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
  ('magnesium', 'Magnesium', 'Tot 500 mg (elementair) per dag', 'Voedingsbron: o.a. pompoenpitten, zaden, koolfamilie groenten.'),
  ('theanine', 'L-theanine', 'Tot 500 mg per dag', 'Voedingsbron: groene thee.'),
  ('taurine', 'Taurine', '1–5 gram per dag', 'Ondersteunt neurotransmitters; kan helpen bij prikkelbaarheid en chronische pijn.'),
  ('vitamin_d', 'Vitamine D', 'Tot 2000 IU per dag', 'Waarschuwing: hogere doseringen onder supervisie. (Studies genoemd: 4000 IU / 10000 IU).'),
  ('methyl_folate', 'Methylfolaat', 'Tot 800 mcg per dag', 'Waarschuwing: bij B-complex mogelijk te veel folaat. Methylfolaat kan meer consistent worden gebruikt dan regulier folaat.'),
  ('coenzyme_q10', 'Co-enzym Q10', '200 mg per dag (tot 1200 mg in Parkinson-context)', 'Voedingsbron: orgaanvlees (lever/hart), 1–2x per week; ook noten/zaden/brewer''s yeast.'),
  ('iodine', 'Jodium (uit zeewier)', '¼ tot 1 theelepel gedroogd zeewier per dag', 'Waarschuwing: kan schildkliermedicatie beïnvloeden en hyperthyreoïdie "ontmaskeren".'),
  ('omega3', 'Omega-3 vetzuren (visolie)', '1–4 gram per dag', 'Voedingsbron: zalm/makreel 2+ keer per week (DHA-verrijkte eieren alternatief).'),
  ('flax_hemp_oil', 'Lijnzaadolie / Hennepolie', '1–2 eetlepels per dag', 'Niet verhitten; kan mengen met rijstazijn + sojasaus als dressing.'),
  ('nac', 'N-acetylcysteïne (NAC)', '1–2 gram per dag', 'Voedingsbron: kruisbloemigen/alliaceae (kool, broccoli, knoflook, ui, etc.).'),
  ('alpha_lipoic_acid', 'Alfa-liponzuur (ALA)', '600 mg per dag', 'Gebruikt bij diabetes/neuropathie in studies; ondersteunt mitochondriën.'),
  ('creatine_monohydrate', 'Creatine monohydraat', '1 theelepel per dag', 'Helpt ATP; kan spierafbraak verminderen. Let op hydratatie.'),
  ('probiotics', 'Probiotica', 'Volgens etiket', 'Waarschuwing: lees labels; mogelijk cereal grasses vermijden.'),
  ('resveratrol', 'Resveratrol', 'Tot 200 mg per dag', 'Voedingsbron: druivensap, blauwe bessen, pinda''s; "potent antioxidant" in tekst.'),
  ('trace_minerals', 'Spoormineralen', '¼ tot 1 theelepel (kelp/algen) per dag', 'Waarschuwing: kan schildklierhormoonspiegels beïnvloeden; let op bij schildkliermedicatie.')
) AS v(supplement_key, label_nl, dosage_text, notes_nl)
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key) DO NOTHING;

-- ============================================================================
-- 3) Seed therapeutic_protocol_supplement_rules (idempotent)
-- ============================================================================

-- a) vitamin_d – HIGH_DOSE_SUPERVISION
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
  'HIGH_DOSE_SUPERVISION',
  'warning',
  'warn',
  '{"all":[{"field":"override","key":"supplements.vitamin_d.intended_amount","op":"gte","value":2000}]}'::jsonb,
  'Doseringen vitamine D boven 2000 IU/dag graag onder supervisie van arts.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- b) iodine – THYROID_CAUTION (when_json null = altijd tonen)
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
  'THYROID_CAUTION',
  'warning',
  'warn',
  NULL,
  'Jodium uit zeewier kan schildkliermedicatie beïnvloeden en hyperthyreoïdie ontmaskeren; monitor schildklierwaarden.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- c) omega3 – BLOOD_THINNING_CAUTION
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
  'omega3',
  'BLOOD_THINNING_CAUTION',
  'warning',
  'warn',
  '{"any":[{"field":"override","key":"meds.blood_thinner","op":"exists"},{"field":"override","key":"meds.aspirin","op":"exists"}]}'::jsonb,
  'Omega-3 kan bloedverdunning/ blauwe plekken versterken bij aspirin of bloedverdunners.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- d) methyl_folate – TOO_MUCH_FOLATE_WITH_B_COMPLEX
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
  'methyl_folate',
  'TOO_MUCH_FOLATE_WITH_B_COMPLEX',
  'warning',
  'info',
  '{"all":[{"field":"override","key":"supplements.b_complex.is_active","op":"exists"}]}'::jsonb,
  'Let op: in combinatie met een B-complex kun je mogelijk te veel folaat binnenkrijgen.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;

-- e) probiotics – LABEL_CAUTION (when_json null = altijd tonen)
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
  'LABEL_CAUTION',
  'condition',
  'info',
  NULL,
  'Probiotica: lees het etiket; overweeg producten met cereal grasses te vermijden als dit voor jou niet past.',
  true
FROM public.therapeutic_protocols p
WHERE p.protocol_key = 'wahls_mitochondria_v1'
ON CONFLICT (protocol_id, supplement_key, rule_key) DO NOTHING;
