BEGIN;
CREATE SCHEMA IF NOT EXISTS media_private;
REVOKE ALL ON SCHEMA media_private FROM PUBLIC;
GRANT USAGE ON SCHEMA media_private TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.media_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  disabled boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.media_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.media_binding_requests (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE,
  PRIMARY KEY (owner_id, request_id)
);
CREATE TABLE IF NOT EXISTS public.media_admin_memberships (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE TABLE IF NOT EXISTS public.media_admin_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_id text NOT NULL,
  request_id uuid NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, request_id)
);

CREATE OR REPLACE FUNCTION media_private.account_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.media_accounts WHERE user_id = auth.uid() AND disabled
  );
$$;
CREATE OR REPLACE FUNCTION media_private.owns_workspace(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT media_private.account_enabled() AND EXISTS (
    SELECT 1 FROM public.media_workspaces WHERE id = p_id AND owner_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION media_private.account_enabled(), media_private.owns_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION media_private.account_enabled(), media_private.owns_workspace(uuid) TO authenticated, service_role;

ALTER TABLE public.media_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_binding_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_admin_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_accounts, public.media_workspaces, public.media_binding_requests,
  public.media_admin_memberships, public.media_admin_audit FROM anon, authenticated;
GRANT ALL ON public.media_accounts, public.media_workspaces, public.media_binding_requests,
  public.media_admin_memberships, public.media_admin_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.media_admin_audit_id_seq TO service_role;
GRANT SELECT ON public.media_accounts, public.media_workspaces, public.media_binding_requests TO authenticated;
GRANT INSERT (user_id) ON public.media_accounts TO authenticated;
GRANT INSERT (owner_id, request_id) ON public.media_workspaces TO authenticated;
GRANT INSERT ON public.media_binding_requests TO authenticated;
DROP POLICY IF EXISTS media_self_account ON public.media_accounts;
CREATE POLICY media_self_account ON public.media_accounts FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS media_create_account ON public.media_accounts;
CREATE POLICY media_create_account ON public.media_accounts FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND NOT disabled);
DROP POLICY IF EXISTS media_owner_workspace ON public.media_workspaces;
CREATE POLICY media_owner_workspace ON public.media_workspaces FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND (SELECT media_private.account_enabled()));
DROP POLICY IF EXISTS media_create_workspace ON public.media_workspaces;
CREATE POLICY media_create_workspace ON public.media_workspaces FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()) AND (SELECT media_private.account_enabled()));
DROP POLICY IF EXISTS media_binding_owner ON public.media_binding_requests;
CREATE POLICY media_binding_owner ON public.media_binding_requests FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND media_private.owns_workspace(workspace_id))
  WITH CHECK (owner_id = (SELECT auth.uid()) AND media_private.owns_workspace(workspace_id));

CREATE OR REPLACE FUNCTION public.media_ensure_workspace(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_workspace public.media_workspaces; v_created boolean := false;
BEGIN
  IF NOT media_private.account_enabled() OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Workspace authorization required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  INSERT INTO public.media_accounts(user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  SELECT * INTO v_workspace FROM public.media_workspaces WHERE owner_id = auth.uid();
  IF v_workspace.id IS NULL THEN
    INSERT INTO public.media_workspaces(owner_id, request_id) VALUES (auth.uid(), p_request_id) RETURNING * INTO v_workspace;
    v_created := true;
  END IF;
  INSERT INTO public.media_binding_requests(owner_id, request_id, workspace_id)
    VALUES (auth.uid(), p_request_id, v_workspace.id) ON CONFLICT DO NOTHING;
  RETURN pg_catalog.to_jsonb(v_workspace) || pg_catalog.jsonb_build_object('created', v_created);
END;
$$;
REVOKE ALL ON FUNCTION public.media_ensure_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_ensure_workspace(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.media_sync_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE,
  "sourceId" text,
  kind text NOT NULL CHECK (kind IN ('draft', 'provider', 'work')),
  payload text NOT NULL CHECK (octet_length(payload) <= 262144),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted boolean NOT NULL DEFAULT false,
  "baseRevision" bigint NOT NULL DEFAULT 0 CHECK ("baseRevision" >= 0),
  "createdBy" text NOT NULL DEFAULT auth.uid()::text,
  "updatedBy" text NOT NULL DEFAULT auth.uid()::text,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now()
);
ALTER TABLE public.media_sync_records ADD COLUMN IF NOT EXISTS "sourceId" text;
ALTER TABLE public.media_sync_records ADD COLUMN IF NOT EXISTS "baseRevision" bigint NOT NULL DEFAULT 0;
UPDATE public.media_sync_records SET "sourceId" = id::text, revision = revision + 1 WHERE "sourceId" IS NULL;
ALTER TABLE public.media_sync_records ALTER COLUMN "sourceId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS media_record_source ON public.media_sync_records("workspaceId", kind, "sourceId");
CREATE INDEX IF NOT EXISTS media_sync_workspace ON public.media_sync_records("workspaceId", kind);
ALTER TABLE public.media_sync_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_sync_records FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.media_sync_records TO authenticated;
GRANT ALL ON public.media_sync_records TO service_role;
DROP POLICY IF EXISTS media_record_owner ON public.media_sync_records;
CREATE POLICY media_record_owner ON public.media_sync_records FOR ALL TO authenticated
  USING ("createdBy" = (SELECT auth.uid())::text AND media_private.owns_workspace("workspaceId"))
  WITH CHECK ("createdBy" = (SELECT auth.uid())::text AND "updatedBy" = (SELECT auth.uid())::text AND media_private.owns_workspace("workspaceId"));

CREATE OR REPLACE FUNCTION media_private.validate_sync_record()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_data jsonb; v_allowed text[];
BEGIN
  NEW."sourceId" := COALESCE(NEW."sourceId", NEW.id::text);
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW."workspaceId" <> OLD."workspaceId" OR NEW."sourceId" <> OLD."sourceId" OR NEW."createdBy" <> OLD."createdBy" OR NEW.kind <> OLD.kind THEN
      RAISE EXCEPTION 'Record identity is immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW."baseRevision" <> OLD.revision OR NEW.revision <= OLD.revision THEN
      RAISE EXCEPTION 'Record revision conflict' USING ERRCODE = 'PT409';
    END IF;
    NEW."createdAt" := OLD."createdAt";
  ELSIF NEW.revision <> 1 OR NEW."baseRevision" <> 0 THEN
    RAISE EXCEPTION 'Invalid initial revision' USING ERRCODE = '22023';
  ELSE
    NEW."createdAt" := pg_catalog.now();
  END IF;
  v_data := NEW.payload::jsonb;
  IF pg_catalog.jsonb_typeof(v_data) <> 'object' OR v_data->>'version' <> '1' THEN
    RAISE EXCEPTION 'Invalid record payload' USING ERRCODE = '22023';
  END IF;
  v_allowed := CASE NEW.kind
    WHEN 'provider' THEN ARRAY['version','name','baseUrl','model','mode']
    WHEN 'draft' THEN ARRAY['version','state']
    ELSE ARRAY['version','jobId','prompt','modelId','providerInstanceId','mimeType','width','height','bytes','sha256','createdAt'] END;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(v_data) k WHERE NOT k = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Record contains private or unknown fields' USING ERRCODE = '22023';
  END IF;
  IF NEW.kind = 'provider' AND (
    COALESCE(v_data->>'name','') = '' OR COALESCE(v_data->>'model','') = '' OR
    COALESCE(v_data->>'baseUrl','') !~ '^https://[^/@?#[:space:]]+(/[^@?#[:space:]]*)?$' OR
    COALESCE(v_data->>'mode','') NOT IN ('direct','proxy')
  ) THEN RAISE EXCEPTION 'Invalid public provider' USING ERRCODE = '22023'; END IF;
  IF NEW.kind = 'draft' AND pg_catalog.jsonb_typeof(v_data->'state') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid draft state' USING ERRCODE = '22023';
  END IF;
  NEW."updatedAt" := pg_catalog.now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS media_record_contract ON public.media_sync_records;
CREATE TRIGGER media_record_contract BEFORE INSERT OR UPDATE ON public.media_sync_records
  FOR EACH ROW EXECUTE FUNCTION media_private.validate_sync_record();
NOTIFY pgrst, 'reload schema';
COMMIT;
