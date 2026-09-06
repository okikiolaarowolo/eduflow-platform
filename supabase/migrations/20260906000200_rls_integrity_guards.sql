-- Defense-in-depth integrity guards for tenant isolation.

CREATE OR REPLACE FUNCTION public.enforce_school_boundary()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- service_role/background jobs do not have an end-user auth.uid(); those jobs are
  -- trusted and may write across schools. End-user requests must stay in their school.
  IF auth.uid() IS NULL OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.school_id IS DISTINCT FROM public.current_school_id() THEN
    RAISE EXCEPTION 'Cross-school mutation denied';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.school_id IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'school_id cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_school_boundary() FROM PUBLIC;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'enrollments','parent_profiles','student_parents','attendance_sessions','attendance_records',
    'assessments','assessment_scores','grade_scales','report_cards','report_card_subjects',
    'assignments','assignment_submissions','learning_materials','timetable_entries','announcements',
    'notifications','ai_conversations','ai_messages','ai_study_plans','ai_learning_insights',
    'ai_usage','ai_settings','school_subscriptions','usage_counters','audit_logs',
    'teachers','students','teacher_classes','teacher_subjects','class_subjects','academic_sessions','terms','classes','subjects'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'enforce_school_boundary_' || t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_school_boundary()', 'enforce_school_boundary_' || t, t);
  END LOOP;
END $$;

-- Prevent a learner from changing teacher-controlled grading fields on a submission.
CREATE OR REPLACE FUNCTION public.protect_assignment_submission_grading()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin()
     AND public.is_current_user_student(OLD.student_id)
     AND (
       NEW.score IS DISTINCT FROM OLD.score OR
       NEW.feedback IS DISTINCT FROM OLD.feedback OR
       NEW.graded_by IS DISTINCT FROM OLD.graded_by
     ) THEN
    RAISE EXCEPTION 'Students cannot modify grading fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_assignment_submission_grading ON public.assignment_submissions;
CREATE TRIGGER protect_assignment_submission_grading
BEFORE UPDATE ON public.assignment_submissions
FOR EACH ROW EXECUTE FUNCTION public.protect_assignment_submission_grading();

-- Notifications are private and must remain attached to the current school for
-- normal users. Replacing the earlier policy also prevents a user from moving a
-- notification to another school by updating school_id.
DROP POLICY IF EXISTS notifications_select ON public.notifications;
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
DROP POLICY IF EXISTS notifications_update ON public.notifications;
DROP POLICY IF EXISTS notifications_delete ON public.notifications;

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (user_id = auth.uid() AND school_id = public.current_school_id())
);
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (
  public.is_platform_admin() OR (user_id = auth.uid() AND school_id = public.current_school_id())
);
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND school_id = public.current_school_id())
  WITH CHECK (user_id = auth.uid() AND school_id = public.current_school_id());
CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated
  USING (public.is_platform_admin() OR (user_id = auth.uid() AND school_id = public.current_school_id()));

-- Keep the tenant-key guard on the school-owned audit stream while allowing the
-- existing platform/admin policy to control who can read it.
