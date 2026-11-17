BEGIN;
-- Supabase 原生读取与实时（ADMIN-US-219）：客户端经 PostgREST 读取 public 下的只读投影，命令事务经 realtime.send()
-- 向私有频道 collab:<团队>:<应用> 广播失效通知，在线状态改由同一频道的 Realtime Presence 承载。
-- 前提：Supabase Realtime 已初始化 realtime schema（realtime.messages、realtime.topic()、realtime.send()）。
-- 全部语句幂等：可在已执行过前四个迁移的库上重复执行，也可在它们之前或之后单独重跑，结果不变。

-- 私有频道名以冒号分隔团队与应用：标识含冒号会让两个工作区的频道名相同，因此一律禁止。
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = 'admin_private.workspaces'::regclass AND conname = 'workspaces_topic_safe') THEN
    ALTER TABLE admin_private.workspaces
      ADD CONSTRAINT workspaces_topic_safe CHECK (strpos(team_id, ':') = 0 AND strpos(app_id, ':') = 0);
  END IF;
END $$;

-- 在线状态不再写库（Realtime Presence），表随之删除；版本通知改由 Broadcast 承载，版本行不再经 Postgres Changes 发布。
DROP TABLE IF EXISTS public.admin_presence;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'admin_workspace_versions') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_workspace_versions;
  END IF;
END $$;

-- 团队页分页（PR 与本人任务按创建顺序倒序取一页）
CREATE INDEX IF NOT EXISTS prs_order ON admin_private.prs (team_id, app_id, seq);
CREATE INDEX IF NOT EXISTS tasks_owner ON admin_private.tasks (team_id, app_id, owner_id, seq);

-- 当前用户能否管理成员：邀请只对管理者可见。与 can_read() 同样以定义者身份读成员表。
CREATE OR REPLACE FUNCTION admin_private.can_manage(wanted_team text, wanted_app text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM admin_private.memberships m WHERE m.team_id = wanted_team
    AND m.app_id = wanted_app AND m.user_id = auth.uid()::text AND m.can_read AND 'manage' = ANY (m.permissions))
$$;
-- 当前用户能否读私有频道 collab:<团队>:<应用>：可读成员才能订阅广播、读取与上报在线状态。
CREATE OR REPLACE FUNCTION admin_private.can_read_topic(wanted_topic text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM admin_private.memberships m WHERE m.user_id = auth.uid()::text AND m.can_read
    AND 'collab:' || m.team_id || ':' || m.app_id = wanted_topic)
$$;
REVOKE ALL ON FUNCTION admin_private.can_manage(text, text), admin_private.can_read_topic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_private.can_manage(text, text), admin_private.can_read_topic(text) TO authenticated;

-- 只读投影：视图以所有者身份读私有表，可见范围写在视图条件里（等价于 RLS：can_read 成员资格，通知与回执另限本人，
-- 邀请另限管理者）；security_barrier 保证调用方的筛选条件不会先于这些条件求值而泄露行。
-- 不暴露的列：邀请令牌摘要、请求指纹、初始化密钥、提交内容指纹。
-- 工作区行从当前用户的可读成员行出发（memberships_user 索引）：「我的工作区」只读本人的成员行，不扫其他团队
CREATE OR REPLACE VIEW public.admin_workspaces WITH (security_barrier = true) AS
  SELECT w.team_id, w.app_id, w.name, w.schema_version, w.policy_version, p.stages AS policy_stages, r.head,
    v.revision, v.audit_count
  FROM admin_private.memberships m
  JOIN admin_private.workspaces w ON w.team_id = m.team_id AND w.app_id = m.app_id
  JOIN admin_private.policies p ON p.team_id = w.team_id AND p.app_id = w.app_id AND p.version = w.policy_version
  JOIN admin_private.refs r ON r.team_id = w.team_id AND r.app_id = w.app_id AND r.ref = 'shared'
  JOIN public.admin_workspace_versions v ON v.team_id = w.team_id AND v.app_id = w.app_id
  WHERE m.user_id = auth.uid()::text AND m.can_read;
CREATE OR REPLACE VIEW public.admin_members WITH (security_barrier = true) AS
  SELECT m.team_id, m.app_id, m.user_id, m.email, m.permissions, m.generation, m.seq
  FROM admin_private.memberships m
  WHERE m.active AND admin_private.can_read(m.team_id, m.app_id);
CREATE OR REPLACE VIEW public.admin_invitations WITH (security_barrier = true) AS
  SELECT i.team_id, i.app_id, i.id, i.email, i.permissions, i.inviter_id, i.version, i.expires_at, i.state,
    i.accepted_by, i.seq
  FROM admin_private.invitations i
  WHERE admin_private.can_manage(i.team_id, i.app_id);
CREATE OR REPLACE VIEW public.admin_tasks WITH (security_barrier = true) AS
  SELECT t.team_id, t.app_id, t.id, t.name, t.owner_id, t.base, t.origin_task_id, r.head, t.seq
  FROM admin_private.tasks t
  JOIN admin_private.refs r ON r.team_id = t.team_id AND r.app_id = t.app_id AND r.ref = 'tasks/' || t.id
  WHERE admin_private.can_read(t.team_id, t.app_id);
CREATE OR REPLACE VIEW public.admin_prs WITH (security_barrier = true) AS
  SELECT p.team_id, p.app_id, p.id, p.task_id, p.author_id, p.title, p.description, p.target, p.status, p.revision,
    p.candidate_id, p.subscribers, p.seq
  FROM admin_private.prs p
  WHERE admin_private.can_read(p.team_id, p.app_id);
CREATE OR REPLACE VIEW public.admin_candidates WITH (security_barrier = true) AS
  SELECT c.team_id, c.app_id, c.id, c.pr_id, c.base, c.source, c.target, c.schema_version, c.policy_version,
    c.resolutions, c.conflicts, c.checks, c.actor_id, c.at, c.changes, c.seq
  FROM admin_private.candidates c
  WHERE admin_private.can_read(c.team_id, c.app_id);
CREATE OR REPLACE VIEW public.admin_reviews WITH (security_barrier = true) AS
  SELECT r.team_id, r.app_id, r.id, r.pr_id, r.reviewer_id, r.source, r.candidate_id, r.stage_id, r.decision,
    r.generation, r.revision, r.reason, r.at, r.dismissed_reviewer_id, r.seq
  FROM admin_private.reviews r
  WHERE admin_private.can_read(r.team_id, r.app_id);
CREATE OR REPLACE VIEW public.admin_threads WITH (security_barrier = true) AS
  SELECT t.team_id, t.app_id, t.id, t.pr_id, t.candidate_id, t.record_id, t.field, t.required, t.resolved,
    t.resolved_candidate_id, t.revision, t.seq
  FROM admin_private.threads t
  WHERE admin_private.can_read(t.team_id, t.app_id);
CREATE OR REPLACE VIEW public.admin_comments WITH (security_barrier = true) AS
  SELECT c.team_id, c.app_id, c.id, c.thread_id, t.pr_id, c.author_id, c.body, c.deleted, c.revision, c.at, c.seq
  FROM admin_private.comments c
  JOIN admin_private.threads t ON t.team_id = c.team_id AND t.app_id = c.app_id AND t.id = c.thread_id
  WHERE admin_private.can_read(c.team_id, c.app_id);
CREATE OR REPLACE VIEW public.admin_notifications WITH (security_barrier = true) AS
  SELECT n.team_id, n.app_id, n.id, n.user_id, n.pr_id, n.thread_id, n.candidate_id, n.read, n.at, n.seq
  FROM admin_private.notifications n
  WHERE n.user_id = auth.uid()::text AND admin_private.can_read(n.team_id, n.app_id);
-- 回执：只读本人的、保留期内的（30 天，与 model.ts 的 receiptRetentionMs 一致），不含请求指纹
CREATE OR REPLACE VIEW public.admin_receipts WITH (security_barrier = true) AS
  SELECT o.team_id, o.app_id, o.operation_id, o.result
  FROM admin_private.operations o
  WHERE o.actor_id = auth.uid()::text AND o.at > (extract(epoch FROM now()) * 1000)::bigint - 2592000000
    AND admin_private.can_read(o.team_id, o.app_id);
CREATE OR REPLACE VIEW public.admin_commits WITH (security_barrier = true) AS
  SELECT c.team_id, c.app_id, c.id, c.parent_id, c.author_id, c.message, c.merge_source, c.candidate_id,
    c.created_at, c.seq
  FROM admin_private.commits c
  WHERE admin_private.can_read(c.team_id, c.app_id);
CREATE OR REPLACE VIEW public.admin_schemas WITH (security_barrier = true) AS
  SELECT s.team_id, s.app_id, s.version, s.manifest, s.created_at
  FROM admin_private.schemas s
  WHERE admin_private.can_read(s.team_id, s.app_id);

-- 沿父指针走提交图的读取（一条语句、一份快照，返回 JSON 以免受 PostgREST 行数上限截断）：
-- 不可读的工作区返回 NULL；只读、不加锁。行形状与 server/pg-store.ts 的查询一致，由同一段 TypeScript 还原路径。
CREATE OR REPLACE FUNCTION public.admin_commit_path(p_team_id text, p_app_id text, p_from text, p_until text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (
    WITH RECURSIVE chain AS (
      SELECT c.id, c.parent_id, c.merge_source IS NOT NULL AS merge FROM admin_private.commits c
      WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = p_from AND c.id IS DISTINCT FROM p_until
      UNION
      SELECT c.id, c.parent_id, c.merge_source IS NOT NULL FROM chain
      JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = chain.parent_id
      WHERE c.id IS DISTINCT FROM p_until
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'parent_id', parent_id, 'merge', merge)), '[]'::jsonb)
    FROM chain
  )
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;
CREATE OR REPLACE FUNCTION public.admin_commit_lineage(p_team_id text, p_app_id text, p_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (
    WITH RECURSIVE chain AS (
      SELECT c.id, c.parent_id, c.merge_source IS NOT NULL AS merge FROM admin_private.commits c
      WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = p_id
      UNION
      SELECT c.id, c.parent_id, c.merge_source IS NOT NULL FROM chain
      JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = chain.parent_id
      WHERE NOT chain.merge
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'parent_id', parent_id, 'merge', merge)), '[]'::jsonb)
    FROM chain
  )
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;
CREATE OR REPLACE FUNCTION public.admin_commit_history(
  p_team_id text, p_app_id text, p_from text, p_until text, p_limit integer
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (
    WITH RECURSIVE chain AS (
      SELECT c.id, c.parent_id, c.author_id, c.message, c.merge_source, c.candidate_id, 1 AS depth
      FROM admin_private.commits c
      WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = p_from AND p_limit >= 1
        AND c.id IS DISTINCT FROM p_until
      UNION ALL
      SELECT c.id, c.parent_id, c.author_id, c.message, c.merge_source, c.candidate_id, chain.depth + 1 FROM chain
      JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = chain.parent_id
      WHERE chain.depth < least(p_limit, 101) AND c.id IS DISTINCT FROM p_until
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'parent_id', parent_id, 'author_id', author_id,
        'message', message, 'merge_source', merge_source, 'candidate_id', candidate_id) ORDER BY depth), '[]'::jsonb)
    FROM chain
  )
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;
CREATE OR REPLACE FUNCTION public.admin_commit_changes(
  p_team_id text, p_app_id text, p_commit_ids text[], p_record_ids text[] DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (
    SELECT coalesce(jsonb_agg(jsonb_build_object('commit_id', x.commit_id, 'namespace', x.namespace,
        'entity', x.entity, 'entity_id', x.entity_id, 'operation', x.operation, 'patch', x.patch,
        'inverse_patch', x.inverse_patch) ORDER BY x.commit_id, x.seq), '[]'::jsonb)
    FROM admin_private.commit_changes x
    WHERE x.team_id = p_team_id AND x.app_id = p_app_id AND x.commit_id = ANY (p_commit_ids)
      AND (p_record_ids IS NULL OR x.entity_id = ANY (p_record_ids))
  )
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;
-- 共享记录连同共享头：同一条语句读出，客户端据头判断记录与它手里的版本是否一致
CREATE OR REPLACE FUNCTION public.admin_shared_records(p_team_id text, p_app_id text, p_record_ids text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'head', (SELECT r.head FROM admin_private.refs r
      WHERE r.team_id = p_team_id AND r.app_id = p_app_id AND r.ref = 'shared'),
    'records', (SELECT coalesce(jsonb_agg(jsonb_build_object('record_id', s.record_id, 'entity', s.entity,
        'fields', s.fields) ORDER BY s.record_id), '[]'::jsonb)
      FROM public.shared_records s
      WHERE s.team_id = p_team_id AND s.app_id = p_app_id
        AND (p_record_ids IS NULL OR s.record_id = ANY (p_record_ids))))
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;

-- 授权：Supabase 给 public 下新建的视图与函数默认授予 anon / authenticated 全部权限，这里收回，只给登录用户读。
REVOKE ALL ON public.admin_workspaces, public.admin_members, public.admin_invitations, public.admin_tasks,
  public.admin_prs, public.admin_candidates, public.admin_reviews, public.admin_threads, public.admin_comments,
  public.admin_notifications, public.admin_receipts, public.admin_commits, public.admin_schemas
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_workspaces, public.admin_members, public.admin_invitations, public.admin_tasks,
  public.admin_prs, public.admin_candidates, public.admin_reviews, public.admin_threads, public.admin_comments,
  public.admin_notifications, public.admin_receipts, public.admin_commits, public.admin_schemas
  TO authenticated;
REVOKE ALL ON FUNCTION public.admin_commit_path(text, text, text, text),
  public.admin_commit_lineage(text, text, text), public.admin_commit_history(text, text, text, text, integer),
  public.admin_commit_changes(text, text, text[], text[]), public.admin_shared_records(text, text, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_commit_path(text, text, text, text),
  public.admin_commit_lineage(text, text, text), public.admin_commit_history(text, text, text, text, integer),
  public.admin_commit_changes(text, text, text[], text[]), public.admin_shared_records(text, text, text[])
  TO authenticated;

-- 私有频道的授权（Realtime 在加入频道与令牌刷新时以登录用户身份对 realtime.messages 试读、试写）：
-- 只有该团队与应用的可读成员能接收广播与在线状态，也只能上报在线状态；广播只由命令事务经 realtime.send() 写入。
DROP POLICY IF EXISTS admin_collaboration_read ON realtime.messages;
CREATE POLICY admin_collaboration_read ON realtime.messages FOR SELECT TO authenticated
  USING (extension IN ('broadcast', 'presence') AND admin_private.can_read_topic(topic));
DROP POLICY IF EXISTS admin_collaboration_presence ON realtime.messages;
CREATE POLICY admin_collaboration_presence ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (extension = 'presence' AND admin_private.can_read_topic(topic));

-- PostgREST 重新加载结构缓存，新视图与函数立即可查
NOTIFY pgrst, 'reload schema';
COMMIT;
