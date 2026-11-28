BEGIN;
-- 提交存储与共享记录物化：提交只存元数据加字段级变更，共享数据按记录一行，工作区 JSONB 不再含 commits 与 records。
-- 全部语句幂等：可在已迁移的库上重复执行，结果不变。依赖 202611160001_collaboration.sql 建好的 workspaces 与 can_read。
-- 提交表与变更表在 202611180002 改成平台 working-tree 的交换格式；这里建的是改造前的结构（表已存在时整句跳过）。

-- 提交元数据：只追加。父指针与指纹由服务端写入；合并提交带 merge_source 与 candidate_id，任务提交两者皆空。
CREATE TABLE IF NOT EXISTS admin_private.commits (
  team_id text NOT NULL,
  app_id text NOT NULL,
  id text NOT NULL,
  parent_id text,
  author_id text NOT NULL,
  message text NOT NULL,
  merge_source text,
  candidate_id text,
  fingerprint text NOT NULL,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, app_id, id),
  FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id),
  FOREIGN KEY (team_id, app_id, parent_id) REFERENCES admin_private.commits(team_id, app_id, id),
  CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK ((merge_source IS NULL) = (candidate_id IS NULL))
);
-- 父指针的索引不再建：202611180002 把提交表改成交换格式（有序的 parent_ids），parent_id 列随之删除，
-- 在新结构上重跑本文件时这条索引语句会因为列不存在而失败。

-- 提交的字段级变更：按提交与序号存放，形状对齐平台 working-tree 的 CommitChangeSet。
-- 新增只有 patch，修改两者都有，删除只有 inverse_patch。
CREATE TABLE IF NOT EXISTS admin_private.commit_changes (
  team_id text NOT NULL,
  app_id text NOT NULL,
  commit_id text NOT NULL,
  seq integer NOT NULL,
  namespace text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  operation text NOT NULL,
  patch jsonb,
  inverse_patch jsonb,
  PRIMARY KEY (team_id, app_id, commit_id, seq),
  FOREIGN KEY (team_id, app_id, commit_id) REFERENCES admin_private.commits(team_id, app_id, id),
  CHECK (
    (operation = 'insert' AND patch IS NOT NULL AND inverse_patch IS NULL)
    OR (operation = 'update' AND patch IS NOT NULL AND inverse_patch IS NOT NULL)
    OR (operation = 'delete' AND patch IS NULL AND inverse_patch IS NOT NULL)
  )
);

-- 共享分支头的记录，按记录物化成行；只经合并事务写入，可读成员经 RLS 只读。
CREATE TABLE IF NOT EXISTS public.shared_records (
  team_id text NOT NULL,
  app_id text NOT NULL,
  record_id text NOT NULL,
  entity text NOT NULL,
  fields jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (team_id, app_id, record_id),
  FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id),
  CHECK (jsonb_typeof(fields) = 'object')
);

-- admin_shared 只保留共享头，记录改由 shared_records 承载。
ALTER TABLE public.admin_shared DROP COLUMN IF EXISTS records;

REVOKE ALL ON admin_private.commits, admin_private.commit_changes FROM PUBLIC, anon, authenticated;
ALTER TABLE admin_private.commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.commit_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shared_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.shared_records TO authenticated;
DROP POLICY IF EXISTS shared_records_read ON public.shared_records;
CREATE POLICY shared_records_read ON public.shared_records FOR SELECT TO authenticated
  USING (admin_private.can_read(team_id, app_id));
COMMIT;
