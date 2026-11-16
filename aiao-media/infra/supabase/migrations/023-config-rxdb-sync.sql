BEGIN;

-- 配置实体与领域提交投影接入 RxDB 同步（MEDIA-US-307/308，Spec Kit T051）。
-- 配置实体（模板、供应商策略、平台模型）按 RxDB 形状建表，经变更日志按工作区双向同步；
-- 领域提交投影换到 RxDB 形状的新表，以查询缓存读写，状态只由服务端 RPC 推进。
-- RxDB 内部提交图（Commit / CommitChangeSet 等系统表）不进入远端。018 的旧投影表保留数据，停止接收客户端写入。
-- 本地 migrate 会按序重放全部迁移，本文件必须幂等，且在 018～021 重放之后仍是最终定义。

-- 1. 配置实体表 ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION media_private.guard_config_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW."workspaceId" <> OLD."workspaceId" OR NEW."createdBy" <> OLD."createdBy" THEN
    RAISE EXCEPTION 'Config record identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION media_private.guard_config_identity() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.media_prompt_templates (
  id uuid PRIMARY KEY,
  "workspaceId" uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  "branchId" text CHECK ("branchId" IS NULL OR length("branchId") BETWEEN 1 AND 128),
  "deletedAt" timestamptz(3),
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 200),
  title text NOT NULL,
  prompt text NOT NULL,
  purpose text,
  style text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  enabled boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "createdBy" text NOT NULL DEFAULT auth.uid()::text,
  "updatedBy" text NOT NULL DEFAULT auth.uid()::text
);
CREATE UNIQUE INDEX IF NOT EXISTS media_prompt_templates_workspace_key
  ON public.media_prompt_templates ("workspaceId", key);

CREATE TABLE IF NOT EXISTS public.media_provider_policies (
  id uuid PRIMARY KEY,
  "workspaceId" uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  "branchId" text CHECK ("branchId" IS NULL OR length("branchId") BETWEEN 1 AND 128),
  "deletedAt" timestamptz(3),
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 200),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  providers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(providers) = 'array'),
  enabled boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "createdBy" text NOT NULL DEFAULT auth.uid()::text,
  "updatedBy" text NOT NULL DEFAULT auth.uid()::text
);
CREATE UNIQUE INDEX IF NOT EXISTS media_provider_policies_workspace_key
  ON public.media_provider_policies ("workspaceId", key);

CREATE TABLE IF NOT EXISTS public.media_platform_models (
  id uuid PRIMARY KEY,
  "workspaceId" uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  "branchId" text CHECK ("branchId" IS NULL OR length("branchId") BETWEEN 1 AND 128),
  "deletedAt" timestamptz(3),
  "providerId" text NOT NULL CHECK (length("providerId") BETWEEN 1 AND 200),
  "modelId" text NOT NULL CHECK (length("modelId") BETWEEN 1 AND 200),
  "displayName" text NOT NULL,
  capabilities text[] NOT NULL DEFAULT '{}'::text[],
  enabled boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "createdBy" text NOT NULL DEFAULT auth.uid()::text,
  "updatedBy" text NOT NULL DEFAULT auth.uid()::text
);
CREATE UNIQUE INDEX IF NOT EXISTS media_platform_models_workspace_model
  ON public.media_platform_models ("workspaceId", "providerId", "modelId");

DO $config_entities$
DECLARE
  config_table text;
BEGIN
  FOREACH config_table IN ARRAY ARRAY['media_prompt_templates', 'media_provider_policies', 'media_platform_models'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', config_table);
    EXECUTE pg_catalog.format('REVOKE ALL ON public.%I FROM anon, authenticated', config_table);
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', config_table);
    EXECUTE pg_catalog.format('GRANT ALL ON public.%I TO service_role', config_table);
    EXECUTE pg_catalog.format('DROP POLICY IF EXISTS %I ON public.%I', config_table || '_admin', config_table);
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.media_admin_authorized() AND media_private.owns_workspace("workspaceId"))
         WITH CHECK (
           public.media_admin_authorized() AND media_private.owns_workspace("workspaceId")
           AND "createdBy" = (SELECT auth.uid())::text AND "updatedBy" = (SELECT auth.uid())::text
         )',
      config_table || '_admin',
      config_table
    );
    EXECUTE pg_catalog.format(
      'CREATE OR REPLACE TRIGGER media_config_identity BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION media_private.guard_config_identity()',
      config_table
    );
  END LOOP;
END
$config_entities$;

SELECT public.rxdb_enable_sync_for_table('media_prompt_templates', 'public', 'MediaPromptTemplate');
SELECT public.rxdb_enable_sync_for_table('media_provider_policies', 'public', 'MediaProviderPolicy');
SELECT public.rxdb_enable_sync_for_table('media_platform_models', 'public', 'MediaPlatformModel');

-- 2. 配置变更日志只对本工作区管理员可读 -----------------------------------------

-- 推送与触发器写入的日志都带行快照；删除日志只有 beforeData。格式不合法时返回 NULL，不让整次拉取失败。
CREATE OR REPLACE FUNCTION media_private.change_workspace(p_after jsonb, p_before jsonb)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN source.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN source.value::uuid
  END
  FROM (SELECT COALESCE(p_after->>'workspaceId', p_before->>'workspaceId') AS value) source
$$;
REVOKE ALL ON FUNCTION media_private.change_workspace(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION media_private.change_workspace(jsonb, jsonb) TO authenticated, service_role;

DROP POLICY IF EXISTS media_config_changes ON public.rxdb_change;
CREATE POLICY media_config_changes ON public.rxdb_change FOR SELECT TO authenticated USING (
  namespace = 'public'
  AND entity IN ('MediaPromptTemplate', 'MediaProviderPolicy', 'MediaPlatformModel')
  AND "branchId" = 'main'
  AND public.media_admin_authorized()
  AND media_private.owns_workspace(media_private.change_workspace("afterData", "beforeData"))
);

-- 3. 领域提交投影（查询缓存，服务端推进状态） ---------------------------------------

CREATE TABLE IF NOT EXISTS public.media_config_projection_commits (
  id uuid PRIMARY KEY,
  "workspaceId" uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE,
  "branchId" text NOT NULL CHECK (length("branchId") BETWEEN 1 AND 128),
  "parentIds" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "authorId" uuid NOT NULL REFERENCES auth.users(id),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  "operationId" uuid NOT NULL,
  "contentFingerprint" text NOT NULL CHECK ("contentFingerprint" ~ '^[a-f0-9]{64}$'),
  "changeCount" integer NOT NULL CHECK ("changeCount" > 0),
  status text NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared', 'synced', 'validated', 'applied', 'released', 'rejected')),
  "appliedAt" timestamptz(3),
  "releasedAt" timestamptz(3),
  "rejectionCode" text,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "createdBy" text NOT NULL DEFAULT auth.uid()::text,
  "updatedBy" text NOT NULL DEFAULT auth.uid()::text,
  UNIQUE ("workspaceId", "operationId"),
  UNIQUE ("workspaceId", id)
);
CREATE INDEX IF NOT EXISTS media_config_projection_commits_branch
  ON public.media_config_projection_commits ("workspaceId", "branchId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public.media_config_projection_changes (
  id uuid PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "commitId" uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  entity text NOT NULL CHECK (entity IN ('MediaPromptTemplate', 'MediaProviderPolicy', 'MediaPlatformModel')),
  "entityId" text NOT NULL CHECK (length("entityId") BETWEEN 1 AND 128),
  operation text NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  patch jsonb NOT NULL,
  "inversePatch" jsonb,
  "expectedRevision" bigint CHECK ("expectedRevision" IS NULL OR "expectedRevision" >= 0),
  "contentFingerprint" text NOT NULL CHECK ("contentFingerprint" ~ '^[a-f0-9]{64}$'),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "createdBy" text NOT NULL DEFAULT auth.uid()::text,
  "updatedBy" text NOT NULL DEFAULT auth.uid()::text,
  UNIQUE ("commitId", sequence),
  FOREIGN KEY ("workspaceId", "commitId")
    REFERENCES public.media_config_projection_commits ("workspaceId", id) ON DELETE CASCADE
);

-- 客户端（authenticated / anon）只能写 prepared，变更到齐后标记 synced；其余状态与内容由定义者身份的 RPC 推进。
CREATE OR REPLACE FUNCTION media_private.guard_config_projection_commit()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  change_count bigint;
  first_sequence integer;
  last_sequence integer;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'prepared' OR NEW."appliedAt" IS NOT NULL OR NEW."releasedAt" IS NOT NULL OR NEW."rejectionCode" IS NOT NULL THEN
      RAISE EXCEPTION 'Config commit projection must start as prepared' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id <> OLD.id OR NEW."workspaceId" <> OLD."workspaceId" OR NEW."branchId" <> OLD."branchId"
    OR NEW."parentIds" <> OLD."parentIds" OR NEW."authorId" <> OLD."authorId" OR NEW.message <> OLD.message
    OR NEW."operationId" <> OLD."operationId" OR NEW."contentFingerprint" <> OLD."contentFingerprint"
    OR NEW."changeCount" <> OLD."changeCount" OR NEW."createdBy" <> OLD."createdBy"
    OR NEW."appliedAt" IS DISTINCT FROM OLD."appliedAt" OR NEW."releasedAt" IS DISTINCT FROM OLD."releasedAt"
    OR NEW."rejectionCode" IS DISTINCT FROM OLD."rejectionCode" THEN
    RAISE EXCEPTION 'Config commit projection is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status <> 'prepared' OR NEW.status <> 'synced' THEN
    RAISE EXCEPTION 'Config commit status is advanced by the server' USING ERRCODE = '42501';
  END IF;
  SELECT count(*), min(sequence), max(sequence) INTO change_count, first_sequence, last_sequence
  FROM public.media_config_projection_changes
  WHERE "commitId" = NEW.id;
  IF change_count <> NEW."changeCount" OR first_sequence <> 1 OR last_sequence <> NEW."changeCount" THEN
    RAISE EXCEPTION 'Config commit changes are incomplete' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION media_private.guard_config_projection_commit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION media_private.guard_config_projection_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.media_config_projection_commits commit
    WHERE commit.id = NEW."commitId"
      AND commit."workspaceId" = NEW."workspaceId"
      AND commit.status = 'prepared'
      AND NEW.sequence <= commit."changeCount"
  ) THEN
    RAISE EXCEPTION 'Config commit no longer accepts changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION media_private.guard_config_projection_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER media_config_projection_commit_guard
  BEFORE INSERT OR UPDATE ON public.media_config_projection_commits
  FOR EACH ROW EXECUTE FUNCTION media_private.guard_config_projection_commit();
CREATE OR REPLACE TRIGGER media_config_projection_change_guard
  BEFORE INSERT ON public.media_config_projection_changes
  FOR EACH ROW EXECUTE FUNCTION media_private.guard_config_projection_change();
CREATE OR REPLACE TRIGGER rxdb_timestamp_trigger
  BEFORE UPDATE ON public.media_config_projection_commits
  FOR EACH ROW EXECUTE FUNCTION public.rxdb_update_timestamp_trigger();
CREATE OR REPLACE TRIGGER rxdb_timestamp_trigger
  BEFORE UPDATE ON public.media_config_projection_changes
  FOR EACH ROW EXECUTE FUNCTION public.rxdb_update_timestamp_trigger();

ALTER TABLE public.media_config_projection_commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_config_projection_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_config_projection_commits, public.media_config_projection_changes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.media_config_projection_commits TO authenticated;
GRANT SELECT, INSERT ON public.media_config_projection_changes TO authenticated;
GRANT ALL ON public.media_config_projection_commits, public.media_config_projection_changes TO service_role;

DROP POLICY IF EXISTS media_config_projection_commits_admin ON public.media_config_projection_commits;
CREATE POLICY media_config_projection_commits_admin ON public.media_config_projection_commits
  FOR ALL TO authenticated
  USING (public.media_admin_authorized() AND media_private.owns_workspace("workspaceId"))
  WITH CHECK (
    public.media_admin_authorized() AND media_private.owns_workspace("workspaceId")
    AND "authorId" = (SELECT auth.uid()) AND "createdBy" = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS media_config_projection_changes_admin ON public.media_config_projection_changes;
CREATE POLICY media_config_projection_changes_admin ON public.media_config_projection_changes
  FOR ALL TO authenticated
  USING (public.media_admin_authorized() AND media_private.owns_workspace("workspaceId"))
  WITH CHECK (
    public.media_admin_authorized() AND media_private.owns_workspace("workspaceId")
    AND "createdBy" = (SELECT auth.uid())::text
  );

-- 4. 018 旧投影迁入新表，旧表只读 ----------------------------------------------

-- 只迁移变更完整、实体合法的旧提交；没有任何变更的 prepared 残留不迁移，由本机工作树补偿扫描重新生成。
INSERT INTO public.media_config_projection_commits (
  id, "workspaceId", "branchId", "parentIds", "authorId", message, "operationId", "contentFingerprint",
  "changeCount", status, "appliedAt", "releasedAt", "rejectionCode", "createdAt", "createdBy", "updatedBy"
)
SELECT
  legacy.id, legacy.workspace_id, legacy.branch_id, legacy.parent_ids, legacy.author_id, legacy.message,
  legacy.operation_id, legacy.content_fingerprint, counts.total, legacy.status, legacy.applied_at,
  legacy.released_at, legacy.rejection_code, legacy.created_at, legacy.author_id::text, legacy.author_id::text
FROM public.media_config_commits legacy
JOIN LATERAL (
  SELECT
    count(*)::integer AS total,
    count(*) FILTER (WHERE change.entity IN ('MediaPromptTemplate', 'MediaProviderPolicy', 'MediaPlatformModel'))::integer AS valid
  FROM public.media_config_commit_changes change
  WHERE change.commit_id = legacy.id
) counts ON counts.total > 0 AND counts.total = counts.valid
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.media_config_projection_changes (
  id, "workspaceId", "commitId", sequence, entity, "entityId", operation, patch, "inversePatch",
  "expectedRevision", "contentFingerprint", "createdAt", "createdBy", "updatedBy"
)
SELECT
  change.id, projected."workspaceId", change.commit_id, change.sequence, change.entity, change.entity_id,
  change.operation, change.patch, change.inverse_patch, change.expected_revision, change.content_fingerprint,
  projected."createdAt", projected."createdBy", projected."createdBy"
FROM public.media_config_commit_changes change
JOIN public.media_config_projection_commits projected ON projected.id = change.commit_id
ON CONFLICT (id) DO NOTHING;

REVOKE INSERT, UPDATE, DELETE ON public.media_config_commits, public.media_config_commit_changes FROM authenticated;

-- 5. 应用与回滚改读新投影表 --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_media_config_commit(
  p_commit_id uuid,
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  commit_row public.media_config_projection_commits;
  change_row public.media_config_projection_changes;
  current_row public.media_config_records;
  actual_count bigint;
  minimum_sequence integer;
  maximum_sequence integer;
  current_revision bigint;
  next_revision bigint;
  value jsonb;
  result jsonb := '[]'::jsonb;
  reused jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT public.media_admin_authorized() THEN
    RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_commit_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Invalid config commit operation' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO commit_row
  FROM public.media_config_projection_commits
  WHERE id = p_commit_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Config commit not found' USING ERRCODE = 'P0002';
  END IF;
  IF commit_row."operationId" <> p_operation_id THEN
    RAISE EXCEPTION 'Operation ID does not match config commit' USING ERRCODE = '22023';
  END IF;
  IF NOT media_private.owns_workspace(commit_row."workspaceId") THEN
    RAISE EXCEPTION 'Workspace authorization required' USING ERRCODE = '42501';
  END IF;

  SELECT audit.after_data INTO reused
  FROM public.media_admin_audit audit
  WHERE audit.actor_id = v_actor_id
    AND audit.action = 'config-commit-apply'
    AND audit.request_id = p_operation_id;
  IF reused IS NOT NULL THEN
    RETURN jsonb_build_object('commitId', p_commit_id, 'operationId', p_operation_id, 'status', 'applied', 'reused', true, 'revisions', reused);
  END IF;
  IF commit_row.status IN ('applied', 'released') THEN
    RAISE EXCEPTION 'Config commit was applied without an idempotency receipt' USING ERRCODE = '22023';
  END IF;
  IF commit_row.status NOT IN ('synced', 'validated') THEN
    RAISE EXCEPTION 'Config commit is not ready to apply' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(array_length(commit_row."parentIds", 1), 0) > 0 AND EXISTS (
    SELECT 1
    FROM unnest(commit_row."parentIds") parent_id
    LEFT JOIN public.media_config_projection_commits parent ON parent.id = parent_id
      AND parent."workspaceId" = commit_row."workspaceId"
      AND parent."branchId" = commit_row."branchId"
    WHERE parent.id IS NULL OR parent.status NOT IN ('applied', 'released')
  ) THEN
    RAISE EXCEPTION 'Config commit parent is missing or not applied' USING ERRCODE = '40001';
  END IF;

  SELECT count(*), min(sequence), max(sequence)
  INTO actual_count, minimum_sequence, maximum_sequence
  FROM public.media_config_projection_changes
  WHERE "commitId" = p_commit_id;
  IF actual_count <> commit_row."changeCount" OR minimum_sequence <> 1 OR maximum_sequence <> commit_row."changeCount" THEN
    RAISE EXCEPTION 'Config commit changes are incomplete' USING ERRCODE = '22023';
  END IF;

  FOR change_row IN
    SELECT *
    FROM public.media_config_projection_changes
    WHERE "commitId" = p_commit_id
    ORDER BY sequence
  LOOP
    IF change_row.operation <> 'delete' AND (jsonb_typeof(change_row.patch) <> 'object' OR NOT change_row.patch ? 'value') THEN
      RAISE EXCEPTION 'Config change patch must contain value' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO current_row
    FROM public.media_config_records
    WHERE workspace_id = commit_row."workspaceId"
      AND branch_id = commit_row."branchId"
      AND entity = change_row.entity
      AND entity_id = change_row."entityId"
    FOR UPDATE;
    current_revision := COALESCE(current_row.revision, 0);
    IF change_row."expectedRevision" IS NOT NULL AND change_row."expectedRevision" <> current_revision THEN
      RAISE EXCEPTION 'Config revision conflict' USING ERRCODE = '40001';
    END IF;
    IF change_row.operation = 'insert' AND current_row.revision IS NOT NULL AND NOT current_row.deleted THEN
      RAISE EXCEPTION 'Config record already exists' USING ERRCODE = '40001';
    END IF;
    next_revision := current_revision + 1;

    IF change_row.operation = 'delete' THEN
      INSERT INTO public.media_config_records(
        workspace_id, branch_id, entity, entity_id, revision, payload, deleted, updated_by
      ) VALUES (
        commit_row."workspaceId", commit_row."branchId", change_row.entity, change_row."entityId",
        next_revision, NULL, true, v_actor_id
      )
      ON CONFLICT (workspace_id, branch_id, entity, entity_id) DO UPDATE SET
        revision = EXCLUDED.revision,
        payload = NULL,
        deleted = true,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
    ELSE
      value := change_row.patch->'value';
      INSERT INTO public.media_config_records(
        workspace_id, branch_id, entity, entity_id, revision, payload, deleted, updated_by
      ) VALUES (
        commit_row."workspaceId", commit_row."branchId", change_row.entity, change_row."entityId",
        next_revision, value, false, v_actor_id
      )
      ON CONFLICT (workspace_id, branch_id, entity, entity_id) DO UPDATE SET
        revision = EXCLUDED.revision,
        payload = EXCLUDED.payload,
        deleted = false,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
    END IF;
    result := result || jsonb_build_array(jsonb_build_object(
      'sequence', change_row.sequence,
      'entity', change_row.entity,
      'entityId', change_row."entityId",
      'revision', next_revision
    ));
  END LOOP;

  INSERT INTO public.media_admin_audit(actor_id, action, target_id, request_id, after_data)
    VALUES (v_actor_id, 'config-commit-apply', p_commit_id::text, p_operation_id, result);
  UPDATE public.media_config_projection_commits
  SET status = 'applied', "appliedAt" = now(), "updatedBy" = v_actor_id::text
  WHERE id = p_commit_id;

  RETURN jsonb_build_object(
    'commitId', p_commit_id,
    'operationId', p_operation_id,
    'status', 'applied',
    'reused', false,
    'revisions', result
  );
END;
$$;
REVOKE ALL ON FUNCTION public.apply_media_config_commit(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_media_config_commit(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rollback_media_config_commit(
  p_commit_id uuid,
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  commit_row public.media_config_projection_commits;
  change_row public.media_config_projection_changes;
  current_row public.media_config_records;
  expected_revision bigint;
  current_revision bigint;
  value jsonb;
  result jsonb := '[]'::jsonb;
  reused jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT public.media_admin_authorized() THEN
    RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_commit_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Invalid config rollback operation' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO commit_row
  FROM public.media_config_projection_commits
  WHERE id = p_commit_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Config commit not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT media_private.owns_workspace(commit_row."workspaceId") THEN
    RAISE EXCEPTION 'Workspace authorization required' USING ERRCODE = '42501';
  END IF;

  SELECT audit.after_data INTO reused
  FROM public.media_admin_audit audit
  WHERE audit.actor_id = v_actor_id
    AND audit.action = 'config-commit-rollback'
    AND audit.request_id = p_operation_id;
  IF reused IS NOT NULL THEN
    RETURN jsonb_build_object(
      'commitId', p_commit_id,
      'operationId', p_operation_id,
      'status', 'rolled_back',
      'reused', true,
      'revisions', reused
    );
  END IF;
  IF commit_row.status NOT IN ('applied', 'released') THEN
    RAISE EXCEPTION 'Config commit is not applied' USING ERRCODE = '22023';
  END IF;

  FOR change_row IN
    SELECT *
    FROM public.media_config_projection_changes
    WHERE "commitId" = p_commit_id
    ORDER BY sequence DESC
  LOOP
    SELECT * INTO current_row
    FROM public.media_config_records
    WHERE workspace_id = commit_row."workspaceId"
      AND branch_id = commit_row."branchId"
      AND entity = change_row.entity
      AND entity_id = change_row."entityId"
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Config record for rollback is missing' USING ERRCODE = '40001';
    END IF;
    current_revision := current_row.revision;
    expected_revision := COALESCE(change_row."expectedRevision", 0) + 1;
    IF current_revision <> expected_revision THEN
      RAISE EXCEPTION 'Config rollback revision conflict' USING ERRCODE = '40001';
    END IF;

    IF change_row."inversePatch" IS NULL OR NOT (change_row."inversePatch" ? 'value') OR jsonb_typeof(change_row."inversePatch"->'value') = 'null' THEN
      INSERT INTO public.media_config_records(
        workspace_id, branch_id, entity, entity_id, revision, payload, deleted, updated_by
      ) VALUES (
        commit_row."workspaceId", commit_row."branchId", change_row.entity, change_row."entityId",
        current_revision + 1, NULL, true, v_actor_id
      )
      ON CONFLICT (workspace_id, branch_id, entity, entity_id) DO UPDATE SET
        revision = EXCLUDED.revision,
        payload = NULL,
        deleted = true,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
    ELSE
      value := change_row."inversePatch"->'value';
      INSERT INTO public.media_config_records(
        workspace_id, branch_id, entity, entity_id, revision, payload, deleted, updated_by
      ) VALUES (
        commit_row."workspaceId", commit_row."branchId", change_row.entity, change_row."entityId",
        current_revision + 1, value, false, v_actor_id
      )
      ON CONFLICT (workspace_id, branch_id, entity, entity_id) DO UPDATE SET
        revision = EXCLUDED.revision,
        payload = EXCLUDED.payload,
        deleted = false,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
    END IF;
    result := result || jsonb_build_array(jsonb_build_object(
      'sequence', change_row.sequence,
      'entity', change_row.entity,
      'entityId', change_row."entityId",
      'revision', current_revision + 1
    ));
  END LOOP;

  INSERT INTO public.media_admin_audit(actor_id, action, target_id, request_id, after_data)
    VALUES (v_actor_id, 'config-commit-rollback', p_commit_id::text, p_operation_id, result);

  RETURN jsonb_build_object(
    'commitId', p_commit_id,
    'operationId', p_operation_id,
    'status', 'rolled_back',
    'reused', false,
    'revisions', result
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rollback_media_config_commit(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_media_config_commit(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
