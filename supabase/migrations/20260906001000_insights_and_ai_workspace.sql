-- EduFlow AI academic-insights foundation: server-computed weak areas and study-plan seeds.

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
  IF v_school_id IS NULL THEN RETURN 0; END IF;

  DELETE FROM public.ai_learning_insights
  WHERE student_id = p_student_id AND school_id = v_school_id AND insight_type = 'weak_subject';

  INSERT INTO public.ai_learning_insights (school_id, student_id, insight_type, title, description, severity, metadata)
  SELECT v_school_id, p_student_id, 'weak_subject',
         'Needs more practice: ' || s.name,
         'Recent assessment performance in ' || s.name || ' is below the school insight threshold.',
         CASE WHEN AVG(sc.score) < 40 THEN 'high' ELSE 'medium' END,
         jsonb_build_object('subject_id', s.id, 'average_score', ROUND(AVG(sc.score)::numeric, 2), 'score_count', COUNT(*))
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.name, ROUND(AVG(sc.score)::numeric, 2), COUNT(*)::bigint, AVG(sc.score) < 50
  FROM public.assessment_scores sc
  JOIN public.assessments a ON a.id = sc.assessment_id
  JOIN public.subjects s ON s.id = a.subject_id
  JOIN public.students st ON st.id = p_student_id
  WHERE sc.school_id = st.school_id AND sc.student_id = p_student_id
    AND a.school_id = st.school_id AND s.school_id = st.school_id
  GROUP BY s.id, s.name
  ORDER BY AVG(sc.score) ASC;
$$;

REVOKE ALL ON FUNCTION public.student_learning_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_learning_summary(uuid) TO authenticated;
