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
  no_dml_blocked boolean := false;
  rls_blocked boolean := false;
BEGIN
  SELECT pg_catalog.count(*)::integer
  INTO unsafe_write_rpcs
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.oid IN (
      pg_catalog.to_regprocedure('public.rxdb_batch_upsert(text,text,jsonb)'),
      pg_catalog.to_regprocedure('public.rxdb_batch_delete(text,text,text[])'),
      pg_catalog.to_regprocedure('public.rxdb_mutations(jsonb,jsonb,jsonb,boolean)')
    )
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
SELECT rxdb_sql_regression.test_branch_search_path()
WHERE :'test_case' IN ('all', 'branch-search-path');
RESET ROLE;

SELECT rxdb_sql_regression.test_trigger_schema()
WHERE :'test_case' IN ('all', 'trigger-schema');

ROLLBACK;
