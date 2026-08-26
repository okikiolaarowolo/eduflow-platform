
CREATE TYPE public.app_role AS ENUM ('super_admin','school_admin','principal','teacher','student','parent');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- SCHOOLS
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  email text,
  phone text,
  address text,
  website text,
  logo_url text,
  is_demo boolean NOT NULL DEFAULT false,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_school ON public.profiles(school_id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, school_id)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);

-- HELPERS
CREATE OR REPLACE FUNCTION public.current_school_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_school_manager() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin','school_admin','principal')
  )
$$;

-- ACADEMIC SESSIONS / TERMS
CREATE TABLE public.academic_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date,
  end_date date,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE TABLE public.terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date,
  end_date date,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, name)
);
CREATE INDEX idx_terms_school ON public.terms(school_id);

-- CLASSES / SUBJECTS
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  level text,
  section text,
  capacity integer,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  description text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

-- TEACHERS
CREATE TABLE public.teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid,
  first_name text NOT NULL,
  last_name text NOT NULL,
  staff_id text NOT NULL,
  email text,
  phone text,
  qualification text,
  photo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, staff_id)
);

-- STUDENTS
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid,
  first_name text NOT NULL,
  last_name text NOT NULL,
  student_id text NOT NULL,
  email text,
  phone text,
  date_of_birth date,
  gender text,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  admission_date date DEFAULT now(),
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  photo_url text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, student_id)
);
CREATE INDEX idx_students_class ON public.students(class_id);
CREATE INDEX idx_students_school ON public.students(school_id);

-- LINK TABLES
CREATE TABLE public.teacher_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  is_class_teacher boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_id)
);

CREATE TABLE public.teacher_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, subject_id)
);

CREATE TABLE public.class_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject_id)
);

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_name text,
  action text NOT NULL,
  entity text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_school_created ON public.activity_log(school_id, created_at DESC);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools, public.profiles, public.user_roles,
  public.academic_sessions, public.terms, public.classes, public.subjects, public.teachers,
  public.students, public.teacher_classes, public.teacher_subjects, public.class_subjects,
  public.activity_log TO authenticated;
GRANT ALL ON public.schools, public.profiles, public.user_roles, public.academic_sessions,
  public.terms, public.classes, public.subjects, public.teachers, public.students,
  public.teacher_classes, public.teacher_subjects, public.class_subjects,
  public.activity_log TO service_role;

-- RLS
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- schools
CREATE POLICY schools_select ON public.schools FOR SELECT TO authenticated
  USING (id = public.current_school_id() OR created_by = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY schools_insert ON public.schools FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND is_demo = false);
CREATE POLICY schools_update ON public.schools FOR UPDATE TO authenticated
  USING ((id = public.current_school_id() AND public.is_school_manager()) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK ((id = public.current_school_id() AND public.is_school_manager()) OR public.has_role(auth.uid(),'super_admin'));

-- profiles
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR (school_id IS NOT NULL AND school_id = public.current_school_id()));
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- user_roles
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (school_id IS NOT NULL AND school_id = public.current_school_id()));
CREATE POLICY user_roles_insert ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (role <> 'super_admin' AND (user_id = auth.uid() OR (school_id = public.current_school_id() AND public.is_school_manager())));
CREATE POLICY user_roles_delete ON public.user_roles FOR DELETE TO authenticated
  USING (role <> 'super_admin' AND school_id = public.current_school_id() AND public.is_school_manager());

-- tenant tables: readable by school members, writable by managers
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['academic_sessions','terms','classes','subjects','teachers','students','teacher_classes','teacher_subjects','class_subjects'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (school_id = public.current_school_id())', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager())', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (school_id = public.current_school_id() AND public.is_school_manager()) WITH CHECK (school_id = public.current_school_id() AND public.is_school_manager())', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (school_id = public.current_school_id() AND public.is_school_manager())', t||'_delete', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t||'_updated_at', t);
  END LOOP;
END $do$;

CREATE TRIGGER schools_updated_at BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY activity_select ON public.activity_log FOR SELECT TO authenticated USING (school_id = public.current_school_id());
CREATE POLICY activity_insert ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_school_id() AND actor_id = auth.uid());

-- ============ DEMO DATA: Alliance High School ============
INSERT INTO public.schools (id, name, slug, email, phone, address, website, is_demo, onboarding_completed)
VALUES ('11111111-1111-4111-8111-111111111111','Alliance High School','alliance-high-school','info@alliancehigh.demo','+234 800 000 0000','12 Independence Way, Lagos','https://alliancehigh.demo', true, true);

INSERT INTO public.academic_sessions (id, school_id, name, start_date, end_date, is_current)
VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','2026/2027','2026-09-01','2027-07-31', true);

INSERT INTO public.terms (school_id, session_id, name, is_current) VALUES
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','First Term', true),
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Second Term', false),
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Third Term', false);

INSERT INTO public.classes (id, school_id, name, level, section, capacity) VALUES
 ('33333333-3333-4333-8333-000000000001','11111111-1111-4111-8111-111111111111','SS1A','SS1','A',40),
 ('33333333-3333-4333-8333-000000000002','11111111-1111-4111-8111-111111111111','SS1B','SS1','B',40),
 ('33333333-3333-4333-8333-000000000003','11111111-1111-4111-8111-111111111111','SS2A','SS2','A',40),
 ('33333333-3333-4333-8333-000000000004','11111111-1111-4111-8111-111111111111','SS2B','SS2','B',40),
 ('33333333-3333-4333-8333-000000000005','11111111-1111-4111-8111-111111111111','SS3A','SS3','A',35);

INSERT INTO public.subjects (id, school_id, name, code) VALUES
 ('44444444-4444-4444-8444-000000000001','11111111-1111-4111-8111-111111111111','Mathematics','MTH'),
 ('44444444-4444-4444-8444-000000000002','11111111-1111-4111-8111-111111111111','English Language','ENG'),
 ('44444444-4444-4444-8444-000000000003','11111111-1111-4111-8111-111111111111','Physics','PHY'),
 ('44444444-4444-4444-8444-000000000004','11111111-1111-4111-8111-111111111111','Chemistry','CHM'),
 ('44444444-4444-4444-8444-000000000005','11111111-1111-4111-8111-111111111111','Biology','BIO');

INSERT INTO public.teachers (id, school_id, first_name, last_name, staff_id, email, phone, qualification) VALUES
 ('55555555-5555-4555-8555-000000000001','11111111-1111-4111-8111-111111111111','Grace','Adeyemi','STF-001','grace.adeyemi@alliancehigh.demo','+234 801 111 1111','B.Sc Mathematics'),
 ('55555555-5555-4555-8555-000000000002','11111111-1111-4111-8111-111111111111','Daniel','Okoro','STF-002','daniel.okoro@alliancehigh.demo','+234 802 222 2222','B.A English'),
 ('55555555-5555-4555-8555-000000000003','11111111-1111-4111-8111-111111111111','Amina','Bello','STF-003','amina.bello@alliancehigh.demo','+234 803 333 3333','M.Sc Physics');

INSERT INTO public.teacher_subjects (school_id, teacher_id, subject_id) VALUES
 ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-000000000001','44444444-4444-4444-8444-000000000001'),
 ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-000000000002','44444444-4444-4444-8444-000000000002'),
 ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-000000000003','44444444-4444-4444-8444-000000000003');

INSERT INTO public.teacher_classes (school_id, teacher_id, class_id, is_class_teacher) VALUES
 ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-000000000001','33333333-3333-4333-8333-000000000001', true),
 ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-000000000002','33333333-3333-4333-8333-000000000002', true),
 ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-000000000003','33333333-3333-4333-8333-000000000003', true);

INSERT INTO public.class_subjects (school_id, class_id, subject_id)
SELECT '11111111-1111-4111-8111-111111111111', c.id, s.id
FROM public.classes c CROSS JOIN public.subjects s
WHERE c.school_id = '11111111-1111-4111-8111-111111111111' AND s.school_id = '11111111-1111-4111-8111-111111111111';

INSERT INTO public.students (school_id, first_name, last_name, student_id, email, gender, date_of_birth, class_id, admission_date, guardian_name, guardian_phone) VALUES
 ('11111111-1111-4111-8111-111111111111','Chidi','Nwosu','ALH/2026/001','chidi.nwosu@alliancehigh.demo','Male','2010-04-12','33333333-3333-4333-8333-000000000001','2026-09-05','Mr. Emeka Nwosu','+234 805 000 0001'),
 ('11111111-1111-4111-8111-111111111111','Fatima','Yusuf','ALH/2026/002','fatima.yusuf@alliancehigh.demo','Female','2010-08-30','33333333-3333-4333-8333-000000000001','2026-09-05','Mrs. Halima Yusuf','+234 805 000 0002'),
 ('11111111-1111-4111-8111-111111111111','Tunde','Balogun','ALH/2026/003','tunde.balogun@alliancehigh.demo','Male','2009-12-02','33333333-3333-4333-8333-000000000003','2025-09-08','Mr. Segun Balogun','+234 805 000 0003'),
 ('11111111-1111-4111-8111-111111111111','Ngozi','Eze','ALH/2026/004','ngozi.eze@alliancehigh.demo','Female','2009-06-19','33333333-3333-4333-8333-000000000004','2025-09-08','Mrs. Ada Eze','+234 805 000 0004'),
 ('11111111-1111-4111-8111-111111111111','Samuel','Ojo','ALH/2026/005','samuel.ojo@alliancehigh.demo','Male','2008-11-23','33333333-3333-4333-8333-000000000005','2024-09-09','Mr. Peter Ojo','+234 805 000 0005');
