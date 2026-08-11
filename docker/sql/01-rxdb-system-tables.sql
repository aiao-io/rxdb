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
-- 自动更新 updatedAt 触发器
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_rxdb_change_updated_at ON public.rxdb_change;
CREATE TRIGGER update_rxdb_change_updated_at
BEFORE UPDATE ON public.rxdb_change
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rxdb_branch_updated_at ON public.rxdb_branch;
CREATE TRIGGER update_rxdb_branch_updated_at
BEFORE UPDATE ON public.rxdb_branch
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 启用 Supabase Realtime（仅 rxdb_change 表）
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rxdb_change'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rxdb_change;
  END IF;
END $$;

-- ============================================
-- 禁用 RLS 并授权（仅测试环境）
-- ============================================
ALTER TABLE IF EXISTS public.rxdb_change DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rxdb_branch DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
