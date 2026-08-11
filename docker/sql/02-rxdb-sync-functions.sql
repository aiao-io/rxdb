-- ============================================
-- RxDB 通用函数定义
-- ============================================
-- 用途: 定义变更追踪和同步所需的通用函数
-- 依赖: 必须在 init-system-tables.sql 之后执行
-- ============================================

-- ============================================
-- 自动更新 updatedAt 的触发器函数
-- ============================================
CREATE OR REPLACE FUNCTION public.rxdb_update_timestamp_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    NEW."updatedAt" = pg_catalog.now();
    RETURN NEW;
END;
$$;

-- ============================================
-- 通用变更追踪触发器函数
-- ============================================
CREATE OR REPLACE FUNCTION public.rxdb_log_change_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_namespace text := TG_ARGV[0];
    v_entity text := TG_ARGV[1];
    v_patch jsonb;
    v_inverse_patch jsonb;
    v_entity_id text;
    v_key text;
    v_val_new jsonb;
    v_val_old jsonb;
    v_branch_id text := 'main'; -- 默认为 main 分支
    v_sync_enabled text;
BEGIN
    -- 检查是否禁用了同步 (通过会话变量)
    BEGIN
        v_sync_enabled := pg_catalog.current_setting('rxdb.sync_enabled', true);
    EXCEPTION WHEN OTHERS THEN
        v_sync_enabled := 'true';
    END;

    IF v_sync_enabled = 'false' THEN
        RETURN NULL; -- 跳过记录变更
    END IF;

    -- 尝试从配置或会话变量获取 branchId (可选)
    -- v_branch_id := current_setting('rxdb.branch_id', true);
    -- IF v_branch_id IS NULL THEN v_branch_id := 'main'; END IF;

    IF (TG_OP = 'INSERT') THEN
        v_entity_id := NEW.id::text;
        v_patch := pg_catalog.to_jsonb(NEW);

        INSERT INTO public.rxdb_change (
            namespace, entity, "entityId", type, patch, "inversePatch", "branchId",
            "beforeData", "afterData", "snapshotComplete"
        ) VALUES (
            v_namespace, v_entity, v_entity_id, 'INSERT', v_patch, NULL, v_branch_id,
            NULL, pg_catalog.to_jsonb(NEW), true
        );
        RETURN NEW;

    ELSIF (TG_OP = 'UPDATE') THEN
        v_entity_id := NEW.id::text;

        -- 计算差异
        v_patch := '{}'::jsonb;
        v_inverse_patch := '{}'::jsonb;

        -- 遍历 NEW 的键
        FOR v_key IN SELECT pg_catalog.jsonb_object_keys(pg_catalog.to_jsonb(NEW)) LOOP
            v_val_new := pg_catalog.to_jsonb(NEW) -> v_key;
            v_val_old := pg_catalog.to_jsonb(OLD) -> v_key;

            -- 如果值不同，则记录
            IF v_val_new IS DISTINCT FROM v_val_old THEN
                v_patch := pg_catalog.jsonb_set(v_patch, ARRAY[v_key], v_val_new);
                v_inverse_patch := pg_catalog.jsonb_set(v_inverse_patch, ARRAY[v_key], v_val_old);
            END IF;
        END LOOP;

        -- 如果有变更才插入
        IF v_patch != '{}'::jsonb THEN
            INSERT INTO public.rxdb_change (
                namespace, entity, "entityId", type, patch, "inversePatch", "branchId",
                "beforeData", "afterData", "snapshotComplete"
            ) VALUES (
                v_namespace, v_entity, v_entity_id, 'UPDATE', v_patch, v_inverse_patch, v_branch_id,
                pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), true
            );
        END IF;
        RETURN NEW;

    ELSIF (TG_OP = 'DELETE') THEN
        v_entity_id := OLD.id::text;
        v_patch := pg_catalog.to_jsonb(OLD);

        INSERT INTO public.rxdb_change (
            namespace, entity, "entityId", type, patch, "inversePatch", "branchId",
            "beforeData", "afterData", "snapshotComplete"
        ) VALUES (
            v_namespace, v_entity, v_entity_id, 'DELETE', v_patch, NULL, v_branch_id,
            pg_catalog.to_jsonb(OLD), NULL, true
        );
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

-- ============================================
-- 基于持久变更快照的 Filter Sync
-- ============================================
CREATE OR REPLACE FUNCTION public.rxdb_jsonb_matches_rule(
    p_document jsonb,
    p_rule jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_field text := p_rule->>'field';
    v_operator text := p_rule->>'operator';
    v_actual jsonb;
    v_expected jsonb := p_rule->'value';
    v_actual_text text;
    v_expected_text text;
    v_min jsonb;
    v_max jsonb;
    v_lower_match boolean;
    v_upper_match boolean;
BEGIN
    IF p_document IS NULL THEN
        RETURN false;
    END IF;
    IF v_field IS NULL OR v_operator IS NULL THEN
        RAISE EXCEPTION 'Invalid snapshot filter rule';
    END IF;

    v_actual := p_document->v_field;
    v_actual_text := v_actual#>>'{}';
    v_expected_text := v_expected#>>'{}';

    CASE v_operator
        WHEN '=' THEN
            RETURN v_actual IS NOT DISTINCT FROM v_expected;
        WHEN '!=' THEN
            RETURN v_actual IS DISTINCT FROM v_expected;
        WHEN 'null', 'isNull' THEN
            RETURN v_actual IS NULL OR v_actual = 'null'::jsonb;
        WHEN 'notNull', 'isNotNull' THEN
            RETURN v_actual IS NOT NULL AND v_actual <> 'null'::jsonb;
        WHEN 'in' THEN
            IF pg_catalog.jsonb_typeof(v_expected) <> 'array' THEN
                RAISE EXCEPTION 'IN operator requires array';
            END IF;
            RETURN EXISTS (
                SELECT 1
                FROM pg_catalog.jsonb_array_elements(v_expected) AS item(value)
                WHERE item.value = v_actual
            );
        WHEN 'notIn' THEN
            IF pg_catalog.jsonb_typeof(v_expected) <> 'array' THEN
                RAISE EXCEPTION 'notIn operator requires array';
            END IF;
            RETURN NOT EXISTS (
                SELECT 1
                FROM pg_catalog.jsonb_array_elements(v_expected) AS item(value)
                WHERE item.value = v_actual
            );
        WHEN 'contains', 'includes', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith' THEN
            IF pg_catalog.jsonb_typeof(v_actual) = 'string' THEN
                v_actual_text := pg_catalog.lower(v_actual_text);
                v_expected_text := pg_catalog.lower(v_expected_text);
                v_lower_match := CASE v_operator
                    WHEN 'contains' THEN pg_catalog.strpos(v_actual_text, v_expected_text) > 0
                    WHEN 'includes' THEN pg_catalog.strpos(v_actual_text, v_expected_text) > 0
                    WHEN 'notContains' THEN pg_catalog.strpos(v_actual_text, v_expected_text) = 0
                    WHEN 'startsWith' THEN pg_catalog.left(v_actual_text, pg_catalog.length(v_expected_text)) = v_expected_text
                    WHEN 'notStartsWith' THEN pg_catalog.left(v_actual_text, pg_catalog.length(v_expected_text)) <> v_expected_text
                    WHEN 'endsWith' THEN pg_catalog.right(v_actual_text, pg_catalog.length(v_expected_text)) = v_expected_text
                    WHEN 'notEndsWith' THEN pg_catalog.right(v_actual_text, pg_catalog.length(v_expected_text)) <> v_expected_text
                END;
                RETURN v_lower_match;
            END IF;
            IF v_operator IN ('contains', 'includes') THEN
                RETURN v_actual @> v_expected;
            END IF;
            IF v_operator = 'notContains' THEN
                RETURN NOT (v_actual @> v_expected);
            END IF;
            RETURN false;
        WHEN '<', '<=', '>', '>=' THEN
            IF v_actual IS NULL OR v_expected IS NULL THEN
                RETURN false;
            END IF;
            IF pg_catalog.jsonb_typeof(v_actual) = 'number' AND pg_catalog.jsonb_typeof(v_expected) = 'number' THEN
                RETURN CASE v_operator
                    WHEN '<' THEN v_actual_text::numeric < v_expected_text::numeric
                    WHEN '<=' THEN v_actual_text::numeric <= v_expected_text::numeric
                    WHEN '>' THEN v_actual_text::numeric > v_expected_text::numeric
                    WHEN '>=' THEN v_actual_text::numeric >= v_expected_text::numeric
                END;
            END IF;
            RETURN CASE v_operator
                WHEN '<' THEN v_actual_text < v_expected_text
                WHEN '<=' THEN v_actual_text <= v_expected_text
                WHEN '>' THEN v_actual_text > v_expected_text
                WHEN '>=' THEN v_actual_text >= v_expected_text
            END;
        WHEN 'between', 'notBetween' THEN
            IF pg_catalog.jsonb_typeof(v_expected) <> 'array' OR pg_catalog.jsonb_array_length(v_expected) <> 2 THEN
                RAISE EXCEPTION '% operator requires a two-item array', v_operator;
            END IF;
            v_min := v_expected->0;
            v_max := v_expected->1;
            IF pg_catalog.jsonb_typeof(v_actual) = 'number'
                AND pg_catalog.jsonb_typeof(v_min) = 'number'
                AND pg_catalog.jsonb_typeof(v_max) = 'number' THEN
                v_lower_match := v_actual_text::numeric >= (v_min#>>'{}')::numeric;
                v_upper_match := v_actual_text::numeric <= (v_max#>>'{}')::numeric;
            ELSE
                v_lower_match := v_actual_text >= (v_min#>>'{}');
                v_upper_match := v_actual_text <= (v_max#>>'{}');
            END IF;
            RETURN CASE v_operator
                WHEN 'between' THEN v_lower_match AND v_upper_match
                ELSE NOT (v_lower_match AND v_upper_match)
            END;
        ELSE
            RAISE EXCEPTION 'Unsupported snapshot filter operator: %', v_operator;
    END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.rxdb_jsonb_matches_filter(
    p_document jsonb,
    p_filter jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_combinator text := p_filter->>'combinator';
    v_node jsonb;
    v_matches boolean;
BEGIN
    IF p_filter IS NULL OR pg_catalog.jsonb_array_length(COALESCE(p_filter->'rules', '[]'::jsonb)) = 0 THEN
        RETURN true;
    END IF;
    IF v_combinator NOT IN ('and', 'or') THEN
        RAISE EXCEPTION 'Invalid snapshot filter combinator: %', v_combinator;
    END IF;

    FOR v_node IN SELECT value FROM pg_catalog.jsonb_array_elements(p_filter->'rules')
    LOOP
        v_matches := CASE
            WHEN v_node ? 'rules' THEN public.rxdb_jsonb_matches_filter(p_document, v_node)
            ELSE public.rxdb_jsonb_matches_rule(p_document, v_node)
        END;
        IF v_combinator = 'and' AND NOT v_matches THEN
            RETURN false;
        END IF;
        IF v_combinator = 'or' AND v_matches THEN
            RETURN true;
        END IF;
    END LOOP;

    RETURN v_combinator = 'and';
END;
$$;

CREATE OR REPLACE FUNCTION public.rxdb_pull_changes(
    p_since_id integer,
    p_limit integer,
    p_namespace text,
    p_entity text,
    p_branch_id text DEFAULT NULL,
    p_filter jsonb DEFAULT NULL
)
RETURNS SETOF public.rxdb_change
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT change.*
    FROM public.rxdb_change AS change
    WHERE change.id > p_since_id
      AND change.namespace = p_namespace
      AND change.entity = p_entity
      AND (p_branch_id IS NULL OR change."branchId" = p_branch_id)
      AND (
        p_filter IS NULL
        OR NOT change."snapshotComplete"
        OR public.rxdb_jsonb_matches_filter(change."beforeData", p_filter)
        OR public.rxdb_jsonb_matches_filter(change."afterData", p_filter)
      )
    ORDER BY change.id ASC
    LIMIT GREATEST(p_limit, 0)
$$;

GRANT EXECUTE ON FUNCTION public.rxdb_jsonb_matches_rule(jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_jsonb_matches_filter(jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_pull_changes(integer, integer, text, text, text, jsonb) TO anon, authenticated;

-- ============================================
-- 启用 RxDB 同步的辅助函数
-- ============================================
CREATE OR REPLACE FUNCTION public.rxdb_enable_sync_for_table(
    p_table_name text,
    p_namespace text DEFAULT 'public',
    p_entity_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_entity_name text;
    v_has_updated_at boolean;
BEGIN
    IF p_entity_name IS NULL THEN
        v_entity_name := p_table_name;
    ELSE
        v_entity_name := p_entity_name;
    END IF;

    -- 1. 检查是否存在 updatedAt 字段
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = p_namespace
          AND table_name = p_table_name
          AND column_name = 'updatedAt'
    ) INTO v_has_updated_at;

    -- 2. 如果存在 updatedAt，创建自动更新触发器 (BEFORE UPDATE)
    IF v_has_updated_at THEN
        EXECUTE pg_catalog.format('
            DROP TRIGGER IF EXISTS rxdb_timestamp_trigger ON %I.%I;
            CREATE TRIGGER rxdb_timestamp_trigger
            BEFORE UPDATE ON %I.%I
            FOR EACH ROW EXECUTE FUNCTION public.rxdb_update_timestamp_trigger();
        ', p_namespace, p_table_name, p_namespace, p_table_name);
    END IF;

    -- 3. 创建变更日志触发器 (AFTER I/U/D)
    EXECUTE pg_catalog.format('
        DROP TRIGGER IF EXISTS rxdb_sync_trigger ON %I.%I;
        CREATE TRIGGER rxdb_sync_trigger
        AFTER INSERT OR UPDATE OR DELETE ON %I.%I
        FOR EACH ROW EXECUTE FUNCTION public.rxdb_log_change_trigger(%L, %L);
    ', p_namespace, p_table_name, p_namespace, p_table_name, p_namespace, v_entity_name);
END;
$$;

-- ============================================
-- 分支同步函数
-- ============================================
-- 用途: 将本地分支数据同步到远程 RxDBBranch 表
-- 规则:
--   1. 不同步 id='main' 的分支
--   2. 不修改远程已存在分支的 activated 属性
-- ============================================
CREATE OR REPLACE FUNCTION public.rxdb_enable_sync_for_branch(
    p_branches jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    item jsonb;
    v_id text;
    v_existing_activated boolean;
    synced_count int := 0;
    skipped_ids text[] := '{}';
BEGIN
    FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_branches)
    LOOP
        v_id := item->>'id';

        -- 规则 1: 不同步 main 分支
        IF v_id = 'main' THEN
            skipped_ids := pg_catalog.array_append(skipped_ids, v_id);
            CONTINUE;
        END IF;

        -- 规则 2: 查询远程是否已存在该分支，保留其 activated 值
        SELECT activated INTO v_existing_activated
        FROM public.rxdb_branch
        WHERE id = v_id;

        IF FOUND THEN
            -- 远程已存在：更新除 activated 以外的字段
            UPDATE public.rxdb_branch
            SET
                "fromChangeId" = (item->>'fromChangeId')::integer,
                "parentId" = item->>'parentId',
                "updatedAt" = pg_catalog.now()
            WHERE id = v_id;
        ELSE
            -- 远程不存在：插入新分支，activated 设为 false
            INSERT INTO public.rxdb_branch (
                id, activated, "fromChangeId", "parentId", "createdAt", "updatedAt"
            ) VALUES (
                v_id,
                false,
                (item->>'fromChangeId')::integer,
                item->>'parentId',
                pg_catalog.now(),
                pg_catalog.now()
            );
        END IF;

        synced_count := synced_count + 1;
    END LOOP;

    RETURN pg_catalog.jsonb_build_object(
        'synced', synced_count,
        'skipped', pg_catalog.to_jsonb(skipped_ids)
    );
END;
$$;

-- 授权
GRANT EXECUTE ON FUNCTION public.rxdb_enable_sync_for_branch(jsonb) TO anon, authenticated;
