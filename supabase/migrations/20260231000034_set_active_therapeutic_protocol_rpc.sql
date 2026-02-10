-- Migration: RPC for atomic "set active therapeutic protocol"
-- Description: Single transaction: deactivate all user profiles, then upsert selected.
-- SECURITY INVOKER so RLS applies (auth.uid() = user_id). No SELECT *.

-- Usage (from app): supabase.rpc('set_active_therapeutic_protocol', { p_protocol_id: '<uuid>' })

CREATE OR REPLACE FUNCTION public.set_active_therapeutic_protocol(p_protocol_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.user_therapeutic_profiles
  SET is_active = false,
      updated_at = now()
  WHERE user_id = auth.uid()
    AND is_active = true;

  INSERT INTO public.user_therapeutic_profiles (user_id, protocol_id, is_active)
  VALUES (auth.uid(), p_protocol_id, true)
  ON CONFLICT (user_id, protocol_id)
  DO UPDATE SET is_active = true, updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.set_active_therapeutic_protocol(UUID) IS
  'Atomically set the active therapeutic protocol for the current user (auth.uid()). Returns user_therapeutic_profiles.id.';
