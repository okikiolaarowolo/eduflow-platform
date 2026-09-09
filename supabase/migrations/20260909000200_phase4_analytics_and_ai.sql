create table if not exists public.ai_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  enabled boolean not null default true,
  student_tutor_enabled boolean not null default false,
  teacher_assistant_enabled boolean not null default true,
  monthly_token_limit bigint not null default 0 check (monthly_token_limit >= 0),
  max_output_tokens integer not null default 900 check (max_output_tokens between 128 and 4000),
  disclosure_text text not null default 'AI-generated content may contain mistakes. Review important information.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'EduFlow AI',
  context_subject_id uuid references public.subjects(id) on delete set null,
  mode text not null default 'tutor' check (mode in ('tutor','question-generator','explanation','study-plan','teacher-assistant','report-assistant','academic-insights')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  tokens_used integer not null default 0 check (tokens_used >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost numeric(14,8) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_monthly_usage (
  school_id uuid not null references public.schools(id) on delete cascade,
  usage_month date not null,
  reserved_tokens bigint not null default 0,
  actual_tokens bigint not null default 0,
  request_count integer not null default 0,
  total_cost numeric(14,8) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (school_id, usage_month)
);

create index if not exists idx_ai_conversations_school_user on public.ai_conversations(school_id, user_id, updated_at desc);
create index if not exists idx_ai_messages_conversation_created on public.ai_messages(conversation_id, created_at);
create index if not exists idx_ai_usage_school_created on public.ai_usage(school_id, created_at desc);
create index if not exists idx_ai_monthly_usage_school_month on public.ai_monthly_usage(school_id, usage_month);

alter table public.ai_settings enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_monthly_usage enable row level security;

revoke all on table public.ai_settings, public.ai_conversations, public.ai_messages, public.ai_usage, public.ai_monthly_usage from anon;
grant select on table public.ai_settings to authenticated;
grant select, insert, update, delete on table public.ai_conversations to authenticated;
grant select, insert on table public.ai_messages to authenticated;
grant select on table public.ai_usage to authenticated;
grant select on table public.ai_monthly_usage to authenticated;

drop policy if exists ai_settings_select on public.ai_settings;
drop policy if exists ai_settings_manage on public.ai_settings;
create policy ai_settings_select on public.ai_settings for select to authenticated using (school_id = (select public.current_school_id()));
create policy ai_settings_manage on public.ai_settings for update to authenticated using (school_id = (select public.current_school_id()) and ((select public.has_role((select auth.uid()), 'school_admin'::public.app_role)) or (select public.has_role((select auth.uid()), 'principal'::public.app_role)) or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))) with check (school_id = (select public.current_school_id()));

drop policy if exists ai_conversations_select on public.ai_conversations;
drop policy if exists ai_conversations_insert on public.ai_conversations;
drop policy if exists ai_conversations_update on public.ai_conversations;
drop policy if exists ai_conversations_delete on public.ai_conversations;
create policy ai_conversations_select on public.ai_conversations for select to authenticated using (user_id = (select auth.uid()) and school_id = (select public.current_school_id()));
create policy ai_conversations_insert on public.ai_conversations for insert to authenticated with check (user_id = (select auth.uid()) and school_id = (select public.current_school_id()) and ((select public.has_role((select auth.uid()), 'teacher'::public.app_role)) or (select public.has_role((select auth.uid()), 'school_admin'::public.app_role)) or (select public.has_role((select auth.uid()), 'principal'::public.app_role)) or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));
create policy ai_conversations_update on public.ai_conversations for update to authenticated using (user_id = (select auth.uid()) and school_id = (select public.current_school_id())) with check (user_id = (select auth.uid()) and school_id = (select public.current_school_id()));
create policy ai_conversations_delete on public.ai_conversations for delete to authenticated using (user_id = (select auth.uid()) and school_id = (select public.current_school_id()));

drop policy if exists ai_messages_select on public.ai_messages;
drop policy if exists ai_messages_insert on public.ai_messages;
create policy ai_messages_select on public.ai_messages for select to authenticated using (user_id = (select auth.uid()) and school_id = (select public.current_school_id()));
create policy ai_messages_insert on public.ai_messages for insert to authenticated with check (user_id = (select auth.uid()) and school_id = (select public.current_school_id()) and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()) and c.school_id = school_id));

drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage for select to authenticated using (school_id = (select public.current_school_id()) and ((user_id = (select auth.uid())) or (select public.has_role((select auth.uid()), 'school_admin'::public.app_role)) or (select public.has_role((select auth.uid()), 'principal'::public.app_role)) or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));

drop policy if exists ai_monthly_usage_select on public.ai_monthly_usage;
create policy ai_monthly_usage_select on public.ai_monthly_usage for select to authenticated using (school_id = (select public.current_school_id()) and ((select public.has_role((select auth.uid()), 'school_admin'::public.app_role)) or (select public.has_role((select auth.uid()), 'principal'::public.app_role)) or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));

create or replace function public.ai_usage_status(p_school_id uuid)
returns table(enabled boolean, plan_token_limit bigint, used_tokens bigint)
language sql security definer set search_path = '' stable
as $$
  select coalesce(s.enabled, false), 0::bigint, coalesce(u.actual_tokens + u.reserved_tokens, 0)::bigint
  from public.ai_settings s
  left join public.ai_monthly_usage u on u.school_id = s.school_id and u.usage_month = date_trunc('month', now())::date
  where s.school_id = p_school_id and p_school_id = (select public.current_school_id());
$$;
revoke execute on function public.ai_usage_status(uuid) from public, anon;
grant execute on function public.ai_usage_status(uuid) to authenticated;

create or replace function public.reserve_ai_tokens(p_school_id uuid, p_tokens integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_limit bigint; v_current bigint; v_month date := date_trunc('month', now())::date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_tokens <= 0 or p_tokens > 4000 then raise exception 'Invalid token reservation'; end if;
  if p_school_id <> (select public.current_school_id()) then raise exception 'School access denied'; end if;
  select coalesce(monthly_token_limit,0) into v_limit from public.ai_settings where school_id = p_school_id and enabled = true;
  if not found then return false; end if;
  insert into public.ai_monthly_usage(school_id, usage_month, reserved_tokens) values(p_school_id, v_month, p_tokens)
  on conflict (school_id, usage_month) do update set reserved_tokens = public.ai_monthly_usage.reserved_tokens + excluded.reserved_tokens, updated_at = now();
  select reserved_tokens + actual_tokens into v_current from public.ai_monthly_usage where school_id = p_school_id and usage_month = v_month for update;
  if v_limit > 0 and v_current > v_limit then
    update public.ai_monthly_usage set reserved_tokens = greatest(0, reserved_tokens - p_tokens), updated_at = now() where school_id = p_school_id and usage_month = v_month;
    return false;
  end if;
  return true;
end;
$$;
revoke execute on function public.reserve_ai_tokens(uuid, integer) from public, anon;
grant execute on function public.reserve_ai_tokens(uuid, integer) to authenticated;

create or replace function public.finalize_ai_usage(p_school_id uuid, p_reserved_tokens integer, p_actual_tokens integer, p_cost numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_month date := date_trunc('month', now())::date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_school_id <> (select public.current_school_id()) then raise exception 'School access denied'; end if;
  update public.ai_monthly_usage set reserved_tokens = greatest(0, reserved_tokens - greatest(0,p_reserved_tokens)), actual_tokens = actual_tokens + greatest(0,p_actual_tokens), request_count = request_count + 1, total_cost = total_cost + greatest(0,coalesce(p_cost,0)), updated_at = now() where school_id = p_school_id and usage_month = v_month;
end;
$$;
revoke execute on function public.finalize_ai_usage(uuid, integer, integer, numeric) from public, anon;
grant execute on function public.finalize_ai_usage(uuid, integer, integer, numeric) to authenticated;

revoke execute on function public.clock_in_teacher(uuid) from public, anon;
revoke execute on function public.clock_out_teacher(uuid) from public, anon;
revoke execute on function public.current_school_id() from public, anon;
revoke execute on function public.generate_receipt_number() from public, anon;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_school_manager() from public, anon;
revoke execute on function public.publish_staff_announcement(text, text, text) from public, anon;
revoke execute on function public.sync_fee_assignment_status() from public, anon;
revoke execute on function public.advance_assessment_status(uuid, text) from public, anon;
revoke execute on function public.advance_report_card_status(uuid, text) from public, anon;
revoke execute on function public.assessment_missing_counts(uuid) from public, anon;
revoke execute on function public.generate_term_report_cards(uuid, uuid) from public, anon;
revoke execute on function public.grade_for_percentage(uuid, numeric) from public, anon;
revoke execute on function public.teacher_has_assignment(uuid, uuid) from public, anon;

create index if not exists idx_assessment_scores_school_student on public.assessment_scores(school_id, student_id);
create index if not exists idx_assessment_scores_school_assessment on public.assessment_scores(school_id, assessment_id);
create index if not exists idx_assessments_school_class_subject on public.assessments(school_id, class_id, subject_id, term_id);
create index if not exists idx_attendance_records_school_student on public.attendance_records(school_id, student_id);
create index if not exists idx_attendance_sessions_school_class_term on public.attendance_sessions(school_id, class_id, term_id, session_date desc);
create index if not exists idx_fee_assignments_school_student_status on public.fee_assignments(school_id, student_id, status);
create index if not exists idx_teacher_attendance_school_teacher_date on public.teacher_attendance(school_id, teacher_id, attendance_date desc);
create index if not exists idx_assignments_school_class_subject on public.assignments(school_id, class_id, subject_id);
create index if not exists idx_assignment_submissions_school_student on public.assignment_submissions(school_id, student_id);

create or replace function public.touch_ai_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists ai_settings_updated_at on public.ai_settings;
create trigger ai_settings_updated_at before update on public.ai_settings for each row execute function public.touch_ai_updated_at();
drop trigger if exists ai_conversations_updated_at on public.ai_conversations;
create trigger ai_conversations_updated_at before update on public.ai_conversations for each row execute function public.touch_ai_updated_at();

insert into public.ai_settings (school_id) select id from public.schools on conflict (school_id) do nothing;
