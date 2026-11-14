BEGIN;
CREATE TABLE IF NOT EXISTS media_private.image_reupload_requests (
  request_id uuid PRIMARY KEY,
  previous_file_id uuid NOT NULL REFERENCES public.media_file_records(id) ON DELETE CASCADE
);
REVOKE ALL ON media_private.image_reupload_requests FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS media_private.image_reuploads (
  request_id uuid PRIMARY KEY,
  previous_file_id uuid NOT NULL UNIQUE REFERENCES public.media_file_records(id) ON DELETE CASCADE,
  file_id uuid NOT NULL UNIQUE REFERENCES public.media_file_records(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
REVOKE ALL ON media_private.image_reuploads FROM PUBLIC,anon,authenticated;
INSERT INTO media_private.image_reupload_requests(request_id,previous_file_id)
  SELECT request_id,previous_file_id FROM media_private.image_reuploads ON CONFLICT(request_id) DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS media_file_active_digest ON public.media_file_records("workspaceId","sourceId",sha256) WHERE NOT deleted;

CREATE OR REPLACE FUNCTION public.media_image_upload_allowed(p_workspace_id uuid,p_source_id text,p_version text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT media_private.owns_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Workspace authorization required' USING ERRCODE='42501';
  END IF;
  IF p_source_id IS NULL OR p_source_id !~ '^[0-9a-f-]{36}$' OR p_version IS NULL OR
    p_version !~ '^[0-9a-f]{64}(-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$' THEN
    RAISE EXCEPTION 'Invalid file identity' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,1));
  IF EXISTS(SELECT 1 FROM public.media_sync_records WHERE "workspaceId"=p_workspace_id AND kind='work' AND "sourceId"=p_source_id AND deleted) OR
    EXISTS(SELECT 1 FROM public.media_file_records WHERE "workspaceId"=p_workspace_id AND "sourceId"=p_source_id AND version=p_version AND (deleted OR status='deleted')) THEN
    RETURN false;
  END IF;
  IF p_version ~ '^[0-9a-f]{64}$' THEN RETURN true; END IF;
  RETURN EXISTS(SELECT 1 FROM media_private.image_reuploads r
    JOIN public.media_file_records f ON f.id=r.previous_file_id
    JOIN public.media_image_deletions d ON d."fileId"=f.id
    WHERE f."workspaceId"=p_workspace_id AND f."sourceId"=p_source_id AND f."createdBy"=auth.uid()
      AND f.deleted AND d.state='complete' AND p_version=f.sha256 || '-' || r.request_id::text);
END;
$$;

CREATE OR REPLACE FUNCTION media_private.validate_file_record()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.id,NEW."workspaceId",NEW."sourceId",NEW.version,NEW."createdBy") IS DISTINCT FROM
      ROW(OLD.id,OLD."workspaceId",OLD."sourceId",OLD.version,OLD."createdBy") THEN
      RAISE EXCEPTION 'File identity is immutable' USING ERRCODE='42501';
    END IF;
    IF NEW."baseRevision"<>OLD.revision OR NEW.revision<=OLD.revision THEN
      RAISE EXCEPTION 'File revision conflict' USING ERRCODE='PT409';
    END IF;
    NEW."createdAt" := OLD."createdAt";
  ELSIF NEW.revision<>1 OR NEW."baseRevision"<>0 THEN
    RAISE EXCEPTION 'Invalid initial file revision' USING ERRCODE='22023';
  END IF;
  IF NEW.path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}(-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\.(png|jpg)$') THEN
    RAISE EXCEPTION 'Invalid private file path' USING ERRCODE='22023';
  END IF;
  NEW."updatedAt" := pg_catalog.now();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION media_private.guard_file_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_path text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW."workspaceId"::text,1));
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.path,NEW.sha256,NEW.bytes,NEW.width,NEW.height,NEW."mimeType") IS DISTINCT FROM
      ROW(OLD.path,OLD.sha256,OLD.bytes,OLD.width,OLD.height,OLD."mimeType") THEN
      RAISE EXCEPTION 'File identity is immutable' USING ERRCODE='42501';
    END IF;
    IF (OLD.deleted OR OLD.status='deleted') AND (NOT NEW.deleted OR NEW.status<>'deleted') THEN
      RAISE EXCEPTION 'Deleted file version cannot be restored' USING ERRCODE='PT409';
    END IF;
  END IF;
  v_path := auth.uid()::text || '/' || NEW."workspaceId"::text || '/' || NEW."sourceId" || '/' || NEW.version ||
    CASE NEW."mimeType" WHEN 'image/png' THEN '.png' ELSE '.jpg' END;
  IF NEW.path IS DISTINCT FROM v_path OR left(NEW.version,64)<>NEW.sha256 THEN
    RAISE EXCEPTION 'Invalid private file identity' USING ERRCODE='22023';
  END IF;
  IF NEW.deleted IS DISTINCT FROM (NEW.status='deleted') THEN
    RAISE EXCEPTION 'Inconsistent file deletion state' USING ERRCODE='22023';
  END IF;
  IF NOT NEW.deleted AND (TG_OP='INSERT' OR NEW.status<>'needs_review') AND
    NOT public.media_image_upload_allowed(NEW."workspaceId",NEW."sourceId",NEW.version) THEN
    RAISE EXCEPTION 'Gallery work or file version was removed' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.media_prepare_image_reupload(p_file_id uuid,p_file_revision bigint,p_work_revision bigint,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_file public.media_file_records; v_work public.media_sync_records; v_next public.media_file_records;
  v_request media_private.image_reupload_requests; v_next_id uuid; v_version text; v_path text;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Reupload request required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_file FROM public.media_file_records WHERE id=p_file_id;
  IF NOT FOUND OR v_file."createdBy" IS DISTINCT FROM auth.uid() OR NOT media_private.owns_workspace(v_file."workspaceId") THEN
    RAISE EXCEPTION 'File authorization required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_file."workspaceId"::text,1));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,2));
  SELECT * INTO v_file FROM public.media_file_records WHERE id=p_file_id;
  SELECT * INTO v_request FROM media_private.image_reupload_requests WHERE request_id=p_request_id;
  IF FOUND AND v_request.previous_file_id<>p_file_id THEN
    RAISE EXCEPTION 'Reupload request reused' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_work FROM public.media_sync_records WHERE "workspaceId"=v_file."workspaceId" AND kind='work' AND "sourceId"=v_file."sourceId";
  IF NOT FOUND OR v_work.deleted OR media_private.image_payload_hash(v_work.payload) IS DISTINCT FROM v_file.sha256 THEN
    RAISE EXCEPTION 'Gallery work changed or was removed' USING ERRCODE='PT409';
  END IF;
  SELECT f.* INTO v_next FROM media_private.image_reuploads r JOIN public.media_file_records f ON f.id=r.file_id WHERE r.previous_file_id=p_file_id;
  IF FOUND THEN
    INSERT INTO media_private.image_reupload_requests(request_id,previous_file_id) VALUES(p_request_id,p_file_id) ON CONFLICT(request_id) DO NOTHING;
    RETURN pg_catalog.to_jsonb(v_next);
  END IF;
  IF NOT v_file.deleted OR v_file.status<>'deleted' OR v_file.revision IS DISTINCT FROM p_file_revision OR v_work.revision IS DISTINCT FROM p_work_revision OR
    NOT EXISTS(SELECT 1 FROM public.media_image_deletions WHERE "fileId"=p_file_id AND state='complete') OR
    EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='aiao-media-images' AND name=v_file.path) OR
    EXISTS(SELECT 1 FROM public.media_file_records WHERE "workspaceId"=v_file."workspaceId" AND "sourceId"=v_file."sourceId" AND sha256=v_file.sha256 AND NOT deleted) THEN
    RAISE EXCEPTION 'Confirmed deletion and current revisions required' USING ERRCODE='PT409';
  END IF;
  v_next_id := gen_random_uuid();
  v_version := v_file.sha256 || '-' || p_request_id::text;
  v_path := auth.uid()::text || '/' || v_file."workspaceId"::text || '/' || v_file."sourceId" || '/' || v_version ||
    CASE v_file."mimeType" WHEN 'image/png' THEN '.png' ELSE '.jpg' END;
  INSERT INTO media_private.image_reupload_requests(request_id,previous_file_id) VALUES(p_request_id,p_file_id);
  INSERT INTO media_private.image_reuploads(request_id,previous_file_id,file_id) VALUES(p_request_id,p_file_id,v_next_id);
  INSERT INTO public.media_file_records(id,"workspaceId","sourceId",version,path,"mimeType",width,height,bytes,sha256,status)
    VALUES(v_next_id,v_file."workspaceId",v_file."sourceId",v_version,v_path,v_file."mimeType",v_file.width,v_file.height,v_file.bytes,v_file.sha256,'pending') RETURNING * INTO v_next;
  RETURN pg_catalog.to_jsonb(v_next);
END;
$$;
REVOKE ALL ON FUNCTION public.media_prepare_image_reupload(uuid,bigint,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.media_prepare_image_reupload(uuid,bigint,bigint,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION media_private.image_delete_review(p_file_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_file public.media_file_records; v_work public.media_sync_records; v_retained bigint; v_conflicts bigint; v_transfers bigint; v_history bigint;
BEGIN
  SELECT * INTO v_file FROM public.media_file_records WHERE id=p_file_id;
  IF NOT FOUND OR v_file."createdBy" IS DISTINCT FROM auth.uid() OR NOT media_private.owns_workspace(v_file."workspaceId") THEN
    RAISE EXCEPTION 'File authorization required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_file."workspaceId"::text,1));
  SELECT * INTO v_file FROM public.media_file_records WHERE id=p_file_id;
  SELECT * INTO v_work FROM public.media_sync_records WHERE "workspaceId"=v_file."workspaceId" AND kind='work' AND "sourceId"=v_file."sourceId";
  SELECT count(*) FILTER(WHERE kind='retained'),count(*) FILTER(WHERE kind='conflict') INTO v_retained,v_conflicts
    FROM media_private.image_references WHERE workspace_id=v_file."workspaceId" AND source_id=v_file."sourceId" AND sha256=v_file.sha256;
  SELECT count(*) INTO v_transfers FROM public.media_file_records WHERE "workspaceId"=v_file."workspaceId"
    AND "sourceId"=v_file."sourceId" AND status IN ('pending','needs_review') AND NOT deleted;
  SELECT count(*) INTO v_history FROM public.rxdb_change WHERE namespace='public' AND entity='MediaSyncRecord' AND "branchId"='main'
    AND "entityId"=v_work.id::text AND (NOT "snapshotComplete" OR
      (NULLIF("beforeData",'null'::jsonb) IS NULL AND NULLIF("afterData",'null'::jsonb) IS NULL) OR
      (NULLIF("beforeData",'null'::jsonb) IS NOT NULL AND media_private.image_payload_hash("beforeData"->>'payload') IS NULL) OR
      (NULLIF("afterData",'null'::jsonb) IS NOT NULL AND media_private.image_payload_hash("afterData"->>'payload') IS NULL));
  RETURN pg_catalog.jsonb_build_object('file',pg_catalog.to_jsonb(v_file),'workRevision',COALESCE(v_work.revision,0),
    'retainedReferences',v_retained,'conflictReferences',v_conflicts,'pendingTransfers',v_transfers,'unknownHistory',v_history,
    'retainedVersions',(SELECT count(*) FROM public.media_file_records WHERE "workspaceId"=v_file."workspaceId" AND "sourceId"=v_file."sourceId" AND id<>v_file.id AND NOT deleted),
    'deletion',(SELECT pg_catalog.to_jsonb(d) FROM public.media_image_deletions d WHERE d."fileId"=v_file.id),
    'allowed',NOT v_file.deleted AND v_file.status='uploaded' AND v_retained=0 AND v_conflicts=0 AND v_transfers=0 AND v_history=0);
END;
$$;

CREATE OR REPLACE FUNCTION public.media_preview_image_reupload(p_workspace_id uuid,p_source_id text,p_sha256 text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_file_id uuid;
BEGIN
  IF NOT media_private.owns_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Workspace authorization required' USING ERRCODE='42501';
  END IF;
  IF p_source_id IS NULL OR p_source_id !~ '^[0-9a-f-]{36}$' OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid image identity' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,1));
  SELECT f.id INTO v_file_id FROM public.media_file_records f JOIN public.media_image_deletions d ON d."fileId"=f.id
    WHERE f."workspaceId"=p_workspace_id AND f."sourceId"=p_source_id AND f.sha256=p_sha256 AND f."createdBy"=auth.uid() AND f.deleted
      AND NOT EXISTS(SELECT 1 FROM media_private.image_reuploads r JOIN public.media_file_records successor ON successor.id=r.file_id WHERE r.previous_file_id=f.id AND successor.deleted)
    ORDER BY d."createdAt" DESC,f.id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deleted image version required' USING ERRCODE='PT409'; END IF;
  RETURN media_private.image_delete_review(v_file_id);
END;
$$;
REVOKE ALL ON FUNCTION public.media_preview_image_reupload(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.media_preview_image_reupload(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.media_file_capabilities()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT media_private.account_enabled() THEN RAISE EXCEPTION 'Account authorization required' USING ERRCODE='42501'; END IF;
  RETURN pg_catalog.jsonb_build_object('protocol',1,'privateBucket','aiao-media-images','maxBytes',16777216,
    'resumable',true,'metadataOnly',false,'lifecycle',1,'deletion',1,'references',1,'fileVersions',2,'reupload',1);
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
