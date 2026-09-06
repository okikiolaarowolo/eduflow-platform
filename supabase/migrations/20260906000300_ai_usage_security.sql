-- EduFlow AI: secure, tenant-scoped monthly usage accounting.
-- The aggregate is SECURITY DEFINER so users cannot evade limits through ai_usage RLS.

CREATE OR REPLACE FUNCTION public.ai_monthly_usage(p_school_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_total bigint;
BEGIN
  v_school_id := public.current_school_id();

  -- Only the caller's current tenant may ask for its usage.
  IF v_school_id IS NULL OR p_school_id IS DISTINCT FROM v_school_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0)::bigint
    INTO v_total
  FROM public.ai_usage
  WHERE school_id = p_school_id
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + interval '1 month';

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_monthly_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_monthly_usage(uuid) TO authenticated;

-- Keep AI settings tenant-bound: only school managers may change them.
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_settings_select ON public.ai_settings;
DROP POLICY IF EXISTS ai_settings_manager_update ON public.ai_settings;
DROP POLICY IF EXISTS ai_settings_manager_insert ON public.ai_settings;
CREATE POLICY ai_settings_select ON public.ai_settings
  FOR SELECT TO authenticated
  USING (school_id = public.current_school_id());
CREATE POLICY ai_settings_manager_update ON public.ai_settings
  FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());
CREATE POLICY ai_settings_manager_insert ON public.ai_settings
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

-- AI usage is immutable application telemetry. Users may record only their own
-- usage in their own tenant; nobody can edit or delete usage from the client.
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_select ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_insert ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_update ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_delete ON public.ai_usage;
CREATE POLICY ai_usage_select ON public.ai_usage
  FOR SELECT TO authenticated
  USING (school_id = public.current_school_id() AND (user_id = auth.uid() OR public.is_school_manager()));
CREATE POLICY ai_usage_insert ON public.ai_usage
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());

-- AI conversations/messages remain tenant + owner scoped. Managers do not gain
-- access to private student conversations merely by being school managers.
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_conversations_select ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conversations_insert ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conversations_update ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conversations_delete ON public.ai_conversations;
CREATE POLICY ai_conversations_select ON public.ai_conversations
  FOR SELECT TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid());
CREATE POLICY ai_conversations_insert ON public.ai_conversations
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());
CREATE POLICY ai_conversations_update ON public.ai_conversations
  FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid())
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());
CREATE POLICY ai_conversations_delete ON public.ai_conversations
  FOR DELETE TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid());
DROP POLICY IF EXISTS ai_messages_select ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_insert ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_update ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_delete ON public.ai_messages;
CREATE POLICY ai_messages_select ON public.ai_messages
  FOR SELECT TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid());
CREATE POLICY ai_messages_insert ON public.ai_messages
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());
CREATE POLICY ai_messages_update ON public.ai_messages
  FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid())
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());
CREATE POLICY ai_messages_delete ON public.ai_messages
  FOR DELETE TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid());
