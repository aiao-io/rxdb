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

-- ============================================
-- 4. 管理后台（US-713）：只有 service_role 能用
--    管理员在 Worker 里认定，Worker 以 service role 身份调下面的函数；普通登录用户与匿名角色没有 EXECUTE。
--    service_role 默认没有 p2p 表的权限，这里只授予这几个函数用到的最小集合。
--    直接 DELETE 清单行会触发同步触发器，其他设备下一次拉取就能看到这些声明被撤回。
-- ============================================
GRANT SELECT, DELETE ON p2p.devices TO service_role;
GRANT SELECT, DELETE ON p2p.p2p_file_manifest TO service_role;

-- 每个有设备的账号：设备数与这些设备持有的声明数。
CREATE OR REPLACE FUNCTION p2p.admin_account_stats()
RETURNS TABLE (user_id uuid, device_count bigint, claim_count bigint)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT device.user_id, count(DISTINCT device.id), count(manifest.id)
  FROM p2p.devices AS device
  LEFT JOIN p2p.p2p_file_manifest AS manifest
    ON manifest."holderId" = p2p.holder_id(device.user_id, device.id)
  GROUP BY device.user_id
$$;

-- 清单里每个内容哈希的文件名与持有者数。
CREATE OR REPLACE FUNCTION p2p.admin_file_catalog()
RETURNS TABLE (content_hash text, file_name text, holder_count bigint)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT "contentHash"::text, min("fileName")::text, count(*)
  FROM p2p.p2p_file_manifest
  GROUP BY "contentHash"
$$;

-- 在一条语句里清掉账号的全部持有声明与设备登记，返回清掉的声明数；可重复执行。
-- 设备一并清掉：账号在被删除之前就既握不了手（设备不存在），也写不了新的声明（owns_holder 要求设备存在）。
CREATE OR REPLACE FUNCTION p2p.admin_purge_account(target uuid)
RETURNS bigint
LANGUAGE sql
SET search_path = pg_catalog, pg_temp
AS $$
  WITH claims AS (
    DELETE FROM p2p.p2p_file_manifest AS manifest
    USING p2p.devices AS device
    WHERE device.user_id = target
      AND manifest."holderId" = p2p.holder_id(device.user_id, device.id)
    RETURNING manifest.id
  ),
  registrations AS (
    DELETE FROM p2p.devices WHERE user_id = target RETURNING id
  )
  SELECT count(*) FROM claims
$$;

REVOKE ALL ON FUNCTION p2p.admin_account_stats(), p2p.admin_file_catalog(), p2p.admin_purge_account(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION p2p.admin_account_stats(), p2p.admin_file_catalog(), p2p.admin_purge_account(uuid)
  TO service_role;

-- ============================================
-- 5. 回退内容加密（POOL-US-101）：设备公钥与信封表
--    客户端生成 ECDH P-256 密钥对，私钥只存本机（localStorage，不进同步/备份/日志），公钥登记在设备表；
--    上传方给每台已登记公钥的设备封装一个信封（内容密钥对收件公钥的 ephemeral-static ECDH + GCM 包封），
--    信封经同步盲传：服务器只见密文与信封，没有收件私钥解不开。
-- ============================================
ALTER TABLE p2p.devices ADD COLUMN IF NOT EXISTS public_key varchar;

DROP POLICY IF EXISTS devices_update ON p2p.devices;
CREATE POLICY devices_update ON p2p.devices
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT UPDATE ON p2p.devices TO authenticated;

-- 全团队设备公钥：devices 的 RLS 只放行本人设备，公钥交换走 SECURITY DEFINER（属主绕过 RLS），
-- 只暴露设备 id 与公钥，不暴露账号与设备名。
CREATE OR REPLACE FUNCTION p2p.team_device_keys()
RETURNS TABLE (device_id uuid, public_key varchar)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT id, public_key FROM p2p.devices WHERE public_key IS NOT NULL
$$;

REVOKE ALL ON FUNCTION p2p.team_device_keys() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION p2p.team_device_keys() TO authenticated;

-- 收件人是否拥有这台设备：INVOKER 语义，子查询仍受 devices 的 RLS 约束，只看得到本人的设备。
CREATE OR REPLACE FUNCTION p2p.owns_device(device uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM p2p.devices AS device_row
    WHERE device_row.user_id = auth.uid() AND device_row.id = device
  )
$$;

CREATE TABLE IF NOT EXISTS p2p.p2p_fallback_envelope (
  id uuid PRIMARY KEY,
  "contentHash" varchar NOT NULL,
  "recipientDeviceId" uuid NOT NULL,
  kid varchar NOT NULL,
  epk varchar NOT NULL,
  iv varchar NOT NULL,
  ct varchar NOT NULL,
  tag varchar NOT NULL,
  "createdAt" timestamptz(3) DEFAULT now(),
  "updatedAt" timestamptz(3) DEFAULT now(),
  "createdBy" varchar,
  "updatedBy" varchar
);

CREATE INDEX IF NOT EXISTS idx_p2p_envelope_content ON p2p.p2p_fallback_envelope ("contentHash");
CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_envelope_content_recipient ON p2p.p2p_fallback_envelope ("contentHash", "recipientDeviceId");
CREATE INDEX IF NOT EXISTS idx_p2p_envelope_recipient ON p2p.p2p_fallback_envelope ("recipientDeviceId");

ALTER TABLE p2p.p2p_fallback_envelope ENABLE ROW LEVEL SECURITY;

-- 收件人读：只能读寄给本人设备的信封。
DROP POLICY IF EXISTS envelope_select ON p2p.p2p_fallback_envelope;
CREATE POLICY envelope_select ON p2p.p2p_fallback_envelope
  FOR SELECT TO authenticated USING (p2p.owns_device("recipientDeviceId"));

-- 写/改/删：任何已认证用户都能寄信封、更新或删掉自己的重复封装；篡改会被收件人的 AEAD 校验检出，
-- 删除只降级可用性，真正的清理走管理端的 admin_purge_account（service_role 绕过 RLS）。
DROP POLICY IF EXISTS envelope_insert ON p2p.p2p_fallback_envelope;
CREATE POLICY envelope_insert ON p2p.p2p_fallback_envelope
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS envelope_update ON p2p.p2p_fallback_envelope;
CREATE POLICY envelope_update ON p2p.p2p_fallback_envelope
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS envelope_delete ON p2p.p2p_fallback_envelope;
CREATE POLICY envelope_delete ON p2p.p2p_fallback_envelope
  FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON p2p.p2p_fallback_envelope TO authenticated;

DO $$
BEGIN
  PERFORM public.rxdb_enable_sync_for_table('p2p_fallback_envelope', 'p2p', 'P2PFallbackEnvelope');
END $$;

GRANT SELECT, DELETE ON p2p.p2p_fallback_envelope TO service_role;

-- 清账号时连同该账号设备的信封一起清（AC#9：不留孤儿信封）。
CREATE OR REPLACE FUNCTION p2p.admin_purge_account(target uuid)
RETURNS bigint
LANGUAGE sql
SET search_path = pg_catalog, pg_temp
AS $$
  WITH claims AS (
    DELETE FROM p2p.p2p_file_manifest AS manifest
    USING p2p.devices AS device
    WHERE device.user_id = target
      AND manifest."holderId" = p2p.holder_id(device.user_id, device.id)
    RETURNING manifest.id
  ),
  envelopes AS (
    DELETE FROM p2p.p2p_fallback_envelope AS envelope
    USING p2p.devices AS device
    WHERE device.user_id = target
      AND envelope."recipientDeviceId" = device.id
    RETURNING envelope.id
  ),
  registrations AS (
    DELETE FROM p2p.devices WHERE user_id = target RETURNING id
  )
  SELECT count(*) FROM claims
$$;
