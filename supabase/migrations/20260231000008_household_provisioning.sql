-- Migration: Auto-provision household bij first use + backfill bestaande users
-- Description: Trigger op user_preferences upsert zet household_id; backfill vult bestaande rijen.
-- Geen UI; geen auto-members; RLS ongewijzigd.

-- ============================================================================
-- Function: ensure_household_for_user_preferences (SECURITY DEFINER)
-- ============================================================================
-- Alleen voor NEW.user_id; minimale insert. search_path strikt om data leaks te voorkomen.

CREATE OR REPLACE FUNCTION public.ensure_household_for_user_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id UUID;
BEGIN
  IF NEW.household_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.households (owner_user_id)
  VALUES (NEW.user_id)
  RETURNING id INTO new_household_id;

  NEW.household_id := new_household_id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ensure_household_for_user_preferences() IS
  'Trigger: bij INSERT/UPDATE van user_preferences met household_id IS NULL wordt één household aangemaakt (owner_user_id = user_id). Alleen voor die user_id.';

-- ============================================================================
-- Trigger: BEFORE INSERT OR UPDATE OF household_id ON user_preferences
-- ============================================================================
-- Alleen wanneer NEW.household_id IS NULL

DROP TRIGGER IF EXISTS ensure_household_on_user_preferences ON public.user_preferences;

CREATE TRIGGER ensure_household_on_user_preferences
  BEFORE INSERT OR UPDATE OF household_id
  ON public.user_preferences
  FOR EACH ROW
  WHEN (NEW.household_id IS NULL)
  EXECUTE FUNCTION public.ensure_household_for_user_preferences();

-- ============================================================================
-- Backfill (eenmalig, idempotent): bestaande users met household_id IS NULL
-- ============================================================================
-- Eén CTE: insert households voor die users, daarna update user_preferences.
-- Tweede run: geen rijen met household_id IS NULL meer → geen dubbele households.

WITH to_provision AS (
  SELECT user_id
  FROM public.user_preferences
  WHERE household_id IS NULL
),
inserted AS (
  INSERT INTO public.households (owner_user_id)
  SELECT user_id FROM to_provision
  RETURNING id, owner_user_id
)
UPDATE public.user_preferences up
SET household_id = inserted.id
FROM inserted
WHERE up.user_id = inserted.owner_user_id;

-- ============================================================================
-- Verificatiequeries (als commentaar)
-- ============================================================================
-- Controleer dat geen user_preferences meer household_id IS NULL heeft (na backfill):
--   SELECT COUNT(*) FROM public.user_preferences WHERE household_id IS NULL;
-- Controleer 1:1 owner_user_id ↔ user_id (één household per user):
--   SELECT h.owner_user_id, up.user_id, up.household_id, h.id
--   FROM public.user_preferences up
--   JOIN public.households h ON h.id = up.household_id
--   WHERE up.user_id = h.owner_user_id
--   LIMIT 5;
