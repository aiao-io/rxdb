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
  writable_columns text;
  writable_names text[];
BEGIN
  -- 验证表名（防止 SQL 注入）
  IF p_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table;
  END IF;

  -- 生成列（例如分区实体的 rxdb_bucket）由数据库自己算，写入里出现它就是错（428C9）：插入与冲突更新都只写可写列
  SELECT
    pg_catalog.string_agg(pg_catalog.format('%I', attribute.attname), ', ' ORDER BY attribute.attnum),
    pg_catalog.array_agg(attribute.attname::text)
  INTO writable_columns, writable_names
  FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid = pg_catalog.format('%I.%I', p_schema, p_table)::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND attribute.attgenerated = '';

  FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_data)
  LOOP
    EXECUTE pg_catalog.format(
      'INSERT INTO %I.%I (%s) SELECT %s FROM pg_catalog.jsonb_populate_record(null::%I.%I, $1)
       ON CONFLICT (id) DO UPDATE SET %s
       RETURNING pg_catalog.to_jsonb(%I.*)',
      p_schema, p_table, writable_columns, writable_columns, p_schema, p_table,
      (SELECT pg_catalog.string_agg(pg_catalog.format('%I = EXCLUDED.%I', key, key), ', ')
       FROM pg_catalog.jsonb_object_keys(item) AS keys(key) WHERE key != 'id' AND key = ANY(writable_names)),
      p_table
    ) INTO row_result USING item;
    result := result || row_result;
  END LOOP;

  RETURN result;
END;
$$;

/**
 * rxdb_id_array_type - 取业务表 id 列对应的数组类型
 *
 * 只读系统目录，不读业务表；供 rxdb_batch_delete 与 rxdb_existing_ids 按 id 真实类型比较。
 *
 * @param p_table 表名
 * @param p_schema schema 名称
 * @returns id 列类型的数组 regtype
 */
CREATE OR REPLACE FUNCTION public.rxdb_id_array_type(
  p_table text,
  p_schema text
)
RETURNS pg_catalog.regtype
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_id_type pg_catalog.regtype;
  v_id_array_type pg_catalog.regtype;
BEGIN
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

  RETURN v_id_array_type;
END;
$$;

/**
 * rxdb_execute_batch_update - 共享 UPDATE 执行器，按需返回最终行
 *
 * 逐行执行普通 UPDATE，只 SET 该行出现的非 id 列；未出现的列保持原值。
 * 只受调用方 UPDATE / SELECT 策略约束，不受 INSERT 策略约束。
 * 某行更新零行时抛错：行仍存在 → 42501（reason=denied），行已不存在 → RX001（reason=gone）。
 *
 * @param p_table 表名
 * @param p_schema schema 名称
 * @param p_data JSONB 数组，每个元素: {id, ...本次修改的列}
 * @param p_return_rows 是否执行 RETURNING；计数调用保留原有列权限与 RLS 语义
 * @returns {updated, rows}
 */
CREATE OR REPLACE FUNCTION public.rxdb_execute_batch_update(
  p_table text,
  p_schema text,
  p_data jsonb,
  p_return_rows boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  item jsonb;
  set_clause text;
  v_id text;
  v_reason text;
  rc int;
  updated_row jsonb;
  updated_rows jsonb := '[]'::jsonb;
  updated_count int := 0;
  update_sql text;
BEGIN
  IF p_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table;
  END IF;

  FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_data)
  LOOP
    -- 只有 id 时退化为 SET id = t.id：仍走一次 UPDATE，让 RLS 与零行判定照常生效
    SELECT COALESCE(
      pg_catalog.string_agg(
        pg_catalog.format(
          '%I = (pg_catalog.jsonb_populate_record(null::%I.%I, $1)).%I',
          key, p_schema, p_table, key
        ),
        ', '
      ),
      'id = t.id'
    )
    INTO set_clause
    FROM pg_catalog.jsonb_object_keys(item) AS keys(key)
    WHERE key != 'id';

    update_sql := pg_catalog.format(
      'UPDATE %I.%I AS t SET %s WHERE t.id = (pg_catalog.jsonb_populate_record(null::%I.%I, $1)).id',
      p_schema, p_table, set_clause, p_schema, p_table
    );
    IF p_return_rows THEN
      EXECUTE update_sql || ' RETURNING pg_catalog.to_jsonb(t)' INTO updated_row USING item;
    ELSE
      EXECUTE update_sql USING item;
    END IF;

    GET DIAGNOSTICS rc = ROW_COUNT;
    IF rc > 0 THEN
      updated_count := updated_count + rc;
      IF p_return_rows THEN
        updated_rows := updated_rows || pg_catalog.jsonb_build_array(updated_row);
      END IF;
      CONTINUE;
    END IF;

    -- 零行：探针区分「被行级权限拒绝」与「行已不存在」，两者都显式失败、整批回滚
    v_id := item->>'id';
    v_reason := CASE
      WHEN v_id = ANY(public.rxdb_existing_ids(p_table, p_schema, ARRAY[v_id])) THEN 'denied'
      ELSE 'gone'
    END;

    IF v_reason = 'denied' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'insufficient_privilege',
        MESSAGE = pg_catalog.format('rxdb: UPDATE denied by row-level security: %I.%I id=%s', p_schema, p_table, v_id),
        DETAIL = pg_catalog.jsonb_build_object(
          'op', 'UPDATE', 'schema', p_schema, 'table', p_table, 'entityId', v_id, 'reason', v_reason
        )::text;
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = 'RX001',
      MESSAGE = pg_catalog.format('rxdb: UPDATE target row is gone: %I.%I id=%s', p_schema, p_table, v_id),
      DETAIL = pg_catalog.jsonb_build_object(
        'op', 'UPDATE', 'schema', p_schema, 'table', p_table, 'entityId', v_id, 'reason', v_reason
      )::text;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object('updated', updated_count, 'rows', updated_rows);
END;
$$;

/**
 * rxdb_batch_update_rows - 批量部分列更新并返回服务器最终行
 */
CREATE OR REPLACE FUNCTION public.rxdb_batch_update_rows(
  p_table text,
  p_schema text DEFAULT 'public',
  p_data jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT public.rxdb_execute_batch_update(p_table, p_schema, p_data, true)->'rows';
$$;

/**
 * rxdb_batch_update - 批量部分列更新，保留原有计数返回值
 */
CREATE OR REPLACE FUNCTION public.rxdb_batch_update(
  p_table text,
  p_schema text DEFAULT 'public',
  p_data jsonb DEFAULT '[]'::jsonb
)
RETURNS int
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT (public.rxdb_execute_batch_update(p_table, p_schema, p_data, false)->>'updated')::int;
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
  v_id_array_type pg_catalog.regtype;
BEGIN
  IF p_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table;
  END IF;

  v_id_array_type := public.rxdb_id_array_type(p_table, p_schema);

  EXECUTE pg_catalog.format(
    'DELETE FROM %I.%I WHERE id = ANY($1::%s)',
    p_schema, p_table, v_id_array_type
  ) USING p_ids;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

/**
 * rxdb_existing_ids - 同步表的存在性探针
 *
 * 只回答「这些 id 在同步表里是否存在」，不返回列值；判定不受调用方 RLS 影响，
 * 供写路径在零行时区分「被行级权限拒绝」与「行已不存在」。
 * 只接受挂了 RxDB 同步日志触发器的表，其余一律 22023，不可探测。
 *
 * @param p_table 表名
 * @param p_schema schema 名称
 * @param p_ids 待判定的 id（文本形式）
 * @returns p_ids 中存在的元素（原样返回，顺序不保证）
 */
CREATE OR REPLACE FUNCTION public.rxdb_existing_ids(
  p_table text,
  p_schema text,
  p_ids text[]
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
AS $$
DECLARE
  v_array_type pg_catalog.regtype;
  result text[];
BEGIN
  IF p_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table;
  END IF;

  -- 只看触发器名不够：任何人都能在自己的表上起同名触发器，必须同时核对触发函数
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS tg
    JOIN pg_catalog.pg_class AS c ON c.oid = tg.tgrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = p_schema
      AND c.relname = p_table
      AND c.relkind IN ('r', 'p')
      AND tg.tgname = 'rxdb_sync_trigger'
      AND tg.tgfoid = 'public.rxdb_log_change_trigger'::pg_catalog.regproc
  ) THEN
    RAISE EXCEPTION 'rxdb: existence probe only accepts rxdb sync tables: %.%', p_schema, p_table
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_array_type := public.rxdb_id_array_type(p_table, p_schema);

  -- 按 id 真实类型比较（走主键索引），返回调用方传入的原样元素
  EXECUTE pg_catalog.format(
    'SELECT pg_catalog.array_agg(p.raw)
       FROM ROWS FROM (pg_catalog.unnest($1), pg_catalog.unnest($1::%s)) AS p(raw, typed)
      WHERE EXISTS (SELECT 1 FROM %I.%I AS t WHERE t.id = p.typed)',
    v_array_type, p_schema, p_table
  ) INTO result USING p_ids;

  RETURN COALESCE(result, '{}'::text[]);
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
  v_relation_kind text;
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
      c.relforcerowsecurity,
      CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'p' THEN 'partitioned_table'
        WHEN 'v' THEN 'view'
        ELSE c.relkind::text
      END
    INTO v_exists, v_rls_enabled, v_rls_forced, v_relation_kind
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = v_schema
      AND c.relname = v_table
      AND c.relkind IN ('r', 'p', 'v');

    result := result || pg_catalog.jsonb_build_object(
      'schema', v_schema,
      'table', v_table,
      'exists', COALESCE(v_exists, false),
      'rlsEnabled', COALESCE(v_rls_enabled, false),
      'rlsForced', COALESCE(v_rls_forced, false),
      'relationKind', v_relation_kind
    );

    v_exists := NULL;
    v_rls_enabled := NULL;
    v_rls_forced := NULL;
    v_relation_kind := NULL;
  END LOOP;

  RETURN result;
END;
$$;

/**
 * rxdb_assert_push_integrity - 推送载荷的日志与业务写配对校验（US-218 阶段 A）
 *
 * 只读四个载荷参数，不碰任何表；rxdb_mutations 在快照与写 rxdb_change 之前调用，失败时什么都没写。
 * 键 = (COALESCE(schema, 'public'), table, id 文本)；main 日志 = COALESCE(branchId, 'main') = 'main'。
 * 按序检查，报第一处违规（ERRCODE RX002，DETAIL 为 JSON {op, schema, table, entityId, reason}）：
 * 1. explicit_log_in_trigger_mode：p_skip_sync = false 却带了 main 日志
 * 2. duplicate_write：同一键在 p_upserts ∪ p_updates ∪ p_deletes 出现多于一次
 * 3. unpaired_change：main 日志的键没有业务写
 * 4. unpaired_write：p_skip_sync = true 时业务写的键没有 main 日志
 * 5. op_mismatch：键的最后一条 main 日志为 DELETE ⇔ 键不在 p_deletes
 *
 * 授权给 anon / authenticated（见文末 GRANT）：rxdb_mutations 是 SECURITY INVOKER，以调用者身份调它，
 * 撤销客户端的 EXECUTE 会让所有推送失败。客户端直接调用它不获得任何额外能力——INVOKER、STABLE、
 * 只校验传入的参数、不读不写任何表。
 */
CREATE OR REPLACE FUNCTION public.rxdb_assert_push_integrity(
  p_upserts jsonb,
  p_deletes jsonb,
  p_changes jsonb,
  p_skip_sync boolean,
  p_updates jsonb
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_violation record;
BEGIN
  WITH writes AS (
    SELECT w.*, pg_catalog.row_number() OVER (ORDER BY w.arr, w.grp, w.elem) AS ord
    FROM (
      SELECT 1 AS arr, g.grp, e.elem, 'INSERT' AS op,
        COALESCE(g.value->>'schema', 'public') AS schema_name, g.value->>'table' AS table_name, e.value->>'id' AS entity_id
      FROM pg_catalog.jsonb_array_elements(p_upserts) WITH ORDINALITY AS g(value, grp),
        pg_catalog.jsonb_array_elements(g.value->'data') WITH ORDINALITY AS e(value, elem)
      UNION ALL
      SELECT 2, g.grp, e.elem, 'UPDATE',
        COALESCE(g.value->>'schema', 'public'), g.value->>'table', e.value->>'id'
      FROM pg_catalog.jsonb_array_elements(p_updates) WITH ORDINALITY AS g(value, grp),
        pg_catalog.jsonb_array_elements(g.value->'data') WITH ORDINALITY AS e(value, elem)
      UNION ALL
      SELECT 3, g.grp, e.elem, 'DELETE',
        COALESCE(g.value->>'schema', 'public'), g.value->>'table', e.value
      FROM pg_catalog.jsonb_array_elements(p_deletes) WITH ORDINALITY AS g(value, grp),
        pg_catalog.jsonb_array_elements_text(g.value->'ids') WITH ORDINALITY AS e(value, elem)
    ) AS w
  ),
  logs AS (
    SELECT c.ord, c.value->>'type' AS op,
      COALESCE(c.value->>'schema', 'public') AS schema_name, c.value->>'table' AS table_name, c.value->>'entityId' AS entity_id
    FROM pg_catalog.jsonb_array_elements(p_changes) WITH ORDINALITY AS c(value, ord)
    WHERE COALESCE(c.value->>'branchId', 'main') = 'main'
  ),
  last_logs AS (
    SELECT DISTINCT ON (schema_name, table_name, entity_id) *
    FROM logs
    ORDER BY schema_name, table_name, entity_id, ord DESC
  ),
  violations AS (
    SELECT 1 AS rule, l.ord, 'explicit_log_in_trigger_mode' AS reason, l.op, l.schema_name, l.table_name, l.entity_id
    FROM logs AS l
    WHERE NOT p_skip_sync
    UNION ALL
    SELECT 2, d.ord, 'duplicate_write', d.op, d.schema_name, d.table_name, d.entity_id
    FROM (
      SELECT w.*, pg_catalog.row_number() OVER (PARTITION BY w.schema_name, w.table_name, w.entity_id ORDER BY w.ord) AS seen
      FROM writes AS w
    ) AS d
    WHERE d.seen = 2
    UNION ALL
    SELECT 3, l.ord, 'unpaired_change', l.op, l.schema_name, l.table_name, l.entity_id
    FROM logs AS l
    WHERE NOT EXISTS (
      SELECT 1 FROM writes AS w
      WHERE (w.schema_name, w.table_name, w.entity_id) = (l.schema_name, l.table_name, l.entity_id)
    )
    UNION ALL
    SELECT 4, w.ord, 'unpaired_write', w.op, w.schema_name, w.table_name, w.entity_id
    FROM writes AS w
    WHERE p_skip_sync AND NOT EXISTS (
      SELECT 1 FROM logs AS l
      WHERE (l.schema_name, l.table_name, l.entity_id) = (w.schema_name, w.table_name, w.entity_id)
    )
    UNION ALL
    SELECT 5, l.ord, 'op_mismatch', l.op, l.schema_name, l.table_name, l.entity_id
    FROM last_logs AS l
    WHERE (l.op = 'DELETE') <> EXISTS (
      SELECT 1 FROM writes AS w
      WHERE w.op = 'DELETE'
        AND (w.schema_name, w.table_name, w.entity_id) = (l.schema_name, l.table_name, l.entity_id)
    )
  )
  SELECT * INTO v_violation
  FROM violations
  ORDER BY rule, ord
  LIMIT 1;

  IF v_violation.rule IS NULL THEN
    RETURN;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'RX002',
    MESSAGE = pg_catalog.format(
      'rxdb: push integrity violation (%s): %I.%I id=%s',
      v_violation.reason, v_violation.schema_name, v_violation.table_name, v_violation.entity_id
    ),
    DETAIL = pg_catalog.jsonb_build_object(
      'op', v_violation.op, 'schema', v_violation.schema_name, 'table', v_violation.table_name,
      'entityId', v_violation.entity_id, 'reason', v_violation.reason
    )::text;
END;
$$;

/**
 * rxdb_mutations_apply_group - 对一组同表同操作的实体执行业务写（US-218 阶段 B）
 *
 * INSERT / UPDATE 直接委托 rxdb_batch_upsert / rxdb_batch_update（后者已自带零行时
 * denied(42501) / gone(RX001) 判定，调用方不需要重复）；DELETE 由本函数自己做零行判定，
 * 因为 rxdb_batch_delete 只是裸批量 DELETE，不区分「被拒绝」与「已不存在」。
 * 返回统一形状 {upserted, updated, deleted}，不适用的字段留空 / 0，调用方不用按 op 分支取值。
 *
 * @param p_op 'INSERT' | 'UPDATE' | 'DELETE'
 * @param p_schema schema 名称
 * @param p_table 表名
 * @param p_items INSERT/UPDATE 为 {id, ...}[]；DELETE 为 id 文本的 jsonb 数组
 * @param p_skip_sync 是否跳过同步触发器（决定 DELETE 零行要不要做 denied/gone 判定）
 * @returns {upserted: jsonb[], updated: int, deleted: int}
 */
CREATE OR REPLACE FUNCTION public.rxdb_mutations_apply_group(
  p_op text,
  p_schema text,
  p_table text,
  p_items jsonb,
  p_skip_sync boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_upserted jsonb := '[]'::jsonb;
  v_updated int := 0;
  v_deleted int := 0;
  v_ids_array text[];
  v_deleted_rows int;
  v_denied_ids text[];
BEGIN
  IF p_op = 'INSERT' THEN
    v_upserted := public.rxdb_batch_upsert(p_table, p_schema, p_items);
  ELSIF p_op = 'UPDATE' THEN
    IF p_skip_sync THEN
      v_updated := public.rxdb_batch_update(p_table, p_schema, p_items);
    ELSE
      v_upserted := public.rxdb_batch_update_rows(p_table, p_schema, p_items);
      v_updated := pg_catalog.jsonb_array_length(v_upserted);
    END IF;
  ELSE
    SELECT pg_catalog.array_agg(value) INTO v_ids_array
    FROM pg_catalog.jsonb_array_elements_text(p_items) AS ids(value);

    v_deleted_rows := public.rxdb_batch_delete(p_table, p_schema, v_ids_array);
    v_deleted := v_deleted_rows;

    -- 推送路径：少删的行若对探针仍存在，就是被行级权限拒绝，不能当成功（US-218 AC#1、AC#2）；
    -- 已不存在的行按幂等成功处理。直写路径零行删除不触发日志触发器，不需要判定——也因此直写删除
    -- 不存在或被 RLS 滤掉的行静默成功，与直写 UPDATE 的 42501 / RX001 不对称；这是 US-218 起的既有语义，
    -- 要改须连同 mutations() 的删除返回值一起定，不在 UPDATE 语义修复（US-223）里顺带收紧
    IF p_skip_sync AND v_deleted_rows < pg_catalog.cardinality(v_ids_array) THEN
      v_denied_ids := public.rxdb_existing_ids(p_table, p_schema, v_ids_array);
      IF pg_catalog.cardinality(v_denied_ids) > 0 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'insufficient_privilege',
          MESSAGE = pg_catalog.format('rxdb: DELETE denied by row-level security: %I.%I id=%s', p_schema, p_table, v_denied_ids[1]),
          DETAIL = pg_catalog.jsonb_build_object(
            'op', 'DELETE', 'schema', p_schema, 'table', p_table,
            'entityId', v_denied_ids[1], 'reason', 'denied'
          )::text;
      END IF;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object('upserted', v_upserted, 'updated', v_updated, 'deleted', v_deleted);
END;
$$;

/**
 * rxdb_mutations_depends_on - 从外键违例解析 dependsOn（US-218 阶段 B FR-022 / T053）
 *
 * 单列外键（conkey 长度为 1）→ 用子行该列的值与父表 schema/table 给出
 * {schema, table, entityId}；多列外键，或子行载荷里没有该列（例如删除被引用行时
 * 子表侧的载荷只是被删父行的 id、没有任何列名）→ 退化为 {constraint}。
 *
 * @param p_schema 子表 schema
 * @param p_table 子表名
 * @param p_constraint 触发 23503 的外键约束名（GET STACKED DIAGNOSTICS CONSTRAINT_NAME）
 * @param p_item 子行本次写入的 jsonb 载荷（INSERT/UPDATE 为对象；DELETE 为被删 id 的标量）
 * @returns {schema, table, entityId} 或 {constraint}
 */
CREATE OR REPLACE FUNCTION public.rxdb_mutations_depends_on(
  p_schema text,
  p_table text,
  p_constraint text,
  p_item jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_conkey smallint[];
  v_confrelid pg_catalog.oid;
  v_column_name text;
  v_parent_schema text;
  v_parent_table text;
  v_entity_id text;
BEGIN
  SELECT con.conkey, con.confrelid
  INTO v_conkey, v_confrelid
  FROM pg_catalog.pg_constraint AS con
  WHERE con.conrelid = pg_catalog.format('%I.%I', p_schema, p_table)::pg_catalog.regclass
    AND con.conname = p_constraint
    AND con.contype = 'f';

  IF v_conkey IS NULL OR pg_catalog.array_length(v_conkey, 1) != 1 THEN
    RETURN pg_catalog.jsonb_build_object('constraint', p_constraint);
  END IF;

  SELECT att.attname INTO v_column_name
  FROM pg_catalog.pg_attribute AS att
  WHERE att.attrelid = pg_catalog.format('%I.%I', p_schema, p_table)::pg_catalog.regclass
    AND att.attnum = v_conkey[1];

  v_entity_id := p_item->>v_column_name;
  IF v_entity_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('constraint', p_constraint);
  END IF;

  SELECT ns.nspname, cls.relname
  INTO v_parent_schema, v_parent_table
  FROM pg_catalog.pg_class AS cls
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
  WHERE cls.oid = v_confrelid;

  RETURN pg_catalog.jsonb_build_object('schema', v_parent_schema, 'table', v_parent_table, 'entityId', v_entity_id);
END;
$$;

/**
 * rxdb_mutations_replay_group - 组失败后逐实体各自子事务重放（US-218 阶段 B）
 *
 * rxdb_mutations 在 p_receipts = true、整组子事务因可归类错误回滚后调用。每个实体单独
 * 一个子事务调 rxdb_mutations_apply_group：42501 → denied、RX001 → gone、
 * 23503 → dependency（并解析 dependsOn）；其他错误原样上抛，让整轮失败。
 * 单独成函数是为了让 rxdb_mutations 的嵌套保持在 3 层以内。
 *
 * @param p_op 'INSERT' | 'UPDATE' | 'DELETE'
 * @param p_schema schema 名称
 * @param p_table 表名
 * @param p_items 同 rxdb_mutations_apply_group
 * @param p_skip_sync 同 rxdb_mutations_apply_group
 * @returns {upserted, updated, deleted, entities}；entities 以 rxdb_mutations 内部的实体键
 *          jsonb_build_array(schema, table, entityId)::text 为键，值为
 *          {status: 'applied'} 或 {status: 'rejected', code, reason, message, dependsOn?}
 */
CREATE OR REPLACE FUNCTION public.rxdb_mutations_replay_group(
  p_op text,
  p_schema text,
  p_table text,
  p_items jsonb,
  p_skip_sync boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_upserted jsonb := '[]'::jsonb;
  v_updated int := 0;
  v_deleted int := 0;
  v_entities jsonb := '{}'::jsonb;
  v_item jsonb;
  v_entity_id text;
  v_result jsonb;
  v_outcome jsonb;
  v_message text;
  v_constraint text;
BEGIN
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) AS t(value)
  LOOP
    v_entity_id := CASE WHEN p_op = 'DELETE' THEN v_item #>> '{}' ELSE v_item->>'id' END;
    v_outcome := '{"status": "applied"}'::jsonb;

    BEGIN
      v_result := public.rxdb_mutations_apply_group(
        p_op, p_schema, p_table, pg_catalog.jsonb_build_array(v_item), p_skip_sync
      );
      v_upserted := v_upserted || (v_result->'upserted');
      v_updated := v_updated + (v_result->>'updated')::int;
      v_deleted := v_deleted + (v_result->>'deleted')::int;
    EXCEPTION
      WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
        v_outcome := pg_catalog.jsonb_build_object(
          'status', 'rejected', 'code', '42501', 'reason', 'denied', 'message', v_message
        );
      WHEN SQLSTATE 'RX001' THEN
        GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
        v_outcome := pg_catalog.jsonb_build_object(
          'status', 'rejected', 'code', 'RX001', 'reason', 'gone', 'message', v_message
        );
      WHEN foreign_key_violation THEN
        GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT, v_constraint = CONSTRAINT_NAME;
        v_outcome := pg_catalog.jsonb_build_object(
          'status', 'rejected', 'code', '23503', 'reason', 'dependency', 'message', v_message,
          'dependsOn', public.rxdb_mutations_depends_on(p_schema, p_table, v_constraint, v_item)
        );
    END;

    v_entities := v_entities || pg_catalog.jsonb_build_object(
      pg_catalog.jsonb_build_array(p_schema, p_table, v_entity_id)::text, v_outcome
    );
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'upserted', v_upserted, 'updated', v_updated, 'deleted', v_deleted, 'entities', v_entities
  );
END;
$$;

/**
 * rxdb_insert_changes - 写 rxdb_change 的唯一入口（US-218 阶段 C，内部函数）
 *
 * SECURITY DEFINER：生产权限脚本撤销了客户端对 rxdb_change 的写权限，日志只能经由本函数落库。
 * 只接受 rxdb_mutations 的调用：调用前它把事务级设置 rxdb.insert_changes 置为 'on'，本函数入口校验后立刻消费；
 * 客户端直接调用时设置不是 'on'，抛 42501（PostgREST 不暴露 pg_catalog.set_config，客户端无法预置）。
 * 写入按 ("clientId", "localId") 去重（ON CONFLICT DO NOTHING），重放不重复落库。
 *
 * @param p_changes 待写的 RxDBChange 记录（已由 rxdb_mutations 规范化并按原顺序筛好）
 * @returns {changes: 新写条数, max_change_id, change_id_mapping: [{localId, remoteId}]}
 */
CREATE OR REPLACE FUNCTION public.rxdb_insert_changes(p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  changes_count int := 0;
  max_change_id bigint := NULL;
  mapped_max_change_id bigint := NULL;
  change_id_mapping jsonb := '[]'::jsonb;
  normalized_changes jsonb := '[]'::jsonb;
  v_change jsonb;
  v_table_name text;
  v_bucket_column text;
  v_bucket text;
  v_row_bucket text;
  v_old_bucket text;
  v_move_key text;
  v_moved jsonb := '{}'::jsonb;
  v_id_type text;
  v_is_main boolean;
  v_entity_id text;
  v_branch_id text;
  v_inserted jsonb;
BEGIN
  IF pg_catalog.current_setting('rxdb.insert_changes', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'rxdb: rxdb_insert_changes may only be called by rxdb_mutations';
  END IF;
  -- 消费守卫：一次授权只够一次调用
  PERFORM pg_catalog.set_config('rxdb.insert_changes', '', true);

  -- 非 main 日志只能写进调用者拥有的分支，第一次写入即认领（US-225）。非 main 推送不做业务写，
  -- 不经过任何业务表的 RLS，这里是它唯一的授权点。按分支 id 排序认领，并发推送多个分支时加锁顺序一致
  FOR v_branch_id IN
    SELECT DISTINCT c->>'branchId'
    FROM pg_catalog.jsonb_array_elements(p_changes) AS changes(c)
    WHERE COALESCE(c->>'branchId', 'main') <> 'main'
    ORDER BY 1
  LOOP
    PERFORM public.rxdb_claim_branch(v_branch_id);
  END LOOP;

  -- 分区日志的 bucket 只认服务端状态，载荷里的 bucket 字段一律不认，未分区实体的日志也不带 bucket。
  -- main 的业务写已经在调用方事务中完成，SECURITY DEFINER 读得到最终行；行已不在时用 rxdb_mutations
  -- 固化的前后快照（前快照是业务写之前读的行，显式删除的换成了触发器捕获的实际 OLD）。
  -- 非 main 推送不做业务写、不经过业务表的 RLS：不以 definer 回读业务行（否则调用者看不见的行在不在、
  -- 在谁的区，会从报错里漏出来），只用 rxdb_mutations 以调用者身份读到的前快照或客户端补的 inversePatch，
  -- bucket 还必须是调用者自己可读的分区，否则谁都能往别人的分区频道发通知、抬别人的水位。
  -- entityId 必须能转成业务表 id 列的类型：按区拉取按这个类型找当前行。main 的业务写已经按它转过，
  -- 这里统一校验一次，转不了就整批拒绝（22P02）。
  -- 业务表按 namespace 定位：登记时 namespace 就是 schema（rxdb_enable_sync_for_table），载荷的 schema 字段已被 rxdb_mutations 去掉。
  -- 换区与触发器同口径：main 的业务写把行从 A 区挪到 B 区时，A 区先记一条不带内容的移除、本条记成 B 区的写入，
  -- 否则只能读 A 区的客户端永远不知道这一行已经离开。换区前的区取前快照；同一实体同批多次写入只补一条移除。
  -- 变更历史（US-229）：main 上落库的每条源日志记一条完整快照的历史，来源取 rxdbHistorySource（rxdb_mutations
  -- 给被级联删除的子行标 cascade，其余为 push）；换区补的那条移除不记。rxdbHistory / rxdbHistoryType 是本函数
  -- 自己打的标，入口一律先摘掉，载荷带进来的不认
  FOR v_change IN SELECT value FROM pg_catalog.jsonb_array_elements(p_changes)
  LOOP
    SELECT "tableName", "bucketColumn"
    INTO v_table_name, v_bucket_column
    FROM public.rxdb_sync_entity
    WHERE namespace = v_change->>'namespace'
      AND entity = v_change->>'entity';

    v_change := v_change - 'bucket' - 'rxdbHistory' - 'rxdbHistoryType';
    IF COALESCE(v_change->>'branchId', 'main') = 'main' THEN
      v_change := v_change || pg_catalog.jsonb_build_object(
        'rxdbHistory', COALESCE(v_change->>'rxdbHistorySource', 'push')
      );
    END IF;
    IF v_bucket_column IS NOT NULL THEN
      v_entity_id := v_change->>'entityId';
      v_row_bucket := NULL;
      v_is_main := COALESCE(v_change->>'branchId', 'main') = 'main';
      SELECT pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
      INTO v_id_type
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = pg_catalog.format('%I.%I', v_change->>'namespace', v_table_name)::regclass
        AND attribute.attname = 'id'
        AND NOT attribute.attisdropped;

      IF v_is_main AND v_change->>'type' <> 'DELETE' THEN
        EXECUTE pg_catalog.format(
          'SELECT NULLIF(%I::text, '''') FROM %I.%I WHERE id = $1::%s LIMIT 1',
          v_bucket_column,
          v_change->>'namespace',
          v_table_name,
          v_id_type
        ) INTO v_row_bucket USING v_entity_id;
      ELSE
        EXECUTE pg_catalog.format('SELECT CAST($1 AS %s)', v_id_type) USING v_entity_id;
      END IF;

      v_bucket := COALESCE(
        v_row_bucket,
        NULLIF(v_change->'afterData'->>v_bucket_column, ''),
        NULLIF(v_change->'beforeData'->>v_bucket_column, '')
      );
      IF v_bucket IS NULL THEN
        RAISE EXCEPTION 'rxdb: bucketed change %.%/% has no bucket',
          v_change->>'namespace', v_change->>'entity', v_entity_id
          USING ERRCODE = 'not_null_violation';
      END IF;
      IF NOT v_is_main AND NOT (v_bucket = ANY(public.rxdb_caller_buckets())) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'insufficient_privilege',
          MESSAGE = 'rxdb: bucket is not authorized for the current caller';
      END IF;
      v_change := pg_catalog.jsonb_set(v_change, ARRAY['bucket'], pg_catalog.to_jsonb(v_bucket), true);

      v_old_bucket := NULLIF(v_change->'beforeData'->>v_bucket_column, '');
      v_move_key := pg_catalog.jsonb_build_array(
        v_change->>'namespace', v_change->>'entity', v_entity_id, v_old_bucket
      )::text;
      IF v_is_main AND v_row_bucket IS NOT NULL AND v_old_bucket IS NOT NULL AND v_old_bucket <> v_row_bucket THEN
        normalized_changes := normalized_changes || CASE
          WHEN v_moved ? v_move_key THEN '[]'::jsonb
          ELSE pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'namespace', v_change->>'namespace', 'entity', v_change->>'entity', 'entityId', v_entity_id,
            'type', 'DELETE', 'branchId', 'main', 'bucket', v_old_bucket,
            'createdAt', v_change->'createdAt', 'updatedAt', v_change->'updatedAt'
          ))
        END;
        v_moved := v_moved || pg_catalog.jsonb_build_object(v_move_key, true);
        v_change := pg_catalog.jsonb_set(
          v_change || pg_catalog.jsonb_build_object('rxdbHistoryType', v_change->'type'), ARRAY['type'], '"INSERT"'::jsonb
        );
      END IF;
    END IF;

    normalized_changes := normalized_changes || pg_catalog.jsonb_build_array(v_change);
  END LOOP;

  -- 整批一条 INSERT：日志按原顺序拿 id，实时通知按语句分批（rxdb_change_broadcast 是语句级触发器）
  WITH inserted AS (
    INSERT INTO public.rxdb_change (
      namespace, entity, bucket, "entityId", type, patch, "inversePatch",
      "branchId", "clientId", "localId", "createdAt", "updatedAt",
      "beforeData", "afterData", "snapshotComplete"
    )
    SELECT
      c->>'namespace',
      c->>'entity',
      c->>'bucket',
      c->>'entityId',
      c->>'type',
      CASE WHEN metadata.bucketed THEN NULL ELSE c->'patch' END,
      CASE WHEN metadata.bucketed THEN NULL ELSE c->'inversePatch' END,
      COALESCE(c->>'branchId', 'main'),
      c->>'clientId',
      (c->>'localId')::integer,
      COALESCE((c->>'createdAt')::timestamptz, pg_catalog.now()),
      COALESCE((c->>'updatedAt')::timestamptz, pg_catalog.now()),
      CASE WHEN metadata.bucketed THEN NULL ELSE c->'beforeData' END,
      CASE WHEN metadata.bucketed THEN NULL ELSE c->'afterData' END,
      CASE WHEN metadata.bucketed THEN false ELSE COALESCE((c->>'snapshotComplete')::boolean, false) END
    FROM pg_catalog.jsonb_array_elements(normalized_changes) WITH ORDINALITY AS changes(c, ordinality)
    CROSS JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1
        FROM public.rxdb_sync_entity AS entity
        WHERE entity.namespace = c->>'namespace'
          AND entity.entity = c->>'entity'
          AND entity."bucketColumn" IS NOT NULL
      ) AS bucketed
    ) AS metadata
    ORDER BY ordinality
    ON CONFLICT ("clientId", "localId")
      WHERE "clientId" IS NOT NULL AND "localId" IS NOT NULL
      DO NOTHING
    RETURNING id, "clientId", "localId", namespace, entity, "entityId", type
  )
  SELECT
    pg_catalog.count(*),
    pg_catalog.max(id),
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(inserted)), '[]'::jsonb)
  INTO changes_count, max_change_id, v_inserted
  FROM inserted;

  -- 历史对上它自己那条日志：客户端的源变更按 ("clientId", "localId")，服务端补的（级联删除）按实体与操作，
  -- 同键多条按出现顺序配。重放被 ON CONFLICT 跳过的源变更没有日志，也就不记历史
  INSERT INTO public.rxdb_change_history (
    "changeId", namespace, entity, "entityId", bucket, type, patch, "inversePatch",
    "beforeData", "afterData", actor, role, source, "clientId", "localId", "branchId"
  )
  SELECT
    logged.id,
    source.c->>'namespace',
    source.c->>'entity',
    source.c->>'entityId',
    source.c->>'bucket',
    COALESCE(source.c->>'rxdbHistoryType', source.c->>'type'),
    -- 规范化后的变更用 JSON null 表示「没有」（新增没有前快照、删除没有后快照），历史里存成 SQL NULL
    NULLIF(source.c->'patch', 'null'::jsonb),
    NULLIF(source.c->'inversePatch', 'null'::jsonb),
    NULLIF(source.c->'beforeData', 'null'::jsonb),
    NULLIF(source.c->'afterData', 'null'::jsonb),
    auth.uid(),
    auth.role(),
    source.c->>'rxdbHistory',
    source.c->>'clientId',
    (source.c->>'localId')::integer,
    'main'
  FROM (
    SELECT
      keyed.c,
      keyed.ordinality,
      keyed.match_key,
      pg_catalog.row_number() OVER (PARTITION BY keyed.match_key ORDER BY keyed.ordinality) AS match_rank
    FROM (
      SELECT
        c,
        ordinality,
        CASE
          WHEN c->>'clientId' IS NOT NULL AND c->>'localId' IS NOT NULL
            THEN pg_catalog.jsonb_build_array(c->>'clientId', (c->>'localId')::integer)::text
          ELSE pg_catalog.jsonb_build_array(c->>'namespace', c->>'entity', c->>'entityId', c->>'type')::text
        END AS match_key
      FROM pg_catalog.jsonb_array_elements(normalized_changes) WITH ORDINALITY AS changes(c, ordinality)
    ) AS keyed
  ) AS source
  JOIN (
    SELECT
      keyed.id,
      keyed.match_key,
      pg_catalog.row_number() OVER (PARTITION BY keyed.match_key ORDER BY keyed.id) AS match_rank
    FROM (
      SELECT
        (row->>'id')::integer AS id,
        CASE
          WHEN row->>'clientId' IS NOT NULL AND row->>'localId' IS NOT NULL
            THEN pg_catalog.jsonb_build_array(row->>'clientId', (row->>'localId')::integer)::text
          ELSE pg_catalog.jsonb_build_array(row->>'namespace', row->>'entity', row->>'entityId', row->>'type')::text
        END AS match_key
      FROM pg_catalog.jsonb_array_elements(v_inserted) AS rows(row)
    ) AS keyed
  ) AS logged
    ON logged.match_key = source.match_key AND logged.match_rank = source.match_rank
  WHERE source.c ? 'rxdbHistory'
  ORDER BY source.ordinality;

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

  RETURN pg_catalog.jsonb_build_object(
    'changes', changes_count,
    'max_change_id', max_change_id,
    'change_id_mapping', change_id_mapping
  );
END;
$$;

/**
 * rxdb_mutations_deferred_columns - 校验 rxdb_mutations 的延迟外键列（US-038）
 *
 * 每一列都必须：标识符合法、表与列存在、不是 id、可空、属于某个外键、所在的外键都不是 MATCH FULL
 * （MATCH FULL 下复合外键的一列为空、另一列不空直接违约，先写空行不通）。不合格抛 RX003，此时什么都还没写。
 *
 * @param p_deferred_columns JSONB 数组，每个元素: {schema, table, column}
 * @returns {["schema","table"]: [column, ...]}；空数组返回 {}
 */
CREATE OR REPLACE FUNCTION public.rxdb_mutations_deferred_columns(p_deferred_columns jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_schema text;
  v_table text;
  v_column text;
  v_relation regclass;
  v_attnum smallint;
  v_not_null boolean;
  v_key text;
  v_result jsonb := '{}'::jsonb;
BEGIN
  IF p_deferred_columns IS NULL OR pg_catalog.jsonb_typeof(p_deferred_columns) != 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'RX003', MESSAGE = 'rxdb: p_deferred_columns must be a JSON array';
  END IF;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_deferred_columns)
  LOOP
    v_schema := CASE WHEN pg_catalog.jsonb_typeof(v_item) = 'object' THEN v_item->>'schema' END;
    v_table := CASE WHEN pg_catalog.jsonb_typeof(v_item) = 'object' THEN v_item->>'table' END;
    v_column := CASE WHEN pg_catalog.jsonb_typeof(v_item) = 'object' THEN v_item->>'column' END;
    IF v_schema IS NULL OR v_table IS NULL OR v_column IS NULL
       OR v_schema !~ '^[A-Za-z_][A-Za-z0-9_]*$' OR v_table !~ '^[A-Za-z_][A-Za-z0-9_]*$'
       OR v_column !~ '^[A-Za-z_][A-Za-z0-9_]*$' THEN
      RAISE EXCEPTION USING ERRCODE = 'RX003', MESSAGE = pg_catalog.format('rxdb: invalid deferred column %s', v_item);
    END IF;

    v_relation := pg_catalog.to_regclass(pg_catalog.format('%I.%I', v_schema, v_table));
    IF v_relation IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'RX003', MESSAGE = pg_catalog.format('rxdb: deferred column table %I.%I does not exist', v_schema, v_table);
    END IF;
    SELECT attribute.attnum, attribute.attnotnull INTO v_attnum, v_not_null
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = v_relation AND attribute.attname = v_column
      AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    IF v_attnum IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'RX003', MESSAGE = pg_catalog.format('rxdb: deferred column %I.%I.%I does not exist', v_schema, v_table, v_column);
    END IF;
    IF v_column = 'id' THEN
      RAISE EXCEPTION USING ERRCODE = 'RX003', MESSAGE = pg_catalog.format('rxdb: the id of %I.%I cannot be deferred', v_schema, v_table);
    END IF;
    IF v_not_null THEN
      RAISE EXCEPTION USING ERRCODE = 'RX003', MESSAGE = pg_catalog.format('rxdb: deferred column %I.%I.%I is NOT NULL', v_schema, v_table, v_column);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = v_relation AND constraint_row.contype = 'f' AND v_attnum = ANY(constraint_row.conkey)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'RX003', MESSAGE = pg_catalog.format('rxdb: deferred column %I.%I.%I is not part of a foreign key', v_schema, v_table, v_column);
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = v_relation AND constraint_row.contype = 'f' AND v_attnum = ANY(constraint_row.conkey)
        AND constraint_row.confmatchtype = 'f'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'RX003', MESSAGE = pg_catalog.format('rxdb: deferred column %I.%I.%I belongs to a MATCH FULL foreign key', v_schema, v_table, v_column);
    END IF;

    v_key := pg_catalog.jsonb_build_array(v_schema, v_table)::text;
    IF NOT COALESCE(v_result->v_key, '[]'::jsonb) ? v_column THEN
      v_result := v_result || pg_catalog.jsonb_build_object(v_key, COALESCE(v_result->v_key, '[]'::jsonb) || pg_catalog.to_jsonb(v_column));
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

/**
 * rxdb_mutations_apply_groups - rxdb_mutations 第 3 步：按载荷顺序执行业务写（US-218 阶段 B，US-038 抽出）
 *
 * 只执行 p_ops 里的那几类组，跳过不是 pending 的实体。p_receipts = true 时每组一个子事务，组失败且错误可归类时
 * 逐实体重放；否则第一个错误原样上抛。INSERT / UPDATE 组里属于 p_deferred 的列先拿掉，记进返回值的 deferred。
 *
 * @param p_groups rxdb_mutations 固化的组
 * @param p_entities 实体状态（键为 ["schema","table","entityId"] 的文本）
 * @param p_ops 本遍执行的操作
 * @param p_skip_sync 同 rxdb_mutations
 * @param p_receipts 同 rxdb_mutations
 * @param p_deferred rxdb_mutations_deferred_columns 的结果
 * @returns {entities, upserted, updated, deleted, deferred: {实体键: {schema, table, entityId, values}}}
 */
CREATE OR REPLACE FUNCTION public.rxdb_mutations_apply_groups(
  p_groups jsonb,
  p_entities jsonb,
  p_ops text[],
  p_skip_sync boolean,
  p_receipts boolean,
  p_deferred jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_entities jsonb := p_entities;
  v_phase_group record;
  v_item jsonb;
  v_filtered_items jsonb;
  entity_id text;
  v_entity_key text;
  v_group_ok boolean;
  v_group_result jsonb;
  v_columns text[];
  v_column text;
  v_values jsonb;
  v_deferred_values jsonb := '{}'::jsonb;
  v_upserted jsonb := '[]'::jsonb;
  v_updated int := 0;
  v_deleted int := 0;
BEGIN
  FOR v_phase_group IN
    SELECT g.ord AS grp_ord, g.val->>'schema' AS schema_name, g.val->>'table' AS table_name,
           g.val->>'op' AS op, g.val->'items' AS items
    FROM pg_catalog.jsonb_array_elements(p_groups) WITH ORDINALITY AS g(val, ord)
    WHERE g.val->>'op' = ANY(p_ops)
    ORDER BY g.ord
  LOOP
    v_columns := ARRAY(
      SELECT pg_catalog.jsonb_array_elements_text(
        COALESCE(p_deferred->(pg_catalog.jsonb_build_array(v_phase_group.schema_name, v_phase_group.table_name)::text), '[]'::jsonb)
      )
    );
    v_filtered_items := '[]'::jsonb;
    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_phase_group.items) AS t(value)
    LOOP
      entity_id := CASE WHEN v_phase_group.op = 'DELETE' THEN v_item #>> '{}' ELSE v_item->>'id' END;
      v_entity_key := pg_catalog.jsonb_build_array(v_phase_group.schema_name, v_phase_group.table_name, entity_id)::text;
      CONTINUE WHEN v_entities->v_entity_key->>'status' IS DISTINCT FROM 'pending';
      -- 延迟列：拿掉非空的值（新建即为空、修改即不改），记下来留给补写
      IF v_phase_group.op != 'DELETE' AND pg_catalog.cardinality(v_columns) > 0 THEN
        v_values := '{}'::jsonb;
        FOREACH v_column IN ARRAY v_columns
        LOOP
          IF v_item ? v_column AND pg_catalog.jsonb_typeof(v_item->v_column) != 'null' THEN
            v_values := v_values || pg_catalog.jsonb_build_object(v_column, v_item->v_column);
            v_item := v_item - v_column;
          END IF;
        END LOOP;
        IF v_values != '{}'::jsonb THEN
          v_deferred_values := v_deferred_values || pg_catalog.jsonb_build_object(v_entity_key, pg_catalog.jsonb_build_object(
            'schema', v_phase_group.schema_name, 'table', v_phase_group.table_name, 'entityId', entity_id,
            'values', COALESCE(v_deferred_values->v_entity_key->'values', '{}'::jsonb) || v_values
          ));
        END IF;
        -- 修改只改了延迟列：拿掉之后只剩 id，这一遍没有可写的，直接留给补写（被拒、已不存在都在补写时判）
        IF v_phase_group.op = 'UPDATE' AND v_item = pg_catalog.jsonb_build_object('id', v_item->'id') THEN
          v_entities := pg_catalog.jsonb_set(v_entities, ARRAY[v_entity_key, 'status'], '"applied"'::jsonb, true);
          CONTINUE;
        END IF;
      END IF;
      v_filtered_items := v_filtered_items || pg_catalog.jsonb_build_array(v_item);
    END LOOP;

    CONTINUE WHEN pg_catalog.jsonb_array_length(v_filtered_items) = 0;

    v_group_ok := true;
    IF p_receipts THEN
      BEGIN
        v_group_result := public.rxdb_mutations_apply_group(
          v_phase_group.op, v_phase_group.schema_name, v_phase_group.table_name, v_filtered_items, p_skip_sync
        );
      EXCEPTION
        WHEN insufficient_privilege OR SQLSTATE 'RX001' OR foreign_key_violation THEN
          v_group_ok := false;
      END;
    ELSE
      -- p_receipts = false：不开子事务，第一个错误原样上抛（全有或全无，等于阶段 A）
      v_group_result := public.rxdb_mutations_apply_group(
        v_phase_group.op, v_phase_group.schema_name, v_phase_group.table_name, v_filtered_items, p_skip_sync
      );
    END IF;

    IF v_group_ok THEN
      FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_filtered_items) AS t(value)
      LOOP
        entity_id := CASE WHEN v_phase_group.op = 'DELETE' THEN v_item #>> '{}' ELSE v_item->>'id' END;
        v_entity_key := pg_catalog.jsonb_build_array(v_phase_group.schema_name, v_phase_group.table_name, entity_id)::text;
        v_entities := pg_catalog.jsonb_set(v_entities, ARRAY[v_entity_key, 'status'], '"applied"'::jsonb, true);
      END LOOP;
    ELSE
      -- 组失败（只有 p_receipts = true 才会走到这）：整组已回滚，逐实体各自子事务重放，
      -- 每个实体的 applied / rejected 结果合并回 v_entities（保留已有的 localIds 等字段）
      v_group_result := public.rxdb_mutations_replay_group(
        v_phase_group.op, v_phase_group.schema_name, v_phase_group.table_name, v_filtered_items, p_skip_sync
      );
      SELECT v_entities || pg_catalog.jsonb_object_agg(r.key, (v_entities->r.key) || r.value)
      INTO v_entities
      FROM pg_catalog.jsonb_each(v_group_result->'entities') AS r(key, value);
    END IF;

    v_upserted := v_upserted || (v_group_result->'upserted');
    v_updated := v_updated + (v_group_result->>'updated')::int;
    v_deleted := v_deleted + (v_group_result->>'deleted')::int;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'entities', v_entities, 'upserted', v_upserted, 'updated', v_updated, 'deleted', v_deleted,
    'deferred', v_deferred_values
  );
END;
$$;

/**
 * rxdb_mutations_fill_deferred - 补写延迟的外键列（US-038），在执行 DELETE 之前
 *
 * 只补本轮写进去的实体（状态 applied）。p_receipts = true 时一个实体补写失败（23503 / 42501 / RX001）就返回它的键与
 * 被拒原因，由 rxdb_mutations 整轮回滚后把它标为被拒重来；否则错误原样上抛。
 *
 * @returns {key, outcome}：补写失败的实体键与被拒原因；全部补写成功时为 NULL
 */
CREATE OR REPLACE FUNCTION public.rxdb_mutations_fill_deferred(p_deferred jsonb, p_entities jsonb, p_receipts boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_rec record;
  v_item jsonb;
  v_message text;
  v_constraint text;
  v_outcome jsonb;
BEGIN
  FOR v_rec IN SELECT key, value FROM pg_catalog.jsonb_each(COALESCE(p_deferred, '{}'::jsonb))
  LOOP
    CONTINUE WHEN p_entities->v_rec.key->>'status' IS DISTINCT FROM 'applied';
    v_item := pg_catalog.jsonb_build_object('id', v_rec.value->>'entityId') || (v_rec.value->'values');
    IF NOT p_receipts THEN
      PERFORM public.rxdb_batch_update(v_rec.value->>'table', v_rec.value->>'schema', pg_catalog.jsonb_build_array(v_item));
      CONTINUE;
    END IF;
    v_outcome := NULL;
    BEGIN
      PERFORM public.rxdb_batch_update(v_rec.value->>'table', v_rec.value->>'schema', pg_catalog.jsonb_build_array(v_item));
    EXCEPTION
      WHEN foreign_key_violation THEN
        GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT, v_constraint = CONSTRAINT_NAME;
        v_outcome := pg_catalog.jsonb_build_object(
          'status', 'rejected', 'code', '23503', 'reason', 'dependency', 'message', v_message,
          'dependsOn', public.rxdb_mutations_depends_on(v_rec.value->>'schema', v_rec.value->>'table', v_constraint, v_item)
        );
      WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
        v_outcome := pg_catalog.jsonb_build_object('status', 'rejected', 'code', '42501', 'reason', 'denied', 'message', v_message);
      WHEN SQLSTATE 'RX001' THEN
        GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
        v_outcome := pg_catalog.jsonb_build_object('status', 'rejected', 'code', 'RX001', 'reason', 'gone', 'message', v_message);
    END;
    IF v_outcome IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object('key', v_rec.key, 'outcome', v_outcome);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

/**
 * rxdb_mutations - 事务性批量修改函数（US-218 阶段 B：逐实体回执）
 *
 * 在单个数据库事务中执行：
 * 0. 校验日志与业务写一一配对（rxdb_assert_push_integrity），不配对抛 RX002，什么都没写
 * 1. 固化每条 change 的前后完整快照
 * 2. 按 clientId 排序逐个加咨询锁；本批每个实体若其全部 main 源 (clientId, localId) 已在
 *    rxdb_change 中，标记该实体 applied 并跳过业务写（幂等重放）
 * 3. 业务写按 upsert 组 → update 组 → delete 组、载荷顺序执行，跳过已标记的实体：
 *    p_receipts = true 时每组一个子事务；组失败且错误可归类（42501/RX001/23503）→
 *    回滚该组、组内逐实体各自子事务重放，每个实体各自 applied / rejected；
 *    p_receipts = false 时不开子事务，第一个错误原样上抛（全有或全无，等于阶段 A）
 * 4. 经 rxdb_insert_changes（SECURITY DEFINER）写 rxdb_change：按 p_changes 原顺序，只写 applied 实体的 main 日志与全部非 main 日志；
 *    main 上落库的每条日志同时记一条变更历史（rxdb_change_history，US-229），被级联删除的子行记为服务端级联
 * 5. 返回；entity_results 只在 p_receipts = true 时出现，按载荷顺序排列
 *
 * @param p_upserts JSONB 数组，每个元素: {table, schema?, data: [...]}
 * @param p_deletes JSONB 数组，每个元素: {table, schema?, ids: [...]}
 * @param p_changes JSONB 数组，RxDBChange 记录（可选，用于同步场景）
 * @param p_skip_sync 是否跳过同步触发器 (默认 false)
 * @param p_updates JSONB 数组，每个元素: {table, schema?, data: [{id, ...本次修改的列}]}
 * @param p_receipts 是否返回逐实体回执 entity_results（默认 false，向后兼容）
 * @param p_deferred_columns JSONB 数组，每个元素: {schema, table, column}——外键成环（US-038）时先写空、
 *        在 DELETE 之前补写的外键列；必须可空、属于某个外键、不是 id、所在复合外键不是 MATCH FULL，否则 RX003
 * @returns 操作结果，p_receipts = true 时额外带 entity_results
 */
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, boolean);
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, jsonb, boolean);
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, jsonb, boolean, jsonb);
-- US-038 加了第七个参数：旧的 6 参数签名必须删掉，否则两个重载并存，PostgREST 按命名参数选不出唯一的一个
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, jsonb, boolean, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.rxdb_mutations(
  p_upserts jsonb DEFAULT '[]'::jsonb,
  p_deletes jsonb DEFAULT '[]'::jsonb,
  p_changes jsonb DEFAULT '[]'::jsonb,
  p_skip_sync boolean DEFAULT false,
  p_updates jsonb DEFAULT '[]'::jsonb,
  p_receipts boolean DEFAULT false,
  p_deferred_columns jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  op jsonb;
  upsert_results jsonb := '[]'::jsonb;
  update_count int := 0;
  delete_count int := 0;
  changes_count int := 0;
  max_change_id bigint := NULL;
  change_id_mapping jsonb := '[]'::jsonb;
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
  v_groups jsonb;
  v_entities jsonb;
  v_entity_order text[];
  v_entity_main_info jsonb;
  v_rec record;
  v_pairs jsonb;
  v_all_exist boolean;
  v_client_id text;
  v_changes_to_log jsonb;
  v_log_result jsonb;
  v_entity_results jsonb;
  v_previous_sync text := COALESCE(pg_catalog.current_setting('rxdb.sync_enabled', true), '');
  v_previous_deletes text := COALESCE(pg_catalog.current_setting('rxdb.captured_deletes', true), '');
  v_explicit_deletes jsonb := '{}'::jsonb;
  v_delete_context jsonb;
  v_root_captures jsonb;
  v_group_matches jsonb;
  v_group_keys text[];
  v_matched_keys text[] := '{}'::text[];
  v_relation regclass;
  v_root_oid oid;
  v_deferred jsonb;
  v_round jsonb;
  v_deletes jsonb;
  v_round_entities jsonb;
  v_excluded jsonb := '{}'::jsonb;
  v_retry_outcome jsonb;
BEGIN
  -- 0. 只读载荷校验配对与延迟外键列，失败时快照、日志与业务表都还没动
  PERFORM public.rxdb_assert_push_integrity(p_upserts, p_deletes, p_changes, p_skip_sync, p_updates);
  v_deferred := public.rxdb_mutations_deferred_columns(p_deferred_columns);

  PERFORM pg_catalog.set_config('rxdb.sync_enabled', CASE WHEN p_skip_sync THEN 'false' ELSE 'true' END, true);
  -- 推送路径打开删除捕获：同步触发器把实际 DELETE 的 OLD 收进事务上下文，业务写之后再与显式删除配对
  PERFORM pg_catalog.set_config('rxdb.captured_deletes', CASE WHEN p_skip_sync THEN '{}' ELSE '' END, true);

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

    -- rxdbHistorySource 只由本函数给级联删除的子行打（见第 4 步），载荷里带的不认
    normalized_changes := normalized_changes || pg_catalog.jsonb_build_array(
      (op - 'schema' - 'table' - 'rxdbHistorySource') || pg_catalog.jsonb_build_object(
        'beforeData', before_data,
        'afterData', after_data,
        'snapshotComplete', snapshot_complete,
        'rxdbEntityKey', pg_catalog.jsonb_build_array(schema_name, table_name, entity_id)::text
      )
    );
    entity_states := pg_catalog.jsonb_set(
      entity_states,
      ARRAY[state_key],
      pg_catalog.jsonb_build_object('exists', after_data IS NOT NULL, 'value', after_data),
      true
    );
  END LOOP;

  -- 1.5 按载荷顺序把 p_upserts/p_updates/p_deletes 的每个元素固化成「组」，
  --     再按 (schema, table, entityId) 枚举出每个实体（首次出现的 op 为准），初始状态 pending
  -- 注：下面几个子查询的列别名特意不用 schema_name/table_name/entity_id/op ——
  -- 这几个名字已经是本函数的 plpgsql 变量，在查询里原样引用会被判定为
  -- variable/column 歧义（42702），哪怕只是普通的 SELECT 列
  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('schema', g_schema, 'table', g_table, 'op', g_op, 'items', g_items)
    ORDER BY phase, grp_ord
  )
  INTO v_groups
  FROM (
    SELECT 1 AS phase, g.ord AS grp_ord, COALESCE(g.val->>'schema', 'public') AS g_schema,
           g.val->>'table' AS g_table, 'INSERT' AS g_op, g.val->'data' AS g_items
    FROM pg_catalog.jsonb_array_elements(p_upserts) WITH ORDINALITY AS g(val, ord)
    UNION ALL
    SELECT 2, g.ord, COALESCE(g.val->>'schema', 'public'), g.val->>'table', 'UPDATE', g.val->'data'
    FROM pg_catalog.jsonb_array_elements(p_updates) WITH ORDINALITY AS g(val, ord)
    UNION ALL
    SELECT 3, g.ord, COALESCE(g.val->>'schema', 'public'), g.val->>'table', 'DELETE', g.val->'ids'
    FROM pg_catalog.jsonb_array_elements(p_deletes) WITH ORDINALITY AS g(val, ord)
  ) AS all_groups;
  v_groups := COALESCE(v_groups, '[]'::jsonb);

  WITH items AS (
    SELECT
      grp.ord AS grp_ord,
      grp.val->>'schema' AS g_schema,
      grp.val->>'table' AS g_table,
      grp.val->>'op' AS g_op,
      it.ord AS item_ord,
      CASE WHEN grp.val->>'op' = 'DELETE' THEN it.val #>> '{}' ELSE it.val->>'id' END AS g_entity_id
    FROM pg_catalog.jsonb_array_elements(v_groups) WITH ORDINALITY AS grp(val, ord)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(grp.val->'items') WITH ORDINALITY AS it(val, ord)
  ),
  entities AS (
    SELECT DISTINCT ON (g_schema, g_table, g_entity_id)
      g_schema, g_table, g_entity_id, g_op, grp_ord, item_ord
    FROM items
    ORDER BY g_schema, g_table, g_entity_id, grp_ord, item_ord
  )
  SELECT
    pg_catalog.array_agg(key ORDER BY grp_ord, item_ord),
    pg_catalog.jsonb_object_agg(key, value)
  INTO v_entity_order, v_entities
  FROM (
    SELECT
      pg_catalog.jsonb_build_array(g_schema, g_table, g_entity_id)::text AS key,
      pg_catalog.jsonb_build_object(
        'schema', g_schema, 'table', g_table, 'entityId', g_entity_id, 'op', g_op,
        'status', 'pending', 'localIds', '[]'::jsonb
      ) AS value,
      grp_ord, item_ord
    FROM entities
  ) AS keyed;
  v_entity_order := COALESCE(v_entity_order, '{}'::text[]);
  v_entities := COALESCE(v_entities, '{}'::jsonb);

  -- 2. 按 clientId 排序加咨询锁，避免同一客户端的并发批次交错写日志
  FOR v_client_id IN
    SELECT DISTINCT c->>'clientId'
    FROM pg_catalog.jsonb_array_elements(normalized_changes) AS t(c)
    WHERE c->>'clientId' IS NOT NULL
    ORDER BY 1
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('rxdb_mutations:' || v_client_id));
  END LOOP;

  -- 本批每个实体的 main 源变更 localId 列表与 (clientId, localId) 对；全部已落库则跳过业务写、直接记 applied
  -- 分两层聚合：per_entity 先把 localIds/pairs 聚合成普通列，外层再聚合成一个 jsonb 对象——
  -- jsonb_object_agg 的参数里不能直接嵌 jsonb_agg（Postgres 不允许聚合调用嵌套聚合调用）
  WITH main_logs AS (
    SELECT
      c->>'rxdbEntityKey' AS entity_key,
      c->>'clientId' AS client_id,
      (c->>'localId')::integer AS local_id,
      ordinality
    FROM pg_catalog.jsonb_array_elements(normalized_changes) WITH ORDINALITY AS t(c, ordinality)
    WHERE COALESCE(c->>'branchId', 'main') = 'main'
      AND c->>'clientId' IS NOT NULL AND c->>'localId' IS NOT NULL
  ),
  per_entity AS (
    SELECT
      entity_key,
      pg_catalog.jsonb_agg(local_id ORDER BY ordinality) AS local_ids,
      pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('clientId', client_id, 'localId', local_id) ORDER BY ordinality) AS pairs
    FROM main_logs
    GROUP BY entity_key
  )
  SELECT pg_catalog.jsonb_object_agg(
    entity_key,
    pg_catalog.jsonb_build_object('localIds', local_ids, 'pairs', pairs)
  )
  INTO v_entity_main_info
  FROM per_entity;
  v_entity_main_info := COALESCE(v_entity_main_info, '{}'::jsonb);

  FOR v_rec IN SELECT * FROM pg_catalog.jsonb_each(v_entity_main_info)
  LOOP
    CONTINUE WHEN NOT (v_entities ? v_rec.key);

    v_entities := pg_catalog.jsonb_set(v_entities, ARRAY[v_rec.key, 'localIds'], v_rec.value->'localIds', true);

    v_pairs := v_rec.value->'pairs';
    IF pg_catalog.jsonb_array_length(v_pairs) > 0 THEN
      SELECT pg_catalog.bool_and(
        EXISTS (
          SELECT 1 FROM public.rxdb_change AS rc
          WHERE rc."clientId" = p.value->>'clientId' AND rc."localId" = (p.value->>'localId')::integer
        )
      )
      INTO v_all_exist
      FROM pg_catalog.jsonb_array_elements(v_pairs) AS p(value);

      IF v_all_exist THEN
        v_entities := pg_catalog.jsonb_set(v_entities, ARRAY[v_rec.key, 'status'], '"applied"'::jsonb, true);
      END IF;
    END IF;
  END LOOP;

  -- 3. 按载荷顺序分组执行业务写；跳过已判定为 applied 的实体（幂等重放）。
  --    外键成环（US-038）时客户端带 p_deferred_columns：分三遍执行——写 INSERT / UPDATE 时这些列先拿掉（新建即为空、
  --    修改即不改），在执行 DELETE 之前补写，最后执行 DELETE。补写失败时整轮回滚，把该实体按补写的错误标为被拒后重来；
  --    排除集只增不减，循环必然收敛。不带延迟列时只走一遍，与从前逐字相同
  IF v_deferred = '{}'::jsonb THEN
    v_round := public.rxdb_mutations_apply_groups(
      v_groups, v_entities, ARRAY['INSERT', 'UPDATE', 'DELETE'], p_skip_sync, p_receipts, '{}'::jsonb
    );
  ELSE
    v_round_entities := v_entities;
    LOOP
      v_entities := v_round_entities;
      FOR v_rec IN SELECT key, value FROM pg_catalog.jsonb_each(v_excluded)
      LOOP
        v_entities := pg_catalog.jsonb_set(v_entities, ARRAY[v_rec.key], (v_entities->v_rec.key) || v_rec.value);
      END LOOP;
      v_retry_outcome := NULL;
      BEGIN
        v_round := public.rxdb_mutations_apply_groups(
          v_groups, v_entities, ARRAY['INSERT', 'UPDATE'], p_skip_sync, p_receipts, v_deferred
        );
        v_entities := v_round->'entities';
        -- 补写失败的实体与原因放在变量里带出去：整轮回滚会连同事务设置一起撤销，变量不会
        v_retry_outcome := public.rxdb_mutations_fill_deferred(v_round->'deferred', v_entities, p_receipts);
        IF v_retry_outcome IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE = 'RX004', MESSAGE = 'rxdb: deferred foreign key retry';
        END IF;
        v_deletes := public.rxdb_mutations_apply_groups(
          v_groups, v_entities, ARRAY['DELETE'], p_skip_sync, p_receipts, '{}'::jsonb
        );
        v_round := pg_catalog.jsonb_build_object(
          'entities', v_deletes->'entities',
          'upserted', (v_round->'upserted') || (v_deletes->'upserted'),
          'updated', (v_round->>'updated')::int + (v_deletes->>'updated')::int,
          'deleted', (v_round->>'deleted')::int + (v_deletes->>'deleted')::int
        );
        EXIT;
      EXCEPTION
        WHEN SQLSTATE 'RX004' THEN
          -- 补写失败的实体：整轮已回滚（含本轮的业务写与删除捕获），下一轮不再写它
          IF v_excluded ? (v_retry_outcome->>'key') THEN
            RAISE EXCEPTION 'rxdb: deferred foreign key retry did not converge for %', v_retry_outcome->>'key';
          END IF;
          v_excluded := v_excluded || pg_catalog.jsonb_build_object(v_retry_outcome->>'key', v_retry_outcome->'outcome');
      END;
    END LOOP;
  END IF;
  v_entities := v_round->'entities';
  upsert_results := v_round->'upserted';
  update_count := (v_round->>'updated')::int;
  delete_count := (v_round->>'deleted')::int;

  -- 显式删除与捕获的实际删除按 id 列类型的等值配对，与 rxdb_batch_delete 的 id = ANY($1::类型[]) 同一判据：
  -- uuid 大小写、numeric 的精度与小数位（"1" 与存储的 1.00）这类拼写差异都认成同一行，不比文本。
  -- 只拿同一分区根的捕获来配——别的表的 id 文本未必能转成本表的类型。同一行以两种拼写同批列出时
  -- 两条源日志都配到这一行；客户端按规范 id 推送不会出现，不为此把 duplicate_write 的文本比较改成按类型比较
  v_delete_context := COALESCE(NULLIF(pg_catalog.current_setting('rxdb.captured_deletes', true), '')::jsonb, '{}'::jsonb);
  FOR op IN SELECT value FROM pg_catalog.jsonb_array_elements(p_deletes) WHERE v_delete_context != '{}'::jsonb
  LOOP
    schema_name := COALESCE(op->>'schema', 'public');
    table_name := op->>'table';
    v_relation := pg_catalog.to_regclass(pg_catalog.format('%I.%I', schema_name, table_name));
    v_root_oid := COALESCE(pg_catalog.pg_partition_root(v_relation), v_relation)::oid;
    SELECT COALESCE(pg_catalog.jsonb_object_agg(key, value), '{}'::jsonb)
    INTO v_root_captures
    FROM pg_catalog.jsonb_each(v_delete_context)
    WHERE (key::jsonb)->>0 = v_root_oid::text;
    CONTINUE WHEN v_root_captures = '{}'::jsonb;

    EXECUTE pg_catalog.format(
      'SELECT COALESCE(pg_catalog.jsonb_object_agg(
          pg_catalog.jsonb_build_array($2, $3, ids.value)::text, captured.value->''beforeData''), ''{}''::jsonb),
        COALESCE(pg_catalog.array_agg(captured.key), ''{}''::text[])
      FROM pg_catalog.jsonb_array_elements_text($1) AS ids(value)
      JOIN pg_catalog.jsonb_each($4) AS captured(key, value)
        ON (ARRAY[(captured.key::jsonb)->>1]::%1$s)[1] = (ARRAY[ids.value]::%1$s)[1]',
      public.rxdb_id_array_type(table_name, schema_name)
    ) INTO v_group_matches, v_group_keys USING op->'ids', schema_name, table_name, v_root_captures;
    v_explicit_deletes := v_explicit_deletes || v_group_matches;
    v_matched_keys := v_matched_keys || v_group_keys;
  END LOOP;

  -- 显式删除可能先被拒绝，随后被同批允许的父行级联删除；以触发器捕获的真实结果为准。
  FOR v_rec IN
    SELECT key, value FROM pg_catalog.jsonb_each(v_explicit_deletes)
    WHERE pg_catalog.jsonb_typeof(value) = 'object'
  LOOP
    v_entities := pg_catalog.jsonb_set(v_entities, ARRAY[v_rec.key, 'status'], '"applied"'::jsonb, true);
    v_entities := pg_catalog.jsonb_set(v_entities, ARRAY[v_rec.key],
      (v_entities->v_rec.key) - 'code' - 'reason' - 'message' - 'dependsOn');
  END LOOP;

  -- 4. 保留源日志的映射；最终显式 DELETE 一律以触发器捕获的实际 OLD 为快照。
  --    不能只补 snapshotComplete = false 的：客户端 DELETE 的 inversePatch 按协议不含 id，规范化阶段
  --    仅凭它非空就判了完整，调用方读不到的行（RLS 隐藏）只剩这份缺 id 的快照，按 id 过滤的拉取会漏删
  SELECT COALESCE(pg_catalog.jsonb_agg(
    CASE WHEN COALESCE(c->>'branchId', 'main') = 'main' AND c->>'type' = 'DELETE'
      AND pg_catalog.jsonb_typeof(v_explicit_deletes->(c->>'rxdbEntityKey')) = 'object'
      AND ord = (SELECT pg_catalog.max(last_ord)
        FROM pg_catalog.jsonb_array_elements(normalized_changes) WITH ORDINALITY AS last_change(value, last_ord)
        WHERE value->>'rxdbEntityKey' = c->>'rxdbEntityKey' AND COALESCE(value->>'branchId', 'main') = 'main')
    THEN c || pg_catalog.jsonb_build_object(
      'beforeData', v_explicit_deletes->(c->>'rxdbEntityKey'), 'afterData', NULL, 'snapshotComplete', true
    ) ELSE c END ORDER BY ord
  ), '[]'::jsonb)
  INTO v_changes_to_log
  FROM pg_catalog.jsonb_array_elements(normalized_changes) WITH ORDINALITY AS t(c, ord)
  WHERE COALESCE(c->>'branchId', 'main') != 'main'
     OR (v_entities->(c->>'rxdbEntityKey')->>'status') = 'applied';

  -- 隐式删除必须排在源 INSERT / UPDATE 之后，避免拉取端把同批已删子行重新插回。
  -- 变更历史按 rxdbHistorySource 把它们记成服务端级联（US-229）
  SELECT v_changes_to_log || COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'namespace', value->>'namespace', 'entity', value->>'entity', 'entityId', value->'beforeData'->>'id',
    'type', 'DELETE', 'patch', value->'beforeData', 'branchId', 'main',
    'clientId', NULL, 'localId', NULL, 'beforeData', value->'beforeData', 'snapshotComplete', true,
    'rxdbHistorySource', 'cascade'
  ) ORDER BY key), '[]'::jsonb)
  INTO v_changes_to_log
  FROM pg_catalog.jsonb_each(v_delete_context)
  WHERE NOT (key = ANY(v_matched_keys));

  -- 落库交给 rxdb_insert_changes（SECURITY DEFINER）：生产权限下调用方没有 rxdb_change 写权限（US-218 阶段 C）
  IF pg_catalog.jsonb_array_length(v_changes_to_log) > 0 THEN
    PERFORM pg_catalog.set_config('rxdb.insert_changes', 'on', true);
    v_log_result := public.rxdb_insert_changes(v_changes_to_log);
    PERFORM pg_catalog.set_config('rxdb.insert_changes', '', true);
    changes_count := (v_log_result->>'changes')::int;
    max_change_id := (v_log_result->>'max_change_id')::bigint;
    change_id_mapping := v_log_result->'change_id_mapping';
  END IF;

  -- 5. 返回；entity_results 只在 p_receipts = true 时出现，按载荷顺序排列
  IF p_receipts THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(v_entities->key ORDER BY ord), '[]'::jsonb)
    INTO v_entity_results
    FROM pg_catalog.unnest(v_entity_order) WITH ORDINALITY AS t(key, ord);
  END IF;

  PERFORM pg_catalog.set_config('rxdb.sync_enabled', v_previous_sync, true);
  PERFORM pg_catalog.set_config('rxdb.captured_deletes', v_previous_deletes, true);

  RETURN pg_catalog.jsonb_build_object(
    'upserted', upsert_results,
    'updated', update_count,
    'deleted', delete_count,
    'changes', changes_count,
    'max_change_id', max_change_id,
    'change_id_mapping', change_id_mapping
  ) || CASE WHEN p_receipts THEN pg_catalog.jsonb_build_object('entity_results', v_entity_results) ELSE '{}'::jsonb END;
END;
$$;

-- ============================================
-- 调用者在各作用域上的成员权限（US-234）
-- ============================================
-- 一个作用域一行：作用域键（如 user:<id>、tenant:<租户 id>）与调用者在它上面的权限。权限名归部署方，
-- 参考实现用 epic-015 的六项（read 对应查看，edit 对应增删改）。平台默认与 rxdb_caller_can_edit_default 同口径：
-- anon 没有任何作用域，登录用户只在自己的 user:<auth.uid()> 上有 read + edit。
-- 部署方按自己的成员表 CREATE OR REPLACE 覆盖（签名与返回列不变），与 rxdb_caller_buckets() 同一模式。
-- 重新执行本文件会把它恢复成平台默认，升级之后要重新加载自己的覆盖。
-- 客户端读它拿到自己的授权；写策略与历史判定经 rxdb_caller_scopes 读同一份结果，三处同口径
CREATE OR REPLACE FUNCTION public.rxdb_caller_grants()
RETURNS TABLE (scope text, permissions text[])
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'user:' || auth.uid()::text, ARRAY['read', 'edit']::text[]
  WHERE auth.uid() IS NOT NULL
$$;

-- 调用者带有某项权限的全部作用域键，按键排序。RLS 里写成 `= ANY((SELECT public.rxdb_caller_scopes('edit'))::text[])`：
-- 外层的 (SELECT …) 让它每条语句只求值一次，不按行重复查成员表
CREATE OR REPLACE FUNCTION public.rxdb_caller_scopes(p_permission text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT COALESCE(pg_catalog.array_agg(caller.scope ORDER BY caller.scope), ARRAY[]::text[])
  FROM public.rxdb_caller_grants() AS caller
  WHERE p_permission = ANY(caller.permissions)
$$;

-- ============================================
-- 远端变更历史的读取（US-229）
-- ============================================
-- 历史表只经本节的 rxdb_entity_history 读取：只返回调用者**当前**能编辑的行的历史，四个正文字段逐列按
-- 调用者的列权限脱敏。可见性按每条历史记录时的行判定（afterData，删除取 beforeData），所以一行换了租户之后，
-- 改动前的历史只对旧租户的成员可见；行删掉之后，它的历史照样按删除前的行开放。

-- 平台默认的编辑权限判定：未分区实体看调用者角色对业务表有没有 UPDATE 权限；分区实体只认调用者自己的
-- user:<auth.uid()> 区，公开区与别人的区默认谁都不能编辑。调用者角色取 JWT 的 role，取不到（没有会话的直连）一律判否
CREATE OR REPLACE FUNCTION public.rxdb_caller_can_edit_default(p_namespace text, p_entity text, p_row jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_table text;
  v_bucket_column text;
  v_role text := NULLIF(auth.role(), '');
BEGIN
  SELECT registered."tableName", registered."bucketColumn"
  INTO v_table, v_bucket_column
  FROM public.rxdb_sync_entity AS registered
  WHERE registered.namespace = p_namespace AND registered.entity = p_entity;

  IF v_table IS NULL OR v_role IS NULL OR p_row IS NULL THEN
    RETURN false;
  END IF;
  IF v_bucket_column IS NOT NULL THEN
    RETURN auth.uid() IS NOT NULL AND p_row->>v_bucket_column = 'user:' || auth.uid()::text;
  END IF;
  RETURN pg_catalog.has_table_privilege(v_role, pg_catalog.format('%I.%I', p_namespace, v_table), 'UPDATE');
END;
$$;

-- 调用者当前能否编辑这一行，变更历史按它开放。部署方按自己的权限模型 CREATE OR REPLACE 覆盖（签名不变），
-- 与 rxdb_caller_buckets() 同一模式；覆盖时可以只改自己关心的实体，其余交回 rxdb_caller_can_edit_default。
-- 重新执行本文件会把它恢复成平台默认，升级之后要重新加载自己的覆盖。只在 rxdb_entity_history 里以属主身份调用
CREATE OR REPLACE FUNCTION public.rxdb_caller_can_edit(p_namespace text, p_entity text, p_row jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT public.rxdb_caller_can_edit_default(p_namespace, p_entity, p_row)
$$;

-- 只留下给定的键；输入为 NULL 时仍是 NULL，键全被摘掉时是空对象
CREATE OR REPLACE FUNCTION public.rxdb_jsonb_pick(p_value jsonb, p_keys text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN p_value IS NULL OR pg_catalog.jsonb_typeof(p_value) <> 'object' THEN p_value
    ELSE COALESCE(
      (SELECT pg_catalog.jsonb_object_agg(entry.key, entry.value)
       FROM pg_catalog.jsonb_each(p_value) AS entry
       WHERE entry.key = ANY(p_keys)),
      '{}'::jsonb
    )
  END
$$;

/**
 * rxdb_entity_history - 读一行的远端变更历史（US-229）
 *
 * SECURITY DEFINER：客户端对 rxdb_change_history 没有任何权限。每条历史按记录时的行交给
 * rxdb_caller_can_edit 判定调用者当前能否编辑，判否的不返回；正文按调用者角色的列权限逐列脱敏，
 * 业务表已经不在时一条都不返回。按 id 升序（即写入顺序）分页。
 *
 * @param p_namespace 实体命名空间（业务表所在的 schema）
 * @param p_entity 实体名（rxdb_enable_sync_for_table 登记的名字）
 * @param p_entity_id 行 id 的文本形式
 * @param p_after_id 只返回 id 大于它的历史，翻页时传上一页最后一条的 id
 * @param p_limit 一页最多几条，1～1000
 */
CREATE OR REPLACE FUNCTION public.rxdb_entity_history(
  p_namespace text,
  p_entity text,
  p_entity_id text,
  p_after_id bigint DEFAULT 0,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id bigint,
  "changeId" integer,
  namespace text,
  entity text,
  "entityId" text,
  bucket text,
  type text,
  patch jsonb,
  "inversePatch" jsonb,
  "beforeData" jsonb,
  "afterData" jsonb,
  actor uuid,
  role text,
  source text,
  "clientId" text,
  "localId" integer,
  "branchId" text,
  "createdAt" timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_role text := NULLIF(auth.role(), '');
  v_relation regclass;
  v_columns text[];
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'rxdb: history page size must be between 1 and 1000, got %', p_limit
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT pg_catalog.to_regclass(pg_catalog.format('%I.%I', registered.namespace, registered."tableName"))
  INTO v_relation
  FROM public.rxdb_sync_entity AS registered
  WHERE registered.namespace = p_namespace AND registered.entity = p_entity;
  IF v_role IS NULL OR v_relation IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(attribute.attname::text), '{}'::text[])
  INTO v_columns
  FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid = v_relation
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND pg_catalog.has_column_privilege(v_role, v_relation, attribute.attnum, 'SELECT');

  RETURN QUERY
  SELECT
    history.id,
    history."changeId",
    history.namespace::text,
    history.entity::text,
    history."entityId"::text,
    history.bucket::text,
    history.type::text,
    public.rxdb_jsonb_pick(history.patch, v_columns),
    public.rxdb_jsonb_pick(history."inversePatch", v_columns),
    public.rxdb_jsonb_pick(history."beforeData", v_columns),
    public.rxdb_jsonb_pick(history."afterData", v_columns),
    history.actor,
    history.role::text,
    history.source::text,
    history."clientId"::text,
    history."localId",
    history."branchId"::text,
    history."createdAt"
  FROM public.rxdb_change_history AS history
  WHERE history.namespace = p_namespace
    AND history.entity = p_entity
    AND history."entityId" = p_entity_id
    AND history.id > COALESCE(p_after_id, 0)
    AND public.rxdb_caller_can_edit(history.namespace, history.entity, COALESCE(history."afterData", history."beforeData"))
  ORDER BY history.id
  LIMIT p_limit;
END;
$$;

-- 授权：推送与它的内部函数要求已登录（US-225）。rxdb_mutations 是 SECURITY INVOKER，以调用者身份调这些函数，
-- 所以调用者要有它们的执行权。anon 的执行权由生产权限脚本收回（Supabase 的默认权限会在建函数时授给 anon）；
-- 连接时的 RLS 自检 rxdb_check_rls 仍对 anon 开放
GRANT EXECUTE ON FUNCTION public.rxdb_batch_upsert(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_execute_batch_update(text, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_batch_update_rows(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_batch_update(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_batch_delete(text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_id_array_type(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_existing_ids(text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_check_rls(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_assert_push_integrity(jsonb, jsonb, jsonb, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_mutations_apply_group(text, text, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_mutations_depends_on(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_mutations_replay_group(text, text, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_insert_changes(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_mutations_deferred_columns(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_mutations_apply_groups(jsonb, jsonb, text[], boolean, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_mutations_fill_deferred(jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_mutations(jsonb, jsonb, jsonb, boolean, jsonb, boolean, jsonb) TO authenticated;
-- 变更历史（US-229）：读取 RPC 只对已登录身份开放；判定、脱敏与写入是内部函数，不授给客户端角色
GRANT EXECUTE ON FUNCTION public.rxdb_entity_history(text, text, text, bigint, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.rxdb_caller_can_edit(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rxdb_caller_can_edit_default(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rxdb_jsonb_pick(jsonb, text[]) FROM PUBLIC, anon, authenticated;
-- 成员权限（US-234）：调用者读自己的授权，anon 得到空结果；RLS 以调用者身份求值，也要有执行权
GRANT EXECUTE ON FUNCTION public.rxdb_caller_grants() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_caller_scopes(text) TO anon, authenticated;

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
