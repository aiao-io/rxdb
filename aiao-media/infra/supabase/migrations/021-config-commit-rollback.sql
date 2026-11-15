BEGIN;

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
  commit_row public.media_config_commits;
  change_row public.media_config_commit_changes;
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
  FROM public.media_config_commits
  WHERE id = p_commit_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Config commit not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT media_private.owns_workspace(commit_row.workspace_id) THEN
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
    FROM public.media_config_commit_changes
    WHERE commit_id = p_commit_id
    ORDER BY sequence DESC
  LOOP
    SELECT * INTO current_row
    FROM public.media_config_records
    WHERE workspace_id = commit_row.workspace_id
      AND branch_id = commit_row.branch_id
      AND entity = change_row.entity
      AND entity_id = change_row.entity_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Config record for rollback is missing' USING ERRCODE = '40001';
    END IF;
    current_revision := current_row.revision;
    expected_revision := COALESCE(change_row.expected_revision, 0) + 1;
    IF current_revision <> expected_revision THEN
      RAISE EXCEPTION 'Config rollback revision conflict' USING ERRCODE = '40001';
    END IF;

    IF change_row.inverse_patch IS NULL OR NOT (change_row.inverse_patch ? 'value') OR jsonb_typeof(change_row.inverse_patch->'value') = 'null' THEN
      INSERT INTO public.media_config_records(
        workspace_id, branch_id, entity, entity_id, revision, payload, deleted, updated_by
      ) VALUES (
        commit_row.workspace_id, commit_row.branch_id, change_row.entity, change_row.entity_id,
        current_revision + 1, NULL, true, v_actor_id
      )
      ON CONFLICT (workspace_id, branch_id, entity, entity_id) DO UPDATE SET
        revision = EXCLUDED.revision,
        payload = NULL,
        deleted = true,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
    ELSE
      value := change_row.inverse_patch->'value';
      INSERT INTO public.media_config_records(
        workspace_id, branch_id, entity, entity_id, revision, payload, deleted, updated_by
      ) VALUES (
        commit_row.workspace_id, commit_row.branch_id, change_row.entity, change_row.entity_id,
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
      'entityId', change_row.entity_id,
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
