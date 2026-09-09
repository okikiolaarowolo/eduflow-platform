-- Phase 3: Academic Management & Results
-- Adds assessment workflows, assignment-based teacher access, grading, report-card review/approval,
-- learning materials, assignments, and timetable conflict protection.

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  session_id uuid not null references public.academic_sessions(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  assessment_type text not null default 'CA' check (assessment_type in ('CA','Exam','Test','Quiz','Assignment','Project')),
  max_score numeric(8,2) not null default 100 check (max_score > 0),
  weight numeric(8,2) not null default 100 check (weight >= 0),
  due_date date,
  workflow_status text not null default 'draft' check (workflow_status in ('draft','review','approved','published')),
  published boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assessments add column if not exists workflow_status text not null default 'draft';
alter table public.assessments drop constraint if exists assessments_workflow_status_check;
alter table public.assessments add constraint assessments_workflow_status_check check (workflow_status in ('draft','review','approved','published'));

create table if not exists public.assessment_scores (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score numeric(8,2) not null default 0 check (score >= 0),
  grade text,
  remark text,
  submitted_at timestamptz,
  graded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assessment_id, student_id)
);

create table if not exists public.grade_scales (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null default 'Default',
  min_score numeric(5,2) not null check (min_score >= 0),
  max_score numeric(5,2) not null check (max_score <= 100 and max_score >= min_score),
  grade text not null,
  remark text,
  points numeric(5,2),
  unique(school_id,name,grade)
);

create table if not exists public.report_cards (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  session_id uuid not null references public.academic_sessions(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  total_score numeric(10,2) not null default 0,
  average_score numeric(8,2) not null default 0,
  position integer,
  attendance_present integer not null default 0,
  attendance_absent integer not null default 0,
  teacher_remark text,
  principal_remark text,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id,session_id,term_id)
);

alter table public.report_cards drop constraint if exists report_cards_status_check;
alter table public.report_cards add constraint report_cards_status_check check (status in ('draft','review','approved','published'));

create table if not exists public.report_card_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  report_card_id uuid not null references public.report_cards(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  ca_score numeric(8,2) not null default 0,
  exam_score numeric(8,2) not null default 0,
  total_score numeric(8,2) not null default 0,
  grade text,
  remark text,
  unique(report_card_id,subject_id)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  description text,
  instructions text,
  due_at timestamptz,
  max_score numeric(8,2),
  status text not null default 'draft' check (status in ('draft','published','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  content text,
  attachment_url text,
  submitted_at timestamptz,
  score numeric(8,2),
  feedback text,
  graded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestz not null default now(),
  unique(assignment_id,student_id)
);

create table if not exists public.learning_materials (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  title text not null,
  description text,
  material_type text not null default 'document',
  file_url text,
  external_url text,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  day_of_week integer not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  room text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

-- Assignment-aware access helper. A teacher must be linked to both the class and subject.
create or replace function public.teacher_has_assignment(p_class_id uuid, p_subject_id uuid)
returns boolean language sql security definer set search_path=public stable as $$
  select exists (
    select 1 from public.teachers t
    join public.teacher_classes tc on tc.teacher_id=t.id and tc.school_id=t.school_id
    join public.teacher_subjects ts on ts.teacher_id=t.id and ts.school_id=t.school_id
    where t.user_id=auth.uid() and t.is_active and t.school_id=current_school_id()
      and tc.class_id=p_class_id and ts.subject_id=p_subject_id
  );
$$;

-- Teacher attendance/result workspaces can use this helper without exposing tenant data.
revoke execute on function public.teacher_has_assignment(uuid,uuid) from anon;
grant execute on function public.teacher_has_assignment(uuid,uuid) to authenticated;

-- Grade lookup uses the school's configured scale; default Nigerian-style A1-F9 is seeded lazily.
create or replace function public.grade_for_percentage(p_school_id uuid, p_percentage numeric)
returns text language plpgsql security definer set search_path=public stable as $$
declare g text;
begin
  select grade into g from public.grade_scales
   where school_id=p_school_id and name='Default'
     and p_percentage between min_score and max_score
   order by min_score desc limit 1;
  return coalesce(g, case when p_percentage>=80 then 'A1' when p_percentage>=75 then 'B2' when p_percentage>=70 then 'B3' when p_percentage>=65 then 'C4' when p_percentage>=60 then 'C5' when p_percentage>=55 then 'C6' when p_percentage>=50 then 'D7' when p_percentage>=45 then 'E8' else 'F9' end);
end; $$;
revoke execute on function public.grade_for_percentage(uuid,numeric) from anon;
grant execute on function public.grade_for_percentage(uuid,numeric) to authenticated;

insert into public.grade_scales(school_id,name,min_score,max_score,grade,remark,points)
select s.id,'Default',v.min_score,v.max_score,v.grade,v.remark,v.points
from public.schools s cross join (values
 (80::numeric,100::numeric,'A1','Excellent',1::numeric),(75::numeric,79.99::numeric,'B2','Very good',2::numeric),(70::numeric,74.99::numeric,'B3','Good',3::numeric),(65::numeric,69.99::numeric,'C4','Credit',4::numeric),(60::numeric,64.99::numeric,'C5','Credit',5::numeric),(55::numeric,59.99::numeric,'C6','Credit',6::numeric),(50::numeric,54.99::numeric,'D7','Pass',7::numeric),(45::numeric,49.99::numeric,'E8','Pass',8::numeric),(0::numeric,44.99::numeric,'F9','Fail',9::numeric)
) v(min_score,max_score,grade,remark,points)
where not exists(select 1 from public.grade_scales gs where gs.school_id=s.id and gs.name='Default');

-- Prevent cross-tenant and invalid score writes at the database boundary.
create or replace function public.validate_academic_row_tenant() returns trigger language plpgsql as $$
begin
  if new.school_id is distinct from current_school_id() then raise exception 'School boundary violation'; end if;
  return new;
end; $$;

create or replace function public.validate_assessment_score() returns trigger language plpgsql security definer set search_path=public as $$
declare max numeric; sid uuid; cid uuid; subid uuid; status text;
begin
  select a.max_score,a.school_id,a.class_id,a.subject_id,a.workflow_status into max,sid,cid,subid,status from public.assessments a where a.id=new.assessment_id;
  if sid is null or sid <> current_school_id() then raise exception 'Assessment school mismatch'; end if;
  if new.school_id <> sid then raise exception 'Score school mismatch'; end if;
  if new.score > max then raise exception 'Score cannot exceed assessment maximum'; end if;
  if status='published' and not is_school_manager() then raise exception 'Published assessment is locked'; end if;
  if not (is_school_manager() or teacher_has_assignment(cid,subid)) then raise exception 'Teacher is not assigned to this class and subject'; end if;
  new.updated_at=now();
  return new;
end; $$;

-- RLS policies
alter table public.assessments enable row level security;
alter table public.assessment_scores enable row level security;
alter table public.grade_scales enable row level security;
alter table public.report_cards enable row level security;
alter table public.report_card_subjects enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.learning_materials enable row level security;
alter table public.timetable_entries enable row level security;

drop policy if exists assessments_select on public.assessments;
drop policy if exists assessments_write on public.assessments;
create policy assessments_select on public.assessments for select using (school_id=current_school_id() and (is_school_manager() or teacher_has_assignment(class_id,subject_id)));
create policy assessments_write on public.assessments for all using (school_id=current_school_id() and (is_school_manager() or teacher_has_assignment(class_id,subject_id))) with check (school_id=current_school_id() and (is_school_manager() or teacher_has_assignment(class_id,subject_id)));

drop policy if exists assessment_scores_select on public.assessment_scores;
drop policy if exists assessment_scores_write on public.assessment_scores;
create policy assessment_scores_select on public.assessment_scores for select using (school_id=current_school_id());
create policy assessment_scores_write on public.assessment_scores for all using (school_id=current_school_id() and (is_school_manager() or exists(select 1 from public.assessments a where a.id=assessment_id and teacher_has_assignment(a.class_id,a.subject_id)))) with check (school_id=current_school_id());

drop policy if exists grade_scales_select on public.grade_scales;
drop policy if exists grade_scales_write on public.grade_scales;
create policy grade_scales_select on public.grade_scales for select using (school_id=current_school_id());
create policy grade_scales_write on public.grade_scales for all using (school_id=current_school_id() and is_school_manager()) with check (school_id=current_school_id() and is_school_manager());

-- Managers own the report-card workflow; staff can read only what their school exposes.
drop policy if exists report_cards_select on public.report_cards;
drop policy if exists report_cards_write on public.report_cards;
create policy report_cards_select on public.report_cards for select using (school_id=current_school_id());
create policy report_cards_write on public.report_cards for all using (school_id=current_school_id() and is_school_manager()) with check (school_id=current_school_id() and is_school_manager());

drop policy if exists report_card_subjects_select on public.report_card_subjects;
drop policy if exists report_card_subjects_write on public.report_card_subjects;
create policy report_card_subjects_select on public.report_card_subjects for select using (school_id=current_school_id());
create policy report_card_subjects_write on public.report_card_subjects for all using (school_id=current_school_id() and is_school_manager()) with check (school_id=current_school_id() and is_school_manager());

drop policy if exists assignments_select on public.assignments;
drop policy if exists assignments_write on public.assignments;
create policy assignments_select on public.assignments for select using (school_id=current_school_id());
create policy assignments_write on public.assignments for all using (school_id=current_school_id() and (is_school_manager() or teacher_id in (select t.id from public.teachers t where t.user_id=auth.uid() and t.school_id=current_school_id()))) with check (school_id=current_school_id() and (is_school_manager() or teacher_id in (select t.id from public.teachers t where t.user_id=auth.uid() and t.school_id=current_school_id())));

drop policy if exists assignment_submissions_select on public.assignment_submissions;
drop policy if exists assignment_submissions_write on public.assignment_submissions;
create policy assignment_submissions_select on public.assignment_submissions for select using (school_id=current_school_id());
create policy assignment_submissions_write on public.assignment_submissions for all using (school_id=current_school_id() and (is_school_manager() or exists(select 1 from public.assignments a join public.teachers t on t.id=a.teacher_id where a.id=assignment_id and t.user_id=auth.uid()))) with check (school_id=current_school_id());

drop policy if exists learning_materials_select on public.learning_materials;
drop policy if exists learning_materials_write on public.learning_materials;
create policy learning_materials_select on public.learning_materials for select using (school_id=current_school_id());
create policy learning_materials_write on public.learning_materials for all using (school_id=current_school_id() and (is_school_manager() or teacher_id in (select t.id from public.teachers t where t.user_id=auth.uid() and t.school_id=current_school_id()))) with check (school_id=current_school_id() and (is_school_manager() or teacher_id in (select t.id from public.teachers t where t.user_id=auth.uid() and t.school_id=current_school_id())));

drop policy if exists timetable_select on public.timetable_entries;
drop policy if exists timetable_write on public.timetable_entries;
create policy timetable_select on public.timetable_entries for select using (school_id=current_school_id());
create policy timetable_write on public.timetable_entries for all using (school_id=current_school_id() and is_school_manager()) with check (school_id=current_school_id() and is_school_manager());

-- Timetable conflict checks: a class, teacher or room cannot have overlapping lessons.
create or replace function public.prevent_timetable_conflict() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.timetable_entries e where e.school_id=new.school_id and e.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid) and e.day_of_week=new.day_of_week and e.start_time < new.end_time and e.end_time > new.start_time and (e.class_id=new.class_id or (new.teacher_id is not null and e.teacher_id=new.teacher_id) or (new.room is not null and e.room=new.room))) then raise exception 'Timetable conflict: class, teacher or room is already scheduled at this time'; end if;
  return new;
end; $$;
drop trigger if exists timetable_conflict_guard on public.timetable_entries;
create trigger timetable_conflict_guard before insert or update on public.timetable_entries for each row execute function public.prevent_timetable_conflict();

-- Assessment score guard runs before writes.
drop trigger if exists assessment_score_guard on public.assessment_scores;
create trigger assessment_score_guard before insert or update on public.assessment_scores for each row execute function public.validate_assessment_score();

-- Workflow RPCs keep result generation deterministic and prevent publishing incomplete scores.
create or replace function public.generate_term_report_cards(p_session_id uuid,p_term_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare count_rows integer:=0; r record; subj record; total numeric; max_total numeric; avg numeric; present_count integer; absent_count integer; pos integer;
begin
  if not is_school_manager() then raise exception 'Manager permission required'; end if;
  if p_session_id is null or p_term_id is null then raise exception 'Session and term are required'; end if;
  for r in select s.id,s.class_id from public.students s where s.school_id=current_school_id() and not s.is_archived loop
    total:=0; max_total:=0;
    select coalesce(sum(sc.score),0),coalesce(sum(a.max_score),0) into total,max_total
      from public.assessment_scores sc join public.assessments a on a.id=sc.assessment_id
      where sc.student_id=r.id and a.school_id=current_school_id() and a.session_id=p_session_id and a.term_id=p_term_id and a.workflow_status in ('approved','published');
    avg:=case when max_total>0 then round(total/max_total*100,2) else 0 end;
    select count(*) filter(where ar.status in ('present','late')),count(*) filter(where ar.status='absent') into present_count,absent_count
      from public.attendance_records ar join public.attendance_sessions ats on ats.id=ar.attendance_session_id
      where ar.student_id=r.id and ats.term_id=p_term_id;
    insert into public.report_cards(school_id,student_id,session_id,term_id,class_id,total_score,average_score,attendance_present,attendance_absent,status)
      values(current_school_id(),r.id,p_session_id,p_term_id,r.class_id,total,avg,present_count,absent_count,'draft')
      on conflict(student_id,session_id,term_id) do update set class_id=excluded.class_id,total_score=excluded.total_score,average_score=excluded.average_score,attendance_present=excluded.attendance_present,attendance_absent=excluded.attendance_absent,status='draft',published_at=null,updated_at=now();
    delete from public.report_card_subjects where report_card_id=(select id from public.report_cards where student_id=r.id and session_id=p_session_id and term_id=p_term_id);
    for subj in select distinct a.subject_id from public.assessments a where a.school_id=current_school_id() and a.session_id=p_session_id and a.term_id=p_term_id and a.class_id=r.class_id loop
      insert into public.report_card_subjects(school_id,report_card_id,subject_id,ca_score,exam_score,total_score,grade)
      select current_school_id(),rc.id,subj.subject_id,
        coalesce(sum(sc.score) filter(where lower(a.assessment_type)='ca'),0),
        coalesce(sum(sc.score) filter(where lower(a.assessment_type)='exam'),0),
        coalesce(sum(sc.score),0),
        public.grade_for_percentage(current_school_id(),case when coalesce(sum(a.max_score),0)>0 then coalesce(sum(sc.score),0)/sum(a.max_score)*100 else 0 end)
      from public.report_cards rc left join public.assessment_scores sc on sc.student_id=r.id left join public.assessments a on a.id=sc.assessment_id and a.subject_id=subj.subject_id and a.class_id=r.class_id and a.session_id=p_session_id and a.term_id=p_term_id and a.workflow_status in ('approved','published')
      where rc.student_id=r.id and rc.session_id=p_session_id and rc.term_id=p_term_id group by rc.id;
    end loop;
    count_rows:=count_rows+1;
  end loop;
  -- rank within class, ties share a position.
  for r in select id,class_id,average_score from public.report_cards where school_id=current_school_id() and session_id=p_session_id and term_id=p_term_id loop
    select 1+count(*) into pos from public.report_cards x where x.school_id=current_school_id() and x.session_id=p_session_id and x.term_id=p_term_id and x.class_id=r.class_id and x.average_score>r.average_score;
    update public.report_cards set position=pos where id=r.id;
  end loop;
  return count_rows;
end; $$;
revoke execute on function public.generate_term_report_cards(uuid,uuid) from anon;
grant execute on function public.generate_term_report_cards(uuid,uuid) to authenticated;

create or replace function public.advance_report_card_status(p_report_card_id uuid,p_status text)
returns public.report_cards language plpgsql security definer set search_path=public as $$
declare r public.report_cards;
begin
  if not is_school_manager() then raise exception 'Manager permission required'; end if;
  if p_status not in ('review','approved','published') then raise exception 'Invalid status'; end if;
  select * into r from public.report_cards where id=p_report_card_id and school_id=current_school_id() for update;
  if not found then raise exception 'Report card not found'; end if;
  if p_status='review' and r.status not in ('draft','review') then raise exception 'Report card cannot move to review from current status'; end if;
  if p_status='approved' and r.status<>'review' then raise exception 'Report card must be reviewed before approval'; end if;
  if p_status='published' and r.status<>'approved' then raise exception 'Report card must be approved before publishing'; end if;
  update public.report_cards set status=p_status,published_at=case when p_status='published' then now() else null end,updated_at=now() where id=r.id returning * into r;
  return r;
end; $$;
revoke execute on function public.advance_report_card_status(uuid,text) from anon;
grant execute on function public.advance_report_card_status(uuid,text) to authenticated;

create index if not exists idx_assessments_school_term_class_subject on public.assessments(school_id,term_id,class_id,subject_id);
create index if not exists idx_assessment_scores_assessment_student on public.assessment_scores(assessment_id,student_id);
create index if not exists idx_report_cards_school_term_class on public.report_cards(school_id,session_id,term_id,class_id,average_score desc);
create index if not exists idx_assignments_school_teacher on public.assignments(school_id,teacher_id);
create index if not exists idx_learning_materials_school_class_subject on public.learning_materials(school_id,class_id,subject_id);
create index if not exists idx_timetable_school_day_time on public.timetable_entries(school_id,day_of_week,start_time,end_time);
