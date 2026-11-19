-- ============================================
-- Supabase 系统表初始化脚本
-- ============================================
-- 用途: 创建 RxDB 系统所需的表
-- 使用: ./init-db.sh 或在 Supabase SQL Editor 中执行
-- 表名使用 entity tableName（snake_case）
-- ============================================

-- ============================================
-- rxdb_change 表（变更记录）
-- ============================================
CREATE TABLE IF NOT EXISTS public.rxdb_change (
  id serial PRIMARY KEY,
  namespace varchar NOT NULL DEFAULT 'public',
  entity varchar NOT NULL,
  "entityId" varchar NOT NULL,
  "branchId" varchar DEFAULT 'main',
  type varchar NOT NULL CHECK (type IN ('INSERT', 'UPDATE', 'DELETE')),
  patch jsonb,
  "inversePatch" jsonb,
  "beforeData" jsonb,
  "afterData" jsonb,
  "snapshotComplete" boolean NOT NULL DEFAULT false,
  "transactionId" uuid,
  "localId" integer,
  "clientId" varchar,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now()
);

ALTER TABLE public.rxdb_change ADD COLUMN IF NOT EXISTS "beforeData" jsonb;
ALTER TABLE public.rxdb_change ADD COLUMN IF NOT EXISTS "afterData" jsonb;
ALTER TABLE public.rxdb_change ADD COLUMN IF NOT EXISTS "snapshotComplete" boolean NOT NULL DEFAULT false;

UPDATE public.rxdb_change
SET
  "beforeData" = CASE
    WHEN type = 'DELETE' THEN COALESCE(patch, "inversePatch")
    WHEN type = 'UPDATE' THEN "inversePatch"
    ELSE NULL
  END,
  "afterData" = CASE
    WHEN type = 'INSERT' THEN patch
    WHEN type = 'UPDATE' THEN patch
    ELSE NULL
  END,
  "snapshotComplete" = CASE
    WHEN type = 'INSERT' THEN patch IS NOT NULL
    WHEN type = 'DELETE' THEN COALESCE(patch, "inversePatch") IS NOT NULL
    ELSE false
  END
WHERE NOT "snapshotComplete";

CREATE INDEX IF NOT EXISTS idx_rxdb_change_entity ON public.rxdb_change(entity);
CREATE INDEX IF NOT EXISTS idx_rxdb_change_entity_id ON public.rxdb_change("entityId");
CREATE INDEX IF NOT EXISTS idx_rxdb_change_created_at ON public.rxdb_change("createdAt");
CREATE INDEX IF NOT EXISTS idx_rxdb_change_branch_id ON public.rxdb_change("branchId");
CREATE INDEX IF NOT EXISTS idx_rxdb_change_type ON public.rxdb_change(type);
CREATE INDEX IF NOT EXISTS idx_rxdb_change_scope_cursor
ON public.rxdb_change(namespace, entity, "branchId", id);
WITH duplicate_changes AS (
  SELECT
    id,
    pg_catalog.row_number() OVER (
      PARTITION BY "clientId", "localId"
      ORDER BY id
    ) AS duplicate_order
  FROM public.rxdb_change
  WHERE "clientId" IS NOT NULL AND "localId" IS NOT NULL
)
DELETE FROM public.rxdb_change AS change
USING duplicate_changes AS duplicate
WHERE change.id = duplicate.id AND duplicate.duplicate_order > 1;

DROP INDEX IF EXISTS public.idx_rxdb_change_local_id_client_id;
CREATE UNIQUE INDEX idx_rxdb_change_local_id_client_id
ON public.rxdb_change("clientId", "localId")
WHERE "clientId" IS NOT NULL AND "localId" IS NOT NULL;

-- ============================================
-- rxdb_branch 表（分支管理）
-- ============================================
CREATE TABLE IF NOT EXISTS public.rxdb_branch (
  id varchar PRIMARY KEY,
  activated boolean DEFAULT false,
  "fromChangeId" integer,
  "lastPushedChangeId" integer,
  "lastPushedAt" timestamptz(3),
  "lastPulledAt" timestamptz(3),
  "parentId" varchar,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now()
);

-- ============================================
-- 插入默认 main 分支
-- ============================================
INSERT INTO public.rxdb_branch (id, activated)
VALUES ('main', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- rxdb_branch_owner 表（非 main 分支的所有者，US-225）
-- ============================================
-- 第一个登记或推送某个非 main 分支的已登录用户认领它，之后只有所有者能登记、改写它，或往它推送日志。
-- 单独成表、不给 rxdb_branch 加列：一次推送会顺带上行从未登记过的祖先分支，认领它们时不能在
-- rxdb_branch 里造缺父分支的占位行（客户端 syncBranches 会把它当成拓扑错误）。
-- 只经 rxdb_claim_branch（SECURITY DEFINER，见 02）写入；开 RLS 且不建任何策略，
-- 客户端即便经下文的整库授权拿到表权限，也读写不了任何一行。
CREATE TABLE IF NOT EXISTS public.rxdb_branch_owner (
  "branchId" varchar PRIMARY KEY,
  "ownerId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);

ALTER TABLE public.rxdb_branch_owner ENABLE ROW LEVEL SECURITY;

-- ============================================
-- rxdb_backend 表（远端身份，单行）
-- ============================================
-- 拉取游标是 rxdb_change.id，只在同一个库里单调：库重建或变更日志被清空重新计数后，
-- 旧客户端的游标会越过新库的全部 id，拉取静默拉空。客户端经 rxdb_backend_id() 读这里的 id，
-- 与游标存在一起，每次同步前比对，对不上就停止同步。
-- 库重建时本表跟着重建、生成新 id；TRUNCATE rxdb_change 时由触发器换新 id（见 02）。
CREATE TABLE IF NOT EXISTS public.rxdb_backend (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);

INSERT INTO public.rxdb_backend DEFAULT VALUES
ON CONFLICT (singleton) DO NOTHING;

-- ============================================
-- 自动更新 updatedAt 触发器
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 幂等重建触发器必须用 `CREATE OR REPLACE TRIGGER`（PG 14+），不能用
-- `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`：
--
-- 在 Supabase 的库里，`DROP TRIGGER IF EXISTS x ON t` 会对**全库**的
-- auth.* / realtime.* 表加 AccessExclusiveLock（实测 19 张：16 张 auth 表 +
-- realtime.messages/subscription + 目标表），而且触发器根本不存在、只打一行
-- NOTICE 跳过时也照加不误。本脚本跑在 `docker compose up -d` 之后，此刻 GoTrue
-- 正在并发跑它那 69 个建表迁移（auth.users / auth.sessions / auth.refresh_tokens
-- …），两边的加锁顺序一反就是 `ERROR: deadlock detected` —— CI 的
-- `e2e (supabase remote)` 间歇性挂在这一行，runner 越慢命中率越高。
--
-- `CREATE OR REPLACE TRIGGER` 同样幂等，但只锁目标表（ShareRowExclusiveLock），
-- 实测对 auth.*/realtime.* 零加锁，物理上不可能和 GoTrue 迁移互锁。
CREATE OR REPLACE TRIGGER update_rxdb_change_updated_at
BEFORE UPDATE ON public.rxdb_change
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_rxdb_branch_updated_at
BEFORE UPDATE ON public.rxdb_branch
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 日志表不进 Supabase Realtime 发布（US-225）
-- ============================================
-- 变更通知改由日志插入触发器经 realtime.send 发只带元数据的广播（见 02 的 rxdb_change_broadcast）。
-- 日志表留在 supabase_realtime 发布里，订阅 postgres_changes 的客户端仍会收到带 patch 的完整行，
-- 所以旧版本加进去的 rxdb_change 在这里移出。
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

-- ============================================
-- 禁用 RLS 并授权（仅测试环境）
-- ============================================
ALTER TABLE IF EXISTS public.rxdb_change DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rxdb_branch DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rxdb_backend DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
