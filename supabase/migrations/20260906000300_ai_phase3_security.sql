-- EduFlow AI Phase 3 security: enforce AI access and usage limits server-side.
-- All checks are tenant-scoped and run inside the Edge Function/RPC boundary.

CREATE OR REPLACE FUNCTION public.ai_monthly_usage(p_school_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(input_tokens + output_tokens), 0)::bigint
  FROM public.ai_usage
  WHERE school_id = p_school_id
    AND created_at >= date_trunc('month', now())
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.school_id = p_school_id
    );
$$;

REVOKE ALL ON FUNCTION public.ai_monthly_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_monthly_usage(uuid) TO authenticated;

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_select_own ON public.ai_usage;
CREATE POLICY ai_usage_select_own ON public.ai_usage
FOR SELECT TO authenticated
USING (
  school_id = public.current_school_id()
  AND (user_id = auth.uid() OR public.is_school_manager())
);

DROP POLICY IF EXISTS ai_usage_insert_service ON public.ai_usage;
CREATE POLICY ai_usage_insert_service ON public.ai_usage
FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.current_school_id()
  AND user_id = auth.uid()
);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_settings_select ON public.ai_settings;
CREATE POLICY ai_settings_select ON public.ai_settings
FOR SELECT TO authenticated
USING (school_id = public.current_school_id());

DROP POLICY IF EXISTS ai_settings_manager_write ON public.ai_settings;
CREATE POLICY ai_settings_manager_write ON public.ai_settings
FOR UPDATE TO authenticated
USING (school_id = public.current_school_id() AND public.is_school_manager())
WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

-- Never allow a client to turn the monthly limit negative.
ALTER TABLE public.ai_settings
DROP CONSTRAINT IF EXISTS ai_settings_monthly_token_limit_check;
ALTER TABLE public.ai_settings
ADD CONSTRAINT ai_settings_monthly_token_limit_check CHECK (monthly_token_limit >= 0);

-- AI conversations/messages remain private to the owning user within their school.
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_conversations_select_own ON public.ai_conversations;
CREATE POLICY ai_conversations_select_own ON public.ai_conversations
FOR SELECT TO authenticated
USING (school_id = public.current_school_id() AND user_id = auth.uid());
DROP POLICY IF EXISTS ai_conversations_insert_own ON public.ai_conversations;
CREATE POLICY ai_conversations_insert_own ON public.ai_conversations
FOR INSERT TO authenticated
WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());
DROP POLICY IF EXISTS ai_conversations_update_own ON public.ai_conversations;
CREATE POLICY ai_conversations_update_own ON public.ai_conversations
FOR UPDATE TO authenticated
USING (school_id = public.current_school_id() AND user_id = auth.uid())
WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());
DROP POLICY IF EXISTS ai_conversations_delete_own ON public.ai_conversations;
CREATE POLICY ai_conversations_delete_own ON public.ai_conversations
FOR DELETE TO authenticated
USING (school_id = public.current_school_id() AND user_id = auth.uid());

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_messages_select_own ON public.ai_messages;
CREATE POLICY ai_messages_select_own ON public.ai_messages
FOR SELECT TO authenticated
USING (
  school_id = public.current_school_id()
  AND user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
);
DROP POLICY IF EXISTS ai_messages_insert_own ON public.ai_messages;
CREATE POLICY ai_messages_insert_own ON public.ai_messages
FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.current_school_id()
  AND user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
);

-- Protect usage data from cross-tenant rows even if a client supplies a forged school_id.
CREATE OR REPLACE FUNCTION public.validate_ai_usage_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.school_id <> public.current_school_id() OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Invalid AI usage tenant or user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_ai_usage_tenant ON public.ai_usage;
CREATE TRIGGER trg_validate_ai_usage_tenant
BEFORE INSERT OR UPDATE ON public.ai_usage
FOR EACH ROW EXECUTE FUNCTION public.validate_ai_usage_tenant();
