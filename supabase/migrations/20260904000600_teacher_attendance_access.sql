-- Allow assigned teachers to mark attendance for their classes.
DROP POLICY IF EXISTS attendance_sessions_teacher_insert ON public.attendance_sessions;
CREATE POLICY attendance_sessions_teacher_insert ON public.attendance_sessions FOR INSERT TO authenticated WITH CHECK (
 school_id = public.current_school_id() AND marked_by = auth.uid() AND class_id IN (
  SELECT tc.class_id FROM public.teacher_classes tc JOIN public.teachers t ON t.id=tc.teacher_id
  WHERE t.user_id=auth.uid() AND t.school_id=public.current_school_id()
 )
);
DROP POLICY IF EXISTS attendance_records_teacher_insert ON public.attendance_records;
CREATE POLICY attendance_records_teacher_insert ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (
 school_id=public.current_school_id() AND attendance_session_id IN (
  SELECT a.id FROM public.attendance_sessions a WHERE a.marked_by=auth.uid() AND a.school_id=public.current_school_id()
 )
);
DROP POLICY IF EXISTS attendance_records_teacher_update ON public.attendance_records;
CREATE POLICY attendance_records_teacher_update ON public.attendance_records FOR UPDATE TO authenticated
USING (school_id=public.current_school_id() AND attendance_session_id IN (SELECT id FROM public.attendance_sessions WHERE marked_by=auth.uid()))
WITH CHECK (school_id=public.current_school_id());
