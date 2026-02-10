-- Migration: Meal plan generator DB config (thresholds, variety targets, culinary coherence)
-- Description: Admin-managed generator parameters; runtime reads active rows only.
-- RLS: authenticated read (active rows), admin write. No SELECT * in policies.
-- Scope: tables + RLS + seed defaults only; no UI, no generator code changes.

-- ============================================================================
-- Table: meal_plan_generator_settings_v2
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.meal_plan_generator_settings_v2 (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_key TEXT NULL,
  min_history_reuse_ratio NUMERIC NOT NULL,
  target_prefill_ratio NUMERIC NOT NULL,
  recency_window_days INT NOT NULL,
  max_ai_generated_slots_per_week INT NOT NULL,
  min_db_recipe_coverage_ratio NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  schema_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (min_history_reuse_ratio >= 0 AND min_history_reuse_ratio <= 1),
  CHECK (target_prefill_ratio >= 0 AND target_prefill_ratio <= 1),
  CHECK (min_db_recipe_coverage_ratio >= 0 AND min_db_recipe_coverage_ratio <= 1),
  CHECK (recency_window_days >= 0),
  CHECK (max_ai_generated_slots_per_week >= 0)
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_generator_settings_v2_diet_active
  ON public.meal_plan_generator_settings_v2(diet_key, is_active);

-- At most one active row per diet_key (including NULL = global default). Compatible with PG 14+.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plan_generator_settings_v2_one_active_per_diet
  ON public.meal_plan_generator_settings_v2 (diet_key)
  WHERE (is_active = true AND diet_key IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plan_generator_settings_v2_one_active_global
  ON public.meal_plan_generator_settings_v2 ((true))
  WHERE (is_active = true AND diet_key IS NULL);

COMMENT ON TABLE public.meal_plan_generator_settings_v2 IS 'Admin-managed generator thresholds: reuse/coverage/recency. diet_key NULL = global default.';

-- ============================================================================
-- Table: meal_plan_variety_targets_v1
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.meal_plan_variety_targets_v1 (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_key TEXT NULL,
  unique_veg_min INT NOT NULL,
  unique_fruit_min INT NOT NULL,
  protein_rotation_min_categories INT NOT NULL,
  max_repeat_same_recipe_within_days INT NOT NULL,
  favorites_repeat_boost NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  schema_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (unique_veg_min >= 0),
  CHECK (unique_fruit_min >= 0),
  CHECK (protein_rotation_min_categories >= 0),
  CHECK (max_repeat_same_recipe_within_days >= 0),
  CHECK (favorites_repeat_boost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_variety_targets_v1_diet_active
  ON public.meal_plan_variety_targets_v1(diet_key, is_active);

-- At most one active row per diet_key (including NULL = global default). Compatible with PG 14+.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plan_variety_targets_v1_one_active_per_diet
  ON public.meal_plan_variety_targets_v1 (diet_key)
  WHERE (is_active = true AND diet_key IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plan_variety_targets_v1_one_active_global
  ON public.meal_plan_variety_targets_v1 ((true))
  WHERE (is_active = true AND diet_key IS NULL);

COMMENT ON TABLE public.meal_plan_variety_targets_v1 IS 'Admin-managed variety targets per diet. diet_key NULL = global default.';

-- ============================================================================
-- Table: meal_plan_culinary_rules_v1
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.meal_plan_culinary_rules_v1 (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code TEXT NOT NULL UNIQUE,
  slot_type TEXT NOT NULL,
  match_mode TEXT NOT NULL,
  match_value TEXT NOT NULL,
  action TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  schema_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (slot_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'smoothie')),
  CHECK (match_mode IN ('term', 'regex')),
  CHECK (action IN ('block', 'warn')),
  CHECK (priority >= 0)
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_culinary_rules_v1_slot_active_priority
  ON public.meal_plan_culinary_rules_v1(slot_type, is_active, priority DESC);

COMMENT ON TABLE public.meal_plan_culinary_rules_v1 IS 'Culinary coherence rules: e.g. block egg/baked in smoothie slot. Applied by slot_type and priority.';

-- ============================================================================
-- Triggers: updated_at
-- ============================================================================
CREATE TRIGGER set_updated_at_meal_plan_generator_settings_v2
  BEFORE UPDATE ON public.meal_plan_generator_settings_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_meal_plan_variety_targets_v1
  BEFORE UPDATE ON public.meal_plan_variety_targets_v1
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_meal_plan_culinary_rules_v1
  BEFORE UPDATE ON public.meal_plan_culinary_rules_v1
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS: meal_plan_generator_settings_v2
-- ============================================================================
ALTER TABLE public.meal_plan_generator_settings_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active meal_plan_generator_settings_v2"
  ON public.meal_plan_generator_settings_v2
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can insert meal_plan_generator_settings_v2"
  ON public.meal_plan_generator_settings_v2
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update meal_plan_generator_settings_v2"
  ON public.meal_plan_generator_settings_v2
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete meal_plan_generator_settings_v2"
  ON public.meal_plan_generator_settings_v2
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- RLS: meal_plan_variety_targets_v1
-- ============================================================================
ALTER TABLE public.meal_plan_variety_targets_v1 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active meal_plan_variety_targets_v1"
  ON public.meal_plan_variety_targets_v1
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can insert meal_plan_variety_targets_v1"
  ON public.meal_plan_variety_targets_v1
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update meal_plan_variety_targets_v1"
  ON public.meal_plan_variety_targets_v1
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete meal_plan_variety_targets_v1"
  ON public.meal_plan_variety_targets_v1
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- RLS: meal_plan_culinary_rules_v1
-- ============================================================================
ALTER TABLE public.meal_plan_culinary_rules_v1 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active meal_plan_culinary_rules_v1"
  ON public.meal_plan_culinary_rules_v1
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can insert meal_plan_culinary_rules_v1"
  ON public.meal_plan_culinary_rules_v1
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update meal_plan_culinary_rules_v1"
  ON public.meal_plan_culinary_rules_v1
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete meal_plan_culinary_rules_v1"
  ON public.meal_plan_culinary_rules_v1
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- Seed: global defaults (diet_key NULL)
-- ============================================================================

-- One global default row for generator settings (reuse/coverage/recency intent)
INSERT INTO public.meal_plan_generator_settings_v2 (
  diet_key,
  min_history_reuse_ratio,
  target_prefill_ratio,
  recency_window_days,
  max_ai_generated_slots_per_week,
  min_db_recipe_coverage_ratio,
  is_active,
  schema_version
)
SELECT NULL, 0.2, 0.7, 90, 14, 0.5, true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.meal_plan_generator_settings_v2
  WHERE diet_key IS NULL AND is_active = true
);

-- One global default row for variety targets
INSERT INTO public.meal_plan_variety_targets_v1 (
  diet_key,
  unique_veg_min,
  unique_fruit_min,
  protein_rotation_min_categories,
  max_repeat_same_recipe_within_days,
  favorites_repeat_boost,
  is_active,
  schema_version
)
SELECT NULL, 5, 3, 3, 7, 1.0, true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.meal_plan_variety_targets_v1
  WHERE diet_key IS NULL AND is_active = true
);

-- Culinary coherence rules: block egg/baked in smoothie; block fry/bake techniques in smoothie
INSERT INTO public.meal_plan_culinary_rules_v1 (
  rule_code,
  slot_type,
  match_mode,
  match_value,
  action,
  reason_code,
  priority,
  is_active,
  schema_version
) VALUES
  ('smoothie_no_egg', 'smoothie', 'term', 'ei', 'block', 'egg_in_smoothie', 10, true, 1),
  ('smoothie_no_gebakken_ei', 'smoothie', 'term', 'gebakken ei', 'block', 'egg_in_smoothie', 10, true, 1),
  ('smoothie_no_baked_egg', 'smoothie', 'term', 'baked egg', 'block', 'egg_in_smoothie', 10, true, 1),
  ('smoothie_no_fry', 'smoothie', 'term', 'bakken', 'block', 'cook_technique_mismatch', 5, true, 1),
  ('smoothie_no_frituren', 'smoothie', 'term', 'frituren', 'block', 'cook_technique_mismatch', 5, true, 1)
ON CONFLICT (rule_code) DO NOTHING;
