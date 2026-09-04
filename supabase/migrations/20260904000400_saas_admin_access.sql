-- Super-admin controls for platform plan and subscription administration.

DROP POLICY IF EXISTS saas_plans_super_admin_write ON public.saas_plans;
CREATE POLICY saas_plans_super_admin_write ON public.saas_plans
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS school_subscriptions_super_admin_write ON public.school_subscriptions;
CREATE POLICY school_subscriptions_super_admin_write ON public.school_subscriptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS usage_counters_super_admin_select ON public.usage_counters;
CREATE POLICY usage_counters_super_admin_select ON public.usage_counters
  FOR SELECT TO authenticated
  USING (school_id = public.current_school_id() OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS ai_usage_super_admin_select ON public.ai_usage;
CREATE POLICY ai_usage_super_admin_select ON public.ai_usage
  FOR SELECT TO authenticated
  USING (school_id = public.current_school_id() OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS audit_logs_super_admin_select ON public.audit_logs;
CREATE POLICY audit_logs_super_admin_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (school_id = public.current_school_id() OR public.has_role(auth.uid(), 'super_admin'));
