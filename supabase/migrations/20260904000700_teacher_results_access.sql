-- Assigned teachers may enter scores for assessments in classes they teach.
DROP POLICY IF EXISTS assessment_scores_teacher_insert ON public.assessment_scores;
CREATE POLICY assessment_scores_teacher_insert ON public.assessment_scores FOR INSERT TO authenticated WITH CHECK (
 school_id=public.current_school_id() AND graded_by=auth.uid() AND EXISTS (
  SELECT 1 FROM public.assessments a JOIN public.teacher_classes tc ON tc.class_id=a.class_id JOIN public.teachers t ON t.id=tc.teacher_id
  WHERE a.id=assessment_id AND t.user_id=auth.uid() AND t.school_id=public.current_school_id()
 )
);
DROP POLICY IF EXISTS assessment_scores_teacher_update ON public.assessment_scores;
CREATE POLICY assessment_scores_teacher_update ON public.assessment_scores FOR UPDATE TO authenticated
USING (school_id=public.current_school_id() AND graded_by=auth.uid())
WITH CHECK (school_id=public.current_school_id() AND graded_by=auth.uid());
