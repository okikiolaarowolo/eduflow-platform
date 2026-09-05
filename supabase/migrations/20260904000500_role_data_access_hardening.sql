-- Least-privilege access for student and parent academic data.
CREATE OR REPLACE FUNCTION public.is_parent_of_student(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_parents sp
    JOIN public.parent_profiles pp ON pp.id = sp.parent_id
    WHERE sp.student_id = _student_id
      AND sp.school_id = public.current_school_id()
      AND pp.user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_parent_of_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_parent_of_student(uuid) TO authenticated;

DROP POLICY IF EXISTS parent_profiles_select ON public.parent_profiles;
CREATE POLICY parent_profiles_select ON public.parent_profiles FOR SELECT TO authenticated USING (
  school_id = public.current_school_id() AND (user_id = auth.uid() OR public.is_school_manager())
);
DROP POLICY IF EXISTS student_parents_select ON public.student_parents;
CREATE POLICY student_parents_select ON public.student_parents FOR SELECT TO authenticated USING (
  school_id = public.current_school_id() AND (public.is_school_manager() OR parent_id IN (
    SELECT id FROM public.parent_profiles WHERE user_id = auth.uid() AND school_id = public.current_school_id()
  ))
);

DROP POLICY IF EXISTS students_select ON public.students;
CREATE POLICY students_select ON public.students FOR SELECT TO authenticated USING (
  school_id = public.current_school_id() AND (
    public.is_school_manager() OR public.has_role(auth.uid(), 'teacher') OR user_id = auth.uid() OR public.is_parent_of_student(id)
  )
);

DROP POLICY IF EXISTS assessment_scores_select ON public.assessment_scores;
CREATE POLICY assessment_scores_select ON public.assessment_scores FOR SELECT TO authenticated USING (
  school_id = public.current_school_id() AND (
    public.is_school_manager() OR public.has_role(auth.uid(), 'teacher')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
    OR public.is_parent_of_student(student_id)
  )
);

DROP POLICY IF EXISTS report_cards_select ON public.report_cards;
CREATE POLICY report_cards_select ON public.report_cards FOR SELECT TO authenticated USING (
  school_id = public.current_school_id() AND (
    public.is_school_manager() OR public.has_role(auth.uid(), 'teacher')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
    OR public.is_parent_of_student(student_id)
  )
);

DROP POLICY IF EXISTS report_card_subjects_select ON public.report_card_subjects;
CREATE POLICY report_card_subjects_select ON public.report_card_subjects FOR SELECT TO authenticated USING (
  school_id = public.current_school_id() AND EXISTS (
    SELECT 1 FROM public.report_cards rc WHERE rc.id = report_card_id AND (
      public.is_school_manager() OR public.has_role(auth.uid(), 'teacher')
      OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = rc.student_id AND s.user_id = auth.uid())
      OR public.is_parent_of_student(rc.student_id)
    )
  )
);

DROP POLICY IF EXISTS attendance_records_select ON public.attendance_records;
CREATE POLICY attendance_records_select ON public.attendance_records FOR SELECT TO authenticated USING (
  school_id = public.current_school_id() AND (
    public.is_school_manager() OR public.has_role(auth.uid(), 'teacher')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
    OR public.is_parent_of_student(student_id)
  )
);

DROP POLICY IF EXISTS parent_profiles_manager_write ON public.parent_profiles;
CREATE POLICY parent_profiles_manager_write ON public.parent_profiles FOR ALL TO authenticated
USING (school_id = public.current_school_id() AND public.is_school_manager())
WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());
DROP POLICY IF EXISTS student_parents_manager_write ON public.student_parents;
CREATE POLICY student_parents_manager_write ON public.student_parents FOR ALL TO authenticated
USING (school_id = public.current_school_id() AND public.is_school_manager())
WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());
