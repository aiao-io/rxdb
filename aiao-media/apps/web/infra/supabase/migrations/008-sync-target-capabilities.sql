BEGIN;
CREATE OR REPLACE FUNCTION public.media_sync_capabilities()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rls boolean;
BEGIN
  IF NOT media_private.account_enabled() THEN
    RAISE EXCEPTION 'Account authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) = 4 AND bool_and(c.relrowsecurity) INTO v_rls
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN
      ('media_accounts', 'media_workspaces', 'media_binding_requests', 'media_sync_records');
  RETURN pg_catalog.jsonb_build_object('protocol', 1, 'rls', v_rls, 'metadataOnly', true);
END;
$$;
REVOKE ALL ON FUNCTION public.media_sync_capabilities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_sync_capabilities() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
