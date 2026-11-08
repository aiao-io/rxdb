BEGIN;
CREATE OR REPLACE FUNCTION media_private.json_fields(v jsonb, required text[], optional text[] DEFAULT '{}')
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_typeof(v) = 'object' AND v ?& required
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(v) k WHERE NOT k = ANY(required || optional));
$$;
CREATE OR REPLACE FUNCTION media_private.js_length(value text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT pg_catalog.length(value) + COALESCE((
    SELECT count(*)::integer FROM pg_catalog.regexp_split_to_table(value, '') AS character
    WHERE pg_catalog.ascii(character) > 65535
  ), 0);
$$;
CREATE OR REPLACE FUNCTION media_private.valid_studio(v jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE f jsonb; p jsonb; n jsonb; a jsonb; ids text[] := '{}'; count_nodes integer := 0; total_units integer := 0;
BEGIN
  IF NOT media_private.json_fields(v, ARRAY['document','fields','values'], ARRAY['aspectRatio','templateId','templateVersion'])
    OR pg_catalog.jsonb_typeof(v->'fields') <> 'array' OR pg_catalog.jsonb_array_length(v->'fields') > 20
    OR pg_catalog.jsonb_typeof(v->'values') <> 'object' THEN RETURN false; END IF;
  IF v ? 'aspectRatio' AND (pg_catalog.jsonb_typeof(v->'aspectRatio') <> 'string' OR v->>'aspectRatio' NOT IN ('square','landscape','portrait')) OR
    v ? 'templateId' AND (pg_catalog.jsonb_typeof(v->'templateId') <> 'string' OR v->>'templateId' !~ '^[a-z][a-z0-9-]{0,59}$') OR
    v ? 'templateVersion' AND (pg_catalog.jsonb_typeof(v->'templateVersion') <> 'number' OR (v->>'templateVersion')::numeric <> trunc((v->>'templateVersion')::numeric) OR (v->>'templateVersion')::numeric < 1 OR (v->>'templateVersion')::numeric > 9007199254740991) THEN RETURN false; END IF;
  FOR f IN SELECT * FROM pg_catalog.jsonb_array_elements(v->'fields') LOOP
    IF NOT media_private.json_fields(f, ARRAY['id','label','defaultValue','required']) OR
      COALESCE(f->>'id','') !~ '^[a-z][a-z0-9-]{0,39}$' OR f->>'id' = ANY(ids) OR
      pg_catalog.jsonb_typeof(f->'label') <> 'string' OR f->>'label' ~ '^[[:space:]]*$' OR media_private.js_length(f->>'label') NOT BETWEEN 1 AND 40 OR
      pg_catalog.jsonb_typeof(f->'defaultValue') <> 'string' OR media_private.js_length(f->>'defaultValue') > 4000 OR
      pg_catalog.jsonb_typeof(f->'required') <> 'boolean' THEN RETURN false; END IF;
    ids := ids || (f->>'id');
  END LOOP;
  IF NOT media_private.json_fields(v->'values', ids) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_each(v->'values') kv WHERE pg_catalog.jsonb_typeof(kv.value) <> 'string' OR media_private.js_length(kv.value #>> '{}') > 4000
  ) OR NOT media_private.json_fields(v->'document', ARRAY['type','content']) OR v->'document'->>'type' <> 'doc' OR
    pg_catalog.jsonb_typeof(v->'document'->'content') <> 'array' OR pg_catalog.jsonb_array_length(v->'document'->'content') > 1000 THEN RETURN false; END IF;
  FOR p IN SELECT * FROM pg_catalog.jsonb_array_elements(v->'document'->'content') LOOP
    IF NOT media_private.json_fields(p, ARRAY['type'], ARRAY['content']) OR p->>'type' <> 'paragraph' OR p ? 'content' AND pg_catalog.jsonb_typeof(p->'content') <> 'array' THEN RETURN false; END IF;
    FOR n IN SELECT * FROM pg_catalog.jsonb_array_elements(COALESCE(p->'content','[]'::jsonb)) LOOP
      count_nodes := count_nodes + 1;
      IF count_nodes > 10000 THEN RETURN false; END IF;
      IF n->>'type' = 'text' AND media_private.json_fields(n, ARRAY['type','text']) AND pg_catalog.jsonb_typeof(n->'text') = 'string' THEN
        total_units := total_units + media_private.js_length(n->>'text');
        IF total_units > 100000 THEN RETURN false; END IF;
        CONTINUE;
      END IF;
      IF n->>'type' = 'hardBreak' AND media_private.json_fields(n, ARRAY['type']) THEN CONTINUE; END IF;
      a := n->'attrs';
      IF n->>'type' <> 'templateField' OR NOT media_private.json_fields(n, ARRAY['type','attrs']) OR
        NOT media_private.json_fields(a, ARRAY['fieldId'], ARRAY['value']) OR NOT (a->>'fieldId' = ANY(ids)) OR
        a ? 'value' AND (pg_catalog.jsonb_typeof(a->'value') <> 'string' OR media_private.js_length(a->>'value') > 4000) THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
CREATE OR REPLACE FUNCTION media_private.valid_record_payload(kind text, payload text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v jsonb := payload::jsonb;
BEGIN
  IF v->'version' IS DISTINCT FROM '1'::jsonb THEN RETURN false; END IF;
  IF kind = 'draft' THEN RETURN media_private.json_fields(v, ARRAY['version','state']) AND media_private.valid_studio(v->'state'); END IF;
  IF kind = 'provider' THEN RETURN media_private.json_fields(v, ARRAY['version','name','baseUrl','model','mode']) AND
    length(v->>'name') BETWEEN 1 AND 80 AND v->>'model' ~ '^[a-zA-Z0-9._:-]{1,128}$'; END IF;
  RETURN media_private.json_fields(v, ARRAY['version','jobId','prompt','modelId','providerInstanceId','mimeType','width','height','bytes','sha256','createdAt']) AND
    v->>'mimeType' = 'image/png' AND length(v->>'modelId') BETWEEN 1 AND 128 AND v->>'sha256' ~ '^[a-f0-9]{64}$' AND
    (v->>'width')::integer BETWEEN 1 AND 4096 AND (v->>'height')::integer BETWEEN 1 AND 4096 AND
    (v->>'bytes')::integer BETWEEN 1 AND 16777216 AND length(v->>'prompt') BETWEEN 1 AND 4000 AND
    (v->>'jobId')::uuid IS NOT NULL AND (v->>'providerInstanceId')::uuid IS NOT NULL AND (v->>'createdAt')::timestamptz IS NOT NULL;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
ALTER TABLE public.media_sync_records DROP CONSTRAINT IF EXISTS media_payload_contract;
ALTER TABLE public.media_sync_records ADD CONSTRAINT media_payload_contract CHECK (media_private.valid_record_payload(kind, payload) IS TRUE);

CREATE TABLE IF NOT EXISTS public.media_content_drafts (
  kind text NOT NULL CHECK (kind IN ('template','provider-policy')), key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9-]{0,59}$'),
  payload jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 262144),
  revision bigint NOT NULL CHECK (revision > 0), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,key)
);
CREATE TABLE IF NOT EXISTS public.media_public_content (
  kind text NOT NULL, key text NOT NULL, payload jsonb NOT NULL, revision bigint NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,key),
  FOREIGN KEY(kind,key) REFERENCES public.media_content_drafts(kind,key)
);
ALTER TABLE public.media_content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_public_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_content_drafts, public.media_public_content FROM anon, authenticated;
GRANT ALL ON public.media_content_drafts, public.media_public_content TO service_role;
GRANT SELECT ON public.media_public_content TO anon, authenticated;
DROP POLICY IF EXISTS media_published_read ON public.media_public_content;
CREATE POLICY media_published_read ON public.media_public_content FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.media_admin_content(p_actor uuid, p_kind text, p_key text, p_action text, p_revision bigint, p_request_id uuid, p_payload jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE old_row public.media_content_drafts; new_row public.media_content_drafts; receipt public.media_admin_audit; result jsonb;
BEGIN
  IF NOT public.media_admin_authorized(p_actor) THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('template','provider-policy') OR p_action NOT IN ('save','publish','withdraw') OR p_request_id IS NULL OR p_revision IS NULL OR p_key !~ '^[a-z][a-z0-9-]{0,59}$' THEN
    RAISE EXCEPTION 'Invalid content operation' USING ERRCODE = '22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_kind || ':' || p_key, 0));
  SELECT * INTO receipt FROM public.media_admin_audit WHERE actor_id = p_actor AND request_id = p_request_id;
  IF receipt.id IS NOT NULL THEN
    IF receipt.action <> 'content-' || p_action OR receipt.target_id <> p_kind || ':' || p_key OR
      p_action = 'save' AND receipt.after_data->'payload' IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Request ID reused' USING ERRCODE = '22023'; END IF;
    RETURN receipt.after_data;
  END IF;
  SELECT * INTO old_row FROM public.media_content_drafts WHERE kind = p_kind AND key = p_key FOR UPDATE;
  IF COALESCE(old_row.revision,0) <> p_revision THEN RAISE EXCEPTION 'Content revision conflict' USING ERRCODE = 'PT409'; END IF;
  IF p_action = 'save' THEN
    INSERT INTO public.media_content_drafts(kind,key,payload,revision) VALUES(p_kind,p_key,p_payload,1)
      ON CONFLICT(kind,key) DO UPDATE SET payload=p_payload, revision=public.media_content_drafts.revision+1, updated_at=pg_catalog.now() RETURNING * INTO new_row;
  ELSE
    IF old_row.revision IS NULL THEN RAISE EXCEPTION 'Content not found' USING ERRCODE = '22023'; END IF;
    new_row := old_row;
  END IF;
  IF p_action = 'publish' THEN
    INSERT INTO public.media_public_content(kind,key,payload,revision) VALUES(p_kind,p_key,new_row.payload,new_row.revision)
      ON CONFLICT(kind,key) DO UPDATE SET payload=excluded.payload, revision=excluded.revision, published_at=pg_catalog.now();
  ELSIF p_action = 'withdraw' THEN DELETE FROM public.media_public_content WHERE kind=p_kind AND key=p_key; END IF;
  result := pg_catalog.to_jsonb(new_row);
  INSERT INTO public.media_admin_audit(actor_id,action,target_id,request_id,before_data,after_data)
    VALUES(p_actor,'content-' || p_action,p_kind || ':' || p_key,p_request_id,pg_catalog.to_jsonb(old_row),result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.media_admin_content(uuid,text,text,text,bigint,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_admin_content(uuid,text,text,text,bigint,uuid,jsonb) TO service_role;

CREATE TABLE IF NOT EXISTS public.media_task_reports (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE, task_id uuid NOT NULL,
  model text NOT NULL, channel text NOT NULL, status text NOT NULL, started_at timestamptz NOT NULL,
  payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,workspace_id,task_id)
);
ALTER TABLE public.media_task_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_task_reports FROM anon, authenticated;
GRANT ALL ON public.media_task_reports TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.media_task_reports TO authenticated;
DROP POLICY IF EXISTS media_report_owner ON public.media_task_reports;
CREATE POLICY media_report_owner ON public.media_task_reports FOR ALL TO authenticated
  USING (owner_id=(SELECT auth.uid()) AND media_private.owns_workspace(workspace_id))
  WITH CHECK (owner_id=(SELECT auth.uid()) AND media_private.owns_workspace(workspace_id));
CREATE OR REPLACE FUNCTION media_private.validate_task_report()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v jsonb := NEW.payload;
BEGIN
  IF NOT media_private.json_fields(v, ARRAY['id','taskId','workspaceId','model','providerId','channel','status','startedAt','source','requestCount','providerUnits','verifiedCost','currency']) OR
    octet_length(v::text)>4096 OR (v->>'id')::uuid <> NEW.id OR (v->>'taskId')::uuid <> NEW.task_id OR (v->>'workspaceId')::uuid <> NEW.workspace_id OR
    v->>'model' <> NEW.model OR length(NEW.model) NOT BETWEEN 1 AND 128 OR v->>'channel' <> NEW.channel OR NEW.channel NOT IN ('direct','proxy') OR
    v->>'status' <> NEW.status OR NEW.status NOT IN ('processing','completed','failed','needs_review') OR (v->>'startedAt')::timestamptz <> NEW.started_at OR
    (v->>'providerId')::uuid IS NULL OR v->>'source' IS DISTINCT FROM 'application' OR v->'providerUnits' <> 'null'::jsonb OR v->'verifiedCost' <> 'null'::jsonb OR v->'currency' <> 'null'::jsonb OR
    v->'requestCount' <> 'null'::jsonb AND (pg_catalog.jsonb_typeof(v->'requestCount') <> 'number' OR (v->>'requestCount')::numeric NOT BETWEEN 0 AND 1000000 OR (v->>'requestCount')::numeric <> trunc((v->>'requestCount')::numeric)) THEN
    RAISE EXCEPTION 'Invalid task report or untrusted usage source' USING ERRCODE='22023'; END IF;
  IF TG_OP='UPDATE' AND (NEW.owner_id<>OLD.owner_id OR NEW.workspace_id<>OLD.workspace_id OR NEW.task_id<>OLD.task_id OR NEW.id<>OLD.id OR NEW.model<>OLD.model OR NEW.channel<>OLD.channel OR NEW.started_at<>OLD.started_at) THEN
    RAISE EXCEPTION 'Task identity is immutable' USING ERRCODE='42501'; END IF;
  NEW.received_at := pg_catalog.now(); RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS media_task_contract ON public.media_task_reports;
CREATE TRIGGER media_task_contract BEFORE INSERT OR UPDATE ON public.media_task_reports FOR EACH ROW EXECUTE FUNCTION media_private.validate_task_report();
CREATE OR REPLACE FUNCTION public.media_submit_task_reports(p_reports jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v jsonb; ids jsonb := '[]';
BEGIN
  IF NOT media_private.account_enabled() THEN RAISE EXCEPTION 'Account required' USING ERRCODE='42501'; END IF;
  IF pg_catalog.jsonb_typeof(p_reports)<>'array' OR pg_catalog.jsonb_array_length(p_reports)>100 THEN RAISE EXCEPTION 'Invalid reports' USING ERRCODE='22023'; END IF;
  FOR v IN SELECT * FROM pg_catalog.jsonb_array_elements(p_reports) LOOP
    INSERT INTO public.media_task_reports(id,workspace_id,task_id,model,channel,status,started_at,payload)
      VALUES((v->>'id')::uuid,(v->>'workspaceId')::uuid,(v->>'taskId')::uuid,v->>'model',v->>'channel',v->>'status',(v->>'startedAt')::timestamptz,v)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload;
    ids := ids || pg_catalog.jsonb_build_array(v->>'id');
  END LOOP;
  RETURN ids;
END;
$$;
REVOKE ALL ON FUNCTION public.media_submit_task_reports(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_submit_task_reports(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
