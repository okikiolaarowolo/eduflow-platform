-- Harden AI usage accounting and role-based feature controls.
-- Usage totals are exposed through a SECURITY DEFINER function because ordinary
-- users must not receive unrestricted SELECT access to every AI usage row.

CREATE OR REPLACE FUNCTION public.ai_monthly_usage(p_school_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0)::bigint
  FROM public.ai_usage
  WHERE school_id = p_school_id
    AND created_at >= date_trunc('month', now())
    AND (
      p_school_id = public.current_school_id()
      OR public.has_role(auth.uid(), 'super_admin')
    );
$$;

REVOKE ALL ON FUNCTION public.ai_monthly_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_monthly_usage(uuid) TO authenticated;

-- Prevent a teacher from creating academic work for classes/subjects they are
-- not assigned to. Managers retain their existing full access.
DROP POLICY IF EXISTS assignments_teacher_insert ON public.assignments;
CREATE POLICY assignments_teacher_insert ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND teacher_id IN (
      SELECT t.id
      FROM public.teachers t
      WHERE t.user_id = auth.uid()
        AND t.school_id = public.current_school_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.teacher_classes tc
      WHERE tc.teacher_id = teacher_id
        AND tc.class_id = assignments.class_id
    )
    AND EXISTS (
      SELECT 1 FROM public.teacher_subjects ts
      WHERE ts.teacher_id = teacher_id
        AND ts.subject_id = assignments.subject_id
    )
  );

DROP POLICY IF EXISTS assessments_teacher_insert ON public.assessments;
CREATE POLICY assessments_teacher_insert ON public.assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.teachers t
      JOIN public.teacher_classes tc ON tc.teacher_id = t.id
      JOIN public.teacher_subjects ts ON ts.teacher_id = t.id
      WHERE t.user_id = auth.uid()
        AND t.school_id = public.current_school_id()
        AND tc.class_id = assessments.class_id
        AND ts.subject_id = assessments.subject_id
    )
  );

-- A teacher may only grade an assessment belonging to a class and subject they
-- are assigned to. Managers continue to use the existing manager policies.
DROP POLICY IF EXISTS assessment_scores_teacher_insert ON public.assessment_scores;
CREATE POLICY assessment_scores_teacher_insert ON public.assessment_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND graded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.assessments a
      JOIN public.teacher_classes tc ON tc.class_id = a.class_id
      JOIN public.teacher_subjects ts ON ts.subject_id = a.subject_id
      JOIN public.teachers t ON t.id = tc.teacher_id AND t.id = ts.teacher_id
      WHERE a.id = assessment_scores.assessment_id
        AND a.school_id = public.current_school_id()
        AND t.user_id = auth.uid()
        AND t.school_id = public.current_school_id()
    )
  );

DROP POLICY IF EXISTS assessment_scores_teacher_update ON public.assessment_scores;
CREATE POLICY assessment_scores_teacher_update ON public.assessment_scores
  FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id()
    AND graded_by = auth.uid()
  )
  WITH CHECK (
    school_id = public.current_school_id()
    AND graded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.assessments a
      JOIN public.teacher_classes tc ON tc.class_id = a.class_id
      JOIN public.teacher_subjects ts ON ts.subject_id = a.subject_id
      JOIN public.teachers t ON t.id = tc.teacher_id AND t.id = ts.teacher_id
      WHERE a.id = assessment_scores.assessment_id
        AND a.school_id = public.current_school_id()
        AND t.user_id = auth.uid()
        AND t.school_id = public.current_school_id()
    )
  );
