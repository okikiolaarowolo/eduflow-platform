-- Phase 1: add the staff-only Secretary role.
alter type public.app_role add value if not exists 'secretary';
