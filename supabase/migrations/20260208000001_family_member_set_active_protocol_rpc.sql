-- RPC: set active therapeutic protocol for a family member
-- SECURITY INVOKER so RLS applies (user must own the family_member).

CREATE OR REPLACE FUNCTION public.set_family_member_active_therapeutic_protocol(
  p_family_member_id UUID,
  p_protocol_id UUID
)
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

  -- Ensure user owns the family member
  IF NOT EXISTS (SELECT 1 FROM public.family_members WHERE id = p_family_member_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'family member not found or access denied';
  END IF;

  UPDATE public.family_member_therapeutic_profiles
  SET is_active = false,
      updated_at = now()
  WHERE family_member_id = p_family_member_id
    AND is_active = true;

  INSERT INTO public.family_member_therapeutic_profiles (family_member_id, protocol_id, is_active)
  VALUES (p_family_member_id, p_protocol_id, true)
  ON CONFLICT (family_member_id, protocol_id)
  DO UPDATE SET is_active = true, updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.set_family_member_active_therapeutic_protocol(UUID, UUID) IS
  'Set the active therapeutic protocol for a family member. Caller must own the family member.';
