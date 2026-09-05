CREATE OR REPLACE FUNCTION public.provision_school_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE starter_id uuid;
BEGIN
 SELECT id INTO starter_id FROM public.saas_plans WHERE code='starter' AND active=true LIMIT 1;
 IF starter_id IS NOT NULL THEN
  INSERT INTO public.school_subscriptions(school_id,plan_id,status,current_period_start) VALUES(NEW.id,starter_id,'trial',now()) ON CONFLICT(school_id) DO NOTHING;
 END IF;
 INSERT INTO public.ai_settings(school_id) VALUES(NEW.id) ON CONFLICT(school_id) DO NOTHING;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS school_defaults_after_insert ON public.schools;
CREATE TRIGGER school_defaults_after_insert AFTER INSERT ON public.schools FOR EACH ROW EXECUTE FUNCTION public.provision_school_defaults();
REVOKE ALL ON FUNCTION public.provision_school_defaults() FROM PUBLIC;
