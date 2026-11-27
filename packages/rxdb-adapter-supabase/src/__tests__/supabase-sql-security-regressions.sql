\set ON_ERROR_STOP on
\if :{?test_case}
\else
\set test_case all
\endif

-- 参考 SQL 由 run-supabase-sql-security-regressions.sh 拷进容器，目录经 -v sql_dir 传入
\if :{?sql_dir}
\else
DO $$ BEGIN RAISE EXCEPTION 'missing -v sql_dir (run via run-supabase-sql-security-regressions.sh)'; END $$;
\endif
\set sync_access_upgrade_file :sql_dir '/production/rxdb-sync-access-upgrade.sql'
\set sync_functions_file :sql_dir '/02-rxdb-sync-functions.sql'
\set utils_functions_file :sql_dir '/04-rxdb-utils-functions.sql'
\set production_grants_file :sql_dir '/production/rxdb-change-grants.sql'

BEGIN;

DROP SCHEMA IF EXISTS rxdb_sql_regression CASCADE;
DROP SCHEMA IF EXISTS rxdb_sql_function_shadow CASCADE;
DROP SCHEMA IF EXISTS rxdb_sql_catalog_shadow CASCADE;
DROP TABLE IF EXISTS public.rxdb_sql_trigger_probe;

CREATE SCHEMA rxdb_sql_regression;
CREATE SCHEMA rxdb_sql_function_shadow;
CREATE SCHEMA rxdb_sql_catalog_shadow;

CREATE TABLE rxdb_sql_regression.identity_scoped_rows (
  id text PRIMARY KEY,
  visibility text NOT NULL,
  owner_id uuid,
  value text NOT NULL,
  rxdb_bucket text GENERATED ALWAYS AS (
    CASE WHEN visibility = 'public' THEN 'public' ELSE 'user:' || owner_id::text END
  ) STORED
);
SELECT public.rxdb_enable_sync_for_table('identity_scoped_rows', 'rxdb_sql_regression', 'IdentityScopedRow');
ALTER TABLE rxdb_sql_regression.identity_scoped_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY identity_scoped_rows_select ON rxdb_sql_regression.identity_scoped_rows
  FOR SELECT USING (visibility = 'public' OR owner_id = auth.uid());
GRANT SELECT ON rxdb_sql_regression.identity_scoped_rows TO anon, authenticated;
INSERT INTO rxdb_sql_regression.identity_scoped_rows (id, visibility, owner_id, value)
VALUES
  ('bucket-public', 'public', NULL, 'public-value'),
  ('bucket-a', 'private', '00000000-0000-4000-8000-0000000000a1', 'a-value'),
  ('bucket-b', 'private', '00000000-0000-4000-8000-0000000000b2', 'b-value'),
  ('bucket-moved', 'public', NULL, 'moved-value');

-- 文档给业务表的分区 SELECT 策略（bucketed-documented-policy）：USING 表达式与
-- website/docs/adapters/supabase.md「配置 caller buckets」的示例逐字一致，两处一起改。
-- 不登记同步：只验证用户照抄的这条策略建得出来、按 caller buckets 放行
CREATE TABLE rxdb_sql_regression.documented_bucket_rows (
  id text PRIMARY KEY,
  owner_id uuid,
  rxdb_bucket text GENERATED ALWAYS AS (
    CASE WHEN owner_id IS NULL THEN 'public' ELSE 'user:' || owner_id::text END
  ) STORED
);
ALTER TABLE rxdb_sql_regression.documented_bucket_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY documented_bucket_rows_select
ON rxdb_sql_regression.documented_bucket_rows
FOR SELECT
USING (rxdb_bucket = ANY((SELECT public.rxdb_caller_buckets())::text[]));
INSERT INTO rxdb_sql_regression.documented_bucket_rows (id, owner_id)
VALUES
  ('documented-public', NULL),
  ('documented-a', '00000000-0000-4000-8000-0000000000a1'),
  ('documented-b', '00000000-0000-4000-8000-0000000000b2');

-- 远端变更历史（change-history，US-229）：按所有者分区的表、未分区的父子表（级联删除），
-- 以及一张调用者读不到 secret 列的未分区表（列权限在文末的授权里收）
CREATE TABLE rxdb_sql_regression.history_owned_rows (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL,
  visibility text NOT NULL DEFAULT 'private',
  value text NOT NULL,
  rxdb_bucket text GENERATED ALWAYS AS (
    CASE WHEN visibility = 'public' THEN 'public' ELSE 'user:' || owner_id::text END
  ) STORED
);
SELECT public.rxdb_enable_sync_for_table('history_owned_rows', 'rxdb_sql_regression', 'HistoryOwnedRow');
ALTER TABLE rxdb_sql_regression.history_owned_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY history_owned_rows_owner ON rxdb_sql_regression.history_owned_rows
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE rxdb_sql_regression.history_parents (
  id text PRIMARY KEY,
  value text NOT NULL
);
CREATE TABLE rxdb_sql_regression.history_children (
  id text PRIMARY KEY,
  "parentId" text NOT NULL REFERENCES rxdb_sql_regression.history_parents(id) ON DELETE CASCADE,
  value text NOT NULL
);
SELECT public.rxdb_enable_sync_for_table('history_parents', 'rxdb_sql_regression', 'HistoryParent');
SELECT public.rxdb_enable_sync_for_table('history_children', 'rxdb_sql_regression', 'HistoryChild');

CREATE TABLE rxdb_sql_regression.history_plain_rows (
  id text PRIMARY KEY,
  value text NOT NULL,
  secret text
);
SELECT public.rxdb_enable_sync_for_table('history_plain_rows', 'rxdb_sql_regression', 'HistoryPlainRow');

-- 分区实体的推送（bucketed-push）：表不在 public schema，只有所有者能读写自己的行；公开的行在 public 区
CREATE TABLE rxdb_sql_regression.bucket_push_rows (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL,
  visibility text NOT NULL DEFAULT 'private',
  value text NOT NULL,
  rxdb_bucket text GENERATED ALWAYS AS (
    CASE WHEN visibility = 'public' THEN 'public' ELSE 'user:' || owner_id::text END
  ) STORED
);
SELECT public.rxdb_enable_sync_for_table('bucket_push_rows', 'rxdb_sql_regression', 'BucketPushRow');
ALTER TABLE rxdb_sql_regression.bucket_push_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY bucket_push_rows_owner ON rxdb_sql_regression.bucket_push_rows
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
INSERT INTO rxdb_sql_regression.bucket_push_rows (id, owner_id, value)
VALUES
  ('push-a', '00000000-0000-4000-8000-0000000000a1', 'a-value'),
  ('push-b', '00000000-0000-4000-8000-0000000000b2', 'b-value');

-- uuid 主键的分区表（bucketed-push）：按区拉取按 id 列自己的类型找当前行
CREATE TABLE rxdb_sql_regression.uuid_bucket_rows (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  value text NOT NULL,
  rxdb_bucket text GENERATED ALWAYS AS ('user:' || owner_id::text) STORED
);
SELECT public.rxdb_enable_sync_for_table('uuid_bucket_rows', 'rxdb_sql_regression', 'UuidBucketRow');
ALTER TABLE rxdb_sql_regression.uuid_bucket_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY uuid_bucket_rows_owner ON rxdb_sql_regression.uuid_bucket_rows
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
INSERT INTO rxdb_sql_regression.uuid_bucket_rows (id, owner_id, value)
VALUES ('0a5e0000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000a1', 'uuid-value');

-- 按区同步的读取边界（bucketed-guards）
-- 可读列超过 50 个的宽表：jsonb_build_object 一次最多 100 个参数
DO $$
DECLARE
  v_columns text := '';
BEGIN
  FOR i IN 1..60 LOOP
    v_columns := v_columns || pg_catalog.format(', wide_%s text', i);
  END LOOP;
  EXECUTE pg_catalog.format(
    'CREATE TABLE rxdb_sql_regression.wide_bucket_rows (id text PRIMARY KEY%s, rxdb_bucket text GENERATED ALWAYS AS (''public'') STORED)',
    v_columns
  );
END $$;
SELECT public.rxdb_enable_sync_for_table('wide_bucket_rows', 'rxdb_sql_regression', 'WideBucketRow');
ALTER TABLE rxdb_sql_regression.wide_bucket_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY wide_bucket_rows_read ON rxdb_sql_regression.wide_bucket_rows FOR SELECT USING (true);
INSERT INTO rxdb_sql_regression.wide_bucket_rows (id, wide_1, wide_60) VALUES ('wide-1', 'first', 'last');

-- 列权限：secret 列谁都读不到（列授权在下文整库授权之后收紧）
CREATE TABLE rxdb_sql_regression.column_bucket_rows (
  id text PRIMARY KEY,
  value text NOT NULL,
  secret text NOT NULL,
  rxdb_bucket text GENERATED ALWAYS AS ('public') STORED
);
SELECT public.rxdb_enable_sync_for_table('column_bucket_rows', 'rxdb_sql_regression', 'ColumnBucketRow');
ALTER TABLE rxdb_sql_regression.column_bucket_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY column_bucket_rows_read ON rxdb_sql_regression.column_bucket_rows FOR SELECT USING (true);
INSERT INTO rxdb_sql_regression.column_bucket_rows (id, value, secret) VALUES ('column-1', 'visible', 'hidden');

-- 旧实体转分区：先按未分区登记、写下带正文的历史日志，用例里再加 rxdb_bucket 重新登记
CREATE TABLE rxdb_sql_regression.legacy_bucket_rows (
  id text PRIMARY KEY,
  value text NOT NULL
);
SELECT public.rxdb_enable_sync_for_table('legacy_bucket_rows', 'rxdb_sql_regression', 'LegacyBucketRow');
INSERT INTO rxdb_sql_regression.legacy_bucket_rows (id, value) VALUES ('legacy-1', 'legacy history');

-- RLS 自检认得出视图，并分得清普通视图（以属主权限执行、绕过底层表的 RLS）与 security_invoker 视图（评审 #4）
CREATE VIEW rxdb_sql_regression.bucket_rows_view AS
  SELECT id, value FROM rxdb_sql_regression.identity_scoped_rows;
CREATE VIEW rxdb_sql_regression.bucket_rows_invoker_view WITH (security_invoker = on) AS
  SELECT id, value FROM rxdb_sql_regression.identity_scoped_rows;

CREATE TABLE rxdb_sql_regression.text_ids (
  id text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE rxdb_sql_regression.varchar_ids (
  id varchar(64) PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE rxdb_sql_regression.uuid_ids (
  id uuid PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE rxdb_sql_regression.update_column_privileges (
  id text PRIMARY KEY,
  value text NOT NULL,
  secret text NOT NULL
);
SELECT public.rxdb_enable_sync_for_table('update_column_privileges', 'rxdb_sql_regression', 'UpdateColumnPrivileges');
INSERT INTO rxdb_sql_regression.update_column_privileges (id, value, secret)
VALUES ('limited-columns', 'original', 'private');

CREATE TABLE rxdb_sql_regression.update_visibility_rows (
  id text PRIMARY KEY,
  visible boolean NOT NULL DEFAULT true
);
SELECT public.rxdb_enable_sync_for_table('update_visibility_rows', 'rxdb_sql_regression', 'UpdateVisibility');
ALTER TABLE rxdb_sql_regression.update_visibility_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY update_visibility_select ON rxdb_sql_regression.update_visibility_rows FOR SELECT USING (visible);
CREATE POLICY update_visibility_insert ON rxdb_sql_regression.update_visibility_rows FOR INSERT WITH CHECK (true);
CREATE POLICY update_visibility_update ON rxdb_sql_regression.update_visibility_rows FOR UPDATE USING (true) WITH CHECK (true);
INSERT INTO rxdb_sql_regression.update_visibility_rows (id)
VALUES ('visibility-count'), ('visibility-push'), ('visibility-direct');

CREATE TABLE rxdb_sql_regression.no_dml_ids (
  id text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE rxdb_sql_regression.rls_denied_ids (
  id text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE rxdb_sql_regression.rls_denied_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE rxdb_sql_regression.rls_denied_ids FORCE ROW LEVEL SECURITY;

-- receipts-many-groups 需要能用 rxdb_existing_ids 探针区分 denied/gone，补同步触发器
SELECT public.rxdb_enable_sync_for_table('rls_denied_ids', 'rxdb_sql_regression', 'RlsDenied');

-- receipts-many-groups 夹具：70 行默认拒绝的记录，每组各删 1 行，验证不触发子事务层数问题
INSERT INTO rxdb_sql_regression.rls_denied_ids (id, value)
SELECT 'receipts-many-' || g, 'denied'
FROM pg_catalog.generate_series(1, 70) AS g;

CREATE TABLE rxdb_sql_regression.rls_owned_ids (
  id text PRIMARY KEY,
  owner text NOT NULL,
  value text NOT NULL
);

ALTER TABLE rxdb_sql_regression.rls_owned_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE rxdb_sql_regression.rls_owned_ids FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_owned_select ON rxdb_sql_regression.rls_owned_ids
  FOR SELECT USING (true);
CREATE POLICY rls_owned_delete ON rxdb_sql_regression.rls_owned_ids
  FOR DELETE USING (owner = pg_catalog.current_setting('rxdb_sql_regression.uid', true));

INSERT INTO rxdb_sql_regression.rls_owned_ids (id, owner, value)
VALUES ('owned-by-b', 'sql-owner-b', 'original');

-- receipts-idempotent 第 2 部分专用：首次被拒、放开策略后重试变为 applied
INSERT INTO rxdb_sql_regression.rls_owned_ids (id, owner, value)
VALUES ('owned-by-receipts', 'sql-owner-receipts-denied', 'original');

-- 存在性探针 rxdb_existing_ids 的夹具：调用方看不见的同步表、uuid 主键同步表、非同步表、同名伪触发器表、FORCE RLS 同步表
CREATE TABLE rxdb_sql_regression.probe_hidden_ids (
  id text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE rxdb_sql_regression.probe_hidden_ids ENABLE ROW LEVEL SECURITY;

INSERT INTO rxdb_sql_regression.probe_hidden_ids (id, value)
VALUES ('probe-hidden-1', 'hidden');

CREATE TABLE rxdb_sql_regression.probe_uuid_ids (
  id uuid PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO rxdb_sql_regression.probe_uuid_ids (id, value)
VALUES ('2200aaaa-0000-4000-8000-00000000000a', 'uuid');

CREATE TABLE rxdb_sql_regression.probe_plain_ids (
  id text PRIMARY KEY
);

INSERT INTO rxdb_sql_regression.probe_plain_ids (id)
VALUES ('probe-plain-1');

CREATE TABLE rxdb_sql_regression.probe_fake_trigger_ids (
  id text PRIMARY KEY
);

INSERT INTO rxdb_sql_regression.probe_fake_trigger_ids (id)
VALUES ('probe-fake-1');

CREATE FUNCTION rxdb_sql_regression.noop_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN NULL;
END;
$$;

-- 同名但不是 public.rxdb_log_change_trigger 的触发器，不得被探针当成同步表
CREATE TRIGGER rxdb_sync_trigger
AFTER INSERT OR UPDATE OR DELETE ON rxdb_sql_regression.probe_fake_trigger_ids
FOR EACH ROW EXECUTE FUNCTION rxdb_sql_regression.noop_trigger();

CREATE TABLE rxdb_sql_regression.probe_forced_ids (
  id text PRIMARY KEY
);

ALTER TABLE rxdb_sql_regression.probe_forced_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE rxdb_sql_regression.probe_forced_ids FORCE ROW LEVEL SECURITY;

INSERT INTO rxdb_sql_regression.probe_forced_ids (id)
VALUES ('probe-forced-1');

SELECT public.rxdb_enable_sync_for_table('probe_hidden_ids', 'rxdb_sql_regression', 'ProbeHidden');
SELECT public.rxdb_enable_sync_for_table('probe_uuid_ids', 'rxdb_sql_regression', 'ProbeUuid');
SELECT public.rxdb_enable_sync_for_table('probe_forced_ids', 'rxdb_sql_regression', 'ProbeForced');

-- 推送完整性（US-218 阶段 A）的夹具：删除零行判定要走探针，夹具表都挂同步触发器。
-- 保留 FORCE ROW LEVEL SECURITY：探针属主 postgres 带 BYPASSRLS，FORCE 表上照样给出正确结论（006 tasks T004 验证记录）
SELECT public.rxdb_enable_sync_for_table('rls_owned_ids', 'rxdb_sql_regression', 'RlsOwnedId');

-- 读与删都仅本人：调用方既看不见也删不掉他人的行
CREATE TABLE rxdb_sql_regression.rls_hidden_ids (
  id text PRIMARY KEY,
  owner text NOT NULL,
  value text NOT NULL
);

ALTER TABLE rxdb_sql_regression.rls_hidden_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE rxdb_sql_regression.rls_hidden_ids FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_hidden_select ON rxdb_sql_regression.rls_hidden_ids
  FOR SELECT USING (owner = pg_catalog.current_setting('rxdb_sql_regression.uid', true));
CREATE POLICY rls_hidden_delete ON rxdb_sql_regression.rls_hidden_ids
  FOR DELETE USING (owner = pg_catalog.current_setting('rxdb_sql_regression.uid', true));

INSERT INTO rxdb_sql_regression.rls_hidden_ids (id, owner, value)
VALUES ('hidden-by-b', 'sql-owner-b', 'original');

-- 不开 RLS 的同步表：可放行的新建 / 修改 / 删除都落在这里
CREATE TABLE rxdb_sql_regression.push_open_ids (
  id text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO rxdb_sql_regression.push_open_ids (id, value)
VALUES ('open-1', 'original'), ('open-deletable-1', 'original');

SELECT public.rxdb_enable_sync_for_table('rls_hidden_ids', 'rxdb_sql_regression', 'RlsHiddenId');
SELECT public.rxdb_enable_sync_for_table('push_open_ids', 'rxdb_sql_regression', 'PushOpen');

-- UPDATE 推送语义（US-220）的夹具：owner 型 RLS、共享编辑型 RLS、三种被拒形态、全可空列表
CREATE TABLE rxdb_sql_regression.rls_update_owner (
  id text PRIMARY KEY,
  owner text NOT NULL,
  value text NOT NULL
);

ALTER TABLE rxdb_sql_regression.rls_update_owner ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_update_owner_all ON rxdb_sql_regression.rls_update_owner
  FOR ALL
  USING (owner = pg_catalog.current_setting('rxdb_sql_regression.uid', true))
  WITH CHECK (owner = pg_catalog.current_setting('rxdb_sql_regression.uid', true));

CREATE TABLE rxdb_sql_regression.rls_update_shared (
  id text PRIMARY KEY,
  owner text NOT NULL,
  value text NOT NULL
);

ALTER TABLE rxdb_sql_regression.rls_update_shared ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_update_shared_select ON rxdb_sql_regression.rls_update_shared
  FOR SELECT USING (true);
CREATE POLICY rls_update_shared_insert ON rxdb_sql_regression.rls_update_shared
  FOR INSERT WITH CHECK (owner = pg_catalog.current_setting('rxdb_sql_regression.uid', true));
CREATE POLICY rls_update_shared_update ON rxdb_sql_regression.rls_update_shared
  FOR UPDATE USING (true) WITH CHECK (true);

-- 被拒①：行可见，UPDATE 的 USING 不放行
CREATE TABLE rxdb_sql_regression.rls_update_denied_using (
  id text PRIMARY KEY,
  owner text NOT NULL,
  value text NOT NULL
);

ALTER TABLE rxdb_sql_regression.rls_update_denied_using ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_update_denied_using_select ON rxdb_sql_regression.rls_update_denied_using
  FOR SELECT USING (true);
CREATE POLICY rls_update_denied_using_update ON rxdb_sql_regression.rls_update_denied_using
  FOR UPDATE USING (owner = pg_catalog.current_setting('rxdb_sql_regression.uid', true));

-- 被拒②：UPDATE 放行，但 SELECT 看不见目标行
CREATE TABLE rxdb_sql_regression.rls_update_denied_select (
  id text PRIMARY KEY,
  owner text NOT NULL,
  value text NOT NULL
);

ALTER TABLE rxdb_sql_regression.rls_update_denied_select ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_update_denied_select_select ON rxdb_sql_regression.rls_update_denied_select
  FOR SELECT USING (owner = pg_catalog.current_setting('rxdb_sql_regression.uid', true));
CREATE POLICY rls_update_denied_select_update ON rxdb_sql_regression.rls_update_denied_select
  FOR UPDATE USING (true);

-- 被拒③：UPDATE 的 WITH CHECK 拒绝新行（PostgreSQL 自己抛 42501）
CREATE TABLE rxdb_sql_regression.rls_update_denied_check (
  id text PRIMARY KEY,
  owner text NOT NULL,
  value text NOT NULL
);

ALTER TABLE rxdb_sql_regression.rls_update_denied_check ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_update_denied_check_select ON rxdb_sql_regression.rls_update_denied_check
  FOR SELECT USING (true);
CREATE POLICY rls_update_denied_check_update ON rxdb_sql_regression.rls_update_denied_check
  FOR UPDATE USING (true) WITH CHECK (false);

CREATE TABLE rxdb_sql_regression.update_nullable_ids (
  id text PRIMARY KEY,
  value text
);

SELECT public.rxdb_enable_sync_for_table('rls_update_owner', 'rxdb_sql_regression', 'RlsUpdateOwner');
SELECT public.rxdb_enable_sync_for_table('rls_update_shared', 'rxdb_sql_regression', 'RlsUpdateShared');
SELECT public.rxdb_enable_sync_for_table('rls_update_denied_using', 'rxdb_sql_regression', 'RlsUpdateDeniedUsing');
SELECT public.rxdb_enable_sync_for_table('rls_update_denied_select', 'rxdb_sql_regression', 'RlsUpdateDeniedSelect');
SELECT public.rxdb_enable_sync_for_table('rls_update_denied_check', 'rxdb_sql_regression', 'RlsUpdateDeniedCheck');
SELECT public.rxdb_enable_sync_for_table('update_nullable_ids', 'rxdb_sql_regression', 'UpdateNullable');

INSERT INTO rxdb_sql_regression.rls_update_owner (id, owner, value)
VALUES ('update-owner-1', 'sql-owner-a', 'original');
INSERT INTO rxdb_sql_regression.rls_update_shared (id, owner, value)
VALUES ('update-shared-1', 'sql-owner-b', 'original');
INSERT INTO rxdb_sql_regression.rls_update_denied_using (id, owner, value)
VALUES ('denied-using-1', 'sql-owner-b', 'original');
INSERT INTO rxdb_sql_regression.rls_update_denied_select (id, owner, value)
VALUES ('denied-select-1', 'sql-owner-b', 'original');
INSERT INTO rxdb_sql_regression.rls_update_denied_check (id, owner, value)
VALUES ('denied-check-1', 'sql-owner-b', 'original');
INSERT INTO rxdb_sql_regression.update_nullable_ids (id, value)
VALUES ('nullable-kept', 'original');

CREATE TABLE rxdb_sql_regression.trigger_probe (
  id varchar(64) PRIMARY KEY,
  value text NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT pg_catalog.now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE rxdb_sql_regression.idempotency_probe (
  id text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE rxdb_sql_regression.idempotency_effects (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  effect_count integer NOT NULL DEFAULT 0
);

INSERT INTO rxdb_sql_regression.idempotency_effects (id, effect_count)
VALUES (true, 0);

CREATE FUNCTION rxdb_sql_regression.count_idempotency_effect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, rxdb_sql_regression, pg_temp
AS $$
BEGIN
  UPDATE rxdb_sql_regression.idempotency_effects
  SET effect_count = effect_count + 1
  WHERE id = true;
  RETURN NEW;
END;
$$;

CREATE TRIGGER count_idempotency_effect
AFTER INSERT OR UPDATE ON rxdb_sql_regression.idempotency_probe
FOR EACH ROW EXECUTE FUNCTION rxdb_sql_regression.count_idempotency_effect();

-- receipts-unclassified 夹具：唯一约束冲突触发不可归类的 23505，整批失败
CREATE TABLE rxdb_sql_regression.unique_conflict_ids (
  id text PRIMARY KEY,
  unique_value text NOT NULL UNIQUE
);

INSERT INTO rxdb_sql_regression.unique_conflict_ids (id, unique_value)
VALUES ('unique-conflict-seed', 'taken');

-- receipts-dependency 夹具（单列外键）：父表 INSERT 策略拒绝一切新建，子表单列外键引用父表 id
CREATE TABLE rxdb_sql_regression.receipts_parent_ids (
  id text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE rxdb_sql_regression.receipts_parent_ids ENABLE ROW LEVEL SECURITY;

CREATE POLICY receipts_parent_select ON rxdb_sql_regression.receipts_parent_ids
  FOR SELECT USING (true);
CREATE POLICY receipts_parent_insert ON rxdb_sql_regression.receipts_parent_ids
  FOR INSERT WITH CHECK (false);

CREATE TABLE rxdb_sql_regression.receipts_child_ids (
  id text PRIMARY KEY,
  "parentId" text NOT NULL REFERENCES rxdb_sql_regression.receipts_parent_ids (id),
  value text NOT NULL
);

SELECT public.rxdb_enable_sync_for_table('receipts_parent_ids', 'rxdb_sql_regression', 'ReceiptsParent');
SELECT public.rxdb_enable_sync_for_table('receipts_child_ids', 'rxdb_sql_regression', 'ReceiptsChild');

-- receipts-dependency 夹具（多列外键）：复合主键父表 + 两列外键子表，解析不出单列父实体时回退 {constraint}
CREATE TABLE rxdb_sql_regression.receipts_parent_multi_ids (
  a text NOT NULL,
  b text NOT NULL,
  PRIMARY KEY (a, b)
);

CREATE TABLE rxdb_sql_regression.receipts_child_multi_ids (
  id text PRIMARY KEY,
  "parentA" text NOT NULL,
  "parentB" text NOT NULL,
  value text NOT NULL,
  CONSTRAINT receipts_child_multi_parent_fk FOREIGN KEY ("parentA", "parentB")
    REFERENCES rxdb_sql_regression.receipts_parent_multi_ids (a, b)
);

SELECT public.rxdb_enable_sync_for_table('receipts_parent_multi_ids', 'rxdb_sql_regression', 'ReceiptsParentMulti');
SELECT public.rxdb_enable_sync_for_table('receipts_child_multi_ids', 'rxdb_sql_regression', 'ReceiptsChildMulti');

-- deferred-cycle 夹具（US-038）：双向一对一。cycle_users."cardId" 可空（ON DELETE SET NULL），cycle_cards."ownerId" 非空
-- （ON DELETE CASCADE），另有复合外键 ("cardId", id) → cycle_cards (id, "ownerId")（MATCH SIMPLE，cardId 为空时不检查）。
-- 证件的 code 为 'denied' 时 RLS 拒绝新建；cycle_full_refs 的复合外键是 MATCH FULL，用来验证延迟列校验
CREATE TABLE rxdb_sql_regression.cycle_users (
  id text PRIMARY KEY,
  name text NOT NULL,
  nickname text,
  "cardId" text
);

CREATE TABLE rxdb_sql_regression.cycle_cards (
  id text PRIMARY KEY,
  code text NOT NULL,
  "ownerId" text NOT NULL REFERENCES rxdb_sql_regression.cycle_users (id) ON DELETE CASCADE,
  CONSTRAINT cycle_cards_identity UNIQUE (id, "ownerId")
);

ALTER TABLE rxdb_sql_regression.cycle_users
  ADD CONSTRAINT cycle_users_card_fkey
    FOREIGN KEY ("cardId") REFERENCES rxdb_sql_regression.cycle_cards (id) ON DELETE SET NULL,
  ADD CONSTRAINT cycle_users_card_owner_fkey
    FOREIGN KEY ("cardId", id) REFERENCES rxdb_sql_regression.cycle_cards (id, "ownerId");

ALTER TABLE rxdb_sql_regression.cycle_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY cycle_cards_select ON rxdb_sql_regression.cycle_cards FOR SELECT USING (true);
CREATE POLICY cycle_cards_insert ON rxdb_sql_regression.cycle_cards FOR INSERT WITH CHECK (code <> 'denied');
CREATE POLICY cycle_cards_update ON rxdb_sql_regression.cycle_cards FOR UPDATE USING (true) WITH CHECK (code <> 'denied');
CREATE POLICY cycle_cards_delete ON rxdb_sql_regression.cycle_cards FOR DELETE USING (true);

CREATE TABLE rxdb_sql_regression.cycle_full_refs (
  id text PRIMARY KEY,
  "cardRef" text,
  "ownerRef" text,
  CONSTRAINT cycle_full_refs_card_fkey FOREIGN KEY ("cardRef", "ownerRef")
    REFERENCES rxdb_sql_regression.cycle_cards (id, "ownerId") MATCH FULL
);

SELECT public.rxdb_enable_sync_for_table('cycle_users', 'rxdb_sql_regression', 'CycleUser');
SELECT public.rxdb_enable_sync_for_table('cycle_cards', 'rxdb_sql_regression', 'CycleCard');

-- 级联删除日志复现（零散收尾项第 12 条）：父表 + ON DELETE CASCADE 子表，都挂同步触发器。
-- 用回归内夹具表而不是参考 schema 的 menu_large：本用例要按实体名精确计数
-- CascadeParent / CascadeChild 的日志，参考表上跑其它 spec 的并发写入会污染计数。
CREATE TABLE rxdb_sql_regression.cascade_parent_ids (
  id text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE rxdb_sql_regression.cascade_child_ids (
  id text PRIMARY KEY,
  "parentId" text NOT NULL REFERENCES rxdb_sql_regression.cascade_parent_ids (id) ON DELETE CASCADE,
  value text NOT NULL
);

SELECT public.rxdb_enable_sync_for_table('cascade_parent_ids', 'rxdb_sql_regression', 'CascadeParent');
SELECT public.rxdb_enable_sync_for_table('cascade_child_ids', 'rxdb_sql_regression', 'CascadeChild');

CREATE TABLE rxdb_sql_regression.cascade_nodes (
  id text PRIMARY KEY,
  "parentId" text REFERENCES rxdb_sql_regression.cascade_nodes (id) ON DELETE CASCADE,
  value text NOT NULL
);
SELECT public.rxdb_enable_sync_for_table('cascade_nodes', 'rxdb_sql_regression', 'CascadeNode');
ALTER TABLE rxdb_sql_regression.cascade_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY cascade_nodes_select ON rxdb_sql_regression.cascade_nodes FOR SELECT USING (true);
CREATE POLICY cascade_nodes_insert ON rxdb_sql_regression.cascade_nodes FOR INSERT WITH CHECK (true);
CREATE POLICY cascade_nodes_delete ON rxdb_sql_regression.cascade_nodes
  FOR DELETE USING (id NOT LIKE 'cascade-denied-%');

CREATE TABLE rxdb_sql_regression.cascade_hidden_children (
  id text PRIMARY KEY,
  "parentId" text REFERENCES rxdb_sql_regression.cascade_parent_ids (id) ON DELETE CASCADE,
  value text NOT NULL
);
CREATE TABLE rxdb_sql_regression.cascade_uuid_nodes (
  id uuid PRIMARY KEY,
  "parentId" uuid REFERENCES rxdb_sql_regression.cascade_uuid_nodes (id) ON DELETE CASCADE,
  value text NOT NULL
);
SELECT public.rxdb_enable_sync_for_table('cascade_uuid_nodes', 'rxdb_sql_regression', 'CascadeUuidNode');
ALTER TABLE rxdb_sql_regression.cascade_uuid_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY cascade_uuid_select ON rxdb_sql_regression.cascade_uuid_nodes FOR SELECT USING (true);
CREATE POLICY cascade_uuid_insert ON rxdb_sql_regression.cascade_uuid_nodes FOR INSERT WITH CHECK (true);
CREATE POLICY cascade_uuid_delete ON rxdb_sql_regression.cascade_uuid_nodes
  FOR DELETE USING (id != 'fedcba00-0000-4000-8000-000000000002'::uuid);

SELECT public.rxdb_enable_sync_for_table('cascade_hidden_children', 'rxdb_sql_regression', 'CascadeHiddenChild');
ALTER TABLE rxdb_sql_regression.cascade_hidden_children ENABLE ROW LEVEL SECURITY;
CREATE POLICY cascade_hidden_insert ON rxdb_sql_regression.cascade_hidden_children
  FOR INSERT WITH CHECK (true);

-- 数值主键：numeric(8,2) 存的是 1.00；无修饰的 numeric 按写入时的小数位存 1.00。客户端（JSON 数字）都按 "1" 删除，
-- 显式删除与实际删除按 id 列类型的等值关系配对，不比文本
CREATE TABLE rxdb_sql_regression.numeric_key_nodes (
  id numeric(8,2) PRIMARY KEY,
  value text NOT NULL
);
SELECT public.rxdb_enable_sync_for_table('numeric_key_nodes', 'rxdb_sql_regression', 'NumericKeyNode');
CREATE TABLE rxdb_sql_regression.numeric_plain_key_nodes (
  id numeric PRIMARY KEY,
  value text NOT NULL
);
SELECT public.rxdb_enable_sync_for_table('numeric_plain_key_nodes', 'rxdb_sql_regression', 'NumericPlainKeyNode');

-- 分区表：同步挂在根表上，叶分区的触发器由 PostgreSQL 克隆，TG_TABLE_NAME 是叶分区名
CREATE TABLE rxdb_sql_regression.partitioned_key_nodes (
  id integer,
  value text NOT NULL,
  PRIMARY KEY (id)
) PARTITION BY RANGE (id);
CREATE TABLE rxdb_sql_regression.partitioned_key_nodes_low
  PARTITION OF rxdb_sql_regression.partitioned_key_nodes FOR VALUES FROM (0) TO (100);
SELECT public.rxdb_enable_sync_for_table('partitioned_key_nodes', 'rxdb_sql_regression', 'PartitionedKeyNode');

CREATE TABLE public.rxdb_sql_trigger_probe (
  id varchar(64) PRIMARY KEY,
  value text NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT pg_catalog.now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE rxdb_sql_catalog_shadow.pg_namespace (
  oid oid,
  nspname name
);

CREATE TABLE rxdb_sql_catalog_shadow.pg_class (
  relnamespace oid,
  relname name,
  relkind "char",
  relrowsecurity boolean,
  relforcerowsecurity boolean
);

CREATE FUNCTION rxdb_sql_function_shadow.jsonb_array_length(jsonb)
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'shadow jsonb_array_length called';
END;
$$;

CREATE FUNCTION rxdb_sql_function_shadow.jsonb_array_elements(jsonb)
RETURNS SETOF jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'shadow jsonb_array_elements called';
END;
$$;

CREATE FUNCTION rxdb_sql_function_shadow.rxdb_batch_upsert(text, text, jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'shadow rxdb_batch_upsert called';
END;
$$;

CREATE FUNCTION rxdb_sql_function_shadow.rxdb_batch_delete(text, text, text[])
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'shadow rxdb_batch_delete called';
END;
$$;

CREATE FUNCTION rxdb_sql_function_shadow.rxdb_update_timestamp_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'shadow rxdb_update_timestamp_trigger called';
END;
$$;

CREATE FUNCTION rxdb_sql_function_shadow.rxdb_log_change_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'shadow rxdb_log_change_trigger called';
END;
$$;

CREATE FUNCTION rxdb_sql_regression.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE FUNCTION rxdb_sql_regression.bucket_set_visibility(
  p_id text,
  p_visibility text,
  p_owner_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE rxdb_sql_regression.identity_scoped_rows
  SET visibility = p_visibility, owner_id = p_owner_id
  WHERE id = p_id;
END;
$$;

-- 以属主身份清理 rxdb_change（零散收尾项第 13 条）：
-- 开发/CI 默认已收紧日志表写权限（docker/sql/production/rxdb-change-grants.sql），
-- anon / authenticated 对 rxdb_change 只剩 SELECT，anon 由 RLS 只看到 public 区。回归用例的准备步骤（按 clientId
-- 清场）改走本 SECURITY DEFINER helper；「客户端直插被拒」的断言（production-change-grants
-- 用例里的 42501）保留，那正是被测行为。
CREATE FUNCTION rxdb_sql_regression.clear_change_log(p_client_ids text[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  DELETE FROM public.rxdb_change
  WHERE p_client_ids IS NULL OR "clientId" = ANY(p_client_ids);
END;
$$;

-- 以属主身份清理分支登记与所有者（US-225）：生产权限收回了客户端对 rxdb_branch 的直写，
-- 「客户端直写被拒」的断言在 branch-ownership 用例里
CREATE FUNCTION rxdb_sql_regression.clear_branch(p_branch_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  DELETE FROM public.rxdb_branch WHERE id = p_branch_id;
  DELETE FROM public.rxdb_branch_owner WHERE "branchId" = p_branch_id;
END;
$$;

-- 以属主身份读业务列：被测调用方（anon）在 SELECT 策略下可能看不见目标行
CREATE FUNCTION rxdb_sql_regression.value_as_owner(p_table text, p_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_value text;
BEGIN
  EXECUTE pg_catalog.format(
    'SELECT value FROM rxdb_sql_regression.%I WHERE id = $1',
    p_table
  ) INTO v_value USING p_id;
  RETURN v_value;
END;
$$;

CREATE FUNCTION rxdb_sql_regression.count_entity_changes(p_entity_id text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.count(*)::integer
  FROM public.rxdb_change
  WHERE "entityId" = p_entity_id;
$$;

CREATE FUNCTION rxdb_sql_regression.assert_rejection_detail(
  p_detail text,
  p_reason text,
  p_schema text,
  p_table text,
  p_entity_id text,
  p_op text DEFAULT 'UPDATE'
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_detail jsonb := p_detail::jsonb;
BEGIN
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.array_agg(k ORDER BY k COLLATE "C") FROM pg_catalog.jsonb_object_keys(v_detail) AS keys(k))
      = ARRAY['entityId', 'op', 'reason', 'schema', 'table'],
    pg_catalog.format('rejection DETAIL must carry exactly op/schema/table/entityId/reason: %s', p_detail)
  );
  PERFORM rxdb_sql_regression.assert_true(
    v_detail->>'op' = p_op
      AND v_detail->>'reason' = p_reason
      AND v_detail->>'schema' = p_schema
      AND v_detail->>'table' = p_table
      AND v_detail->>'entityId' = p_entity_id,
    pg_catalog.format('rejection DETAIL must describe %s %s.%s id=%s reason=%s: %s', p_op, p_schema, p_table, p_entity_id, p_reason, p_detail)
  );
END;
$$;

-- 业务表内容 + rxdb_change 行数的指纹：被拒调用前后取一次，断言什么都没变
CREATE FUNCTION rxdb_sql_regression.push_fingerprint(p_table text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_rows text;
  v_changes bigint;
BEGIN
  EXECUTE pg_catalog.format(
    'SELECT pg_catalog.string_agg(pg_catalog.to_jsonb(t)::text, %L ORDER BY t.id) FROM rxdb_sql_regression.%I AS t',
    ',',
    p_table
  ) INTO v_rows;
  SELECT pg_catalog.count(*) INTO v_changes FROM public.rxdb_change;
  RETURN pg_catalog.format('%s|%s', v_changes, v_rows);
END;
$$;

-- 推送一次不配对的调用：断言 RX002、MESSAGE 与 DETAIL 形状，且业务表与 rxdb_change 都不变
CREATE FUNCTION rxdb_sql_regression.assert_integrity_violation(
  p_label text,
  p_upserts jsonb,
  p_deletes jsonb,
  p_changes jsonb,
  p_skip_sync boolean,
  p_updates jsonb,
  p_reason text,
  p_op text,
  p_table text,
  p_entity_id text,
  p_schema text DEFAULT 'rxdb_sql_regression'
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_before text := rxdb_sql_regression.push_fingerprint('push_open_ids');
  v_violated boolean := false;
  v_message text;
  v_detail text;
BEGIN
  BEGIN
    PERFORM public.rxdb_mutations(p_upserts, p_deletes, p_changes, p_skip_sync, p_updates);
  EXCEPTION
    WHEN SQLSTATE 'RX002' THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
      v_violated := true;
  END;

  PERFORM rxdb_sql_regression.assert_true(v_violated, pg_catalog.format('%s: must raise RX002', p_label));
  PERFORM rxdb_sql_regression.assert_true(
    v_message = pg_catalog.format('rxdb: push integrity violation (%s): %I.%I id=%s', p_reason, p_schema, p_table, p_entity_id),
    pg_catalog.format('%s: unexpected message: %s', p_label, v_message)
  );
  PERFORM rxdb_sql_regression.assert_rejection_detail(v_detail, p_reason, p_schema, p_table, p_entity_id, p_op);
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.push_fingerprint('push_open_ids') = v_before,
    pg_catalog.format('%s: rejected call must change neither business rows nor rxdb_change', p_label)
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.assert_delete_uses_primary_key(
  p_table text,
  p_id text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  plan json;
  v_id_array_type pg_catalog.regtype;
  previous_enable_seqscan text;
BEGIN
  SELECT t.typarray::pg_catalog.regtype
  INTO v_id_array_type
  FROM pg_catalog.pg_attribute AS a
  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_type AS t ON t.oid = a.atttypid
  WHERE n.nspname = 'rxdb_sql_regression'
    AND c.relname = p_table
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  previous_enable_seqscan := pg_catalog.current_setting('enable_seqscan');
  PERFORM pg_catalog.set_config('enable_seqscan', 'off', true);

  EXECUTE pg_catalog.format(
    'EXPLAIN (FORMAT JSON, COSTS OFF) DELETE FROM %I.%I WHERE id = ANY($1::%s)',
    'rxdb_sql_regression',
    p_table,
    v_id_array_type
  ) INTO plan USING ARRAY[p_id]::text[];

  PERFORM pg_catalog.set_config('enable_seqscan', previous_enable_seqscan, true);
  PERFORM rxdb_sql_regression.assert_true(
    plan->0->'Plan'->'Plans'->0->>'Index Name' = p_table || '_pkey',
    pg_catalog.format('%s delete must preserve primary-key index semantics', p_table)
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_text_varchar()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  mutation_result jsonb;
BEGIN
  -- 不带日志的直写走触发器模式（p_skip_sync = false）：显式日志模式下每条写都必须有配对日志（US-218 阶段 A）
  SELECT public.rxdb_mutations(
    '[
      {"schema":"rxdb_sql_regression","table":"text_ids","data":[{"id":"text-1","value":"text"}]},
      {"schema":"rxdb_sql_regression","table":"varchar_ids","data":[{"id":"varchar-1","value":"varchar"}]}
    ]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    false
  ) INTO mutation_result;

  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.jsonb_array_length(mutation_result->'upserted') = 2,
    'text/varchar push must return both rows'
  );
  PERFORM rxdb_sql_regression.assert_delete_uses_primary_key('text_ids', 'text-1');
  PERFORM rxdb_sql_regression.assert_delete_uses_primary_key('varchar_ids', 'varchar-1');

  SELECT public.rxdb_mutations(
    '[]'::jsonb,
    '[
      {"schema":"rxdb_sql_regression","table":"text_ids","ids":["text-1"]},
      {"schema":"rxdb_sql_regression","table":"varchar_ids","ids":["varchar-1"]}
    ]'::jsonb,
    '[]'::jsonb,
    false
  ) INTO mutation_result;

  PERFORM rxdb_sql_regression.assert_true(
    mutation_result->>'deleted' = '2',
    'text/varchar delete must use each id column regtype'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.text_ids),
    'text row must be deleted'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.varchar_ids),
    'varchar row must be deleted'
  );
  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.to_regprocedure('public.rxdb_batch_delete(text,text,text[])') IS NOT NULL,
    'rxdb_batch_delete text[] RPC signature must remain stable'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_entity_id()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  mutation_result jsonb;
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-security-regression-entity-id']);

  -- 显式日志模式下日志必须与写配对（US-218 阶段 A），这里带上同 id 的新建
  SELECT public.rxdb_mutations(
    '[{"schema":"rxdb_sql_regression","table":"text_ids","data":[{"id":"text-entity-1","value":"entity"}]}]'::jsonb,
    '[]'::jsonb,
    '[{
      "namespace":"rxdb_sql_regression",
      "entity":"TextEntity",
      "schema":"rxdb_sql_regression",
      "table":"text_ids",
      "entityId":"text-entity-1",
      "type":"INSERT",
      "patch":{"id":"text-entity-1"},
      "branchId":"main",
      "clientId":"sql-security-regression-entity-id",
      "localId":710001
    }]'::jsonb,
    true
  ) INTO mutation_result;

  PERFORM rxdb_sql_regression.assert_true(
    mutation_result->>'changes' = '1',
    'text entityId mutation must insert one change'
  );
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (
      SELECT 1
      FROM public.rxdb_change
      WHERE "clientId" = 'sql-security-regression-entity-id'
        AND "entityId" = 'text-entity-1'
    ),
    'text entityId must be stored without uuid coercion'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_idempotent_retry()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, rxdb_sql_regression, pg_temp
AS $$
DECLARE
  first_result jsonb;
  retry_result jsonb;
  first_remote_id bigint;
  retry_remote_id bigint;
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-idempotency-client']);
  DELETE FROM rxdb_sql_regression.idempotency_probe;
  UPDATE rxdb_sql_regression.idempotency_effects SET effect_count = 0 WHERE id = true;

  SELECT public.rxdb_mutations(
    '[{
      "schema":"rxdb_sql_regression",
      "table":"idempotency_probe",
      "data":[{"id":"retry-1","value":"first"}]
    }]'::jsonb,
    '[]'::jsonb,
    '[{
      "namespace":"rxdb_sql_regression",
      "entity":"IdempotencyProbe",
      "schema":"rxdb_sql_regression",
      "table":"idempotency_probe",
      "entityId":"retry-1",
      "type":"INSERT",
      "patch":{"id":"retry-1","value":"first"},
      "branchId":"main",
      "clientId":"sql-idempotency-client",
      "localId":720001
    }]'::jsonb,
    true
  ) INTO first_result;

  SELECT public.rxdb_mutations(
    '[{
      "schema":"rxdb_sql_regression",
      "table":"idempotency_probe",
      "data":[{"id":"retry-1","value":"first"}]
    }]'::jsonb,
    '[]'::jsonb,
    '[{
      "namespace":"rxdb_sql_regression",
      "entity":"IdempotencyProbe",
      "schema":"rxdb_sql_regression",
      "table":"idempotency_probe",
      "entityId":"retry-1",
      "type":"INSERT",
      "patch":{"id":"retry-1","value":"first"},
      "branchId":"main",
      "clientId":"sql-idempotency-client",
      "localId":720001
    }]'::jsonb,
    true
  ) INTO retry_result;

  SELECT (mapping->>'remoteId')::bigint
  INTO first_remote_id
  FROM pg_catalog.jsonb_array_elements(first_result->'change_id_mapping') AS mappings(mapping);

  SELECT (mapping->>'remoteId')::bigint
  INTO retry_remote_id
  FROM pg_catalog.jsonb_array_elements(retry_result->'change_id_mapping') AS mappings(mapping);

  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change WHERE "clientId" = 'sql-idempotency-client') = 1,
    'retry must keep exactly one remote change'
  );
  PERFORM rxdb_sql_regression.assert_true(
    first_remote_id = retry_remote_id,
    'retry must return the original remote change id'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT effect_count FROM rxdb_sql_regression.idempotency_effects WHERE id = true) = 1,
    'retry must not execute entity side effects twice'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_uuid()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  mutation_result jsonb;
BEGIN
  SELECT public.rxdb_mutations(
    '[{
      "schema":"rxdb_sql_regression",
      "table":"uuid_ids",
      "data":[{"id":"11111111-1111-4111-8111-111111111111","value":"uuid"}]
    }]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    false
  ) INTO mutation_result;

  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.jsonb_array_length(mutation_result->'upserted') = 1,
    'uuid push must remain compatible'
  );
  PERFORM rxdb_sql_regression.assert_delete_uses_primary_key(
    'uuid_ids',
    '11111111-1111-4111-8111-111111111111'
  );

  SELECT public.rxdb_mutations(
    '[]'::jsonb,
    '[{
      "schema":"rxdb_sql_regression",
      "table":"uuid_ids",
      "ids":["11111111-1111-4111-8111-111111111111"]
    }]'::jsonb,
    '[]'::jsonb,
    false
  ) INTO mutation_result;

  PERFORM rxdb_sql_regression.assert_true(
    mutation_result->>'deleted' = '1',
    'uuid delete must remain compatible'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_search_path()
RETURNS void
LANGUAGE plpgsql
SET search_path = rxdb_sql_function_shadow, public, pg_catalog
AS $$
DECLARE
  mutation_result jsonb;
  unsafe_functions integer;
BEGIN
  SELECT public.rxdb_mutations(
    '[{
      "schema":"rxdb_sql_regression",
      "table":"text_ids",
      "data":[{"id":"shadow-safe","value":"safe"}]
    }]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    false
  ) INTO mutation_result;

  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.jsonb_array_length(mutation_result->'upserted') = 1,
    'rxdb_mutations must ignore caller search_path shadows'
  );

  SELECT pg_catalog.count(*)::integer
  INTO unsafe_functions
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'rxdb_enable_sync_for_branch',
      'rxdb_batch_upsert',
      'rxdb_batch_delete',
      'rxdb_mutations'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(p.proconfig) AS setting
      WHERE setting = 'search_path=pg_catalog, pg_temp'
    );

  PERFORM rxdb_sql_regression.assert_true(
    unsafe_functions = 0,
    'every security-sensitive RPC must pin search_path'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_rls_invoker()
RETURNS void
LANGUAGE plpgsql
SET search_path = rxdb_sql_catalog_shadow, public, pg_catalog
AS $$
DECLARE
  result jsonb;
  is_definer boolean;
BEGIN
  SELECT p.prosecdef
  INTO is_definer
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.oid = pg_catalog.to_regprocedure('public.rxdb_check_rls(jsonb)');

  PERFORM rxdb_sql_regression.assert_true(
    is_definer = false,
    'rxdb_check_rls must be SECURITY INVOKER'
  );

  SELECT public.rxdb_check_rls('[{"schema":"public","table":"todos"}]'::jsonb)
  INTO result;

  PERFORM rxdb_sql_regression.assert_true(
    result->0->>'exists' = 'true',
    'rxdb_check_rls must read pg_catalog instead of caller shadows'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_rls_write_boundary()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  unsafe_write_rpcs integer;
  old_signature_gone boolean;
  new_signature_invoker boolean;
  write_rpcs regprocedure[] := ARRAY[
    pg_catalog.to_regprocedure('public.rxdb_batch_upsert(text,text,jsonb)'),
    pg_catalog.to_regprocedure('public.rxdb_batch_update(text,text,jsonb)'),
    pg_catalog.to_regprocedure('public.rxdb_batch_delete(text,text,text[])'),
    pg_catalog.to_regprocedure('public.rxdb_mutations(jsonb,jsonb,jsonb,boolean,jsonb,boolean,jsonb)')
  ];
  no_dml_blocked boolean := false;
  rls_blocked boolean := false;
BEGIN
  -- 签名一旦改动，to_regprocedure 返回 NULL 会让下面的 INVOKER 检查静默失效
  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.array_position(write_rpcs, NULL) IS NULL,
    pg_catalog.format('every write RPC signature must resolve: %s', write_rpcs)
  );

  -- US-218 阶段 B 删掉旧 5 参签名，US-038 删掉 6 参签名：只剩 7 参签名，且非 SECURITY DEFINER
  old_signature_gone := pg_catalog.to_regprocedure('public.rxdb_mutations(jsonb,jsonb,jsonb,boolean,jsonb)') IS NULL
    AND pg_catalog.to_regprocedure('public.rxdb_mutations(jsonb,jsonb,jsonb,boolean,jsonb,boolean)') IS NULL;
  SELECT pg_catalog.to_regprocedure('public.rxdb_mutations(jsonb,jsonb,jsonb,boolean,jsonb,boolean,jsonb)') IS NOT NULL
    AND NOT p.prosecdef
  INTO new_signature_invoker
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = pg_catalog.to_regprocedure('public.rxdb_mutations(jsonb,jsonb,jsonb,boolean,jsonb,boolean,jsonb)');
  PERFORM rxdb_sql_regression.assert_true(old_signature_gone, 'the old 5-arg and 6-arg rxdb_mutations signatures must be dropped');
  PERFORM rxdb_sql_regression.assert_true(new_signature_invoker, 'the 7-arg rxdb_mutations signature must exist and run as SECURITY INVOKER');

  SELECT pg_catalog.count(*)::integer
  INTO unsafe_write_rpcs
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.oid = ANY(write_rpcs::oid[])
    AND p.prosecdef;

  BEGIN
    PERFORM public.rxdb_mutations(
      '[{"schema":"rxdb_sql_regression","table":"no_dml_ids","data":[{"id":"forbidden","value":"no grant"}]}]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      false
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      no_dml_blocked := true;
  END;

  BEGIN
    PERFORM public.rxdb_mutations(
      '[{"schema":"rxdb_sql_regression","table":"rls_denied_ids","data":[{"id":"forbidden","value":"denied by RLS"}]}]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      false
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      rls_blocked := true;
  END;

  PERFORM rxdb_sql_regression.assert_true(
    unsafe_write_rpcs = 0,
    'write RPCs must execute as SECURITY INVOKER'
  );
  PERFORM rxdb_sql_regression.assert_true(
    no_dml_blocked,
    'rxdb_mutations must not bypass missing table DML grants'
  );
  PERFORM rxdb_sql_regression.assert_true(
    rls_blocked,
    'rxdb_mutations must not bypass deny-all FORCE ROW LEVEL SECURITY'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_rls_filtered_delete()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  rls_rejected boolean := false;
  error_detail text;
  error_message text;
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-rls-filter-client']);
  PERFORM pg_catalog.set_config('rxdb_sql_regression.uid', 'sql-owner-a', true);

  -- 行对调用方可见，但 DELETE 的 USING 策略把它过滤掉：普通 DELETE 静默零行，必须显式 42501
  BEGIN
    PERFORM public.rxdb_mutations(
      '[]'::jsonb,
      '[{"schema":"rxdb_sql_regression","table":"rls_owned_ids","ids":["owned-by-b"]}]'::jsonb,
      '[{
        "namespace":"rxdb_sql_regression",
        "entity":"RlsOwnedProbe",
        "schema":"rxdb_sql_regression",
        "table":"rls_owned_ids",
        "entityId":"owned-by-b",
        "type":"DELETE",
        "branchId":"main",
        "clientId":"sql-rls-filter-client",
        "localId":730001
      }]'::jsonb,
      true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS error_detail = PG_EXCEPTION_DETAIL, error_message = MESSAGE_TEXT;
      rls_rejected := true;
  END;

  PERFORM rxdb_sql_regression.assert_true(
    rls_rejected,
    'rxdb_mutations must reject a visible row that RLS refuses to delete'
  );
  PERFORM rxdb_sql_regression.assert_true(
    error_message = 'rxdb: DELETE denied by row-level security: rxdb_sql_regression.rls_owned_ids id=owned-by-b',
    pg_catalog.format('RLS-filtered delete message must be self-describing: %s', error_message)
  );
  PERFORM rxdb_sql_regression.assert_rejection_detail(
    error_detail, 'denied', 'rxdb_sql_regression', 'rls_owned_ids', 'owned-by-b', 'DELETE'
  );
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM rxdb_sql_regression.rls_owned_ids WHERE id = 'owned-by-b'),
    'RLS-filtered delete must leave the row in place'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM public.rxdb_change WHERE "clientId" = 'sql-rls-filter-client'),
    'rxdb_mutations must not log a DELETE that RLS filtered to zero rows'
  );
END;
$$;

-- 行连 SELECT 都看不见、DELETE 也删不掉：调用方无从区分「不存在」与「被拒」，探针兜住判定
CREATE FUNCTION rxdb_sql_regression.test_delete_hidden_row()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  rls_rejected boolean := false;
  error_detail text;
  error_message text;
BEGIN
  PERFORM pg_catalog.set_config('rxdb_sql_regression.uid', 'sql-owner-a', true);

  BEGIN
    PERFORM public.rxdb_mutations(
      '[]'::jsonb,
      '[{"schema":"rxdb_sql_regression","table":"rls_hidden_ids","ids":["hidden-by-b"]}]'::jsonb,
      '[{
        "namespace":"rxdb_sql_regression",
        "entity":"RlsHiddenId",
        "schema":"rxdb_sql_regression",
        "table":"rls_hidden_ids",
        "entityId":"hidden-by-b",
        "type":"DELETE",
        "inversePatch":{"id":"hidden-by-b","owner":"sql-owner-b","value":"original"},
        "branchId":"main",
        "clientId":"sql-hidden-delete-client",
        "localId":740001
      }]'::jsonb,
      true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS error_detail = PG_EXCEPTION_DETAIL, error_message = MESSAGE_TEXT;
      rls_rejected := true;
  END;

  PERFORM rxdb_sql_regression.assert_true(
    rls_rejected,
    'deleting a row hidden by RLS must raise 42501, not succeed silently'
  );
  PERFORM rxdb_sql_regression.assert_true(
    error_message = 'rxdb: DELETE denied by row-level security: rxdb_sql_regression.rls_hidden_ids id=hidden-by-b',
    pg_catalog.format('hidden-row delete message must be self-describing: %s', error_message)
  );
  PERFORM rxdb_sql_regression.assert_rejection_detail(
    error_detail, 'denied', 'rxdb_sql_regression', 'rls_hidden_ids', 'hidden-by-b', 'DELETE'
  );
END;
$$;

-- 调用方看不见 rls_hidden_ids 的行，事后核对放在 RESET ROLE 之后以属主身份执行
CREATE FUNCTION rxdb_sql_regression.test_delete_hidden_row_verify()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM rxdb_sql_regression.rls_hidden_ids WHERE id = 'hidden-by-b' AND value = 'original'),
    'denied hidden-row delete must leave the row in place'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM public.rxdb_change WHERE "clientId" = 'sql-hidden-delete-client'),
    'denied hidden-row delete must not log'
  );
END;
$$;

-- 删除时行已不存在：幂等成功、日志照记；探针只接受同步表，非同步表零行仍是 22023
CREATE FUNCTION rxdb_sql_regression.test_delete_gone()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  mutation_result jsonb;
  probe_rejected boolean := false;
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-delete-gone-client']);

  -- ① 整批都已不存在
  mutation_result := public.rxdb_mutations(
    '[]'::jsonb,
    '[{"schema":"rxdb_sql_regression","table":"push_open_ids","ids":["open-gone-1"]}]'::jsonb,
    '[{
      "namespace":"rxdb_sql_regression",
      "entity":"PushOpen",
      "schema":"rxdb_sql_regression",
      "table":"push_open_ids",
      "entityId":"open-gone-1",
      "type":"DELETE",
      "inversePatch":{"id":"open-gone-1","value":"gone"},
      "branchId":"main",
      "clientId":"sql-delete-gone-client",
      "localId":750001
    }]'::jsonb,
    true
  );
  PERFORM rxdb_sql_regression.assert_true(mutation_result->>'deleted' = '0', 'gone delete must report deleted = 0');
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change WHERE "clientId" = 'sql-delete-gone-client') = 1,
    'gone delete must still log the DELETE'
  );

  -- ② 一条真删、一条已不存在：部分零行同样幂等成功
  mutation_result := public.rxdb_mutations(
    '[]'::jsonb,
    '[{"schema":"rxdb_sql_regression","table":"push_open_ids","ids":["open-deletable-1","open-gone-2"]}]'::jsonb,
    '[
      {
        "namespace":"rxdb_sql_regression",
        "entity":"PushOpen",
        "schema":"rxdb_sql_regression",
        "table":"push_open_ids",
        "entityId":"open-deletable-1",
        "type":"DELETE",
        "branchId":"main",
        "clientId":"sql-delete-gone-client",
        "localId":750002
      },
      {
        "namespace":"rxdb_sql_regression",
        "entity":"PushOpen",
        "schema":"rxdb_sql_regression",
        "table":"push_open_ids",
        "entityId":"open-gone-2",
        "type":"DELETE",
        "inversePatch":{"id":"open-gone-2","value":"gone"},
        "branchId":"main",
        "clientId":"sql-delete-gone-client",
        "localId":750003
      }
    ]'::jsonb,
    true
  );
  PERFORM rxdb_sql_regression.assert_true(mutation_result->>'deleted' = '1', 'partially gone delete must report deleted = 1');
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.push_open_ids WHERE id = 'open-deletable-1'),
    'partially gone delete must still delete the existing row'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change WHERE "clientId" = 'sql-delete-gone-client') = 3,
    'partially gone delete must log both DELETEs'
  );

  -- ③ 非同步表上的零行删除：探针拒绝判定，整批失败
  BEGIN
    PERFORM public.rxdb_mutations(
      '[]'::jsonb,
      '[{"schema":"rxdb_sql_regression","table":"text_ids","ids":["text-gone-1"]}]'::jsonb,
      '[{
        "namespace":"rxdb_sql_regression",
        "entity":"TextEntity",
        "schema":"rxdb_sql_regression",
        "table":"text_ids",
        "entityId":"text-gone-1",
        "type":"DELETE",
        "inversePatch":{"id":"text-gone-1","value":"gone"},
        "branchId":"main",
        "clientId":"sql-delete-gone-client",
        "localId":750004
      }]'::jsonb,
      true
    );
  EXCEPTION
    WHEN invalid_parameter_value THEN
      probe_rejected := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    probe_rejected,
    'zero-row delete on a non-sync table must raise 22023 from the existence probe'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM public.rxdb_change WHERE "clientId" = 'sql-delete-gone-client' AND "localId" = 750004),
    'probe-rejected delete must not log'
  );
END;
$$;

-- 同批一条被拒删除、一条可放行的新建：整批回滚，可放行的那条也不生效
CREATE FUNCTION rxdb_sql_regression.test_mixed_batch_rollback()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  open_before text := rxdb_sql_regression.push_fingerprint('push_open_ids');
  owned_before text := rxdb_sql_regression.push_fingerprint('rls_owned_ids');
  rls_rejected boolean := false;
BEGIN
  PERFORM pg_catalog.set_config('rxdb_sql_regression.uid', 'sql-owner-a', true);

  BEGIN
    PERFORM public.rxdb_mutations(
      '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"open-mixed-1","value":"new"}]}]'::jsonb,
      '[{"schema":"rxdb_sql_regression","table":"rls_owned_ids","ids":["owned-by-b"]}]'::jsonb,
      '[
        {
          "namespace":"rxdb_sql_regression",
          "entity":"PushOpen",
          "schema":"rxdb_sql_regression",
          "table":"push_open_ids",
          "entityId":"open-mixed-1",
          "type":"INSERT",
          "patch":{"id":"open-mixed-1","value":"new"},
          "branchId":"main",
          "clientId":"sql-mixed-batch-client",
          "localId":760001
        },
        {
          "namespace":"rxdb_sql_regression",
          "entity":"RlsOwnedId",
          "schema":"rxdb_sql_regression",
          "table":"rls_owned_ids",
          "entityId":"owned-by-b",
          "type":"DELETE",
          "branchId":"main",
          "clientId":"sql-mixed-batch-client",
          "localId":760002
        }
      ]'::jsonb,
      true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      rls_rejected := true;
  END;

  PERFORM rxdb_sql_regression.assert_true(rls_rejected, 'mixed batch with a denied delete must raise 42501');
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.push_fingerprint('push_open_ids') = open_before,
    'mixed batch must roll back the allowed insert and every log'
  );
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.push_fingerprint('rls_owned_ids') = owned_before,
    'mixed batch must leave the denied row in place'
  );
END;
$$;

-- push_open_ids 上的一条日志；patch / inversePatch 只为让快照有值，配对校验不读它们
CREATE FUNCTION rxdb_sql_regression.push_log(
  p_entity_id text,
  p_type text,
  p_local_id integer,
  p_branch_id text DEFAULT 'main'
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'namespace', 'rxdb_sql_regression',
    'entity', 'PushOpen',
    'schema', 'rxdb_sql_regression',
    'table', 'push_open_ids',
    'entityId', p_entity_id,
    'type', p_type,
    'patch', CASE WHEN p_type = 'DELETE' THEN NULL ELSE pg_catalog.jsonb_build_object('id', p_entity_id, 'value', 'pushed') END,
    'inversePatch', CASE WHEN p_type = 'INSERT' THEN NULL ELSE pg_catalog.jsonb_build_object('id', p_entity_id, 'value', 'original') END,
    'branchId', p_branch_id,
    'clientId', 'sql-push-integrity-client',
    'localId', p_local_id
  );
$$;

CREATE FUNCTION rxdb_sql_regression.test_push_integrity()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  mutation_result jsonb;
  todo_id constant text := '22000000-0000-4000-8000-0000000000a1';
  helper_oid oid := pg_catalog.to_regprocedure('public.rxdb_assert_push_integrity(jsonb,jsonb,jsonb,boolean,jsonb)');
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-push-integrity-client']);

  -- ⓪ 校验 helper：INVOKER、只读、固定 search_path；rxdb_mutations 是 INVOKER，客户端角色须显式持有 EXECUTE
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS p
      WHERE p.oid = helper_oid AND NOT p.prosecdef AND p.provolatile = 's'
        AND 'search_path=pg_catalog, pg_temp' = ANY(p.proconfig)
    ),
    'rxdb_assert_push_integrity must be SECURITY INVOKER, STABLE and pin search_path'
  );
  -- 只断言 authenticated：anon 的执行权由生产权限脚本收回（US-225），收回与否随栈的初始化状态而定，
  -- 在 anon-sync-protocol / production-grants-idempotent 里于脚本生效之后断言
  PERFORM rxdb_sql_regression.assert_true(
    (
      SELECT pg_catalog.count(*) = 1
      FROM pg_catalog.pg_proc AS p, pg_catalog.aclexplode(p.proacl) AS acl
      WHERE p.oid = helper_oid
        AND acl.privilege_type = 'EXECUTE'
        AND acl.grantee = 'authenticated'::regrole
    ),
    'rxdb_assert_push_integrity must be explicitly granted to authenticated like the other rxdb_mutations helpers'
  );

  -- ① 五种不配对各一例
  PERFORM rxdb_sql_regression.assert_integrity_violation(
    'explicit log in trigger mode',
    '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"open-int-1","value":"new"}]}]'::jsonb,
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(rxdb_sql_regression.push_log('open-int-1', 'INSERT', 770001)),
    false,
    '[]'::jsonb,
    'explicit_log_in_trigger_mode', 'INSERT', 'push_open_ids', 'open-int-1'
  );
  PERFORM rxdb_sql_regression.assert_integrity_violation(
    'duplicate write',
    '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"open-int-2","value":"new"}]}]'::jsonb,
    '[{"schema":"rxdb_sql_regression","table":"push_open_ids","ids":["open-int-2"]}]'::jsonb,
    pg_catalog.jsonb_build_array(rxdb_sql_regression.push_log('open-int-2', 'INSERT', 770002)),
    true,
    '[]'::jsonb,
    'duplicate_write', 'DELETE', 'push_open_ids', 'open-int-2'
  );
  PERFORM rxdb_sql_regression.assert_integrity_violation(
    'unpaired change',
    '[]'::jsonb,
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(rxdb_sql_regression.push_log('open-1', 'DELETE', 770003)),
    true,
    '[]'::jsonb,
    'unpaired_change', 'DELETE', 'push_open_ids', 'open-1'
  );
  PERFORM rxdb_sql_regression.assert_integrity_violation(
    'unpaired write',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    true,
    '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"open-1","value":"changed"}]}]'::jsonb,
    'unpaired_write', 'UPDATE', 'push_open_ids', 'open-1'
  );
  PERFORM rxdb_sql_regression.assert_integrity_violation(
    'op mismatch',
    '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"open-int-3","value":"new"}]}]'::jsonb,
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(
      rxdb_sql_regression.push_log('open-int-3', 'INSERT', 770004),
      rxdb_sql_regression.push_log('open-int-3', 'DELETE', 770005)
    ),
    true,
    '[]'::jsonb,
    'op_mismatch', 'DELETE', 'push_open_ids', 'open-int-3'
  );

  -- ② 同时违反检查 3 与 4：按序报第一处
  PERFORM rxdb_sql_regression.assert_integrity_violation(
    'first violation wins',
    '[]'::jsonb,
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(rxdb_sql_regression.push_log('open-int-4', 'UPDATE', 770006)),
    true,
    '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"open-1","value":"changed"}]}]'::jsonb,
    'unpaired_change', 'UPDATE', 'push_open_ids', 'open-int-4'
  );

  -- ③ 压缩：同一键三条 main 日志对应一次写
  mutation_result := public.rxdb_mutations(
    '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"open-int-5","value":"compacted"}]}]'::jsonb,
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(
      rxdb_sql_regression.push_log('open-int-5', 'INSERT', 770007),
      rxdb_sql_regression.push_log('open-int-5', 'UPDATE', 770008),
      rxdb_sql_regression.push_log('open-int-5', 'UPDATE', 770009)
    ),
    true
  );
  PERFORM rxdb_sql_regression.assert_true(mutation_result->>'changes' = '3', 'compacted push must log all three changes');
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM rxdb_sql_regression.push_open_ids WHERE id = 'open-int-5' AND value = 'compacted'),
    'compacted push must apply the single write'
  );

  -- ④ 非 main 日志不参与配对
  mutation_result := public.rxdb_mutations(
    '[]'::jsonb,
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(rxdb_sql_regression.push_log('open-1', 'UPDATE', 770010, 'feature-x')),
    true
  );
  PERFORM rxdb_sql_regression.assert_true(mutation_result->>'changes' = '1', 'non-main change must be logged without a write');

  -- ⑤ 键归一：日志缺 schema 视为 public，缺 branchId 视为 main
  mutation_result := public.rxdb_mutations(
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'schema', 'public',
      'table', 'todos',
      'data', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', todo_id, 'title', 'normalized'))
    )),
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'namespace', 'public',
      'entity', 'Todo',
      'table', 'todos',
      'entityId', todo_id,
      'type', 'INSERT',
      'patch', pg_catalog.jsonb_build_object('id', todo_id, 'title', 'normalized'),
      'clientId', 'sql-push-integrity-client',
      'localId', 770011
    )),
    true
  );
  PERFORM rxdb_sql_regression.assert_true(mutation_result->>'changes' = '1', 'normalized key must pair the log with its write');
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM public.todos WHERE id = todo_id::uuid),
    'normalized key push must apply the write'
  );

  -- ⑥ 触发器模式、无日志、不同键的两次写：只做重复写检查
  mutation_result := public.rxdb_mutations(
    '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"open-int-6","value":"new"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    false,
    '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"open-1","value":"changed"}]}]'::jsonb
  );
  PERFORM rxdb_sql_regression.assert_true(
    mutation_result->>'updated' = '1' AND pg_catalog.jsonb_array_length(mutation_result->'upserted') = 2
      AND mutation_result->'upserted' @> '[{"id":"open-int-6","value":"new"},{"id":"open-1","value":"changed"}]'::jsonb,
    'trigger-mode push without logs must return both final rows'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_branch_search_path()
RETURNS void
LANGUAGE plpgsql
SET search_path = rxdb_sql_function_shadow, public, pg_catalog
AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM rxdb_sql_regression.clear_branch('sql-security-shadow-branch');

  SELECT public.rxdb_enable_sync_for_branch(
    '[{
      "id":"sql-security-shadow-branch",
      "fromChangeId":1,
      "parentId":"main"
    }]'::jsonb
  ) INTO result;

  PERFORM rxdb_sql_regression.assert_true(
    result->>'synced' = '1',
    'branch RPC must ignore caller search_path shadows'
  );
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (
      SELECT 1
      FROM public.rxdb_branch
      WHERE id = 'sql-security-shadow-branch'
    ),
    'branch RPC must write the public system table'
  );
END;
$$;

-- 远端身份：同一个库上稳定；TRUNCATE rxdb_change 换新值。TRUNCATE 放在子事务里再回滚，
-- 不清掉共享测试库的日志，也不把表锁留到外层事务结束。
CREATE FUNCTION rxdb_sql_regression.test_backend_identity()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  original_id uuid;
  rotated_id uuid;
BEGIN
  original_id := public.rxdb_backend_id();
  PERFORM rxdb_sql_regression.assert_true(original_id IS NOT NULL, 'backend-identity: rxdb_backend_id() must return the singleton id');
  PERFORM rxdb_sql_regression.assert_true(
    public.rxdb_backend_id() = original_id,
    'backend-identity: rxdb_backend_id() must be stable on the same database'
  );

  BEGIN
    TRUNCATE public.rxdb_change;
    rotated_id := public.rxdb_backend_id();
    RAISE EXCEPTION USING ERRCODE = 'RXT01', MESSAGE = 'backend-identity: undo truncate';
  EXCEPTION
    WHEN SQLSTATE 'RXT01' THEN
      NULL;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    rotated_id IS NOT NULL AND rotated_id <> original_id,
    pg_catalog.format('backend-identity: TRUNCATE rxdb_change must rotate the id: %s -> %s', original_id, rotated_id)
  );
  PERFORM rxdb_sql_regression.assert_true(
    public.rxdb_backend_id() = original_id,
    'backend-identity: rolling back the TRUNCATE must restore the id'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_trigger_schema()
RETURNS void
LANGUAGE plpgsql
SET search_path = rxdb_sql_function_shadow, public, rxdb_sql_regression, pg_catalog
AS $$
DECLARE
  target_trigger_count integer;
  public_trigger_count integer;
  wrong_function_count integer;
BEGIN
  -- 整个回归在一个事务里（test_case = all）：前面 p_skip_sync = true 的用例已把事务级
  -- rxdb.sync_enabled 置为 'false'，末尾断言靠同步触发器记日志，必须先恢复
  PERFORM pg_catalog.set_config('rxdb.sync_enabled', 'true', true);

  PERFORM public.rxdb_enable_sync_for_table(
    'trigger_probe',
    'rxdb_sql_regression',
    'SqlSecurityTriggerProbe'
  );
  PERFORM public.rxdb_enable_sync_for_table(
    'trigger_probe',
    'rxdb_sql_regression',
    'SqlSecurityTriggerProbe'
  );

  SELECT pg_catalog.count(*)::integer
  INTO target_trigger_count
  FROM pg_catalog.pg_trigger AS t
  WHERE t.tgrelid = 'rxdb_sql_regression.trigger_probe'::pg_catalog.regclass
    AND NOT t.tgisinternal
    AND t.tgname IN ('rxdb_timestamp_trigger', 'rxdb_sync_trigger');

  SELECT pg_catalog.count(*)::integer
  INTO public_trigger_count
  FROM pg_catalog.pg_trigger AS t
  WHERE t.tgrelid = 'public.rxdb_sql_trigger_probe'::pg_catalog.regclass
    AND NOT t.tgisinternal
    AND t.tgname IN ('rxdb_timestamp_trigger', 'rxdb_sync_trigger');

  SELECT pg_catalog.count(*)::integer
  INTO wrong_function_count
  FROM pg_catalog.pg_trigger AS t
  WHERE t.tgrelid = 'rxdb_sql_regression.trigger_probe'::pg_catalog.regclass
    AND NOT t.tgisinternal
    AND (
      (t.tgname = 'rxdb_timestamp_trigger'
        AND t.tgfoid <> pg_catalog.to_regprocedure('public.rxdb_update_timestamp_trigger()'))
      OR
      (t.tgname = 'rxdb_sync_trigger'
        AND t.tgfoid <> pg_catalog.to_regprocedure('public.rxdb_log_change_trigger()'))
    );

  PERFORM rxdb_sql_regression.assert_true(
    target_trigger_count = 2,
    'schema-qualified target must own exactly one timestamp and one sync trigger'
  );
  PERFORM rxdb_sql_regression.assert_true(
    public_trigger_count = 0,
    'same-name public table must not receive target schema triggers'
  );
  PERFORM rxdb_sql_regression.assert_true(
    wrong_function_count = 0,
    'triggers must bind public.rxdb_*_trigger functions'
  );

  INSERT INTO rxdb_sql_regression.trigger_probe (id, value)
  VALUES ('trigger-1', 'inserted');

  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (
      SELECT 1
      FROM public.rxdb_change
      WHERE namespace = 'rxdb_sql_regression'
        AND entity = 'SqlSecurityTriggerProbe'
        AND "entityId" = 'trigger-1'
    ),
    'schema-qualified trigger must execute the public change logger'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_existence_probe()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  result text[];
  probe_rejected boolean;
  error_message text;
  is_definer boolean;
  volatility "char";
  settings text[];
BEGIN
  -- ① 调用方看不见的行仍判为存在；② 不存在的 id 不在返回里
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.probe_hidden_ids),
    'fixture: probe_hidden_ids must be invisible to the caller'
  );
  result := public.rxdb_existing_ids('probe_hidden_ids', 'rxdb_sql_regression', ARRAY['probe-hidden-1', 'probe-missing-1']);
  PERFORM rxdb_sql_regression.assert_true(
    result = ARRAY['probe-hidden-1'],
    pg_catalog.format('probe must report rows hidden by caller RLS and only those: %s', result)
  );

  -- ③ 空数组 → '{}'
  result := public.rxdb_existing_ids('probe_hidden_ids', 'rxdb_sql_regression', '{}'::text[]);
  PERFORM rxdb_sql_regression.assert_true(result = '{}'::text[], 'empty input must return an empty array');

  -- ④ uuid 主键按列类型比较，返回传入的原样元素
  result := public.rxdb_existing_ids('probe_uuid_ids', 'rxdb_sql_regression', ARRAY['2200AAAA-0000-4000-8000-00000000000A']);
  PERFORM rxdb_sql_regression.assert_true(
    result = ARRAY['2200AAAA-0000-4000-8000-00000000000A'],
    pg_catalog.format('uuid probe must compare by column type and echo the input element: %s', result)
  );

  -- ⑤ 非同步表 → 22023，消息含 schema.table
  probe_rejected := false;
  BEGIN
    PERFORM public.rxdb_existing_ids('probe_plain_ids', 'rxdb_sql_regression', ARRAY['probe-plain-1']);
  EXCEPTION
    WHEN invalid_parameter_value THEN
      GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
      probe_rejected := pg_catalog.strpos(error_message, 'rxdb_sql_regression.probe_plain_ids') > 0;
  END;
  PERFORM rxdb_sql_regression.assert_true(probe_rejected, 'probe must reject tables without the rxdb sync trigger');

  -- ⑥ 非法 uuid 文本 → 类型转换错误
  probe_rejected := false;
  BEGIN
    PERFORM public.rxdb_existing_ids('probe_uuid_ids', 'rxdb_sql_regression', ARRAY['not-a-uuid']);
  EXCEPTION
    WHEN invalid_text_representation THEN
      probe_rejected := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(probe_rejected, 'probe must fail on ids that do not cast to the id column type');

  -- ⑦ DEFINER、STABLE、固定 search_path 并关闭 row_security
  SELECT p.prosecdef, p.provolatile, p.proconfig
  INTO is_definer, volatility, settings
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = pg_catalog.to_regprocedure('public.rxdb_existing_ids(text,text,text[])');
  PERFORM rxdb_sql_regression.assert_true(is_definer, 'probe must be SECURITY DEFINER');
  PERFORM rxdb_sql_regression.assert_true(volatility = 's', 'probe must be STABLE');
  PERFORM rxdb_sql_regression.assert_true(
    'search_path=pg_catalog, pg_temp' = ANY(settings) AND 'row_security=off' = ANY(settings),
    pg_catalog.format('probe must pin search_path and disable row_security: %s', settings)
  );

  -- ⑧ 同名触发器但函数不是 public.rxdb_log_change_trigger → 22023
  probe_rejected := false;
  BEGIN
    PERFORM public.rxdb_existing_ids('probe_fake_trigger_ids', 'rxdb_sql_regression', ARRAY['probe-fake-1']);
  EXCEPTION
    WHEN invalid_parameter_value THEN
      probe_rejected := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(probe_rejected, 'probe must check the trigger function, not only the trigger name');

  -- FORCE ROW LEVEL SECURITY：要么给出正确结论，要么显式报错，不得给出错误结论（T004）
  BEGIN
    result := public.rxdb_existing_ids('probe_forced_ids', 'rxdb_sql_regression', ARRAY['probe-forced-1', 'probe-missing-2']);
    PERFORM rxdb_sql_regression.assert_true(
      result = ARRAY['probe-forced-1'],
      pg_catalog.format('probe on FORCE RLS table must not return a wrong answer: %s', result)
    );
    RAISE NOTICE 'existence-probe FORCE RLS: returned %', result;
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
      PERFORM rxdb_sql_regression.assert_true(
        error_message LIKE 'query would be affected by row-level security policy%',
        pg_catalog.format('probe on FORCE RLS table must fail explicitly: %s', error_message)
      );
      RAISE NOTICE 'existence-probe FORCE RLS: raised %', error_message;
  END;
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_update_partial_columns()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  partial_id constant text := '22000000-0000-4000-8000-000000000001';
  null_id constant text := '22000000-0000-4000-8000-000000000002';
  id_only_id constant text := '22000000-0000-4000-8000-000000000003';
  before_row public.todos;
  after_row public.todos;
  mutation_result jsonb;
BEGIN
  -- 预置行不记日志，且 updatedAt 早于本事务，保证随后的 UPDATE 一定产生差异
  PERFORM pg_catalog.set_config('rxdb.sync_enabled', 'false', true);
  INSERT INTO public.todos (id, title, completed, "createdBy", "updatedBy", "updatedAt")
  VALUES
    (partial_id::uuid, 'partial title', false, 'sql-owner-a', 'sql-owner-a', '2020-01-01T00:00:00Z'),
    (null_id::uuid, 'null title', false, 'sql-owner-a', 'sql-owner-a', '2020-01-01T00:00:00Z'),
    (id_only_id::uuid, 'id-only title', false, 'sql-owner-a', 'sql-owner-a', '2020-01-01T00:00:00Z');
  PERFORM pg_catalog.set_config('rxdb.sync_enabled', 'true', true);

  -- 只下发 completed + updatedBy：其余列原样保留
  SELECT * INTO before_row FROM public.todos WHERE id = partial_id::uuid;
  mutation_result := public.rxdb_mutations(
    p_updates => pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'table', 'todos',
      'data', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id', partial_id, 'completed', true, 'updatedBy', 'sql-owner-b'
      ))
    ))
  );
  SELECT * INTO after_row FROM public.todos WHERE id = partial_id::uuid;
  PERFORM rxdb_sql_regression.assert_true(mutation_result->>'updated' = '1', 'partial update must report updated = 1');
  PERFORM rxdb_sql_regression.assert_true(after_row.completed, 'partial update must change completed');
  PERFORM rxdb_sql_regression.assert_true(after_row."updatedBy" = 'sql-owner-b', 'partial update must change updatedBy');
  PERFORM rxdb_sql_regression.assert_true(
    after_row.title = before_row.title
      AND after_row."createdBy" = before_row."createdBy"
      AND after_row."createdAt" = before_row."createdAt",
    'partial update must keep columns absent from the payload'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change WHERE "entityId" = partial_id AND type = 'UPDATE') = 1
      AND rxdb_sql_regression.count_entity_changes(partial_id) = 1,
    'partial update must log exactly one UPDATE'
  );

  -- 可空列显式 null → 置 NULL
  mutation_result := public.rxdb_mutations(
    p_updates => pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'table', 'todos',
      'data', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', null_id, 'updatedBy', null))
    ))
  );
  SELECT * INTO after_row FROM public.todos WHERE id = null_id::uuid;
  PERFORM rxdb_sql_regression.assert_true(mutation_result->>'updated' = '1', 'explicit null update must report updated = 1');
  PERFORM rxdb_sql_regression.assert_true(after_row."updatedBy" IS NULL, 'explicit null must set the column to NULL');
  PERFORM rxdb_sql_regression.assert_true(after_row.title = 'null title', 'explicit null must keep other columns');

  -- 只有 id：成功、业务列不变、仍是一次真实 UPDATE（时间戳触发器照常，日志新增 1 条）
  SELECT * INTO before_row FROM public.todos WHERE id = id_only_id::uuid;
  mutation_result := public.rxdb_mutations(
    p_updates => pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'table', 'todos',
      'data', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', id_only_id))
    ))
  );
  SELECT * INTO after_row FROM public.todos WHERE id = id_only_id::uuid;
  PERFORM rxdb_sql_regression.assert_true(mutation_result->>'updated' = '1', 'id-only update must report updated = 1');
  PERFORM rxdb_sql_regression.assert_true(
    after_row.title = before_row.title
      AND after_row.completed = before_row.completed
      AND after_row."updatedBy" = before_row."updatedBy",
    'id-only update must keep business columns'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change WHERE "entityId" = id_only_id AND type = 'UPDATE') = 1,
    'id-only update must still be a real UPDATE that logs once'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_update_owner_rls()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  mutation_result jsonb;
  changes_before integer;
BEGIN
  PERFORM pg_catalog.set_config('rxdb.sync_enabled', 'true', true);
  PERFORM pg_catalog.set_config('rxdb_sql_regression.uid', 'sql-owner-a', true);
  changes_before := rxdb_sql_regression.count_entity_changes('update-owner-1');

  -- 载荷不含 owner：INSERT 策略的 WITH CHECK 不参与，UPDATE 只看现有行
  mutation_result := public.rxdb_mutations(
    p_updates => '[{"schema":"rxdb_sql_regression","table":"rls_update_owner","data":[{"id":"update-owner-1","value":"changed"}]}]'::jsonb
  );

  PERFORM rxdb_sql_regression.assert_true(mutation_result->>'updated' = '1', 'owner update must report updated = 1');
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (
      SELECT 1 FROM rxdb_sql_regression.rls_update_owner
      WHERE id = 'update-owner-1' AND value = 'changed' AND owner = 'sql-owner-a'
    ),
    'owner may update own row without sending owner'
  );
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.count_entity_changes('update-owner-1') = changes_before + 1,
    'owner update must log exactly one UPDATE'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_update_shared_edit()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  mutation_result jsonb;
  changes_before integer;
BEGIN
  PERFORM pg_catalog.set_config('rxdb.sync_enabled', 'true', true);
  PERFORM pg_catalog.set_config('rxdb_sql_regression.uid', 'sql-owner-a', true);
  changes_before := rxdb_sql_regression.count_entity_changes('update-shared-1');

  -- 目标行属于他人；INSERT 策略比 UPDATE 窄，不得参与 UPDATE 的判定
  mutation_result := public.rxdb_mutations(
    p_updates => '[{"schema":"rxdb_sql_regression","table":"rls_update_shared","data":[{"id":"update-shared-1","value":"changed"}]}]'::jsonb
  );

  PERFORM rxdb_sql_regression.assert_true(mutation_result->>'updated' = '1', 'shared edit must report updated = 1');
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (
      SELECT 1 FROM rxdb_sql_regression.rls_update_shared
      WHERE id = 'update-shared-1' AND value = 'changed' AND owner = 'sql-owner-b'
    ),
    'shared edit must update value and keep owner'
  );
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.count_entity_changes('update-shared-1') = changes_before + 1,
    'shared edit must log exactly one UPDATE'
  );
END;
$$;

-- 同时覆盖 US-218 AC#3：显式日志模式下被拒的修改同样整批回滚，不留日志
CREATE FUNCTION rxdb_sql_regression.test_update_denied()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  scenario record;
  denied boolean;
  error_detail text;
  error_message text;
  changes_before integer;
BEGIN
  PERFORM pg_catalog.set_config('rxdb.sync_enabled', 'true', true);
  PERFORM pg_catalog.set_config('rxdb_sql_regression.uid', 'sql-owner-a', true);

  -- ① UPDATE 的 USING 不放行；② SELECT 看不见目标行。两者普通 UPDATE 都是静默零行
  FOR scenario IN
    SELECT * FROM (VALUES
      ('rls_update_denied_using', 'denied-using-1'),
      ('rls_update_denied_select', 'denied-select-1')
    ) AS scenarios(table_name, entity_id)
  LOOP
    denied := false;
    changes_before := rxdb_sql_regression.count_entity_changes(scenario.entity_id);
    BEGIN
      PERFORM public.rxdb_mutations(
        p_updates => pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'schema', 'rxdb_sql_regression',
          'table', scenario.table_name,
          'data', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', scenario.entity_id, 'value', 'changed'))
        ))
      );
    EXCEPTION
      WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS error_detail = PG_EXCEPTION_DETAIL, error_message = MESSAGE_TEXT;
        denied := true;
    END;

    PERFORM rxdb_sql_regression.assert_true(
      denied,
      pg_catalog.format('%s: zero-row UPDATE on an existing row must raise 42501', scenario.table_name)
    );
    PERFORM rxdb_sql_regression.assert_true(
      error_message LIKE 'rxdb: UPDATE denied by row-level security:%',
      pg_catalog.format('%s: denied message must be self-describing: %s', scenario.table_name, error_message)
    );
    PERFORM rxdb_sql_regression.assert_rejection_detail(
      error_detail, 'denied', 'rxdb_sql_regression', scenario.table_name, scenario.entity_id
    );
    PERFORM rxdb_sql_regression.assert_true(
      rxdb_sql_regression.value_as_owner(scenario.table_name, scenario.entity_id) = 'original',
      pg_catalog.format('%s: denied row must stay unchanged', scenario.table_name)
    );
    PERFORM rxdb_sql_regression.assert_true(
      rxdb_sql_regression.count_entity_changes(scenario.entity_id) = changes_before,
      pg_catalog.format('%s: denied UPDATE must not log', scenario.table_name)
    );
  END LOOP;

  -- ③ WITH CHECK 拒绝新行：PostgreSQL 自己抛 42501（DETAIL 非 JSON，只断言 SQLSTATE）
  denied := false;
  BEGIN
    PERFORM public.rxdb_mutations(
      p_updates => '[{"schema":"rxdb_sql_regression","table":"rls_update_denied_check","data":[{"id":"denied-check-1","value":"changed"}]}]'::jsonb
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      denied := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(denied, 'UPDATE rejected by WITH CHECK must raise 42501');
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.value_as_owner('rls_update_denied_check', 'denied-check-1') = 'original',
    'UPDATE rejected by WITH CHECK must leave the row unchanged'
  );

  -- ④ 推送路径（p_skip_sync = true + 配对的 main 日志）：被拒同样 42501，日志随整批回滚
  denied := false;
  BEGIN
    PERFORM public.rxdb_mutations(
      p_updates => '[{"schema":"rxdb_sql_regression","table":"rls_update_denied_using","data":[{"id":"denied-using-1","value":"changed"}]}]'::jsonb,
      p_changes => '[{
        "namespace":"rxdb_sql_regression",
        "entity":"RlsUpdateDeniedUsing",
        "schema":"rxdb_sql_regression",
        "table":"rls_update_denied_using",
        "entityId":"denied-using-1",
        "type":"UPDATE",
        "patch":{"value":"changed"},
        "branchId":"main",
        "clientId":"sql-update-denied-client",
        "localId":780001
      }]'::jsonb,
      p_skip_sync => true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      denied := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(denied, 'pushed UPDATE denied by RLS must raise 42501');
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM public.rxdb_change WHERE "clientId" = 'sql-update-denied-client'),
    'pushed UPDATE denied by RLS must not log'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_update_gone()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  scenario record;
  gone boolean;
  error_detail text;
  error_message text;
  changes_before integer;
BEGIN
  PERFORM pg_catalog.set_config('rxdb.sync_enabled', 'true', true);

  -- ① 有 NOT NULL 列的表；② 除 id 外全部可空的表（upsert 时代会复活出残缺行）
  FOR scenario IN
    SELECT * FROM (VALUES
      ('public', 'todos', '22000000-0000-4000-8000-0000000000ff', '{"title":"gone"}'::jsonb),
      ('rxdb_sql_regression', 'update_nullable_ids', 'nullable-gone-1', '{"value":"gone"}'::jsonb)
    ) AS scenarios(schema_name, table_name, entity_id, patch)
  LOOP
    gone := false;
    changes_before := rxdb_sql_regression.count_entity_changes(scenario.entity_id);
    BEGIN
      PERFORM public.rxdb_mutations(
        p_updates => pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'schema', scenario.schema_name,
          'table', scenario.table_name,
          'data', pg_catalog.jsonb_build_array(scenario.patch || pg_catalog.jsonb_build_object('id', scenario.entity_id))
        ))
      );
    EXCEPTION
      WHEN SQLSTATE 'RX001' THEN
        GET STACKED DIAGNOSTICS error_detail = PG_EXCEPTION_DETAIL, error_message = MESSAGE_TEXT;
        gone := true;
    END;

    PERFORM rxdb_sql_regression.assert_true(
      gone,
      pg_catalog.format('%s.%s: UPDATE of a missing row must raise RX001', scenario.schema_name, scenario.table_name)
    );
    PERFORM rxdb_sql_regression.assert_true(
      error_message LIKE 'rxdb: UPDATE target row is gone:%',
      pg_catalog.format('%s: gone message must be self-describing: %s', scenario.table_name, error_message)
    );
    PERFORM rxdb_sql_regression.assert_rejection_detail(
      error_detail, 'gone', scenario.schema_name, scenario.table_name, scenario.entity_id
    );
    PERFORM rxdb_sql_regression.assert_true(
      rxdb_sql_regression.count_entity_changes(scenario.entity_id) = changes_before,
      pg_catalog.format('%s: gone UPDATE must not log', scenario.table_name)
    );
  END LOOP;

  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM public.todos WHERE id = '22000000-0000-4000-8000-0000000000ff'::uuid),
    'gone UPDATE must not insert into todos'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.update_nullable_ids WHERE id = 'nullable-gone-1'),
    'gone UPDATE must not resurrect a partial row'
  );

  -- 同批一条 gone、一条正常：整批回滚，正常那条也不生效
  gone := false;
  BEGIN
    PERFORM public.rxdb_mutations(
      p_updates => '[{"schema":"rxdb_sql_regression","table":"update_nullable_ids","data":[
        {"id":"nullable-kept","value":"changed"},
        {"id":"nullable-gone-2","value":"gone"}
      ]}]'::jsonb
    );
  EXCEPTION
    WHEN SQLSTATE 'RX001' THEN
      gone := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(gone, 'mixed batch must raise RX001');
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM rxdb_sql_regression.update_nullable_ids WHERE id = 'nullable-kept' AND value = 'original'),
    'mixed batch must roll back the valid update as well'
  );
END;
$$;

-- US-218 阶段 B：逐实体回执（contracts/rxdb-mutations-receipts.md）

-- T034 (AC#8、9)：p_receipts = true，1 条被拒删除 + 2 条可放行新建
CREATE FUNCTION rxdb_sql_regression.test_receipts_partial()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  mutation_result jsonb;
  entity_results jsonb;
  rejected_entry jsonb;
  applied_count integer;
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-receipts-partial-client']);
  PERFORM pg_catalog.set_config('rxdb_sql_regression.uid', 'sql-owner-a', true);

  mutation_result := public.rxdb_mutations(
    p_upserts => '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[
      {"id":"open-receipts-1","value":"new"},
      {"id":"open-receipts-2","value":"new"}
    ]}]'::jsonb,
    p_deletes => '[{"schema":"rxdb_sql_regression","table":"rls_owned_ids","ids":["owned-by-b"]}]'::jsonb,
    p_changes => '[
      {"namespace":"rxdb_sql_regression","entity":"PushOpen","schema":"rxdb_sql_regression","table":"push_open_ids",
       "entityId":"open-receipts-1","type":"INSERT","patch":{"id":"open-receipts-1","value":"new"},
       "branchId":"main","clientId":"sql-receipts-partial-client","localId":800001},
      {"namespace":"rxdb_sql_regression","entity":"PushOpen","schema":"rxdb_sql_regression","table":"push_open_ids",
       "entityId":"open-receipts-2","type":"INSERT","patch":{"id":"open-receipts-2","value":"new"},
       "branchId":"main","clientId":"sql-receipts-partial-client","localId":800002},
      {"namespace":"rxdb_sql_regression","entity":"RlsOwnedId","schema":"rxdb_sql_regression","table":"rls_owned_ids",
       "entityId":"owned-by-b","type":"DELETE",
       "branchId":"main","clientId":"sql-receipts-partial-client","localId":800003}
    ]'::jsonb,
    p_skip_sync => true,
    p_receipts => true
  );

  entity_results := mutation_result->'entity_results';

  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.jsonb_array_length(entity_results) = 3,
    pg_catalog.format('receipts-partial: entity_results must have 3 entries: %s', entity_results)
  );

  SELECT value INTO rejected_entry
  FROM pg_catalog.jsonb_array_elements(entity_results) AS results(value)
  WHERE value->>'entityId' = 'owned-by-b';

  PERFORM rxdb_sql_regression.assert_true(
    rejected_entry->>'status' = 'rejected'
      AND rejected_entry->>'code' = '42501'
      AND rejected_entry->>'reason' = 'denied',
    pg_catalog.format('receipts-partial: denied delete must be rejected/42501/denied: %s', rejected_entry)
  );
  PERFORM rxdb_sql_regression.assert_true(
    rejected_entry->'localIds' = '[800003]'::jsonb,
    pg_catalog.format('receipts-partial: rejected entity localIds must carry its source change: %s', rejected_entry)
  );

  SELECT pg_catalog.count(*)::integer INTO applied_count
  FROM pg_catalog.jsonb_array_elements(entity_results) AS results(value)
  WHERE value->>'status' = 'applied';
  PERFORM rxdb_sql_regression.assert_true(applied_count = 2, 'receipts-partial: two inserts must be applied');

  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM rxdb_sql_regression.push_open_ids WHERE id = 'open-receipts-1')
      AND EXISTS (SELECT 1 FROM rxdb_sql_regression.push_open_ids WHERE id = 'open-receipts-2'),
    'receipts-partial: applied inserts must land in the business table'
  );
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM rxdb_sql_regression.rls_owned_ids WHERE id = 'owned-by-b'),
    'receipts-partial: denied delete must leave the row in place'
  );
  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.jsonb_array_length(mutation_result->'change_id_mapping') = 2,
    pg_catalog.format('receipts-partial: only applied entities must map to remote ids: %s', mutation_result->'change_id_mapping')
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM public.rxdb_change WHERE "clientId" = 'sql-receipts-partial-client' AND "localId" = 800003),
    'receipts-partial: rejected entity must not log'
  );
END;
$$;

-- T034 (AC#10)：同一实体 3 条 main 源变更压成 1 次被拒写，回执 localIds 含 3 个
CREATE FUNCTION rxdb_sql_regression.test_receipts_fanout()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  mutation_result jsonb;
  rejected_entry jsonb;
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-receipts-fanout-client']);
  PERFORM pg_catalog.set_config('rxdb_sql_regression.uid', 'sql-owner-a', true);

  mutation_result := public.rxdb_mutations(
    p_deletes => '[{"schema":"rxdb_sql_regression","table":"rls_owned_ids","ids":["owned-by-b"]}]'::jsonb,
    p_changes => '[
      {"namespace":"rxdb_sql_regression","entity":"RlsOwnedId","schema":"rxdb_sql_regression","table":"rls_owned_ids",
       "entityId":"owned-by-b","type":"DELETE","branchId":"main","clientId":"sql-receipts-fanout-client","localId":810001},
      {"namespace":"rxdb_sql_regression","entity":"RlsOwnedId","schema":"rxdb_sql_regression","table":"rls_owned_ids",
       "entityId":"owned-by-b","type":"DELETE","branchId":"main","clientId":"sql-receipts-fanout-client","localId":810002},
      {"namespace":"rxdb_sql_regression","entity":"RlsOwnedId","schema":"rxdb_sql_regression","table":"rls_owned_ids",
       "entityId":"owned-by-b","type":"DELETE","branchId":"main","clientId":"sql-receipts-fanout-client","localId":810003}
    ]'::jsonb,
    p_skip_sync => true,
    p_receipts => true
  );

  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.jsonb_array_length(mutation_result->'entity_results') = 1,
    pg_catalog.format('receipts-fanout: one entity must produce one entity_results entry: %s', mutation_result->'entity_results')
  );

  rejected_entry := mutation_result->'entity_results'->0;

  PERFORM rxdb_sql_regression.assert_true(
    rejected_entry->>'status' = 'rejected' AND rejected_entry->>'code' = '42501',
    pg_catalog.format('receipts-fanout: denied delete must be rejected/42501: %s', rejected_entry)
  );
  PERFORM rxdb_sql_regression.assert_true(
    rejected_entry->'localIds' = '[810001, 810002, 810003]'::jsonb,
    pg_catalog.format('receipts-fanout: localIds must carry all 3 fanned-out source changes: %s', rejected_entry)
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM public.rxdb_change WHERE "clientId" = 'sql-receipts-fanout-client'),
    'receipts-fanout: none of the 3 fanned-out logs must be written when rejected'
  );
END;
$$;

-- T049 (AC#12)：父新建被拒 + 子新建引用父 → 父 denied、子 dependency，dependsOn 指向父；同批无关实体生效
CREATE FUNCTION rxdb_sql_regression.test_receipts_dependency()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  mutation_result jsonb;
  parent_entry jsonb;
  child_entry jsonb;
  unrelated_entry jsonb;
  multi_entry jsonb;
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-receipts-dependency-client', 'sql-receipts-dependency-multi-client']);

  mutation_result := public.rxdb_mutations(
    p_upserts => '[
      {"schema":"rxdb_sql_regression","table":"receipts_parent_ids","data":[{"id":"receipts-dep-parent-1","value":"x"}]},
      {"schema":"rxdb_sql_regression","table":"receipts_child_ids","data":[{"id":"receipts-dep-child-1","parentId":"receipts-dep-parent-1","value":"x"}]},
      {"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"open-receipts-dep-1","value":"new"}]}
    ]'::jsonb,
    p_changes => '[
      {"namespace":"rxdb_sql_regression","entity":"ReceiptsParent","schema":"rxdb_sql_regression","table":"receipts_parent_ids",
       "entityId":"receipts-dep-parent-1","type":"INSERT","patch":{"id":"receipts-dep-parent-1","value":"x"},
       "branchId":"main","clientId":"sql-receipts-dependency-client","localId":870001},
      {"namespace":"rxdb_sql_regression","entity":"ReceiptsChild","schema":"rxdb_sql_regression","table":"receipts_child_ids",
       "entityId":"receipts-dep-child-1","type":"INSERT","patch":{"id":"receipts-dep-child-1","parentId":"receipts-dep-parent-1","value":"x"},
       "branchId":"main","clientId":"sql-receipts-dependency-client","localId":870002},
      {"namespace":"rxdb_sql_regression","entity":"PushOpen","schema":"rxdb_sql_regression","table":"push_open_ids",
       "entityId":"open-receipts-dep-1","type":"INSERT","patch":{"id":"open-receipts-dep-1","value":"new"},
       "branchId":"main","clientId":"sql-receipts-dependency-client","localId":870003}
    ]'::jsonb,
    p_skip_sync => true,
    p_receipts => true
  );

  SELECT value INTO parent_entry FROM pg_catalog.jsonb_array_elements(mutation_result->'entity_results') AS r(value)
  WHERE value->>'entityId' = 'receipts-dep-parent-1';
  SELECT value INTO child_entry FROM pg_catalog.jsonb_array_elements(mutation_result->'entity_results') AS r(value)
  WHERE value->>'entityId' = 'receipts-dep-child-1';
  SELECT value INTO unrelated_entry FROM pg_catalog.jsonb_array_elements(mutation_result->'entity_results') AS r(value)
  WHERE value->>'entityId' = 'open-receipts-dep-1';

  PERFORM rxdb_sql_regression.assert_true(
    parent_entry->>'status' = 'rejected' AND parent_entry->>'code' = '42501' AND parent_entry->>'reason' = 'denied',
    pg_catalog.format('receipts-dependency: parent insert must be denied: %s', parent_entry)
  );
  PERFORM rxdb_sql_regression.assert_true(
    child_entry->>'status' = 'rejected' AND child_entry->>'code' = '23503' AND child_entry->>'reason' = 'dependency',
    pg_catalog.format('receipts-dependency: child insert must be rejected as dependency: %s', child_entry)
  );
  PERFORM rxdb_sql_regression.assert_true(
    child_entry->'dependsOn' = pg_catalog.jsonb_build_object(
      'schema', 'rxdb_sql_regression', 'table', 'receipts_parent_ids', 'entityId', 'receipts-dep-parent-1'
    ),
    pg_catalog.format('receipts-dependency: dependsOn must point at the parent: %s', child_entry)
  );
  PERFORM rxdb_sql_regression.assert_true(
    unrelated_entry->>'status' = 'applied',
    pg_catalog.format('receipts-dependency: the unrelated insert must still apply: %s', unrelated_entry)
  );
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM rxdb_sql_regression.push_open_ids WHERE id = 'open-receipts-dep-1'),
    'receipts-dependency: the unrelated insert must land'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.receipts_parent_ids WHERE id = 'receipts-dep-parent-1')
      AND NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.receipts_child_ids WHERE id = 'receipts-dep-child-1'),
    'receipts-dependency: denied parent and dependent child must not land'
  );

  -- 多列外键：解析不出单列父实体时回退 {constraint}
  mutation_result := public.rxdb_mutations(
    p_upserts => '[{"schema":"rxdb_sql_regression","table":"receipts_child_multi_ids","data":[
      {"id":"receipts-dep-child-multi-1","parentA":"missing-a","parentB":"missing-b","value":"x"}
    ]}]'::jsonb,
    p_changes => '[{"namespace":"rxdb_sql_regression","entity":"ReceiptsChildMulti","schema":"rxdb_sql_regression","table":"receipts_child_multi_ids",
      "entityId":"receipts-dep-child-multi-1","type":"INSERT",
      "patch":{"id":"receipts-dep-child-multi-1","parentA":"missing-a","parentB":"missing-b","value":"x"},
      "branchId":"main","clientId":"sql-receipts-dependency-multi-client","localId":870101}]'::jsonb,
    p_skip_sync => true,
    p_receipts => true
  );

  multi_entry := mutation_result->'entity_results'->0;
  PERFORM rxdb_sql_regression.assert_true(
    multi_entry->>'status' = 'rejected' AND multi_entry->>'code' = '23503',
    pg_catalog.format('receipts-dependency: multi-column FK violation must be rejected as dependency: %s', multi_entry)
  );
  PERFORM rxdb_sql_regression.assert_true(
    multi_entry->'dependsOn' = pg_catalog.jsonb_build_object('constraint', 'receipts_child_multi_parent_fk'),
    pg_catalog.format('receipts-dependency: unresolved multi-column FK must fall back to {constraint}: %s', multi_entry)
  );
END;
$$;

-- US-038：外键成环的一批推送（p_deferred_columns）。延迟列先写空、在 DELETE 之前补写；补写失败按实体原子回滚
CREATE FUNCTION rxdb_sql_regression.deferred_cycle_change(
  p_entity text, p_table text, p_entity_id text, p_type text, p_patch jsonb, p_local_id integer, p_inverse jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'namespace', 'rxdb_sql_regression', 'entity', p_entity, 'schema', 'rxdb_sql_regression', 'table', p_table,
    'entityId', p_entity_id, 'type', p_type, 'patch', p_patch, 'inversePatch', p_inverse,
    'branchId', 'main', 'clientId', 'sql-deferred-cycle-client', 'localId', p_local_id
  )
$$;

CREATE FUNCTION rxdb_sql_regression.deferred_cycle_status(p_result jsonb, p_entity_id text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT value FROM pg_catalog.jsonb_array_elements(p_result->'entity_results') AS r(value)
  WHERE value->>'entityId' = p_entity_id
$$;

CREATE FUNCTION rxdb_sql_regression.test_deferred_cycle()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_deferred constant jsonb := '[{"schema":"rxdb_sql_regression","table":"cycle_users","column":"cardId"}]';
  v_pair_upserts jsonb;
  v_pair_changes jsonb;
  v_result jsonb;
  v_user jsonb;
  v_card jsonb;
  v_previous_captured text := COALESCE(pg_catalog.current_setting('rxdb.captured_deletes', true), '');
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-deferred-cycle-client']);

  -- 实现前核实：子事务回滚时，rxdb.captured_deletes 的事务级设置一起撤销（补写失败整轮回滚靠它不留脏的删除捕获）
  PERFORM pg_catalog.set_config('rxdb.captured_deletes', '{}', true);
  BEGIN
    PERFORM pg_catalog.set_config('rxdb.captured_deletes', '{"leaked":true}', true);
    RAISE EXCEPTION USING ERRCODE = 'RX004', MESSAGE = 'probe';
  EXCEPTION
    WHEN SQLSTATE 'RX004' THEN NULL;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.current_setting('rxdb.captured_deletes', true) = '{}',
    'deferred-cycle: a rolled-back subtransaction must also roll back rxdb.captured_deletes'
  );
  PERFORM pg_catalog.set_config('rxdb.captured_deletes', v_previous_captured, true);

  -- AC#6：一次调用里互相引用的用户与证件，带延迟列：两行都写入，复合外键成立，日志的 afterData 是最终值
  v_pair_upserts := '[
    {"schema":"rxdb_sql_regression","table":"cycle_users","data":[{"id":"cu-1","name":"u1","cardId":"cc-1"}]},
    {"schema":"rxdb_sql_regression","table":"cycle_cards","data":[{"id":"cc-1","code":"c1","ownerId":"cu-1"}]}
  ]';
  v_pair_changes := pg_catalog.jsonb_build_array(
    rxdb_sql_regression.deferred_cycle_change('CycleUser', 'cycle_users', 'cu-1', 'INSERT', '{"id":"cu-1","name":"u1","cardId":"cc-1"}', 880001),
    rxdb_sql_regression.deferred_cycle_change('CycleCard', 'cycle_cards', 'cc-1', 'INSERT', '{"id":"cc-1","code":"c1","ownerId":"cu-1"}', 880002)
  );
  v_result := public.rxdb_mutations(
    p_upserts => v_pair_upserts, p_changes => v_pair_changes, p_skip_sync => true, p_receipts => true,
    p_deferred_columns => v_deferred
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.bool_and(value->>'status' = 'applied') FROM pg_catalog.jsonb_array_elements(v_result->'entity_results')),
    pg_catalog.format('deferred-cycle: both entities must apply: %s', v_result)
  );
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM rxdb_sql_regression.cycle_users WHERE id = 'cu-1' AND "cardId" = 'cc-1')
      AND EXISTS (SELECT 1 FROM rxdb_sql_regression.cycle_cards WHERE id = 'cc-1' AND "ownerId" = 'cu-1'),
    'deferred-cycle: the user must reference the card and the card its owner'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT "afterData"->>'cardId' FROM public.rxdb_change
     WHERE "clientId" = 'sql-deferred-cycle-client' AND "localId" = 880001) = 'cc-1',
    'deferred-cycle: the user log must carry the final cardId'
  );

  -- AC#10：同一次调用重复执行：幂等，没有重复写入与重复日志
  v_result := public.rxdb_mutations(
    p_upserts => v_pair_upserts, p_changes => v_pair_changes, p_skip_sync => true, p_receipts => true,
    p_deferred_columns => v_deferred
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.bool_and(value->>'status' = 'applied') FROM pg_catalog.jsonb_array_elements(v_result->'entity_results'))
      AND (SELECT pg_catalog.count(*) FROM public.rxdb_change WHERE "clientId" = 'sql-deferred-cycle-client') = 2
      AND (SELECT pg_catalog.count(*) FROM rxdb_sql_regression.cycle_users WHERE id = 'cu-1') = 1,
    pg_catalog.format('deferred-cycle: replaying the call must be idempotent: %s', v_result)
  );

  -- AC#7：不带延迟列（旧客户端）：行为与现在一致，以 dependency 被拒，什么都不写
  v_result := public.rxdb_mutations(
    p_upserts => '[
      {"schema":"rxdb_sql_regression","table":"cycle_users","data":[{"id":"cu-2","name":"u2","cardId":"cc-2"}]},
      {"schema":"rxdb_sql_regression","table":"cycle_cards","data":[{"id":"cc-2","code":"c2","ownerId":"cu-2"}]}
    ]',
    p_changes => pg_catalog.jsonb_build_array(
      rxdb_sql_regression.deferred_cycle_change('CycleUser', 'cycle_users', 'cu-2', 'INSERT', '{"id":"cu-2","name":"u2","cardId":"cc-2"}', 880011),
      rxdb_sql_regression.deferred_cycle_change('CycleCard', 'cycle_cards', 'cc-2', 'INSERT', '{"id":"cc-2","code":"c2","ownerId":"cu-2"}', 880012)
    ),
    p_skip_sync => true, p_receipts => true
  );
  v_user := rxdb_sql_regression.deferred_cycle_status(v_result, 'cu-2');
  PERFORM rxdb_sql_regression.assert_true(
    v_user->>'status' = 'rejected' AND v_user->>'reason' = 'dependency'
      AND NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.cycle_users WHERE id = 'cu-2')
      AND NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.cycle_cards WHERE id = 'cc-2'),
    pg_catalog.format('deferred-cycle: without deferred columns the cycle must be rejected as dependency: %s', v_result)
  );

  -- AC#8：证件被 RLS 拒绝：用户的补写以 dependency 失败，整轮回滚后两个实体都被拒，两行都不在，没有日志
  v_result := public.rxdb_mutations(
    p_upserts => '[
      {"schema":"rxdb_sql_regression","table":"cycle_users","data":[{"id":"cu-3","name":"u3","cardId":"cc-3"}]},
      {"schema":"rxdb_sql_regression","table":"cycle_cards","data":[{"id":"cc-3","code":"denied","ownerId":"cu-3"}]}
    ]',
    p_changes => pg_catalog.jsonb_build_array(
      rxdb_sql_regression.deferred_cycle_change('CycleUser', 'cycle_users', 'cu-3', 'INSERT', '{"id":"cu-3","name":"u3","cardId":"cc-3"}', 880021),
      rxdb_sql_regression.deferred_cycle_change('CycleCard', 'cycle_cards', 'cc-3', 'INSERT', '{"id":"cc-3","code":"denied","ownerId":"cu-3"}', 880022)
    ),
    p_skip_sync => true, p_receipts => true, p_deferred_columns => v_deferred
  );
  v_user := rxdb_sql_regression.deferred_cycle_status(v_result, 'cu-3');
  v_card := rxdb_sql_regression.deferred_cycle_status(v_result, 'cc-3');
  PERFORM rxdb_sql_regression.assert_true(
    v_card->>'status' = 'rejected' AND v_card->>'reason' = 'denied',
    pg_catalog.format('deferred-cycle: the denied card must be rejected as denied: %s', v_card)
  );
  PERFORM rxdb_sql_regression.assert_true(
    v_user->>'status' = 'rejected' AND v_user->>'reason' = 'dependency'
      AND v_user->'dependsOn' = '{"schema":"rxdb_sql_regression","table":"cycle_cards","entityId":"cc-3"}'::jsonb,
    pg_catalog.format('deferred-cycle: the user whose fill-in failed must be rejected as dependency on the card: %s', v_user)
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.cycle_users WHERE id = 'cu-3')
      AND NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.cycle_cards WHERE id = 'cc-3')
      AND NOT EXISTS (SELECT 1 FROM public.rxdb_change WHERE "clientId" = 'sql-deferred-cycle-client' AND "localId" IN (880021, 880022)),
    'deferred-cycle: a rejected cycle must leave neither rows nor logs'
  );

  -- 修改只改了延迟列：同批新建的证件 cc-4（持有人 cu-1），cu-1 改指向它
  v_result := public.rxdb_mutations(
    p_upserts => '[{"schema":"rxdb_sql_regression","table":"cycle_cards","data":[{"id":"cc-4","code":"c4","ownerId":"cu-1"}]}]',
    p_updates => '[{"schema":"rxdb_sql_regression","table":"cycle_users","data":[{"id":"cu-1","cardId":"cc-4"}]}]',
    p_changes => pg_catalog.jsonb_build_array(
      rxdb_sql_regression.deferred_cycle_change('CycleCard', 'cycle_cards', 'cc-4', 'INSERT', '{"id":"cc-4","code":"c4","ownerId":"cu-1"}', 880031),
      rxdb_sql_regression.deferred_cycle_change('CycleUser', 'cycle_users', 'cu-1', 'UPDATE', '{"cardId":"cc-4"}', 880032, '{"cardId":"cc-1"}')
    ),
    p_skip_sync => true, p_receipts => true, p_deferred_columns => v_deferred
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.bool_and(value->>'status' = 'applied') FROM pg_catalog.jsonb_array_elements(v_result->'entity_results'))
      AND EXISTS (SELECT 1 FROM rxdb_sql_regression.cycle_users WHERE id = 'cu-1' AND "cardId" = 'cc-4'),
    pg_catalog.format('deferred-cycle: an update of only the deferred column must be filled in: %s', v_result)
  );

  -- DELETE 在补写之后执行：同批新建一对、删掉 cc-4（cu-1 的 cardId 随之置空）
  v_result := public.rxdb_mutations(
    p_upserts => '[
      {"schema":"rxdb_sql_regression","table":"cycle_users","data":[{"id":"cu-6","name":"u6","cardId":"cc-6"}]},
      {"schema":"rxdb_sql_regression","table":"cycle_cards","data":[{"id":"cc-6","code":"c6","ownerId":"cu-6"}]}
    ]',
    p_deletes => '[{"schema":"rxdb_sql_regression","table":"cycle_cards","ids":["cc-4"]}]',
    p_changes => pg_catalog.jsonb_build_array(
      rxdb_sql_regression.deferred_cycle_change('CycleUser', 'cycle_users', 'cu-6', 'INSERT', '{"id":"cu-6","name":"u6","cardId":"cc-6"}', 880041),
      rxdb_sql_regression.deferred_cycle_change('CycleCard', 'cycle_cards', 'cc-6', 'INSERT', '{"id":"cc-6","code":"c6","ownerId":"cu-6"}', 880042),
      rxdb_sql_regression.deferred_cycle_change('CycleCard', 'cycle_cards', 'cc-4', 'DELETE', NULL, 880043, '{"code":"c4","ownerId":"cu-1"}')
    ),
    p_skip_sync => true, p_receipts => true, p_deferred_columns => v_deferred
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.bool_and(value->>'status' = 'applied') FROM pg_catalog.jsonb_array_elements(v_result->'entity_results'))
      AND EXISTS (SELECT 1 FROM rxdb_sql_regression.cycle_users WHERE id = 'cu-6' AND "cardId" = 'cc-6')
      AND NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.cycle_cards WHERE id = 'cc-4')
      AND EXISTS (SELECT 1 FROM rxdb_sql_regression.cycle_users WHERE id = 'cu-1' AND "cardId" IS NULL),
    pg_catalog.format('deferred-cycle: deletes run after the fill-in: %s', v_result)
  );
END;
$$;

-- US-038 AC#9：延迟列不合格以 RX003 拒绝，什么都不写
CREATE FUNCTION rxdb_sql_regression.test_deferred_columns_validation()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_case record;
  v_raised boolean;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('NOT NULL column', '[{"schema":"rxdb_sql_regression","table":"cycle_cards","column":"ownerId"}]'),
      ('not a foreign key', '[{"schema":"rxdb_sql_regression","table":"cycle_users","column":"nickname"}]'),
      ('the id', '[{"schema":"rxdb_sql_regression","table":"cycle_users","column":"id"}]'),
      ('missing column', '[{"schema":"rxdb_sql_regression","table":"cycle_users","column":"missing"}]'),
      ('missing table', '[{"schema":"rxdb_sql_regression","table":"missing_table","column":"cardId"}]'),
      ('MATCH FULL foreign key', '[{"schema":"rxdb_sql_regression","table":"cycle_full_refs","column":"cardRef"}]'),
      ('invalid identifier', '[{"schema":"rxdb_sql_regression","table":"cycle_users; drop","column":"cardId"}]'),
      ('not an array', '{"schema":"rxdb_sql_regression","table":"cycle_users","column":"cardId"}')
    ) AS cases(label, payload)
  LOOP
    v_raised := false;
    BEGIN
      PERFORM public.rxdb_mutations(
        p_upserts => '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"deferred-validation-probe","value":"x"}]}]',
        p_receipts => true,
        p_deferred_columns => v_case.payload::jsonb
      );
    EXCEPTION
      WHEN SQLSTATE 'RX003' THEN v_raised := true;
    END;
    PERFORM rxdb_sql_regression.assert_true(
      v_raised AND NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.push_open_ids WHERE id = 'deferred-validation-probe'),
      pg_catalog.format('deferred-columns-validation: %s must be rejected with RX003 before anything is written', v_case.label)
    );
  END LOOP;
END;
$$;

-- T035 (AC#13)：修改已不存在的行 → rejected/RX001/gone
CREATE FUNCTION rxdb_sql_regression.test_receipts_gone()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  mutation_result jsonb;
  entry jsonb;
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-receipts-gone-client']);

  mutation_result := public.rxdb_mutations(
    p_updates => '[{"schema":"rxdb_sql_regression","table":"update_nullable_ids","data":[{"id":"nullable-receipts-gone","value":"gone"}]}]'::jsonb,
    p_changes => '[{
      "namespace":"rxdb_sql_regression","entity":"UpdateNullable","schema":"rxdb_sql_regression","table":"update_nullable_ids",
      "entityId":"nullable-receipts-gone","type":"UPDATE","patch":{"value":"gone"},
      "branchId":"main","clientId":"sql-receipts-gone-client","localId":820001
    }]'::jsonb,
    p_skip_sync => true,
    p_receipts => true
  );

  entry := mutation_result->'entity_results'->0;

  PERFORM rxdb_sql_regression.assert_true(
    entry->>'status' = 'rejected' AND entry->>'code' = 'RX001' AND entry->>'reason' = 'gone',
    pg_catalog.format('receipts-gone: missing row must be rejected/RX001/gone: %s', entry)
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.update_nullable_ids WHERE id = 'nullable-receipts-gone'),
    'receipts-gone: must not resurrect a partial row'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM public.rxdb_change WHERE "clientId" = 'sql-receipts-gone-client'),
    'receipts-gone: rejected entity must not log'
  );
END;
$$;

-- T035 (AC#13)：唯一约束冲突触发不可归类的 23505，整批失败、SQLSTATE 原样传播
CREATE FUNCTION rxdb_sql_regression.test_receipts_unclassified()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  unclassified boolean := false;
  caught_sqlstate text;
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-receipts-unclassified-client']);

  BEGIN
    PERFORM public.rxdb_mutations(
      p_upserts => '[{"schema":"rxdb_sql_regression","table":"unique_conflict_ids","data":[
        {"id":"unique-conflict-new","unique_value":"taken"}
      ]}]'::jsonb,
      p_changes => '[{
        "namespace":"rxdb_sql_regression","entity":"UniqueConflict","schema":"rxdb_sql_regression","table":"unique_conflict_ids",
        "entityId":"unique-conflict-new","type":"INSERT","patch":{"id":"unique-conflict-new","unique_value":"taken"},
        "branchId":"main","clientId":"sql-receipts-unclassified-client","localId":830001
      }]'::jsonb,
      p_skip_sync => true,
      p_receipts => true
    );
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS caught_sqlstate = RETURNED_SQLSTATE;
      unclassified := true;
  END;

  PERFORM rxdb_sql_regression.assert_true(unclassified, 'receipts-unclassified: unique conflict must propagate uncaught');
  PERFORM rxdb_sql_regression.assert_true(
    caught_sqlstate = '23505',
    pg_catalog.format('receipts-unclassified: SQLSTATE must pass through as 23505: %s', caught_sqlstate)
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.unique_conflict_ids WHERE id = 'unique-conflict-new'),
    'receipts-unclassified: the conflicting insert must not land'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM public.rxdb_change WHERE "clientId" = 'sql-receipts-unclassified-client'),
    'receipts-unclassified: a whole-batch failure must not log'
  );
END;
$$;

-- T036 (AC#15)：同一批调两次幂等；首次被拒的实体在放开策略后重试变为 applied
CREATE FUNCTION rxdb_sql_regression.test_receipts_idempotent()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  first_result jsonb;
  second_result jsonb;
  first_remote_id bigint;
  second_remote_id bigint;
  effect_count_after integer;
  entry jsonb;
BEGIN
  -- Part 1：同一批调两次，第二次不执行业务写，远端 id 相同
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-receipts-idempotent-client']);
  DELETE FROM rxdb_sql_regression.idempotency_probe;
  UPDATE rxdb_sql_regression.idempotency_effects SET effect_count = 0 WHERE id = true;

  first_result := public.rxdb_mutations(
    p_upserts => '[{"schema":"rxdb_sql_regression","table":"idempotency_probe","data":[{"id":"receipts-idempotent-1","value":"v1"}]}]'::jsonb,
    p_changes => '[{
      "namespace":"rxdb_sql_regression","entity":"IdempotencyProbe","schema":"rxdb_sql_regression","table":"idempotency_probe",
      "entityId":"receipts-idempotent-1","type":"INSERT","patch":{"id":"receipts-idempotent-1","value":"v1"},
      "branchId":"main","clientId":"sql-receipts-idempotent-client","localId":840001
    }]'::jsonb,
    p_skip_sync => true,
    p_receipts => true
  );
  second_result := public.rxdb_mutations(
    p_upserts => '[{"schema":"rxdb_sql_regression","table":"idempotency_probe","data":[{"id":"receipts-idempotent-1","value":"v1"}]}]'::jsonb,
    p_changes => '[{
      "namespace":"rxdb_sql_regression","entity":"IdempotencyProbe","schema":"rxdb_sql_regression","table":"idempotency_probe",
      "entityId":"receipts-idempotent-1","type":"INSERT","patch":{"id":"receipts-idempotent-1","value":"v1"},
      "branchId":"main","clientId":"sql-receipts-idempotent-client","localId":840001
    }]'::jsonb,
    p_skip_sync => true,
    p_receipts => true
  );

  SELECT (value->>'remoteId')::bigint INTO first_remote_id
  FROM pg_catalog.jsonb_array_elements(first_result->'change_id_mapping') AS m(value)
  WHERE value->>'localId' = '840001';
  SELECT (value->>'remoteId')::bigint INTO second_remote_id
  FROM pg_catalog.jsonb_array_elements(second_result->'change_id_mapping') AS m(value)
  WHERE value->>'localId' = '840001';

  SELECT effect_count INTO effect_count_after FROM rxdb_sql_regression.idempotency_effects WHERE id = true;

  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM rxdb_sql_regression.idempotency_probe) = 1,
    'receipts-idempotent: retry must not duplicate the business row'
  );
  PERFORM rxdb_sql_regression.assert_true(
    effect_count_after = 1,
    pg_catalog.format('receipts-idempotent: retry must not re-fire side effects: %s', effect_count_after)
  );
  PERFORM rxdb_sql_regression.assert_true(
    first_remote_id IS NOT NULL AND first_remote_id = second_remote_id,
    pg_catalog.format('receipts-idempotent: retry must return the same remote id: %s vs %s', first_remote_id, second_remote_id)
  );
  PERFORM rxdb_sql_regression.assert_true(
    (second_result->'entity_results'->0)->>'status' = 'applied',
    pg_catalog.format('receipts-idempotent: skipped retry must still report applied: %s', second_result->'entity_results'->0)
  );

  -- Part 2：首次被拒的实体在放开策略后重试变为 applied
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-receipts-idempotent-retry-client']);
  PERFORM pg_catalog.set_config('rxdb_sql_regression.uid', 'sql-owner-a', true);

  first_result := public.rxdb_mutations(
    p_deletes => '[{"schema":"rxdb_sql_regression","table":"rls_owned_ids","ids":["owned-by-receipts"]}]'::jsonb,
    p_changes => '[{
      "namespace":"rxdb_sql_regression","entity":"RlsOwnedId","schema":"rxdb_sql_regression","table":"rls_owned_ids",
      "entityId":"owned-by-receipts","type":"DELETE",
      "branchId":"main","clientId":"sql-receipts-idempotent-retry-client","localId":840002
    }]'::jsonb,
    p_skip_sync => true,
    p_receipts => true
  );
  entry := first_result->'entity_results'->0;
  PERFORM rxdb_sql_regression.assert_true(
    entry->>'status' = 'rejected' AND entry->>'code' = '42501',
    pg_catalog.format('receipts-idempotent: first attempt must be denied: %s', entry)
  );

  -- 放开策略：换成该行的属主身份重试（同一 clientId/localId）
  PERFORM pg_catalog.set_config('rxdb_sql_regression.uid', 'sql-owner-receipts-denied', true);
  second_result := public.rxdb_mutations(
    p_deletes => '[{"schema":"rxdb_sql_regression","table":"rls_owned_ids","ids":["owned-by-receipts"]}]'::jsonb,
    p_changes => '[{
      "namespace":"rxdb_sql_regression","entity":"RlsOwnedId","schema":"rxdb_sql_regression","table":"rls_owned_ids",
      "entityId":"owned-by-receipts","type":"DELETE",
      "branchId":"main","clientId":"sql-receipts-idempotent-retry-client","localId":840002
    }]'::jsonb,
    p_skip_sync => true,
    p_receipts => true
  );
  entry := second_result->'entity_results'->0;
  PERFORM rxdb_sql_regression.assert_true(
    entry->>'status' = 'applied',
    pg_catalog.format('receipts-idempotent: retry after policy change must apply: %s', entry)
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.rls_owned_ids WHERE id = 'owned-by-receipts'),
    'receipts-idempotent: retried delete must actually remove the row'
  );
END;
$$;

-- T036 (FR-022)：不传 p_receipts 时任一条被拒整批 42501，无论成败都不带 entity_results
CREATE FUNCTION rxdb_sql_regression.test_receipts_legacy()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  denied boolean := false;
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-receipts-legacy-client']);
  PERFORM pg_catalog.set_config('rxdb_sql_regression.uid', 'sql-owner-a', true);

  BEGIN
    PERFORM public.rxdb_mutations(
      p_upserts => '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"open-receipts-legacy-1","value":"new"}]}]'::jsonb,
      p_deletes => '[{"schema":"rxdb_sql_regression","table":"rls_owned_ids","ids":["owned-by-b"]}]'::jsonb,
      p_changes => '[
        {"namespace":"rxdb_sql_regression","entity":"PushOpen","schema":"rxdb_sql_regression","table":"push_open_ids",
         "entityId":"open-receipts-legacy-1","type":"INSERT","patch":{"id":"open-receipts-legacy-1","value":"new"},
         "branchId":"main","clientId":"sql-receipts-legacy-client","localId":850001},
        {"namespace":"rxdb_sql_regression","entity":"RlsOwnedId","schema":"rxdb_sql_regression","table":"rls_owned_ids",
         "entityId":"owned-by-b","type":"DELETE",
         "branchId":"main","clientId":"sql-receipts-legacy-client","localId":850002}
      ]'::jsonb,
      p_skip_sync => true
      -- p_receipts 不传，默认 false
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      denied := true;
  END;

  PERFORM rxdb_sql_regression.assert_true(denied, 'receipts-legacy: a rejection without p_receipts must raise 42501 for the whole batch');
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.push_open_ids WHERE id = 'open-receipts-legacy-1'),
    'receipts-legacy: the whole batch must roll back, including the otherwise-applicable insert'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM public.rxdb_change WHERE "clientId" = 'sql-receipts-legacy-client'),
    'receipts-legacy: a whole-batch failure must not log anything'
  );

  -- 全部成功时也不带 entity_results
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-receipts-legacy-ok-client']);
  PERFORM rxdb_sql_regression.assert_true(
    NOT (public.rxdb_mutations(
      p_upserts => '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"open-receipts-legacy-ok-1","value":"new"}]}]'::jsonb,
      p_changes => '[{"namespace":"rxdb_sql_regression","entity":"PushOpen","schema":"rxdb_sql_regression","table":"push_open_ids",
        "entityId":"open-receipts-legacy-ok-1","type":"INSERT","patch":{"id":"open-receipts-legacy-ok-1","value":"new"},
        "branchId":"main","clientId":"sql-receipts-legacy-ok-client","localId":850101}]'::jsonb,
      p_skip_sync => true
    ) ? 'entity_results'),
    'receipts-legacy: a successful legacy call must not include entity_results'
  );
END;
$$;

-- 70 个组各含 1 条被拒：验证不触发子事务层数问题
CREATE FUNCTION rxdb_sql_regression.test_receipts_many_groups()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  deletes jsonb := '[]'::jsonb;
  changes jsonb := '[]'::jsonb;
  mutation_result jsonb;
  g integer;
  rejected_count integer;
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-receipts-many-groups-client']);

  FOR g IN 1..70 LOOP
    deletes := deletes || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'schema', 'rxdb_sql_regression', 'table', 'rls_denied_ids',
      'ids', pg_catalog.jsonb_build_array('receipts-many-' || g)
    ));
    changes := changes || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'namespace', 'rxdb_sql_regression', 'entity', 'RlsDenied',
      'schema', 'rxdb_sql_regression', 'table', 'rls_denied_ids',
      'entityId', 'receipts-many-' || g, 'type', 'DELETE',
      'branchId', 'main', 'clientId', 'sql-receipts-many-groups-client', 'localId', 860000 + g
    ));
  END LOOP;

  mutation_result := public.rxdb_mutations(
    p_deletes => deletes,
    p_changes => changes,
    p_skip_sync => true,
    p_receipts => true
  );

  SELECT pg_catalog.count(*)::integer INTO rejected_count
  FROM pg_catalog.jsonb_array_elements(mutation_result->'entity_results') AS results(value)
  WHERE value->>'status' = 'rejected';

  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.jsonb_array_length(mutation_result->'entity_results') = 70,
    pg_catalog.format('receipts-many-groups: must report 70 entities: %s', pg_catalog.jsonb_array_length(mutation_result->'entity_results'))
  );
  PERFORM rxdb_sql_regression.assert_true(
    rejected_count = 70,
    pg_catalog.format('receipts-many-groups: 70 denied deletes across 70 groups must all be rejected: %s', rejected_count)
  );
END;
$$;

-- US-224：显式推送与触发器模式都必须记录真实的级联删除。
CREATE FUNCTION rxdb_sql_regression.test_update_visibility_transition()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  result jsonb;
  denied boolean := false;
BEGIN
  PERFORM rxdb_sql_regression.assert_true(
    public.rxdb_batch_update('update_visibility_rows', 'rxdb_sql_regression',
      '[{"id":"visibility-count","visible":true}]') = 1,
    'the count-only UPDATE API must retain its integer result'
  );
  result := public.rxdb_mutations(
    p_updates => '[{"schema":"rxdb_sql_regression","table":"update_visibility_rows",
      "data":[{"id":"visibility-push","visible":true}]}]',
    p_changes => '[{"namespace":"rxdb_sql_regression","entity":"UpdateVisibility",
      "schema":"rxdb_sql_regression","table":"update_visibility_rows","entityId":"visibility-push",
      "type":"UPDATE","patch":{"visible":true},"branchId":"main","clientId":"sql-visibility","localId":1}]',
    p_skip_sync => true
  );
  PERFORM rxdb_sql_regression.assert_true(
    result->>'updated' = '1' AND result->'upserted' = '[]'::jsonb,
    'push UPDATE must retain its count-only result and existing RLS behavior'
  );
  PERFORM rxdb_sql_regression.assert_true(
    public.rxdb_batch_update('update_column_privileges', 'rxdb_sql_regression',
      '[{"id":"limited-columns","value":"changed"}]') = 1,
    'the count-only UPDATE API must not require SELECT on unrelated columns'
  );
  BEGIN
    PERFORM public.rxdb_mutations(p_updates => '[{"schema":"rxdb_sql_regression","table":"update_column_privileges",
      "data":[{"id":"limited-columns","value":"forbidden"}]}]');
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    denied AND (SELECT value FROM rxdb_sql_regression.update_column_privileges WHERE id = 'limited-columns') = 'changed',
    'direct final-row returning must enforce column SELECT permissions and roll back'
  );
  denied := false;
  BEGIN
    PERFORM public.rxdb_mutations(p_updates => '[{"schema":"rxdb_sql_regression","table":"update_visibility_rows",
      "data":[{"id":"visibility-direct","visible":false}]}]');
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    denied AND EXISTS (SELECT 1 FROM rxdb_sql_regression.update_visibility_rows WHERE id = 'visibility-direct' AND visible),
    'direct UPDATE RETURNING must enforce SELECT on the returned row and roll back on failure'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_cascade_delete_logging()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  mutation_result jsonb;
BEGIN
  -- 整个回归在一个事务里（test_case = all）：前面 p_skip_sync = true 的用例已把事务级
  -- rxdb.sync_enabled 置为 'false'，① 靠同步触发器记日志，必须先恢复
  PERFORM pg_catalog.set_config('rxdb.sync_enabled', 'true', true);

  -- ① 对照：触发器模式下删除父行，级联删除的子行各自产生 DELETE 日志。
  -- 触发器日志不带 clientId，clear_change_log 按 clientId 清不掉它们，断言因此按 entityId 收窄
  INSERT INTO rxdb_sql_regression.cascade_parent_ids (id, value)
  VALUES ('cascade-parent-t', 'parent');
  INSERT INTO rxdb_sql_regression.cascade_child_ids (id, "parentId", value)
  VALUES ('cascade-child-t-1', 'cascade-parent-t', 'child-1'),
         ('cascade-child-t-2', 'cascade-parent-t', 'child-2');

  mutation_result := public.rxdb_mutations(
    '[]'::jsonb,
    '[{"schema":"rxdb_sql_regression","table":"cascade_parent_ids","ids":["cascade-parent-t"]}]'::jsonb,
    '[]'::jsonb,
    false
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.cascade_parent_ids WHERE id = 'cascade-parent-t')
      AND NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.cascade_child_ids WHERE "parentId" = 'cascade-parent-t'),
    'trigger mode: cascade delete must remove parent and children'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change
      WHERE namespace = 'rxdb_sql_regression' AND entity = 'CascadeParent' AND type = 'DELETE'
        AND "entityId" = 'cascade-parent-t') = 1,
    'trigger mode: parent delete must log one DELETE'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change
      WHERE namespace = 'rxdb_sql_regression' AND entity = 'CascadeChild' AND type = 'DELETE'
        AND "entityId" IN ('cascade-child-t-1', 'cascade-child-t-2')) = 2,
    'trigger mode: cascaded child deletes must log one DELETE each'
  );

  -- ② 复现：p_skip_sync = true（推送路径）只下发父行删除与父行日志
  INSERT INTO rxdb_sql_regression.cascade_parent_ids (id, value)
  VALUES ('cascade-parent-e', 'parent');
  INSERT INTO rxdb_sql_regression.cascade_child_ids (id, "parentId", value)
  VALUES ('cascade-child-e-1', 'cascade-parent-e', 'child-1'),
         ('cascade-child-e-2', 'cascade-parent-e', 'child-2');
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-cascade-client']);

  mutation_result := public.rxdb_mutations(
    '[]'::jsonb,
    '[{"schema":"rxdb_sql_regression","table":"cascade_parent_ids","ids":["cascade-parent-e"]}]'::jsonb,
    '[{
      "namespace":"rxdb_sql_regression",
      "entity":"CascadeParent",
      "schema":"rxdb_sql_regression",
      "table":"cascade_parent_ids",
      "entityId":"cascade-parent-e",
      "type":"DELETE",
      "inversePatch":{"id":"cascade-parent-e","value":"parent"},
      "branchId":"main",
      "clientId":"sql-cascade-client",
      "localId":890001
    }]'::jsonb,
    true
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.cascade_parent_ids WHERE id = 'cascade-parent-e')
      AND NOT EXISTS (SELECT 1 FROM rxdb_sql_regression.cascade_child_ids WHERE "parentId" = 'cascade-parent-e'),
    'explicit mode: cascade delete must still remove parent and children'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change WHERE "clientId" = 'sql-cascade-client') = 1,
    'explicit mode: only the pushed parent DELETE may be logged'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change
      WHERE namespace = 'rxdb_sql_regression' AND entity = 'CascadeChild' AND type = 'DELETE'
        AND "entityId" IN ('cascade-child-e-1', 'cascade-child-e-2')
        AND "clientId" IS NULL AND "localId" IS NULL
        AND "snapshotComplete" AND "beforeData"->>'id' = "entityId"
        AND "afterData" IS NULL) = 2,
    'explicit mode: every cascaded child needs one complete server-origin DELETE'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.push_cascade_deletes(p_deletes jsonb, p_receipts boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.rxdb_mutations(
    p_deletes => p_deletes,
    p_changes => (
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'namespace', 'rxdb_sql_regression',
        'entity', CASE g.value->>'table'
          WHEN 'cascade_parent_ids' THEN 'CascadeParent'
          WHEN 'cascade_child_ids' THEN 'CascadeChild'
          WHEN 'cascade_nodes' THEN 'CascadeNode'
          WHEN 'cascade_hidden_children' THEN 'CascadeHiddenChild'
          WHEN 'cascade_uuid_nodes' THEN 'CascadeUuidNode'
        END,
        'schema', 'rxdb_sql_regression', 'table', g.value->>'table',
        'entityId', ids.value, 'type', 'DELETE', 'branchId', 'main',
        'clientId', 'sql-cascade-' || ids.value, 'localId', 1
      ) ORDER BY g.ord, ids.ord)
      FROM pg_catalog.jsonb_array_elements(p_deletes) WITH ORDINALITY AS g(value, ord)
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(g.value->'ids') WITH ORDINALITY AS ids(value, ord)
    ),
    p_skip_sync => true,
    p_receipts => p_receipts
  );
$$;

CREATE FUNCTION rxdb_sql_regression.test_cascade_explicit_deletes()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  parent_first boolean;
  suffix text;
  deletes jsonb;
  previous_sync text := COALESCE(pg_catalog.current_setting('rxdb.sync_enabled', true), '');
  previous_deletes text := COALESCE(pg_catalog.current_setting('rxdb.captured_deletes', true), '');
BEGIN
  FOREACH parent_first IN ARRAY ARRAY[true, false] LOOP
    suffix := CASE WHEN parent_first THEN 'parent-first' ELSE 'child-first' END;
    INSERT INTO rxdb_sql_regression.cascade_parent_ids (id, value) VALUES (suffix, 'parent');
    INSERT INTO rxdb_sql_regression.cascade_child_ids (id, "parentId", value)
    VALUES (suffix || '-explicit', suffix, 'explicit'), (suffix || '-implicit', suffix, 'implicit');
    deletes := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('schema', 'rxdb_sql_regression', 'table', 'cascade_parent_ids', 'ids', ARRAY[suffix]),
      pg_catalog.jsonb_build_object('schema', 'rxdb_sql_regression', 'table', 'cascade_child_ids', 'ids', ARRAY[suffix || '-explicit'])
    );
    IF NOT parent_first THEN
      deletes := pg_catalog.jsonb_build_array(deletes->1, deletes->0);
    END IF;
    PERFORM rxdb_sql_regression.push_cascade_deletes(deletes);
    PERFORM rxdb_sql_regression.push_cascade_deletes(deletes);
    PERFORM rxdb_sql_regression.assert_true(
      (SELECT pg_catalog.count(*) FROM public.rxdb_change
       WHERE namespace = 'rxdb_sql_regression' AND type = 'DELETE'
         AND "entityId" IN (suffix, suffix || '-explicit', suffix || '-implicit')) = 3,
      suffix || ': each real deletion is logged once, including after retry'
    );
    PERFORM rxdb_sql_regression.assert_true(
      (SELECT pg_catalog.count(*) FROM public.rxdb_change
       WHERE namespace = 'rxdb_sql_regression' AND type = 'DELETE' AND "entityId" = suffix || '-explicit'
         AND "clientId" = 'sql-cascade-' || suffix || '-explicit' AND "localId" = 1) = 1,
      suffix || ': explicit child must retain its source mapping'
    );
  END LOOP;
  PERFORM rxdb_sql_regression.assert_true(
    COALESCE(pg_catalog.current_setting('rxdb.sync_enabled', true), '') = previous_sync
      AND COALESCE(pg_catalog.current_setting('rxdb.captured_deletes', true), '') = previous_deletes,
    'mutation context must be restored before the next call in the same transaction'
  );
  INSERT INTO rxdb_sql_regression.cascade_parent_ids (id, value) VALUES ('after-cascade-push', 'native');
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change
      WHERE entity = 'CascadeParent' AND "entityId" = 'after-cascade-push' AND type = 'INSERT') = 1,
    'a native write after a push must still fire its sync trigger'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_cascade_uuid_keys()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  deletes jsonb := '[{"schema":"rxdb_sql_regression","table":"cascade_uuid_nodes",
    "ids":["ABCDEF00-0000-4000-8000-000000000001","ABCDEF00-0000-4000-8000-000000000002"]}]';
  result jsonb;
BEGIN
  INSERT INTO rxdb_sql_regression.cascade_uuid_nodes (id, "parentId", value)
  VALUES ('abcdef00-0000-4000-8000-000000000001', NULL, 'parent'),
         ('abcdef00-0000-4000-8000-000000000002', 'abcdef00-0000-4000-8000-000000000001', 'child');
  PERFORM rxdb_sql_regression.push_cascade_deletes(deletes, true);
  PERFORM rxdb_sql_regression.push_cascade_deletes(deletes, true);
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change
      WHERE entity = 'CascadeUuidNode' AND type = 'DELETE') = 2
      AND (SELECT pg_catalog.count(*) FROM public.rxdb_change
        WHERE entity = 'CascadeUuidNode' AND type = 'DELETE' AND "clientId" IS NULL) = 0,
    'UUID input spelling must not produce duplicate server-origin deletes, including after retry'
  );

  INSERT INTO rxdb_sql_regression.cascade_uuid_nodes (id, "parentId", value)
  VALUES ('fedcba00-0000-4000-8000-000000000001', NULL, 'parent'),
         ('fedcba00-0000-4000-8000-000000000002', 'fedcba00-0000-4000-8000-000000000001', 'child');
  deletes := '[
    {"schema":"rxdb_sql_regression","table":"cascade_uuid_nodes","ids":["FEDCBA00-0000-4000-8000-000000000002"]},
    {"schema":"rxdb_sql_regression","table":"cascade_uuid_nodes","ids":["FEDCBA00-0000-4000-8000-000000000001"]}]';
  result := rxdb_sql_regression.push_cascade_deletes(deletes, true);
  PERFORM rxdb_sql_regression.assert_true(
    result->'entity_results'->0->>'entityId' = 'FEDCBA00-0000-4000-8000-000000000002'
      AND result->'entity_results'->0->>'status' = 'applied'
      AND result->'entity_results'->1->>'status' = 'applied'
      AND NOT (result->'entity_results'->0 ? 'reason'),
    'an uppercase UUID child denied before its allowed parent cascade must retain the source receipt key'
  );
  PERFORM rxdb_sql_regression.push_cascade_deletes(deletes, true);
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change
      WHERE entity = 'CascadeUuidNode' AND type = 'DELETE'
        AND "entityId" IN ('FEDCBA00-0000-4000-8000-000000000001', 'FEDCBA00-0000-4000-8000-000000000002')
        AND "clientId" IS NOT NULL AND "snapshotComplete"
        AND "beforeData"->>'id' = pg_catalog.lower("entityId")) = 2,
    'uppercase UUID cascade replay must preserve both source mappings and complete snapshots without duplicate logs'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_cascade_source_order()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  row_id text;
BEGIN
  INSERT INTO rxdb_sql_regression.cascade_parent_ids (id, value) VALUES ('mixed-parent', 'parent');
  INSERT INTO rxdb_sql_regression.cascade_child_ids (id, "parentId", value)
  VALUES ('mixed-updated-child', 'mixed-parent', 'original');
  PERFORM public.rxdb_mutations(
    p_upserts => '[{"schema":"rxdb_sql_regression","table":"cascade_child_ids",
      "data":[{"id":"mixed-created-child","parentId":"mixed-parent","value":"created"}]}]',
    p_updates => '[{"schema":"rxdb_sql_regression","table":"cascade_child_ids",
      "data":[{"id":"mixed-updated-child","value":"updated"}]}]',
    p_deletes => '[{"schema":"rxdb_sql_regression","table":"cascade_parent_ids","ids":["mixed-parent"]}]',
    p_changes => '[
      {"namespace":"rxdb_sql_regression","entity":"CascadeChild","schema":"rxdb_sql_regression",
       "table":"cascade_child_ids","entityId":"mixed-created-child","type":"INSERT",
       "patch":{"id":"mixed-created-child","parentId":"mixed-parent","value":"created"},
       "branchId":"main","clientId":"sql-cascade-mixed","localId":1},
      {"namespace":"rxdb_sql_regression","entity":"CascadeChild","schema":"rxdb_sql_regression",
       "table":"cascade_child_ids","entityId":"mixed-updated-child","type":"UPDATE","patch":{"value":"updated"},
       "branchId":"main","clientId":"sql-cascade-mixed","localId":2},
      {"namespace":"rxdb_sql_regression","entity":"CascadeParent","schema":"rxdb_sql_regression",
       "table":"cascade_parent_ids","entityId":"mixed-parent","type":"DELETE",
       "branchId":"main","clientId":"sql-cascade-mixed","localId":3}]',
    p_skip_sync => true,
    p_receipts => true
  );
  FOREACH row_id IN ARRAY ARRAY['mixed-created-child', 'mixed-updated-child'] LOOP
    PERFORM rxdb_sql_regression.assert_true(
      (SELECT pg_catalog.min(id) FILTER (WHERE type = 'DELETE') > pg_catalog.max(id) FILTER (WHERE type != 'DELETE')
       FROM public.rxdb_change WHERE namespace = 'rxdb_sql_regression' AND entity = 'CascadeChild' AND "entityId" = row_id),
      row_id || ': the final implicit DELETE must follow every source INSERT/UPDATE'
    );
  END LOOP;
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_cascade_rejected_child()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  INSERT INTO rxdb_sql_regression.cascade_parent_ids (id, value) VALUES ('hidden-parent', 'parent');
  INSERT INTO rxdb_sql_regression.cascade_hidden_children (id, "parentId", value)
  VALUES ('hidden-child', 'hidden-parent', 'hidden-value');
  result := rxdb_sql_regression.push_cascade_deletes(
    '[{"schema":"rxdb_sql_regression","table":"cascade_hidden_children","ids":["hidden-child"]},
      {"schema":"rxdb_sql_regression","table":"cascade_parent_ids","ids":["hidden-parent"]}]', true
  );
  PERFORM rxdb_sql_regression.assert_true(
    result->'entity_results'->0->>'status' = 'applied' AND result->'entity_results'->1->>'status' = 'applied'
      AND NOT (result->'entity_results'->0 ? 'reason'),
    'a hidden child actually deleted by its allowed parent must be applied in the final receipt'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change
      WHERE namespace = 'rxdb_sql_regression' AND entity = 'CascadeHiddenChild'
        AND "entityId" = 'hidden-child' AND type = 'DELETE' AND "clientId" = 'sql-cascade-hidden-child'
        AND "snapshotComplete" AND "beforeData"->>'value' = 'hidden-value') = 1,
    'a hidden child really deleted by cascade needs one mapped complete DELETE'
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.test_cascade_replay_and_rollback()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  result jsonb;
  rejected boolean := false;
BEGIN
  INSERT INTO rxdb_sql_regression.cascade_nodes (id, "parentId", value)
  VALUES ('cascade-replay-parent', NULL, 'parent'),
         ('cascade-denied-replay-child', 'cascade-replay-parent', 'child'),
         ('cascade-replay-grandchild', 'cascade-denied-replay-child', 'grandchild'),
         ('cascade-denied-stay', NULL, 'denied');
  result := rxdb_sql_regression.push_cascade_deletes(
    '[{"schema":"rxdb_sql_regression","table":"cascade_nodes",
       "ids":["cascade-denied-replay-child","cascade-replay-parent","cascade-denied-stay"]}]', true
  );
  PERFORM rxdb_sql_regression.assert_true(
    result->'entity_results'->0->>'status' = 'applied'
      AND result->'entity_results'->1->>'status' = 'applied'
      AND result->'entity_results'->2->>'status' = 'rejected',
    'final receipts must reflect the real cascade after failed-group replay'
  );
  PERFORM rxdb_sql_regression.push_cascade_deletes(
    '[{"schema":"rxdb_sql_regression","table":"cascade_nodes",
       "ids":["cascade-denied-replay-child","cascade-replay-parent","cascade-denied-stay"]}]', true
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change
      WHERE namespace = 'rxdb_sql_regression' AND entity = 'CascadeNode' AND type = 'DELETE'
        AND "entityId" IN ('cascade-replay-parent', 'cascade-denied-replay-child', 'cascade-replay-grandchild')) = 3,
    'failed group rollback and replay must log every level exactly once'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change
      WHERE "entityId" = 'cascade-denied-replay-child' AND type = 'DELETE'
        AND "clientId" = 'sql-cascade-cascade-denied-replay-child') = 1
      AND NOT EXISTS (SELECT 1 FROM public.rxdb_change WHERE "entityId" = 'cascade-denied-stay' AND type = 'DELETE'),
    'only real cascading deletions are logged after replay rejection'
  );

  INSERT INTO rxdb_sql_regression.cascade_nodes (id, "parentId", value)
  VALUES ('cascade-rollback-parent', NULL, 'parent'),
         ('cascade-rollback-child', 'cascade-rollback-parent', 'child');
  BEGIN
    PERFORM rxdb_sql_regression.push_cascade_deletes(
      '[{"schema":"rxdb_sql_regression","table":"cascade_nodes","ids":["cascade-rollback-parent"]},
        {"schema":"rxdb_sql_regression","table":"cascade_nodes","ids":["cascade-denied-stay"]}]'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    rejected AND (SELECT pg_catalog.count(*) FROM rxdb_sql_regression.cascade_nodes
      WHERE id IN ('cascade-rollback-parent', 'cascade-rollback-child')) = 2
      AND NOT EXISTS (SELECT 1 FROM public.rxdb_change
        WHERE "entityId" IN ('cascade-rollback-parent', 'cascade-rollback-child') AND type = 'DELETE'),
    'legacy transaction failure must roll back parent, children and cascade logs together'
  );
END;
$$;

-- 隐藏子行带 inversePatch 时，它被允许的父删除级联删掉，最终 DELETE 快照必须是服务端真实 OLD（含 id）。
-- 只靠客户端 inversePatch 拼出的快照缺 id，按 id 过滤的拉取会漏掉这条删除。
CREATE FUNCTION rxdb_sql_regression.test_cascade_hidden_inverse_patch()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  INSERT INTO rxdb_sql_regression.cascade_parent_ids (id, value) VALUES ('hidden-inverse-parent', 'parent');
  INSERT INTO rxdb_sql_regression.cascade_hidden_children (id, "parentId", value)
  VALUES ('hidden-inverse-child', 'hidden-inverse-parent', 'hidden-inverse-value');

  result := public.rxdb_mutations(
    p_deletes => '[
      {"schema":"rxdb_sql_regression","table":"cascade_hidden_children","ids":["hidden-inverse-child"]},
      {"schema":"rxdb_sql_regression","table":"cascade_parent_ids","ids":["hidden-inverse-parent"]}]',
    p_changes => '[
      {"namespace":"rxdb_sql_regression","entity":"CascadeHiddenChild","schema":"rxdb_sql_regression",
       "table":"cascade_hidden_children","entityId":"hidden-inverse-child","type":"DELETE",
       "inversePatch":{"parentId":"hidden-inverse-parent","value":"hidden-inverse-value"},
       "branchId":"main","clientId":"sql-cascade-hidden-inverse","localId":1},
      {"namespace":"rxdb_sql_regression","entity":"CascadeParent","schema":"rxdb_sql_regression",
       "table":"cascade_parent_ids","entityId":"hidden-inverse-parent","type":"DELETE",
       "inversePatch":{"value":"parent"},
       "branchId":"main","clientId":"sql-cascade-hidden-inverse","localId":2}]',
    p_skip_sync => true,
    p_receipts => true
  );
  PERFORM rxdb_sql_regression.assert_true(
    result->'entity_results'->0->>'status' = 'applied' AND NOT (result->'entity_results'->0 ? 'reason'),
    'hidden child with inversePatch really deleted by its allowed parent must be applied in the final receipt'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change
      WHERE namespace = 'rxdb_sql_regression' AND entity = 'CascadeHiddenChild'
        AND "entityId" = 'hidden-inverse-child' AND type = 'DELETE'
        AND "clientId" = 'sql-cascade-hidden-inverse' AND "localId" = 1
        AND "snapshotComplete" AND "beforeData"->>'id' = 'hidden-inverse-child'
        AND "beforeData"->>'value' = 'hidden-inverse-value') = 1,
    'hidden child DELETE must carry the real server OLD (with id), not the client inversePatch'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_pull_changes(
      0, 100, 'rxdb_sql_regression', 'CascadeHiddenChild', 'main',
      '{"combinator":"and","rules":[{"field":"id","operator":"=","value":"hidden-inverse-child"}]}'
    ) WHERE type = 'DELETE') = 1,
    'filtered pull by id must return the hidden child DELETE'
  );
END;
$$;

-- 数值主键：客户端的 "1" 与存储的 1.00 是同一行（numeric(8,2) 与无修饰 numeric 都是），显式删除只记一条源日志，不再追加隐式日志
CREATE FUNCTION rxdb_sql_regression.test_cascade_numeric_keys()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  INSERT INTO rxdb_sql_regression.numeric_key_nodes (id, value) VALUES (1, 'first');
  result := public.rxdb_mutations(
    p_deletes => '[{"schema":"rxdb_sql_regression","table":"numeric_key_nodes","ids":["1"]}]',
    p_changes => '[{"namespace":"rxdb_sql_regression","entity":"NumericKeyNode","schema":"rxdb_sql_regression",
      "table":"numeric_key_nodes","entityId":"1","type":"DELETE","inversePatch":{"value":"first"},
      "branchId":"main","clientId":"sql-numeric-key","localId":1}]',
    p_skip_sync => true,
    p_receipts => true
  );
  PERFORM rxdb_sql_regression.assert_true(
    result->'entity_results'->0->>'status' = 'applied',
    'numeric key: explicit delete must be applied'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change
      WHERE namespace = 'rxdb_sql_regression' AND entity = 'NumericKeyNode' AND type = 'DELETE') = 1
      AND (SELECT pg_catalog.count(*) FROM public.rxdb_change
        WHERE namespace = 'rxdb_sql_regression' AND entity = 'NumericKeyNode' AND type = 'DELETE'
          AND "clientId" = 'sql-numeric-key' AND "localId" = 1 AND "snapshotComplete") = 1,
    'numeric key: one explicit delete must produce exactly one mapped complete DELETE, no implicit duplicate'
  );

  INSERT INTO rxdb_sql_regression.numeric_plain_key_nodes (id, value) VALUES (1.00, 'plain');
  result := public.rxdb_mutations(
    p_deletes => '[{"schema":"rxdb_sql_regression","table":"numeric_plain_key_nodes","ids":["1"]}]',
    p_changes => '[{"namespace":"rxdb_sql_regression","entity":"NumericPlainKeyNode","schema":"rxdb_sql_regression",
      "table":"numeric_plain_key_nodes","entityId":"1","type":"DELETE","inversePatch":{"value":"plain"},
      "branchId":"main","clientId":"sql-numeric-plain-key","localId":1}]',
    p_skip_sync => true,
    p_receipts => true
  );
  PERFORM rxdb_sql_regression.assert_true(
    result->'entity_results'->0->>'status' = 'applied'
      AND (SELECT pg_catalog.count(*) FROM public.rxdb_change
        WHERE namespace = 'rxdb_sql_regression' AND entity = 'NumericPlainKeyNode' AND type = 'DELETE') = 1
      AND (SELECT pg_catalog.count(*) FROM public.rxdb_change
        WHERE namespace = 'rxdb_sql_regression' AND entity = 'NumericPlainKeyNode' AND type = 'DELETE'
          AND "clientId" = 'sql-numeric-plain-key' AND "localId" = 1
          AND ("beforeData"->>'id')::numeric = 1) = 1,
    'plain numeric key: "1" and stored 1.00 are one row, one mapped DELETE with the real OLD, no implicit duplicate'
  );
END;
$$;

-- 分区表：根表与叶分区两种目标删同一行，都只记一条带源映射的 DELETE，不追加隐式日志
CREATE FUNCTION rxdb_sql_regression.test_cascade_partition_keys()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  INSERT INTO rxdb_sql_regression.partitioned_key_nodes (id, value) VALUES (1, 'root-target'), (2, 'leaf-target');
  result := public.rxdb_mutations(
    p_deletes => '[{"schema":"rxdb_sql_regression","table":"partitioned_key_nodes","ids":["1"]}]',
    p_changes => '[{"namespace":"rxdb_sql_regression","entity":"PartitionedKeyNode","schema":"rxdb_sql_regression",
      "table":"partitioned_key_nodes","entityId":"1","type":"DELETE","inversePatch":{"value":"root-target"},
      "branchId":"main","clientId":"sql-partition-root","localId":1}]',
    p_skip_sync => true,
    p_receipts => true
  );
  PERFORM rxdb_sql_regression.assert_true(
    result->'entity_results'->0->>'status' = 'applied',
    'partition root target: explicit delete must be applied'
  );
  result := public.rxdb_mutations(
    p_deletes => '[{"schema":"rxdb_sql_regression","table":"partitioned_key_nodes_low","ids":["2"]}]',
    p_changes => '[{"namespace":"rxdb_sql_regression","entity":"PartitionedKeyNode","schema":"rxdb_sql_regression",
      "table":"partitioned_key_nodes_low","entityId":"2","type":"DELETE","inversePatch":{"value":"leaf-target"},
      "branchId":"main","clientId":"sql-partition-leaf","localId":1}]',
    p_skip_sync => true,
    p_receipts => true
  );
  PERFORM rxdb_sql_regression.assert_true(
    result->'entity_results'->0->>'status' = 'applied',
    'partition leaf target: explicit delete must be applied'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change
      WHERE namespace = 'rxdb_sql_regression' AND entity = 'PartitionedKeyNode' AND type = 'DELETE') = 2
      AND (SELECT pg_catalog.count(*) FROM public.rxdb_change
        WHERE namespace = 'rxdb_sql_regression' AND entity = 'PartitionedKeyNode' AND type = 'DELETE'
          AND "clientId" IN ('sql-partition-root', 'sql-partition-leaf') AND "localId" = 1) = 2,
    'partition: each explicit delete must produce exactly one mapped DELETE, through root and leaf targets alike'
  );
END;
$$;

-- US-218 阶段 C：生产权限脚本生效后（客户端无 rxdb_change 写权限），同步写路径仍可用
CREATE FUNCTION rxdb_sql_regression.test_production_change_grants()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  direct_insert_denied boolean := false;
  helper_denied_message text;
  before_count integer;
  after_count integer;
  trigger_definer boolean;
  helper_definer boolean;
  helper_search_path_pinned boolean;
  backend_update_denied boolean := false;
  v_unprotected text[];
  v_rls_disabled text[];
BEGIN
  -- 1. 客户端直接 INSERT 日志表 → 42501（AC#17）
  BEGIN
    INSERT INTO public.rxdb_change (namespace, entity, "entityId", type, "branchId")
    VALUES ('rxdb_sql_regression', 'PushOpen', 'prod-grants-forged', 'INSERT', 'main');
  EXCEPTION
    WHEN insufficient_privilege THEN
      direct_insert_denied := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(direct_insert_denied, 'production-change-grants: direct INSERT into rxdb_change must raise 42501');

  -- 2. 客户端直调 rxdb_insert_changes → 42501（守卫未开）
  BEGIN
    PERFORM public.rxdb_insert_changes('[]'::jsonb);
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS helper_denied_message = MESSAGE_TEXT;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    helper_denied_message = 'rxdb: rxdb_insert_changes may only be called by rxdb_mutations',
    pg_catalog.format('production-change-grants: direct rxdb_insert_changes call must raise the guard 42501: %s', helper_denied_message)
  );

  -- 3. 推送非 main 分支日志 → 成功，日志 +1（AC#18）
  SELECT pg_catalog.count(*)::integer INTO before_count FROM public.rxdb_change WHERE "clientId" = 'sql-prod-grants-client';
  PERFORM public.rxdb_mutations(
    p_changes => '[{"namespace":"rxdb_sql_regression","entity":"PushOpen","schema":"rxdb_sql_regression","table":"push_open_ids",
      "entityId":"prod-grants-branch-1","type":"INSERT","patch":{"id":"prod-grants-branch-1","value":"branch"},
      "branchId":"sql-prod-grants-branch","clientId":"sql-prod-grants-client","localId":870001}]'::jsonb,
    p_skip_sync => true
  );
  SELECT pg_catalog.count(*)::integer INTO after_count FROM public.rxdb_change WHERE "clientId" = 'sql-prod-grants-client';
  PERFORM rxdb_sql_regression.assert_true(
    after_count = before_count + 1,
    pg_catalog.format('production-change-grants: a non-main branch log must be written: %s -> %s', before_count, after_count)
  );

  -- 4. 推送 main 新建（显式日志）→ 成功，日志 +1
  PERFORM public.rxdb_mutations(
    p_upserts => '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"prod-grants-main-1","value":"new"}]}]'::jsonb,
    p_changes => '[{"namespace":"rxdb_sql_regression","entity":"PushOpen","schema":"rxdb_sql_regression","table":"push_open_ids",
      "entityId":"prod-grants-main-1","type":"INSERT","patch":{"id":"prod-grants-main-1","value":"new"},
      "branchId":"main","clientId":"sql-prod-grants-client","localId":870002}]'::jsonb,
    p_skip_sync => true,
    p_receipts => true
  );
  SELECT pg_catalog.count(*)::integer INTO before_count FROM public.rxdb_change WHERE "clientId" = 'sql-prod-grants-client';
  PERFORM rxdb_sql_regression.assert_true(
    before_count = after_count + 1,
    pg_catalog.format('production-change-grants: a main push must log via the helper: %s -> %s', after_count, before_count)
  );

  -- 5. 触发器模式（p_skip_sync = false）新建 → 成功，触发器写日志 1 条
  -- 整个回归在一个事务里：上面 p_skip_sync = true 的调用已把事务级 rxdb.sync_enabled 置为 'false'
  -- （真实请求一次 RPC 一个事务，不受影响），这里恢复，让触发器生效
  PERFORM pg_catalog.set_config('rxdb.sync_enabled', 'true', true);
  PERFORM public.rxdb_mutations(
    p_upserts => '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"prod-grants-trigger-1","value":"new"}]}]'::jsonb,
    p_skip_sync => false
  );
  SELECT pg_catalog.count(*)::integer INTO after_count FROM public.rxdb_change WHERE "entityId" = 'prod-grants-trigger-1';
  PERFORM rxdb_sql_regression.assert_true(
    after_count = 1,
    pg_catalog.format('production-change-grants: the sync trigger must log the write: %s', after_count)
  );

  -- 6. SELECT 日志表仍可用（rxdb_pull_changes 与 realtime 以调用方身份读）
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_change WHERE "clientId" = 'sql-prod-grants-client') = 2,
    'production-change-grants: SELECT on rxdb_change must remain granted'
  );

  -- 7. 客户端改不了远端身份（否则能让所有客户端误判远端已重置），读仍经 rxdb_backend_id()
  BEGIN
    UPDATE public.rxdb_backend SET id = pg_catalog.gen_random_uuid() WHERE singleton;
  EXCEPTION
    WHEN insufficient_privilege THEN
      backend_update_denied := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(backend_update_denied, 'production-change-grants: UPDATE on rxdb_backend must raise 42501');
  PERFORM rxdb_sql_regression.assert_true(
    public.rxdb_backend_id() IS NOT NULL,
    'production-change-grants: rxdb_backend_id() must stay callable'
  );

  -- 8. 客户端能读的 rxdb_ 表都以 RLS 为边界，且只有读取策略（Supabase Advisor 的 rls_disabled_in_public）：
  --    整库 GRANT 把写权限放宽回去之后，客户端照样改不了一行。rxdb_sql_ 是本套件自己的夹具
  SELECT pg_catalog.array_agg(c.relname::text ORDER BY c.relname)
  INTO v_unprotected
  FROM pg_catalog.pg_class AS c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'r'
    AND c.relname LIKE 'rxdb\_%'
    AND c.relname NOT LIKE 'rxdb\_sql\_%'
    AND (
      pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
      OR pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
    )
    AND (
      NOT c.relrowsecurity
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy AS p WHERE p.polrelid = c.oid AND p.polcmd <> 'r')
    );
  PERFORM rxdb_sql_regression.assert_true(
    v_unprotected IS NULL,
    pg_catalog.format('production-change-grants: client-readable rxdb_ tables must enable RLS with read-only policies: %s', v_unprotected)
  );

  -- 9. 适配器 connect() 的 RLS 自检默认检查日志表与分支表（resolveRlsCheckTables），参考部署要能通过
  SELECT pg_catalog.array_agg(item->>'table' ORDER BY item->>'table')
  INTO v_rls_disabled
  FROM pg_catalog.jsonb_array_elements(public.rxdb_check_rls(
    '[{"schema":"public","table":"rxdb_change"},{"schema":"public","table":"rxdb_branch"}]'::jsonb
  )) AS item
  WHERE (item->>'rlsEnabled')::boolean IS NOT TRUE;
  PERFORM rxdb_sql_regression.assert_true(
    v_rls_disabled IS NULL,
    pg_catalog.format('production-change-grants: the adapter RLS self-check must pass on RxDB tables: %s', v_rls_disabled)
  );

  -- 10. 开 RLS 之后读取照旧
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM public.rxdb_branch WHERE id = 'main'),
    'production-change-grants: authenticated must still read rxdb_branch'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_backend) = 1,
    'production-change-grants: authenticated must still read rxdb_backend'
  );

  -- 函数属性：两个写日志的函数都是 DEFINER，helper 固定 search_path
  SELECT p.prosecdef INTO trigger_definer
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = pg_catalog.to_regprocedure('public.rxdb_log_change_trigger()');
  SELECT p.prosecdef, 'search_path=pg_catalog, pg_temp' = ANY(p.proconfig)
  INTO helper_definer, helper_search_path_pinned
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = pg_catalog.to_regprocedure('public.rxdb_insert_changes(jsonb)');
  PERFORM rxdb_sql_regression.assert_true(trigger_definer, 'production-change-grants: rxdb_log_change_trigger must be SECURITY DEFINER');
  PERFORM rxdb_sql_regression.assert_true(helper_definer, 'production-change-grants: rxdb_insert_changes must be SECURITY DEFINER');
  PERFORM rxdb_sql_regression.assert_true(helper_search_path_pinned, 'production-change-grants: rxdb_insert_changes must pin search_path');
END;
$$;

-- US-225：以属主身份窥看所有者表与通知（被测角色读不到它们）
CREATE FUNCTION rxdb_sql_regression.branch_owner(p_branch_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT "ownerId" FROM public.rxdb_branch_owner WHERE "branchId" = p_branch_id
$$;

CREATE FUNCTION rxdb_sql_regression.change_notifications()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT payload FROM realtime.messages
  WHERE topic = 'rxdb:changes' AND extension = 'broadcast' AND event = 'changes' AND private
$$;

-- 以调用方身份数通知：Realtime 加入私有频道时就是这样以登录用户身份试读 realtime.messages
CREATE FUNCTION rxdb_sql_regression.visible_change_notifications()
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.count(*) FROM realtime.messages WHERE topic = 'rxdb:changes' AND extension = 'broadcast'
$$;

-- US-225 AC#7 的种子：所有者表出现之前就已登记、或已写过日志的旧分支（以属主身份写入，不经认领）
CREATE FUNCTION rxdb_sql_regression.seed_legacy_branches()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO public.rxdb_branch (id, activated, "parentId") VALUES ('sql-owner-legacy-registered', false, 'main');
  INSERT INTO public.rxdb_change (namespace, entity, "entityId", type, "branchId", "clientId", "localId")
  VALUES ('rxdb_sql_regression', 'PushOpen', 'owner-legacy-seed', 'INSERT', 'sql-owner-legacy-logged', 'sql-legacy-client', 893001);
END;
$$;

-- US-225 AC#1、#3、#4：anon 退出日志同步协议（以 anon 身份执行，生产权限脚本已生效）
CREATE FUNCTION rxdb_sql_regression.test_anon_sync_protocol()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  denied text[] := '{}';
BEGIN
  BEGIN
    PERFORM 1 FROM public.rxdb_change WHERE bucket IS NULL LIMIT 1;
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'select rxdb_change'::text;
  END;
  BEGIN
    PERFORM 1 FROM public.rxdb_branch LIMIT 1;
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'select rxdb_branch'::text;
  END;
  BEGIN
    PERFORM public.rxdb_pull_changes(0, 10, 'rxdb_sql_regression', 'PushOpen');
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'rxdb_pull_changes'::text;
  END;
  BEGIN
    PERFORM public.rxdb_mutations(
      p_upserts => '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"anon-protocol-main","value":"pushed"}]}]'::jsonb,
      p_changes => pg_catalog.jsonb_build_array(rxdb_sql_regression.push_log('anon-protocol-main', 'INSERT', 890001)),
      p_skip_sync => true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'rxdb_mutations main'::text;
  END;
  BEGIN
    PERFORM public.rxdb_mutations(
      p_changes => pg_catalog.jsonb_build_array(
        rxdb_sql_regression.push_log('anon-protocol-branch', 'INSERT', 890002, 'sql-anon-branch')
      ),
      p_skip_sync => true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'rxdb_mutations branch'::text;
  END;
  BEGIN
    PERFORM public.rxdb_existing_ids('push_open_ids', 'rxdb_sql_regression', ARRAY['open-1']);
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'rxdb_existing_ids'::text;
  END;
  BEGIN
    PERFORM public.rxdb_enable_sync_for_branch('[{"id":"sql-anon-branch","parentId":"main"}]'::jsonb);
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'rxdb_enable_sync_for_branch'::text;
  END;

  PERFORM rxdb_sql_regression.assert_true(
    denied = ARRAY[
      'select rxdb_branch', 'rxdb_pull_changes', 'rxdb_mutations main',
      'rxdb_mutations branch', 'rxdb_existing_ids', 'rxdb_enable_sync_for_branch'
    ],
    pg_catalog.format('anon-sync-protocol: every sync protocol entry must be denied to anon, denied: %s', denied)
  );

  -- 连接时调用的三个函数照常可用；业务表仍按自己的 GRANT 与 RLS 直接读写
  PERFORM rxdb_sql_regression.assert_true(
    public.rxdb_server_version() IS NOT NULL,
    'anon-sync-protocol: rxdb_server_version must stay callable'
  );
  PERFORM rxdb_sql_regression.assert_true(
    public.rxdb_backend_id() IS NOT NULL,
    'anon-sync-protocol: rxdb_backend_id must stay callable'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_backend) = 1,
    'anon-sync-protocol: anon must still read rxdb_backend'
  );
  PERFORM rxdb_sql_regression.assert_true(
    public.rxdb_check_rls('[{"schema":"rxdb_sql_regression","table":"push_open_ids"}]'::jsonb) IS NOT NULL,
    'anon-sync-protocol: rxdb_check_rls must stay callable'
  );
  INSERT INTO rxdb_sql_regression.push_open_ids (id, value) VALUES ('anon-protocol-direct', 'direct');
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM rxdb_sql_regression.push_open_ids WHERE id = 'anon-protocol-direct'),
    'anon-sync-protocol: anon must still write business tables under their own grants'
  );
END;
$$;

-- 以属主身份核对 anon 被拒的调用没有留下任何写入
CREATE FUNCTION rxdb_sql_regression.test_anon_sync_protocol_verify()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (
      SELECT 1 FROM rxdb_sql_regression.push_open_ids WHERE id IN ('anon-protocol-main', 'anon-protocol-branch')
    )
      AND NOT EXISTS (
        SELECT 1 FROM public.rxdb_change WHERE "entityId" IN ('anon-protocol-main', 'anon-protocol-branch')
      )
      AND NOT EXISTS (SELECT 1 FROM public.rxdb_branch WHERE id = 'sql-anon-branch')
      AND NOT EXISTS (SELECT 1 FROM public.rxdb_branch_owner WHERE "branchId" = 'sql-anon-branch'),
    'anon-sync-protocol: denied anon calls must leave business tables, the log and the branch tables untouched'
  );
END;
$$;

-- US-225 AC#2、#5～#8：非 main 分支按所有者写入（以 authenticated 身份执行，切换 JWT 声明模拟两个用户）
CREATE FUNCTION rxdb_sql_regression.test_branch_ownership()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  user_a constant text := '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
  user_b constant text := '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}';
  no_sub constant text := '{"role":"authenticated"}';
  denied text[] := '{}';
  message text;
BEGIN
  -- A 登记 feature 并推送它的日志；同一次推送顺带一个从未登记过的祖先分支
  PERFORM pg_catalog.set_config('request.jwt.claims', user_a, true);
  PERFORM public.rxdb_enable_sync_for_branch('[{"id":"sql-owner-feature","parentId":"sql-owner-ancestor"}]'::jsonb);
  PERFORM public.rxdb_mutations(
    p_changes => pg_catalog.jsonb_build_array(
      rxdb_sql_regression.push_log('owner-feature-1', 'INSERT', 891001, 'sql-owner-feature'),
      rxdb_sql_regression.push_log('owner-ancestor-1', 'INSERT', 891002, 'sql-owner-ancestor')
    ),
    p_skip_sync => true
  );
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.branch_owner('sql-owner-feature') = '00000000-0000-4000-8000-0000000000a1'::uuid
      AND rxdb_sql_regression.branch_owner('sql-owner-ancestor') = '00000000-0000-4000-8000-0000000000a1'::uuid,
    'branch-ownership: the first writer must own both the registered branch and the unregistered ancestor'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_pull_changes(0, 1000, 'rxdb_sql_regression', 'PushOpen', 'sql-owner-feature')) = 1,
    'branch-ownership: authenticated callers must pull the owned branch log'
  );
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM public.rxdb_branch WHERE id = 'sql-owner-feature'),
    'branch-ownership: authenticated callers must read rxdb_branch'
  );
  -- 所有者改写自己的分支照常可以
  PERFORM public.rxdb_enable_sync_for_branch('[{"id":"sql-owner-feature","parentId":"main"}]'::jsonb);

  -- B 登记同名分支、往 A 的分支推送
  PERFORM pg_catalog.set_config('request.jwt.claims', user_b, true);
  BEGIN
    PERFORM public.rxdb_enable_sync_for_branch('[{"id":"sql-owner-feature","parentId":"main"}]'::jsonb);
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'b register'::text;
  END;
  BEGIN
    PERFORM public.rxdb_mutations(
      p_changes => pg_catalog.jsonb_build_array(
        rxdb_sql_regression.push_log('owner-feature-b', 'INSERT', 891003, 'sql-owner-feature')
      ),
      p_skip_sync => true,
      p_receipts => true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      denied := denied || 'b push'::text;
      GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    message = 'rxdb: branch sql-owner-feature belongs to another user',
    pg_catalog.format('branch-ownership: a push into another user''s branch must name the branch: %s', message)
  );

  -- 没有 sub 的令牌认领不了分支
  PERFORM pg_catalog.set_config('request.jwt.claims', no_sub, true);
  BEGIN
    PERFORM public.rxdb_mutations(
      p_changes => pg_catalog.jsonb_build_array(
        rxdb_sql_regression.push_log('owner-nosub-1', 'INSERT', 891004, 'sql-owner-nosub')
      ),
      p_skip_sync => true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'no sub push'::text;
  END;

  -- 已有日志或登记、却没有所有者的旧分支（种子见 seed_legacy_branches）
  PERFORM pg_catalog.set_config('request.jwt.claims', user_a, true);
  BEGIN
    PERFORM public.rxdb_mutations(
      p_changes => pg_catalog.jsonb_build_array(
        rxdb_sql_regression.push_log('owner-legacy-1', 'INSERT', 891005, 'sql-owner-legacy-logged')
      ),
      p_skip_sync => true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      denied := denied || 'legacy logged push'::text;
      GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    message = 'rxdb: branch sql-owner-legacy-logged has no owner',
    pg_catalog.format('branch-ownership: an unowned legacy branch must ask for an owner: %s', message)
  );
  BEGIN
    PERFORM public.rxdb_enable_sync_for_branch('[{"id":"sql-owner-legacy-registered","parentId":"main"}]'::jsonb);
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'legacy registered register'::text;
  END;

  -- 分支表只经登记函数写入，所有者表客户端不读不写，认领函数不对客户端开放
  BEGIN
    INSERT INTO public.rxdb_branch (id, activated) VALUES ('sql-owner-direct', false);
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'insert rxdb_branch'::text;
  END;
  BEGIN
    UPDATE public.rxdb_branch SET "parentId" = 'forged' WHERE id = 'sql-owner-feature';
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'update rxdb_branch'::text;
  END;
  BEGIN
    DELETE FROM public.rxdb_branch WHERE id = 'sql-owner-feature';
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'delete rxdb_branch'::text;
  END;
  BEGIN
    PERFORM 1 FROM public.rxdb_branch_owner LIMIT 1;
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'select rxdb_branch_owner'::text;
  END;
  BEGIN
    INSERT INTO public.rxdb_branch_owner ("branchId", "ownerId")
    VALUES ('sql-owner-squat', '00000000-0000-4000-8000-0000000000b2');
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'insert rxdb_branch_owner'::text;
  END;
  BEGIN
    PERFORM public.rxdb_claim_branch('sql-owner-squat');
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'rxdb_claim_branch'::text;
  END;

  PERFORM rxdb_sql_regression.assert_true(
    denied = ARRAY[
      'b register', 'b push', 'no sub push', 'legacy logged push', 'legacy registered register',
      'insert rxdb_branch', 'update rxdb_branch', 'delete rxdb_branch',
      'select rxdb_branch_owner', 'insert rxdb_branch_owner', 'rxdb_claim_branch'
    ],
    pg_catalog.format('branch-ownership: denied set mismatch: %s', denied)
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_pull_changes(0, 1000, 'rxdb_sql_regression', 'PushOpen', 'sql-owner-feature')) = 1
      AND rxdb_sql_regression.branch_owner('sql-owner-nosub') IS NULL
      AND rxdb_sql_regression.branch_owner('sql-owner-legacy-logged') IS NULL
      AND rxdb_sql_regression.branch_owner('sql-owner-squat') IS NULL,
    'branch-ownership: denied writes must leave the log and the owner table untouched'
  );
END;
$$;

-- 让快照水位测试制造「目标 bucket 先写、其它 bucket 后写」的交错日志。
CREATE FUNCTION rxdb_sql_regression.seed_bucket_snapshot_interleaving()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO public.rxdb_change (namespace, entity, bucket, "entityId", type, "branchId", "clientId")
  VALUES
    ('rxdb_sql_regression', 'IdentityScopedRow', 'user:00000000-0000-4000-8000-0000000000a1', 'snapshot-target', 'INSERT', 'main', 'sql-snapshot-target'),
    ('rxdb_sql_regression', 'IdentityScopedRow', 'user:00000000-0000-4000-8000-0000000000b2', 'snapshot-interleaving', 'INSERT', 'main', 'sql-snapshot-other');
$$;

-- 快照分页（bucketed-read-sync）：公开区里按 id 排好的三行，供翻页之间删行
CREATE FUNCTION rxdb_sql_regression.seed_bucket_keyset_rows()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO rxdb_sql_regression.identity_scoped_rows (id, visibility, owner_id, value)
  VALUES ('keyset-1', 'public', NULL, 'k1'), ('keyset-2', 'public', NULL, 'k2'), ('keyset-3', 'public', NULL, 'k3');
$$;

CREATE FUNCTION rxdb_sql_regression.delete_bucket_row(p_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  DELETE FROM rxdb_sql_regression.identity_scoped_rows WHERE id = p_id;
$$;

-- 水位按分支（bucketed-read-sync）：用户 A 的分区里一条非 main 分支的日志，id 比 main 上的都大
CREATE FUNCTION rxdb_sql_regression.seed_bucket_other_branch_change()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO public.rxdb_change (namespace, entity, bucket, "entityId", type, "branchId", "clientId")
  VALUES ('rxdb_sql_regression', 'IdentityScopedRow', 'user:00000000-0000-4000-8000-0000000000a1',
          'snapshot-other-branch', 'INSERT', 'sql-snapshot-other-branch', 'sql-snapshot-other-branch')
  RETURNING id;
$$;

-- 推送写下的日志落在哪个 bucket（bucketed-push）：以属主身份读，不受日志表 RLS 影响
CREATE FUNCTION rxdb_sql_regression.logged_bucket(p_client_id text, p_local_id integer)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT bucket FROM public.rxdb_change WHERE "clientId" = p_client_id AND "localId" = p_local_id;
$$;

CREATE FUNCTION rxdb_sql_regression.current_change_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT COALESCE(pg_catalog.max(id), 0)::integer FROM public.rxdb_change;
$$;

-- push-a 在 p_since 之后的日志：[type, bucket, clientId, localId]，按 id 排序
CREATE FUNCTION rxdb_sql_regression.bucket_push_log_since(p_since integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(type, bucket, "clientId", "localId") ORDER BY id),
    '[]'::jsonb
  )
  FROM public.rxdb_change
  WHERE id > p_since AND entity = 'BucketPushRow' AND "entityId" = 'push-a';
$$;

CREATE FUNCTION rxdb_sql_regression.logged_change_count(p_client_id text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.count(*)::integer FROM public.rxdb_change WHERE "clientId" = p_client_id;
$$;

-- 让实时通知测试在同一条 INSERT 中覆盖公开区、用户 A 和用户 B。
CREATE FUNCTION rxdb_sql_regression.seed_realtime_bucket_notifications()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO public.rxdb_change (namespace, entity, bucket, "entityId", type, "branchId", "clientId")
  VALUES
    ('rxdb_sql_regression', 'IdentityScopedRow', 'public', 'realtime-bucket-public', 'INSERT', 'main', 'sql-realtime-public'),
    ('rxdb_sql_regression', 'IdentityScopedRow', 'user:00000000-0000-4000-8000-0000000000a1', 'realtime-bucket-user-a', 'INSERT', 'main', 'sql-realtime-user-a'),
    ('rxdb_sql_regression', 'IdentityScopedRow', 'user:00000000-0000-4000-8000-0000000000b2', 'realtime-bucket-user-b', 'INSERT', 'main', 'sql-realtime-user-b');
$$;

-- US-225 AC#9、#10：实时通知只带元数据，按每个 bucket 每 200 条聚合（以 authenticated 身份推送）
CREATE FUNCTION rxdb_sql_regression.test_realtime_notifications()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  before_count integer;
  payload jsonb;
  bulk jsonb;
  batch_sizes integer[];
BEGIN
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rxdb_change'
    ),
    'realtime-notifications: rxdb_change must not be in the supabase_realtime publication'
  );

  SELECT pg_catalog.count(*)::integer INTO before_count FROM rxdb_sql_regression.change_notifications();
  PERFORM public.rxdb_mutations(
    p_upserts => '[{"schema":"rxdb_sql_regression","table":"push_open_ids","data":[{"id":"realtime-secret-1","value":"realtime-secret-value"}]}]'::jsonb,
    p_changes => pg_catalog.jsonb_build_array(
      rxdb_sql_regression.push_log('realtime-secret-1', 'INSERT', 892001)
        || '{"patch":{"id":"realtime-secret-1","value":"realtime-secret-value"}}'::jsonb
    ),
    p_skip_sync => true
  );
  SELECT notification INTO payload
  FROM rxdb_sql_regression.change_notifications() AS notification
  WHERE notification->'changes' @> '[{"entityId":"realtime-secret-1"}]';
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM rxdb_sql_regression.change_notifications()) = before_count + 1,
    'realtime-notifications: one push statement must broadcast exactly one notification'
  );
  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.jsonb_array_length(payload->'changes') = 1
      AND (
        SELECT pg_catalog.array_agg(key ORDER BY key)
        FROM pg_catalog.jsonb_object_keys(payload->'changes'->0) AS key
      ) = ARRAY['branchId', 'bucket', 'clientId', 'createdAt', 'entity', 'entityId', 'namespace', 'type']
      AND payload->'changes'->0->>'type' = 'INSERT'
      AND payload->'changes'->0->>'branchId' = 'main'
      AND payload->'changes'->0->>'clientId' = 'sql-push-integrity-client',
    pg_catalog.format('realtime-notifications: a notification must carry metadata only: %s', payload)
  );
  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.strpos(payload::text, 'realtime-secret-value') = 0,
    pg_catalog.format('realtime-notifications: row content must not leak into the notification: %s', payload)
  );

  -- 一次推 450 条（调用者认领的非 main 分支，不需要业务行）：聚合成 200 + 200 + 50 三条
  SELECT pg_catalog.jsonb_agg(
    rxdb_sql_regression.push_log('realtime-bulk-' || n, 'INSERT', 892100 + n, 'sql-realtime-bulk') ORDER BY n
  )
  INTO bulk
  FROM pg_catalog.generate_series(1, 450) AS n;
  SELECT pg_catalog.count(*)::integer INTO before_count FROM rxdb_sql_regression.change_notifications();
  PERFORM public.rxdb_mutations(p_changes => bulk, p_skip_sync => true);
  SELECT pg_catalog.array_agg(pg_catalog.jsonb_array_length(notification->'changes') ORDER BY pg_catalog.jsonb_array_length(notification->'changes') DESC)
  INTO batch_sizes
  FROM rxdb_sql_regression.change_notifications() AS notification
  WHERE notification->'changes'->0->>'branchId' = 'sql-realtime-bulk';
  PERFORM rxdb_sql_regression.assert_true(
    batch_sizes = ARRAY[200, 200, 50],
    pg_catalog.format('realtime-notifications: 450 changes must be batched as 200 + 200 + 50, got %s', batch_sizes)
  );

  PERFORM rxdb_sql_regression.seed_realtime_bucket_notifications();
  PERFORM rxdb_sql_regression.assert_true(
    (
      SELECT pg_catalog.count(*) FROM realtime.messages AS messages
      WHERE messages.topic LIKE 'rxdb:changes%' AND messages.extension = 'broadcast'
        AND messages.payload->'changes' @> '[{"entityId":"realtime-bucket-public"}]'::jsonb
    ) = 1
      AND (
        SELECT pg_catalog.count(*) FROM realtime.messages AS messages
        WHERE messages.topic LIKE 'rxdb:changes%' AND messages.extension = 'broadcast'
          AND messages.payload->'changes' @> '[{"entityId":"realtime-bucket-user-a"}]'::jsonb
      ) = 1
      AND (
        SELECT pg_catalog.count(*) FROM realtime.messages AS messages
        WHERE messages.topic LIKE 'rxdb:changes%' AND messages.extension = 'broadcast'
          AND messages.payload->'changes' @> '[{"entityId":"realtime-bucket-user-b"}]'::jsonb
      ) = 0,
    'realtime-notifications: an authenticated user must only see public and caller bucket notifications'
  );
END;
$$;

-- US-033：按身份读取分区、快照后增量与行换区的安全边界
CREATE FUNCTION rxdb_sql_regression.test_bucketed_read_sync()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  user_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  user_b constant uuid := '00000000-0000-4000-8000-0000000000b2';
  v_info jsonb;
  v_snapshot jsonb;
  v_point integer;
  v_count integer;
  v_other_branch_change integer;
  v_rejected boolean;
BEGIN
  SELECT public.rxdb_entity_sync_info('rxdb_sql_regression', 'IdentityScopedRow') INTO v_info;
  PERFORM rxdb_sql_regression.assert_true(
    (v_info->>'bucketed')::boolean AND v_info->>'tableName' = 'identity_scoped_rows',
    'bucketed-read-sync: entity registry must expose the generated bucket column'
  );

  PERFORM pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM rxdb_sql_regression.assert_true(
    public.rxdb_caller_buckets() = ARRAY['public']::text[],
    'bucketed-read-sync: anon must only receive the public bucket'
  );
  SELECT public.rxdb_pull_bucket_snapshot(
    'rxdb_sql_regression', 'IdentityScopedRow', 'public', NULL, NULL, 100
  ) INTO v_snapshot;
  PERFORM rxdb_sql_regression.assert_true(
    v_snapshot @> '[{"id":"bucket-public"},{"id":"bucket-moved"}]'::jsonb
      AND NOT v_snapshot @> '[{"id":"bucket-a"}]'::jsonb,
    'bucketed-read-sync: anon snapshot must contain public rows only'
  );
  v_rejected := false;
  BEGIN
    PERFORM public.rxdb_pull_bucket_changes(
      0,
      100,
      'rxdb_sql_regression',
      'IdentityScopedRow',
      'user:' || user_a::text
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    v_rejected,
    'bucketed-read-sync: anon must be rejected from a private bucket log'
  );

  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', user_a),
    true
  );
  PERFORM rxdb_sql_regression.assert_true(
    public.rxdb_caller_buckets() = ARRAY['public', 'user:' || user_a::text]::text[],
    'bucketed-read-sync: user A must receive public and own buckets'
  );
  SELECT public.rxdb_pull_bucket_snapshot(
    'rxdb_sql_regression', 'IdentityScopedRow', 'user:' || user_a::text, NULL, NULL, 100
  ) INTO v_snapshot;
  PERFORM rxdb_sql_regression.assert_true(
    v_snapshot @> '[{"id":"bucket-a"}]'::jsonb
      AND NOT v_snapshot @> '[{"id":"bucket-b"}]'::jsonb,
    'bucketed-read-sync: user A snapshot must exclude user B'
  );
  PERFORM rxdb_sql_regression.seed_bucket_snapshot_interleaving();
  SELECT public.rxdb_bucket_snapshot_point(
    'rxdb_sql_regression', 'IdentityScopedRow', 'user:' || user_a::text
  ) INTO v_point;
  PERFORM rxdb_sql_regression.assert_true(
    v_point = (
      SELECT pg_catalog.max(id)::integer
      FROM public.rxdb_change
      WHERE namespace = 'rxdb_sql_regression'
        AND entity = 'IdentityScopedRow'
        AND bucket = 'user:' || user_a::text
    ),
    pg_catalog.format('bucketed-read-sync: snapshot point must be scoped to the requested bucket: %s', v_point)
  );

  SELECT public.rxdb_bucket_snapshot_point(
    'rxdb_sql_regression', 'IdentityScopedRow', 'public'
  ) INTO v_point;

  PERFORM rxdb_sql_regression.bucket_set_visibility('bucket-moved', 'private', user_b);

  SELECT count(*) INTO v_count
  FROM public.rxdb_pull_bucket_changes(
    v_point, 100, 'rxdb_sql_regression', 'IdentityScopedRow', 'public'
  ) AS change
  WHERE change."entityId" = 'bucket-moved'
    AND change.type = 'DELETE'
    AND change.patch IS NULL
    AND change."beforeData" IS NULL
    AND change."afterData" IS NULL;
  PERFORM rxdb_sql_regression.assert_true(
    v_count = 1,
    'bucketed-read-sync: leaving public must emit a content-free removal'
  );

  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', user_b),
    true
  );
  SELECT count(*) INTO v_count
  FROM public.rxdb_pull_bucket_changes(
    v_point, 100, 'rxdb_sql_regression', 'IdentityScopedRow', 'user:' || user_b::text
  ) AS change
  WHERE change."entityId" = 'bucket-moved'
    AND change.type = 'INSERT'
    AND change."afterData"->>'id' = 'bucket-moved';
  PERFORM rxdb_sql_regression.assert_true(
    v_count = 1,
    'bucketed-read-sync: entering a private bucket must emit the full row'
  );
  SELECT public.rxdb_pull_bucket_snapshot(
    'rxdb_sql_regression', 'IdentityScopedRow', 'user:' || user_b::text,
    '{"combinator":"and","rules":[{"field":"id","operator":"=","value":"bucket-moved"}]}'::jsonb,
    NULL, 100
  ) INTO v_snapshot;
  PERFORM rxdb_sql_regression.assert_true(
    v_snapshot @> '[{"id":"bucket-moved"}]'::jsonb
      AND NOT v_snapshot @> '[{"id":"bucket-b"}]'::jsonb,
    'bucketed-read-sync: filters must run inside the authorized bucket'
  );

  -- 快照翻页之间删掉已读过的一行：下一页从上一页最后一个 id 之后接着读，幸存行不能被挤掉
  PERFORM pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM rxdb_sql_regression.seed_bucket_keyset_rows();
  SELECT public.rxdb_pull_bucket_snapshot(
    'rxdb_sql_regression', 'IdentityScopedRow', 'public',
    '{"combinator":"and","rules":[{"field":"id","operator":"startsWith","value":"keyset-"}]}'::jsonb, NULL, 1
  ) INTO v_snapshot;
  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.jsonb_array_length(v_snapshot) = 1 AND v_snapshot @> '[{"id":"keyset-1"}]'::jsonb,
    pg_catalog.format('bucketed-read-sync: the first snapshot page must hold the lowest id: %s', v_snapshot)
  );
  PERFORM rxdb_sql_regression.delete_bucket_row('keyset-1');
  SELECT public.rxdb_pull_bucket_snapshot(
    'rxdb_sql_regression', 'IdentityScopedRow', 'public',
    '{"combinator":"and","rules":[{"field":"id","operator":"startsWith","value":"keyset-"}]}'::jsonb, 'keyset-1', 1
  ) INTO v_snapshot;
  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.jsonb_array_length(v_snapshot) = 1 AND v_snapshot @> '[{"id":"keyset-2"}]'::jsonb,
    pg_catalog.format('bucketed-read-sync: a deletion between pages must not skip the next survivor: %s', v_snapshot)
  );

  -- 水位只算调用方会拉的分支：别的分支写进同一个 bucket，不能让 main 的客户端永远「有更新」
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', user_a),
    true
  );
  v_other_branch_change := rxdb_sql_regression.seed_bucket_other_branch_change();
  SELECT public.rxdb_bucket_snapshot_point(
    'rxdb_sql_regression', 'IdentityScopedRow', 'user:' || user_a::text, ARRAY['main']
  ) INTO v_point;
  PERFORM rxdb_sql_regression.assert_true(
    v_point < v_other_branch_change,
    pg_catalog.format(
      'bucketed-read-sync: a change on another branch must not raise the main watermark: %s >= %s',
      v_point, v_other_branch_change
    )
  );
  SELECT public.rxdb_bucket_snapshot_point(
    'rxdb_sql_regression', 'IdentityScopedRow', 'user:' || user_a::text
  ) INTO v_point;
  PERFORM rxdb_sql_regression.assert_true(
    v_point = v_other_branch_change,
    pg_catalog.format(
      'bucketed-read-sync: without branches the watermark covers every branch: %s <> %s',
      v_point, v_other_branch_change
    )
  );
END;
$$;

-- 文档给业务表的分区 SELECT 策略（bucketed-documented-policy）：anon 只看到 public 区，
-- 用户 A 看到 public 区与自己的区，看不到用户 B 的区
CREATE FUNCTION rxdb_sql_regression.test_bucketed_documented_policy()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  user_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_ids text[];
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
  SELECT pg_catalog.array_agg(id ORDER BY id) INTO v_ids FROM rxdb_sql_regression.documented_bucket_rows;
  PERFORM rxdb_sql_regression.assert_true(
    v_ids = ARRAY['documented-public'],
    pg_catalog.format('bucketed-documented-policy: anon must only see the public row: %s', v_ids)
  );

  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', user_a),
    true
  );
  SELECT pg_catalog.array_agg(id ORDER BY id) INTO v_ids FROM rxdb_sql_regression.documented_bucket_rows;
  PERFORM rxdb_sql_regression.assert_true(
    v_ids = ARRAY['documented-a', 'documented-public'],
    pg_catalog.format('bucketed-documented-policy: user A must see the public row and own rows only: %s', v_ids)
  );
END;
$$;

-- US-033：按区读取的边界（bucketed-guards），以 anon 运行、按需切换声明的用户
CREATE FUNCTION rxdb_sql_regression.test_bucketed_guards()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  user_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  user_b constant uuid := '00000000-0000-4000-8000-0000000000b2';
  v_snapshot jsonb;
  v_count integer;
  v_rejected boolean;
  v_rls jsonb;
  v_call text;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);

  -- 可读列超过 50 个：快照与增量照常给出整行
  SELECT public.rxdb_pull_bucket_snapshot('rxdb_sql_regression', 'WideBucketRow', 'public', NULL, NULL, 10)
  INTO v_snapshot;
  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.jsonb_array_length(v_snapshot) = 1
      AND (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(v_snapshot->0)) = 62
      AND v_snapshot->0->>'wide_60' = 'last',
    'bucketed-guards: a table with more than 50 readable columns must still snapshot whole rows'
  );
  SELECT pg_catalog.count(*)::integer INTO v_count
  FROM public.rxdb_pull_bucket_changes(0, 10, 'rxdb_sql_regression', 'WideBucketRow', 'public') AS change
  WHERE change."entityId" = 'wide-1' AND change.type = 'INSERT' AND change."afterData"->>'wide_60' = 'last';
  PERFORM rxdb_sql_regression.assert_true(
    v_count = 1,
    'bucketed-guards: a table with more than 50 readable columns must still pull whole rows'
  );

  -- 列权限：正文只带调用者可读的列；按读不到的列筛选直接拒绝
  SELECT public.rxdb_pull_bucket_snapshot('rxdb_sql_regression', 'ColumnBucketRow', 'public', NULL, NULL, 10)
  INTO v_snapshot;
  PERFORM rxdb_sql_regression.assert_true(
    v_snapshot = '[{"id":"column-1","value":"visible","rxdb_bucket":"public"}]'::jsonb,
    pg_catalog.format('bucketed-guards: a snapshot must only carry columns the caller can read, got %s', v_snapshot)
  );
  SELECT pg_catalog.count(*)::integer INTO v_count
  FROM public.rxdb_pull_bucket_changes(0, 10, 'rxdb_sql_regression', 'ColumnBucketRow', 'public') AS change
  WHERE change."entityId" = 'column-1'
    AND change."afterData" = '{"id":"column-1","value":"visible","rxdb_bucket":"public"}'::jsonb;
  PERFORM rxdb_sql_regression.assert_true(
    v_count = 1,
    'bucketed-guards: a pulled change must only carry columns the caller can read'
  );
  v_rejected := false;
  BEGIN
    PERFORM public.rxdb_pull_bucket_snapshot(
      'rxdb_sql_regression', 'ColumnBucketRow', 'public',
      '{"combinator":"and","rules":[{"field":"secret","operator":"=","value":"hidden"}]}'::jsonb, NULL, 10
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    v_rejected,
    'bucketed-guards: filtering on a column the caller cannot read must be rejected'
  );

  -- 没有授权的分区：水位与快照同样拒绝（anon 读 A 的私有区，A 读 B 的私有区）
  FOREACH v_call IN ARRAY ARRAY['anon:point', 'anon:snapshot', 'user:point', 'user:snapshot']
  LOOP
    PERFORM pg_catalog.set_config(
      'request.jwt.claims',
      CASE
        WHEN v_call LIKE 'anon:%' THEN '{"role":"anon"}'
        ELSE pg_catalog.format('{"sub":"%s","role":"authenticated"}', user_a)
      END,
      true
    );
    v_rejected := false;
    BEGIN
      IF v_call LIKE '%:point' THEN
        PERFORM public.rxdb_bucket_snapshot_point(
          'rxdb_sql_regression', 'IdentityScopedRow',
          'user:' || (CASE WHEN v_call LIKE 'anon:%' THEN user_a ELSE user_b END)::text
        );
      ELSE
        PERFORM public.rxdb_pull_bucket_snapshot(
          'rxdb_sql_regression', 'IdentityScopedRow',
          'user:' || (CASE WHEN v_call LIKE 'anon:%' THEN user_a ELSE user_b END)::text, NULL, NULL, 10
        );
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_rejected := true;
    END;
    PERFORM rxdb_sql_regression.assert_true(
      v_rejected,
      pg_catalog.format('bucketed-guards: %s on an unauthorized bucket must be rejected', v_call)
    );
  END LOOP;

  -- 规则值是 null：比较不成立，与核心的 isEntityMatchWhere 一致
  PERFORM rxdb_sql_regression.assert_true(
    NOT public.rxdb_jsonb_matches_filter(
      '{"value":1}'::jsonb, '{"combinator":"and","rules":[{"field":"value","operator":"<","value":null}]}'::jsonb
    )
      AND NOT public.rxdb_jsonb_matches_filter(
        '{"value":"m"}'::jsonb,
        '{"combinator":"and","rules":[{"field":"value","operator":"between","value":[null,"z"]}]}'::jsonb
      ),
    'bucketed-guards: a comparison against a null rule value must not match'
  );

  -- RLS 自检认得出视图：存在、标明是视图；只有 security_invoker 视图沿用调用者的 RLS（选项值按布尔解析，on 也算）
  SELECT public.rxdb_check_rls(
    '[{"schema":"rxdb_sql_regression","table":"bucket_rows_view"},
      {"schema":"rxdb_sql_regression","table":"bucket_rows_invoker_view"},
      {"schema":"rxdb_sql_regression","table":"identity_scoped_rows"}]'::jsonb
  ) INTO v_rls;
  PERFORM rxdb_sql_regression.assert_true(
    (v_rls->0->>'exists')::boolean AND v_rls->0->>'relationKind' = 'view'
      AND v_rls->0->'securityInvoker' = 'false'::jsonb
      AND v_rls->1->>'relationKind' = 'view' AND v_rls->1->'securityInvoker' = 'true'::jsonb
      AND v_rls->2->>'relationKind' = 'table' AND v_rls->2->'securityInvoker' = 'false'::jsonb,
    pg_catalog.format('bucketed-guards: the RLS self-check must tell plain views from security_invoker views, got %s', v_rls)
  );
END;
$$;

-- US-033：分区日志不带正文、旧实体转成分区实体时清掉历史（bucketed-guards），以属主运行
CREATE FUNCTION rxdb_sql_regression.test_bucketed_guards_owner()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_info jsonb;
BEGIN
  -- 触发器与推送写下的分区日志都不带正文；维护脚本绕过它们直写正文也会被清掉
  INSERT INTO public.rxdb_change (
    namespace, entity, bucket, "entityId", type, patch, "inversePatch", "beforeData", "afterData",
    "snapshotComplete", "clientId"
  ) VALUES (
    'rxdb_sql_regression', 'IdentityScopedRow', 'public', 'direct-payload', 'UPDATE',
    '{"secret":1}', '{"secret":0}', '{"secret":0}', '{"secret":1}', true, 'sql-direct-payload'
  );
  SELECT pg_catalog.count(*)::integer INTO v_count
  FROM public.rxdb_change
  WHERE bucket IS NOT NULL
    AND (patch IS NOT NULL OR "inversePatch" IS NOT NULL OR "beforeData" IS NOT NULL OR "afterData" IS NOT NULL
      OR "snapshotComplete");
  PERFORM rxdb_sql_regression.assert_true(
    v_count = 0,
    pg_catalog.format('bucketed-guards: bucketed change log rows must never keep a payload, found %s', v_count)
  );

  -- 旧实体转成分区实体：登记时删掉它全部带正文的未分区历史日志，之后只记不带正文的分区日志
  SELECT pg_catalog.count(*)::integer INTO v_count
  FROM public.rxdb_change
  WHERE namespace = 'rxdb_sql_regression' AND entity = 'LegacyBucketRow' AND "afterData" IS NOT NULL;
  PERFORM rxdb_sql_regression.assert_true(
    v_count > 0,
    'bucketed-guards: the legacy entity must start with full-payload history'
  );
  ALTER TABLE rxdb_sql_regression.legacy_bucket_rows
    ADD COLUMN rxdb_bucket text GENERATED ALWAYS AS ('public') STORED;
  PERFORM public.rxdb_enable_sync_for_table('legacy_bucket_rows', 'rxdb_sql_regression', 'LegacyBucketRow');
  SELECT pg_catalog.count(*)::integer INTO v_count
  FROM public.rxdb_change
  WHERE namespace = 'rxdb_sql_regression' AND entity = 'LegacyBucketRow';
  SELECT public.rxdb_entity_sync_info('rxdb_sql_regression', 'LegacyBucketRow') INTO v_info;
  PERFORM rxdb_sql_regression.assert_true(
    v_count = 0 AND (v_info->>'bucketed')::boolean,
    pg_catalog.format('bucketed-guards: converting to a bucketed entity must drop its history, %s rows left', v_count)
  );
  UPDATE rxdb_sql_regression.legacy_bucket_rows SET value = 'after conversion' WHERE id = 'legacy-1';
  SELECT pg_catalog.count(*)::integer INTO v_count
  FROM public.rxdb_change
  WHERE namespace = 'rxdb_sql_regression' AND entity = 'LegacyBucketRow'
    AND bucket = 'public' AND patch IS NULL AND "afterData" IS NULL;
  PERFORM rxdb_sql_regression.assert_true(
    v_count = 1,
    'bucketed-guards: writes after the conversion must be logged as payload-free bucket changes'
  );
END;
$$;

-- US-033：推送写分区日志时 bucket 只认服务端状态（bucketed-push）
CREATE FUNCTION rxdb_sql_regression.test_bucketed_push()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  user_a_bucket constant text := 'user:00000000-0000-4000-8000-0000000000a1';
  user_b_bucket constant text := 'user:00000000-0000-4000-8000-0000000000b2';
  v_rejected boolean := false;
  v_since integer;
  v_move jsonb;
  v_log jsonb;
  v_count integer;
  v_probe text;
  v_state text;
  v_states text[] := '{}'::text[];
BEGIN
  PERFORM rxdb_sql_regression.clear_change_log(ARRAY['sql-bucketed-push', 'sql-bucketed-push-probe']);

  -- 分区表不在 public schema：按 namespace 找到业务表回读 bucket；载荷里的 bucket 字段不认
  PERFORM public.rxdb_mutations(
    p_updates => '[{"schema":"rxdb_sql_regression","table":"bucket_push_rows","data":[{"id":"push-a","value":"changed"}]}]'::jsonb,
    p_changes => pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'namespace', 'rxdb_sql_regression', 'entity', 'BucketPushRow',
      'schema', 'rxdb_sql_regression', 'table', 'bucket_push_rows',
      'entityId', 'push-a', 'type', 'UPDATE',
      'patch', '{"value":"changed"}'::jsonb, 'inversePatch', '{"value":"a-value"}'::jsonb,
      'bucket', user_b_bucket, 'branchId', 'main', 'clientId', 'sql-bucketed-push', 'localId', 810001
    )),
    p_skip_sync => true
  );
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.logged_bucket('sql-bucketed-push', 810001) IS NOT DISTINCT FROM user_a_bucket,
    pg_catalog.format(
      'bucketed-push: a main push must log the bucket of the written row, got %s',
      rxdb_sql_regression.logged_bucket('sql-bucketed-push', 810001)
    )
  );

  -- 非 main 推送不经业务表 RLS：快照里的 bucket 不是调用者可读的分区就整批拒绝
  BEGIN
    PERFORM public.rxdb_mutations(
      p_changes => pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'namespace', 'rxdb_sql_regression', 'entity', 'BucketPushRow',
        'schema', 'rxdb_sql_regression', 'table', 'bucket_push_rows',
        'entityId', 'push-forged', 'type', 'DELETE',
        'inversePatch', pg_catalog.jsonb_build_object('id', 'push-forged', 'rxdb_bucket', user_b_bucket),
        'branchId', 'sql-bucketed-push-branch', 'clientId', 'sql-bucketed-push', 'localId', 810002
      )),
      p_skip_sync => true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    v_rejected AND rxdb_sql_regression.logged_bucket('sql-bucketed-push', 810002) IS NULL,
    'bucketed-push: a non-main change must not be logged into a bucket the caller cannot read'
  );

  -- 调用者可读的分区照常写入；未分区实体的日志不带载荷里的 bucket
  PERFORM public.rxdb_mutations(
    p_changes => pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'namespace', 'rxdb_sql_regression', 'entity', 'BucketPushRow',
        'schema', 'rxdb_sql_regression', 'table', 'bucket_push_rows',
        'entityId', 'push-a', 'type', 'UPDATE', 'patch', '{"value":"on-branch"}'::jsonb,
        'branchId', 'sql-bucketed-push-branch', 'clientId', 'sql-bucketed-push', 'localId', 810003
      ),
      pg_catalog.jsonb_build_object(
        'namespace', 'rxdb_sql_regression', 'entity', 'PushOpen',
        'schema', 'rxdb_sql_regression', 'table', 'push_open_ids',
        'entityId', 'push-unbucketed', 'type', 'INSERT', 'patch', '{"id":"push-unbucketed","value":"x"}'::jsonb,
        'bucket', user_b_bucket, 'branchId', 'sql-bucketed-push-branch', 'clientId', 'sql-bucketed-push', 'localId', 810004
      )
    ),
    p_skip_sync => true
  );
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.logged_bucket('sql-bucketed-push', 810003) IS NOT DISTINCT FROM user_a_bucket
      AND rxdb_sql_regression.logged_change_count('sql-bucketed-push') = 3
      AND rxdb_sql_regression.logged_bucket('sql-bucketed-push', 810004) IS NULL,
    'bucketed-push: readable buckets must be logged and unbucketed entities must not carry a payload bucket'
  );

  -- 推送把行换到另一个区：旧区先记一条不带内容的移除，本条在新区记成写入（与触发器同口径）
  v_since := rxdb_sql_regression.current_change_id();
  v_move := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'namespace', 'rxdb_sql_regression', 'entity', 'BucketPushRow',
    'schema', 'rxdb_sql_regression', 'table', 'bucket_push_rows',
    'entityId', 'push-a', 'type', 'UPDATE',
    'patch', '{"visibility":"public"}'::jsonb, 'inversePatch', '{"visibility":"private"}'::jsonb,
    'branchId', 'main', 'clientId', 'sql-bucketed-push', 'localId', 810005
  ));
  PERFORM public.rxdb_mutations(
    p_updates => '[{"schema":"rxdb_sql_regression","table":"bucket_push_rows","data":[{"id":"push-a","visibility":"public"}]}]'::jsonb,
    p_changes => v_move,
    p_skip_sync => true
  );
  v_log := rxdb_sql_regression.bucket_push_log_since(v_since);
  PERFORM rxdb_sql_regression.assert_true(
    v_log = pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_array('DELETE', user_a_bucket, NULL, NULL),
      pg_catalog.jsonb_build_array('INSERT', 'public', 'sql-bucketed-push', 810005)
    ),
    pg_catalog.format('bucketed-push: a pushed bucket move must log a removal in the old bucket first, got %s', v_log)
  );
  SELECT pg_catalog.count(*)::integer INTO v_count
  FROM public.rxdb_pull_bucket_changes(v_since, 10, 'rxdb_sql_regression', 'BucketPushRow', user_a_bucket) AS change
  WHERE change."entityId" = 'push-a' AND change.type = 'DELETE' AND change."afterData" IS NULL;
  PERFORM rxdb_sql_regression.assert_true(
    v_count = 1,
    'bucketed-push: the old bucket must pull a content-free removal of the moved row'
  );
  SELECT pg_catalog.count(*)::integer INTO v_count
  FROM public.rxdb_pull_bucket_changes(v_since, 10, 'rxdb_sql_regression', 'BucketPushRow', 'public') AS change
  WHERE change."entityId" = 'push-a' AND change.type = 'INSERT' AND change."afterData"->>'visibility' = 'public';
  PERFORM rxdb_sql_regression.assert_true(
    v_count = 1,
    'bucketed-push: the new bucket must pull the moved row as an insert with its content'
  );

  -- 原样重放同一次推送（网络重试）：业务写之前读到的已经是新区，不再补第二条移除
  PERFORM public.rxdb_mutations(
    p_updates => '[{"schema":"rxdb_sql_regression","table":"bucket_push_rows","data":[{"id":"push-a","visibility":"public"}]}]'::jsonb,
    p_changes => v_move,
    p_skip_sync => true
  );
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.bucket_push_log_since(v_since) = v_log,
    pg_catalog.format(
      'bucketed-push: replaying a move must not log another removal, got %s',
      rxdb_sql_regression.bucket_push_log_since(v_since)
    )
  );

  -- 非 main 推送不以 definer 回读业务行：调用者看不见的行（B 的区里）与不存在的行报同一个错，
  -- 否则拿一个自己认领的分支就能逐个探测别人分区里有哪些 id
  FOR v_probe IN SELECT unnest(ARRAY['push-b', 'push-missing'])
  LOOP
    v_state := NULL;
    BEGIN
      PERFORM public.rxdb_mutations(
        p_changes => pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'namespace', 'rxdb_sql_regression', 'entity', 'BucketPushRow',
          'schema', 'rxdb_sql_regression', 'table', 'bucket_push_rows',
          'entityId', v_probe, 'type', 'UPDATE', 'patch', '{"value":"probe"}'::jsonb,
          'branchId', 'sql-bucketed-push-branch', 'clientId', 'sql-bucketed-push-probe', 'localId', 810100
        )),
        p_skip_sync => true
      );
    EXCEPTION
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    END;
    v_states := v_states || v_state;
  END LOOP;
  PERFORM rxdb_sql_regression.assert_true(
    v_states = ARRAY['23502', '23502'],
    pg_catalog.format('bucketed-push: a hidden row and a missing row must fail alike on a branch push, got %s', v_states)
  );

  -- uuid 主键：entityId 转不成 uuid 的非 main 推送整批拒绝（拉取按 uuid 找当前行，坏值会让整页拉取失败）
  v_rejected := false;
  BEGIN
    PERFORM public.rxdb_mutations(
      p_changes => pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'namespace', 'rxdb_sql_regression', 'entity', 'UuidBucketRow',
        'schema', 'rxdb_sql_regression', 'table', 'uuid_bucket_rows',
        'entityId', 'not-a-uuid', 'type', 'INSERT',
        'patch', pg_catalog.jsonb_build_object('id', 'not-a-uuid', 'value', 'x', 'rxdb_bucket', user_a_bucket),
        'branchId', 'sql-bucketed-push-branch', 'clientId', 'sql-bucketed-push', 'localId', 810007
      )),
      p_skip_sync => true
    );
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_rejected := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    v_rejected AND rxdb_sql_regression.logged_bucket('sql-bucketed-push', 810007) IS NULL,
    'bucketed-push: a branch change whose entityId does not fit the id column must be rejected'
  );

  -- 同一个 uuid 的另一种写法（大写）：按 uuid 比较仍是同一行，拉取拿到写入，不会被当成已删除
  v_since := rxdb_sql_regression.current_change_id();
  PERFORM public.rxdb_mutations(
    p_updates => '[{"schema":"rxdb_sql_regression","table":"uuid_bucket_rows","data":[{"id":"0A5E0000-0000-4000-8000-0000000000AA","value":"upper"}]}]'::jsonb,
    p_changes => '[{"namespace":"rxdb_sql_regression","entity":"UuidBucketRow","schema":"rxdb_sql_regression","table":"uuid_bucket_rows","entityId":"0A5E0000-0000-4000-8000-0000000000AA","type":"UPDATE","patch":{"value":"upper"},"inversePatch":{"value":"uuid-value"},"branchId":"main","clientId":"sql-bucketed-push","localId":810006}]'::jsonb,
    p_skip_sync => true
  );
  SELECT pg_catalog.count(*)::integer INTO v_count
  FROM public.rxdb_pull_bucket_changes(v_since, 10, 'rxdb_sql_regression', 'UuidBucketRow', user_a_bucket) AS change
  WHERE change.type = 'UPDATE' AND change."afterData"->>'value' = 'upper';
  PERFORM rxdb_sql_regression.assert_true(
    v_count = 1,
    'bucketed-push: a pushed uuid in another spelling must still resolve to its current row when pulled'
  );
END;
$$;

-- US-225 AC#16：生产权限脚本执行两次之后，权限、策略与触发器都只有一份且仍然生效
CREATE FUNCTION rxdb_sql_regression.test_production_grants_idempotent()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM rxdb_sql_regression.assert_true(
    (
      SELECT pg_catalog.count(*) FROM pg_catalog.pg_policies
      WHERE schemaname = 'realtime' AND tablename = 'messages' AND policyname = 'rxdb_changes_receive'
    ) = 1,
    'production-grants-idempotent: the realtime receive policy must exist exactly once'
  );
  PERFORM rxdb_sql_regression.assert_true(
    (
      SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger
      WHERE tgrelid = 'public.rxdb_change'::regclass AND tgname = 'rxdb_change_broadcast'
    ) = 1,
    'production-grants-idempotent: the broadcast trigger must exist exactly once'
  );
  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.has_table_privilege('anon', 'public.rxdb_change', 'SELECT')
      AND pg_catalog.has_table_privilege('authenticated', 'public.rxdb_change', 'SELECT')
      AND NOT pg_catalog.has_table_privilege('authenticated', 'public.rxdb_branch', 'INSERT')
      AND NOT pg_catalog.has_table_privilege('authenticated', 'public.rxdb_branch_owner', 'SELECT'),
    'production-grants-idempotent: table privileges must match the production model'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT pg_catalog.has_function_privilege('anon', 'public.rxdb_mutations(jsonb, jsonb, jsonb, boolean, jsonb, boolean, jsonb)', 'EXECUTE')
      AND pg_catalog.has_function_privilege('authenticated', 'public.rxdb_mutations(jsonb, jsonb, jsonb, boolean, jsonb, boolean, jsonb)', 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon', 'public.rxdb_assert_push_integrity(jsonb, jsonb, jsonb, boolean, jsonb)', 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', 'public.rxdb_claim_branch(text)', 'EXECUTE')
      AND pg_catalog.has_function_privilege('anon', 'public.rxdb_server_version()', 'EXECUTE')
      AND pg_catalog.has_function_privilege('anon', 'public.rxdb_backend_id()', 'EXECUTE')
      AND pg_catalog.has_function_privilege('anon', 'public.rxdb_check_rls(jsonb)', 'EXECUTE'),
    'production-grants-idempotent: function privileges must match the production model'
  );
END;
$$;

-- US-225 AC#20：迁移指南第 3 步。以管理员身份列出没有所有者的旧分支，再按核实过的分支 ID 补登所有者。
-- 列表与 rxdb_claim_branch 判「旧分支」的口径一致：登记过，或写过日志（只随推送上行、从未登记的祖先分支）
CREATE FUNCTION rxdb_sql_regression.backfill_legacy_branch_owners()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_unowned text[];
BEGIN
  SELECT pg_catalog.array_agg(branch."branchId" ORDER BY branch."branchId")
  INTO v_unowned
  FROM (
    SELECT id AS "branchId" FROM public.rxdb_branch
    UNION
    SELECT "branchId" FROM public.rxdb_change
  ) AS branch
  WHERE branch."branchId" <> 'main'
    AND NOT EXISTS (
      SELECT 1 FROM public.rxdb_branch_owner AS owner WHERE owner."branchId" = branch."branchId"
    );
  PERFORM rxdb_sql_regression.assert_true(
    v_unowned @> ARRAY['sql-owner-legacy-logged', 'sql-owner-legacy-registered'],
    pg_catalog.format('branch-ownership: the unowned-branch query must list registered and log-only legacy branches: %s', v_unowned)
  );

  INSERT INTO public.rxdb_branch_owner ("branchId", "ownerId")
  VALUES
    ('sql-owner-legacy-registered', '00000000-0000-4000-8000-0000000000a1'),
    ('sql-owner-legacy-logged', '00000000-0000-4000-8000-0000000000a1')
  ON CONFLICT ("branchId") DO NOTHING;
END;
$$;

-- US-225 AC#20：补登之后两类旧分支都只有指定的所有者能写（以 authenticated 身份执行）
CREATE FUNCTION rxdb_sql_regression.test_branch_owner_backfill()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  user_a constant text := '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
  user_b constant text := '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}';
  denied text[] := '{}';
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claims', user_a, true);
  PERFORM public.rxdb_enable_sync_for_branch('[{"id":"sql-owner-legacy-registered","parentId":"main"}]'::jsonb);
  PERFORM public.rxdb_mutations(
    p_changes => pg_catalog.jsonb_build_array(
      rxdb_sql_regression.push_log('owner-backfill-logged', 'INSERT', 891101, 'sql-owner-legacy-logged'),
      rxdb_sql_regression.push_log('owner-backfill-registered', 'INSERT', 891102, 'sql-owner-legacy-registered')
    ),
    p_skip_sync => true
  );

  PERFORM pg_catalog.set_config('request.jwt.claims', user_b, true);
  BEGIN
    PERFORM public.rxdb_mutations(
      p_changes => pg_catalog.jsonb_build_array(
        rxdb_sql_regression.push_log('owner-backfill-b-logged', 'INSERT', 891103, 'sql-owner-legacy-logged')
      ),
      p_skip_sync => true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'b push logged'::text;
  END;
  BEGIN
    PERFORM public.rxdb_mutations(
      p_changes => pg_catalog.jsonb_build_array(
        rxdb_sql_regression.push_log('owner-backfill-b-registered', 'INSERT', 891104, 'sql-owner-legacy-registered')
      ),
      p_skip_sync => true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'b push registered'::text;
  END;
  BEGIN
    PERFORM public.rxdb_enable_sync_for_branch('[{"id":"sql-owner-legacy-registered","parentId":"main"}]'::jsonb);
  EXCEPTION
    WHEN insufficient_privilege THEN denied := denied || 'b register registered'::text;
  END;

  PERFORM rxdb_sql_regression.assert_true(
    denied = ARRAY['b push logged', 'b push registered', 'b register registered'],
    pg_catalog.format('branch-ownership: backfilled legacy branches must stay closed to other users, denied: %s', denied)
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM public.rxdb_pull_changes(0, 1000, 'rxdb_sql_regression', 'PushOpen', 'sql-owner-legacy-logged')) = 2
      AND (SELECT pg_catalog.count(*) FROM public.rxdb_pull_changes(0, 1000, 'rxdb_sql_regression', 'PushOpen', 'sql-owner-legacy-registered')) = 1,
    'branch-ownership: only the backfilled owner''s pushes may land in the legacy branches'
  );
END;
$$;

-- US-225 AC#18 的业务表：权限、列权限、行级安全开关与策略，升级前后逐项比对
-- 远端变更历史（change-history，US-229）：以属主身份读历史表——被测调用方对它没有任何直接权限
-- 列写明、不返回表的行类型：返回行类型会让函数依赖历史表，sync-access-upgrade 退回升级前的样子时删不掉它
CREATE FUNCTION rxdb_sql_regression.history_of(p_entity text, p_entity_id text)
RETURNS TABLE (
  id bigint, "changeId" integer, "entityId" text, bucket text, type text, patch jsonb, "inversePatch" jsonb,
  "beforeData" jsonb, "afterData" jsonb, actor uuid, role text, source text, "clientId" text, "localId" integer,
  "branchId" text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT history.id, history."changeId", history."entityId", history.bucket, history.type, history.patch,
    history."inversePatch", history."beforeData", history."afterData", history.actor, history.role, history.source,
    history."clientId", history."localId", history."branchId"
  FROM public.rxdb_change_history AS history
  WHERE history.namespace = 'rxdb_sql_regression' AND history.entity = p_entity AND history."entityId" = p_entity_id
  ORDER BY history.id
$$;

-- 以属主身份写：被测调用方的 RLS 只放行自己的行，换所有者、替别人建行都要绕过它（同步触发器照常记历史）
CREATE FUNCTION rxdb_sql_regression.history_write_owned(p_id text, p_owner uuid, p_value text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO rxdb_sql_regression.history_owned_rows (id, owner_id, value)
  VALUES (p_id, p_owner, p_value)
  ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, value = EXCLUDED.value
$$;

CREATE FUNCTION rxdb_sql_regression.history_caller(p_user uuid)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.set_config(
    'request.jwt.claims', pg_catalog.jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true
  )
$$;

CREATE FUNCTION rxdb_sql_regression.history_visible(p_entity text, p_entity_id text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(pg_catalog.array_agg(visible.type || ':' || visible.source ORDER BY visible.id), '{}'::text[])
  FROM public.rxdb_entity_history('rxdb_sql_regression', p_entity, p_entity_id) AS visible
$$;

-- 推送一个实体的一条变更：业务写与它的源日志一一配对
CREATE FUNCTION rxdb_sql_regression.history_push(
  p_table text,
  p_entity text,
  p_type text,
  p_row jsonb,
  p_local_id integer,
  p_receipts boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.rxdb_mutations(
    p_upserts => CASE WHEN p_type = 'INSERT' THEN pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'schema', 'rxdb_sql_regression', 'table', p_table, 'data', pg_catalog.jsonb_build_array(p_row)
    )) ELSE '[]'::jsonb END,
    p_updates => CASE WHEN p_type = 'UPDATE' THEN pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'schema', 'rxdb_sql_regression', 'table', p_table, 'data', pg_catalog.jsonb_build_array(p_row)
    )) ELSE '[]'::jsonb END,
    p_deletes => CASE WHEN p_type = 'DELETE' THEN pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'schema', 'rxdb_sql_regression', 'table', p_table, 'ids', pg_catalog.jsonb_build_array(p_row->>'id')
    )) ELSE '[]'::jsonb END,
    p_changes => pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'namespace', 'rxdb_sql_regression', 'entity', p_entity, 'schema', 'rxdb_sql_regression', 'table', p_table,
      'entityId', p_row->>'id', 'type', p_type,
      'patch', CASE WHEN p_type = 'DELETE' THEN NULL ELSE p_row - 'id' END,
      'branchId', 'main', 'clientId', 'sql-history-push', 'localId', p_local_id,
      'rxdbHistorySource', 'cascade'
    )),
    p_skip_sync => true,
    p_receipts => p_receipts
  )
$$;

CREATE FUNCTION rxdb_sql_regression.test_change_history()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  user_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  user_b constant uuid := '00000000-0000-4000-8000-0000000000b2';
  v_history record;
  v_result jsonb;
  v_count integer;
  v_rejected boolean := false;
BEGIN
  -- 整个回归在一个事务里（test_case = all）：前面 p_skip_sync = true 的用例可能已把 rxdb.sync_enabled 置为 'false'
  PERFORM pg_catalog.set_config('rxdb.sync_enabled', 'true', true);
  PERFORM rxdb_sql_regression.history_caller(user_a);

  -- AC#1 直写：完整前后快照、patch、操作者、来源与当时所在的区；AC#6 分区日志照旧不带正文
  INSERT INTO rxdb_sql_regression.history_owned_rows (id, owner_id, value) VALUES ('hist-a', user_a, 'v1');
  UPDATE rxdb_sql_regression.history_owned_rows SET value = 'v2' WHERE id = 'hist-a';
  SELECT * INTO v_history FROM rxdb_sql_regression.history_of('HistoryOwnedRow', 'hist-a') AS history
  WHERE history.type = 'UPDATE';
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.array_agg(history.type || ':' || history.source ORDER BY history.id)
      FROM rxdb_sql_regression.history_of('HistoryOwnedRow', 'hist-a') AS history) = ARRAY['INSERT:trigger', 'UPDATE:trigger']
      AND v_history.actor = user_a AND v_history.role = 'authenticated'
      AND v_history.bucket = 'user:' || user_a::text AND v_history."branchId" = 'main'
      AND v_history.patch = '{"value":"v2"}'::jsonb AND v_history."inversePatch" = '{"value":"v1"}'::jsonb
      AND v_history."beforeData"->>'value' = 'v1' AND v_history."afterData"->>'value' = 'v2'
      AND v_history."afterData"->>'rxdb_bucket' = 'user:' || user_a::text
      AND v_history."changeId" = (
        SELECT change.id FROM public.rxdb_change AS change
        WHERE change.entity = 'HistoryOwnedRow' AND change."entityId" = 'hist-a' AND change.type = 'UPDATE'
      ),
    pg_catalog.format('change-history: a direct write must record a complete trigger history, got %s', pg_catalog.to_jsonb(v_history))
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (
      SELECT 1 FROM public.rxdb_change AS change
      WHERE change.entity = 'HistoryOwnedRow' AND change."entityId" = 'hist-a'
        AND (change.patch IS NOT NULL OR change."inversePatch" IS NOT NULL
          OR change."beforeData" IS NOT NULL OR change."afterData" IS NOT NULL)
    ),
    'change-history: the bucketed change log must still carry no body'
  );

  -- AC#5 未分区表的直写同样记历史；AC#6 未分区日志照旧带正文
  INSERT INTO rxdb_sql_regression.history_parents (id, value) VALUES ('hist-parent-t', 'p');
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM rxdb_sql_regression.history_of('HistoryParent', 'hist-parent-t') AS history
      WHERE history.type = 'INSERT' AND history.source = 'trigger' AND history.bucket IS NULL
        AND history."afterData"->>'value' = 'p') = 1
      AND EXISTS (
        SELECT 1 FROM public.rxdb_change AS change
        WHERE change.entity = 'HistoryParent' AND change."entityId" = 'hist-parent-t' AND change.patch->>'value' = 'p'
      ),
    'change-history: an unbucketed direct write must record history and keep its change log body'
  );

  -- AC#2 推送新增、修改、删除：每个生效的实体一条历史，来源为推送，带 clientId / localId 与完整快照。
  -- 载荷里伪造的 rxdbHistorySource 不认
  PERFORM rxdb_sql_regression.history_write_owned('hist-pushed-update', user_a, 'old');
  PERFORM rxdb_sql_regression.history_write_owned('hist-pushed-delete', user_a, 'gone');
  PERFORM rxdb_sql_regression.history_push(
    'history_owned_rows', 'HistoryOwnedRow', 'INSERT',
    pg_catalog.jsonb_build_object('id', 'hist-pushed-insert', 'owner_id', user_a, 'visibility', 'private', 'value', 'new'),
    870001
  );
  PERFORM rxdb_sql_regression.history_push(
    'history_owned_rows', 'HistoryOwnedRow', 'UPDATE', '{"id":"hist-pushed-update","value":"changed"}'::jsonb, 870002
  );
  PERFORM rxdb_sql_regression.history_push(
    'history_owned_rows', 'HistoryOwnedRow', 'DELETE', '{"id":"hist-pushed-delete"}'::jsonb, 870003
  );
  -- 重放同一批：日志按 (clientId, localId) 去重，历史也不重复
  PERFORM rxdb_sql_regression.history_push(
    'history_owned_rows', 'HistoryOwnedRow', 'UPDATE', '{"id":"hist-pushed-update","value":"changed"}'::jsonb, 870002
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.count(*) FROM rxdb_sql_regression.history_of('HistoryOwnedRow', 'hist-pushed-insert') AS history
      WHERE history.source = 'push' AND history.type = 'INSERT' AND history."clientId" = 'sql-history-push'
        AND history."localId" = 870001 AND history.actor = user_a AND history."beforeData" IS NULL
        AND history."afterData"->>'value' = 'new' AND history."changeId" IS NOT NULL) = 1
      AND (SELECT pg_catalog.count(*) FROM rxdb_sql_regression.history_of('HistoryOwnedRow', 'hist-pushed-update') AS history
        WHERE history.source = 'push' AND history.type = 'UPDATE' AND history."localId" = 870002
          AND history."beforeData"->>'value' = 'old' AND history."afterData"->>'value' = 'changed'
          AND history.patch = '{"value":"changed"}'::jsonb) = 1
      AND (SELECT pg_catalog.count(*) FROM rxdb_sql_regression.history_of('HistoryOwnedRow', 'hist-pushed-delete') AS history
        WHERE history.source = 'push' AND history.type = 'DELETE' AND history."localId" = 870003
          AND history."beforeData"->>'value' = 'gone' AND history."afterData" IS NULL) = 1,
    'change-history: each applied pushed entity must record exactly one complete push history'
  );

  -- AC#4 被 RLS 拒绝的实体没有历史，同批生效的照常记录
  PERFORM rxdb_sql_regression.history_write_owned('hist-denied', user_b, 'b-value');
  v_result := public.rxdb_mutations(
    p_updates => '[{"schema":"rxdb_sql_regression","table":"history_owned_rows","data":[{"id":"hist-denied","value":"stolen"},{"id":"hist-pushed-update","value":"again"}]}]'::jsonb,
    p_changes => pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'namespace', 'rxdb_sql_regression', 'entity', 'HistoryOwnedRow', 'schema', 'rxdb_sql_regression',
        'table', 'history_owned_rows', 'entityId', 'hist-denied', 'type', 'UPDATE', 'patch', '{"value":"stolen"}'::jsonb,
        'branchId', 'main', 'clientId', 'sql-history-push', 'localId', 870011
      ),
      pg_catalog.jsonb_build_object(
        'namespace', 'rxdb_sql_regression', 'entity', 'HistoryOwnedRow', 'schema', 'rxdb_sql_regression',
        'table', 'history_owned_rows', 'entityId', 'hist-pushed-update', 'type', 'UPDATE', 'patch', '{"value":"again"}'::jsonb,
        'branchId', 'main', 'clientId', 'sql-history-push', 'localId', 870012
      )
    ),
    p_skip_sync => true,
    p_receipts => true
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (
      SELECT 1 FROM rxdb_sql_regression.history_of('HistoryOwnedRow', 'hist-denied') AS history WHERE history.source = 'push'
    )
      AND EXISTS (
        SELECT 1 FROM rxdb_sql_regression.history_of('HistoryOwnedRow', 'hist-pushed-update') AS history
        WHERE history.source = 'push' AND history."localId" = 870012 AND history."afterData"->>'value' = 'again'
      ),
    pg_catalog.format('change-history: a rejected entity must leave no history, got %s', v_result)
  );

  -- AC#3 推送只删父行：被级联删除的子行各有一条历史，来源为服务端级联
  INSERT INTO rxdb_sql_regression.history_parents (id, value) VALUES ('hist-parent-c', 'p');
  INSERT INTO rxdb_sql_regression.history_children (id, "parentId", value)
  VALUES ('hist-child-1', 'hist-parent-c', 'c1'), ('hist-child-2', 'hist-parent-c', 'c2');
  PERFORM rxdb_sql_regression.history_push(
    'history_parents', 'HistoryParent', 'DELETE', '{"id":"hist-parent-c"}'::jsonb, 870021
  );
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (
      SELECT 1 FROM rxdb_sql_regression.history_of('HistoryParent', 'hist-parent-c') AS history
      WHERE history.source = 'push' AND history.type = 'DELETE' AND history."beforeData"->>'value' = 'p'
    )
      AND (SELECT pg_catalog.count(*)
        FROM pg_catalog.unnest(ARRAY['hist-child-1', 'hist-child-2']) AS child(id)
        CROSS JOIN LATERAL rxdb_sql_regression.history_of('HistoryChild', child.id) AS history
        WHERE history.source = 'cascade' AND history.type = 'DELETE' AND history."clientId" IS NULL
          AND history.actor = user_a AND history."beforeData"->>'parentId' = 'hist-parent-c'
          AND history."afterData" IS NULL) = 2,
    'change-history: children deleted by a pushed parent delete must each record a cascade history'
  );

  -- 读取 RPC。AC#9（平台默认判定）：能编辑这一行的调用者读得到它的全部历史
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.history_visible('HistoryOwnedRow', 'hist-a') = ARRAY['INSERT:trigger', 'UPDATE:trigger'],
    'change-history: the owner must read the full history of a row it can edit'
  );
  -- AC#8 不能编辑的调用者一条都读不到
  PERFORM rxdb_sql_regression.history_caller(user_b);
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.history_visible('HistoryOwnedRow', 'hist-a') = '{}'::text[],
    'change-history: a caller who cannot edit the row must read no history'
  );

  -- AC#11 换给 B 之后：换之前的历史只对 A 可见，换区那一次与之后的只对 B 可见
  PERFORM rxdb_sql_regression.history_caller(user_a);
  PERFORM rxdb_sql_regression.history_write_owned('hist-a', user_b, 'v3');
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.history_visible('HistoryOwnedRow', 'hist-a') = ARRAY['INSERT:trigger', 'UPDATE:trigger'],
    'change-history: history recorded before the move must stay with the previous owner'
  );
  PERFORM rxdb_sql_regression.history_caller(user_b);
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.history_visible('HistoryOwnedRow', 'hist-a') = ARRAY['UPDATE:trigger'],
    'change-history: the move itself must be visible to the new owner only'
  );

  -- AC#12 删掉之后按删除前的行判定：B 仍读得到换区之后的全部历史
  DELETE FROM rxdb_sql_regression.history_owned_rows WHERE id = 'hist-a';
  PERFORM rxdb_sql_regression.assert_true(
    rxdb_sql_regression.history_visible('HistoryOwnedRow', 'hist-a') = ARRAY['UPDATE:trigger', 'DELETE:trigger'],
    'change-history: a deleted row must keep its history, judged by the row before deletion'
  );

  -- 平台默认：公开区谁都不能编辑，所有者也读不到它在公开区时的历史
  PERFORM rxdb_sql_regression.history_caller(user_a);
  UPDATE rxdb_sql_regression.history_owned_rows SET visibility = 'public' WHERE id = 'hist-pushed-insert';
  PERFORM rxdb_sql_regression.assert_true(
    NOT ('UPDATE:trigger' = ANY(rxdb_sql_regression.history_visible('HistoryOwnedRow', 'hist-pushed-insert'))),
    'change-history: by default nobody can edit public rows, so their history stays hidden'
  );

  -- AC#10 调用者没有某列的列权限：四个正文字段都不含这一列
  INSERT INTO rxdb_sql_regression.history_plain_rows (id, value, secret) VALUES ('hist-plain', 'v1', 's1');
  UPDATE rxdb_sql_regression.history_plain_rows SET value = 'v2', secret = 's2' WHERE id = 'hist-plain';
  SELECT pg_catalog.count(*)::integer INTO v_count
  FROM public.rxdb_entity_history('rxdb_sql_regression', 'HistoryPlainRow', 'hist-plain') AS visible
  WHERE NOT (COALESCE(visible.patch, '{}'::jsonb) ? 'secret')
    AND NOT (COALESCE(visible."inversePatch", '{}'::jsonb) ? 'secret')
    AND NOT (COALESCE(visible."beforeData", '{}'::jsonb) ? 'secret')
    AND NOT (COALESCE(visible."afterData", '{}'::jsonb) ? 'secret')
    AND visible."afterData" ? 'value';
  PERFORM rxdb_sql_regression.assert_true(
    v_count = 2
      AND (SELECT pg_catalog.bool_and(history."afterData" ? 'secret')
        FROM rxdb_sql_regression.history_of('HistoryPlainRow', 'hist-plain') AS history),
    pg_catalog.format('change-history: columns the caller cannot select must be masked out of every body, visible rows %s', v_count)
  );

  BEGIN
    PERFORM public.rxdb_entity_history('rxdb_sql_regression', 'HistoryPlainRow', 'hist-plain', 0, 0);
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_rejected := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(v_rejected, 'change-history: a page size outside 1..1000 must be rejected');
END;
$$;

-- AC#7 / AC#13：生产权限下客户端直接读历史表一律被拒；anon 没有读取 RPC 的执行权
CREATE FUNCTION rxdb_sql_regression.test_change_history_direct_access(p_expect_rpc boolean)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_table_denied boolean := false;
  v_rpc_denied boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.rxdb_change_history LIMIT 1;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_table_denied := true;
  END;
  BEGIN
    PERFORM public.rxdb_entity_history('rxdb_sql_regression', 'HistoryOwnedRow', 'hist-a');
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rpc_denied := true;
  END;
  PERFORM rxdb_sql_regression.assert_true(
    v_table_denied AND v_rpc_denied = NOT p_expect_rpc,
    pg_catalog.format(
      'change-history: %s must not read rxdb_change_history directly (denied %s) and %s the history RPC (denied %s)',
      current_user, v_table_denied, CASE WHEN p_expect_rpc THEN 'must call' ELSE 'must not call' END, v_rpc_denied
    )
  );
END;
$$;

-- AC#13：生产权限脚本收紧历史表与读取 RPC（以属主身份检查目录），重复执行之后仍然如此
CREATE FUNCTION rxdb_sql_regression.assert_change_history_grants(p_label text)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
      WHERE oid = pg_catalog.to_regclass('public.rxdb_change_history'))
      AND NOT pg_catalog.has_table_privilege('anon', 'public.rxdb_change_history', 'SELECT, INSERT, UPDATE, DELETE')
      AND NOT pg_catalog.has_table_privilege('authenticated', 'public.rxdb_change_history', 'SELECT, INSERT, UPDATE, DELETE')
      AND NOT pg_catalog.has_sequence_privilege('authenticated', 'public.rxdb_change_history_id_seq', 'USAGE, UPDATE')
      AND pg_catalog.has_function_privilege(
        'authenticated', 'public.rxdb_entity_history(text, text, text, bigint, integer)', 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(
        'anon', 'public.rxdb_entity_history(text, text, text, bigint, integer)', 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', 'public.rxdb_caller_can_edit(text, text, jsonb)', 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', 'public.rxdb_record_change_history(integer, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, text)',
        'EXECUTE'),
    pg_catalog.format('%s: rxdb_change_history must be locked to clients and its RPC open to authenticated only', p_label)
  );
END;
$$;

CREATE FUNCTION rxdb_sql_regression.upgrade_probe_privileges()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN (
    SELECT pg_catalog.jsonb_build_object(
      'table', probe.relacl::text,
      'rowSecurity', pg_catalog.jsonb_build_array(probe.relrowsecurity, probe.relforcerowsecurity),
      'sequence', (
        SELECT sequence.relacl::text FROM pg_catalog.pg_class AS sequence
        WHERE sequence.oid = 'public.rxdb_sql_upgrade_probe_id_seq'::regclass
      ),
      'columns', (
        SELECT pg_catalog.jsonb_object_agg(attribute.attname, attribute.attacl::text)
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = probe.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped
      ),
      'policies', (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_array(
            policy.polname, policy.polcmd, policy.polroles::text, pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
          )
          ORDER BY policy.polname
        )
        FROM pg_catalog.pg_policy AS policy
        WHERE policy.polrelid = probe.oid
      )
    )
    FROM pg_catalog.pg_class AS probe
    WHERE probe.oid = 'public.rxdb_sql_upgrade_probe'::regclass
  );
END;
$$;

-- US-225 AC#18：生产库从旧版本升级（迁移指南第 2 步）。以属主身份把 RxDB 对象退回升级前的样子：
-- 没有所有者表、日志表没有 bucket 列、日志表在 Realtime 发布里、01 的整库授权留下的日志与分支表权限、
-- 协议函数对 PUBLIC 与 anon 开放。再在 public 下建一张预先收紧权限的业务表：只给 authenticated 两列的读权限，成本列谁都读不到
CREATE FUNCTION rxdb_sql_regression.prepare_sync_access_upgrade()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_function regprocedure;
BEGIN
  DROP TABLE public.rxdb_branch_owner;
  -- 升级前没有远端变更历史（US-229）：增量脚本建表，生产权限脚本收紧
  DROP TABLE public.rxdb_change_history;
  -- 增量脚本 ADD COLUMN 把 bucket 加在表尾，升级库的物理列序与全新安装不同（复合类型按列位置匹配）。
  -- 连带删掉的按区索引与 RLS 策略由增量脚本与生产权限脚本重建
  ALTER TABLE public.rxdb_change DROP COLUMN bucket CASCADE;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rxdb_change;
  -- 旧版生产权限脚本只收回日志表的写权限
  GRANT ALL ON public.rxdb_change, public.rxdb_branch TO anon, authenticated;
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rxdb_change FROM anon, authenticated;
  GRANT SELECT ON SEQUENCE public.rxdb_change_id_seq TO anon, authenticated;
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_catalog.pg_proc AS p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'rxdb\_%'
  LOOP
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon', v_function);
  END LOOP;

  CREATE TABLE public.rxdb_sql_upgrade_probe (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    cost numeric NOT NULL
  );
  ALTER TABLE public.rxdb_sql_upgrade_probe ENABLE ROW LEVEL SECURITY;
  CREATE POLICY rxdb_sql_upgrade_probe_read ON public.rxdb_sql_upgrade_probe
    FOR SELECT TO authenticated USING (true);
  REVOKE ALL ON public.rxdb_sql_upgrade_probe FROM PUBLIC, anon, authenticated;
  GRANT SELECT (id, title) ON public.rxdb_sql_upgrade_probe TO authenticated;
  REVOKE ALL ON SEQUENCE public.rxdb_sql_upgrade_probe_id_seq FROM PUBLIC, anon, authenticated;

  PERFORM pg_catalog.set_config(
    'rxdb_sql_regression.upgrade_probe_privileges', rxdb_sql_regression.upgrade_probe_privileges()::text, true
  );
END;
$$;

-- US-225 AC#18：升级只动 RxDB 自己的对象。业务表的权限原样保留，RxDB 对象达到生产模型
CREATE FUNCTION rxdb_sql_regression.test_sync_access_upgrade()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_before jsonb := pg_catalog.current_setting('rxdb_sql_regression.upgrade_probe_privileges')::jsonb;
  v_after jsonb := rxdb_sql_regression.upgrade_probe_privileges();
  v_open_to_anon text[];
  v_since integer;
  v_count integer;
  v_change_id integer;
BEGIN
  PERFORM rxdb_sql_regression.assert_true(
    v_after = v_before,
    pg_catalog.format('sync-access-upgrade: a business table must keep its own privileges, before %s, after %s', v_before, v_after)
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT pg_catalog.has_table_privilege('anon', 'public.rxdb_sql_upgrade_probe', 'SELECT, INSERT, UPDATE, DELETE')
      AND NOT pg_catalog.has_table_privilege('authenticated', 'public.rxdb_sql_upgrade_probe', 'INSERT, UPDATE, DELETE')
      AND NOT pg_catalog.has_column_privilege('authenticated', 'public.rxdb_sql_upgrade_probe', 'cost', 'SELECT')
      AND pg_catalog.has_column_privilege('authenticated', 'public.rxdb_sql_upgrade_probe', 'title', 'SELECT'),
    'sync-access-upgrade: the business table must stay readable by authenticated on its granted columns only'
  );

  PERFORM rxdb_sql_regression.assert_true(
    (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = pg_catalog.to_regclass('public.rxdb_branch_owner')),
    'sync-access-upgrade: the upgrade must create rxdb_branch_owner with row level security on'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rxdb_change'
    ),
    'sync-access-upgrade: the upgrade must take rxdb_change out of the supabase_realtime publication'
  );
  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.has_table_privilege('anon', 'public.rxdb_change', 'SELECT')
      AND NOT pg_catalog.has_table_privilege('anon', 'public.rxdb_change', 'REFERENCES, TRIGGER')
      AND NOT pg_catalog.has_table_privilege('anon', 'public.rxdb_branch', 'SELECT, INSERT, UPDATE, DELETE')
      AND NOT pg_catalog.has_sequence_privilege('anon', 'public.rxdb_change_id_seq', 'SELECT, USAGE, UPDATE')
      AND pg_catalog.has_table_privilege('authenticated', 'public.rxdb_change', 'SELECT')
      AND NOT pg_catalog.has_table_privilege('authenticated', 'public.rxdb_change', 'REFERENCES, TRIGGER')
      AND NOT pg_catalog.has_table_privilege('authenticated', 'public.rxdb_branch', 'INSERT, UPDATE, DELETE'),
    'sync-access-upgrade: only partition-log SELECT may remain on rxdb_change; old write privileges must be revoked'
  );

  -- 非触发器的 rxdb_ 函数里，anon 只能执行连接函数、分区只读 RPC 及其调用者权限辅助函数（含成员权限 US-234）；
  -- rxdb_test_ 是 03 的测试夹具
  SELECT pg_catalog.array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
  INTO v_open_to_anon
  FROM pg_catalog.pg_proc AS p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname LIKE 'rxdb\_%'
    AND p.proname NOT LIKE 'rxdb\_test\_%'
    AND p.prorettype <> 'trigger'::regtype
    AND p.oid NOT IN (
      'public.rxdb_server_version()'::regprocedure,
      'public.rxdb_backend_id()'::regprocedure,
      'public.rxdb_check_rls(jsonb)'::regprocedure,
      'public.rxdb_caller_buckets()'::regprocedure,
      'public.rxdb_caller_grants()'::regprocedure,
      'public.rxdb_caller_scopes(text)'::regprocedure,
      'public.rxdb_entity_sync_info(text, text)'::regprocedure,
      'public.rxdb_bucket_snapshot_point(text, text, text, text[])'::regprocedure,
      'public.rxdb_pull_bucket_changes(integer, integer, text, text, text, text, jsonb)'::regprocedure,
      'public.rxdb_pull_bucket_snapshot(text, text, text, jsonb, text, integer)'::regprocedure,
      'public.rxdb_jsonb_matches_rule(jsonb, jsonb)'::regprocedure,
      'public.rxdb_jsonb_matches_filter(jsonb, jsonb)'::regprocedure,
      'public.rxdb_selectable_columns(text, text)'::regprocedure,
      'public.rxdb_assert_snapshot_filter_columns(jsonb, text[])'::regprocedure,
      'public.rxdb_selectable_row_expression(text[])'::regprocedure
    )
    AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE');
  PERFORM rxdb_sql_regression.assert_true(
    v_open_to_anon IS NULL,
    pg_catalog.format('sync-access-upgrade: only protocol functions and read helpers may stay executable by anon, open: %s', v_open_to_anon)
  );

  PERFORM rxdb_sql_regression.test_production_grants_idempotent();
  PERFORM rxdb_sql_regression.assert_change_history_grants('sync-access-upgrade');

  -- 升级库的 bucket 在日志表末尾：按区拉取仍要按列名给出每个字段
  PERFORM pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
  SELECT COALESCE(pg_catalog.max(id), 0)::integer INTO v_since FROM public.rxdb_change;
  UPDATE rxdb_sql_regression.identity_scoped_rows SET value = 'upgraded-value' WHERE id = 'bucket-public';
  SELECT pg_catalog.count(*)::integer, pg_catalog.max(change.id)::integer
  INTO v_count, v_change_id
  FROM public.rxdb_pull_bucket_changes(
    v_since, 10, 'rxdb_sql_regression', 'IdentityScopedRow', 'public'
  ) AS change
  WHERE change."entityId" = 'bucket-public'
    AND change.bucket = 'public'
    AND change.type = 'UPDATE'
    AND change."branchId" = 'main'
    AND change."afterData"->>'value' = 'upgraded-value'
    AND change.patch = change."afterData"
    AND change."inversePatch" IS NULL
    AND change."beforeData" IS NULL
    AND change."snapshotComplete";
  PERFORM rxdb_sql_regression.assert_true(
    v_count = 1,
    'sync-access-upgrade: bucket pulls must return named fields on an upgraded change log'
  );
  PERFORM pg_catalog.set_config('rxdb_sql_regression.upgrade_bucket_change_id', v_change_id::text, true);
END;
$$;

-- 增量升级可以重复执行：重跑整批之后，分区实体的日志一条都不能少
CREATE FUNCTION rxdb_sql_regression.test_sync_access_upgrade_rerun()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (
      SELECT 1 FROM public.rxdb_change
      WHERE id = pg_catalog.current_setting('rxdb_sql_regression.upgrade_bucket_change_id')::integer
        AND bucket = 'public'
    ),
    'sync-access-upgrade: re-running the upgrade must keep the change log of bucketed entities'
  );
END;
$$;

-- US-234 AC#1：平台默认的成员权限。栈上加载过演示的覆盖，用例在保存点里重新执行 04 与生产权限脚本恢复默认，
-- 跑完回滚到保存点，不影响别的用例
CREATE FUNCTION rxdb_sql_regression.test_caller_grants_default()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  user_a uuid := '00000000-0000-4000-8000-0000000000a1';
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM public.rxdb_caller_grants())
      AND public.rxdb_caller_scopes('read') = ARRAY[]::text[],
    'caller-grants: anon must have no grants by default'
  );

  PERFORM pg_catalog.set_config(
    'request.jwt.claims', pg_catalog.format('{"sub":"%s","role":"authenticated"}', user_a), true
  );
  PERFORM rxdb_sql_regression.assert_true(
    (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(caller)) FROM public.rxdb_caller_grants() AS caller)
      = pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('scope', 'user:' || user_a::text, 'permissions', ARRAY['read', 'edit'])
      ),
    'caller-grants: a signed-in user must only get read + edit on the own user scope by default'
  );
  PERFORM rxdb_sql_regression.assert_true(
    public.rxdb_caller_scopes('edit') = ARRAY['user:' || user_a::text]
      AND public.rxdb_caller_scopes('manage') = ARRAY[]::text[],
    'caller-grants: rxdb_caller_scopes must list exactly the scopes that carry the permission'
  );

  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.has_function_privilege('anon', 'public.rxdb_caller_grants()', 'EXECUTE')
      AND pg_catalog.has_function_privilege('authenticated', 'public.rxdb_caller_grants()', 'EXECUTE')
      AND pg_catalog.has_function_privilege('anon', 'public.rxdb_caller_scopes(text)', 'EXECUTE')
      AND pg_catalog.has_function_privilege('authenticated', 'public.rxdb_caller_scopes(text)', 'EXECUTE'),
    'caller-grants: anon and authenticated must be able to read their own grants'
  );
END;
$$;

GRANT USAGE ON SCHEMA rxdb_sql_regression TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rxdb_sql_regression TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA rxdb_sql_regression TO anon, authenticated;
REVOKE ALL ON TABLE rxdb_sql_regression.no_dml_ids FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE rxdb_sql_regression.update_column_privileges FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, value), UPDATE (value) ON rxdb_sql_regression.update_column_privileges TO authenticated;
REVOKE ALL ON TABLE rxdb_sql_regression.column_bucket_rows FROM PUBLIC, anon, authenticated;
-- change-history（AC#10）：authenticated 能整表写，但读不到 secret 列
REVOKE ALL ON TABLE rxdb_sql_regression.history_plain_rows FROM PUBLIC, anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON rxdb_sql_regression.history_plain_rows TO authenticated;
GRANT SELECT (id, value) ON rxdb_sql_regression.history_plain_rows TO authenticated;
GRANT SELECT (id, value, rxdb_bucket) ON rxdb_sql_regression.column_bucket_rows TO anon, authenticated;

-- 日志同步协议只对已登录身份开放（US-225）：用例以固定测试用户的 authenticated 身份运行，
-- auth.uid() 由 PostgREST 平时写入的 request.jwt.claims 给出
SELECT pg_catalog.set_config(
  'request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true
);
SET LOCAL ROLE authenticated;
SELECT rxdb_sql_regression.test_text_varchar()
WHERE :'test_case' IN ('all', 'text-varchar');
SELECT rxdb_sql_regression.test_entity_id()
WHERE :'test_case' IN ('all', 'entity-id');
SELECT rxdb_sql_regression.test_idempotent_retry()
WHERE :'test_case' IN ('all', 'idempotent-retry');
SELECT rxdb_sql_regression.test_uuid()
WHERE :'test_case' IN ('all', 'uuid');
SELECT rxdb_sql_regression.test_search_path()
WHERE :'test_case' IN ('all', 'search-path');
SELECT rxdb_sql_regression.test_rls_invoker()
WHERE :'test_case' IN ('all', 'rls-invoker');
SELECT rxdb_sql_regression.test_rls_write_boundary()
WHERE :'test_case' IN ('all', 'rls-write-boundary');
SELECT rxdb_sql_regression.test_rls_filtered_delete()
WHERE :'test_case' IN ('all', 'rls-filtered-delete');
SELECT rxdb_sql_regression.test_branch_search_path()
WHERE :'test_case' IN ('all', 'branch-search-path');
SELECT rxdb_sql_regression.test_existence_probe()
WHERE :'test_case' IN ('all', 'existence-probe');
SELECT rxdb_sql_regression.test_update_partial_columns()
WHERE :'test_case' IN ('all', 'update-partial-columns');
SELECT rxdb_sql_regression.test_update_owner_rls()
WHERE :'test_case' IN ('all', 'update-owner-rls');
SELECT rxdb_sql_regression.test_update_shared_edit()
WHERE :'test_case' IN ('all', 'update-shared-edit');
SELECT rxdb_sql_regression.test_update_denied()
WHERE :'test_case' IN ('all', 'update-denied');
SELECT rxdb_sql_regression.test_update_gone()
WHERE :'test_case' IN ('all', 'update-gone');
SELECT rxdb_sql_regression.test_delete_hidden_row()
WHERE :'test_case' IN ('all', 'delete-hidden-row');
SELECT rxdb_sql_regression.test_delete_gone()
WHERE :'test_case' IN ('all', 'delete-gone');
SELECT rxdb_sql_regression.test_mixed_batch_rollback()
WHERE :'test_case' IN ('all', 'mixed-batch-rollback');
SELECT rxdb_sql_regression.test_push_integrity()
WHERE :'test_case' IN ('all', 'push-integrity');
SELECT rxdb_sql_regression.test_receipts_partial()
WHERE :'test_case' IN ('all', 'receipts-partial');
SELECT rxdb_sql_regression.test_receipts_fanout()
WHERE :'test_case' IN ('all', 'receipts-fanout');
SELECT rxdb_sql_regression.test_receipts_dependency()
WHERE :'test_case' IN ('all', 'receipts-dependency');
SELECT rxdb_sql_regression.test_receipts_gone()
WHERE :'test_case' IN ('all', 'receipts-gone');
SELECT rxdb_sql_regression.test_receipts_unclassified()
WHERE :'test_case' IN ('all', 'receipts-unclassified');
SELECT rxdb_sql_regression.test_receipts_idempotent()
WHERE :'test_case' IN ('all', 'receipts-idempotent');
SELECT rxdb_sql_regression.test_receipts_legacy()
WHERE :'test_case' IN ('all', 'receipts-legacy');
SELECT rxdb_sql_regression.test_receipts_many_groups()
WHERE :'test_case' IN ('all', 'receipts-many-groups');
SELECT rxdb_sql_regression.test_update_visibility_transition()
WHERE :'test_case' IN ('all', 'update-visibility-transition');
SELECT rxdb_sql_regression.test_cascade_delete_logging()
WHERE :'test_case' IN ('all', 'cascade-delete-logging');
SELECT rxdb_sql_regression.test_cascade_explicit_deletes()
WHERE :'test_case' IN ('all', 'cascade-explicit-deletes');
SELECT rxdb_sql_regression.test_cascade_uuid_keys()
WHERE :'test_case' IN ('all', 'cascade-uuid-keys');
SELECT rxdb_sql_regression.test_cascade_source_order()
WHERE :'test_case' IN ('all', 'cascade-source-order');
SELECT rxdb_sql_regression.test_cascade_rejected_child()
WHERE :'test_case' IN ('all', 'cascade-rejected-child');
SELECT rxdb_sql_regression.test_cascade_replay_and_rollback()
WHERE :'test_case' IN ('all', 'cascade-replay-rollback');
SELECT rxdb_sql_regression.test_cascade_hidden_inverse_patch()
WHERE :'test_case' IN ('all', 'cascade-hidden-inverse-patch');
SELECT rxdb_sql_regression.test_cascade_numeric_keys()
WHERE :'test_case' IN ('all', 'cascade-numeric-keys');
SELECT rxdb_sql_regression.test_cascade_partition_keys()
WHERE :'test_case' IN ('all', 'cascade-partition-keys');
SELECT rxdb_sql_regression.test_bucketed_push()
WHERE :'test_case' IN ('all', 'bucketed-push');
SELECT rxdb_sql_regression.test_bucketed_documented_policy()
WHERE :'test_case' IN ('all', 'bucketed-documented-policy');
SELECT rxdb_sql_regression.test_change_history()
WHERE :'test_case' IN ('all', 'change-history');
SELECT rxdb_sql_regression.test_deferred_cycle()
WHERE :'test_case' IN ('all', 'deferred-cycle');
SELECT rxdb_sql_regression.test_deferred_columns_validation()
WHERE :'test_case' IN ('all', 'deferred-columns-validation');
RESET ROLE;

SELECT rxdb_sql_regression.test_delete_hidden_row_verify()
WHERE :'test_case' IN ('all', 'delete-hidden-row');

SELECT rxdb_sql_regression.test_trigger_schema()
WHERE :'test_case' IN ('all', 'trigger-schema');

SELECT rxdb_sql_regression.test_backend_identity()
WHERE :'test_case' IN ('all', 'backend-identity');

-- US-218 阶段 C、US-225：以属主身份执行生产权限脚本（随外层 ROLLBACK 撤销），再分别以 authenticated、anon 验证。
-- 必须放在最后：本栈初始化时加载的可能是旧版脚本，前面的用例不依赖它收回了哪些权限。
SELECT :'test_case' IN (
  'all', 'production-change-grants', 'bucketed-read-sync', 'bucketed-guards', 'anon-sync-protocol',
  'branch-ownership', 'realtime-notifications', 'production-grants-idempotent', 'change-history'
) AS run_production_change_grants \gset
\if :run_production_change_grants
\i :production_grants_file
-- 幂等（US-225 AC#16）：同一脚本再执行一次，之后的断言都落在两次执行后的状态上
\i :production_grants_file

SELECT pg_catalog.set_config(
  'request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true
);
SET LOCAL ROLE authenticated;
SELECT rxdb_sql_regression.test_production_change_grants()
WHERE :'test_case' IN ('all', 'production-change-grants');
SELECT rxdb_sql_regression.test_realtime_notifications()
WHERE :'test_case' IN ('all', 'realtime-notifications');
SELECT rxdb_sql_regression.test_change_history_direct_access(true)
WHERE :'test_case' IN ('all', 'change-history');
SELECT rxdb_sql_regression.assert_true(
  rxdb_sql_regression.visible_change_notifications() > 0,
  'realtime-notifications: authenticated must be able to receive rxdb:changes broadcasts'
)
WHERE :'test_case' IN ('all', 'realtime-notifications');
RESET ROLE;

SELECT rxdb_sql_regression.seed_legacy_branches()
WHERE :'test_case' IN ('all', 'branch-ownership');
SET LOCAL ROLE authenticated;
SELECT rxdb_sql_regression.test_branch_ownership()
WHERE :'test_case' IN ('all', 'branch-ownership');
RESET ROLE;

-- 迁移指南第 3 步（US-225 AC#20）：以管理员身份补登两类旧分支的所有者，再以 authenticated 验证
SELECT rxdb_sql_regression.backfill_legacy_branch_owners()
WHERE :'test_case' IN ('all', 'branch-ownership');
SET LOCAL ROLE authenticated;
SELECT rxdb_sql_regression.test_branch_owner_backfill()
WHERE :'test_case' IN ('all', 'branch-ownership');
RESET ROLE;

SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT rxdb_sql_regression.test_bucketed_read_sync()
WHERE :'test_case' IN ('all', 'bucketed-read-sync');
SELECT rxdb_sql_regression.test_bucketed_guards()
WHERE :'test_case' IN ('all', 'bucketed-guards');
SELECT rxdb_sql_regression.test_anon_sync_protocol()
WHERE :'test_case' IN ('all', 'anon-sync-protocol');
SELECT rxdb_sql_regression.test_change_history_direct_access(false)
WHERE :'test_case' IN ('all', 'change-history');
SELECT rxdb_sql_regression.assert_true(
  rxdb_sql_regression.visible_change_notifications() = 0,
  'realtime-notifications: anon must not receive rxdb:changes broadcasts'
)
WHERE :'test_case' IN ('all', 'realtime-notifications');
RESET ROLE;

SELECT rxdb_sql_regression.test_anon_sync_protocol_verify()
WHERE :'test_case' IN ('all', 'anon-sync-protocol');
SELECT rxdb_sql_regression.test_bucketed_guards_owner()
WHERE :'test_case' IN ('all', 'bucketed-guards');
SELECT rxdb_sql_regression.test_production_grants_idempotent()
WHERE :'test_case' IN ('all', 'production-grants-idempotent');
SELECT rxdb_sql_regression.assert_change_history_grants('change-history')
WHERE :'test_case' IN ('all', 'change-history');
\endif

-- US-234 AC#1：只装平台 SQL 时的成员权限。04 与生产权限脚本在保存点里重新执行，把演示的覆盖换回平台默认
SELECT :'test_case' IN ('all', 'caller-grants') AS run_caller_grants \gset
\if :run_caller_grants
SAVEPOINT caller_grants_default;
\i :utils_functions_file
\i :production_grants_file
SELECT rxdb_sql_regression.test_caller_grants_default();
ROLLBACK TO SAVEPOINT caller_grants_default;
\endif

-- US-225 AC#18：生产库从旧版本升级。按迁移指南第 2 步的顺序执行参考 SQL，随外层 ROLLBACK 撤销。
-- 必须放在最后：它把 RxDB 对象先退回升级前的样子，前面的用例都不该看到这个中间状态
SELECT :'test_case' IN ('all', 'sync-access-upgrade') AS run_sync_access_upgrade \gset
\if :run_sync_access_upgrade
SELECT rxdb_sql_regression.prepare_sync_access_upgrade();
\i :sync_access_upgrade_file
\i :sync_functions_file
\i :utils_functions_file
\i :production_grants_file
SELECT rxdb_sql_regression.test_sync_access_upgrade();
-- 迁移指南写明整批可以重复执行：原样再跑一遍
\i :sync_access_upgrade_file
\i :sync_functions_file
\i :utils_functions_file
\i :production_grants_file
SELECT rxdb_sql_regression.test_sync_access_upgrade_rerun();
\endif

ROLLBACK;
