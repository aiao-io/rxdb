BEGIN;
CREATE OR REPLACE FUNCTION media_private.guard_work_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.kind <> 'work' THEN RETURN NEW; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW."workspaceId"::text, 1));
  IF NOT NEW.deleted AND EXISTS (
    SELECT 1 FROM public.media_sync_records WHERE "workspaceId" = NEW."workspaceId"
      AND kind = 'work' AND "sourceId" = NEW."sourceId" AND deleted
  ) THEN
    RAISE EXCEPTION 'Removed gallery work cannot be restored by stale edits' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS media_record_image_lifecycle ON public.media_sync_records;
CREATE TRIGGER media_record_image_lifecycle BEFORE INSERT OR UPDATE ON public.media_sync_records
  FOR EACH ROW EXECUTE FUNCTION media_private.guard_work_lifecycle();

CREATE OR REPLACE FUNCTION public.media_image_upload_allowed(p_workspace_id uuid, p_source_id text, p_version text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT media_private.owns_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Workspace authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_source_id IS NULL OR p_source_id !~ '^[0-9a-f-]{36}$' OR p_version IS NULL OR p_version !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid file identity' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text, 1));
  RETURN NOT EXISTS (
    SELECT 1 FROM public.media_sync_records WHERE "workspaceId" = p_workspace_id
      AND kind = 'work' AND "sourceId" = p_source_id AND deleted
  ) AND NOT EXISTS (
    SELECT 1 FROM public.media_file_records WHERE "workspaceId" = p_workspace_id
      AND "sourceId" = p_source_id AND version = p_version AND (deleted OR status = 'deleted')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.media_image_upload_allowed(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_image_upload_allowed(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION media_private.guard_file_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_path text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW."workspaceId"::text, 1));
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.path, NEW.sha256, NEW.bytes, NEW.width, NEW.height, NEW."mimeType") IS DISTINCT FROM
       ROW(OLD.path, OLD.sha256, OLD.bytes, OLD.width, OLD.height, OLD."mimeType") THEN
      RAISE EXCEPTION 'File identity is immutable' USING ERRCODE = '42501';
    END IF;
    IF (OLD.deleted OR OLD.status = 'deleted') AND (NOT NEW.deleted OR NEW.status <> 'deleted') THEN
      RAISE EXCEPTION 'Deleted file version cannot be restored' USING ERRCODE = 'PT409';
    END IF;
  END IF;
  v_path := auth.uid()::text || '/' || NEW."workspaceId"::text || '/' || NEW."sourceId" || '/' || NEW.sha256 ||
    CASE NEW."mimeType" WHEN 'image/png' THEN '.png' ELSE '.jpg' END;
  IF NEW.path IS DISTINCT FROM v_path OR NEW.version <> NEW.sha256 THEN
    RAISE EXCEPTION 'Invalid private file identity' USING ERRCODE = '22023';
  END IF;
  IF NEW.deleted IS DISTINCT FROM (NEW.status = 'deleted') THEN
    RAISE EXCEPTION 'Inconsistent file deletion state' USING ERRCODE = '22023';
  END IF;
  IF NOT NEW.deleted AND (TG_OP = 'INSERT' OR NEW.status <> 'needs_review') AND
    NOT public.media_image_upload_allowed(NEW."workspaceId", NEW."sourceId", NEW.version) THEN
    RAISE EXCEPTION 'Gallery work or file version was removed' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS media_file_lifecycle ON public.media_file_records;
CREATE TRIGGER media_file_lifecycle BEFORE INSERT OR UPDATE ON public.media_file_records
  FOR EACH ROW EXECUTE FUNCTION media_private.guard_file_lifecycle();

CREATE OR REPLACE FUNCTION media_private.image_object_writable(p_path text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_file public.media_file_records;
BEGIN
  SELECT * INTO v_file FROM public.media_file_records WHERE path = p_path AND "createdBy" = auth.uid();
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT public.media_image_upload_allowed(v_file."workspaceId", v_file."sourceId", v_file.version) THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.media_file_records WHERE id = v_file.id AND NOT deleted AND status IN ('pending', 'needs_review')
  );
END;
$$;
REVOKE ALL ON FUNCTION media_private.image_object_writable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION media_private.image_object_writable(text) TO authenticated;
DROP POLICY IF EXISTS media_image_insert ON storage.objects;
CREATE POLICY media_image_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'aiao-media-images' AND media_private.image_object_writable(name)
);
DROP POLICY IF EXISTS media_image_update ON storage.objects;
CREATE POLICY media_image_update ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'aiao-media-images' AND media_private.image_object_writable(name)
) WITH CHECK (
  bucket_id = 'aiao-media-images' AND media_private.image_object_writable(name)
);

CREATE OR REPLACE FUNCTION public.media_file_capabilities()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT media_private.account_enabled() THEN RAISE EXCEPTION 'Account authorization required' USING ERRCODE = '42501'; END IF;
  RETURN pg_catalog.jsonb_build_object('protocol', 1, 'privateBucket', 'aiao-media-images', 'maxBytes', 16777216,
    'resumable', true, 'metadataOnly', false, 'lifecycle', 1);
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
