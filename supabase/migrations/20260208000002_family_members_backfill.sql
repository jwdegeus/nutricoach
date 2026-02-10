-- Backfill: create "Ik" family member for existing users and copy user_* data to family_member_*.
-- Run once after 20260208000000_family_members_schema and 20260208000001.
-- user_preferences.breakfast/lunch/dinner_preference may be text (JSON) or text[] depending on DB; normalize to text[].

CREATE OR REPLACE FUNCTION _backfill_pref_to_text_array(v text) RETURNS text[] AS $$
BEGIN
  IF v IS NULL OR trim(v) = '' THEN RETURN ARRAY[]::text[]; END IF;
  -- array_agg returns NULL for no rows (e.g. '[]'); NOT NULL column requires empty array
  RETURN COALESCE(
    (SELECT array_agg(elem) FROM jsonb_array_elements_text(v::jsonb) elem),
    ARRAY[]::text[]
  );
EXCEPTION WHEN OTHERS THEN
  RETURN ARRAY[]::text[];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION _backfill_pref_to_text_array(v text[]) RETURNS text[] AS $$
BEGIN
  RETURN COALESCE(v, ARRAY[]::text[]);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DO $$
DECLARE
  r RECORD;
  fm_id UUID;
BEGIN
  FOR r IN
    SELECT DISTINCT u.id AS user_id
    FROM auth.users u
    WHERE EXISTS (SELECT 1 FROM public.user_preferences up WHERE up.user_id = u.id)
       OR EXISTS (SELECT 1 FROM public.user_diet_profiles udp WHERE udp.user_id = u.id)
       OR EXISTS (SELECT 1 FROM public.user_health_profiles uhp WHERE uhp.user_id = u.id)
       OR EXISTS (SELECT 1 FROM public.user_therapeutic_profiles utp WHERE utp.user_id = u.id)
  LOOP
    -- Get or create "Ik" family member (idempotent: reuse if already exists from partial run or app)
    SELECT id INTO fm_id FROM public.family_members WHERE user_id = r.user_id AND is_self = true;
    IF fm_id IS NULL THEN
      INSERT INTO public.family_members (user_id, name, is_self, sort_order)
      VALUES (r.user_id, 'Ik', true, 0)
      RETURNING id INTO fm_id;
    END IF;

    INSERT INTO public.family_member_preferences (
      family_member_id,
      max_prep_minutes,
      servings_default,
      kcal_target,
      allergies,
      dislikes,
      variety_window_days,
      breakfast_preference,
      lunch_preference,
      dinner_preference
    )
    SELECT
      fm_id,
      COALESCE(up.max_prep_minutes, 30),
      COALESCE(up.servings_default, 1),
      up.kcal_target,
      COALESCE(up.allergies, '{}'),
      COALESCE(up.dislikes, '{}'),
      COALESCE(up.variety_window_days, 7),
      _backfill_pref_to_text_array(up.breakfast_preference),
      _backfill_pref_to_text_array(up.lunch_preference),
      _backfill_pref_to_text_array(up.dinner_preference)
    FROM public.user_preferences up
    WHERE up.user_id = r.user_id
    ON CONFLICT (family_member_id) DO NOTHING;

    INSERT INTO public.family_member_diet_profiles (
      family_member_id,
      starts_on,
      ends_on,
      strictness,
      diet_type_id,
      is_inflamed
    )
    SELECT
      fm_id,
      udp.starts_on,
      udp.ends_on,
      udp.strictness,
      udp.diet_type_id,
      COALESCE(udp.is_inflamed, false)
    FROM public.user_diet_profiles udp
    WHERE udp.user_id = r.user_id
      AND udp.ends_on IS NULL
    LIMIT 1
    ON CONFLICT DO NOTHING;

    INSERT INTO public.family_member_health_profiles (
      family_member_id,
      birth_date,
      sex,
      height_cm,
      weight_kg
    )
    SELECT
      fm_id,
      uhp.birth_date,
      uhp.sex,
      uhp.height_cm,
      uhp.weight_kg
    FROM public.user_health_profiles uhp
    WHERE uhp.user_id = r.user_id
    ON CONFLICT (family_member_id) DO NOTHING;

    INSERT INTO public.family_member_therapeutic_profiles (
      family_member_id,
      protocol_id,
      is_active,
      overrides
    )
    SELECT
      fm_id,
      utp.protocol_id,
      utp.is_active,
      utp.overrides
    FROM public.user_therapeutic_profiles utp
    WHERE utp.user_id = r.user_id
      AND utp.is_active = true
    ON CONFLICT (family_member_id, protocol_id) DO UPDATE SET
      is_active = EXCLUDED.is_active,
      overrides = EXCLUDED.overrides,
      updated_at = NOW();
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS _backfill_pref_to_text_array(text);
DROP FUNCTION IF EXISTS _backfill_pref_to_text_array(text[]);
