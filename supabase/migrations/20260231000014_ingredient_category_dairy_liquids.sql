-- Description: Add ingredient category dairy_liquids so it appears in admin/ingredients?tab=groups.
-- Used by the meal planner candidate pool for shake/smoothie ingredients (melk, yoghurt, kwark, amandelmelk, etc.).
-- No diet_category_constraints are added, so no diet will require or forbid this category; it is for visibility and meal planner alignment.

INSERT INTO public.ingredient_categories (
  code,
  name_nl,
  name_en,
  description,
  category_type,
  display_order,
  is_active
) VALUES (
  'dairy_liquids',
  'Melk & vloeistoffen (shakes/smoothies)',
  'Dairy & liquids (shakes/smoothies)',
  'Voor eiwitshakes en smoothies: melk, yoghurt, kwark, amandelmelk, sojamelk, eiwitpoeder. Gebruikt door de meal planner candidate pool.',
  'required',
  50,
  true
)
ON CONFLICT (code) DO NOTHING;
