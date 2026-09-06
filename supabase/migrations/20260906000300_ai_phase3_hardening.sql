-- EduFlow AI Phase 3: enforce AI availability, quota safety, and usage integrity.
-- This migration is intentionally additive and safe to re-run.

CREATE OR REPLACE FUNCTION public.ai_monthly_usage(p_school_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(GREATEST(COALESCE(input_tokens,0),0) + GREATEST(COALESCE(output_tokens,0),0)),0)::bigint
  FROM public.ai_usage
  WHERE school_id = p_school_id
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + interval '1 month';
$$;
REVOKE ALL ON FUNCTION public.ai_monthly_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_monthly_usage(uuid) TO authenticated;

-- AI settings are school-manager controlled; never allow a normal school member to edit them.
DROP POLICY IF EXISTS ai_settings_select ON public.ai_settings;
CREATE POLICY ai_settings_select ON public.ai_settings FOR SELECT TO authenticated
USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS ai_settings_manager_update ON public.ai_settings;
CREATE POLICY ai_settings_manager_update ON public.ai_settings FOR UPDATE TO authenticated
USING (school_id = public.current_school_id() AND public.is_school_manager())
WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

-- Usage is readable only by managers; inserts are service-side through the authenticated AI function.
DROP POLICY IF EXISTS ai_usage_select ON public.ai_usage;
CREATE POLICY ai_usage_select ON public.ai_usage FOR SELECT TO authenticated
USING (school_id = public.current_school_id() AND public.is_school_manager());
DROP POLICY IF EXISTS ai_usage_insert ON public.ai_usage;
CREATE POLICY ai_usage_insert ON public.ai_usage FOR INSERT TO authenticated
WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());

-- Prevent clients from forging usage totals/costs through the public table API.
DROP POLICY IF EXISTS ai_usage_update ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_delete ON public.ai_usage;

-- AI conversations/messages remain owner-scoped and tenant-bound.
DROP POLICY IF EXISTS ai_conversations_select ON public.ai_conversations;
CREATE POLICY ai_conversations_select ON public.ai_conversations FOR SELECT TO authenticated
USING (school_id = public.current_school_id() AND (user_id = auth.uid() OR public.is_school_manager()));
DROP POLICY IF EXISTS ai_conversations_insert ON public.ai_conversations;
CREATE POLICY ai_conversations_insert ON public.ai_conversations FOR INSERT TO authenticated
WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());
DROP POLICY IF EXISTS ai_conversations_update ON public.ai_conversations;
CREATE POLICY ai_conversations_update ON public.ai_conversations FOR UPDATE TO authenticated
USING (school_id = public.current_school_id() AND user_id = auth.uid())
WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());
DROP POLICY IF EXISTS ai_conversations_delete ON public.ai_conversations;
CREATE POLICY ai_conversations_delete ON public.ai_conversations FOR DELETE TO authenticated
USING (school_id = public.current_school_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS ai_messages_select ON public.ai_messages;
CREATE POLICY ai_messages_select ON public.ai_messages FOR SELECT TO authenticated
USING (school_id = public.current_school_id() AND (user_id = auth.uid() OR conversation_id IN (
  SELECT id FROM public.ai_conversations WHERE user_id = auth.uid() AND school_id = public.current_school_id()
)));
DROP POLICY IF EXISTS ai_messages_insert ON public.ai_messages;
CREATE POLICY ai_messages_insert ON public.ai_messages FOR INSERT TO authenticated
WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid() AND conversation_id IN (
  SELECT id FROM public.ai_conversations WHERE user_id = auth.uid() AND school_id = public.current_school_id()
));
DROP POLICY IF EXISTS ai_messages_update ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_delete ON public.ai_messages;

-- Make AI usage limit changes safe: never accept negative limits.
ALTER TABLE public.ai_settings DROP CONSTRAINT IF EXISTS ai_settings_monthly_token_limit_check;
ALTER TABLE public.ai_settings ADD CONSTRAINT ai_settings_monthly_token_limit_check CHECK (monthly_token_limit >= 0);

-- Ensure the AI usage table cannot contain negative token counts.
ALTER TABLE public.ai_usage DROP CONSTRAINT IF EXISTS ai_usage_input_tokens_check;
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_input_tokens_check CHECK (input_tokens >= 0);
ALTER TABLE public.ai_usage DROP CONSTRAINT IF EXISTS ai_usage_output_tokens_check;
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_output_tokens_check CHECK (output_tokens >= 0);
ALTER TABLE public.ai_usage DROP CONSTRAINT IF EXISTS ai_usage_estimated_cost_check;
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_estimated_cost_check CHECK (estimated_cost >= 0);
