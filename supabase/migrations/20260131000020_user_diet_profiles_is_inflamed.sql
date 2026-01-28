-- Migration: User Diet Profile - is_inflamed (Dieetregels)
-- Created: 2026-01-31
-- Description: Voegt is_inflamed toe aan user_diet_profiles voor de "Nightshade Toggle".
-- Bij true wordt de nightshade-categorie in Diet Logic als extra DROP toegevoegd.

ALTER TABLE public.user_diet_profiles
  ADD COLUMN IF NOT EXISTS is_inflamed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_diet_profiles.is_inflamed IS
  'Ontstekingsgevoelig: nachtschades (tomaat, paprika, aardappel, etc.) worden in Dieetregels als DROP behandeld.';
