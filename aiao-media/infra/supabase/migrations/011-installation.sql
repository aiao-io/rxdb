BEGIN;
CREATE TABLE IF NOT EXISTS public.media_installation_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  initialized_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.media_installation_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_installation_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.media_installation_state TO service_role;

CREATE OR REPLACE FUNCTION public.media_bootstrap_admin(p_target uuid, p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE installed uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media-admin-memberships', 0));
  SELECT admin_id INTO installed FROM public.media_installation_state WHERE id;
  IF installed IS NOT NULL THEN
    IF installed <> p_target OR NOT public.media_admin_authorized(p_target) THEN
      RAISE EXCEPTION 'Installation already initialized' USING ERRCODE = 'PT409';
    END IF;
    RETURN installed;
  END IF;
  IF NOT public.media_admin_authorized(p_target) THEN
    IF EXISTS (SELECT 1 FROM public.media_admin_memberships) THEN
      RAISE EXCEPTION 'Existing administrator required' USING ERRCODE = '42501';
    END IF;
    PERFORM public.media_trusted_membership(p_target, true, 0, p_request_id);
  END IF;
  INSERT INTO public.media_installation_state(id, admin_id) VALUES (true, p_target);
  RETURN p_target;
END;
$$;
REVOKE ALL ON FUNCTION public.media_bootstrap_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_bootstrap_admin(uuid, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
