-- Phase 1 security hardening: enrollments is a school-owned table.
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enrollments_select ON public.enrollments;
CREATE POLICY enrollments_select
ON public.enrollments FOR SELECT TO authenticated
USING (school_id = public.current_school_id());

DROP POLICY IF EXISTS enrollments_insert ON public.enrollments;
CREATE POLICY enrollments_insert
ON public.enrollments FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.current_school_id()
  AND (
    public.is_school_manager()
    OR public.has_role(auth.uid(), 'secretary'::public.app_role)
  )
);

DROP POLICY IF EXISTS enrollments_update ON public.enrollments;
CREATE POLICY enrollments_update
ON public.enrollments FOR UPDATE TO authenticated
USING (
  school_id = public.current_school_id()
  AND (
    public.is_school_manager()
    OR public.has_role(auth.uid(), 'secretary'::public.app_role)
  )
)
WITH CHECK (
  school_id = public.current_school_id()
  AND (
    public.is_school_manager()
    OR public.has_role(auth.uid(), 'secretary'::public.app_role)
  )
);

DROP POLICY IF EXISTS enrollments_delete ON public.enrollments;
CREATE POLICY enrollments_delete
ON public.enrollments FOR DELETE TO authenticated
USING (
  school_id = public.current_school_id()
  AND (
    public.is_school_manager()
    OR public.has_role(auth.uid(), 'secretary'::public.app_role)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
