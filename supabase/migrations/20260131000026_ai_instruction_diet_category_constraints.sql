-- Migration: AI instructie voor dieetregels
-- Description: Voegt optionele kolom ai_instruction toe aan diet_category_constraints
--   zodat bij aanmaken van een regel een vrije instructie meegegeven kan worden
--   voor betere AI-interpretatie (context, uitzonderingen, nadere toelichting).

ALTER TABLE public.diet_category_constraints
  ADD COLUMN IF NOT EXISTS ai_instruction TEXT NULL;

COMMENT ON COLUMN public.diet_category_constraints.ai_instruction IS
  'Optionele instructie voor AI: context, uitzonderingen of toelichting zodat de regel beter begrepen wordt.';
