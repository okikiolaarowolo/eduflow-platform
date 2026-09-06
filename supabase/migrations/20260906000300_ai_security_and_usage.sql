-- EduFlow AI security, privacy, and cost-control hardening.
-- Server-side functions are SECURITY DEFINER so monthly usage cannot be bypassed
-- by hiding rows behind RLS. AI message history remains private to its owner.

CREATE OR REPLACE FUNCTION public.ai_monthly_usage(p_school_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(GREATEST(0, COALESCE(input_tokens,0)) + GREATEST(0, COALESCE(output_tokens,0))), 0)::bigint
  FROM public.ai_usage
  WHERE school_id = p_school_id
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + interval '1 month';
$$;

REVOKE ALL ON FUNCTION public.ai_monthly_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_monthly_usage(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ai_effective_monthly_limit(p_school_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(s.monthly_token_limit, 0) = 0 THEN 0::bigint
    WHEN p.ai_tokens_monthly IS NULL OR p.ai_tokens_monthly = 0 THEN s.monthly_token_limit::bigint
    ELSE LEAST(s.monthly_token_limit::bigint, p.ai_tokens_monthly::bigint)
  END
  FROM public.ai_settings s
  LEFT JOIN public.school_subscriptions ss ON ss.school_id = s.school_id
  LEFT JOIN public.saas_plans p ON p.id = ss.plan_id
  WHERE s.school_id = p_school_id;
$$;

REVOKE ALL ON FUNCTION public.ai_effective_monthly_limit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_effective_monthly_limit(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ai_usage_status(p_school_id uuid)
RETURNS TABLE(used_tokens bigint, monthly_limit bigint, remaining_tokens bigint, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.ai_monthly_usage(p_school_id),
    public.ai_effective_monthly_limit(p_school_id),
    CASE
      WHEN public.ai_effective_monthly_limit(p_school_id) = 0 THEN 0::bigint
      ELSE GREATEST(0::bigint, public.ai_effective_monthly_limit(p_school_id) - public.ai_monthly_usage(p_school_id))
    END,
    s.enabled
  FROM public.ai_settings s
  WHERE s.school_id = p_school_id
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.school_id = p_school_id);
$$;

REVOKE ALL ON FUNCTION public.ai_usage_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_usage_status(uuid) TO authenticated;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('ai_conversations','ai_messages','ai_study_plans','ai_learning_insights','ai_usage','ai_settings')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_learning_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_conversations_select ON public.ai_conversations FOR SELECT TO authenticated USING (
  user_id = auth.uid() AND school_id = public.current_school_id()
);
CREATE POLICY ai_conversations_insert ON public.ai_conversations FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND school_id = public.current_school_id()
  AND EXISTS (SELECT 1 FROM public.ai_settings s WHERE s.school_id = public.current_school_id() AND s.enabled)
);
CREATE POLICY ai_conversations_update ON public.ai_conversations FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND school_id = public.current_school_id())
WITH CHECK (user_id = auth.uid() AND school_id = public.current_school_id());
CREATE POLICY ai_conversations_delete ON public.ai_conversations FOR DELETE TO authenticated
USING (user_id = auth.uid() AND school_id = public.current_school_id());

CREATE POLICY ai_messages_select ON public.ai_messages FOR SELECT TO authenticated USING (
  user_id = auth.uid() AND school_id = public.current_school_id()
  AND EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid() AND c.school_id = public.current_school_id())
);
-- The browser may submit only the user's own message. Assistant messages are written
-- by the Edge Function using the server key, never by the client.
CREATE POLICY ai_messages_user_insert ON public.ai_messages FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND school_id = public.current_school_id() AND role = 'user'
  AND EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid() AND c.school_id = public.current_school_id())
);

CREATE POLICY ai_study_plans_select ON public.ai_study_plans FOR SELECT TO authenticated USING (
  school_id = public.current_school_id() AND (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid() AND school_id = public.current_school_id())
    OR public.is_school_manager() OR public.is_teacher_of_student(student_id)
  )
);
CREATE POLICY ai_study_plans_manager_teacher_write ON public.ai_study_plans FOR ALL TO authenticated
USING (school_id = public.current_school_id() AND (public.is_school_manager() OR public.is_teacher_of_student(student_id)))
WITH CHECK (school_id = public.current_school_id() AND (public.is_school_manager() OR public.is_teacher_of_student(student_id)));
CREATE POLICY ai_study_plans_student_insert ON public.ai_study_plans FOR INSERT TO authenticated WITH CHECK (
  school_id = public.current_school_id()
  AND student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid() AND school_id = public.current_school_id())
);

CREATE POLICY ai_learning_insights_select ON public.ai_learning_insights FOR SELECT TO authenticated USING (
  school_id = public.current_school_id() AND (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid() AND school_id = public.current_school_id())
    OR public.is_school_manager() OR public.is_teacher_of_student(student_id)
  )
);
CREATE POLICY ai_learning_insights_manager_teacher_write ON public.ai_learning_insights FOR ALL TO authenticated
USING (school_id = public.current_school_id() AND (public.is_school_manager() OR public.is_teacher_of_student(student_id)))
WITH CHECK (school_id = public.current_school_id() AND (public.is_school_manager() OR public.is_teacher_of_student(student_id)));

CREATE POLICY ai_usage_select_own ON public.ai_usage FOR SELECT TO authenticated USING (
  user_id = auth.uid() AND school_id = public.current_school_id()
);
CREATE POLICY ai_usage_insert_own ON public.ai_usage FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND school_id = public.current_school_id()
  AND input_tokens >= 0 AND output_tokens >= 0
);

CREATE POLICY ai_settings_select ON public.ai_settings FOR SELECT TO authenticated USING (
  school_id = public.current_school_id()
);
CREATE POLICY ai_settings_manager_update ON public.ai_settings FOR UPDATE TO authenticated
USING (school_id = public.current_school_id() AND public.is_school_manager())
WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager() AND monthly_token_limit >= 0);

REVOKE UPDATE, DELETE ON public.ai_usage FROM authenticated;

COMMENT ON FUNCTION public.ai_monthly_usage(uuid) IS 'Server-side monthly AI token aggregation.';
COMMENT ON FUNCTION public.ai_effective_monthly_limit(uuid) IS 'Effective AI token limit after school and subscription plan limits.';
