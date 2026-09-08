-- Phase 1: Secretary manages student records without becoming a school manager.
delete from public.user_roles
where role in ('student', 'parent');

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

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
