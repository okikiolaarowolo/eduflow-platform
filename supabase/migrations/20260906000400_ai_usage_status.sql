-- Secure server-side AI quota status used by the AI Edge Function.
CREATE OR REPLACE FUNCTION public.ai_usage_status(p_school_id uuid)
RETURNS TABLE (
  enabled boolean,
  used_tokens bigint,
  monthly_limit integer,
  plan_token_limit integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(s.enabled, true),
    COALESCE((SELECT SUM(GREATEST(COALESCE(u.input_tokens,0),0) + GREATEST(COALESCE(u.output_tokens,0),0))::bigint
      FROM public.ai_usage u
      WHERE u.school_id = p_school_id
        AND u.created_at >= date_trunc('month', now())
        AND u.created_at < date_trunc('month', now()) + interval '1 month'), 0),
    COALESCE(s.monthly_token_limit, 100000),
    p.ai_tokens_monthly
  FROM public.schools sc
  LEFT JOIN public.ai_settings s ON s.school_id = sc.id
  LEFT JOIN public.school_subscriptions ss ON ss.school_id = sc.id
  LEFT JOIN public.saas_plans p ON p.id = ss.plan_id
  WHERE sc.id = p_school_id
    AND p_school_id = public.current_school_id();
$$;
REVOKE ALL ON FUNCTION public.ai_usage_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_usage_status(uuid) TO authenticated;
