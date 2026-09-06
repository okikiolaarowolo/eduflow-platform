-- EduFlow AI: database-level tenant integrity guards.
-- RLS protects reads/writes, while these triggers prevent a row in school A
-- from referencing an academic object belonging to school B.

CREATE OR REPLACE FUNCTION public.enforce_same_school_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref record;
  v_ref_id uuid;
  v_ref_school uuid;
  v_new_school uuid;
BEGIN
  v_new_school := (to_jsonb(NEW)->>'school_id')::uuid;

  IF v_new_school IS NULL THEN
    RETURN NEW;
  END IF;

  FOR ref IN
    SELECT * FROM (VALUES
      ('students','student_id'),
      ('teachers','teacher_id'),
      ('classes','class_id'),
      ('subjects','subject_id'),
      ('academic_sessions','session_id'),
      ('terms','term_id'),
      ('attendance_sessions','attendance_session_id'),
      ('assessments','assessment_id'),
      ('report_cards','report_card_id'),
      ('assignments','assignment_id'),
      ('assignment_submissions','assignment_id'),
      ('ai_conversations','conversation_id'),
      ('report_cards','student_id'),
      ('report_cards','class_id'),
      ('report_card_subjects','subject_id'),
      ('assessments','class_id'),
      ('assessments','subject_id'),
      ('assessments','session_id'),
      ('assessments','term_id'),
      ('attendance_sessions','class_id'),
      ('attendance_sessions','term_id'),
      ('attendance_records','student_id'),
      ('attendance_records','attendance_session_id'),
      ('assessment_scores','student_id'),
      ('assessment_scores','assessment_id'),
      ('enrollments','student_id'),
      ('enrollments','session_id'),
      ('enrollments','class_id'),
      ('student_parents','student_id'),
      ('student_parents','parent_id'),
      ('assignments','class_id'),
      ('assignments','subject_id'),
      ('assignments','teacher_id'),
      ('assignment_submissions','student_id'),
      ('learning_materials','teacher_id'),
      ('learning_materials','subject_id'),
      ('learning_materials','class_id'),
      ('timetable_entries','class_id'),
      ('timetable_entries','subject_id'),
      ('timetable_entries','teacher_id'),
      ('ai_conversations','context_subject_id'),
      ('ai_conversations','context_class_id'),
      ('ai_messages','conversation_id'),
      ('ai_study_plans','student_id'),
      ('ai_learning_insights','student_id'),
      ('ai_learning_insights','subject_id')
    ) AS mappings(table_name, column_name)
    WHERE mappings.table_name = TG_TABLE_NAME
  LOOP
    IF to_jsonb(NEW) ? ref.column_name THEN
      v_ref_id := NULLIF(to_jsonb(NEW)->>ref.column_name, '')::uuid;
      IF v_ref_id IS NULL THEN CONTINUE; END IF;

      EXECUTE format('SELECT school_id FROM public.%I WHERE id = $1', ref.table_name)
        INTO v_ref_school USING v_ref_id;

      IF v_ref_school IS NOT NULL AND v_ref_school <> v_new_school THEN
        RAISE EXCEPTION 'Tenant integrity violation: % cannot reference % from another school',
          ref.column_name, ref.table_name
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_same_school_references() FROM PUBLIC;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'enrollments','student_parents','attendance_sessions','attendance_records',
    'assessments','assessment_scores','report_cards','report_card_subjects',
    'assignments','assignment_submissions','learning_materials','timetable_entries',
    'ai_conversations','ai_messages','ai_study_plans','ai_learning_insights'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_school_integrity ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_school_integrity BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_same_school_references()',
      t, t
    );
  END LOOP;
END $$;
