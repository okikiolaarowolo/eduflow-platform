-- EduFlow Phase 2: school operations, finance, attendance and communication

create table if not exists public.fee_types (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  name text not null, description text, amount numeric(12,2) not null check (amount >= 0),
  frequency text not null default 'term' check (frequency in ('one_time','term','session','monthly')),
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,name)
);
create table if not exists public.fee_assignments (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  fee_type_id uuid not null references public.fee_types(id) on delete cascade, student_id uuid not null references public.students(id) on delete cascade,
  session_id uuid references public.academic_sessions(id) on delete set null, term_id uuid references public.terms(id) on delete set null,
  amount_due numeric(12,2) not null check (amount_due >= 0), due_date date,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid','waived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(fee_type_id,student_id,session_id,term_id)
);
create table if not exists public.fee_payments (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  fee_assignment_id uuid not null references public.fee_assignments(id) on delete cascade, student_id uuid not null references public.students(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0), payment_date timestamptz not null default now(),
  method text not null default 'cash' check (method in ('cash','bank_transfer','card','pos','online','other')),
  reference text, note text, recorded_by uuid, receipt_number text not null, created_at timestamptz not null default now(), unique(school_id,receipt_number)
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade, term_id uuid references public.terms(id) on delete set null,
  session_date date not null, period text not null default 'Daily', marked_by uuid, created_at timestamptz not null default now(), unique(class_id,session_date,period)
);
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  attendance_session_id uuid not null references public.attendance_sessions(id) on delete cascade, student_id uuid not null references public.students(id) on delete cascade,
  status text not null check(status in ('present','absent','late','excused')), note text, created_at timestamptz not null default now(), unique(attendance_session_id,student_id)
);
create table if not exists public.teacher_attendance (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade, attendance_date date not null default current_date,
  clock_in timestamptz, clock_out timestamptz, note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(teacher_id,attendance_date), check(clock_out is null or clock_in is not null), check(clock_out is null or clock_out >= clock_in)
);
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  title text not null, body text not null, audience text not null default 'all_staff' check(audience in ('all_staff','teachers','secretaries','managers')),
  published boolean not null default false, published_at timestamptz, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id) on delete cascade, user_id uuid not null,
  title text not null, body text not null, type text not null default 'system', action_url text, read_at timestamptz, created_at timestamptz not null default now()
);

create index if not exists idx_fee_assignments_school_status on public.fee_assignments(school_id,status);
create index if not exists idx_fee_assignments_student on public.fee_assignments(student_id);
create index if not exists idx_fee_payments_school_date on public.fee_payments(school_id,payment_date desc);
create index if not exists idx_teacher_attendance_school_date on public.teacher_attendance(school_id,attendance_date desc);
create index if not exists idx_teacher_attendance_teacher on public.teacher_attendance(teacher_id,attendance_date desc);
create index if not exists idx_attendance_school_date on public.attendance_sessions(school_id,session_date desc);
create index if not exists idx_attendance_records_student on public.attendance_records(student_id);
create index if not exists idx_notifications_user on public.notifications(user_id,created_at desc);

create or replace function public.sync_fee_assignment_status() returns trigger language plpgsql security definer set search_path = public as $$
declare paid numeric(12,2);
begin
  select coalesce(sum(amount),0) into paid from public.fee_payments where fee_assignment_id = new.fee_assignment_id;
  update public.fee_assignments set status = case when amount_due = 0 then 'paid' when paid >= amount_due then 'paid' when paid > 0 then 'partial' else 'unpaid' end, updated_at = now() where id = new.fee_assignment_id;
  return new;
end; $$;
drop trigger if exists trg_sync_fee_assignment_status on public.fee_payments;
create trigger trg_sync_fee_assignment_status after insert or update or delete on public.fee_payments for each row execute function public.sync_fee_assignment_status();

create or replace function public.generate_receipt_number() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.receipt_number is null or btrim(new.receipt_number) = '' then new.receipt_number := 'RCP-' || to_char(coalesce(new.payment_date,now()),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)); end if;
  return new;
end; $$;
drop trigger if exists trg_generate_receipt_number on public.fee_payments;
create trigger trg_generate_receipt_number before insert on public.fee_payments for each row execute function public.generate_receipt_number();

create or replace function public.clock_in_teacher(p_teacher_id uuid) returns public.teacher_attendance language plpgsql security definer set search_path = public as $$
declare r public.teacher_attendance;
begin
  if not (has_role(auth.uid(),'teacher') and exists(select 1 from public.teachers t where t.id=p_teacher_id and t.user_id=auth.uid() and t.school_id=current_school_id() and t.is_active)) then raise exception 'Not authorized'; end if;
  insert into public.teacher_attendance(school_id,teacher_id,attendance_date,clock_in) values(current_school_id(),p_teacher_id,current_date,now()) on conflict (teacher_id,attendance_date) do update set clock_in = coalesce(public.teacher_attendance.clock_in,excluded.clock_in), updated_at=now() returning * into r;
  return r;
end; $$;
create or replace function public.clock_out_teacher(p_teacher_id uuid) returns public.teacher_attendance language plpgsql security definer set search_path = public as $$
declare r public.teacher_attendance;
begin
  if not (has_role(auth.uid(),'teacher') and exists(select 1 from public.teachers t where t.id=p_teacher_id and t.user_id=auth.uid() and t.school_id=current_school_id() and t.is_active)) then raise exception 'Not authorized'; end if;
  update public.teacher_attendance set clock_out=coalesce(clock_out,now()),updated_at=now() where teacher_id=p_teacher_id and attendance_date=current_date and clock_in is not null returning * into r;
  if r.id is null then raise exception 'No active clock-in for today'; end if;
  return r;
end; $$;

grant execute on function public.clock_in_teacher(uuid) to authenticated;
grant execute on function public.clock_out_teacher(uuid) to authenticated;
grant execute on function public.has_role(uuid,public.app_role) to authenticated;

alter table public.fee_types enable row level security;
alter table public.fee_assignments enable row level security;
alter table public.fee_payments enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.teacher_attendance enable row level security;
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;

drop policy if exists fee_types_select on public.fee_types; create policy fee_types_select on public.fee_types for select to authenticated using(school_id=current_school_id());
drop policy if exists fee_types_manage on public.fee_types; create policy fee_types_manage on public.fee_types for all to authenticated using(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary'))) with check(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary')));
drop policy if exists fee_assignments_select on public.fee_assignments; create policy fee_assignments_select on public.fee_assignments for select to authenticated using(school_id=current_school_id());
drop policy if exists fee_assignments_manage on public.fee_assignments; create policy fee_assignments_manage on public.fee_assignments for all to authenticated using(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary'))) with check(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary')));
drop policy if exists fee_payments_select on public.fee_payments; create policy fee_payments_select on public.fee_payments for select to authenticated using(school_id=current_school_id());
drop policy if exists fee_payments_manage on public.fee_payments; create policy fee_payments_manage on public.fee_payments for all to authenticated using(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary'))) with check(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary')));

drop policy if exists attendance_sessions_select on public.attendance_sessions; create policy attendance_sessions_select on public.attendance_sessions for select to authenticated using(school_id=current_school_id());
drop policy if exists attendance_sessions_write on public.attendance_sessions; create policy attendance_sessions_write on public.attendance_sessions for all to authenticated using(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary') or exists(select 1 from public.teacher_classes tc join public.teachers t on t.id=tc.teacher_id where tc.class_id=attendance_sessions.class_id and tc.school_id=current_school_id() and t.user_id=auth.uid()))) with check(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary') or exists(select 1 from public.teacher_classes tc join public.teachers t on t.id=tc.teacher_id where tc.class_id=attendance_sessions.class_id and tc.school_id=current_school_id() and t.user_id=auth.uid())));
drop policy if exists attendance_records_select on public.attendance_records; create policy attendance_records_select on public.attendance_records for select to authenticated using(school_id=current_school_id());
drop policy if exists attendance_records_write on public.attendance_records; create policy attendance_records_write on public.attendance_records for all to authenticated using(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary') or exists(select 1 from public.attendance_sessions s join public.teacher_classes tc on tc.class_id=s.class_id and tc.school_id=s.school_id join public.teachers t on t.id=tc.teacher_id where s.id=attendance_records.attendance_session_id and s.school_id=current_school_id() and t.user_id=auth.uid()))) with check(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary') or exists(select 1 from public.attendance_sessions s join public.teacher_classes tc on tc.class_id=s.class_id and tc.school_id=s.school_id join public.teachers t on t.id=tc.teacher_id where s.id=attendance_records.attendance_session_id and s.school_id=current_school_id() and t.user_id=auth.uid())));

drop policy if exists teacher_attendance_select on public.teacher_attendance; create policy teacher_attendance_select on public.teacher_attendance for select to authenticated using(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary') or exists(select 1 from public.teachers t where t.id=teacher_attendance.teacher_id and t.user_id=auth.uid())));
drop policy if exists teacher_attendance_manage on public.teacher_attendance; create policy teacher_attendance_manage on public.teacher_attendance for all to authenticated using(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary') or exists(select 1 from public.teachers t where t.id=teacher_attendance.teacher_id and t.user_id=auth.uid()))) with check(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary') or exists(select 1 from public.teachers t where t.id=teacher_attendance.teacher_id and t.user_id=auth.uid())));

drop policy if exists announcements_select on public.announcements; create policy announcements_select on public.announcements for select to authenticated using(school_id=current_school_id() and (published=true or is_school_manager() or has_role(auth.uid(),'secretary')));
drop policy if exists announcements_manage on public.announcements; create policy announcements_manage on public.announcements for all to authenticated using(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary'))) with check(school_id=current_school_id() and (is_school_manager() or has_role(auth.uid(),'secretary')));
drop policy if exists notifications_select_own on public.notifications; create policy notifications_select_own on public.notifications for select to authenticated using(user_id=auth.uid() and (school_id is null or school_id=current_school_id()));
drop policy if exists notifications_update_own on public.notifications; create policy notifications_update_own on public.notifications for update to authenticated using(user_id=auth.uid() and (school_id is null or school_id=current_school_id())) with check(user_id=auth.uid() and (school_id is null or school_id=current_school_id()));
drop policy if exists notifications_insert_staff on public.notifications; create policy notifications_insert_staff on public.notifications for insert to authenticated with check((school_id is null or school_id=current_school_id()) and (is_school_manager() or has_role(auth.uid(),'secretary')));

grant select,insert,update,delete on public.fee_types,public.fee_assignments,public.fee_payments,public.attendance_sessions,public.attendance_records,public.teacher_attendance,public.announcements,public.notifications to authenticated;
