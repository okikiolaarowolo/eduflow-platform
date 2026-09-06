-- EduFlow AI: enforceable usage controls and safe, server-side quota accounting.

CREATE OR REPLACE FUNCTION public.ai_usage_status(p_school_id uuid)
RETURNS TABLE (
  enabled boolean,
  student_tutor_enabled boolean,
  teacher_assistant_enabled boolean,
  monthly_token_limit integer,
  plan_token_limit integer,
  used_tokens bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(s.enabled, true),
    COALESCE(s.student_tutor_enabled, true),
    COALESCE(s.teacher_assistant_enabled, true),
    COALESCE(s.monthly_token_limit, 100000),
    sp.ai_tokens_monthly,
    COALESCE((
      SELECT SUM(COALESCE(u.input_tokens,0) + COALESCE(u.output_tokens,0))::bigint
      FROM public.ai_usage u
      WHERE u.school_id = p_school_id
        AND u.created_at >= date_trunc('month', now())
        AND u.created_at < date_trunc('month', now()) + interval '1 month'
    ), 0)::bigint
  FROM public.ai_settings s
  LEFT JOIN public.school_subscriptions ss ON ss.school_id = p_school_id
  LEFT JOIN public.saas_plans sp ON sp.id = ss.plan_id AND sp.active = true
  WHERE p_school_id = public.current_school_id()
     OR public.has_role(auth.uid(), 'super_admin')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_usage_status(uuid) TO authenticated;

-- Never allow a client to spoof the tenant when recording AI usage.
DROP POLICY IF EXISTS ai_usage_insert ON public.ai_usage;
CREATE POLICY ai_usage_insert ON public.ai_usage
FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.current_school_id()
  AND user_id = auth.uid()
);

DROP POLICY IF EXISTS ai_usage_update ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_delete ON public.ai_usage;

-- AI messages must belong to the authenticated conversation owner.
DROP POLICY IF EXISTS ai_messages_insert ON public.ai_messages;
CREATE POLICY ai_messages_insert ON public.ai_messages
FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.current_school_id()
  AND user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = ai_messages.conversation_id
      AND c.user_id = auth.uid()
      AND c.school_id = public.current_school_id()
  )
);

DROP POLICY IF EXISTS ai_messages_update ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_delete ON public.ai_messages;

-- Conversations are private to their owner. School managers cannot inspect student chats.
DROP POLICY IF EXISTS ai_conversations_select ON public.ai_conversations;
CREATE POLICY ai_conversations_select ON public.ai_conversations
FOR SELECT TO authenticated
USING (school_id = public.current_school_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS ai_conversations_insert ON public.ai_conversations;
CREATE POLICY ai_conversations_insert ON public.ai_conversations
FOR INSERT TO authenticated
WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS ai_conversations_update ON public.ai_conversations;
CREATE POLICY ai_conversations_update ON public.ai_conversations
FOR UPDATE TO authenticated
USING (school_id = public.current_school_id() AND user_id = auth.uid())
WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS ai_conversations_delete ON public.ai_conversations;
CREATE POLICY ai_conversations_delete ON public.ai_conversations
FOR DELETE TO authenticated
USING (school_id = public.current_school_id() AND user_id = auth.uid());

-- Study plans and insights are private to the associated student unless viewed by a manager.
DROP POLICY IF EXISTS ai_study_plans_select ON public.ai_study_plans;
CREATE POLICY ai_study_plans_select ON public.ai_study_plans
FOR SELECT TO authenticated
USING (
  school_id = public.current_school_id()
  AND (public.is_school_manager()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = ai_study_plans.student_id AND s.user_id = auth.uid()))
);

DROP POLICY IF EXISTS ai_learning_insights_select ON public.ai_learning_insights;
CREATE POLICY ai_learning_insights_select ON public.ai_learning_insights
FOR SELECT TO authenticated
USING (
  school_id = public.current_school_id()
  AND (public.is_school_manager()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = ai_learning_insights.student_id AND s.user_id = auth.uid()))
);

-- Protect disclosure text and limits from non-managers changing them.
DROP POLICY IF EXISTS ai_settings_select ON public.ai_settings;
CREATE POLICY ai_settings_select ON public.ai_settings
FOR SELECT TO authenticated
USING (school_id = public.current_school_id());

DROP POLICY IF EXISTS ai_settings_manager ON public.ai_settings;
CREATE POLICY ai_settings_manager ON public.ai_settings
FOR ALL TO authenticated
USING (school_id = public.current_school_id() AND public.is_school_manager())
WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

-- Basic data-integrity constraints for AI accounting.
ALTER TABLE public.ai_usage
  DROP CONSTRAINT IF EXISTS ai_usage_tokens_nonnegative;
ALTER TABLE public.ai_usage
  ADD CONSTRAINT ai_usage_tokens_nonnegative
  CHECK (COALESCE(input_tokens,0) >= 0 AND COALESCE(output_tokens,0) >= 0 AND COALESCE(estimated_cost,0) >= 0);
