BEGIN;
-- 协作命令入口（Supabase Edge Function 或 Node 服务）专用的数据库角色（ADMIN-US-220）：只授予命令事务用到的表与列的权限、
-- 各表上只对它生效的行级策略，以及向协作私有频道广播的定义者函数。它不是超级用户，不能绕过行级安全，不能建表、改表或改行级策略，
-- 没有 auth、storage、realtime 等其他 schema 的权限，读不到初始化密钥（workspaces.bootstrap_key），也不能新建工作区——
-- 初始化与迁移仍以迁移所有者（Supabase 的 postgres 角色）执行。
-- 迁移只建 NOLOGIN、无口令的角色：口令与登录权由部署步骤设置（ALTER ROLE admin_collaboration WITH LOGIN PASSWORD …，
-- 见协作包 README 的「只部署 Supabase」），口令只出现在那一步与函数环境的 ADMIN_DATABASE_URL 里，不写进任何迁移。
-- 全部语句幂等：可在已执行过前五个迁移的库上重复执行，结果不变；每次先收回该角色的表权限再按下文授予，权限不会累积。

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_collaboration') THEN
    CREATE ROLE admin_collaboration NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA admin_private FROM admin_collaboration;
REVOKE ALL ON public.shared_records, public.admin_shared, public.admin_audit, public.admin_changes,
  public.admin_workspace_versions FROM admin_collaboration;
GRANT USAGE ON SCHEMA admin_private TO admin_collaboration;

-- 治理行：命令只读名称、初始化归属与两个版本号，只改两个版本号（行锁 FOR SHARE / FOR UPDATE 要求对至少一列有 UPDATE 权限）；
-- 初始化密钥不授予，新建工作区只由初始化以迁移所有者执行
GRANT SELECT (team_id, app_id, name, initial_admin_id, schema_version, policy_version),
  UPDATE (schema_version, policy_version) ON admin_private.workspaces TO admin_collaboration;
-- 成员、引用、PR、讨论、评论、通知与邀请：命令读取、新增并按差异改写
GRANT SELECT, INSERT, UPDATE ON admin_private.memberships, admin_private.refs, admin_private.prs, admin_private.threads,
  admin_private.comments, admin_private.notifications, admin_private.invitations TO admin_collaboration;
-- 只追加的表：策略、数据模式、任务元数据、候选、审核、提交与字段级变更，不能改写也不能删除
GRANT SELECT, INSERT ON admin_private.policies, admin_private.schemas, admin_private.tasks, admin_private.candidates,
  admin_private.reviews, admin_private.commits, admin_private.commit_changes TO admin_collaboration;
-- 回执：过期清理要删除并先对待删的行加锁（FOR UPDATE SKIP LOCKED 要求 UPDATE 权限），因此只多授予 at 一列的 UPDATE
GRANT SELECT, INSERT, DELETE, UPDATE (at) ON admin_private.operations TO admin_collaboration;
-- 共享记录的键索引与共享记录：只有合并事务与数据模式登记改写它们
GRANT SELECT, INSERT, DELETE ON admin_private.record_keys TO admin_collaboration;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_records TO admin_collaboration;
-- 公开投影的写入：共享头与版本行只改对应列，审计与逐记录变更日志只追加
GRANT SELECT, UPDATE (head) ON public.admin_shared TO admin_collaboration;
GRANT SELECT, UPDATE (revision, audit_count) ON public.admin_workspace_versions TO admin_collaboration;
GRANT INSERT ON public.admin_audit, public.admin_changes TO admin_collaboration;

-- 行级策略：这些表都开着 RLS，原有策略只给 authenticated 读；专用角色不能绕过 RLS，需要自己的策略才能读写行。
-- 策略只对它生效（TO admin_collaboration），不改变 anon / authenticated 的可见范围；能做什么仍由上面的表与列权限决定。
DO $$
DECLARE
  target regclass;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'admin_private.workspaces', 'admin_private.memberships', 'admin_private.policies', 'admin_private.schemas',
    'admin_private.tasks', 'admin_private.refs', 'admin_private.prs', 'admin_private.candidates',
    'admin_private.reviews', 'admin_private.threads', 'admin_private.comments', 'admin_private.notifications',
    'admin_private.invitations', 'admin_private.operations', 'admin_private.commits', 'admin_private.commit_changes',
    'admin_private.record_keys', 'public.shared_records', 'public.admin_shared', 'public.admin_audit',
    'public.admin_changes', 'public.admin_workspace_versions'
  ]::regclass[] LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_collaboration_service ON %s', target);
    EXECUTE format(
      'CREATE POLICY admin_collaboration_service ON %s TO admin_collaboration USING (true) WITH CHECK (true)', target
    );
  END LOOP;
END $$;

-- 广播：realtime schema 的使用权只属于 Supabase 内置角色，迁移所有者也不能转授，专用角色因此经这个定义者函数广播。
-- 它以所有者身份调用 realtime.send()，只接受协作私有频道 collab:<团队>:<应用> 与 changed / revoked 两类事件，其余一律报错；
-- 发出的仍是私有频道上的 Broadcast 消息，与命令事务同一个事务，回滚则不发。
CREATE OR REPLACE FUNCTION admin_private.broadcast(payload jsonb, event text, topic text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF topic IS NULL OR topic !~ '^collab:[^:]+:[^:]+$' OR event IS NULL OR event NOT IN ('changed', 'revoked') THEN
    RAISE EXCEPTION 'admin_private.broadcast only sends collaboration invalidations' USING ERRCODE = '42501';
  END IF;
  PERFORM realtime.send(payload, event, topic, true);
END $$;
REVOKE ALL ON FUNCTION admin_private.broadcast(jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_private.broadcast(jsonb, text, text) TO admin_collaboration;
COMMIT;
