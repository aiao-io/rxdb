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
 * rxdb_batch_update - 批量部分列更新
 *
 * 逐行执行普通 UPDATE，只 SET 该行出现的非 id 列；未出现的列保持原值。
 * 只受调用方 UPDATE / SELECT 策略约束，不受 INSERT 策略约束。
 * 某行更新零行时抛错：行仍存在 → 42501（reason=denied），行已不存在 → RX001（reason=gone）。
 *
 * @param p_table 表名
 * @param p_schema schema 名称
 * @param p_data JSONB 数组，每个元素: {id, ...本次修改的列}
 * @returns 实际更新的行数
 */
CREATE OR REPLACE FUNCTION public.rxdb_batch_update(
  p_table text,
  p_schema text DEFAULT 'public',
  p_data jsonb DEFAULT '[]'::jsonb
)
RETURNS int
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
  affected int := 0;
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

    EXECUTE pg_catalog.format(
      'UPDATE %I.%I AS t SET %s WHERE t.id = (pg_catalog.jsonb_populate_record(null::%I.%I, $1)).id',
      p_schema, p_table, set_clause, p_schema, p_table
    ) USING item;

    GET DIAGNOSTICS rc = ROW_COUNT;
    affected := affected + rc;
    CONTINUE WHEN rc > 0;

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

  RETURN affected;
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
    v_updated := public.rxdb_batch_update(p_table, p_schema, p_items);
  ELSE
    SELECT pg_catalog.array_agg(value) INTO v_ids_array
    FROM pg_catalog.jsonb_array_elements_text(p_items) AS ids(value);

    v_deleted_rows := public.rxdb_batch_delete(p_table, p_schema, v_ids_array);
    v_deleted := v_deleted_rows;

    -- 推送路径：少删的行若对探针仍存在，就是被行级权限拒绝，不能当成功（US-218 AC#1、AC#2）；
    -- 已不存在的行按幂等成功处理。直写路径零行删除不触发日志触发器，不需要判定
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
 * 4. 写 rxdb_change：按 p_changes 原顺序，只写 applied 实体的 main 日志与全部非 main 日志
 * 5. 返回；entity_results 只在 p_receipts = true 时出现，按载荷顺序排列
 *
 * @param p_upserts JSONB 数组，每个元素: {table, schema?, data: [...]}
 * @param p_deletes JSONB 数组，每个元素: {table, schema?, ids: [...]}
 * @param p_changes JSONB 数组，RxDBChange 记录（可选，用于同步场景）
 * @param p_skip_sync 是否跳过同步触发器 (默认 false)
 * @param p_updates JSONB 数组，每个元素: {table, schema?, data: [{id, ...本次修改的列}]}
 * @param p_receipts 是否返回逐实体回执 entity_results（默认 false，向后兼容）
 * @returns 操作结果，p_receipts = true 时额外带 entity_results
 */
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, boolean);
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, jsonb, boolean);
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, jsonb, boolean, jsonb);

CREATE OR REPLACE FUNCTION public.rxdb_mutations(
  p_upserts jsonb DEFAULT '[]'::jsonb,
  p_deletes jsonb DEFAULT '[]'::jsonb,
  p_changes jsonb DEFAULT '[]'::jsonb,
  p_skip_sync boolean DEFAULT false,
  p_updates jsonb DEFAULT '[]'::jsonb,
  p_receipts boolean DEFAULT false
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
  mapped_max_change_id bigint := NULL;
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
  v_phase_group record;
  v_item jsonb;
  v_filtered_items jsonb;
  v_entity_key text;
  v_group_ok boolean;
  v_group_result jsonb;
  v_changes_to_log jsonb;
  v_entity_results jsonb;
BEGIN
  -- 0. 只读载荷校验配对，失败时快照、日志与业务表都还没动
  PERFORM public.rxdb_assert_push_integrity(p_upserts, p_deletes, p_changes, p_skip_sync, p_updates);

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

  -- 3. 按载荷顺序分组执行业务写；跳过已判定为 applied 的实体（幂等重放）
  FOR v_phase_group IN
    SELECT g.ord AS grp_ord, g.val->>'schema' AS schema_name, g.val->>'table' AS table_name,
           g.val->>'op' AS op, g.val->'items' AS items
    FROM pg_catalog.jsonb_array_elements(v_groups) WITH ORDINALITY AS g(val, ord)
  LOOP
    v_filtered_items := '[]'::jsonb;
    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_phase_group.items) AS t(value)
    LOOP
      entity_id := CASE WHEN v_phase_group.op = 'DELETE' THEN v_item #>> '{}' ELSE v_item->>'id' END;
      v_entity_key := pg_catalog.jsonb_build_array(v_phase_group.schema_name, v_phase_group.table_name, entity_id)::text;
      IF v_entities->v_entity_key->>'status' = 'pending' THEN
        v_filtered_items := v_filtered_items || pg_catalog.jsonb_build_array(v_item);
      END IF;
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

    upsert_results := upsert_results || (v_group_result->'upserted');
    update_count := update_count + (v_group_result->>'updated')::int;
    delete_count := delete_count + (v_group_result->>'deleted')::int;
  END LOOP;

  -- 4. 写入 rxdb_change 表：按原顺序，只写 applied 实体的 main 日志 + 全部非 main 日志
  SELECT COALESCE(pg_catalog.jsonb_agg(c), '[]'::jsonb)
  INTO v_changes_to_log
  FROM pg_catalog.jsonb_array_elements(normalized_changes) AS t(c)
  WHERE COALESCE(c->>'branchId', 'main') != 'main'
     OR (v_entities->(c->>'rxdbEntityKey')->>'status') = 'applied';

  IF pg_catalog.jsonb_array_length(v_changes_to_log) > 0 THEN
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
      FROM pg_catalog.jsonb_array_elements(v_changes_to_log) AS changes(c)
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
      FROM pg_catalog.jsonb_array_elements(v_changes_to_log) WITH ORDINALITY AS changes(c, ordinality)
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
  END IF;

  -- 5. 返回；entity_results 只在 p_receipts = true 时出现，按载荷顺序排列
  IF p_receipts THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(v_entities->key ORDER BY ord), '[]'::jsonb)
    INTO v_entity_results
    FROM pg_catalog.unnest(v_entity_order) WITH ORDINALITY AS t(key, ord);
  END IF;

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

-- 授权
GRANT EXECUTE ON FUNCTION public.rxdb_batch_upsert(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_batch_update(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_batch_delete(text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_id_array_type(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_existing_ids(text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_check_rls(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_assert_push_integrity(jsonb, jsonb, jsonb, boolean, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_mutations_apply_group(text, text, text, jsonb, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_mutations_depends_on(text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_mutations_replay_group(text, text, text, jsonb, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_mutations(jsonb, jsonb, jsonb, boolean, jsonb, boolean) TO anon, authenticated;

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
