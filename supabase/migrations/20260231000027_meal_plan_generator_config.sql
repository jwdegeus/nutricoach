-- Migration: Meal plan generator config (templates, pool items, settings)
-- Description: Configurable template generator; admin-editable pools/templates/caps.
-- RLS: authenticated read (active config), admin write. No SELECT *.

-- ============================================================================
-- Table: meal_plan_templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.meal_plan_templates (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  name_nl TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_steps INT NOT NULL DEFAULT 6,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_templates_key ON public.meal_plan_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_meal_plan_templates_active ON public.meal_plan_templates(is_active);

-- ============================================================================
-- Table: meal_plan_template_slots
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.meal_plan_template_slots (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.meal_plan_templates(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL CHECK (slot_key IN ('protein', 'veg1', 'veg2', 'fat')),
  default_g INT NOT NULL,
  min_g INT NOT NULL,
  max_g INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, slot_key),
  CHECK (min_g <= default_g AND default_g <= max_g),
  CHECK (min_g >= 1 AND max_g <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_template_slots_template_id ON public.meal_plan_template_slots(template_id);

-- ============================================================================
-- Table: meal_plan_pool_items
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.meal_plan_pool_items (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_key TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('protein', 'veg', 'fat', 'flavor')),
  item_key TEXT NOT NULL,
  nevo_code TEXT,
  name TEXT NOT NULL,
  default_g INT,
  min_g INT,
  max_g INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(diet_key, category, item_key),
  CHECK (
    (default_g IS NULL AND min_g IS NULL AND max_g IS NULL)
    OR (default_g IS NOT NULL AND min_g IS NOT NULL AND max_g IS NOT NULL AND min_g <= default_g AND default_g <= max_g)
  ),
  CHECK (min_g IS NULL OR (min_g >= 1 AND max_g <= 500))
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_pool_items_diet_category_active
  ON public.meal_plan_pool_items(diet_key, category, is_active);

-- ============================================================================
-- Table: meal_plan_generator_settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.meal_plan_generator_settings (
  diet_key TEXT NOT NULL PRIMARY KEY,
  max_ingredients INT NOT NULL DEFAULT 10,
  max_flavor_items INT NOT NULL DEFAULT 2,
  protein_repeat_cap_7d INT NOT NULL DEFAULT 2,
  template_repeat_cap_7d INT NOT NULL DEFAULT 3,
  signature_retry_limit INT NOT NULL DEFAULT 8,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (max_ingredients >= 1 AND max_ingredients <= 20),
  CHECK (max_flavor_items >= 0 AND max_flavor_items <= 5),
  CHECK (protein_repeat_cap_7d >= 1 AND protein_repeat_cap_7d <= 14),
  CHECK (template_repeat_cap_7d >= 1 AND template_repeat_cap_7d <= 21),
  CHECK (signature_retry_limit >= 1 AND signature_retry_limit <= 20)
);

-- ============================================================================
-- Triggers: updated_at (reuse existing handle_updated_at)
-- ============================================================================
CREATE TRIGGER set_updated_at_meal_plan_templates
  BEFORE UPDATE ON public.meal_plan_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_meal_plan_template_slots
  BEFORE UPDATE ON public.meal_plan_template_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_meal_plan_pool_items
  BEFORE UPDATE ON public.meal_plan_pool_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_meal_plan_generator_settings
  BEFORE UPDATE ON public.meal_plan_generator_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS: meal_plan_templates
-- ============================================================================
ALTER TABLE public.meal_plan_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active meal_plan_templates"
  ON public.meal_plan_templates
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can insert meal_plan_templates"
  ON public.meal_plan_templates
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update meal_plan_templates"
  ON public.meal_plan_templates
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete meal_plan_templates"
  ON public.meal_plan_templates
  FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- RLS: meal_plan_template_slots
-- ============================================================================
ALTER TABLE public.meal_plan_template_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read meal_plan_template_slots"
  ON public.meal_plan_template_slots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_plan_templates t
      WHERE t.id = template_id AND t.is_active = true
    )
  );

CREATE POLICY "Admins can insert meal_plan_template_slots"
  ON public.meal_plan_template_slots
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update meal_plan_template_slots"
  ON public.meal_plan_template_slots
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete meal_plan_template_slots"
  ON public.meal_plan_template_slots
  FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- RLS: meal_plan_pool_items
-- ============================================================================
ALTER TABLE public.meal_plan_pool_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active meal_plan_pool_items"
  ON public.meal_plan_pool_items
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can insert meal_plan_pool_items"
  ON public.meal_plan_pool_items
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update meal_plan_pool_items"
  ON public.meal_plan_pool_items
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete meal_plan_pool_items"
  ON public.meal_plan_pool_items
  FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- RLS: meal_plan_generator_settings
-- ============================================================================
ALTER TABLE public.meal_plan_generator_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read meal_plan_generator_settings"
  ON public.meal_plan_generator_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert meal_plan_generator_settings"
  ON public.meal_plan_generator_settings
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update meal_plan_generator_settings"
  ON public.meal_plan_generator_settings
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete meal_plan_generator_settings"
  ON public.meal_plan_generator_settings
  FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- Optional seed: 3 templates + slots + flavor pool items (minimal)
-- ============================================================================
INSERT INTO public.meal_plan_templates (template_key, name_nl, max_steps)
VALUES
  ('bowl', 'Bowl', 4),
  ('sheet_pan', 'Sheet-pan gerecht', 5),
  ('soup', 'Soep', 5)
ON CONFLICT (template_key) DO NOTHING;

-- Slots for bowl (use template id from name)
DO $$
DECLARE
  bid UUID;
  sid UUID;
  soid UUID;
BEGIN
  SELECT id INTO bid FROM public.meal_plan_templates WHERE template_key = 'bowl' LIMIT 1;
  IF bid IS NOT NULL THEN
    INSERT INTO public.meal_plan_template_slots (template_id, slot_key, default_g, min_g, max_g)
    VALUES
      (bid, 'protein', 120, 50, 200),
      (bid, 'veg1', 80, 30, 150),
      (bid, 'veg2', 60, 30, 120),
      (bid, 'fat', 10, 5, 25)
    ON CONFLICT (template_id, slot_key) DO NOTHING;
  END IF;
  SELECT id INTO sid FROM public.meal_plan_templates WHERE template_key = 'sheet_pan' LIMIT 1;
  IF sid IS NOT NULL THEN
    INSERT INTO public.meal_plan_template_slots (template_id, slot_key, default_g, min_g, max_g)
    VALUES
      (sid, 'protein', 120, 50, 200),
      (sid, 'veg1', 80, 30, 150),
      (sid, 'veg2', 60, 30, 120),
      (sid, 'fat', 10, 5, 25)
    ON CONFLICT (template_id, slot_key) DO NOTHING;
  END IF;
  SELECT id INTO soid FROM public.meal_plan_templates WHERE template_key = 'soup' LIMIT 1;
  IF soid IS NOT NULL THEN
    INSERT INTO public.meal_plan_template_slots (template_id, slot_key, default_g, min_g, max_g)
    VALUES
      (soid, 'protein', 80, 40, 150),
      (soid, 'veg1', 100, 50, 180),
      (soid, 'veg2', 60, 30, 100),
      (soid, 'fat', 8, 5, 15)
    ON CONFLICT (template_id, slot_key) DO NOTHING;
  END IF;
END $$;

-- Flavor pool items (diet_key = 'default' so any diet can fall back; backend can filter by diet_key)
INSERT INTO public.meal_plan_pool_items (diet_key, category, item_key, nevo_code, name, default_g, min_g, max_g)
VALUES
  ('default', 'flavor', 'FLAVOR:garlic', 'FLAVOR:garlic', 'Knoflook', 5, 2, 10),
  ('default', 'flavor', 'FLAVOR:onion', 'FLAVOR:onion', 'Ui', 20, 10, 40),
  ('default', 'flavor', 'FLAVOR:lemon', 'FLAVOR:lemon', 'Citroen', 15, 10, 30),
  ('default', 'flavor', 'FLAVOR:lime', 'FLAVOR:lime', 'Limoen', 15, 10, 30),
  ('default', 'flavor', 'FLAVOR:ginger', 'FLAVOR:ginger', 'Gember', 5, 2, 10),
  ('default', 'flavor', 'FLAVOR:cumin', 'FLAVOR:cumin', 'Komijn', 3, 2, 6),
  ('default', 'flavor', 'FLAVOR:paprika', 'FLAVOR:paprika', 'Paprikapoeder', 3, 2, 6),
  ('default', 'flavor', 'FLAVOR:turmeric', 'FLAVOR:turmeric', 'Kurkuma', 3, 2, 6),
  ('default', 'flavor', 'FLAVOR:pepper', 'FLAVOR:pepper', 'Peper', 2, 1, 5),
  ('default', 'flavor', 'FLAVOR:salt', 'FLAVOR:salt', 'Zout', 2, 1, 5)
ON CONFLICT (diet_key, category, item_key) DO NOTHING;

-- ============================================================================
-- Verification (run manually to test RLS and constraints)
-- ============================================================================
-- As authenticated (non-admin): should see only active rows
-- SELECT id, template_key, name_nl FROM public.meal_plan_templates WHERE is_active = true;
-- SELECT id, template_id, slot_key, default_g FROM public.meal_plan_template_slots LIMIT 4;
-- SELECT id, diet_key, category, item_key FROM public.meal_plan_pool_items WHERE is_active = true LIMIT 5;
-- As admin: INSERT/UPDATE/DELETE should succeed
-- Constraint: min_g <= default_g <= max_g
-- INSERT INTO public.meal_plan_template_slots (template_id, slot_key, default_g, min_g, max_g)
--   SELECT id, 'fat', 5, 10, 3 FROM public.meal_plan_templates WHERE template_key = 'bowl' LIMIT 1;
--   -> should fail (min_g > max_g)
