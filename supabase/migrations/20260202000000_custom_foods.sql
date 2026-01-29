-- Migration: Custom foods (eigen ingredienten)
-- Description: Tabel voor door admins aangemaakte ingredienten die niet in NEVO staan.
-- Structuur gelijk aan nevo_foods, zonder nevo_code/nevo_version.

CREATE TABLE IF NOT EXISTS public.custom_foods (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  food_group_nl TEXT NOT NULL DEFAULT 'Overig',
  food_group_en TEXT NOT NULL DEFAULT 'Other',
  name_nl TEXT NOT NULL,
  name_en TEXT,
  synonym TEXT,
  quantity TEXT NOT NULL DEFAULT 'per 100g',
  note TEXT,
  contains_traces_of TEXT,
  is_fortified_with TEXT,

  -- Energie en macronutriënten
  energy_kj NUMERIC(10, 2),
  energy_kcal NUMERIC(10, 2),
  water_g NUMERIC(10, 2),
  protein_g NUMERIC(10, 2),
  protein_pl_g NUMERIC(10, 2),
  protein_drl_g NUMERIC(10, 2),
  nitrogen_g NUMERIC(10, 2),
  tryptophan_mg NUMERIC(10, 2),
  fat_g NUMERIC(10, 2),
  fatty_acids_g NUMERIC(10, 2),
  saturated_fat_g NUMERIC(10, 2),
  monounsaturated_fat_g NUMERIC(10, 2),
  polyunsaturated_fat_g NUMERIC(10, 2),
  omega3_fat_g NUMERIC(10, 2),
  omega6_fat_g NUMERIC(10, 2),
  trans_fat_g NUMERIC(10, 2),
  carbs_g NUMERIC(10, 2),
  sugar_g NUMERIC(10, 2),
  free_sugars_g NUMERIC(10, 2),
  starch_g NUMERIC(10, 2),
  polyols_g NUMERIC(10, 2),
  fiber_g NUMERIC(10, 2),
  alcohol_g NUMERIC(10, 2),
  organic_acids_g NUMERIC(10, 2),
  ash_g NUMERIC(10, 2),

  -- Mineralen en spoorelementen
  cholesterol_mg NUMERIC(10, 2),
  sodium_mg NUMERIC(10, 2),
  potassium_mg NUMERIC(10, 2),
  calcium_mg NUMERIC(10, 2),
  phosphorus_mg NUMERIC(10, 2),
  magnesium_mg NUMERIC(10, 2),
  iron_mg NUMERIC(10, 2),
  iron_haem_mg NUMERIC(10, 2),
  iron_non_haem_mg NUMERIC(10, 2),
  copper_mg NUMERIC(10, 2),
  selenium_ug NUMERIC(10, 2),
  zinc_mg NUMERIC(10, 2),
  iodine_ug NUMERIC(10, 2),

  -- Vitamines (vetoplosbaar)
  vit_a_rae_ug NUMERIC(10, 2),
  vit_a_re_ug NUMERIC(10, 2),
  retinol_ug NUMERIC(10, 2),
  beta_carotene_total_ug NUMERIC(10, 2),
  alpha_carotene_ug NUMERIC(10, 2),
  lutein_ug NUMERIC(10, 2),
  zeaxanthin_ug NUMERIC(10, 2),
  beta_cryptoxanthin_ug NUMERIC(10, 2),
  lycopene_ug NUMERIC(10, 2),
  vit_d_ug NUMERIC(10, 2),
  vit_d3_ug NUMERIC(10, 2),
  vit_d2_ug NUMERIC(10, 2),
  vit_e_mg NUMERIC(10, 2),
  alpha_tocopherol_mg NUMERIC(10, 2),
  beta_tocopherol_mg NUMERIC(10, 2),
  delta_tocopherol_mg NUMERIC(10, 2),
  gamma_tocopherol_mg NUMERIC(10, 2),
  vit_k_ug NUMERIC(10, 2),
  vit_k1_ug NUMERIC(10, 2),
  vit_k2_ug NUMERIC(10, 2),

  -- Vitamines (wateroplosbaar)
  vit_b1_mg NUMERIC(10, 2),
  vit_b2_mg NUMERIC(10, 2),
  vit_b6_mg NUMERIC(10, 2),
  vit_b12_ug NUMERIC(10, 2),
  niacin_equiv_mg NUMERIC(10, 2),
  niacin_mg NUMERIC(10, 2),
  folate_equiv_ug NUMERIC(10, 2),
  folate_ug NUMERIC(10, 2),
  folic_acid_ug NUMERIC(10, 2),
  vit_c_mg NUMERIC(10, 2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_foods_name_nl ON public.custom_foods USING gin(to_tsvector('dutch', name_nl));
CREATE INDEX IF NOT EXISTS idx_custom_foods_name_en ON public.custom_foods USING gin(to_tsvector('english', COALESCE(name_en, name_nl)));
CREATE INDEX IF NOT EXISTS idx_custom_foods_food_group_nl ON public.custom_foods(food_group_nl);
CREATE INDEX IF NOT EXISTS idx_custom_foods_food_group_en ON public.custom_foods(food_group_en);

CREATE TRIGGER set_updated_at_custom_foods
  BEFORE UPDATE ON public.custom_foods
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.custom_foods ENABLE ROW LEVEL SECURITY;

-- Iedereen mag custom_foods lezen (voor gebruik in recepten/meals)
CREATE POLICY "Anyone can read custom_foods"
  ON public.custom_foods
  FOR SELECT
  USING (true);

-- Alleen admins mogen eigen ingredienten aanmaken/bewerken/verwijderen
CREATE POLICY "Admins can insert custom_foods"
  ON public.custom_foods
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update custom_foods"
  ON public.custom_foods
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete custom_foods"
  ON public.custom_foods
  FOR DELETE
  USING (public.is_admin(auth.uid()));
