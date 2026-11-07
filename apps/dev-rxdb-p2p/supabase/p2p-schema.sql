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

-- 固定的 DER SPKI 头绑定 ECDH P-256；同时验证坐标范围及曲线方程，拒绝畸形曲线点。
CREATE OR REPLACE FUNCTION p2p.valid_device_public_key(value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  raw bytea;
  x numeric := 0;
  y numeric := 0;
  prime CONSTANT numeric := 115792089210356248762697446949407573530086143415290314195533631308867097853951;
  coefficient CONSTANT numeric := 41058363725152142129326129780047268409114441015993725554835256314039467401291;
BEGIN
  IF value !~ '^[A-Za-z0-9_-]{122}$' THEN RETURN false; END IF;
  raw := decode(translate(value, '-_', '+/') || '==', 'base64');
  IF octet_length(raw) <> 91 OR encode(substring(raw FROM 1 FOR 27), 'hex') <>
    '3059301306072a8648ce3d020106082a8648ce3d03010703420004' THEN RETURN false; END IF;
  FOR i IN 0..31 LOOP
    x := x * 256 + get_byte(raw, 27 + i);
    y := y * 256 + get_byte(raw, 59 + i);
  END LOOP;
  RETURN x < prime AND y < prime AND
    mod(y * y, prime) = mod(mod(x * x * x - 3 * x + coefficient, prime) + prime, prime);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END
$$;

-- 旧坏记录隔离成未登记公钥；所属设备下次启动会重新登记，不阻断团队上传。
UPDATE p2p.devices SET public_key = NULL
  WHERE public_key IS NOT NULL AND NOT p2p.valid_device_public_key(public_key);
ALTER TABLE p2p.devices DROP CONSTRAINT IF EXISTS devices_public_key_valid;
ALTER TABLE p2p.devices ADD CONSTRAINT devices_public_key_valid
  CHECK (public_key IS NULL OR p2p.valid_device_public_key(public_key));


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
  SELECT id, public_key FROM p2p.devices WHERE public_key IS NOT NULL AND p2p.valid_device_public_key(public_key)
$$;

REVOKE ALL ON FUNCTION p2p.team_device_keys() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION p2p.team_device_keys() TO authenticated;

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

-- 旧信封保留空 encHash 供新客户端读取；历史发布者不可可靠恢复，留给 service_role 管理。
ALTER TABLE p2p.p2p_fallback_envelope ADD COLUMN IF NOT EXISTS "encHash" varchar;
ALTER TABLE p2p.p2p_fallback_envelope ADD COLUMN IF NOT EXISTS "publisherUserId" uuid DEFAULT auth.uid();
DROP INDEX IF EXISTS p2p.idx_p2p_envelope_content_recipient;
CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_envelope_copy_recipient ON p2p.p2p_fallback_envelope ("encHash", "recipientDeviceId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_envelope_legacy_recipient ON p2p.p2p_fallback_envelope ("contentHash", "recipientDeviceId") WHERE "encHash" IS NULL;

CREATE INDEX IF NOT EXISTS idx_p2p_envelope_content ON p2p.p2p_fallback_envelope ("contentHash");
CREATE INDEX IF NOT EXISTS idx_p2p_envelope_recipient ON p2p.p2p_fallback_envelope ("recipientDeviceId");

ALTER TABLE p2p.p2p_fallback_envelope ENABLE ROW LEVEL SECURITY;

-- 读：所有已认证用户可读（信封是不可解密的密文，与清单同口径）。不能限「只读寄给本人设备的信封」：
-- PostgreSQL 对 ON CONFLICT 的仲裁探测应用 SELECT 策略，上传方看不到别家设备的行时，upsert 直接报 42501。
DROP POLICY IF EXISTS envelope_select ON p2p.p2p_fallback_envelope;
CREATE POLICY envelope_select ON p2p.p2p_fallback_envelope
  FOR SELECT TO authenticated USING (true);

-- 认证用户可以给任意设备寄信封；只有发布者能修改或删除自己发布的副本信封。
DROP POLICY IF EXISTS envelope_insert ON p2p.p2p_fallback_envelope;
CREATE POLICY envelope_insert ON p2p.p2p_fallback_envelope
  FOR INSERT TO authenticated WITH CHECK ("publisherUserId" = auth.uid() AND "encHash" ~ '^[0-9a-f]{64}$');

DROP POLICY IF EXISTS envelope_update ON p2p.p2p_fallback_envelope;
CREATE POLICY envelope_update ON p2p.p2p_fallback_envelope
  FOR UPDATE TO authenticated USING ("publisherUserId" = auth.uid())
  WITH CHECK ("publisherUserId" = auth.uid() AND "encHash" ~ '^[0-9a-f]{64}$');

DROP POLICY IF EXISTS envelope_delete ON p2p.p2p_fallback_envelope;
CREATE POLICY envelope_delete ON p2p.p2p_fallback_envelope
  FOR DELETE TO authenticated USING ("publisherUserId" = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON p2p.p2p_fallback_envelope TO authenticated;

-- 信封不经过同步实体：上传方直写、下载方直读（RLS），保留时间戳触发器、撤掉变更日志触发器。
DROP TRIGGER IF EXISTS rxdb_sync_trigger ON p2p.p2p_fallback_envelope;

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

-- ============================================
-- 6. 举报（POOL-US-102）：只存目标标识、分类、举报人与时间，不存文件内容与举报正文。
--    客户端经 Worker 的 /api/reports 提交，Worker 以 service_role 写这里；客户端没有表权限。
--    同一目标同一举报人的未处置举报只有一条（部分唯一索引）。
-- ============================================
CREATE TABLE IF NOT EXISTS p2p.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_hash varchar,
  target_source varchar,
  target_user uuid,
  category varchar NOT NULL CHECK (category IN ('malware', 'phishing', 'infringement', 'harassment', 'other')),
  reporter_user uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution varchar CHECK (resolution IN ('delete_copy', 'ban', 'ignore')),
  CHECK (target_hash IS NOT NULL OR target_user IS NOT NULL)
);

ALTER TABLE p2p.reports ADD COLUMN IF NOT EXISTS target_source varchar;

CREATE INDEX IF NOT EXISTS idx_p2p_reports_created ON p2p.reports (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_reports_open_dedupe
  ON p2p.reports (coalesce(target_hash, ''), coalesce(target_user::text, ''), reporter_user)
  WHERE resolved_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON p2p.reports TO service_role;

-- ============================================
-- 7. 邀请制 beta（POOL-US-102）：激活码一次性、可作废；激活状态登记在 activated_users。
--    码与激活表只对 service_role 开放；客户端的激活经 Worker 调用 p2p.activate_invite。
-- ============================================
CREATE TABLE IF NOT EXISTS p2p.invite_codes (
  code varchar PRIMARY KEY CHECK (char_length(code) BETWEEN 12 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  used_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  used_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS p2p.activated_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  code varchar,
  activated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON p2p.invite_codes TO service_role;
GRANT SELECT, INSERT ON p2p.activated_users TO service_role;

-- 按账号串行激活，重复调用不再消费邀请码；同一码的认领仍由 UPDATE 原子竞争。
CREATE OR REPLACE FUNCTION p2p.activate_invite(code_text varchar, user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  activated boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(user_id::text, 0));
  IF EXISTS (SELECT 1 FROM p2p.activated_users AS au WHERE au.user_id = activate_invite.user_id) THEN
    RETURN true;
  END IF;
  WITH claimed AS (
    UPDATE p2p.invite_codes
    SET used_by = activate_invite.user_id, used_at = now()
    WHERE code = code_text
      AND used_by IS NULL AND used_at IS NULL AND revoked_at IS NULL
    RETURNING code
  ),
  activation AS (
    INSERT INTO p2p.activated_users (user_id, code)
    SELECT activate_invite.user_id, code FROM claimed
    ON CONFLICT ON CONSTRAINT activated_users_pkey DO NOTHING
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM activation) INTO activated;
  RETURN activated;
END
$$;

REVOKE ALL ON FUNCTION p2p.activate_invite(varchar, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION p2p.activate_invite(varchar, uuid) TO service_role;

-- 是否已激活（邀请制 beta）：客户端与 Worker 都以调用者身份经 RPC 查询；
-- SECURITY DEFINER 只为了读 activated_users（该表不对客户端开放），判定仍按 auth.uid()。
CREATE OR REPLACE FUNCTION p2p.is_activated()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM p2p.activated_users WHERE user_id = auth.uid())
$$;

REVOKE ALL ON FUNCTION p2p.is_activated() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION p2p.is_activated() TO authenticated;
