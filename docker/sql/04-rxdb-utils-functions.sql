-- ============================================
-- RxDB 事务支持函数
-- ============================================
-- 用途: 提供事务性批量操作支持
-- ============================================

/**
 * rxdb_batch_upsert - 批量 upsert 操作
 *
 * @param p_table 表名
 * @param p_schema schema 名称
 * @param p_data JSONB 数组，包含要 upsert 的数据
 * @returns 插入/更新的记录
 */
CREATE OR REPLACE FUNCTION public.rxdb_batch_upsert(
  p_table text,
  p_schema text DEFAULT 'public',
  p_data jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  item jsonb;
  row_result jsonb;
BEGIN
  -- 验证表名（防止 SQL 注入）
  IF p_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table;
  END IF;

  FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_data)
  LOOP
    EXECUTE pg_catalog.format(
      'INSERT INTO %I.%I SELECT * FROM pg_catalog.jsonb_populate_record(null::%I.%I, $1)
       ON CONFLICT (id) DO UPDATE SET %s
       RETURNING pg_catalog.to_jsonb(%I.*)',
      p_schema, p_table, p_schema, p_table,
      (SELECT pg_catalog.string_agg(pg_catalog.format('%I = EXCLUDED.%I', key, key), ', ')
       FROM pg_catalog.jsonb_object_keys(item) AS keys(key) WHERE key != 'id'),
      p_table
    ) INTO row_result USING item;
    result := result || row_result;
  END LOOP;

  RETURN result;
END;
$$;

/**
 * rxdb_batch_delete - 批量删除操作
 */
CREATE OR REPLACE FUNCTION public.rxdb_batch_delete(
  p_table text,
  p_schema text DEFAULT 'public',
  p_ids text[] DEFAULT '{}'::text[]
)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  affected int;
  v_id_type pg_catalog.regtype;
  v_id_array_type pg_catalog.regtype;
BEGIN
  IF p_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table;
  END IF;

  SELECT
    a.atttypid::pg_catalog.regtype,
    CASE
      WHEN t.typarray = 0 THEN NULL
      ELSE t.typarray::pg_catalog.regtype
    END
  INTO v_id_type, v_id_array_type
  FROM pg_catalog.pg_attribute AS a
  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_type AS t ON t.oid = a.atttypid
  WHERE n.nspname = p_schema
    AND c.relname = p_table
    AND c.relkind IN ('r', 'p')
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_id_type IS NULL THEN
    RAISE EXCEPTION 'Missing id column: %.%', p_schema, p_table;
  END IF;

  IF v_id_array_type IS NULL THEN
    RAISE EXCEPTION 'Unsupported id type without array regtype: %', v_id_type;
  END IF;

  EXECUTE pg_catalog.format(
    'DELETE FROM %I.%I WHERE id = ANY($1::%s)',
    p_schema, p_table, v_id_array_type
  ) USING p_ids;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

/**
 * rxdb_check_rls - 检查指定业务表是否启用了 Row Level Security
 *
 * @param p_tables JSONB 数组，每个元素: {schema?, table}
 * @returns 每张表的存在性与 RLS 状态
 */
CREATE OR REPLACE FUNCTION public.rxdb_check_rls(
  p_tables jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  item jsonb;
  v_schema text;
  v_table text;
  v_exists boolean;
  v_rls_enabled boolean;
  v_rls_forced boolean;
  result jsonb := '[]'::jsonb;
BEGIN
  FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_tables)
  LOOP
    v_schema := COALESCE(item->>'schema', 'public');
    v_table := item->>'table';

    IF v_schema !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'Invalid schema name: %', v_schema;
    END IF;

    IF v_table IS NULL OR v_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'Invalid table name: %', v_table;
    END IF;

    SELECT
      TRUE,
      c.relrowsecurity,
      c.relforcerowsecurity
    INTO v_exists, v_rls_enabled, v_rls_forced
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = v_schema
      AND c.relname = v_table
      AND c.relkind IN ('r', 'p');

    result := result || pg_catalog.jsonb_build_object(
      'schema', v_schema,
      'table', v_table,
      'exists', COALESCE(v_exists, false),
      'rlsEnabled', COALESCE(v_rls_enabled, false),
      'rlsForced', COALESCE(v_rls_forced, false)
    );

    v_exists := NULL;
    v_rls_enabled := NULL;
    v_rls_forced := NULL;
  END LOOP;

  RETURN result;
END;
$$;

/**
 * rxdb_mutations - 事务性批量修改函数
 *
 * 在单个数据库事务中执行所有操作：
 * 1. 写入 rxdb_change 表（可选，用于同步）
 * 2. 执行 upsert 和 delete 操作
 *
 * 任何操作失败都会导致整个事务回滚
 *
 * @param p_upserts JSONB 数组，每个元素: {table, schema?, data: [...]}
 * @param p_deletes JSONB 数组，每个元素: {table, schema?, ids: [...]}
 * @param p_changes JSONB 数组，RxDBChange 记录（可选，用于同步场景）
 * @param p_skip_sync 是否跳过同步触发器 (默认 false)
 * @returns 操作结果
 */
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.rxdb_mutations(
  p_upserts jsonb DEFAULT '[]'::jsonb,
  p_deletes jsonb DEFAULT '[]'::jsonb,
  p_changes jsonb DEFAULT '[]'::jsonb,
  p_skip_sync boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  op jsonb;
  upsert_results jsonb := '[]'::jsonb;
  delete_count int := 0;
  changes_count int := 0;
  max_change_id bigint := NULL;
  mapped_max_change_id bigint := NULL;
  change_id_mapping jsonb := '[]'::jsonb;
  input_changes_count int := 0;
  idempotent_changes_count int := 0;
  apply_entity_operations boolean := true;
  batch_result jsonb;
  ids_array text[];
  normalized_changes jsonb := '[]'::jsonb;
  entity_states jsonb := '{}'::jsonb;
  state_key text;
  state_entry jsonb;
  schema_name text;
  table_name text;
  entity_id text;
  change_type text;
  current_data jsonb;
  before_data jsonb;
  after_data jsonb;
  snapshot_complete boolean;
BEGIN
  -- 如果请求跳过同步，设置会话变量禁用触发器
  IF p_skip_sync THEN
    PERFORM pg_catalog.set_config('rxdb.sync_enabled', 'false', true);
  END IF;

  -- 1. 在实体操作前固化每条 change 的前后完整快照
  FOR op IN SELECT value FROM pg_catalog.jsonb_array_elements(p_changes)
  LOOP
    schema_name := COALESCE(op->>'schema', 'public');
    table_name := op->>'table';
    entity_id := op->>'entityId';
    change_type := op->>'type';
    state_key := pg_catalog.jsonb_build_array(op->>'namespace', op->>'entity', entity_id)::text;
    current_data := NULL;

    IF entity_states ? state_key THEN
      state_entry := entity_states->state_key;
      IF (state_entry->>'exists')::boolean THEN
        current_data := state_entry->'value';
      END IF;
    ELSIF table_name IS NOT NULL THEN
      EXECUTE pg_catalog.format(
        'SELECT pg_catalog.to_jsonb(source) FROM %I.%I AS source WHERE source.id::text = $1 LIMIT 1',
        schema_name,
        table_name
      )
      INTO current_data
      USING entity_id;
    END IF;

    snapshot_complete := COALESCE(op->>'branchId', 'main') = 'main';
    CASE change_type
      WHEN 'INSERT' THEN
        before_data := current_data;
        after_data := COALESCE(NULLIF(op->'patch', 'null'::jsonb), '{}'::jsonb);
        snapshot_complete := snapshot_complete AND NULLIF(op->'patch', 'null'::jsonb) IS NOT NULL;
      WHEN 'UPDATE' THEN
        before_data := COALESCE(current_data, NULLIF(op->'inversePatch', 'null'::jsonb));
        after_data := COALESCE(before_data, '{}'::jsonb) || COALESCE(NULLIF(op->'patch', 'null'::jsonb), '{}'::jsonb);
        snapshot_complete := snapshot_complete AND current_data IS NOT NULL;
      WHEN 'DELETE' THEN
        before_data := COALESCE(current_data, NULLIF(op->'inversePatch', 'null'::jsonb));
        after_data := NULL;
        snapshot_complete := snapshot_complete AND before_data IS NOT NULL;
      ELSE
        RAISE EXCEPTION 'Unsupported rxdb change type: %', change_type;
    END CASE;

    normalized_changes := normalized_changes || pg_catalog.jsonb_build_array(
      (op - 'schema' - 'table') || pg_catalog.jsonb_build_object(
        'beforeData', before_data,
        'afterData', after_data,
        'snapshotComplete', snapshot_complete
      )
    );
    entity_states := pg_catalog.jsonb_set(
      entity_states,
      ARRAY[state_key],
      pg_catalog.jsonb_build_object('exists', after_data IS NOT NULL, 'value', after_data),
      true
    );
  END LOOP;

  -- 2. 写入 rxdb_change 表（如果有）
  input_changes_count := pg_catalog.jsonb_array_length(normalized_changes);
  IF input_changes_count > 0 THEN
    SELECT pg_catalog.count(*)::integer
    INTO idempotent_changes_count
    FROM pg_catalog.jsonb_array_elements(normalized_changes) AS changes(c)
    WHERE c->>'clientId' IS NOT NULL AND c->>'localId' IS NOT NULL;

    WITH inserted AS (
      INSERT INTO public.rxdb_change (
        namespace, entity, "entityId", type, patch, "inversePatch",
        "branchId", "clientId", "localId", "createdAt", "updatedAt",
        "beforeData", "afterData", "snapshotComplete"
      )
      SELECT
        c->>'namespace',
        c->>'entity',
        c->>'entityId',
        c->>'type',
        c->'patch',
        c->'inversePatch',
        COALESCE(c->>'branchId', 'main'),
        c->>'clientId',
        (c->>'localId')::integer,
        COALESCE((c->>'createdAt')::timestamptz, pg_catalog.now()),
        COALESCE((c->>'updatedAt')::timestamptz, pg_catalog.now()),
        c->'beforeData',
        c->'afterData',
        COALESCE((c->>'snapshotComplete')::boolean, false)
      FROM pg_catalog.jsonb_array_elements(normalized_changes) AS changes(c)
      ON CONFLICT ("clientId", "localId")
        WHERE "clientId" IS NOT NULL AND "localId" IS NOT NULL
        DO NOTHING
      RETURNING id
    )
    SELECT pg_catalog.count(*), pg_catalog.max(id)
    INTO changes_count, max_change_id
    FROM inserted;

    WITH requested AS (
      SELECT
        c->>'clientId' AS client_id,
        (c->>'localId')::integer AS local_id,
        pg_catalog.min(ordinality) AS ordinality
      FROM pg_catalog.jsonb_array_elements(normalized_changes) WITH ORDINALITY AS changes(c, ordinality)
      WHERE c->>'clientId' IS NOT NULL AND c->>'localId' IS NOT NULL
      GROUP BY c->>'clientId', (c->>'localId')::integer
    )
    SELECT
      COALESCE(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('localId', requested.local_id, 'remoteId', remote.id)
          ORDER BY requested.ordinality
        ),
        '[]'::jsonb
      ),
      pg_catalog.max(remote.id)
    INTO change_id_mapping, mapped_max_change_id
    FROM requested
    JOIN public.rxdb_change AS remote
      ON remote."clientId" = requested.client_id
      AND remote."localId" = requested.local_id;

    max_change_id := CASE
      WHEN max_change_id IS NULL THEN mapped_max_change_id
      WHEN mapped_max_change_id IS NULL THEN max_change_id
      WHEN max_change_id > mapped_max_change_id THEN max_change_id
      ELSE mapped_max_change_id
    END;
    apply_entity_operations := idempotent_changes_count < input_changes_count OR changes_count > 0;
  END IF;

  -- 2. 处理所有 upsert 操作
  IF apply_entity_operations THEN
    FOR op IN SELECT * FROM pg_catalog.jsonb_array_elements(p_upserts)
    LOOP
      SELECT public.rxdb_batch_upsert(
        op->>'table',
        COALESCE(op->>'schema', 'public'),
        op->'data'
      ) INTO batch_result;
      upsert_results := upsert_results || batch_result;
    END LOOP;

    -- 3. 处理所有 delete 操作
    FOR op IN SELECT * FROM pg_catalog.jsonb_array_elements(p_deletes)
    LOOP
      SELECT pg_catalog.array_agg(value) INTO ids_array
      FROM pg_catalog.jsonb_array_elements_text(op->'ids') AS ids(value);

      SELECT delete_count + public.rxdb_batch_delete(
        op->>'table',
        COALESCE(op->>'schema', 'public'),
        ids_array
      ) INTO delete_count;
    END LOOP;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'upserted', upsert_results,
    'deleted', delete_count,
    'changes', changes_count,
    'max_change_id', max_change_id,
    'change_id_mapping', change_id_mapping
  );
END;
$$;

-- 授权
GRANT EXECUTE ON FUNCTION public.rxdb_batch_upsert(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_batch_delete(text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_check_rls(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_mutations(jsonb, jsonb, jsonb, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rxdb_server_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.version();
$$;

GRANT EXECUTE ON FUNCTION public.rxdb_server_version() TO anon, authenticated;
