-- EduFlow academic subject structure: JSS/SS departments and teacher teaching profiles.
-- This keeps the catalog school-specific while giving each school a clear curriculum hierarchy.

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS school_level text NOT NULL DEFAULT 'both';

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS department text;

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS teaching_level text NOT NULL DEFAULT 'both';

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS department text;

UPDATE public.subjects
SET school_level = COALESCE(NULLIF(school_level, ''), 'both')
WHERE school_level IS NULL OR school_level = '';

UPDATE public.teachers
SET teaching_level = COALESCE(NULLIF(teaching_level, ''), 'both')
WHERE teaching_level IS NULL OR teaching_level = '';

ALTER TABLE public.subjects
  DROP CONSTRAINT IF EXISTS subjects_school_level_check;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_school_level_check
  CHECK (school_level IN ('junior_secondary','senior_secondary','both'));

ALTER TABLE public.subjects
  DROP CONSTRAINT IF EXISTS subjects_department_check;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_department_check
  CHECK (
    department IS NULL
    OR department IN ('science','humanities','business')
  );

ALTER TABLE public.subjects
  DROP CONSTRAINT IF EXISTS subjects_department_level_check;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_department_level_check
  CHECK (
    school_level <> 'junior_secondary'
    OR department IS NULL
  );

ALTER TABLE public.teachers
  DROP CONSTRAINT IF EXISTS teachers_teaching_level_check;
ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_teaching_level_check
  CHECK (teaching_level IN ('junior_secondary','senior_secondary','both'));

ALTER TABLE public.teachers
  DROP CONSTRAINT IF EXISTS teachers_department_check;
ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_department_check
  CHECK (
    department IS NULL
    OR department IN ('science','humanities','business')
  );

ALTER TABLE public.teachers
  DROP CONSTRAINT IF EXISTS teachers_department_level_check;
ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_department_level_check
  CHECK (
    teaching_level <> 'junior_secondary'
    OR department IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_subjects_school_level_department
  ON public.subjects(school_id, school_level, department, name);

CREATE INDEX IF NOT EXISTS idx_teachers_teaching_profile
  ON public.teachers(school_id, teaching_level, department);

-- Existing subjects remain available to every level until the school administrator
-- explicitly categorizes them. This is important for existing schools during rollout.
