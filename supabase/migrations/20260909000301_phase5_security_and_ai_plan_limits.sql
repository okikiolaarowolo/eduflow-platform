create or replace function public.ai_usage_status(p_school_id uuid)
returns table(enabled boolean,plan_token_limit bigint,used_tokens bigint)
language sql stable security definer set search_path='' as $$
select coalesce(s.enabled,false),case when coalesce(sp.ai_tokens_monthly,0)>0 and coalesce(s.monthly_token_limit,0)>0 then least(sp.ai_tokens_monthly,s.monthly_token_limit) when coalesce(sp.ai_tokens_monthly,0)>0 then sp.ai_tokens_monthly else coalesce(s.monthly_token_limit,0) end::bigint,coalesce(u.actual_tokens+u.reserved_tokens,0)::bigint
from public.ai_settings s left join public.school_subscriptions ss on ss.school_id=s.school_id and ss.status in('trial','active') left join public.saas_plans sp on sp.id=ss.plan_id left join public.ai_monthly_usage u on u.school_id=s.school_id and u.usage_month=date_trunc('month',now())::date
where s.school_id=p_school_id and p_school_id=(select public.current_school_id());
$$;
create or replace function public.reserve_ai_tokens(p_school_id uuid,p_tokens integer) returns boolean language plpgsql security definer set search_path='' as $$
declare v_limit bigint;v_current bigint;v_month date:=date_trunc('month',now())::date;
begin
if auth.role()<>'service_role' then raise exception 'AI quota reservation is server-only';end if;
if p_tokens<=0 or p_tokens>4000 then raise exception 'Invalid token reservation';end if;
select case when coalesce(sp.ai_tokens_monthly,0)>0 and coalesce(s.monthly_token_limit,0)>0 then least(sp.ai_tokens_monthly,s.monthly_token_limit) when coalesce(sp.ai_tokens_monthly,0)>0 then sp.ai_tokens_monthly else coalesce(s.monthly_token_limit,0) end into v_limit from public.ai_settings s left join public.school_subscriptions ss on ss.school_id=s.school_id and ss.status in('trial','active') left join public.saas_plans sp on sp.id=ss.plan_id where s.school_id=p_school_id and s.enabled=true;
if not found then return false;end if;
insert into public.ai_monthly_usage(school_id,usage_month,reserved_tokens) values(p_school_id,v_month,p_tokens) on conflict(school_id,usage_month) do update set reserved_tokens=public.ai_monthly_usage.reserved_tokens+excluded.reserved_tokens,updated_at=now();
select reserved_tokens+actual_tokens into v_current from public.ai_monthly_usage where school_id=p_school_id and usage_month=v_month for update;
if v_limit>0 and v_current>v_limit then update public.ai_monthly_usage set reserved_tokens=greatest(0,reserved_tokens-p_tokens),updated_at=now() where school_id=p_school_id and usage_month=v_month;return false;end if;return true;
end;$$;
create or replace function public.finalize_ai_usage(p_school_id uuid,p_reserved_tokens integer,p_actual_tokens integer,p_cost numeric) returns void language plpgsql security definer set search_path='' as $$
declare v_month date:=date_trunc('month',now())::date;begin
if auth.role()<>'service_role' then raise exception 'AI usage finalization is server-only';end if;
update public.ai_monthly_usage set reserved_tokens=greatest(0,reserved_tokens-greatest(0,p_reserved_tokens)),actual_tokens=actual_tokens+greatest(0,p_actual_tokens),request_count=request_count+1,total_cost=total_cost+greatest(0,coalesce(p_cost,0)),updated_at=now() where school_id=p_school_id and usage_month=v_month;
end;$$;
create or replace function public.release_ai_tokens(p_school_id uuid,p_tokens integer) returns void language plpgsql security definer set search_path='' as $$
declare v_month date:=date_trunc('month',now())::date;begin
if auth.role()<>'service_role' then raise exception 'AI quota release is server-only';end if;
update public.ai_monthly_usage set reserved_tokens=greatest(0,reserved_tokens-greatest(0,p_tokens)),updated_at=now() where school_id=p_school_id and usage_month=v_month;
end;$$;
revoke execute on function public.reserve_ai_tokens(uuid,integer),public.finalize_ai_usage(uuid,integer,integer,numeric),public.release_ai_tokens(uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_tokens(uuid,integer),public.finalize_ai_usage(uuid,integer,integer,numeric),public.release_ai_tokens(uuid,integer) to service_role;
revoke execute on function public.ai_usage_status(uuid) from public,anon;
grant execute on function public.ai_usage_status(uuid) to authenticated;
create index if not exists idx_schools_created_at on public.schools(created_at desc);
create index if not exists idx_profiles_school_user on public.profiles(school_id,id);
create index if not exists idx_user_roles_school_user_role on public.user_roles(school_id,user_id,role);
create index if not exists idx_students_school_active on public.students(school_id,is_archived);
create index if not exists idx_teachers_school_active on public.teachers(school_id,is_active);
create index if not exists idx_terms_school_session_current on public.terms(school_id,session_id,is_current);
create index if not exists idx_assessment_scores_school_assessment on public.assessment_scores(school_id,assessment_id);
create index if not exists idx_report_cards_school_term_class on public.report_cards(school_id,term_id,class_id);
create index if not exists idx_attendance_sessions_school_class_term on public.attendance_sessions(school_id,class_id,term_id);
create index if not exists idx_fee_assignments_school_student_status on public.fee_assignments(school_id,student_id,status);
create index if not exists idx_teacher_attendance_school_teacher_date on public.teacher_attendance(school_id,teacher_id,attendance_date desc);
create index if not exists idx_assignments_school_class_subject on public.assignments(school_id,class_id,subject_id);
create index if not exists idx_learning_materials_school_class_subject on public.learning_materials(school_id,class_id,subject_id);
create index if not exists idx_timetable_school_day_time on public.timetable_entries(school_id,day_of_week,start_time,end_time);
create index if not exists idx_notifications_school_user_created on public.notifications(school_id,user_id,created_at desc);
create index if not exists idx_ai_conversations_school_user_updated on public.ai_conversations(school_id,user_id,updated_at desc);
create index if not exists idx_ai_messages_school_conversation_created on public.ai_messages(school_id,conversation_id,created_at);
create index if not exists idx_ai_usage_school_created on public.ai_usage(school_id,created_at desc);
