create table if not exists public.saas_plans (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, description text,
  monthly_price numeric(12,2) not null default 0 check (monthly_price >= 0), annual_price numeric(12,2) not null default 0 check (annual_price >= 0),
  max_students integer check (max_students is null or max_students > 0), max_teachers integer check (max_teachers is null or max_teachers > 0),
  ai_tokens_monthly bigint check (ai_tokens_monthly is null or ai_tokens_monthly >= 0), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.school_subscriptions (
  id uuid primary key default gen_random_uuid(), school_id uuid not null unique references public.schools(id) on delete cascade,
  plan_id uuid not null references public.saas_plans(id), status text not null default 'trial' check (status in ('trial','active','past_due','cancelled','expired')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','annual')), started_at timestamptz not null default now(), trial_ends_at timestamptz,
  current_period_start timestamptz not null default now(), current_period_end timestamptz, cancel_at_period_end boolean not null default false, cancelled_at timestamptz,
  provider text, external_customer_id text, external_subscription_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(), school_id uuid not null unique references public.schools(id) on delete cascade,
  provider text not null, external_customer_id text not null, billing_email text, currency text not null default 'USD', metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(provider, external_customer_id)
);
create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  subscription_id uuid references public.school_subscriptions(id) on delete set null, provider text, external_invoice_id text,
  amount numeric(12,2) not null default 0 check (amount >= 0), currency text not null default 'USD', status text not null default 'draft' check (status in ('draft','open','paid','void','uncollectible','refunded')),
  issued_at timestamptz, due_at timestamptz, paid_at timestamptz, hosted_invoice_url text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(provider, external_invoice_id)
);
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id) on delete cascade, provider text not null, event_type text not null,
  external_event_id text not null, payload jsonb not null default '{}'::jsonb, processed_at timestamptz, created_at timestamptz not null default now(), unique(provider, external_event_id)
);
create table if not exists public.school_usage_events (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade, user_id uuid references auth.users(id) on delete set null,
  metric text not null, quantity bigint not null default 1 check (quantity >= 0), source text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.school_usage_monthly (
  school_id uuid not null references public.schools(id) on delete cascade, usage_month date not null, student_count integer not null default 0, teacher_count integer not null default 0,
  assessment_count integer not null default 0, assignment_count integer not null default 0, ai_tokens bigint not null default 0, api_events bigint not null default 0, updated_at timestamptz not null default now(),
  primary key(school_id,usage_month)
);
create table if not exists public.school_settings (
  school_id uuid primary key references public.schools(id) on delete cascade, timezone text not null default 'Africa/Lagos', currency text not null default 'NGN', locale text not null default 'en-NG',
  date_format text not null default 'dd/MM/yyyy', week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6), default_page_size smallint not null default 25 check (default_page_size between 10 and 100),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.saas_plans(code,name,description,monthly_price,annual_price,max_students,max_teachers,ai_tokens_monthly) values
('starter','Starter','Core school administration for growing schools.',0,0,250,25,100000),
('growth','Growth','Full academic, operations and AI workspace.',49,490,1000,100,500000),
('scale','Scale','Higher limits for multi-campus school operations.',149,1490,null,null,2000000) on conflict(code) do nothing;
insert into public.school_settings(school_id) select id from public.schools on conflict(school_id) do nothing;
insert into public.school_subscriptions(school_id,plan_id,status,billing_cycle,trial_ends_at,current_period_start)
select s.id,p.id,'trial','monthly',now()+interval '30 days',now() from public.schools s cross join lateral(select id from public.saas_plans where code='starter' limit 1)p on conflict(school_id) do nothing;
create or replace function public.touch_saas_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists trg_saas_plans_updated_at on public.saas_plans; create trigger trg_saas_plans_updated_at before update on public.saas_plans for each row execute function public.touch_saas_updated_at();
drop trigger if exists trg_school_subscriptions_updated_at on public.school_subscriptions; create trigger trg_school_subscriptions_updated_at before update on public.school_subscriptions for each row execute function public.touch_saas_updated_at();
drop trigger if exists trg_billing_customers_updated_at on public.billing_customers; create trigger trg_billing_customers_updated_at before update on public.billing_customers for each row execute function public.touch_saas_updated_at();
drop trigger if exists trg_billing_invoices_updated_at on public.billing_invoices; create trigger trg_billing_invoices_updated_at before update on public.billing_invoices for each row execute function public.touch_saas_updated_at();
drop trigger if exists trg_school_usage_monthly_updated_at on public.school_usage_monthly; create trigger trg_school_usage_monthly_updated_at before update on public.school_usage_monthly for each row execute function public.touch_saas_updated_at();
drop trigger if exists trg_school_settings_updated_at on public.school_settings; create trigger trg_school_settings_updated_at before update on public.school_settings for each row execute function public.touch_saas_updated_at();
create or replace function public.ensure_school_trial_subscription() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.school_settings(school_id) values(new.id) on conflict do nothing; insert into public.school_subscriptions(school_id,plan_id,status,billing_cycle,trial_ends_at) select new.id,p.id,'trial','monthly',now()+interval '30 days' from public.saas_plans p where p.code='starter' and p.active on conflict(school_id) do nothing; return new; end; $$;
drop trigger if exists trg_school_trial_subscription on public.schools; create trigger trg_school_trial_subscription after insert on public.schools for each row execute function public.ensure_school_trial_subscription();
create or replace function public.school_plan_limit(p_school_id uuid,p_metric text) returns bigint language sql stable security definer set search_path='' as $$ select case p_metric when 'students' then sp.max_students::bigint when 'teachers' then sp.max_teachers::bigint when 'ai_tokens' then sp.ai_tokens_monthly else null::bigint end from public.school_subscriptions ss join public.saas_plans sp on sp.id=ss.plan_id where ss.school_id=p_school_id and ss.status in('trial','active'); $$;
create or replace function public.enforce_school_plan_limit() returns trigger language plpgsql security definer set search_path='' as $$ declare v_limit bigint; v_count bigint; v_metric text; begin v_metric:=case TG_TABLE_NAME when 'students' then 'students' when 'teachers' then 'teachers' else null end; if v_metric is null then return new; end if; v_limit:=public.school_plan_limit(new.school_id,v_metric); if v_limit is null then return new; end if; if TG_TABLE_NAME='students' then select count(*) into v_count from public.students where school_id=new.school_id and not is_archived and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'); end if; if TG_TABLE_NAME='teachers' then select count(*) into v_count from public.teachers where school_id=new.school_id and is_active and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'); end if; if v_count>=v_limit then raise exception 'Plan limit reached for % (%). Upgrade the school plan to add more records.',v_metric,v_limit using errcode='check_violation'; end if; return new; end; $$;
drop trigger if exists trg_students_plan_limit on public.students; create trigger trg_students_plan_limit before insert on public.students for each row execute function public.enforce_school_plan_limit();
drop trigger if exists trg_teachers_plan_limit on public.teachers; create trigger trg_teachers_plan_limit before insert on public.teachers for each row execute function public.enforce_school_plan_limit();
create or replace function public.refresh_school_usage_monthly(p_school_id uuid,p_month date default date_trunc('month',now())::date) returns public.school_usage_monthly language plpgsql security definer set search_path='' as $$ declare v_row public.school_usage_monthly; begin insert into public.school_usage_monthly(school_id,usage_month,student_count,teacher_count,assessment_count,assignment_count,ai_tokens,api_events) select p_school_id,p_month,(select count(*) from public.students where school_id=p_school_id and not is_archived),(select count(*) from public.teachers where school_id=p_school_id and is_active),(select count(*) from public.assessments where school_id=p_school_id),(select count(*) from public.assignments where school_id=p_school_id),coalesce((select sum(actual_tokens) from public.ai_monthly_usage where school_id=p_school_id and usage_month=p_month),0),coalesce((select sum(quantity) from public.school_usage_events where school_id=p_school_id and created_at>=p_month and created_at<(p_month+interval '1 month')),0) on conflict(school_id,usage_month) do update set student_count=excluded.student_count,teacher_count=excluded.teacher_count,assessment_count=excluded.assessment_count,assignment_count=excluded.assignment_count,ai_tokens=excluded.ai_tokens,api_events=excluded.api_events,updated_at=now() returning * into v_row; return v_row; end; $$;
create index if not exists idx_school_subscriptions_plan_status on public.school_subscriptions(plan_id,status);
create index if not exists idx_billing_invoices_school_status on public.billing_invoices(school_id,status,created_at desc);
create index if not exists idx_billing_events_school_created on public.billing_events(school_id,created_at desc);
create index if not exists idx_usage_events_school_created on public.school_usage_events(school_id,created_at desc);
create index if not exists idx_usage_events_school_metric_created on public.school_usage_events(school_id,metric,created_at desc);
create index if not exists idx_usage_monthly_updated on public.school_usage_monthly(updated_at desc);
alter table public.saas_plans enable row level security; alter table public.school_subscriptions enable row level security; alter table public.billing_customers enable row level security; alter table public.billing_invoices enable row level security; alter table public.billing_events enable row level security; alter table public.school_usage_events enable row level security; alter table public.school_usage_monthly enable row level security; alter table public.school_settings enable row level security;
create policy saas_plans_select on public.saas_plans for select to authenticated using(active or (select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy saas_plans_manage on public.saas_plans for all to authenticated using((select public.has_role((select auth.uid()),'super_admin'::public.app_role))) with check((select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy school_subscriptions_select on public.school_subscriptions for select to authenticated using(school_id=(select public.current_school_id()) or (select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy school_subscriptions_manage on public.school_subscriptions for all to authenticated using((select public.has_role((select auth.uid()),'super_admin'::public.app_role))) with check((select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy billing_customers_access on public.billing_customers for select to authenticated using(school_id=(select public.current_school_id()) or (select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy billing_customers_manage on public.billing_customers for all to authenticated using((select public.has_role((select auth.uid()),'super_admin'::public.app_role))) with check((select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy billing_invoices_access on public.billing_invoices for select to authenticated using(school_id=(select public.current_school_id()) or (select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy billing_invoices_manage on public.billing_invoices for all to authenticated using((select public.has_role((select auth.uid()),'super_admin'::public.app_role))) with check((select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy billing_events_admin on public.billing_events for select to authenticated using((select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy billing_events_write on public.billing_events for all to authenticated using((select public.has_role((select auth.uid()),'super_admin'::public.app_role))) with check((select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy usage_events_access on public.school_usage_events for select to authenticated using(school_id=(select public.current_school_id()) or (select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy usage_events_write on public.school_usage_events for insert to authenticated with check(school_id=(select public.current_school_id()) or (select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy usage_monthly_access on public.school_usage_monthly for select to authenticated using(school_id=(select public.current_school_id()) or (select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy school_settings_access on public.school_settings for select to authenticated using(school_id=(select public.current_school_id()) or (select public.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy school_settings_manage on public.school_settings for update to authenticated using(school_id=(select public.current_school_id()) and ((select public.has_role((select auth.uid()),'school_admin'::public.app_role)) or (select public.has_role((select auth.uid()),'principal'::public.app_role)))) with check(school_id=(select public.current_school_id()));
revoke all on public.saas_plans,public.school_subscriptions,public.billing_customers,public.billing_invoices,public.billing_events,public.school_usage_events,public.school_usage_monthly,public.school_settings from anon;
grant select on public.saas_plans,public.school_subscriptions,public.billing_customers,public.billing_invoices,public.billing_events,public.school_usage_events,public.school_usage_monthly,public.school_settings to authenticated;
grant update on public.school_settings to authenticated;
grant execute on function public.school_plan_limit(uuid,text),public.refresh_school_usage_monthly(uuid,date) to authenticated;
