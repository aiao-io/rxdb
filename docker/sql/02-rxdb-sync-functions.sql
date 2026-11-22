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
-- SECURITY DEFINER（US-218 阶段 C）：生产权限脚本撤销了客户端对 rxdb_change 的写权限，
-- 触发器以属主身份写日志；触发器函数不能被直接调用，客户端无法借它写任意日志
CREATE OR REPLACE FUNCTION public.rxdb_log_change_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
    v_old_bucket text;
    v_new_bucket text;
    v_is_bucketed boolean;
    v_captured_deletes jsonb;
    v_capture_key text;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute
        WHERE attrelid = TG_RELID
          AND attname = 'rxdb_bucket'
          AND attnum > 0
          AND NOT attisdropped
    ) INTO v_is_bucketed;

    v_old_bucket := CASE WHEN TG_OP <> 'INSERT' THEN NULLIF((pg_catalog.to_jsonb(OLD)->>'rxdb_bucket'), '') END;
    v_new_bucket := CASE WHEN TG_OP <> 'DELETE' THEN NULLIF((pg_catalog.to_jsonb(NEW)->>'rxdb_bucket'), '') END;

    IF v_is_bucketed AND (TG_OP <> 'INSERT' AND v_old_bucket IS NULL OR TG_OP <> 'DELETE' AND v_new_bucket IS NULL) THEN
        RAISE EXCEPTION 'rxdb: bucketed entity %.% requires a non-null rxdb_bucket', v_namespace, v_entity
            USING ERRCODE = 'not_null_violation';
    END IF;

    IF pg_catalog.current_setting('rxdb.sync_enabled', true) = 'false' THEN
        IF TG_OP != 'DELETE' THEN
            RETURN NULL;
        END IF;

        v_captured_deletes := NULLIF(pg_catalog.current_setting('rxdb.captured_deletes', true), '')::jsonb;
        IF v_captured_deletes IS NULL THEN
            RETURN NULL;
        END IF;

        -- 推送事务内只捕获实际 DELETE，不写日志；哪些是客户端显式删的，由 rxdb_mutations 在业务写之后
        -- 按 id 列类型的等值关系配对。键取分区根：叶分区触发时 TG_RELID 是叶，请求里的可能是根表
        v_capture_key := pg_catalog.jsonb_build_array(
            COALESCE(pg_catalog.pg_partition_root(TG_RELID::regclass)::oid, TG_RELID)::text, OLD.id::text
        )::text;
        PERFORM pg_catalog.set_config(
            'rxdb.captured_deletes',
            pg_catalog.jsonb_set(v_captured_deletes, ARRAY[v_capture_key], pg_catalog.jsonb_build_object(
                'namespace', v_namespace, 'entity', v_entity, 'beforeData', pg_catalog.to_jsonb(OLD)
            ))::text,
            true
        );
        RETURN OLD;
    END IF;

    -- 尝试从配置或会话变量获取 branchId (可选)
    -- v_branch_id := current_setting('rxdb.branch_id', true);
    -- IF v_branch_id IS NULL THEN v_branch_id := 'main'; END IF;

    IF (TG_OP = 'INSERT') THEN
        v_entity_id := NEW.id::text;
        v_patch := pg_catalog.to_jsonb(NEW);

        INSERT INTO public.rxdb_change (
            namespace, entity, bucket, "entityId", type, patch, "inversePatch", "branchId",
            "beforeData", "afterData", "snapshotComplete"
        ) VALUES (
            v_namespace, v_entity, v_new_bucket, v_entity_id, 'INSERT',
            CASE WHEN v_is_bucketed THEN NULL ELSE v_patch END,
            NULL,
            v_branch_id,
            NULL,
            CASE WHEN v_is_bucketed THEN NULL ELSE pg_catalog.to_jsonb(NEW) END,
            NOT v_is_bucketed
        );
        RETURN NEW;

    ELSIF (TG_OP = 'UPDATE') THEN
        v_entity_id := NEW.id::text;

        IF v_old_bucket IS DISTINCT FROM v_new_bucket THEN
            INSERT INTO public.rxdb_change (
                namespace, entity, bucket, "entityId", type, patch, "inversePatch", "branchId",
                "beforeData", "afterData", "snapshotComplete"
            ) VALUES (
                v_namespace, v_entity, v_old_bucket, v_entity_id, 'DELETE', NULL, NULL, v_branch_id,
                NULL, NULL, true
            );
            INSERT INTO public.rxdb_change (
                namespace, entity, bucket, "entityId", type, patch, "inversePatch", "branchId",
                "beforeData", "afterData", "snapshotComplete"
            ) VALUES (
                v_namespace, v_entity, v_new_bucket, v_entity_id, 'INSERT', NULL, NULL, v_branch_id,
                NULL, NULL, false
            );
            RETURN NEW;
        END IF;

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
                namespace, entity, bucket, "entityId", type, patch, "inversePatch", "branchId",
                "beforeData", "afterData", "snapshotComplete"
            ) VALUES (
                v_namespace, v_entity, v_new_bucket, v_entity_id, 'UPDATE',
                CASE WHEN v_is_bucketed THEN NULL ELSE v_patch END,
                CASE WHEN v_is_bucketed THEN NULL ELSE v_inverse_patch END,
                v_branch_id,
                CASE WHEN v_is_bucketed THEN NULL ELSE pg_catalog.to_jsonb(OLD) END,
                CASE WHEN v_is_bucketed THEN NULL ELSE pg_catalog.to_jsonb(NEW) END,
                NOT v_is_bucketed
            );
        END IF;
        RETURN NEW;

    ELSIF (TG_OP = 'DELETE') THEN
        v_entity_id := OLD.id::text;
        v_patch := pg_catalog.to_jsonb(OLD);

        INSERT INTO public.rxdb_change (
            namespace, entity, bucket, "entityId", type, patch, "inversePatch", "branchId",
            "beforeData", "afterData", "snapshotComplete"
        ) VALUES (
            v_namespace, v_entity, v_old_bucket, v_entity_id, 'DELETE',
            CASE WHEN v_is_bucketed THEN NULL ELSE v_patch END,
            NULL,
            v_branch_id,
            CASE WHEN v_is_bucketed THEN NULL ELSE pg_catalog.to_jsonb(OLD) END,
            NULL,
            NOT v_is_bucketed
        );
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

-- 即使日志经 SECURITY DEFINER 推送入口或受信任的维护脚本写入，bucket 行也不能重新带正文。
CREATE OR REPLACE FUNCTION public.rxdb_strip_bucket_change_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF NEW.bucket IS NOT NULL THEN
        NEW.patch := NULL;
        NEW."inversePatch" := NULL;
        NEW."beforeData" := NULL;
        NEW."afterData" := NULL;
        NEW."snapshotComplete" := false;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER rxdb_change_strip_bucket_payload
BEFORE INSERT OR UPDATE ON public.rxdb_change
FOR EACH ROW EXECUTE FUNCTION public.rxdb_strip_bucket_change_payload();

-- ============================================
-- 日志 id 顺序 = 提交顺序（RV-01a1c49dee517814adf2e68788ad084e）
-- ============================================
-- 拉取以 id 为游标（`id > 上次拉到的 id`），而 serial 在写入时分配、提交时才可见：
-- 先拿到 id 却晚提交的事务，会被已经越过它的拉取方永久漏掉，而且不报错。
--
-- 语句级 BEFORE INSERT 触发器先于 serial 默认值求值。在这里取一把全库共用的事务级咨询锁、
-- 持有到事务结束，写日志的事务就逐个提交，后提交的一定拿到更大的 id。推送（rxdb_insert_changes）、
-- 直写业务表时的同步触发器、以及任何直接写本表的路径都经过它，不靠调用方各自加锁。
--
-- 代价：从写第一条日志到提交这一段，所有写日志的事务排队。推送在业务写之后才写日志，排队的只是尾段；
-- 直写业务表的长事务会一直挡住推送。直写的多语句事务与推送改到同一行时可能互锁，
-- PostgreSQL 检测到后中止其中一个（40P01），适配器的写入重试会重发被中止的推送。
--
-- 用 `CREATE OR REPLACE TRIGGER` 而不是先 DROP 再 CREATE，原因见 01-rxdb-system-tables.sql 的触发器一节。
CREATE OR REPLACE FUNCTION public.rxdb_change_serialize_append()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('rxdb'), pg_catalog.hashtext('rxdb_change:append'));
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER rxdb_change_serialize_append
BEFORE INSERT ON public.rxdb_change
FOR EACH STATEMENT EXECUTE FUNCTION public.rxdb_change_serialize_append();

-- ============================================
-- 变更通知：日志落库后广播只带元数据的提醒（US-225）
-- ============================================
-- 通知只说明「哪些实体在哪个分支变了、是谁推的」，不带 patch / inversePatch / beforeData / afterData；
-- 订阅者收到后以自己的身份拉取。未分区旧日志广播进私有频道 rxdb:changes，分区日志广播进带 bucket 的频道，
-- 谁能接收由生产权限脚本里 realtime.messages 的策略按频道与 caller buckets 决定。日志表本身已移出 supabase_realtime 发布（见 01）。
--
-- 语句级触发、每个 bucket 每 200 条聚合成一条：realtime.send 每次调用都开一个子事务（内部 BEGIN … EXCEPTION），
-- 按行发送时一次推送上千条变更，子事务数超过 64 会让快照子事务溢出、拖慢所有并发查询。
-- realtime.send 吞掉自己的错误（只发 WARNING），通知发不出去不会让推送失败；
-- 它在推送事务内写 realtime.messages，事务回滚就不会发出。
-- SECURITY DEFINER：realtime schema 的使用权只属于 Supabase 内置角色，不能转授给自定义角色。
CREATE OR REPLACE FUNCTION public.rxdb_change_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_batch jsonb;
    v_topic text;
BEGIN
    FOR v_batch, v_topic IN
        SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'namespace', numbered.namespace,
                'entity', numbered.entity,
                'entityId', numbered."entityId",
                'type', numbered.type,
                'branchId', numbered."branchId",
                'clientId', numbered."clientId",
                'createdAt', numbered."createdAt",
                'bucket', numbered.bucket
            )
            ORDER BY numbered.id
        ),
        CASE
            WHEN numbered.bucket IS NULL THEN 'rxdb:changes'
            ELSE 'rxdb:changes:bucket:' || numbered.bucket
        END
        FROM (
            SELECT inserted.*,
                   (pg_catalog.row_number() OVER (PARTITION BY inserted.bucket ORDER BY inserted.id) - 1) / 200 AS batch
            FROM inserted
        ) AS numbered
        GROUP BY numbered.bucket, numbered.batch
        ORDER BY numbered.bucket NULLS FIRST, numbered.batch
    LOOP
        PERFORM realtime.send(pg_catalog.jsonb_build_object('changes', v_batch), 'changes', v_topic, true);
    END LOOP;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.rxdb_change_broadcast() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER rxdb_change_broadcast
AFTER INSERT ON public.rxdb_change
REFERENCING NEW TABLE AS inserted
FOR EACH STATEMENT EXECUTE FUNCTION public.rxdb_change_broadcast();

-- ============================================
-- 远端身份（rxdb_backend，表在 01）
-- ============================================
-- 客户端把 rxdb_backend_id() 的返回值与拉取游标存在一起，同步前比对，对不上就停止同步。
-- 清空变更日志等于重建：id 可能从头计数（TRUNCATE ... RESTART IDENTITY），旧游标随之失效，
-- 所以语句级 AFTER TRUNCATE 触发器换一个新身份。只 DELETE 不重置序列时游标仍然有效，不换。
-- 两个函数都是 SECURITY DEFINER：生产权限撤销了客户端对 rxdb_backend 的写权限。
CREATE OR REPLACE FUNCTION public.rxdb_rotate_backend_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    UPDATE public.rxdb_backend
    SET id = pg_catalog.gen_random_uuid(), "createdAt" = pg_catalog.now()
    WHERE singleton;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER rxdb_change_rotate_backend_id
AFTER TRUNCATE ON public.rxdb_change
FOR EACH STATEMENT EXECUTE FUNCTION public.rxdb_rotate_backend_id();

CREATE OR REPLACE FUNCTION public.rxdb_backend_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT id FROM public.rxdb_backend WHERE singleton
$$;

GRANT EXECUTE ON FUNCTION public.rxdb_backend_id() TO anon, authenticated;

-- ============================================
-- 按授权分区的只读同步
-- ============================================
CREATE OR REPLACE FUNCTION public.rxdb_caller_buckets()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT CASE
        WHEN auth.uid() IS NULL THEN ARRAY['public']::text[]
        ELSE ARRAY['public', 'user:' || auth.uid()::text]::text[]
    END
$$;

CREATE OR REPLACE FUNCTION public.rxdb_entity_sync_info(
    p_namespace text,
    p_entity text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT COALESCE(
        (
            SELECT pg_catalog.jsonb_build_object(
                'namespace', namespace,
                'entity', entity,
                'tableName', "tableName",
                'bucketed', "bucketColumn" IS NOT NULL
            )
            FROM public.rxdb_sync_entity
            WHERE namespace = p_namespace AND entity = p_entity
        ),
        pg_catalog.jsonb_build_object(
            'namespace', p_namespace,
            'entity', p_entity,
            'tableName', NULL,
            'bucketed', false
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.rxdb_bucket_snapshot_point(
    p_namespace text,
    p_entity text,
    p_bucket text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF p_bucket IS NULL OR NOT (p_bucket = ANY(public.rxdb_caller_buckets())) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'insufficient_privilege',
            MESSAGE = 'rxdb: bucket is not authorized for the current caller';
    END IF;

    RETURN (
        SELECT COALESCE(MAX(id), 0)::integer
        FROM public.rxdb_change
        WHERE namespace = p_namespace
          AND entity = p_entity
          AND bucket = p_bucket
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rxdb_selectable_columns(
    p_namespace text,
    p_table text
)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT COALESCE(
        pg_catalog.array_agg(attribute.attname ORDER BY attribute.attnum),
        '{}'::text[]
    )
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = p_namespace
      AND relation.relname = p_table
      AND relation.relkind IN ('r', 'p', 'v')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND pg_catalog.has_column_privilege(
          current_user,
          relation.oid,
          attribute.attnum,
          'SELECT'
      )
$$;

CREATE OR REPLACE FUNCTION public.rxdb_assert_snapshot_filter_columns(
    p_filter jsonb,
    p_columns text[]
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    node jsonb;
    field text;
BEGIN
    IF p_filter IS NULL THEN
        RETURN;
    END IF;

    FOR node IN SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(p_filter->'rules', '[]'::jsonb))
    LOOP
        IF node ? 'rules' THEN
            PERFORM public.rxdb_assert_snapshot_filter_columns(node, p_columns);
            CONTINUE;
        END IF;

        field := node->>'field';
        IF field IS NULL OR NOT (field = ANY(p_columns)) THEN
            RAISE EXCEPTION USING
                ERRCODE = 'insufficient_privilege',
                MESSAGE = pg_catalog.format('rxdb: snapshot filter field %s is not readable by the current caller', field);
        END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.rxdb_selectable_row_expression(
    p_columns text[]
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT CASE
        WHEN pg_catalog.cardinality(p_columns) = 0 THEN NULL
        ELSE pg_catalog.format(
            'pg_catalog.jsonb_build_object(%s)',
            pg_catalog.array_to_string(
                ARRAY(
                    SELECT pg_catalog.format('%L, table_data.%I', column_name, column_name)
                    FROM pg_catalog.unnest(p_columns) AS columns(column_name)
                ),
                ', '
            )
        )
    END
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

    IF v_operator IN ('in', 'notIn')
       AND pg_catalog.jsonb_typeof(v_expected) = 'array'
       AND pg_catalog.jsonb_array_length(v_expected) = 0 THEN
        RETURN v_operator = 'notIn';
    END IF;

    IF v_actual IS NULL OR v_actual = 'null'::jsonb THEN
        IF v_operator = '=' THEN
            RETURN v_expected IS NULL OR v_expected = 'null'::jsonb;
        END IF;
        IF v_operator IN ('null', 'isNull') THEN
            RETURN true;
        END IF;
        IF v_operator IN ('notNull', 'isNotNull') THEN
            RETURN false;
        END IF;
        RETURN false;
    END IF;

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
      AND change.bucket IS NULL
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

-- 拉取要求已登录（US-225）；anon 的执行权由生产权限脚本收回（Supabase 的默认权限会在建函数时授给 anon）
GRANT EXECUTE ON FUNCTION public.rxdb_jsonb_matches_rule(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_jsonb_matches_filter(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_pull_changes(integer, integer, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_selectable_columns(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_assert_snapshot_filter_columns(jsonb, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_selectable_row_expression(text[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rxdb_pull_bucket_changes(
    p_since_id integer,
    p_limit integer,
    p_namespace text,
    p_entity text,
    p_bucket text,
    p_branch_id text DEFAULT NULL,
    p_filter jsonb DEFAULT NULL
)
RETURNS SETOF public.rxdb_change
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_table_name text;
    v_bucket_column text;
    v_columns text[];
    v_row_expression text;
BEGIN
    IF p_bucket IS NULL OR NOT (p_bucket = ANY(public.rxdb_caller_buckets())) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'insufficient_privilege',
            MESSAGE = 'rxdb: bucket is not authorized for the current caller';
    END IF;

    SELECT info->>'tableName',
           CASE WHEN (info->>'bucketed')::boolean THEN 'rxdb_bucket' ELSE NULL END
    INTO v_table_name, v_bucket_column
    FROM (SELECT public.rxdb_entity_sync_info(p_namespace, p_entity) AS info) AS entity_info;

    IF v_table_name IS NULL OR v_bucket_column IS NULL THEN
        RAISE EXCEPTION 'Entity %.% is not bucketed', p_namespace, p_entity;
    END IF;

    v_columns := public.rxdb_selectable_columns(p_namespace, v_table_name);
    IF NOT ('id' = ANY(v_columns)) OR NOT (v_bucket_column = ANY(v_columns)) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'insufficient_privilege',
            MESSAGE = 'rxdb: id and bucket columns must be readable for bucket sync';
    END IF;
    PERFORM public.rxdb_assert_snapshot_filter_columns(p_filter, v_columns);
    v_row_expression := public.rxdb_selectable_row_expression(v_columns);

    RETURN QUERY EXECUTE pg_catalog.format($query$
        WITH scoped_changes AS (
            SELECT
                change.*,
                current_row.row_json,
                CASE
                    WHEN change.type = 'DELETE' OR current_row.row_json IS NULL THEN 'DELETE'
                    WHEN $7 IS NOT NULL
                         AND NOT public.rxdb_jsonb_matches_filter(current_row.row_json, $7)
                        THEN 'DELETE'
                    ELSE change.type
                END AS effective_type
            FROM public.rxdb_change AS change
            LEFT JOIN LATERAL (
                SELECT %1$s AS row_json
                FROM %2$I.%3$I AS table_data
                WHERE table_data.id::text = change."entityId"
                  AND table_data.%4$I::text = $5
                LIMIT 1
            ) AS current_row ON true
            WHERE change.id > $1
              AND change.namespace = $3
              AND change.entity = $4
              AND change.bucket = $5
              AND ($6 IS NULL OR change."branchId" = $6)
        )
        SELECT
            id,
            namespace,
            entity,
            bucket,
            "entityId",
            "branchId",
            effective_type::varchar,
            CASE WHEN effective_type = 'DELETE' THEN NULL ELSE row_json END,
            NULL::jsonb,
            NULL::jsonb,
            CASE WHEN effective_type = 'DELETE' THEN NULL ELSE row_json END,
            true,
            "transactionId",
            "localId",
            "clientId",
            "createdAt",
            "updatedAt"
        FROM scoped_changes
        WHERE $7 IS NULL
           OR effective_type = 'DELETE'
           OR public.rxdb_jsonb_matches_filter(row_json, $7)
        ORDER BY id ASC
        LIMIT GREATEST($2, 0)
    $query$, v_row_expression, p_namespace, v_table_name, v_bucket_column)
    USING p_since_id, p_limit, p_namespace, p_entity, p_bucket, p_branch_id, p_filter;
END;
$$;

CREATE OR REPLACE FUNCTION public.rxdb_pull_bucket_snapshot(
    p_namespace text,
    p_entity text,
    p_bucket text,
    p_filter jsonb DEFAULT NULL,
    p_offset integer DEFAULT 0,
    p_limit integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_table_name text;
    v_bucket_column text;
    v_columns text[];
    v_row_expression text;
    v_rows jsonb;
BEGIN
    IF p_bucket IS NULL OR NOT (p_bucket = ANY(public.rxdb_caller_buckets())) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'insufficient_privilege',
            MESSAGE = 'rxdb: bucket is not authorized for the current caller';
    END IF;

    SELECT info->>'tableName',
           CASE WHEN (info->>'bucketed')::boolean THEN 'rxdb_bucket' ELSE NULL END
    INTO v_table_name, v_bucket_column
    FROM (SELECT public.rxdb_entity_sync_info(p_namespace, p_entity) AS info) AS entity_info;

    IF v_table_name IS NULL OR v_bucket_column IS NULL THEN
        RAISE EXCEPTION 'Entity %.% is not bucketed', p_namespace, p_entity;
    END IF;

    v_columns := public.rxdb_selectable_columns(p_namespace, v_table_name);
    IF NOT ('id' = ANY(v_columns)) OR NOT (v_bucket_column = ANY(v_columns)) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'insufficient_privilege',
            MESSAGE = 'rxdb: id and bucket columns must be readable for bucket sync';
    END IF;
    PERFORM public.rxdb_assert_snapshot_filter_columns(p_filter, v_columns);
    v_row_expression := public.rxdb_selectable_row_expression(v_columns);

    EXECUTE pg_catalog.format(
        'SELECT COALESCE(pg_catalog.jsonb_agg(row_data.row_json ORDER BY row_data.row_id), ''[]''::jsonb)
         FROM (
             SELECT table_data.id AS row_id, %s AS row_json
             FROM %I.%I AS table_data
             WHERE table_data.%I::text = $1
               AND ($2 IS NULL OR public.rxdb_jsonb_matches_filter(%s, $2))
             ORDER BY table_data.id
             OFFSET GREATEST($3, 0)
             LIMIT GREATEST($4, 0)
         ) AS row_data',
        v_row_expression, p_namespace, v_table_name, v_bucket_column, v_row_expression
    ) INTO v_rows USING p_bucket, p_filter, p_offset, p_limit;

    RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rxdb_caller_buckets() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_entity_sync_info(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_bucket_snapshot_point(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_pull_bucket_changes(integer, integer, text, text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_pull_bucket_snapshot(text, text, text, jsonb, integer, integer) TO anon, authenticated;

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
    v_has_bucket_column boolean;
    v_was_bucketed boolean;
BEGIN
    IF p_entity_name IS NULL THEN
        v_entity_name := p_table_name;
    ELSE
        v_entity_name := p_entity_name;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = p_namespace
          AND table_name = p_table_name
          AND column_name = 'rxdb_bucket'
    ) INTO v_has_bucket_column;

    SELECT COALESCE("bucketColumn" IS NOT NULL, false)
    INTO v_was_bucketed
    FROM public.rxdb_sync_entity
    WHERE namespace = p_namespace AND entity = v_entity_name;
    v_was_bucketed := COALESCE(v_was_bucketed, false);

    -- 1. 检查是否存在 updatedAt 字段
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = p_namespace
          AND table_name = p_table_name
          AND column_name = 'updatedAt'
    ) INTO v_has_updated_at;

    INSERT INTO public.rxdb_sync_entity (namespace, entity, "tableName", "bucketColumn", "updatedAt")
    VALUES (
        p_namespace,
        v_entity_name,
        p_table_name,
        CASE WHEN v_has_bucket_column THEN 'rxdb_bucket' ELSE NULL END,
        pg_catalog.now()
    )
    ON CONFLICT (namespace, entity) DO UPDATE SET
        "tableName" = EXCLUDED."tableName",
        "bucketColumn" = EXCLUDED."bucketColumn",
        "updatedAt" = EXCLUDED."updatedAt";

    IF v_has_bucket_column THEN
        IF NOT v_was_bucketed THEN
            DELETE FROM public.rxdb_change
            WHERE namespace = p_namespace AND entity = v_entity_name;
        ELSE
            DELETE FROM public.rxdb_change
            WHERE namespace = p_namespace AND entity = v_entity_name AND bucket IS NULL;
            UPDATE public.rxdb_change
            SET patch = NULL,
                "inversePatch" = NULL,
                "beforeData" = NULL,
                "afterData" = NULL,
                "snapshotComplete" = false
            WHERE namespace = p_namespace AND entity = v_entity_name;
        END IF;
    END IF;

    -- 2. 如果存在 updatedAt，创建自动更新触发器 (BEFORE UPDATE)
    --
    -- 这里和下面都用 `CREATE OR REPLACE TRIGGER`（PG 14+）而不是
    -- `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`：后者在 Supabase 库里会对全库的
    -- auth.*/realtime.* 表加 AccessExclusiveLock（详见 01-rxdb-system-tables.sql
    -- 的说明）。这个函数是测试运行期按表反复调用的，留着等于给每次建表都埋一次
    -- 和 auth/realtime 后台 DDL 互锁的机会。
    IF v_has_updated_at THEN
        EXECUTE pg_catalog.format('
            CREATE OR REPLACE TRIGGER rxdb_timestamp_trigger
            BEFORE UPDATE ON %I.%I
            FOR EACH ROW EXECUTE FUNCTION public.rxdb_update_timestamp_trigger();
        ', p_namespace, p_table_name);
    END IF;

    -- 3. 创建变更日志触发器 (AFTER I/U/D)
    EXECUTE pg_catalog.format('
        CREATE OR REPLACE TRIGGER rxdb_sync_trigger
        AFTER INSERT OR UPDATE OR DELETE ON %I.%I
        FOR EACH ROW EXECUTE FUNCTION public.rxdb_log_change_trigger(%L, %L);
    ', p_namespace, p_table_name, p_namespace, v_entity_name);
END;
$$;

-- ============================================
-- 非 main 分支的所有者（US-225，表在 01）
-- ============================================
-- 已有所有者：必须是调用者。没有所有者：分支已有日志或登记（所有者表出现之前的旧数据）就拒绝，
-- 要求先在 rxdb_branch_owner 补登；否则由调用者认领。并发认领同一分支时，唯一键让后到的一方
-- 等先到的事务结束，再按其结果判定。
-- 只被 rxdb_enable_sync_for_branch 与 rxdb_insert_changes 调用，两者都是 SECURITY DEFINER，
-- 不授给任何客户端角色。
CREATE OR REPLACE FUNCTION public.rxdb_claim_branch(p_branch_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_owner uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'insufficient_privilege',
            MESSAGE = pg_catalog.format('rxdb: writing branch %s requires an authenticated user', p_branch_id);
    END IF;

    SELECT "ownerId" INTO v_owner FROM public.rxdb_branch_owner WHERE "branchId" = p_branch_id;

    IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM public.rxdb_branch WHERE id = p_branch_id)
            OR EXISTS (SELECT 1 FROM public.rxdb_change WHERE "branchId" = p_branch_id) THEN
            RAISE EXCEPTION USING
                ERRCODE = 'insufficient_privilege',
                MESSAGE = pg_catalog.format('rxdb: branch %s has no owner', p_branch_id),
                HINT = 'Assign its owner in public.rxdb_branch_owner before writing to it.';
        END IF;

        INSERT INTO public.rxdb_branch_owner ("branchId", "ownerId")
        VALUES (p_branch_id, v_caller)
        ON CONFLICT ("branchId") DO NOTHING;

        SELECT "ownerId" INTO v_owner FROM public.rxdb_branch_owner WHERE "branchId" = p_branch_id;
    END IF;

    IF v_owner IS DISTINCT FROM v_caller THEN
        RAISE EXCEPTION USING
            ERRCODE = 'insufficient_privilege',
            MESSAGE = pg_catalog.format('rxdb: branch %s belongs to another user', p_branch_id);
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rxdb_claim_branch(text) FROM PUBLIC, anon, authenticated;

-- ============================================
-- 分支同步函数
-- ============================================
-- 用途: 将本地分支数据同步到远程 RxDBBranch 表
-- 规则:
--   1. 不同步 id='main' 的分支
--   2. 不修改远程已存在分支的 activated 属性
--   3. 只能登记或改写调用者拥有的分支，第一次登记即认领（US-225）
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

        -- 规则 3: 先认领或校验所有者，再动 rxdb_branch（认领要看分支此刻是否已有登记）
        PERFORM public.rxdb_claim_branch(v_id);

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

-- 授权：登记分支要求已登录（anon 的执行权由生产权限脚本收回）
GRANT EXECUTE ON FUNCTION public.rxdb_enable_sync_for_branch(jsonb) TO authenticated;
