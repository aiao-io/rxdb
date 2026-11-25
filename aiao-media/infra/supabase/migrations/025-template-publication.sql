BEGIN;

-- 管理员以自己的 JWT 调用包装函数，底层带 actor 参数的函数仍只对服务端开放。
ALTER FUNCTION public.media_admin_platform_configuration_self_write(bigint, uuid, jsonb, jsonb) SECURITY DEFINER;

-- 记录同一工作区实体上次发布的标识。改名、停用、删除时可以精确撤下上一版。
CREATE TABLE IF NOT EXISTS media_private.template_publications (
  workspace_id uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE,
  entity_id text NOT NULL,
  key text NOT NULL,
  revision bigint NOT NULL,
  PRIMARY KEY (workspace_id, entity_id)
);

CREATE OR REPLACE FUNCTION media_private.template_public_payload(v jsonb, previous jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  result jsonb;
  field text;
BEGIN
  result := jsonb_build_object(
    'alt', '模板预览', 'image', '/prompt-art/coffee-launch.svg', 'author', 'Aiao',
    'source', 'Aiao 原创', 'rights', 'aiao-original-text-and-svg', 'referenceModel', NULL,
    'needsReference', false, 'featuredRank', NULL
  ) || COALESCE(previous, '{}'::jsonb) || jsonb_build_object(
    'id', v->>'key', 'title', v->'title', 'prompt', v->'prompt',
    'purpose', COALESCE(NULLIF(v->>'purpose', ''), '创意设计'),
    'style', COALESCE(NULLIF(v->>'style', ''), '通用'),
    'tags', COALESCE(NULLIF(v->'tags', 'null'::jsonb), '[]'::jsonb),
    'updatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  );
  IF previous->>'prompt' IS DISTINCT FROM v->>'prompt' THEN
    result := result - 'templateDocument' - 'fields';
  END IF;
  FOREACH field IN ARRAY ARRAY['title', 'prompt', 'style', 'purpose'] LOOP
    IF jsonb_typeof(result->field) IS DISTINCT FROM 'string' OR result->>field !~ '[^[:space:]]'
      OR media_private.js_length(result->>field) > 10000 THEN
      RAISE EXCEPTION 'Invalid template field: %', field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(result->'tags') <> 'array' OR jsonb_array_length(result->'tags') > 20 OR EXISTS (
    SELECT FROM jsonb_array_elements(result->'tags') tag WHERE jsonb_typeof(tag) <> 'string'
      OR (tag #>> '{}') !~ '[^[:space:]]' OR media_private.js_length(tag #>> '{}') > 60
  ) OR (NOT result ? 'templateDocument' AND cardinality(string_to_array(result->>'prompt', chr(10))) > 1000) THEN
    RAISE EXCEPTION 'Invalid template tags or prompt' USING ERRCODE = '22023';
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_media_template_commit(p_commit_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  c public.media_config_projection_commits;
  change public.media_config_projection_changes;
  applied public.media_config_records;
  last_release media_private.template_publications;
  draft public.media_content_drafts;
  target_key text;
  old_key text;
  previous jsonb;
  published jsonb;
  applied_receipt public.media_admin_audit;
  applied_revision bigint;
  has_templates boolean := false;
BEGIN
  IF actor IS NULL OR NOT public.media_admin_authorized() THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO STRICT c FROM public.media_config_projection_commits WHERE id = p_commit_id FOR UPDATE;
  IF NOT media_private.owns_workspace(c."workspaceId") THEN
    RAISE EXCEPTION 'Workspace authorization required' USING ERRCODE = '42501';
  END IF;
  IF c."releasedAt" IS NOT NULL THEN RETURN; END IF;
  IF c."branchId" <> 'main' OR c.status <> 'applied' THEN
    RAISE EXCEPTION 'Apply main commit before release' USING ERRCODE = 'PT409';
  END IF;
  SELECT * INTO STRICT applied_receipt FROM public.media_admin_audit
    WHERE action = 'config-commit-apply' AND target_id = c.id::text AND request_id = c."operationId";
  FOR change IN SELECT DISTINCT ON ("entityId") * FROM public.media_config_projection_changes
    WHERE "commitId" = c.id AND entity = 'MediaPromptTemplate' ORDER BY "entityId", sequence DESC
  LOOP
    has_templates := true;
    SELECT (item->>'revision')::bigint INTO STRICT applied_revision
      FROM jsonb_array_elements(applied_receipt.after_data) item WHERE (item->>'sequence')::integer = change.sequence;
    SELECT * INTO applied FROM public.media_config_records WHERE workspace_id = c."workspaceId"
      AND branch_id = 'main' AND entity = change.entity AND entity_id = change."entityId" FOR UPDATE;
    IF NOT FOUND OR applied.revision <> applied_revision
      OR applied.deleted IS DISTINCT FROM (change.operation = 'delete')
      OR (NOT applied.deleted AND applied.payload IS DISTINCT FROM change.patch->'value') THEN
      RAISE EXCEPTION 'Template was changed or rolled back' USING ERRCODE = 'PT409';
    END IF;
    SELECT * INTO last_release FROM media_private.template_publications
      WHERE workspace_id = c."workspaceId" AND entity_id = change."entityId";
    old_key := COALESCE(last_release.key, change."inversePatch"->'value'->>'key');
    target_key := COALESCE(applied.payload->>'key', old_key);
    IF target_key IS NULL OR target_key !~ '^[a-z][a-z0-9-]{0,59}$' THEN
      RAISE EXCEPTION 'Invalid template key' USING ERRCODE = '22023';
    END IF;
    -- 与旧发布接口共用同一把标识锁，跨工作区写同一目录时核对最后读取的版本。
    PERFORM pg_advisory_xact_lock(hashtextextended('template:' || k, 0))
      FROM (SELECT DISTINCT unnest(ARRAY[old_key, target_key]) AS k ORDER BY k) keys WHERE k IS NOT NULL;
    SELECT payload INTO previous FROM public.media_public_content WHERE kind = 'template' AND key = COALESCE(old_key, target_key);
    SELECT * INTO draft FROM public.media_content_drafts WHERE kind = 'template' AND key = COALESCE(old_key, target_key);
    IF (last_release.key IS NOT NULL AND draft.revision IS DISTINCT FROM last_release.revision)
      OR draft.updated_at > applied_receipt.created_at THEN
      RAISE EXCEPTION 'Published template revision conflict' USING ERRCODE = 'PT409';
    END IF;
    IF EXISTS (
      SELECT FROM media_private.template_publications source
      WHERE source.key = draft.key AND source.revision = draft.revision
        AND (source.workspace_id, source.entity_id) <> (c."workspaceId", change."entityId")
    ) AND (change."inversePatch"->'value' IS NULL OR
      (draft.payload @> jsonb_strip_nulls((change."inversePatch"->'value') - 'key' - 'enabled')) IS NOT TRUE) THEN
      RAISE EXCEPTION 'Another template owns this published version' USING ERRCODE = 'PT409';
    END IF;
    IF old_key IS NOT NULL AND old_key <> target_key THEN
      IF draft.key IS NOT NULL THEN
        PERFORM public.media_admin_content(actor, 'template', old_key, 'withdraw', draft.revision, gen_random_uuid());
      END IF;
      SELECT * INTO draft FROM public.media_content_drafts WHERE kind = 'template' AND key = target_key;
      IF draft.key IS NOT NULL THEN
        RAISE EXCEPTION 'Template key already exists' USING ERRCODE = 'PT409';
      END IF;
    END IF;
    IF applied.deleted OR applied.payload->'enabled' = 'false'::jsonb THEN
      IF draft.key IS NOT NULL THEN
        PERFORM public.media_admin_content(actor, 'template', target_key, 'withdraw', draft.revision, gen_random_uuid());
      END IF;
      DELETE FROM media_private.template_publications WHERE workspace_id = c."workspaceId" AND entity_id = change."entityId";
    ELSE
      published := media_private.template_public_payload(applied.payload, previous);
      PERFORM public.media_admin_content(actor, 'template', target_key, 'save', COALESCE(draft.revision, 0), gen_random_uuid(), published);
      PERFORM public.media_admin_content(actor, 'template', target_key, 'publish', COALESCE(draft.revision, 0)+1, gen_random_uuid());
      INSERT INTO media_private.template_publications(workspace_id, entity_id, key, revision)
        VALUES (c."workspaceId", change."entityId", target_key, COALESCE(draft.revision, 0)+1)
        ON CONFLICT (workspace_id, entity_id) DO UPDATE SET key = EXCLUDED.key, revision = EXCLUDED.revision;
    END IF;
  END LOOP;
  IF NOT has_templates THEN RAISE EXCEPTION 'No templates in commit' USING ERRCODE = '22023'; END IF;
  UPDATE public.media_config_projection_commits SET "releasedAt" = now(), "updatedBy" = actor::text,
    status = CASE WHEN EXISTS(SELECT FROM public.media_config_projection_changes WHERE "commitId" = c.id AND entity <> 'MediaPromptTemplate')
      THEN 'applied' ELSE 'released' END
    WHERE id = c.id;
  INSERT INTO public.media_admin_audit(actor_id, action, target_id, request_id)
    VALUES (actor, 'template-commit-release', c.id::text, gen_random_uuid());
END;
$$;
REVOKE ALL ON FUNCTION media_private.template_public_payload(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_media_template_commit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_media_template_commit(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
