create or replace function public.touch_ai_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke execute on function public.ai_usage_status(uuid) from authenticated;
revoke execute on function public.ai_usage_status(uuid) from public, anon;
