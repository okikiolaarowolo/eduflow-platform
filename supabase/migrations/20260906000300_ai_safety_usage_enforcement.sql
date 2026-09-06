-- EduFlow AI production safety and usage enforcement.
-- Defense in depth: the Edge Function checks these rules before calling the provider.

CREATE OR REPLACE FUNCTION public.ai_monthly_usage(p_school_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(COALESCE(input_tokens,0) + COALESCE(output_tokens,0)), 0)::bigint
  FROM public.ai_usage
  WHERE school_id = p_school_id
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + interval '1 month';
$$;

REVOKE ALL ON FUNCTION public.ai_monthly_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_monthly_usage(uuid) TO authenticated;

-- Ensure AI usage records can only be created for the authenticated caller and
-- for the caller's active tenant. Existing RLS policies remain in force.
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_insert_self ON public.ai_usage;
CREATE POLICY ai_usage_insert_self ON public.ai_usage
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND school_id = public.current_school_id());

-- Keep AI settings manager-only for writes. Reads are tenant-scoped.
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_settings_select_school ON public.ai_settings;
CREATE POLICY ai_settings_select_school ON public.ai_settings
FOR SELECT TO authenticated
USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS ai_settings_manager_update ON public.ai_settings;
CREATE POLICY ai_settings_manager_update ON public.ai_settings
FOR UPDATE TO authenticated
USING (school_id = public.current_school_id() AND public.is_school_manager())
WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

-- Prevent callers from recording fabricated usage for another user or school.
CREATE OR REPLACE FUNCTION public.validate_ai_usage_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'AI usage actor must be the authenticated user';
  END IF;
  IF NEW.school_id <> public.current_school_id() THEN
    RAISE EXCEPTION 'AI usage must belong to the authenticated school';
  END IF;
  NEW.input_tokens := GREATEST(COALESCE(NEW.input_tokens,0),0);
  NEW.output_tokens := GREATEST(COALESCE(NEW.output_tokens,0),0);
  NEW.estimated_cost := GREATEST(COALESCE(NEW.estimated_cost,0),0);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_ai_usage_tenant ON public.ai_usage;
CREATE TRIGGER validate_ai_usage_tenant
BEFORE INSERT OR UPDATE ON public.ai_usage
FOR EACH ROW EXECUTE FUNCTION public.validate_ai_usage_tenant();
REVOKE ALL ON FUNCTION public.validate_ai_usage_tenant() FROM PUBLIC;

-- Keep the monthly limit bounded to a sensible non-negative range.
ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_monthly_token_limit_check;
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_monthly_token_limit_check
  CHECK (monthly_token_limit >= 0 AND monthly_token_limit <= 100000000);
