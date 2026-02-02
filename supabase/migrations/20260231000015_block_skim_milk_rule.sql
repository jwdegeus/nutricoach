-- Migration: Hard block rule for magere melk (skim milk) in diet guardrails
-- Created: 2026-02-01
-- Description: Voegt een firewall-style recipe_adaptation_rule toe voor Wahls Paleo
--              zodat "magere melk" en gangbare varianten altijd geblokkeerd worden.
-- Idempotent: ON CONFLICT DO UPDATE; veilig meerdere keren draaien.

-- ============================================================================
-- Insert/upsert hard block rule for skim milk (magere melk)
-- ============================================================================
-- target=ingredient, match_mode=substring voor betrouwbare match in ingrediëntenlijsten.
-- priority 9000+ zodat deze regel vóór generieke zuivelregels wordt geëvalueerd.

INSERT INTO public.recipe_adaptation_rules (
  diet_type_id,
  term,
  synonyms,
  rule_code,
  rule_label,
  substitution_suggestions,
  priority,
  is_active,
  target,
  match_mode
)
SELECT
  dt.id,
  'magere melk',
  '["skim milk", "low-fat milk", "0% milk", "halfvolle melk", "milk (skim)", "magere melk", "skummet mælk", "entrahmte milch"]'::jsonb,
  'FORBIDDEN_DAIRY_SKIM_MILK_HARD',
  'Magere melk / skim milk verboden (Wahls Paleo)',
  '["ongezoete amandelmelk", "kokosmelk", "coconut milk", "almond milk", "amandelmelk"]'::jsonb,
  9000,
  true,
  'ingredient',
  'substring'
FROM public.diet_types dt
WHERE dt.name = 'Wahls Paleo'
LIMIT 1
ON CONFLICT (diet_type_id, term) DO UPDATE SET
  synonyms = EXCLUDED.synonyms,
  rule_code = EXCLUDED.rule_code,
  rule_label = EXCLUDED.rule_label,
  substitution_suggestions = EXCLUDED.substitution_suggestions,
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  target = EXCLUDED.target,
  match_mode = EXCLUDED.match_mode,
  updated_at = NOW();

-- ============================================================================
-- Verification queries (commentaar – uncomment voor controle na migratie)
-- ============================================================================
/*
SELECT rar.id, rar.rule_code, rar.term, rar.priority, rar.is_active, rar.target, rar.match_mode
FROM public.recipe_adaptation_rules rar
JOIN public.diet_types dt ON dt.id = rar.diet_type_id
WHERE dt.name = 'Wahls Paleo'
  AND rar.rule_code = 'FORBIDDEN_DAIRY_SKIM_MILK_HARD';

SELECT rar.term, rar.synonyms, rar.substitution_suggestions
FROM public.recipe_adaptation_rules rar
JOIN public.diet_types dt ON dt.id = rar.diet_type_id
WHERE dt.name = 'Wahls Paleo'
  AND rar.term = 'magere melk';
*/
