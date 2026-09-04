-- EduFlow AI identity links and role-aware academic access.
-- Safe for existing installations: all identity columns are nullable so existing
-- school records continue to work until an administrator links a user account.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_user_id
  ON public.students(user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_user_id
  ON public.teachers(user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_profiles_user_id
  ON public.parent_profiles(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_parents_parent
  ON public.student_parents(parent_id);

CREATE INDEX IF NOT EXISTS idx_assignments_teacher
  ON public.assignments(teacher_id);

-- School managers can link staff/student/parent records. A user may also
-- update their own linked profile where the row already belongs to their school.
DROP POLICY IF EXISTS students_manager_update ON public.students;
CREATE POLICY students_manager_update ON public.students
  FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id());

DROP POLICY IF EXISTS teachers_manager_update ON public.teachers;
CREATE POLICY teachers_manager_update ON public.teachers
  FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id());

-- Assigned teachers may create/update the academic work they own. Managers
-- retain full write access through the existing policies.
DROP POLICY IF EXISTS assignments_teacher_insert ON public.assignments;
CREATE POLICY assignments_teacher_insert ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND teacher_id IN (
      SELECT t.id FROM public.teachers t
      WHERE t.user_id = auth.uid()
        AND t.school_id = public.current_school_id()
    )
  );

DROP POLICY IF EXISTS assignments_teacher_update ON public.assignments;
CREATE POLICY assignments_teacher_update ON public.assignments
  FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id()
    AND teacher_id IN (
      SELECT t.id FROM public.teachers t
      WHERE t.user_id = auth.uid()
        AND t.school_id = public.current_school_id()
    )
  )
  WITH CHECK (
    school_id = public.current_school_id()
    AND teacher_id IN (
      SELECT t.id FROM public.teachers t
      WHERE t.user_id = auth.uid()
        AND t.school_id = public.current_school_id()
    )
  );

DROP POLICY IF EXISTS assessments_teacher_insert ON public.assessments;
CREATE POLICY assessments_teacher_insert ON public.assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS assessment_scores_teacher_insert ON public.assessment_scores;
CREATE POLICY assessment_scores_teacher_insert ON public.assessment_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND graded_by = auth.uid()
  );

DROP POLICY IF EXISTS assessment_scores_teacher_update ON public.assessment_scores;
CREATE POLICY assessment_scores_teacher_update ON public.assessment_scores
  FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND graded_by = auth.uid())
  WITH CHECK (school_id = public.current_school_id() AND graded_by = auth.uid());

-- Students can submit their own assignments. Parents can read their linked
-- children's academic records through the school-scoped SELECT policies.
DROP POLICY IF EXISTS assignment_submissions_student_insert ON public.assignment_submissions;
CREATE POLICY assignment_submissions_student_insert ON public.assignment_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND student_id IN (
      SELECT s.id FROM public.students s
      WHERE s.user_id = auth.uid()
        AND s.school_id = public.current_school_id()
    )
  );

DROP POLICY IF EXISTS assignment_submissions_student_update ON public.assignment_submissions;
CREATE POLICY assignment_submissions_student_update ON public.assignment_submissions
  FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id()
    AND student_id IN (
      SELECT s.id FROM public.students s
      WHERE s.user_id = auth.uid()
        AND s.school_id = public.current_school_id()
    )
  )
  WITH CHECK (
    school_id = public.current_school_id()
    AND student_id IN (
      SELECT s.id FROM public.students s
      WHERE s.user_id = auth.uid()
        AND s.school_id = public.current_school_id()
    )
  );

-- A student can read their own study plans and insights in addition to the
-- existing school-member read policy; this is intentionally additive.
DROP POLICY IF EXISTS ai_study_plans_student_insert ON public.ai_study_plans;
CREATE POLICY ai_study_plans_student_insert ON public.ai_study_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND student_id IN (
      SELECT s.id FROM public.students s
      WHERE s.user_id = auth.uid()
        AND s.school_id = public.current_school_id()
    )
  );

DROP POLICY IF EXISTS ai_study_plans_student_update ON public.ai_study_plans;
CREATE POLICY ai_study_plans_student_update ON public.ai_study_plans
  FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id()
    AND student_id IN (
      SELECT s.id FROM public.students s
      WHERE s.user_id = auth.uid()
        AND s.school_id = public.current_school_id()
    )
  )
  WITH CHECK (
    school_id = public.current_school_id()
    AND student_id IN (
      SELECT s.id FROM public.students s
      WHERE s.user_id = auth.uid()
        AND s.school_id = public.current_school_id()
    )
  );
