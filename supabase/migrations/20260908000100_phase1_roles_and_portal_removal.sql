-- Phase 1 role model: staff-only school platform.
-- Student/parent enum values are retained for backward-compatible database history,
-- but they are no longer supported application roles. New product access uses secretary
-- for school operations and staff workflows.

alter type public.app_role add value if not exists 'secretary';

-- Existing legacy portal roles should never remain assigned to active users.
delete from public.user_roles
where role in ('student', 'parent');

-- Secretary can manage student records, but does not become a school manager.
drop policy if exists students_insert on public.students;
create policy students_insert
on public.students
for insert
to authenticated
with check (
  school_id = public.current_school_id()
  and (
    public.is_school_manager()
    or public.has_role(auth.uid(), 'secretary'::public.app_role)
  )
);

drop policy if exists students_update on public.students;
create policy students_update
on public.students
for update
to authenticated
using (
  school_id = public.current_school_id()
  and (
    public.is_school_manager()
    or public.has_role(auth.uid(), 'secretary'::public.app_role)
  )
)
with check (
  school_id = public.current_school_id()
  and (
    public.is_school_manager()
    or public.has_role(auth.uid(), 'secretary'::public.app_role)
  )
);

drop policy if exists students_delete on public.students;
create policy students_delete
on public.students
for delete
to authenticated
using (
  school_id = public.current_school_id()
  and (
    public.is_school_manager()
    or public.has_role(auth.uid(), 'secretary'::public.app_role)
  )
);

revoke all on function public.has_role(uuid, public.app_role) from public;
revoke all on function public.has_role(uuid, public.app_role) from anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
