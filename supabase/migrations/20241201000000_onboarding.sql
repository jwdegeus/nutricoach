-- Migration: Onboarding datamodel voor mealplanner
-- Created: 2024-12-01
-- Description: Tabellen voor user preferences en diet profiles met RLS policies

-- ============================================================================
-- Table: user_preferences
-- ============================================================================
-- Opslag van gebruikersvoorkeuren voor mealplanning
-- PK: user_id (gekoppeld aan auth.users via UUID)
-- Note: tenant_id kan later worden toegevoegd indien multi-tenant nodig is

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  max_prep_minutes INTEGER NOT NULL DEFAULT 30,
  servings_default INTEGER NOT NULL DEFAULT 1,
  kcal_target INTEGER NULL,
  allergies TEXT[] NOT NULL DEFAULT '{}',
  dislikes TEXT[] NOT NULL DEFAULT '{}',
  variety_window_days INTEGER NOT NULL DEFAULT 7,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  onboarding_completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index voor user_preferences
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences(user_id);

-- ============================================================================
-- Table: user_diet_profiles
-- ============================================================================
-- Opslag van dieetprofielen met start/eind datums
-- Ondersteunt meerdere profielen per gebruiker (historisch overzicht)

CREATE TABLE IF NOT EXISTS public.user_diet_profiles (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE NULL,
  strictness INTEGER NOT NULL DEFAULT 5 CHECK (strictness >= 1 AND strictness <= 10),
  diet_type_id UUID NULL, -- Referentie naar toekomstige diet_types tabel
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexen voor user_diet_profiles
CREATE INDEX IF NOT EXISTS idx_user_diet_profiles_user_id ON public.user_diet_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_diet_profiles_ends_on ON public.user_diet_profiles(ends_on);
CREATE INDEX IF NOT EXISTS idx_user_diet_profiles_user_ends ON public.user_diet_profiles(user_id, ends_on);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS op beide tabellen
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_diet_profiles ENABLE ROW LEVEL SECURITY;

-- Policies voor user_preferences
-- Alleen de ingelogde gebruiker mag zijn eigen preferences zien/bewerken

CREATE POLICY "Users can view own preferences"
  ON public.user_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies voor user_diet_profiles
-- Alleen de ingelogde gebruiker mag zijn eigen diet profiles zien/bewerken

CREATE POLICY "Users can view own diet profiles"
  ON public.user_diet_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own diet profiles"
  ON public.user_diet_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own diet profiles"
  ON public.user_diet_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own diet profiles"
  ON public.user_diet_profiles
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Triggers voor updated_at
-- ============================================================================

-- Functie om updated_at automatisch bij te werken
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers voor beide tabellen
CREATE TRIGGER set_updated_at_user_preferences
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_user_diet_profiles
  BEFORE UPDATE ON public.user_diet_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Test Queries
-- ============================================================================
-- Gebruik deze queries om de migratie te testen (vervang USER_ID met een echte UUID)

/*
-- Test: SELECT user preferences
SELECT * FROM public.user_preferences WHERE user_id = 'USER_ID';

-- Test: INSERT user preferences
INSERT INTO public.user_preferences (
  user_id,
  max_prep_minutes,
  servings_default,
  kcal_target,
  allergies,
  dislikes,
  variety_window_days
) VALUES (
  'USER_ID',
  45,
  2,
  2000,
  ARRAY['gluten', 'lactose'],
  ARRAY['vis', 'noten'],
  14
);

-- Test: UPDATE user preferences
UPDATE public.user_preferences
SET 
  max_prep_minutes = 60,
  kcal_target = 2200,
  onboarding_completed = true,
  onboarding_completed_at = NOW()
WHERE user_id = 'USER_ID';

-- Test: SELECT diet profiles
SELECT * FROM public.user_diet_profiles WHERE user_id = 'USER_ID';

-- Test: INSERT diet profile
INSERT INTO public.user_diet_profiles (
  user_id,
  starts_on,
  ends_on,
  strictness,
  diet_type_id
) VALUES (
  'USER_ID',
  CURRENT_DATE,
  NULL,
  7,
  NULL
);

-- Test: UPDATE diet profile (eindig een actief profiel)
UPDATE public.user_diet_profiles
SET ends_on = CURRENT_DATE
WHERE user_id = 'USER_ID' AND ends_on IS NULL;

-- Test: RLS verificatie - probeer als andere user (moet falen)
-- SET ROLE authenticated;
-- SELECT * FROM public.user_preferences WHERE user_id != auth.uid(); -- Moet leeg zijn
*/
