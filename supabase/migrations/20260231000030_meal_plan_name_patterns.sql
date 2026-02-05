-- Migration: Meal plan name patterns (style packs)
-- Description: DB-configurable NL meal naming patterns per diet_key, template_key, slot.
-- RLS: authenticated read active; admin full CRUD.

-- ============================================================================
-- Table: meal_plan_name_patterns
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.meal_plan_name_patterns (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_key TEXT NOT NULL,
  template_key TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'dinner')),
  pattern TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(diet_key, template_key, slot, pattern),
  CHECK (char_length(pattern) >= 5 AND char_length(pattern) <= 120)
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_name_patterns_lookup
  ON public.meal_plan_name_patterns(diet_key, template_key, slot)
  WHERE is_active = true;

-- ============================================================================
-- Trigger: updated_at
-- ============================================================================
CREATE TRIGGER set_updated_at_meal_plan_name_patterns
  BEFORE UPDATE ON public.meal_plan_name_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.meal_plan_name_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active meal_plan_name_patterns"
  ON public.meal_plan_name_patterns
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can insert meal_plan_name_patterns"
  ON public.meal_plan_name_patterns
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update meal_plan_name_patterns"
  ON public.meal_plan_name_patterns
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete meal_plan_name_patterns"
  ON public.meal_plan_name_patterns
  FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- Seed: default diet_key patterns (~6–10 per template/slot)
-- Tokens: {protein}, {veg1}, {veg2}, {flavor}, {templateName}
-- ============================================================================
INSERT INTO public.meal_plan_name_patterns (diet_key, template_key, slot, pattern)
VALUES
  ('default', 'bowl', 'breakfast', '{protein} met {veg1} & {veg2}'),
  ('default', 'bowl', 'breakfast', '{templateName}: {protein}, {veg1} en {veg2}'),
  ('default', 'bowl', 'breakfast', '{protein}–{veg1} bowl met {flavor}'),
  ('default', 'bowl', 'breakfast', 'Bowl {protein} met {veg1} en {veg2}'),
  ('default', 'bowl', 'breakfast', '{protein} met {veg1} ({flavor})'),
  ('default', 'bowl', 'lunch', '{protein} met {veg1} & {veg2}'),
  ('default', 'bowl', 'lunch', '{templateName}: {protein}, {veg1} en {veg2}'),
  ('default', 'bowl', 'lunch', '{protein}–{veg1} bowl met {flavor}'),
  ('default', 'bowl', 'lunch', 'Bowl {protein} met {veg1} en {veg2}'),
  ('default', 'bowl', 'lunch', '{protein} met {veg1} ({flavor})'),
  ('default', 'bowl', 'dinner', '{protein} met {veg1} & {veg2}'),
  ('default', 'bowl', 'dinner', '{templateName}: {protein}, {veg1} en {veg2}'),
  ('default', 'bowl', 'dinner', '{protein}–{veg1} bowl met {flavor}'),
  ('default', 'bowl', 'dinner', 'Bowl {protein} met {veg1} en {veg2}'),
  ('default', 'bowl', 'dinner', '{protein} met {veg1} ({flavor})'),
  ('default', 'sheet_pan', 'breakfast', 'Ovenschotel {protein} met {veg1} & {veg2}'),
  ('default', 'sheet_pan', 'breakfast', '{templateName}: {protein}, {veg1} en {veg2}'),
  ('default', 'sheet_pan', 'breakfast', '{protein} met {veg1} uit de oven ({flavor})'),
  ('default', 'sheet_pan', 'lunch', 'Ovenschotel {protein} met {veg1} & {veg2}'),
  ('default', 'sheet_pan', 'lunch', '{templateName}: {protein}, {veg1} en {veg2}'),
  ('default', 'sheet_pan', 'lunch', '{protein} met {veg1} uit de oven ({flavor})'),
  ('default', 'sheet_pan', 'dinner', 'Ovenschotel {protein} met {veg1} & {veg2}'),
  ('default', 'sheet_pan', 'dinner', '{templateName}: {protein}, {veg1} en {veg2}'),
  ('default', 'sheet_pan', 'dinner', '{protein} met {veg1} uit de oven ({flavor})'),
  ('default', 'soup', 'breakfast', 'Soep van {veg1} & {veg2} met {protein}'),
  ('default', 'soup', 'breakfast', '{templateName}: {protein}, {veg1} en {veg2}'),
  ('default', 'soup', 'breakfast', 'Soep met {protein} en {veg1} ({flavor})'),
  ('default', 'soup', 'lunch', 'Soep van {veg1} & {veg2} met {protein}'),
  ('default', 'soup', 'lunch', '{templateName}: {protein}, {veg1} en {veg2}'),
  ('default', 'soup', 'lunch', 'Soep met {protein} en {veg1} ({flavor})'),
  ('default', 'soup', 'dinner', 'Soep van {veg1} & {veg2} met {protein}'),
  ('default', 'soup', 'dinner', '{templateName}: {protein}, {veg1} en {veg2}'),
  ('default', 'soup', 'dinner', 'Soep met {protein} en {veg1} ({flavor})')
ON CONFLICT (diet_key, template_key, slot, pattern) DO NOTHING;
