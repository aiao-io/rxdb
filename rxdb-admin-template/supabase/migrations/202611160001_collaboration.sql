BEGIN;
CREATE SCHEMA IF NOT EXISTS admin_private;
REVOKE ALL ON SCHEMA admin_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS admin_private.workspaces (
  team_id text NOT NULL, app_id text NOT NULL, state jsonb NOT NULL,
  PRIMARY KEY (team_id, app_id), CHECK (jsonb_typeof(state) = 'object')
);
CREATE TABLE IF NOT EXISTS admin_private.memberships (
  team_id text NOT NULL, app_id text NOT NULL, user_id text NOT NULL, can_read boolean NOT NULL,
  PRIMARY KEY(team_id, app_id, user_id),
  FOREIGN KEY(team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id)
);
CREATE TABLE IF NOT EXISTS public.admin_shared (
  team_id text NOT NULL, app_id text NOT NULL, head text, records jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY(team_id, app_id), FOREIGN KEY(team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id)
);
CREATE TABLE IF NOT EXISTS public.admin_audit (
  team_id text NOT NULL, app_id text NOT NULL, id text NOT NULL, actor_id text NOT NULL,
  action text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL,
  PRIMARY KEY(team_id, app_id, id), FOREIGN KEY(team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id)
);
CREATE TABLE IF NOT EXISTS public.admin_changes (
  team_id text NOT NULL, app_id text NOT NULL, merge_id text NOT NULL, record_id text NOT NULL,
  before_data jsonb, after_data jsonb,
  PRIMARY KEY(team_id, app_id, merge_id, record_id),
  FOREIGN KEY(team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id)
);
CREATE TABLE IF NOT EXISTS public.admin_workspace_versions (
  team_id text NOT NULL, app_id text NOT NULL, revision bigint NOT NULL,
  PRIMARY KEY(team_id, app_id), FOREIGN KEY(team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id)
);
CREATE OR REPLACE FUNCTION admin_private.can_read(wanted_team text, wanted_app text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM admin_private.memberships m WHERE m.team_id = wanted_team
    AND m.app_id = wanted_app AND m.user_id = auth.uid()::text AND m.can_read)
$$;
REVOKE ALL ON FUNCTION admin_private.can_read(text, text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA admin_private TO authenticated;
GRANT EXECUTE ON FUNCTION admin_private.can_read(text, text) TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA admin_private FROM PUBLIC, anon, authenticated;
ALTER TABLE admin_private.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_workspace_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_shared ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_shared, public.admin_audit, public.admin_changes, public.admin_workspace_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_shared, public.admin_audit, public.admin_changes, public.admin_workspace_versions TO authenticated;
DROP POLICY IF EXISTS admin_shared_read ON public.admin_shared;
CREATE POLICY admin_shared_read ON public.admin_shared FOR SELECT TO authenticated
  USING (admin_private.can_read(team_id, app_id));
DROP POLICY IF EXISTS admin_audit_read ON public.admin_audit;
CREATE POLICY admin_audit_read ON public.admin_audit FOR SELECT TO authenticated
  USING (admin_private.can_read(team_id, app_id));
DROP POLICY IF EXISTS admin_changes_read ON public.admin_changes;
CREATE POLICY admin_changes_read ON public.admin_changes FOR SELECT TO authenticated
  USING (admin_private.can_read(team_id, app_id));
DROP POLICY IF EXISTS admin_workspace_versions_read ON public.admin_workspace_versions;
CREATE POLICY admin_workspace_versions_read ON public.admin_workspace_versions FOR SELECT TO authenticated
  USING (admin_private.can_read(team_id, app_id));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'admin_workspace_versions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_workspace_versions;
  END IF;
END $$;
COMMIT;
