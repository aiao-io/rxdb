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

-- 这里不清理日志：升级时没有任何实体登记为分区实体，已有日志全是未分区旧日志，仍按旧口径对 authenticated 可读。
-- 实体改成分区实体（业务表加 rxdb_bucket 后调 rxdb_enable_sync_for_table）时，由登记函数删掉它全部的
-- 未分区历史日志，客户端之后从业务表重建快照。在这里按登记表删会在重跑本脚本时删掉分区实体的日志，
-- 让还没拉到最新变更的客户端永久错过它们。

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
