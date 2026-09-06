-- EduFlow AI: secure, tenant-scoped usage and private AI data.

CREATE OR REPLACE FUNCTION public.ai_monthly_usage(p_school_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school_id uuid; v_total bigint;
BEGIN
  v_school_id := public.current_school_id();
  IF v_school_id IS NULL OR p_school_id IS DISTINCT FROM v_school_id THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT COALESCE(SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)),0)::bigint INTO v_total
  FROM public.ai_usage WHERE school_id=p_school_id AND created_at >= date_trunc('month',now()) AND created_at < date_trunc('month',now()) + interval '1 month';
  RETURN v_total;
END; $$;
REVOKE ALL ON FUNCTION public.ai_monthly_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_monthly_usage(uuid) TO authenticated;

-- One tenant-scoped RPC gives the Edge Function the exact controls it needs.
CREATE OR REPLACE FUNCTION public.ai_usage_status(p_school_id uuid)
RETURNS TABLE(enabled boolean, used_tokens bigint, plan_token_limit integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school_id uuid;
BEGIN
  v_school_id := public.current_school_id();
  IF v_school_id IS NULL OR p_school_id IS DISTINCT FROM v_school_id THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT COALESCE(s.enabled, true),
         COALESCE((SELECT SUM(COALESCE(u.input_tokens,0)+COALESCE(u.output_tokens,0))::bigint FROM public.ai_usage u WHERE u.school_id=p_school_id AND u.created_at >= date_trunc('month',now()) AND u.created_at < date_trunc('month',now()) + interval '1 month'),0)::bigint,
         sp.ai_tokens_monthly
  FROM (SELECT 1) x
  LEFT JOIN public.ai_settings s ON s.school_id=p_school_id
  LEFT JOIN public.school_subscriptions ss ON ss.school_id=p_school_id
  LEFT JOIN public.saas_plans sp ON sp.id=ss.plan_id;
END; $$;
REVOKE ALL ON FUNCTION public.ai_usage_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_usage_status(uuid) TO authenticated;

-- Remove broad policies from the initial full-platform migration.
DROP POLICY IF EXISTS ai_settings_manager ON public.ai_settings;
DROP POLICY IF EXISTS ai_conversations_manager_write ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conversations_manager_update ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conversations_manager_delete ON public.ai_conversations;
DROP POLICY IF EXISTS ai_messages_manager_write ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_manager_update ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_manager_delete ON public.ai_messages;
DROP POLICY IF EXISTS ai_study_plans_select ON public.ai_study_plans;
DROP POLICY IF EXISTS ai_study_plans_manager_write ON public.ai_study_plans;
DROP POLICY IF EXISTS ai_study_plans_manager_update ON public.ai_study_plans;
DROP POLICY IF EXISTS ai_study_plans_manager_delete ON public.ai_study_plans;
DROP POLICY IF EXISTS ai_learning_insights_select ON public.ai_learning_insights;
DROP POLICY IF EXISTS ai_learning_insights_manager_write ON public.ai_learning_insights;
DROP POLICY IF EXISTS ai_learning_insights_manager_update ON public.ai_learning_insights;
DROP POLICY IF EXISTS ai_learning_insights_manager_delete ON public.ai_learning_insights;

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_settings_select ON public.ai_settings;
DROP POLICY IF EXISTS ai_settings_manager_update ON public.ai_settings;
DROP POLICY IF EXISTS ai_settings_manager_insert ON public.ai_settings;
CREATE POLICY ai_settings_select ON public.ai_settings FOR SELECT TO authenticated USING (school_id=public.current_school_id());
CREATE POLICY ai_settings_manager_update ON public.ai_settings FOR UPDATE TO authenticated USING (school_id=public.current_school_id() AND public.is_school_manager()) WITH CHECK (school_id=public.current_school_id() AND public.is_school_manager());
CREATE POLICY ai_settings_manager_insert ON public.ai_settings FOR INSERT TO authenticated WITH CHECK (school_id=public.current_school_id() AND public.is_school_manager());

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_select ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_insert ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_update ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_delete ON public.ai_usage;
CREATE POLICY ai_usage_select ON public.ai_usage FOR SELECT TO authenticated USING (school_id=public.current_school_id() AND (user_id=auth.uid() OR public.is_school_manager()));
CREATE POLICY ai_usage_insert ON public.ai_usage FOR INSERT TO authenticated WITH CHECK (school_id=public.current_school_id() AND user_id=auth.uid());

-- Conversations and messages are private to their owner, including from managers.
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_conversations_select ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conversations_insert ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conversations_update ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conversations_delete ON public.ai_conversations;
CREATE POLICY ai_conversations_select ON public.ai_conversations FOR SELECT TO authenticated USING (school_id=public.current_school_id() AND user_id=auth.uid());
CREATE POLICY ai_conversations_insert ON public.ai_conversations FOR INSERT TO authenticated WITH CHECK (school_id=public.current_school_id() AND user_id=auth.uid());
CREATE POLICY ai_conversations_update ON public.ai_conversations FOR UPDATE TO authenticated USING (school_id=public.current_school_id() AND user_id=auth.uid()) WITH CHECK (school_id=public.current_school_id() AND user_id=auth.uid());
CREATE POLICY ai_conversations_delete ON public.ai_conversations FOR DELETE TO authenticated USING (school_id=public.current_school_id() AND user_id=auth.uid());
DROP POLICY IF EXISTS ai_messages_select ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_insert ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_update ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_delete ON public.ai_messages;
CREATE POLICY ai_messages_select ON public.ai_messages FOR SELECT TO authenticated USING (school_id=public.current_school_id() AND user_id=auth.uid());
CREATE POLICY ai_messages_insert ON public.ai_messages FOR INSERT TO authenticated WITH CHECK (school_id=public.current_school_id() AND user_id=auth.uid());
CREATE POLICY ai_messages_update ON public.ai_messages FOR UPDATE TO authenticated USING (school_id=public.current_school_id() AND user_id=auth.uid()) WITH CHECK (school_id=public.current_school_id() AND user_id=auth.uid());
CREATE POLICY ai_messages_delete ON public.ai_messages FOR DELETE TO authenticated USING (school_id=public.current_school_id() AND user_id=auth.uid());

-- Study plans and learning insights are student records.
ALTER TABLE public.ai_study_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_study_plans_owner_select ON public.ai_study_plans FOR SELECT TO authenticated USING (school_id=public.current_school_id() AND (student_id IN (SELECT id FROM public.students WHERE user_id=auth.uid()) OR public.is_school_manager()));
CREATE POLICY ai_study_plans_manager_write ON public.ai_study_plans FOR INSERT TO authenticated WITH CHECK (school_id=public.current_school_id() AND public.is_school_manager());
CREATE POLICY ai_study_plans_manager_update ON public.ai_study_plans FOR UPDATE TO authenticated USING (school_id=public.current_school_id() AND public.is_school_manager()) WITH CHECK (school_id=public.current_school_id() AND public.is_school_manager());
CREATE POLICY ai_study_plans_manager_delete ON public.ai_study_plans FOR DELETE TO authenticated USING (school_id=public.current_school_id() AND public.is_school_manager());
ALTER TABLE public.ai_learning_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_learning_insights_owner_select ON public.ai_learning_insights FOR SELECT TO authenticated USING (school_id=public.current_school_id() AND (student_id IN (SELECT id FROM public.students WHERE user_id=auth.uid()) OR public.is_school_manager()));
CREATE POLICY ai_learning_insights_manager_write ON public.ai_learning_insights FOR INSERT TO authenticated WITH CHECK (school_id=public.current_school_id() AND public.is_school_manager());
CREATE POLICY ai_learning_insights_manager_update ON public.ai_learning_insights FOR UPDATE TO authenticated USING (school_id=public.current_school_id() AND public.is_school_manager()) WITH CHECK (school_id=public.current_school_id() AND public.is_school_manager());
CREATE POLICY ai_learning_insights_manager_delete ON public.ai_learning_insights FOR DELETE TO authenticated USING (school_id=public.current_school_id() AND public.is_school_manager());
