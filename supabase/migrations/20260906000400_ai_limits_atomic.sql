-- Prevent concurrent AI requests from overspending a school's monthly budget.
-- The advisory transaction lock serializes usage checks for the same school.

CREATE OR REPLACE FUNCTION public.ai_reserve_tokens(p_school_id uuid, p_tokens integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_used bigint;
BEGIN
  IF p_tokens < 0 OR p_tokens > 1000000 THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.school_id = p_school_id
  ) THEN RETURN false; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('eduflow-ai:' || p_school_id::text));
  SELECT monthly_token_limit INTO v_limit FROM public.ai_settings WHERE school_id = p_school_id;
  IF v_limit IS NULL THEN RETURN false; END IF;
  IF v_limit = 0 THEN RETURN true; END IF;

  SELECT COALESCE(SUM(COALESCE(input_tokens,0) + COALESCE(output_tokens,0)),0)
    INTO v_used
  FROM public.ai_usage
  WHERE school_id = p_school_id AND created_at >= date_trunc('month', now());

  RETURN v_used + p_tokens <= v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_reserve_tokens(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_reserve_tokens(uuid, integer) TO authenticated;
