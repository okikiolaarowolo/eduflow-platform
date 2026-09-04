-- Allow authenticated learners and teachers to use their own AI workspace.
-- School membership is still enforced through current_school_id().

DROP POLICY IF EXISTS ai_conversations_user_insert ON public.ai_conversations;
CREATE POLICY ai_conversations_user_insert ON public.ai_conversations
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS ai_conversations_user_update ON public.ai_conversations;
CREATE POLICY ai_conversations_user_update ON public.ai_conversations
  FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid())
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS ai_conversations_user_delete ON public.ai_conversations;
CREATE POLICY ai_conversations_user_delete ON public.ai_conversations
  FOR DELETE TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS ai_messages_user_insert ON public.ai_messages;
CREATE POLICY ai_messages_user_insert ON public.ai_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND user_id = auth.uid()
    AND conversation_id IN (
      SELECT c.id FROM public.ai_conversations c
      WHERE c.user_id = auth.uid() AND c.school_id = public.current_school_id()
    )
  );

DROP POLICY IF EXISTS ai_messages_user_select ON public.ai_messages;
CREATE POLICY ai_messages_user_select ON public.ai_messages
  FOR SELECT TO authenticated
  USING (
    school_id = public.current_school_id()
    AND conversation_id IN (
      SELECT c.id FROM public.ai_conversations c
      WHERE c.user_id = auth.uid() AND c.school_id = public.current_school_id()
    )
  );

DROP POLICY IF EXISTS ai_usage_user_insert ON public.ai_usage;
CREATE POLICY ai_usage_user_insert ON public.ai_usage
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());

-- Students and parents should see only their own notification records; the
-- existing SELECT policy already enforces this. These policies add the ability
-- for a student's own AI study-plan records to be created without manager access.
DROP POLICY IF EXISTS ai_study_plans_user_select ON public.ai_study_plans;
CREATE POLICY ai_study_plans_user_select ON public.ai_study_plans
  FOR SELECT TO authenticated
  USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_manager()
      OR student_id IN (SELECT s.id FROM public.students s WHERE s.user_id = auth.uid() AND s.school_id = public.current_school_id())
    )
  );
