BEGIN;
CREATE OR REPLACE FUNCTION media_private.check_sync_quota()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_count bigint; v_bytes bigint;
BEGIN
  IF NEW.deleted THEN RETURN NEW; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW."workspaceId"::text, 1));
  SELECT count(*), COALESCE(sum(octet_length(payload)), 0) INTO v_count, v_bytes
    FROM public.media_sync_records WHERE "workspaceId" = NEW."workspaceId" AND id <> NEW.id;
  IF v_count >= 20000 OR v_bytes + octet_length(NEW.payload) > 67108864 THEN
    RAISE EXCEPTION 'Metadata quota exceeded; local data preserved' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS media_record_quota ON public.media_sync_records;
CREATE TRIGGER media_record_quota BEFORE INSERT OR UPDATE ON public.media_sync_records
  FOR EACH ROW EXECUTE FUNCTION media_private.check_sync_quota();

CREATE OR REPLACE FUNCTION public.media_sync_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_build_object('records', count(*), 'active', count(*) FILTER (WHERE NOT deleted),
    'bytes', COALESCE(sum(octet_length(payload)), 0), 'recordLimit', 20000, 'byteLimit', 67108864,
    'metadataOnly', true, 'retention', 'manual-with-tombstones')
    FROM public.media_sync_records WHERE media_private.account_enabled();
$$;
CREATE OR REPLACE FUNCTION public.media_export_sync()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT media_private.account_enabled() THEN RAISE EXCEPTION 'Authorization required' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT pg_catalog.jsonb_build_object('format', 'aiao-sync-metadata', 'version', 1,
    'records', COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.id), '[]'::jsonb)) FROM public.media_sync_records r);
END;
$$;
CREATE TABLE IF NOT EXISTS media_private.deletion_requests (
  owner uuid NOT NULL, request_id uuid NOT NULL, affected bigint NOT NULL, PRIMARY KEY(owner, request_id)
);
REVOKE ALL ON media_private.deletion_requests FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.media_delete_remote_metadata(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count bigint;
BEGIN
  IF NOT media_private.account_enabled() OR p_request_id IS NULL THEN RAISE EXCEPTION 'Authorization required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 2));
  SELECT affected INTO v_count FROM media_private.deletion_requests WHERE owner = auth.uid() AND request_id = p_request_id;
  IF FOUND THEN RETURN pg_catalog.jsonb_build_object('affected', v_count); END IF;
  UPDATE public.media_sync_records SET deleted = true, "baseRevision" = revision, revision = revision + 1, "updatedBy" = auth.uid()::text
    WHERE "workspaceId" IN (SELECT id FROM public.media_workspaces WHERE owner_id = auth.uid()) AND NOT deleted;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO media_private.deletion_requests VALUES (auth.uid(), p_request_id, v_count);
  RETURN pg_catalog.jsonb_build_object('affected', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.media_sync_status(), public.media_export_sync(), public.media_delete_remote_metadata(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_sync_status(), public.media_export_sync(), public.media_delete_remote_metadata(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
