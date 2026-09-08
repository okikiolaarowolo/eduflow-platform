-- =========================================================
-- EduFlow AI — Phase 2: School operations, attendance, finance
-- =========================================================

-- ---------- Helper functions ----------
CREATE OR REPLACE FUNCTION public.is_operations_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin','school_admin','principal','secretary')
  )
$$;

CREATE OR REPLACE FUNCTION public.current_teacher_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id FROM public.teachers t
  WHERE t.user_id = auth.uid() AND t.school_id = public.current_school_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.teaches_class(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teacher_classes tc
    JOIN public.teachers t ON t.id = tc.teacher_id
    WHERE tc.class_id = _class_id
      AND t.user_id = auth.uid()
      AND tc.school_id = public.current_school_id()
  )
$$;

REVOKE ALL ON FUNCTION public.is_operations_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_teacher_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teaches_class(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_operations_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_teacher_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches_class(uuid) TO authenticated;

-- ---------- Attendance ----------
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  term_id uuid REFERENCES public.terms(id) ON DELETE SET NULL,
  session_date date NOT NULL,
  period text NOT NULL DEFAULT 'Daily',
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(attendance_session_id, student_id)
);

-- ---------- Academics ----------
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
  created_at timestamptz NOT NULL DEFAULT now(),
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
  created_at timestamptz NOT NULL DEFAULT now(),
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

-- ---------- Communication ----------
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','staff','teachers','managers')),
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

-- ---------- AI workspace ----------
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

CREATE TABLE IF NOT EXISTS public.ai_learning_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  insight_type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  description text,
  summary text,
  severity text NOT NULL DEFAULT 'medium',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
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
  disclosure_text text NOT NULL DEFAULT 'AI-generated content may contain mistakes. Review important information.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Platform / audit ----------
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

INSERT INTO public.saas_plans (code, name, description, monthly_price, annual_price, max_students, max_teachers, ai_tokens_monthly, features)
VALUES
 ('starter','Starter','Core school management',0,0,250,30,25000,'{"attendance":true,"results":true,"communication":true}'::jsonb),
 ('growth','Growth','Full academic operations and AI',0,0,1000,100,150000,'{"attendance":true,"results":true,"communication":true,"ai":true,"analytics":true}'::jsonb),
 ('enterprise','Enterprise','Unlimited school platform',0,0,NULL,NULL,1000000,'{"all":true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- =========================================================
-- FINANCE
-- =========================================================
CREATE TABLE IF NOT EXISTS public.fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'NGN',
  session_id uuid REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  term_id uuid REFERENCES public.terms(id) ON DELETE SET NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  due_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_structure_id uuid REFERENCES public.fee_structures(id) ON DELETE SET NULL,
  title text NOT NULL,
  amount_due numeric(12,2) NOT NULL CHECK (amount_due >= 0),
  amount_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','waived')),
  due_date date,
  session_id uuid REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  term_id uuid REFERENCES public.terms(id) ON DELETE SET NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_fee_structure
  ON public.student_fees(student_id, fee_structure_id)
  WHERE fee_structure_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_fee_id uuid NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','bank_transfer','card','cheque','online','other')),
  reference text,
  receipt_number text NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_student_fees_school ON public.student_fees(school_id, status);
CREATE INDEX IF NOT EXISTS idx_student_fees_student ON public.student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_school ON public.fee_payments(school_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_fee_payments_fee ON public.fee_payments(student_fee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON public.attendance_sessions(school_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON public.attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_school ON public.audit_logs(school_id, created_at DESC);

-- Receipt number generation + tenant consistency
CREATE OR REPLACE FUNCTION public.fee_payment_before_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_school uuid; v_student uuid;
BEGIN
  SELECT school_id, student_id INTO v_school, v_student FROM public.student_fees WHERE id = NEW.student_fee_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'Unknown fee charge'; END IF;
  NEW.school_id := v_school;
  NEW.student_id := v_student;
  IF NEW.receipt_number IS NULL OR btrim(NEW.receipt_number) = '' THEN
    NEW.receipt_number := 'RCP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 6));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fee_payment_before_insert ON public.fee_payments;
CREATE TRIGGER trg_fee_payment_before_insert BEFORE INSERT ON public.fee_payments
FOR EACH ROW EXECUTE FUNCTION public.fee_payment_before_insert();

-- Keep balances/status in sync
CREATE OR REPLACE FUNCTION public.recalc_student_fee()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_fee uuid; v_paid numeric(12,2); v_due numeric(12,2); v_status text;
BEGIN
  v_fee := COALESCE(NEW.student_fee_id, OLD.student_fee_id);
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.fee_payments WHERE student_fee_id = v_fee;
  SELECT amount_due, status INTO v_due, v_status FROM public.student_fees WHERE id = v_fee;
  IF v_due IS NULL THEN RETURN NULL; END IF;
  UPDATE public.student_fees
  SET amount_paid = v_paid,
      status = CASE
        WHEN v_status = 'waived' THEN 'waived'
        WHEN v_paid >= v_due AND v_due > 0 THEN 'paid'
        WHEN v_paid > 0 THEN 'partial'
        ELSE 'unpaid' END,
      updated_at = now()
  WHERE id = v_fee;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_recalc_student_fee ON public.fee_payments;
CREATE TRIGGER trg_recalc_student_fee AFTER INSERT OR UPDATE OR DELETE ON public.fee_payments
FOR EACH ROW EXECUTE FUNCTION public.recalc_student_fee();

-- Finance audit trail
CREATE OR REPLACE FUNCTION public.audit_finance_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs(school_id, actor_id, action, entity, entity_id, before_data, after_data)
  VALUES (
    COALESCE(NEW.school_id, OLD.school_id),
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_audit_student_fees ON public.student_fees;
CREATE TRIGGER trg_audit_student_fees AFTER INSERT OR UPDATE OR DELETE ON public.student_fees
FOR EACH ROW EXECUTE FUNCTION public.audit_finance_change();

DROP TRIGGER IF EXISTS trg_audit_fee_payments ON public.fee_payments;
CREATE TRIGGER trg_audit_fee_payments AFTER INSERT OR UPDATE OR DELETE ON public.fee_payments
FOR EACH ROW EXECUTE FUNCTION public.audit_finance_change();

-- =========================================================
-- TEACHER TIME TRACKING
-- =========================================================
CREATE TABLE IF NOT EXISTS public.teacher_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  clock_in_at timestamptz NOT NULL DEFAULT now(),
  clock_out_at timestamptz,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present','late','absent','excused')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_attendance_valid_window CHECK (clock_out_at IS NULL OR clock_out_at >= clock_in_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_attendance_open
  ON public.teacher_attendance(teacher_id) WHERE clock_out_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_teacher_attendance_school_date
  ON public.teacher_attendance(school_id, work_date DESC);

CREATE OR REPLACE FUNCTION public.teacher_clock_in(_note text DEFAULT NULL)
RETURNS public.teacher_attendance LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_teacher uuid; v_school uuid; v_row public.teacher_attendance;
BEGIN
  v_school := public.current_school_id();
  SELECT id INTO v_teacher FROM public.teachers WHERE user_id = auth.uid() AND school_id = v_school AND is_active LIMIT 1;
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'No active teacher record linked to this account'; END IF;
  IF EXISTS (SELECT 1 FROM public.teacher_attendance WHERE teacher_id = v_teacher AND clock_out_at IS NULL) THEN
    RAISE EXCEPTION 'You are already clocked in';
  END IF;
  INSERT INTO public.teacher_attendance(school_id, teacher_id, work_date, clock_in_at, note)
  VALUES (v_school, v_teacher, CURRENT_DATE, now(), _note)
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.teacher_clock_out(_note text DEFAULT NULL)
RETURNS public.teacher_attendance LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_teacher uuid; v_school uuid; v_row public.teacher_attendance;
BEGIN
  v_school := public.current_school_id();
  SELECT id INTO v_teacher FROM public.teachers WHERE user_id = auth.uid() AND school_id = v_school LIMIT 1;
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'No teacher record linked to this account'; END IF;
  UPDATE public.teacher_attendance
  SET clock_out_at = now(), note = COALESCE(_note, note), updated_at = now()
  WHERE teacher_id = v_teacher AND clock_out_at IS NULL
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'You are not currently clocked in'; END IF;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.teacher_clock_in(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_clock_out(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_clock_in(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_clock_out(text) TO authenticated;

-- =========================================================
-- updated_at triggers
-- =========================================================
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance_sessions','attendance_records','assessments','assessment_scores','report_cards','assignments',
    'assignment_submissions','learning_materials','timetable_entries','announcements','ai_conversations',
    'ai_settings','school_subscriptions','fee_structures','student_fees','teacher_attendance'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t||'_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t||'_updated_at', t);
  END LOOP;
END $do$;

-- =========================================================
-- GRANTS
-- =========================================================
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance_sessions','attendance_records','assessments','assessment_scores','grade_scales','report_cards',
    'report_card_subjects','assignments','assignment_submissions','learning_materials','timetable_entries',
    'announcements','notifications','ai_conversations','ai_messages','ai_learning_insights','ai_usage','ai_settings',
    'saas_plans','school_subscriptions','audit_logs','fee_structures','student_fees','fee_payments','teacher_attendance'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $do$;

-- =========================================================
-- RLS
-- =========================================================
-- Generic school-scoped academic tables: members read, managers write.
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'assessments','assessment_scores','grade_scales','report_cards','report_card_subjects',
    'assignments','assignment_submissions','learning_materials','timetable_entries',
    'ai_learning_insights','ai_usage'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_manager_write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_manager_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_manager_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (school_id = public.current_school_id())', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager())', t||'_manager_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (school_id = public.current_school_id() AND public.is_school_manager()) WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager())', t||'_manager_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (school_id = public.current_school_id() AND public.is_school_manager())', t||'_manager_delete', t);
  END LOOP;
END $do$;

-- Attendance sessions: ops staff or the assigned teacher.
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_sessions_select ON public.attendance_sessions;
CREATE POLICY attendance_sessions_select ON public.attendance_sessions FOR SELECT TO authenticated
  USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS attendance_sessions_insert ON public.attendance_sessions;
CREATE POLICY attendance_sessions_insert ON public.attendance_sessions FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND (public.is_operations_staff() OR public.teaches_class(class_id)));
DROP POLICY IF EXISTS attendance_sessions_update ON public.attendance_sessions;
CREATE POLICY attendance_sessions_update ON public.attendance_sessions FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND (public.is_operations_staff() OR public.teaches_class(class_id)))
  WITH CHECK (school_id = public.current_school_id() AND (public.is_operations_staff() OR public.teaches_class(class_id)));
DROP POLICY IF EXISTS attendance_sessions_delete ON public.attendance_sessions;
CREATE POLICY attendance_sessions_delete ON public.attendance_sessions FOR DELETE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_operations_staff());

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_records_select ON public.attendance_records;
CREATE POLICY attendance_records_select ON public.attendance_records FOR SELECT TO authenticated
  USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS attendance_records_insert ON public.attendance_records;
CREATE POLICY attendance_records_insert ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.id = attendance_session_id AND s.school_id = public.current_school_id()
        AND (public.is_operations_staff() OR public.teaches_class(s.class_id))
    )
  );
DROP POLICY IF EXISTS attendance_records_update ON public.attendance_records;
CREATE POLICY attendance_records_update ON public.attendance_records FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id()
    AND EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.id = attendance_session_id AND (public.is_operations_staff() OR public.teaches_class(s.class_id))
    )
  )
  WITH CHECK (
    school_id = public.current_school_id()
    AND EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.id = attendance_session_id AND (public.is_operations_staff() OR public.teaches_class(s.class_id))
    )
  );
DROP POLICY IF EXISTS attendance_records_delete ON public.attendance_records;
CREATE POLICY attendance_records_delete ON public.attendance_records FOR DELETE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_operations_staff());

-- Announcements: everyone in school reads, ops staff write.
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcements_select ON public.announcements;
CREATE POLICY announcements_select ON public.announcements FOR SELECT TO authenticated
  USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS announcements_write ON public.announcements;
CREATE POLICY announcements_write ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND public.is_operations_staff());
DROP POLICY IF EXISTS announcements_update ON public.announcements;
CREATE POLICY announcements_update ON public.announcements FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_operations_staff())
  WITH CHECK (school_id = public.current_school_id() AND public.is_operations_staff());
DROP POLICY IF EXISTS announcements_delete ON public.announcements;
CREATE POLICY announcements_delete ON public.announcements FOR DELETE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_operations_staff());

-- Notifications: own rows only; ops staff may create for their school.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (school_id = public.current_school_id() AND public.is_operations_staff()));

-- AI workspace
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_conversations_own ON public.ai_conversations;
CREATE POLICY ai_conversations_own ON public.ai_conversations FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid())
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_messages_own ON public.ai_messages;
CREATE POLICY ai_messages_own ON public.ai_messages FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND user_id = auth.uid())
  WITH CHECK (school_id = public.current_school_id() AND user_id = auth.uid());

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_settings_select ON public.ai_settings;
CREATE POLICY ai_settings_select ON public.ai_settings FOR SELECT TO authenticated
  USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS ai_settings_manager ON public.ai_settings;
CREATE POLICY ai_settings_manager ON public.ai_settings FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_plans_select ON public.saas_plans;
CREATE POLICY saas_plans_select ON public.saas_plans FOR SELECT TO authenticated USING (active = true);

ALTER TABLE public.school_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS school_subscriptions_select ON public.school_subscriptions;
CREATE POLICY school_subscriptions_select ON public.school_subscriptions FOR SELECT TO authenticated
  USING (school_id = public.current_school_id() OR public.has_role(auth.uid(),'super_admin'));
DROP POLICY IF EXISTS school_subscriptions_manager ON public.school_subscriptions;
CREATE POLICY school_subscriptions_manager ON public.school_subscriptions FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING (school_id = public.current_school_id() AND public.is_operations_staff());
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND actor_id = auth.uid());

-- Finance: operations staff only (teachers excluded entirely).
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fee_structures_all ON public.fee_structures;
CREATE POLICY fee_structures_all ON public.fee_structures FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_operations_staff())
  WITH CHECK (school_id = public.current_school_id() AND public.is_operations_staff());

ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_fees_all ON public.student_fees;
CREATE POLICY student_fees_all ON public.student_fees FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.is_operations_staff())
  WITH CHECK (school_id = public.current_school_id() AND public.is_operations_staff());

ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fee_payments_select ON public.fee_payments;
CREATE POLICY fee_payments_select ON public.fee_payments FOR SELECT TO authenticated
  USING (school_id = public.current_school_id() AND public.is_operations_staff());
DROP POLICY IF EXISTS fee_payments_insert ON public.fee_payments;
CREATE POLICY fee_payments_insert ON public.fee_payments FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND public.is_operations_staff() AND recorded_by = auth.uid());
DROP POLICY IF EXISTS fee_payments_update ON public.fee_payments;
CREATE POLICY fee_payments_update ON public.fee_payments FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager())
  WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager());
DROP POLICY IF EXISTS fee_payments_delete ON public.fee_payments;
CREATE POLICY fee_payments_delete ON public.fee_payments FOR DELETE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager());

-- Teacher attendance: self-service via RPC, staff oversight.
ALTER TABLE public.teacher_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teacher_attendance_select ON public.teacher_attendance;
CREATE POLICY teacher_attendance_select ON public.teacher_attendance FOR SELECT TO authenticated
  USING (
    school_id = public.current_school_id()
    AND (public.is_operations_staff() OR teacher_id = public.current_teacher_id())
  );
DROP POLICY IF EXISTS teacher_attendance_manage ON public.teacher_attendance;
CREATE POLICY teacher_attendance_manage ON public.teacher_attendance FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_operations_staff())
  WITH CHECK (school_id = public.current_school_id() AND public.is_operations_staff());
DROP POLICY IF EXISTS teacher_attendance_delete ON public.teacher_attendance;
CREATE POLICY teacher_attendance_delete ON public.teacher_attendance FOR DELETE TO authenticated
  USING (school_id = public.current_school_id() AND public.is_school_manager());