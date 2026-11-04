-- dev-rxdb-p2p 的服务端结构：设备登记与清单表（US-704 认证合同）。
--
-- 依赖 docker/sql/01～02 的 rxdb 系统表与同步函数；可重复执行。
-- PostgREST 必须暴露 p2p schema：本地栈见 docker/docker-compose.ci.yml 的 PGRST_DB_SCHEMAS，
-- 托管项目在 Supabase 控制台 API 设置的 Exposed schemas 里加上 p2p。

CREATE SCHEMA IF NOT EXISTS p2p;
GRANT USAGE ON SCHEMA p2p TO anon, authenticated, service_role;

-- ============================================
-- 1. 设备登记：deviceId 即主键，只有本人能登记、查看、删除
-- ============================================
CREATE TABLE IF NOT EXISTS p2p.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name varchar NOT NULL CHECK (char_length(name) BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_p2p_devices_user ON p2p.devices (user_id);

ALTER TABLE p2p.devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS devices_select ON p2p.devices;
CREATE POLICY devices_select ON p2p.devices
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS devices_insert ON p2p.devices;
CREATE POLICY devices_insert ON p2p.devices
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS devices_delete ON p2p.devices;
CREATE POLICY devices_delete ON p2p.devices
  FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON p2p.devices TO authenticated;

-- ============================================
-- 2. holderId 派生：与 @aiao/rxdb-plugin-p2p 的 deriveHolderId 相同，
--    即 'holder_' || sha256(JSON.stringify([principal, deviceId]))。
--    两个参数都是 uuid 的规范文本（小写、带连字符），不含需要 JSON 转义的字符。
-- ============================================
CREATE OR REPLACE FUNCTION p2p.holder_id(principal uuid, device_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'holder_' || encode(
    sha256(convert_to('["' || principal::text || '","' || device_id::text || '"]', 'UTF8')),
    'hex'
  )
$$;

-- 当前用户是否拥有这个 holderId：必须由本人登记的某台设备派生。
-- SECURITY INVOKER：查 p2p.devices 时同样受它的 RLS 约束，只看得到本人的设备。
CREATE OR REPLACE FUNCTION p2p.owns_holder(holder text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM p2p.devices AS device
    WHERE device.user_id = auth.uid()
      AND p2p.holder_id(device.user_id, device.id) = holder
  )
$$;

-- ============================================
-- 3. 清单表：P2PFileManifestEntity（namespace p2p，tableName p2p_file_manifest）
--    已认证用户都可读（读范围同部署）；写、删只许本人设备的持有声明（US-706 AC#6）。
-- ============================================
CREATE TABLE IF NOT EXISTS p2p.p2p_file_manifest (
  id uuid PRIMARY KEY,
  "contentHash" varchar NOT NULL,
  "fileName" varchar NOT NULL,
  size numeric NOT NULL,
  "chunkSize" integer NOT NULL,
  "chunkHashes" varchar[] NOT NULL,
  "sourceUrl" varchar,
  "holderId" varchar NOT NULL,
  "createdAt" timestamptz(3) DEFAULT now(),
  "updatedAt" timestamptz(3) DEFAULT now(),
  "createdBy" varchar,
  "updatedBy" varchar
);

CREATE INDEX IF NOT EXISTS idx_p2p_manifest_content_hash ON p2p.p2p_file_manifest ("contentHash");
CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_manifest_content_holder ON p2p.p2p_file_manifest ("contentHash", "holderId");
CREATE INDEX IF NOT EXISTS idx_p2p_manifest_updated_at ON p2p.p2p_file_manifest ("updatedAt");

ALTER TABLE p2p.p2p_file_manifest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manifest_select ON p2p.p2p_file_manifest;
CREATE POLICY manifest_select ON p2p.p2p_file_manifest
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS manifest_insert ON p2p.p2p_file_manifest;
CREATE POLICY manifest_insert ON p2p.p2p_file_manifest
  FOR INSERT TO authenticated WITH CHECK (p2p.owns_holder("holderId"));

DROP POLICY IF EXISTS manifest_update ON p2p.p2p_file_manifest;
CREATE POLICY manifest_update ON p2p.p2p_file_manifest
  FOR UPDATE TO authenticated
  USING (p2p.owns_holder("holderId"))
  WITH CHECK (p2p.owns_holder("holderId"));

DROP POLICY IF EXISTS manifest_delete ON p2p.p2p_file_manifest;
CREATE POLICY manifest_delete ON p2p.p2p_file_manifest
  FOR DELETE TO authenticated USING (p2p.owns_holder("holderId"));

GRANT SELECT, INSERT, UPDATE, DELETE ON p2p.p2p_file_manifest TO authenticated;

DO $$
BEGIN
  PERFORM public.rxdb_enable_sync_for_table('p2p_file_manifest', 'p2p', 'P2PFileManifest');
END $$;
