-- EduFlow AI: authorize academic insight RPCs and align insight writes with the actual schema.
-- SECURITY DEFINER functions must never expose arbitrary students to authenticated callers.

CREATE OR REPLACE FUNCTION public.refresh_student_learning_insights(p_student_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_count integer := 0;
BEGIN
  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;

  IF v_school_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.school_id = v_school_id
  ) THEN
    RAISE EXCEPTION 'Student is not in your school';
  END IF;

  IF NOT (
    public.is_school_manager()
    OR public.has_role(auth.uid(), 'teacher')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = p_student_id AND s.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to refresh insights for this student';
  END IF;

  DELETE FROM public.ai_learning_insights
  WHERE student_id = p_student_id AND school_id = v_school_id AND insight_type = 'weak_subject';

  INSERT INTO public.ai_learning_insights (
    school_id, student_id, subject_id, insight_type, title, summary, evidence, confidence
  )
  SELECT
    v_school_id,
    p_student_id,
    s.id,
    'weak_subject',
    'Needs more practice: ' || s.name,
    'Assessment performance in ' || s.name || ' is below the 50% school insight threshold.',
    jsonb_build_object(
      'subject_id', s.id,
      'average_score', ROUND(AVG(sc.score)::numeric, 2),
      'score_count', COUNT(*),
      'severity', CASE WHEN AVG(sc.score) < 40 THEN 'high' ELSE 'medium' END
    ),
    CASE WHEN AVG(sc.score) < 40 THEN 0.90 ELSE 0.80 END
  FROM public.assessment_scores sc
  JOIN public.assessments a ON a.id = sc.assessment_id AND a.school_id = v_school_id
  JOIN public.subjects s ON s.id = a.subject_id AND s.school_id = v_school_id
  WHERE sc.school_id = v_school_id AND sc.student_id = p_student_id
  GROUP BY s.id, s.name
  HAVING AVG(sc.score) < 50;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_student_learning_insights(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_student_learning_insights(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_learning_summary(p_student_id uuid)
RETURNS TABLE(subject_id uuid, subject_name text, average_score numeric, score_count bigint, needs_attention boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;

  IF v_school_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.school_id = v_school_id
  ) THEN
    RAISE EXCEPTION 'Student is not in your school';
  END IF;

  IF NOT (
    public.is_school_manager()
    OR public.has_role(auth.uid(), 'teacher')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = p_student_id AND s.user_id = auth.uid())
    OR public.is_parent_of_student(p_student_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this student';
  END IF;

  RETURN QUERY
  SELECT s.id, s.name, ROUND(AVG(sc.score)::numeric, 2), COUNT(*)::bigint, AVG(sc.score) < 50
  FROM public.assessment_scores sc
  JOIN public.assessments a ON a.id = sc.assessment_id AND a.school_id = v_school_id
  JOIN public.subjects s ON s.id = a.subject_id AND s.school_id = v_school_id
  WHERE sc.school_id = v_school_id AND sc.student_id = p_student_id
  GROUP BY s.id, s.name
  ORDER BY AVG(sc.score) ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.student_learning_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_learning_summary(uuid) TO authenticated;
