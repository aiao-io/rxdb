\set ON_ERROR_STOP on
\if :{?test_case}
\else
\set test_case all
\endif

BEGIN;

DROP SCHEMA IF EXISTS rxdb_sql_regression CASCADE;
DROP SCHEMA IF EXISTS rxdb_sql_function_shadow CASCADE;
DROP SCHEMA IF EXISTS rxdb_sql_catalog_shadow CASCADE;
DROP TABLE IF EXISTS public.rxdb_sql_trigger_probe;

CREATE SCHEMA rxdb_sql_regression;
CREATE SCHEMA rxdb_sql_function_shadow;
CREATE SCHEMA rxdb_sql_catalog_shadow;

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
  p_entity_id text
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
    v_detail->>'op' = 'UPDATE'
      AND v_detail->>'reason' = p_reason
      AND v_detail->>'schema' = p_schema
      AND v_detail->>'table' = p_table
      AND v_detail->>'entityId' = p_entity_id,
    pg_catalog.format('rejection DETAIL must describe %s.%s id=%s reason=%s: %s', p_schema, p_table, p_entity_id, p_reason, p_detail)
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
  SELECT public.rxdb_mutations(
    '[
      {"schema":"rxdb_sql_regression","table":"text_ids","data":[{"id":"text-1","value":"text"}]},
      {"schema":"rxdb_sql_regression","table":"varchar_ids","data":[{"id":"varchar-1","value":"varchar"}]}
    ]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    true
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
    true
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
  DELETE FROM public.rxdb_change
  WHERE "clientId" = 'sql-security-regression-entity-id';

  SELECT public.rxdb_mutations(
    '[]'::jsonb,
    '[]'::jsonb,
    '[{
      "namespace":"rxdb_sql_regression",
      "entity":"TextEntity",
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
  DELETE FROM public.rxdb_change
  WHERE "clientId" = 'sql-idempotency-client';
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
    true
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
    true
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
    true
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
  write_rpcs regprocedure[] := ARRAY[
    pg_catalog.to_regprocedure('public.rxdb_batch_upsert(text,text,jsonb)'),
    pg_catalog.to_regprocedure('public.rxdb_batch_update(text,text,jsonb)'),
    pg_catalog.to_regprocedure('public.rxdb_batch_delete(text,text,text[])'),
    pg_catalog.to_regprocedure('public.rxdb_mutations(jsonb,jsonb,jsonb,boolean,jsonb)')
  ];
  no_dml_blocked boolean := false;
  rls_blocked boolean := false;
BEGIN
  -- 签名一旦改动，to_regprocedure 返回 NULL 会让下面的 INVOKER 检查静默失效
  PERFORM rxdb_sql_regression.assert_true(
    pg_catalog.array_position(write_rpcs, NULL) IS NULL,
    pg_catalog.format('every write RPC signature must resolve: %s', write_rpcs)
  );

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
      true
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
      true
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
BEGIN
  DELETE FROM public.rxdb_change
  WHERE "clientId" = 'sql-rls-filter-client';
  PERFORM pg_catalog.set_config('rxdb_sql_regression.uid', 'sql-owner-a', true);

  -- 行对调用方可见，但 DELETE 的 USING 策略把它过滤掉：不抛错、零行生效
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
      rls_rejected := true;
  END;

  PERFORM rxdb_sql_regression.assert_true(
    EXISTS (SELECT 1 FROM rxdb_sql_regression.rls_owned_ids WHERE id = 'owned-by-b'),
    'RLS-filtered delete must leave the row in place'
  );
  PERFORM rxdb_sql_regression.assert_true(
    NOT EXISTS (SELECT 1 FROM public.rxdb_change WHERE "clientId" = 'sql-rls-filter-client'),
    'rxdb_mutations must not log a DELETE that RLS filtered to zero rows'
  );
  PERFORM rxdb_sql_regression.assert_true(
    rls_rejected,
    'rxdb_mutations must reject a visible row that RLS refuses to delete'
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
  DELETE FROM public.rxdb_branch WHERE id = 'sql-security-shadow-branch';

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

GRANT USAGE ON SCHEMA rxdb_sql_regression TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rxdb_sql_regression TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA rxdb_sql_regression TO anon;
REVOKE ALL ON TABLE rxdb_sql_regression.no_dml_ids FROM PUBLIC, anon, authenticated;

SET LOCAL ROLE anon;
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
RESET ROLE;

SELECT rxdb_sql_regression.test_trigger_schema()
WHERE :'test_case' IN ('all', 'trigger-schema');

ROLLBACK;
