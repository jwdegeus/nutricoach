-- Migration: Recipe adaptations – intro en "waarom dit werkt"
-- Beschrijving: Voegt kolommen toe voor Gemini "chef" output (intro-tekst en why_this_works bullets).

ALTER TABLE public.recipe_adaptations
  ADD COLUMN IF NOT EXISTS rewrite_intro TEXT NULL,
  ADD COLUMN IF NOT EXISTS rewrite_why_this_works JSONB NULL DEFAULT '[]';

COMMENT ON COLUMN public.recipe_adaptations.rewrite_intro IS 'Intro-tekst van de aangepaste versie (bv. "Om dit recept Wahls Paleo proof te maken...")';
COMMENT ON COLUMN public.recipe_adaptations.rewrite_why_this_works IS 'Array van strings: "Waarom dit werkt" bullets voor het dieet';
