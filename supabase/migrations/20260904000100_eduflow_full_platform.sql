-- EduFlow AI full platform expansion
-- Adds school operations, academics, communication, AI, SaaS billing architecture and auditability.

CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','withdrawn','transferred')),
  enrolled_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, session_id)
);

CREATE TABLE IF NOT EXISTS public.parent_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid,
  full_name text NOT NULL,
  email text,
  phone text,
  occupation text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_parents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.parent_profiles(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'Guardian',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, parent_id)
);

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  term_id uuid REFERENCES public.terms(id) ON DELETE SET NULL,
  session_date date NOT NULL,
  period text NOT NULL DEFAULT 'Daily',
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(class_id, session_date, period)
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  attendance_session_id uuid NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('present','absent','late','excused')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(attendance_session_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  assessment_type text NOT NULL DEFAULT 'Test',
  max_score numeric(8,2) NOT NULL DEFAULT 100 CHECK (max_score > 0),
  weight numeric(8,2) NOT NULL DEFAULT 100 CHECK (weight >= 0),
  due_date date,
  published boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assessment_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  score numeric(8,2) NOT NULL DEFAULT 0 CHECK (score >= 0),
  grade text,
  remark text,
  submitted_at timestamptz,
  graded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assessment_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.grade_scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default',
  min_score numeric(5,2) NOT NULL,
  max_score numeric(5,2) NOT NULL,
  grade text NOT NULL,
  remark text,
  points numeric(5,2),
  UNIQUE(school_id, name, grade)
);

CREATE TABLE IF NOT EXISTS public.report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  total_score numeric(10,2) DEFAULT 0,
  average_score numeric(8,2) DEFAULT 0,
  position integer,
  attendance_present integer DEFAULT 0,
  attendance_absent integer DEFAULT 0,
  teacher_remark text,
  principal_remark text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, session_id, term_id)
);

CREATE TABLE IF NOT EXISTS public.report_card_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  report_card_id uuid NOT NULL REFERENCES public.report_cards(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  ca_score numeric(8,2) DEFAULT 0,
  exam_score numeric(8,2) DEFAULT 0,
  total_score numeric(8,2) DEFAULT 0,
  grade text,
  remark text,
  UNIQUE(report_card_id, subject_id)
);

CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  instructions text,
  due_at timestamptz,
  max_score numeric(8,2),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  content text,
  attachment_url text,
  submitted_at timestamptz,
  score numeric(8,2),
  feedback text,
  graded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.learning_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  material_type text NOT NULL DEFAULT 'document',
  file_url text,
  external_url text,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.timetable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  room text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','students','teachers','parents','staff')),
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'system',
  action_url text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New conversation',
  context_subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  context_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'tutor',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  tokens_used integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  title text NOT NULL,
  goal text,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_learning_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  insight_type text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  feature text NOT NULL,
  model text,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  estimated_cost numeric(12,6) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  student_tutor_enabled boolean NOT NULL DEFAULT true,
  teacher_assistant_enabled boolean NOT NULL DEFAULT true,
  monthly_token_limit integer NOT NULL DEFAULT 100000,
  disclosure_text text NOT NULL DEFAULT 'AI-generated content may contain mistakes. Review important information.'
);

CREATE TABLE IF NOT EXISTS public.saas_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  monthly_price numeric(12,2) NOT NULL DEFAULT 0,
  annual_price numeric(12,2) NOT NULL DEFAULT 0,
  max_students integer,
  max_teachers integer,
  ai_tokens_monthly integer,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid UNIQUE NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.saas_plans(id),
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','past_due','cancelled','expired')),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  metric text NOT NULL,
  period_start date NOT NULL,
  quantity bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, metric, period_start)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrollments_school ON public.enrollments(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON public.attendance_sessions(school_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_assessments_class_term ON public.assessments(class_id, term_id);
CREATE INDEX IF NOT EXISTS idx_scores_student ON public.assessment_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON public.assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON public.ai_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_school ON public.ai_usage(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_school ON public.audit_logs(school_id, created_at DESC);

-- Default SaaS plans are safe seed configuration, not customer data.
INSERT INTO public.saas_plans (code, name, description, monthly_price, annual_price, max_students, max_teachers, ai_tokens_monthly, features)
VALUES
 ('starter','Starter','Core school management',0,0,250,30,25000,'{"attendance":true,"results":true,"communication":true}'::jsonb),
 ('growth','Growth','Full academic operations and AI',0,0,1000,100,150000,'{"attendance":true,"results":true,"communication":true,"ai":true,"analytics":true}'::jsonb),
 ('enterprise','Enterprise','Unlimited school platform',0,0,NULL,NULL,1000000,'{"all":true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- updated_at triggers
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'enrollments','parent_profiles','assessments','assessment_scores','report_cards','assignments',
    'assignment_submissions','learning_materials','timetable_entries','announcements','ai_conversations',
    'ai_study_plans','ai_settings','school_subscriptions','usage_counters'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t||'_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t||'_updated_at', t);
  END LOOP;
END $do$;

-- RLS helper: school members may read; managers and assigned teachers may write academic records.
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'enrollments','parent_profiles','student_parents','attendance_sessions','attendance_records',
    'assessments','assessment_scores','grade_scales','report_cards','report_card_subjects',
    'assignments','assignment_submissions','learning_materials','timetable_entries','announcements',
    'ai_conversations','ai_messages','ai_study_plans','ai_learning_insights','ai_usage'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_manager_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (school_id = public.current_school_id())', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager())', t||'_manager_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (school_id = public.current_school_id() AND public.is_school_manager()) WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager())', t||'_manager_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (school_id = public.current_school_id() AND public.is_school_manager())', t||'_manager_delete', t);
  END LOOP;
END $do$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR (school_id = public.current_school_id() AND public.is_school_manager()));

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_settings_select ON public.ai_settings FOR SELECT TO authenticated USING (school_id = public.current_school_id());
CREATE POLICY ai_settings_manager ON public.ai_settings FOR ALL TO authenticated USING (school_id = public.current_school_id() AND public.is_school_manager()) WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_plans_select ON public.saas_plans FOR SELECT TO authenticated USING (active = true);

ALTER TABLE public.school_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_subscriptions_select ON public.school_subscriptions FOR SELECT TO authenticated USING (school_id = public.current_school_id() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY school_subscriptions_manager ON public.school_subscriptions FOR UPDATE TO authenticated USING (school_id = public.current_school_id() AND public.is_school_manager()) WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_counters_select ON public.usage_counters FOR SELECT TO authenticated USING (school_id = public.current_school_id());
CREATE POLICY usage_counters_manager ON public.usage_counters FOR ALL TO authenticated USING (school_id = public.current_school_id() AND public.is_school_manager()) WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (school_id = public.current_school_id() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (school_id = public.current_school_id() AND actor_id = auth.uid());

-- Helpful RPC for atomic counter increments; only authenticated users can increment their own school's counters.
CREATE OR REPLACE FUNCTION public.increment_usage(_metric text, _quantity bigint DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid := public.current_school_id();
BEGIN
  IF sid IS NULL THEN RAISE EXCEPTION 'No school context'; END IF;
  INSERT INTO public.usage_counters(school_id, metric, period_start, quantity)
  VALUES(sid, _metric, date_trunc('month', CURRENT_DATE)::date, GREATEST(_quantity,0))
  ON CONFLICT(school_id, metric, period_start)
  DO UPDATE SET quantity = usage_counters.quantity + GREATEST(_quantity,0), updated_at = now();
END; $$;

REVOKE ALL ON FUNCTION public.increment_usage(text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_usage(text,bigint) TO authenticated;
