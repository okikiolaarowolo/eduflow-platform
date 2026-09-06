-- EduFlow AI: server-side AI safety, usage limits and ownership hardening.

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
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = p_school_id
    );
$$;

REVOKE ALL ON FUNCTION public.ai_monthly_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_monthly_usage(uuid) TO authenticated;

-- AI conversations/messages must remain private to their owner (or an explicitly privileged manager).
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_conversations_select ON public.ai_conversations;
CREATE POLICY ai_conversations_select ON public.ai_conversations
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_school_manager()
);

DROP POLICY IF EXISTS ai_conversations_insert ON public.ai_conversations;
CREATE POLICY ai_conversations_insert ON public.ai_conversations
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND school_id = public.current_school_id()
);

DROP POLICY IF EXISTS ai_conversations_update ON public.ai_conversations;
CREATE POLICY ai_conversations_update ON public.ai_conversations
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_school_manager())
WITH CHECK (school_id = public.current_school_id());

DROP POLICY IF EXISTS ai_conversations_delete ON public.ai_conversations;
CREATE POLICY ai_conversations_delete ON public.ai_conversations
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_school_manager());

DROP POLICY IF EXISTS ai_messages_select ON public.ai_messages;
CREATE POLICY ai_messages_select ON public.ai_messages
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_school_manager()
);

DROP POLICY IF EXISTS ai_messages_insert ON public.ai_messages;
CREATE POLICY ai_messages_insert ON public.ai_messages
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND school_id = public.current_school_id()
  AND EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id
      AND c.user_id = auth.uid()
      AND c.school_id = public.current_school_id()
  )
);

DROP POLICY IF EXISTS ai_usage_select ON public.ai_usage;
CREATE POLICY ai_usage_select ON public.ai_usage
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_school_manager()
);

-- AI settings are school-manager controlled; users may read their school's effective settings.
DROP POLICY IF EXISTS ai_settings_select ON public.ai_settings;
CREATE POLICY ai_settings_select ON public.ai_settings
FOR SELECT TO authenticated
USING (school_id = public.current_school_id());

DROP POLICY IF EXISTS ai_settings_update ON public.ai_settings;
CREATE POLICY ai_settings_update ON public.ai_settings
FOR UPDATE TO authenticated
USING (public.is_school_manager() AND school_id = public.current_school_id())
WITH CHECK (public.is_school_manager() AND school_id = public.current_school_id());

-- Prevent clients from writing arbitrary usage records. The Edge Function records usage server-side.
DROP POLICY IF EXISTS ai_usage_insert ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_update ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_delete ON public.ai_usage;

-- Keep AI usage rows immutable from the browser.

-- Guard token limits against nonsensical settings.
ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_monthly_token_limit_check;
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_monthly_token_limit_check CHECK (monthly_token_limit >= 0);
