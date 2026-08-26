
REVOKE EXECUTE ON FUNCTION public.current_school_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_school_manager() FROM anon, authenticated, public;
