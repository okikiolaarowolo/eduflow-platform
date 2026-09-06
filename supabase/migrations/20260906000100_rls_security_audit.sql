-- EduFlow AI security hardening: explicit least-privilege RLS for every school-owned platform table.
-- This migration deliberately removes the earlier broad policies on these tables before
-- installing role-, ownership-, class-, and school-scoped policies.

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_current_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = _role
      AND (school_id = public.current_school_id() OR public.is_platform_admin())
  );
$$;

CREATE OR REPLACE FUNCTION public.current_teacher_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id
  FROM public.teachers t
  WHERE t.user_id = auth.uid()
    AND (t.school_id = public.current_school_id() OR public.is_platform_admin())
  ORDER BY t.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_class(_class_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1
    FROM public.teacher_classes tc
    WHERE tc.teacher_id = public.current_teacher_id()
      AND tc.class_id = _class_id
      AND tc.school_id = public.current_school_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_subject(_subject_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1
    FROM public.teacher_subjects ts
    WHERE ts.teacher_id = public.current_teacher_id()
      AND ts.subject_id = _subject_id
      AND ts.school_id = public.current_school_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = _student_id
      AND s.school_id = public.current_school_id()
      AND public.is_teacher_of_class(s.class_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = _student_id
      AND s.user_id = auth.uid()
      AND s.school_id = public.current_school_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_parent()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_profiles pp
    WHERE pp.user_id = auth.uid()
      AND pp.school_id = public.current_school_id()
  );
$$;

-- Remove every pre-existing policy from the protected tables. PostgreSQL combines
-- permissive policies with OR, so adding a stricter policy without removing a broad
-- one would not actually harden access.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'enrollments','parent_profiles','student_parents','attendance_sessions','attendance_records',
        'assessments','assessment_scores','grade_scales','report_cards','report_card_subjects',
        'assignments','assignment_submissions','learning_materials','timetable_entries','announcements',
        'notifications','ai_conversations','ai_messages','ai_study_plans','ai_learning_insights',
        'ai_usage','ai_settings','saas_plans','school_subscriptions','usage_counters','audit_logs',
        'teachers','students','teacher_classes','teacher_subjects','class_subjects','academic_sessions','terms','classes','subjects'
      ]::name[])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- RLS must remain enabled even if a future migration recreates one of these tables.
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_card_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_learning_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- Core school directory: managers/platform admins manage it; teachers see only
-- their own profile; other roles do not receive staff directory data by default.
CREATE POLICY teachers_select ON public.teachers FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR
  (school_id = public.current_school_id() AND (public.is_school_manager() OR user_id = auth.uid()))
);
CREATE POLICY teachers_manager_write ON public.teachers FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY students_select ON public.students FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR
      public.is_teacher_of_student(id) OR
      public.is_current_user_student(id) OR
      public.is_parent_of_student(id)
    )
  )
);
CREATE POLICY students_manager_write ON public.students FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY classes_select ON public.classes FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (school_id = public.current_school_id())
);
CREATE POLICY classes_manager_write ON public.classes FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY subjects_select ON public.subjects FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (school_id = public.current_school_id())
);
CREATE POLICY subjects_manager_write ON public.subjects FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY academic_sessions_select ON public.academic_sessions FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR school_id = public.current_school_id()
);
CREATE POLICY academic_sessions_manager_write ON public.academic_sessions FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY terms_select ON public.terms FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR school_id = public.current_school_id()
);
CREATE POLICY terms_manager_write ON public.terms FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY teacher_classes_select ON public.teacher_classes FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND
    (public.is_school_manager() OR teacher_id = public.current_teacher_id())
  )
);
CREATE POLICY teacher_classes_manager_write ON public.teacher_classes FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY teacher_subjects_select ON public.teacher_subjects FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND
    (public.is_school_manager() OR teacher_id = public.current_teacher_id())
  )
);
CREATE POLICY teacher_subjects_manager_write ON public.teacher_subjects FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY class_subjects_select ON public.class_subjects FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR school_id = public.current_school_id()
);
CREATE POLICY class_subjects_manager_write ON public.class_subjects FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

-- Parents and enrollment records are private relationship data.
CREATE POLICY parent_profiles_select ON public.parent_profiles FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (user_id = auth.uid() OR public.is_school_manager())
  )
);
CREATE POLICY parent_profiles_manager_write ON public.parent_profiles FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY student_parents_select ON public.student_parents FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR
      parent_id IN (SELECT pp.id FROM public.parent_profiles pp WHERE pp.user_id = auth.uid() AND pp.school_id = public.current_school_id()) OR
      public.is_current_user_student(student_id)
    )
  )
);
CREATE POLICY student_parents_manager_write ON public.student_parents FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY enrollments_select ON public.enrollments FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR
      public.is_teacher_of_student(student_id) OR
      public.is_current_user_student(student_id) OR
      public.is_parent_of_student(student_id)
    )
  )
);
CREATE POLICY enrollments_manager_write ON public.enrollments FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

-- Attendance: staff can see only the classes they are responsible for; learners/parents
-- can see records belonging to that learner.
CREATE POLICY attendance_sessions_select ON public.attendance_sessions FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR
      public.is_teacher_of_class(class_id) OR
      EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.class_id = class_id AND (public.is_current_user_student(s.id) OR public.is_parent_of_student(s.id))
      )
    )
  )
);
CREATE POLICY attendance_sessions_manager_write ON public.attendance_sessions FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());
CREATE POLICY attendance_sessions_teacher_insert ON public.attendance_sessions FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND public.is_teacher_of_class(class_id));
CREATE POLICY attendance_sessions_teacher_update ON public.attendance_sessions FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND marked_by = auth.uid() AND public.is_teacher_of_class(class_id))
  WITH CHECK (school_id = public.current_school_id() AND public.is_teacher_of_class(class_id));

CREATE POLICY attendance_records_select ON public.attendance_records FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR
      public.is_teacher_of_student(student_id) OR
      public.is_current_user_student(student_id) OR
      public.is_parent_of_student(student_id)
    )
  )
);
CREATE POLICY attendance_records_manager_write ON public.attendance_records FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());
CREATE POLICY attendance_records_teacher_insert ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id() AND
    EXISTS (
      SELECT 1 FROM public.attendance_sessions a
      WHERE a.id = attendance_session_id AND a.school_id = public.current_school_id()
        AND a.marked_by = auth.uid() AND public.is_teacher_of_class(a.class_id)
    ) AND public.is_teacher_of_student(student_id)
  );
CREATE POLICY attendance_records_teacher_update ON public.attendance_records FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id() AND
    EXISTS (
      SELECT 1 FROM public.attendance_sessions a
      WHERE a.id = attendance_session_id AND a.marked_by = auth.uid() AND public.is_teacher_of_class(a.class_id)
    ) AND public.is_teacher_of_student(student_id)
  )
  WITH CHECK (school_id = public.current_school_id());

-- Assessments and results: teachers are limited to their assigned class/subject.
CREATE POLICY assessments_select ON public.assessments FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR
      (public.is_teacher_of_class(class_id) AND public.is_teacher_of_subject(subject_id)) OR
      (published AND EXISTS (SELECT 1 FROM public.students s WHERE s.id IN (
        SELECT id FROM public.students WHERE class_id = assessments.class_id
      ) AND (public.is_current_user_student(s.id) OR public.is_parent_of_student(s.id))))
    )
  )
);
CREATE POLICY assessments_manager_write ON public.assessments FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());
CREATE POLICY assessments_teacher_insert ON public.assessments FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id() AND
    public.is_teacher_of_class(class_id) AND public.is_teacher_of_subject(subject_id) AND created_by = auth.uid()
  );
CREATE POLICY assessments_teacher_update ON public.assessments FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id() AND created_by = auth.uid() AND
    public.is_teacher_of_class(class_id) AND public.is_teacher_of_subject(subject_id)
  )
  WITH CHECK (school_id = public.current_school_id() AND public.is_teacher_of_class(class_id) AND public.is_teacher_of_subject(subject_id));

CREATE POLICY assessment_scores_select ON public.assessment_scores FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR public.is_teacher_of_student(student_id) OR
      public.is_current_user_student(student_id) OR public.is_parent_of_student(student_id)
    )
  )
);
CREATE POLICY assessment_scores_manager_write ON public.assessment_scores FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());
CREATE POLICY assessment_scores_teacher_write ON public.assessment_scores FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_teacher_of_student(student_id) AND
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_id AND a.school_id = public.current_school_id()
        AND public.is_teacher_of_class(a.class_id) AND public.is_teacher_of_subject(a.subject_id)
    )
  );
CREATE POLICY assessment_scores_teacher_update ON public.assessment_scores FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id() AND public.is_teacher_of_student(student_id) AND
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_id AND a.school_id = public.current_school_id()
        AND public.is_teacher_of_class(a.class_id) AND public.is_teacher_of_subject(a.subject_id)
    )
  )
  WITH CHECK (school_id = public.current_school_id());

CREATE POLICY grade_scales_select ON public.grade_scales FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR school_id = public.current_school_id()
);
CREATE POLICY grade_scales_manager_write ON public.grade_scales FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY report_cards_select ON public.report_cards FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR public.is_teacher_of_student(student_id) OR
      public.is_current_user_student(student_id) OR public.is_parent_of_student(student_id)
    )
  )
);
CREATE POLICY report_cards_manager_write ON public.report_cards FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY report_card_subjects_select ON public.report_card_subjects FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND EXISTS (
      SELECT 1 FROM public.report_cards rc
      WHERE rc.id = report_card_id AND (
        public.is_school_manager() OR public.is_teacher_of_student(rc.student_id) OR
        public.is_current_user_student(rc.student_id) OR public.is_parent_of_student(rc.student_id)
      )
    )
  )
);
CREATE POLICY report_card_subjects_manager_write ON public.report_card_subjects FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

-- Assignments/materials are visible to the relevant class, not to unrelated schools/classes.
CREATE POLICY assignments_select ON public.assignments FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR public.is_teacher_of_class(class_id) OR
      (status = 'published' AND EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.class_id = assignments.class_id AND (public.is_current_user_student(s.id) OR public.is_parent_of_student(s.id))
      ))
    )
  )
);
CREATE POLICY assignments_manager_write ON public.assignments FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());
CREATE POLICY assignments_teacher_write ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id() AND teacher_id = public.current_teacher_id() AND
    public.is_teacher_of_class(class_id) AND public.is_teacher_of_subject(subject_id)
  );
CREATE POLICY assignments_teacher_update ON public.assignments FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND teacher_id = public.current_teacher_id() AND public.is_teacher_of_class(class_id))
  WITH CHECK (school_id = public.current_school_id() AND teacher_id = public.current_teacher_id() AND public.is_teacher_of_class(class_id));

CREATE POLICY assignment_submissions_select ON public.assignment_submissions FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR public.is_current_user_student(student_id) OR public.is_parent_of_student(student_id) OR
      EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND public.is_teacher_of_class(a.class_id))
    )
  )
);
CREATE POLICY assignment_submissions_student_insert ON public.assignment_submissions FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND public.is_current_user_student(student_id));
CREATE POLICY assignment_submissions_student_update ON public.assignment_submissions FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_current_user_student(student_id))
  WITH CHECK (school_id = public.current_school_id() AND public.is_current_user_student(student_id));
CREATE POLICY assignment_submissions_manager_write ON public.assignment_submissions FOR DELETE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager());
CREATE POLICY assignment_submissions_teacher_grade ON public.assignment_submissions FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id() AND
    EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND public.is_teacher_of_class(a.class_id))
  )
  WITH CHECK (school_id = public.current_school_id());

CREATE POLICY learning_materials_select ON public.learning_materials FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR
      (teacher_id = public.current_teacher_id()) OR
      (published AND (class_id IS NULL OR EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.class_id = learning_materials.class_id AND (public.is_current_user_student(s.id) OR public.is_parent_of_student(s.id))
      )))
    )
  )
);
CREATE POLICY learning_materials_manager_write ON public.learning_materials FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());
CREATE POLICY learning_materials_teacher_write ON public.learning_materials FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id() AND teacher_id = public.current_teacher_id() AND
    (class_id IS NULL OR public.is_teacher_of_class(class_id)) AND
    (subject_id IS NULL OR public.is_teacher_of_subject(subject_id))
  );
CREATE POLICY learning_materials_teacher_update ON public.learning_materials FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND teacher_id = public.current_teacher_id())
  WITH CHECK (school_id = public.current_school_id() AND teacher_id = public.current_teacher_id());

CREATE POLICY timetable_entries_select ON public.timetable_entries FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR public.is_teacher_of_class(class_id) OR
      EXISTS (SELECT 1 FROM public.students s WHERE s.class_id = timetable_entries.class_id AND (public.is_current_user_student(s.id) OR public.is_parent_of_student(s.id)))
    )
  )
);
CREATE POLICY timetable_entries_manager_write ON public.timetable_entries FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

-- Announcements are filtered by role/audience. Notifications are always user-private.
CREATE POLICY announcements_select ON public.announcements FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR audience = 'all' OR
      (audience IN ('teachers','staff') AND public.has_current_role('teacher')) OR
      (audience = 'students' AND public.has_current_role('student')) OR
      (audience = 'parents' AND public.has_current_role('parent'))
    )
  )
);
CREATE POLICY announcements_manager_write ON public.announcements FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR user_id = auth.uid()
);
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin() OR (user_id = auth.uid() AND school_id = public.current_school_id()));
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

-- AI data is private to the requesting user. School managers can configure AI and
-- see aggregate usage, but cannot silently read students' private AI conversations.
CREATE POLICY ai_conversations_select ON public.ai_conversations FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (school_id = public.current_school_id() AND user_id = auth.uid())
);
CREATE POLICY ai_conversations_insert ON public.ai_conversations FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());
CREATE POLICY ai_conversations_update ON public.ai_conversations FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid())
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());
CREATE POLICY ai_conversations_delete ON public.ai_conversations FOR DELETE TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid());

CREATE POLICY ai_messages_select ON public.ai_messages FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (school_id = public.current_school_id() AND user_id = auth.uid())
);
CREATE POLICY ai_messages_insert ON public.ai_messages FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());
CREATE POLICY ai_messages_update ON public.ai_messages FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid())
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());
CREATE POLICY ai_messages_delete ON public.ai_messages FOR DELETE TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid());

CREATE POLICY ai_study_plans_select ON public.ai_study_plans FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND
    (public.is_school_manager() OR public.is_current_user_student(student_id) OR public.is_parent_of_student(student_id))
  )
);
CREATE POLICY ai_study_plans_manager_write ON public.ai_study_plans FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());
CREATE POLICY ai_study_plans_student_write ON public.ai_study_plans FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_current_user_student(student_id))
  WITH CHECK (school_id = public.current_school_id() AND public.is_current_user_student(student_id));

CREATE POLICY ai_learning_insights_select ON public.ai_learning_insights FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (
    school_id = public.current_school_id() AND (
      public.is_school_manager() OR public.is_teacher_of_student(student_id) OR
      public.is_current_user_student(student_id) OR public.is_parent_of_student(student_id)
    )
  )
);
CREATE POLICY ai_learning_insights_manager_write ON public.ai_learning_insights FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY ai_usage_manager_select ON public.ai_usage FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (school_id = public.current_school_id() AND public.is_school_manager())
);
CREATE POLICY ai_usage_service_insert ON public.ai_usage FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());

CREATE POLICY ai_settings_manager_select ON public.ai_settings FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (school_id = public.current_school_id() AND public.is_school_manager())
);
CREATE POLICY ai_settings_manager_write ON public.ai_settings FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

-- Billing/platform data is not school-member data. Only platform admins can manage
-- plans; school managers can see their own subscription.
CREATE POLICY saas_plans_select ON public.saas_plans FOR SELECT TO authenticated USING (
  active OR public.is_platform_admin()
);
CREATE POLICY saas_plans_platform_write ON public.saas_plans FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE POLICY school_subscriptions_select ON public.school_subscriptions FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (school_id = public.current_school_id() AND public.is_school_manager())
);
CREATE POLICY school_subscriptions_platform_write ON public.school_subscriptions FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE POLICY usage_counters_select ON public.usage_counters FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (school_id = public.current_school_id() AND public.is_school_manager())
);
CREATE POLICY usage_counters_manager_write ON public.usage_counters FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR (school_id = public.current_school_id() AND public.is_school_manager())
);
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin() OR (school_id = public.current_school_id() AND actor_id = auth.uid()));

-- Keep function access explicit; these helpers are intended for RLS evaluation only.
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_current_role(public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_teacher_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_teacher_of_class(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_teacher_of_subject(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_teacher_of_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_current_user_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_current_user_parent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_current_role(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_teacher_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_subject(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_parent() TO authenticated;
