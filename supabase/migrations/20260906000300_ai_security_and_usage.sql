-- EduFlow AI security hardening
-- Enforces AI feature access and monthly token limits server-side.

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
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.school_id = p_school_id
    );
$$;

REVOKE ALL ON FUNCTION public.ai_monthly_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_monthly_usage(uuid) TO authenticated;

-- Keep AI usage rows private to school managers and the user who generated them.
DROP POLICY IF EXISTS ai_usage_school_member_select ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_manager_select ON public.ai_usage;
CREATE POLICY ai_usage_manager_select ON public.ai_usage
FOR SELECT TO authenticated
USING (
  school_id = public.current_school_id()
  AND (
    user_id = auth.uid()
    OR public.is_school_manager()
  )
);

-- Users may only create usage records for themselves in their current school.
DROP POLICY IF EXISTS ai_usage_insert ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_self_insert ON public.ai_usage;
CREATE POLICY ai_usage_self_insert ON public.ai_usage
FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.current_school_id()
  AND user_id = auth.uid()
);

-- Prevent clients from changing or deleting usage records after creation.
DROP POLICY IF EXISTS ai_usage_update ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_delete ON public.ai_usage;

-- AI settings are visible to school members but writable only by school managers.
DROP POLICY IF EXISTS ai_settings_school_member_select ON public.ai_settings;
DROP POLICY IF EXISTS ai_settings_manager_select ON public.ai_settings;
CREATE POLICY ai_settings_manager_select ON public.ai_settings
FOR SELECT TO authenticated
USING (school_id = public.current_school_id());

DROP POLICY IF EXISTS ai_settings_manager_update ON public.ai_settings;
CREATE POLICY ai_settings_manager_update ON public.ai_settings
FOR UPDATE TO authenticated
USING (school_id = public.current_school_id() AND public.is_school_manager())
WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

-- AI conversations must stay tied to their creator and current tenant.
DROP POLICY IF EXISTS ai_conversations_insert ON public.ai_conversations;
CREATE POLICY ai_conversations_insert ON public.ai_conversations
FOR INSERT TO authenticated
WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS ai_conversations_update ON public.ai_conversations;
CREATE POLICY ai_conversations_update ON public.ai_conversations
FOR UPDATE TO authenticated
USING (school_id = public.current_school_id() AND user_id = auth.uid())
WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());

-- Messages can only be created for conversations owned by the current user.
DROP POLICY IF EXISTS ai_messages_insert ON public.ai_messages;
CREATE POLICY ai_messages_insert ON public.ai_messages
FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.current_school_id()
  AND user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id
      AND c.school_id = public.current_school_id()
      AND c.user_id = auth.uid()
  )
);

-- Prevent a client from impersonating another user's AI messages.
DROP POLICY IF EXISTS ai_messages_update ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_delete ON public.ai_messages;

-- Validate monthly usage against the configured school limit without exposing usage rows.
CREATE OR REPLACE FUNCTION public.ai_usage_status(p_school_id uuid)
RETURNS TABLE(used_tokens bigint, monthly_limit integer, remaining_tokens bigint, enabled boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.ai_monthly_usage(p_school_id),
    s.monthly_token_limit,
    CASE
      WHEN s.monthly_token_limit <= 0 THEN 9223372036854775807::bigint
      ELSE GREATEST(0::bigint, s.monthly_token_limit::bigint - public.ai_monthly_usage(p_school_id))
    END,
    s.enabled
  FROM public.ai_settings s
  WHERE s.school_id = p_school_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.school_id = p_school_id
    );
$$;

REVOKE ALL ON FUNCTION public.ai_usage_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_usage_status(uuid) TO authenticated;
