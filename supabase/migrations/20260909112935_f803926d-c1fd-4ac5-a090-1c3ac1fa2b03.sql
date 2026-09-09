ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'draft';
DO $$ BEGIN
  ALTER TABLE public.assessments ADD CONSTRAINT assessments_workflow_status_check CHECK (workflow_status IN ('draft','review','approved','published'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.publish_staff_announcement(p_title text, p_body text, p_audience text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_school uuid; v_id uuid; v_roles app_role[];
BEGIN
  IF NOT public.is_operations_staff() THEN RAISE EXCEPTION 'Not authorized to publish announcements'; END IF;
  v_school := public.current_school_id();
  IF v_school IS NULL THEN RAISE EXCEPTION 'No school linked to this account'; END IF;
  IF coalesce(btrim(p_title),'') = '' OR coalesce(btrim(p_body),'') = '' THEN RAISE EXCEPTION 'Title and message are required'; END IF;

  INSERT INTO public.announcements(school_id, title, body, audience, published, published_at, created_by)
  VALUES (v_school, btrim(p_title), btrim(p_body), p_audience, true, now(), auth.uid())
  RETURNING id INTO v_id;

  v_roles := CASE p_audience
    WHEN 'teachers' THEN ARRAY['teacher']::app_role[]
    WHEN 'secretaries' THEN ARRAY['secretary']::app_role[]
    WHEN 'managers' THEN ARRAY['school_admin','principal']::app_role[]
    ELSE ARRAY['school_admin','principal','secretary','teacher']::app_role[]
  END;

  INSERT INTO public.notifications(school_id, user_id, title, body, type, action_url)
  SELECT v_school, p.id, btrim(p_title), btrim(p_body), 'announcement', '/communication'
  FROM public.profiles p
  WHERE p.school_id = v_school
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = ANY(v_roles));

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.publish_staff_announcement(text, text, text) TO authenticated;