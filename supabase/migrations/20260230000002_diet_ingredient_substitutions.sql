-- Diet ingredient substitutions: onthoud gekozen alternatieven per dieet voor snellere suggesties
CREATE TABLE IF NOT EXISTS public.diet_ingredient_substitutions (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  diet_id TEXT NOT NULL,
  original_normalized TEXT NOT NULL,
  substitute_display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, diet_id, original_normalized)
);

CREATE INDEX IF NOT EXISTS idx_diet_ingredient_substitutions_user_diet
  ON public.diet_ingredient_substitutions(user_id, diet_id);

ALTER TABLE public.diet_ingredient_substitutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own diet ingredient substitutions"
  ON public.diet_ingredient_substitutions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own diet ingredient substitutions"
  ON public.diet_ingredient_substitutions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own diet ingredient substitutions"
  ON public.diet_ingredient_substitutions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Optioneel: substitution_pairs op recipe_adaptations om bij apply te weten welke paren we moeten onthouden
ALTER TABLE public.recipe_adaptations
  ADD COLUMN IF NOT EXISTS substitution_pairs JSONB NULL DEFAULT '[]';
COMMENT ON COLUMN public.recipe_adaptations.substitution_pairs IS 'Array of { original_name, substitute_name } applied for this adaptation, for learning.';
