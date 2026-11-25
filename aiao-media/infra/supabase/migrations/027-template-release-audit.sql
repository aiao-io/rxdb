BEGIN;

-- 只保存公开展示字段，历史详情独立于后续草稿、改名和撤下操作。
CREATE OR REPLACE FUNCTION media_private.template_release_snapshot(template_key text, payload jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'key', template_key, 'title', payload->'title', 'image', payload->'image', 'alt', payload->'alt',
    'author', payload->'author', 'source', payload->'source', 'rights', payload->'rights'
  );
$$;
REVOKE ALL ON FUNCTION media_private.template_release_snapshot(text, jsonb) FROM PUBLIC, anon, authenticated;

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
  templates jsonb := '[]'::jsonb;
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
    published := NULL;
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
    templates := templates || jsonb_build_array(jsonb_build_object(
      'key', target_key,
      'before', media_private.template_release_snapshot(COALESCE(old_key, target_key), previous),
      'after', media_private.template_release_snapshot(target_key, published)
    ));
  END LOOP;
  IF jsonb_array_length(templates) = 0 THEN RAISE EXCEPTION 'No templates in commit' USING ERRCODE = '22023'; END IF;
  UPDATE public.media_config_projection_commits SET "releasedAt" = now(), "updatedBy" = actor::text,
    status = CASE WHEN EXISTS(SELECT FROM public.media_config_projection_changes WHERE "commitId" = c.id AND entity <> 'MediaPromptTemplate')
      THEN 'applied' ELSE 'released' END
    WHERE id = c.id;
  INSERT INTO public.media_admin_audit(actor_id, action, target_id, request_id, after_data)
    VALUES (actor, 'template-commit-release', c.id::text, gen_random_uuid(), jsonb_build_object(
      'message', c.message, 'actorName', (
        SELECT COALESCE(p.display_name, u.email) FROM auth.users u
          LEFT JOIN public.media_profiles p ON p.user_id = u.id WHERE u.id = actor
      ),
      'templates', templates
    ));
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
