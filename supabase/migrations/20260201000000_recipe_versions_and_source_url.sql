-- Migration: Recipe versions (original vs adapted) and source URL
-- Description: Add source_url, meal_data_original, ai_analysis_original to custom_meals
--              for URL display and keeping original when applying adaptations

-- Add columns to custom_meals
ALTER TABLE public.custom_meals
  ADD COLUMN IF NOT EXISTS source_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS meal_data_original JSONB NULL,
  ADD COLUMN IF NOT EXISTS ai_analysis_original JSONB NULL;

COMMENT ON COLUMN public.custom_meals.source_url IS 'Originele receptpagina-URL (bij URL-import)';
COMMENT ON COLUMN public.custom_meals.meal_data_original IS 'Vaste kopie van meal_data vóór eerste aanpassing (origineel recept)';
COMMENT ON COLUMN public.custom_meals.ai_analysis_original IS 'Vaste kopie van ai_analysis vóór eerste aanpassing (originele bereidingsinstructies)';

-- meal_history: ai_analysis voor bereidingsinstructies (zoals custom_meals)
ALTER TABLE public.meal_history
  ADD COLUMN IF NOT EXISTS ai_analysis JSONB NULL;
COMMENT ON COLUMN public.meal_history.ai_analysis IS 'AI analysis / bereidingsinstructies (instructions)';
