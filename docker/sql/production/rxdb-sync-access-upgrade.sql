-- ============================================
-- RxDB 生产增量迁移：日志同步只对已登录身份开放（US-225）
-- ============================================
-- 用途: 已部署旧版参考 SQL 的生产库，补上 01-rxdb-system-tables.sql 本次新增的系统对象：
--   1. rxdb_change 的 bucket 列与按区游标索引；
--   2. 分区同步实体登记表 rxdb_sync_entity；
--   3. 分支所有者表 rxdb_branch_owner（开 RLS、不建策略，只经 02 的 rxdb_claim_branch 写入）；
--   4. 把 rxdb_change 移出 supabase_realtime 发布（变更通知改由 02 的 rxdb_change_broadcast 发送）。
-- 只动 RxDB 自己的对象。升级时不要重跑整份 01：它末尾给开发与测试库用的
--   `GRANT ALL ON ALL TABLES IN SCHEMA public` 会连同 public 下业务表的权限一起放宽，
--   而生产权限脚本只收回 RxDB 自己的对象。
-- 执行: 与 02、04、生产权限脚本按顺序放进同一个事务（psql --single-transaction），任一步失败整批回滚；
--   完整命令见 website/docs/migration/supabase-sync-access.md。幂等，可重复执行。
-- 回归: rxdb-adapter-supabase 的 SQL 回归 sync-access-upgrade 与 sync-access-upgrade-atomic。
-- ============================================

ALTER TABLE public.rxdb_change ADD COLUMN IF NOT EXISTS "bucket" varchar;

CREATE INDEX IF NOT EXISTS idx_rxdb_change_bucket_cursor
ON public.rxdb_change(namespace, entity, "bucket", id);

CREATE TABLE IF NOT EXISTS public.rxdb_sync_entity (
  namespace varchar NOT NULL,
  entity varchar NOT NULL,
  "tableName" varchar NOT NULL,
  "bucketColumn" varchar,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, entity)
);

CREATE INDEX IF NOT EXISTS idx_rxdb_sync_entity_bucket
ON public.rxdb_sync_entity(namespace, entity, "bucketColumn");

CREATE TABLE IF NOT EXISTS public.rxdb_branch_owner (
  "branchId" varchar PRIMARY KEY,
  "ownerId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);

ALTER TABLE public.rxdb_branch_owner ENABLE ROW LEVEL SECURITY;

-- 升级后的分区协议只使用日志元数据，历史正文与 NULL bucket 都必须清掉。
-- 分区实体下一次同步会从业务表重新建立快照。
DELETE FROM public.rxdb_change AS change
USING public.rxdb_sync_entity AS entity
WHERE change.namespace = entity.namespace
  AND change.entity = entity.entity
  AND entity."bucketColumn" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rxdb_change'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.rxdb_change;
  END IF;
END $$;
