-- EduFlow AI: enforce school AI settings, plan quota, and atomic usage accounting.
-- This migration keeps provider secrets server-side and exposes only bounded usage data.

CREATE OR REPLACE FUNCTION public.ai_usage_status(p_school_id uuid)
RETURNS TABLE (
  enabled boolean,
  student_tutor_enabled boolean,
  teacher_assistant_enabled boolean,
  school_token_limit bigint,
  plan_token_limit bigint,
  used_tokens bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(s.enabled, false),
    COALESCE(s.student_tutor_enabled, false),
    COALESCE(s.teacher_assistant_enabled, false),
    GREATEST(COALESCE(s.monthly_token_limit, 0), 0)::bigint,
    COALESCE(p.ai_tokens_monthly, 0)::bigint,
    public.ai_monthly_usage(p_school_id)
  FROM public.ai_settings s
  LEFT JOIN public.school_subscriptions sub ON sub.school_id = s.school_id
  LEFT JOIN public.saas_plans p ON p.id = sub.plan_id AND p.active = true
  WHERE s.school_id = p_school_id
    AND (
      p_school_id = public.current_school_id()
      OR public.has_role(auth.uid(), 'super_admin')
    );
$$;

REVOKE ALL ON FUNCTION public.ai_usage_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_usage_status(uuid) TO authenticated;

-- Prevent clients from forging usage attribution or school ownership.
DROP POLICY IF EXISTS ai_usage_insert ON public.ai_usage;
CREATE POLICY ai_usage_insert ON public.ai_usage
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS ai_usage_select ON public.ai_usage;
CREATE POLICY ai_usage_select ON public.ai_usage
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_school_manager()
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- AI settings are private to the school and writable only by managers.
DROP POLICY IF EXISTS ai_settings_select ON public.ai_settings;
CREATE POLICY ai_settings_select ON public.ai_settings
  FOR SELECT TO authenticated
  USING (
    school_id = public.current_school_id()
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS ai_settings_manager_update ON public.ai_settings;
CREATE POLICY ai_settings_manager_update ON public.ai_settings
  FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (
    school_id = public.current_school_id()
    AND public.is_school_manager()
    AND monthly_token_limit BETWEEN 1000 AND 10000000
  );

-- Only allow supported AI modes, preventing arbitrary feature labels from the client.
ALTER TABLE public.ai_conversations
  DROP CONSTRAINT IF EXISTS ai_conversations_mode_check;
ALTER TABLE public.ai_conversations
  ADD CONSTRAINT ai_conversations_mode_check
  CHECK (mode IN ('tutor','question-generator','explanation','study-plan'));

-- AI messages are user-owned; system messages are not client-writable.
DROP POLICY IF EXISTS ai_messages_insert ON public.ai_messages;
CREATE POLICY ai_messages_insert ON public.ai_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND school_id = public.current_school_id()
    AND role IN ('user','assistant')
    AND EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND c.user_id = auth.uid()
        AND c.school_id = public.current_school_id()
    )
  );

-- Students may only create conversations for themselves; staff/managers can create their own.
DROP POLICY IF EXISTS ai_conversations_insert ON public.ai_conversations;
CREATE POLICY ai_conversations_insert ON public.ai_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND school_id = public.current_school_id()
  );
