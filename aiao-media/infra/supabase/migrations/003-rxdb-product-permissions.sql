BEGIN;
ALTER TABLE public.rxdb_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rxdb_branch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rxdb_change, public.rxdb_branch FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.rxdb_change_id_seq FROM anon, authenticated;
GRANT SELECT ON public.rxdb_change, public.rxdb_branch TO authenticated;
GRANT ALL ON public.rxdb_change, public.rxdb_branch TO service_role;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.rxdb_change_id_seq TO service_role;
DROP POLICY IF EXISTS media_owned_changes ON public.rxdb_change;
CREATE POLICY media_owned_changes ON public.rxdb_change FOR SELECT TO authenticated USING (
  namespace = 'public' AND entity = 'MediaSyncRecord' AND "branchId" = 'main' AND
  EXISTS (SELECT 1 FROM public.media_sync_records r WHERE r.id::text = "entityId")
);
DROP POLICY IF EXISTS media_main_branch ON public.rxdb_branch;
CREATE POLICY media_main_branch ON public.rxdb_branch FOR SELECT TO authenticated USING (id = 'main');
CREATE OR REPLACE FUNCTION public.rxdb_enable_sync_for_branch(p_branches jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT media_private.account_enabled() OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_branches) b WHERE b->>'id' IS DISTINCT FROM 'main'
  ) THEN RAISE EXCEPTION 'Only the product main branch is available' USING ERRCODE = '42501'; END IF;
  RETURN pg_catalog.jsonb_build_object('synced', 0, 'skipped', pg_catalog.jsonb_build_array('main'));
END;
$$;
REVOKE ALL ON FUNCTION public.rxdb_enable_sync_for_branch(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rxdb_enable_sync_for_branch(jsonb) TO authenticated;
SELECT public.rxdb_enable_sync_for_table('media_sync_records', 'public', 'MediaSyncRecord');
NOTIFY pgrst, 'reload schema';
COMMIT;
