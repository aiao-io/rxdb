BEGIN;

CREATE TABLE IF NOT EXISTS public.media_config_commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE,
  branch_id text NOT NULL CHECK (length(branch_id) BETWEEN 1 AND 128),
  parent_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  author_id uuid NOT NULL REFERENCES auth.users(id),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  operation_id uuid NOT NULL,
  content_fingerprint text NOT NULL CHECK (content_fingerprint ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'synced', 'validated', 'applied', 'released', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  released_at timestamptz,
  rejection_code text,
  UNIQUE (workspace_id, operation_id)
);

CREATE TABLE IF NOT EXISTS public.media_config_commit_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_id uuid NOT NULL REFERENCES public.media_config_commits(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  entity text NOT NULL CHECK (length(entity) BETWEEN 1 AND 128),
  entity_id text NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 128),
  operation text NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  patch jsonb NOT NULL,
  inverse_patch jsonb,
  expected_revision bigint CHECK (expected_revision IS NULL OR expected_revision >= 0),
  content_fingerprint text NOT NULL CHECK (content_fingerprint ~ '^[a-f0-9]{64}$'),
  UNIQUE (commit_id, sequence)
);

CREATE INDEX IF NOT EXISTS media_config_commits_workspace_branch
  ON public.media_config_commits (workspace_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_config_commit_changes_commit
  ON public.media_config_commit_changes (commit_id, sequence);

ALTER TABLE public.media_config_commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_config_commit_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_config_commits, public.media_config_commit_changes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.media_config_commits, public.media_config_commit_changes TO authenticated;
GRANT ALL ON public.media_config_commits, public.media_config_commit_changes TO service_role;

DROP POLICY IF EXISTS media_config_commits_admin ON public.media_config_commits;
CREATE POLICY media_config_commits_admin ON public.media_config_commits
  FOR ALL TO authenticated
  USING (public.media_admin_authorized() AND media_private.owns_workspace(workspace_id))
  WITH CHECK (public.media_admin_authorized() AND media_private.owns_workspace(workspace_id) AND author_id = auth.uid());

DROP POLICY IF EXISTS media_config_commit_changes_admin ON public.media_config_commit_changes;
CREATE POLICY media_config_commit_changes_admin ON public.media_config_commit_changes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.media_config_commits commit
      WHERE commit.id = commit_id
        AND public.media_admin_authorized()
        AND media_private.owns_workspace(commit.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.media_config_commits commit
      WHERE commit.id = commit_id
        AND public.media_admin_authorized()
        AND media_private.owns_workspace(commit.workspace_id)
    )
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
