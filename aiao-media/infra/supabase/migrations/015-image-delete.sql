BEGIN;
CREATE TABLE IF NOT EXISTS media_private.image_references (
  workspace_id uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN ('retained','conflict')),
  reference_id text NOT NULL,
  file_id uuid REFERENCES public.media_file_records(id) ON DELETE CASCADE,
  PRIMARY KEY (workspace_id,source_id,sha256,kind,reference_id)
);
REVOKE ALL ON media_private.image_references FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION media_private.retain_image_hash(p_workspace uuid,p_source text,p_hash text,p_kind text,p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_file uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text,1));
  SELECT id INTO v_file FROM public.media_file_records WHERE "workspaceId"=p_workspace AND "sourceId"=p_source AND sha256=p_hash
    ORDER BY deleted, "createdAt" DESC, id LIMIT 1;
  INSERT INTO media_private.image_references(workspace_id,source_id,sha256,kind,reference_id,file_id)
    VALUES(p_workspace,p_source,p_hash,p_kind,p_reference,v_file) ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION media_private.retain_image_hash(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION media_private.retain_previous_image()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_hash text;
BEGIN
  IF OLD.kind <> 'work' THEN RETURN NEW; END IF;
  v_hash := OLD.payload::jsonb->>'sha256';
  IF v_hash IS DISTINCT FROM (NEW.payload::jsonb->>'sha256') THEN
    PERFORM media_private.retain_image_hash(OLD."workspaceId",OLD."sourceId",v_hash,'retained',OLD.id::text);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS media_record_image_retention ON public.media_sync_records;
CREATE TRIGGER media_record_image_retention AFTER UPDATE ON public.media_sync_records
  FOR EACH ROW EXECUTE FUNCTION media_private.retain_previous_image();
CREATE OR REPLACE FUNCTION media_private.bind_image_references()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE media_private.image_references SET file_id=NEW.id WHERE workspace_id=NEW."workspaceId"
    AND source_id=NEW."sourceId" AND sha256=NEW.sha256 AND file_id IS NULL;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS media_file_references ON public.media_file_records;
CREATE TRIGGER media_file_references AFTER INSERT ON public.media_file_records
  FOR EACH ROW EXECUTE FUNCTION media_private.bind_image_references();

CREATE OR REPLACE FUNCTION media_private.image_payload_hash(p_payload text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_payload jsonb;
BEGIN
  v_payload := p_payload::jsonb;
  IF media_private.valid_record_payload('work',p_payload) IS NOT TRUE THEN RETURN NULL; END IF;
  RETURN v_payload->>'sha256';
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION media_private.image_payload_hash(text) FROM PUBLIC,anon,authenticated;
INSERT INTO media_private.image_references(workspace_id,source_id,sha256,kind,reference_id,file_id)
  SELECT f."workspaceId",f."sourceId",f.sha256,'retained',r.id::text,f.id FROM public.media_file_records f
  JOIN public.media_sync_records r ON r."workspaceId"=f."workspaceId" AND r.kind='work' AND r."sourceId"=f."sourceId"
  WHERE f.sha256 IS DISTINCT FROM (r.payload::jsonb->>'sha256') ON CONFLICT DO NOTHING;
INSERT INTO media_private.image_references(workspace_id,source_id,sha256,kind,reference_id,file_id)
  SELECT DISTINCT r."workspaceId",r."sourceId",media_private.image_payload_hash(s.data->>'payload'),'retained',r.id::text,
    (SELECT f.id FROM public.media_file_records f WHERE f."workspaceId"=r."workspaceId" AND f."sourceId"=r."sourceId"
      AND f.sha256=media_private.image_payload_hash(s.data->>'payload') ORDER BY f.deleted,f."createdAt" DESC,f.id LIMIT 1)
  FROM public.rxdb_change c JOIN public.media_sync_records r ON c."entityId"=r.id::text AND r.kind='work'
  CROSS JOIN LATERAL (VALUES (c."beforeData"),(c."afterData")) s(data)
  WHERE c.namespace='public' AND c.entity='MediaSyncRecord' AND c."branchId"='main'
    AND media_private.image_payload_hash(s.data->>'payload') IS NOT NULL
    AND media_private.image_payload_hash(s.data->>'payload') IS DISTINCT FROM (r.payload::jsonb->>'sha256')
  ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.media_retain_image_conflict(p_workspace_id uuid,p_conflict_id uuid,p_source_id text,p_hashes text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_hash text;
BEGIN
  IF NOT media_private.owns_workspace(p_workspace_id) THEN RAISE EXCEPTION 'Workspace authorization required' USING ERRCODE='42501'; END IF;
  IF p_conflict_id IS NULL OR p_source_id IS NULL OR p_hashes IS NULL OR cardinality(p_hashes) NOT BETWEEN 1 AND 4 OR
    EXISTS(SELECT 1 FROM unnest(p_hashes) h WHERE h IS NULL OR h !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Invalid conflict image references' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,1));
  IF NOT EXISTS(SELECT 1 FROM public.media_sync_records WHERE "workspaceId"=p_workspace_id AND kind='work' AND "sourceId"=p_source_id) THEN
    RAISE EXCEPTION 'Work reference missing' USING ERRCODE='PT409';
  END IF;
  FOREACH v_hash IN ARRAY p_hashes LOOP
    PERFORM media_private.retain_image_hash(p_workspace_id,p_source_id,v_hash,'conflict',p_conflict_id::text);
  END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION public.media_release_image_conflict(p_workspace_id uuid,p_conflict_id uuid,p_source_id text,p_work_revision bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT media_private.owns_workspace(p_workspace_id) THEN RAISE EXCEPTION 'Workspace authorization required' USING ERRCODE='42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,1));
  IF NOT EXISTS(SELECT 1 FROM public.media_sync_records WHERE "workspaceId"=p_workspace_id AND kind='work' AND "sourceId"=p_source_id AND revision=p_work_revision) THEN
    RAISE EXCEPTION 'Work revision conflict' USING ERRCODE='PT409';
  END IF;
  DELETE FROM media_private.image_references WHERE workspace_id=p_workspace_id AND source_id=p_source_id
    AND kind='conflict' AND reference_id=p_conflict_id::text;
END;
$$;
REVOKE ALL ON FUNCTION public.media_retain_image_conflict(uuid,uuid,text,text[]),public.media_release_image_conflict(uuid,uuid,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.media_retain_image_conflict(uuid,uuid,text,text[]),public.media_release_image_conflict(uuid,uuid,text,bigint) TO authenticated;

CREATE TABLE IF NOT EXISTS public.media_image_deletions (
  id uuid PRIMARY KEY,
  "workspaceId" uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE,
  "fileId" uuid NOT NULL UNIQUE REFERENCES public.media_file_records(id) ON DELETE CASCADE,
  "sourceId" text NOT NULL,
  version text NOT NULL,
  path text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','complete')),
  "createdBy" uuid NOT NULL REFERENCES auth.users(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz
);
ALTER TABLE public.media_image_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_image_deletions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.media_image_deletions TO authenticated;
GRANT ALL ON public.media_image_deletions TO service_role;
DROP POLICY IF EXISTS media_image_deletion_owner ON public.media_image_deletions;
CREATE POLICY media_image_deletion_owner ON public.media_image_deletions FOR SELECT TO authenticated USING (
  "createdBy"=(SELECT auth.uid()) AND media_private.owns_workspace("workspaceId")
);
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
    FROM media_private.image_references WHERE file_id=p_file_id OR
      (file_id IS NULL AND workspace_id=v_file."workspaceId" AND source_id=v_file."sourceId" AND sha256=v_file.sha256);
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
REVOKE ALL ON FUNCTION media_private.image_delete_review(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.media_preview_image_delete(p_file_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  SELECT media_private.image_delete_review(p_file_id);
$$;
CREATE OR REPLACE FUNCTION public.media_begin_image_delete(p_file_id uuid,p_file_revision bigint,p_work_revision bigint,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_file public.media_file_records; v_receipt public.media_image_deletions; v_review jsonb;
BEGIN
  IF p_request_id IS NULL OR NOT media_private.account_enabled() THEN RAISE EXCEPTION 'Authorization required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_file FROM public.media_file_records WHERE id=p_file_id FOR NO KEY UPDATE;
  IF NOT FOUND OR v_file."createdBy" IS DISTINCT FROM auth.uid() OR NOT media_private.owns_workspace(v_file."workspaceId") THEN
    RAISE EXCEPTION 'File authorization required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_file."workspaceId"::text,1));
  SELECT * INTO v_receipt FROM public.media_image_deletions WHERE id=p_request_id;
  IF FOUND AND v_receipt."fileId"<>p_file_id THEN RAISE EXCEPTION 'Deletion request reused' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_receipt FROM public.media_image_deletions WHERE "fileId"=p_file_id;
  IF FOUND THEN RETURN pg_catalog.to_jsonb(v_receipt); END IF;
  v_review := media_private.image_delete_review(p_file_id);
  IF NOT (v_review->>'allowed')::boolean OR v_file.revision IS DISTINCT FROM p_file_revision OR
    (v_review->>'workRevision')::bigint IS DISTINCT FROM p_work_revision THEN
    RAISE EXCEPTION 'File changed or retained references prevent deletion' USING ERRCODE='PT409';
  END IF;
  UPDATE public.media_file_records SET deleted=true,status='deleted',"baseRevision"=revision,revision=revision+1,"updatedBy"=auth.uid() WHERE id=p_file_id;
  INSERT INTO public.media_image_deletions(id,"workspaceId","fileId","sourceId",version,path,state,"createdBy")
    VALUES(p_request_id,v_file."workspaceId",v_file.id,v_file."sourceId",v_file.version,v_file.path,'pending',auth.uid()) RETURNING * INTO v_receipt;
  RETURN pg_catalog.to_jsonb(v_receipt);
END;
$$;
CREATE OR REPLACE FUNCTION media_private.image_object_deletable(p_path text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_file public.media_file_records; v_review jsonb;
BEGIN
  SELECT f.* INTO v_file FROM public.media_file_records f JOIN public.media_image_deletions d ON d."fileId"=f.id
    WHERE f.path=p_path AND f."createdBy"=auth.uid() AND f.deleted AND f.status='deleted' AND d.state='pending';
  IF NOT FOUND THEN RETURN false; END IF;
  v_review := media_private.image_delete_review(v_file.id);
  RETURN (v_review->>'retainedReferences')::bigint=0 AND (v_review->>'conflictReferences')::bigint=0
    AND (v_review->>'pendingTransfers')::bigint=0 AND (v_review->>'unknownHistory')::bigint=0;
END;
$$;
REVOKE ALL ON FUNCTION media_private.image_object_deletable(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION media_private.image_object_deletable(text) TO authenticated;
DROP POLICY IF EXISTS media_image_delete ON storage.objects;
CREATE POLICY media_image_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='aiao-media-images' AND media_private.image_object_deletable(name)
);
CREATE OR REPLACE FUNCTION public.media_complete_image_delete(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_receipt public.media_image_deletions;
BEGIN
  SELECT * INTO v_receipt FROM public.media_image_deletions WHERE id=p_request_id;
  IF NOT FOUND OR v_receipt."createdBy" IS DISTINCT FROM auth.uid() OR NOT media_private.owns_workspace(v_receipt."workspaceId") THEN
    RAISE EXCEPTION 'Deletion authorization required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_receipt."workspaceId"::text,1));
  UPDATE public.media_image_deletions SET state='complete',"completedAt"=pg_catalog.now() WHERE id=p_request_id AND state='pending'
    AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='aiao-media-images' AND name=v_receipt.path);
  SELECT * INTO v_receipt FROM public.media_image_deletions WHERE id=p_request_id;
  RETURN pg_catalog.to_jsonb(v_receipt);
END;
$$;
REVOKE ALL ON FUNCTION public.media_preview_image_delete(uuid),public.media_begin_image_delete(uuid,bigint,bigint,uuid),public.media_complete_image_delete(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.media_preview_image_delete(uuid),public.media_begin_image_delete(uuid,bigint,bigint,uuid),public.media_complete_image_delete(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.media_sync_capabilities()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rls boolean;
BEGIN
  IF NOT media_private.account_enabled() THEN RAISE EXCEPTION 'Account authorization required' USING ERRCODE='42501'; END IF;
  SELECT count(*)=4 AND bool_and(c.relrowsecurity) INTO v_rls FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    AND c.relname IN ('media_accounts','media_workspaces','media_binding_requests','media_sync_records');
  RETURN pg_catalog.jsonb_build_object('protocol',1,'rls',v_rls,'metadataOnly',true,'imageReferences',1);
END;
$$;
CREATE OR REPLACE FUNCTION public.media_file_capabilities()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT media_private.account_enabled() THEN RAISE EXCEPTION 'Account authorization required' USING ERRCODE='42501'; END IF;
  RETURN pg_catalog.jsonb_build_object('protocol',1,'privateBucket','aiao-media-images','maxBytes',16777216,
    'resumable',true,'metadataOnly',false,'lifecycle',1,'deletion',1,'references',1);
END;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
