BEGIN;
-- 数据模式清单与共享记录的键索引（ADMIN-US-218 切片 E）：校验由清单驱动，唯一与关联检查按键查询，不扫共享记录全表。
-- 全部语句幂等：可在已执行过前三个迁移的库上重复执行，结果不变。

-- 数据模式清单：按版本只追加，workspaces.schema_version 指向当前版本；初始化登记第一个版本，
-- 成员管理者经 schema 命令登记更高的版本（治理行排他锁）。
CREATE TABLE IF NOT EXISTS admin_private.schemas (
  team_id text NOT NULL,
  app_id text NOT NULL,
  version integer NOT NULL,
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, app_id, version),
  FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id),
  CHECK (version > 0),
  CHECK (jsonb_typeof(manifest) = 'object')
);

-- 共享记录的键索引：唯一字段的取值（kind = 'unique'，value 为规范化 JSON 文本）与单值关联指向的记录（kind = 'reference'，
-- value 为目标记录标识），按当前清单由合并事务与共享记录同步维护；登记新清单时整份重建。
-- 记录删除时它的键随外键级联删除。候选与合并按 (kind, value) 查唯一键的持有者与引用某条记录的记录。
CREATE TABLE IF NOT EXISTS admin_private.record_keys (
  team_id text NOT NULL,
  app_id text NOT NULL,
  record_id text NOT NULL,
  kind text NOT NULL,
  entity text NOT NULL,
  field text NOT NULL,
  value text NOT NULL,
  PRIMARY KEY (team_id, app_id, record_id, kind, field),
  FOREIGN KEY (team_id, app_id, record_id) REFERENCES public.shared_records(team_id, app_id, record_id) ON DELETE CASCADE,
  CHECK (kind IN ('unique', 'reference'))
);
CREATE INDEX IF NOT EXISTS record_keys_value ON admin_private.record_keys (team_id, app_id, kind, value);

REVOKE ALL ON admin_private.schemas, admin_private.record_keys FROM PUBLIC, anon, authenticated;
ALTER TABLE admin_private.schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.record_keys ENABLE ROW LEVEL SECURITY;
COMMIT;
