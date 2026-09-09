create or replace function public.release_ai_tokens(p_school_id uuid, p_tokens integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_month date := date_trunc('month', now())::date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_school_id <> (select public.current_school_id()) then raise exception 'School access denied'; end if;
  update public.ai_monthly_usage
  set reserved_tokens = greatest(0, reserved_tokens - greatest(0,p_tokens)), updated_at = now()
  where school_id = p_school_id and usage_month = v_month;
end;
$$;
revoke execute on function public.release_ai_tokens(uuid, integer) from public, anon;
grant execute on function public.release_ai_tokens(uuid, integer) to authenticated;
