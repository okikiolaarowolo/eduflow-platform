create or replace function public.publish_staff_announcement(p_title text,p_body text,p_audience text default 'all_staff') returns public.announcements language plpgsql security definer set search_path=public as $$
declare a public.announcements; r record;
begin
 if not (is_school_manager() or has_role(auth.uid(),'secretary')) then raise exception 'Not authorized'; end if;
 if p_audience not in ('all_staff','teachers','secretaries','managers') then raise exception 'Invalid audience'; end if;
 insert into public.announcements(school_id,title,body,audience,published,published_at,created_by) values(current_school_id(),trim(p_title),trim(p_body),p_audience,true,now(),auth.uid()) returning * into a;
 for r in select distinct ur.user_id, ur.role from public.user_roles ur where ur.school_id=current_school_id() and ur.role <> 'student'::public.app_role and ur.role <> 'parent'::public.app_role and (p_audience='all_staff' or (p_audience='teachers' and ur.role='teacher'::public.app_role) or (p_audience='secretaries' and ur.role='secretary'::public.app_role) or (p_audience='managers' and ur.role in ('school_admin'::public.app_role,'principal'::public.app_role))) loop
   insert into public.notifications(school_id,user_id,title,body,type,action_url) values(a.school_id,r.user_id,a.title,a.body,'announcement','/operations');
 end loop;
 return a;
end; $$;
grant execute on function public.publish_staff_announcement(text,text,text) to authenticated;
