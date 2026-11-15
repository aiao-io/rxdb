BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS media_config_commits_workspace_id
  ON public.media_config_commits (workspace_id, id);

GRANT SELECT ON public.media_content_drafts TO authenticated;
DROP POLICY IF EXISTS media_content_drafts_admin ON public.media_content_drafts;
CREATE POLICY media_content_drafts_admin ON public.media_content_drafts
  FOR SELECT TO authenticated
  USING (public.media_admin_authorized());

DROP POLICY IF EXISTS media_task_reports_admin ON public.media_task_reports;
CREATE POLICY media_task_reports_admin ON public.media_task_reports
  FOR SELECT TO authenticated
  USING (public.media_admin_authorized());

CREATE OR REPLACE FUNCTION public.media_admin_content_self(
  p_kind text,
  p_key text,
  p_action text,
  p_revision bigint,
  p_request_id uuid,
  p_payload jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.media_admin_authorized() THEN
    RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE = '42501';
  END IF;
  RETURN public.media_admin_content(auth.uid(), p_kind, p_key, p_action, p_revision, p_request_id, p_payload);
END;
$$;
REVOKE ALL ON FUNCTION public.media_admin_content_self(text, text, text, bigint, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_admin_content_self(text, text, text, bigint, uuid, jsonb) TO authenticated;

CREATE TABLE IF NOT EXISTS public.media_config_records (
  workspace_id uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE,
  branch_id text NOT NULL CHECK (length(branch_id) BETWEEN 1 AND 128),
  entity text NOT NULL CHECK (entity IN ('MediaPromptTemplate', 'MediaProviderPolicy', 'MediaPlatformModel')),
  entity_id text NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 128),
  revision bigint NOT NULL CHECK (revision > 0),
  payload jsonb,
  deleted boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, branch_id, entity, entity_id),
  CHECK (deleted OR payload IS NOT NULL),
  CHECK (NOT deleted OR payload IS NULL)
);
ALTER TABLE public.media_config_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_config_records FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.media_config_records TO authenticated;
GRANT ALL ON public.media_config_records TO service_role;
DROP POLICY IF EXISTS media_config_records_admin ON public.media_config_records;
CREATE POLICY media_config_records_admin ON public.media_config_records
  FOR ALL TO authenticated
  USING (public.media_admin_authorized() AND media_private.owns_workspace(workspace_id))
  WITH CHECK (public.media_admin_authorized() AND media_private.owns_workspace(workspace_id) AND updated_by = auth.uid());

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
  commit_row public.media_config_commits;
  change_row public.media_config_commit_changes;
  current_row public.media_config_records;
  receipt public.media_admin_audit;
  expected_count bigint;
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
  FROM public.media_config_commits
  WHERE id = p_commit_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Config commit not found' USING ERRCODE = 'P0002';
  END IF;
  IF commit_row.operation_id <> p_operation_id THEN
    RAISE EXCEPTION 'Operation ID does not match config commit' USING ERRCODE = '22023';
  END IF;
  IF NOT media_private.owns_workspace(commit_row.workspace_id) THEN
    RAISE EXCEPTION 'Workspace authorization required' USING ERRCODE = '42501';
  END IF;

  SELECT audit.after_data INTO reused
  FROM public.media_admin_audit audit
  WHERE audit.actor_id = v_actor_id
    AND audit.action = 'config-commit-apply'
    AND request_id = p_operation_id;
  IF reused IS NOT NULL THEN
    RETURN jsonb_build_object('commitId', p_commit_id, 'operationId', p_operation_id, 'status', 'applied', 'reused', true, 'revisions', reused);
  END IF;
  IF commit_row.status IN ('applied', 'released') THEN
    RAISE EXCEPTION 'Config commit was applied without an idempotency receipt' USING ERRCODE = '22023';
  END IF;
  IF commit_row.status NOT IN ('synced', 'validated') THEN
    RAISE EXCEPTION 'Config commit is not ready to apply' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(array_length(commit_row.parent_ids, 1), 0) > 0 AND EXISTS (
    SELECT 1
    FROM unnest(commit_row.parent_ids) parent_id
    LEFT JOIN public.media_config_commits parent ON parent.id = parent_id
      AND parent.workspace_id = commit_row.workspace_id
      AND parent.branch_id = commit_row.branch_id
    WHERE parent.id IS NULL OR parent.status NOT IN ('applied', 'released')
  ) THEN
    RAISE EXCEPTION 'Config commit parent is missing or not applied' USING ERRCODE = '40001';
  END IF;

  SELECT count(*), min(sequence), max(sequence)
  INTO actual_count, minimum_sequence, maximum_sequence
  FROM public.media_config_commit_changes
  WHERE commit_id = p_commit_id;
  expected_count := COALESCE(maximum_sequence, 0);
  IF actual_count = 0 OR minimum_sequence <> 1 OR actual_count <> expected_count THEN
    RAISE EXCEPTION 'Config commit changes are incomplete' USING ERRCODE = '22023';
  END IF;

  FOR change_row IN
    SELECT *
    FROM public.media_config_commit_changes
    WHERE commit_id = p_commit_id
    ORDER BY sequence
  LOOP
    IF change_row.content_fingerprint !~ '^[a-f0-9]{64}$' OR change_row.patch IS NULL THEN
      RAISE EXCEPTION 'Config change fingerprint or patch is invalid' USING ERRCODE = '22023';
    END IF;
    IF change_row.operation <> 'delete' AND (jsonb_typeof(change_row.patch) <> 'object' OR NOT change_row.patch ? 'value') THEN
      RAISE EXCEPTION 'Config change patch must contain value' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO current_row
    FROM public.media_config_records
    WHERE workspace_id = commit_row.workspace_id
      AND branch_id = commit_row.branch_id
      AND entity = change_row.entity
      AND entity_id = change_row.entity_id
    FOR UPDATE;
    current_revision := COALESCE(current_row.revision, 0);
    IF change_row.expected_revision IS NOT NULL AND change_row.expected_revision <> current_revision THEN
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
        commit_row.workspace_id, commit_row.branch_id, change_row.entity, change_row.entity_id,
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
        commit_row.workspace_id, commit_row.branch_id, change_row.entity, change_row.entity_id,
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
      'entityId', change_row.entity_id,
      'revision', next_revision
    ));
  END LOOP;

  INSERT INTO public.media_admin_audit(actor_id, action, target_id, request_id, after_data)
    VALUES (v_actor_id, 'config-commit-apply', p_commit_id::text, p_operation_id, result);
  UPDATE public.media_config_commits
  SET status = 'applied', applied_at = now()
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

NOTIFY pgrst, 'reload schema';
COMMIT;
