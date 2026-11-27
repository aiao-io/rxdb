-- ============================================
-- RxDB 生产权限：日志同步协议按身份与分区开放（US-218 阶段 C、US-225、US-033）
-- ============================================
-- 用途:
--   1. 撤销客户端角色（anon / authenticated）对变更日志表与远端身份表的直接写权限，日志只能经
--      rxdb_mutations → rxdb_insert_changes 与同步触发器（均为 SECURITY DEFINER）写入。
--   2. anon 只能读取分区日志中 caller buckets 默认公开的 public 区，不能调用拉取、推送、分支登记与存在性探针；
--      只保留连接时调用的 rxdb_server_version / rxdb_backend_id / rxdb_check_rls。anon 仍可按业务表
--      自己的 GRANT 与 RLS 直接读写。推送对「被 RLS 拒绝」与「已不存在」分别报错，本身就是存在性信号，
--      所以推送与探针一并收回。authenticated 可读取自己被授权的分区以及未分区旧日志。
--   3. 分支表与分支所有者表只经 SECURITY DEFINER 函数写入（rxdb_enable_sync_for_branch / rxdb_claim_branch）。
--      分支表、远端身份表与日志表一样开着 RLS、只有读取策略，客户端即便重新拿到写权限也写不进去。
--   4. 实时变更通知：未分区旧日志使用私有频道 rxdb:changes，分区日志使用带 bucket 的私有频道；旧日志只对 authenticated 开放，分区频道按 rxdb_caller_buckets() 开放接收，客户端不能往里发消息。
--   5. 远端变更历史 rxdb_change_history（US-229）：客户端不能直接读写，只经 rxdb_entity_history（authenticated）读取。
--   6. 成员权限 rxdb_caller_grants / rxdb_caller_scopes（US-234）：anon 与 authenticated 都能读自己的授权（anon 为空）。
-- 适用边界: 带 rxdb_bucket 的日志按 rxdb_caller_buckets() 做 RLS，未分区旧日志仍对 authenticated 可读。
--       anon 默认只能读取 public 区。应用通过 SECURITY DEFINER 的 rxdb_caller_buckets() 扩展租户授权，
--       见 requirements/epics/epic-015-identity-scoped-sync.md。
-- 依赖: 必须在 docker/sql/01～04 全部执行之后执行；Supabase 的默认权限会在建表、建函数时授给 anon，
--       01～04 里重建过的函数（DROP 后 CREATE）要再执行一次本脚本才会收回。
--       本脚本只收回 RxDB 自己的对象，收不回 01 / 03 整库授权对业务表的放宽；生产库从旧版本升级时
--       不重跑 01，改用增量脚本 rxdb-sync-access-upgrade.sql，与 02、04、本脚本在同一个事务里执行。
-- 加载: init-db.sh 与 CI 的 .github/actions/supabase 都会在 01～04 之后自动加载（开发默认与生产一致，
--       零散收尾项第 13 条）；生产部署时手工执行亦可。幂等，可重复执行。
-- 测试前提: Supabase 测试以 authenticated 身份运行（见 packages/rxdb-adapter-supabase/src/__tests__/test-utils.ts）；
--       对 rxdb_change 的直写与清理经 service_role 身份。
-- ============================================

-- 1. 变更日志：按 caller buckets 做分区 RLS（rxdb_pull_changes 是 SECURITY INVOKER，以调用方身份读）
REVOKE ALL ON public.rxdb_change FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.rxdb_change FROM authenticated;
GRANT SELECT ON public.rxdb_change TO authenticated;
REVOKE ALL ON SEQUENCE public.rxdb_change_id_seq FROM PUBLIC, anon;
REVOKE USAGE, UPDATE ON SEQUENCE public.rxdb_change_id_seq FROM authenticated;

-- 远端身份同样只读：客户端能改它，就能让所有客户端误判远端已重置而停止同步。
-- 读经 rxdb_backend_id()，轮换只经 TRUNCATE rxdb_change 的触发器（均为 SECURITY DEFINER）。
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rxdb_backend FROM anon, authenticated;
GRANT SELECT ON public.rxdb_backend TO anon, authenticated;

-- 分区日志对 anon 只开放其 caller buckets（默认只有 public），authenticated 还可读旧的未分区日志。
ALTER TABLE public.rxdb_change ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.rxdb_change TO anon;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'rxdb_change' AND policyname = 'rxdb_change_read_by_bucket'
  ) THEN
    ALTER POLICY rxdb_change_read_by_bucket ON public.rxdb_change
      TO anon, authenticated
      USING (
        (auth.role() = 'authenticated' AND bucket IS NULL)
        OR (bucket IS NOT NULL AND bucket = ANY(public.rxdb_caller_buckets()))
      );
  ELSE
    CREATE POLICY rxdb_change_read_by_bucket ON public.rxdb_change
      FOR SELECT
      TO anon, authenticated
      USING (
        (auth.role() = 'authenticated' AND bucket IS NULL)
        OR (bucket IS NOT NULL AND bucket = ANY(public.rxdb_caller_buckets()))
      );
  END IF;
END $$;

-- 实体注册表只经快照 RPC 读取，避免把部署元数据当作业务表暴露。
REVOKE ALL ON public.rxdb_sync_entity FROM PUBLIC, anon, authenticated;

-- 远端变更历史（US-229）：客户端角色不能直接读写，只经 rxdb_entity_history 按编辑权限与列权限读取。
-- RLS 开着并 FORCE、不建策略：即便整库 GRANT 把表权限放了回来，也读写不了任何一行
REVOKE ALL ON public.rxdb_change_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.rxdb_change_history_id_seq FROM PUBLIC, anon, authenticated;
ALTER TABLE public.rxdb_change_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rxdb_change_history FORCE ROW LEVEL SECURITY;

-- 2. 分支：authenticated 可读；登记与改写只经 rxdb_enable_sync_for_branch（校验所有者）
REVOKE ALL ON public.rxdb_branch FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.rxdb_branch FROM authenticated;
GRANT SELECT ON public.rxdb_branch TO authenticated;

-- 分支所有者：客户端不读不写（表上还开着 RLS 且没有策略，见 01）
REVOKE ALL ON public.rxdb_branch_owner FROM PUBLIC, anon, authenticated;

-- 分支表与远端身份表也以 RLS 为边界，只建读取策略。Supabase 上整库 GRANT 很常见（01 / 03 自己就这么做），
-- 只靠上面收回写权限不牢靠：没有写策略，客户端即便重新拿到写权限也改不了一行。写入只经 SECURITY DEFINER
-- 函数与触发器，属主不受 RLS 约束。适配器 connect() 的 RLS 自检默认也检查 rxdb_branch
DO $$
DECLARE
  v_table text;
  v_roles text;
BEGIN
  FOR v_table, v_roles IN VALUES ('rxdb_branch', 'authenticated'), ('rxdb_backend', 'anon, authenticated')
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE schemaname = 'public' AND tablename = v_table AND policyname = v_table || '_read'
    ) THEN
      EXECUTE pg_catalog.format('ALTER POLICY %I ON public.%I TO %s USING (true)', v_table || '_read', v_table, v_roles);
    ELSE
      EXECUTE pg_catalog.format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO %s USING (true)', v_table || '_read', v_table, v_roles
      );
    END IF;
  END LOOP;
END $$;

-- 3. 日志协议的函数：收回 PUBLIC 与 anon，显式授给 authenticated 与 service_role。
-- PostgreSQL 建函数时默认授 EXECUTE 给 PUBLIC，Supabase 的默认权限还会授给 anon，两处都要收。
-- 签名写死：函数改了签名而这里没跟上，类型转换直接报错，不会静默漏收
DO $$
DECLARE
  v_function regprocedure;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.rxdb_pull_changes(integer, integer, text, text, text, jsonb)',
    'public.rxdb_caller_buckets()',
    'public.rxdb_caller_grants()',
    'public.rxdb_caller_scopes(text)',
    'public.rxdb_entity_sync_info(text, text)',
    'public.rxdb_bucket_snapshot_point(text, text, text, text[])',
    'public.rxdb_pull_bucket_changes(integer, integer, text, text, text, text, jsonb)',
    'public.rxdb_pull_bucket_snapshot(text, text, text, jsonb, text, integer)',
    'public.rxdb_jsonb_matches_rule(jsonb, jsonb)',
    'public.rxdb_jsonb_matches_filter(jsonb, jsonb)',
    'public.rxdb_selectable_columns(text, text)',
    'public.rxdb_assert_snapshot_filter_columns(jsonb, text[])',
    'public.rxdb_selectable_row_expression(text[])',
    'public.rxdb_enable_sync_for_branch(jsonb)',
    'public.rxdb_mutations(jsonb, jsonb, jsonb, boolean, jsonb, boolean, jsonb)',
    'public.rxdb_assert_push_integrity(jsonb, jsonb, jsonb, boolean, jsonb)',
    'public.rxdb_mutations_deferred_columns(jsonb)',
    'public.rxdb_mutations_apply_groups(jsonb, jsonb, text[], boolean, boolean, jsonb)',
    'public.rxdb_mutations_fill_deferred(jsonb, jsonb, boolean)',
    'public.rxdb_mutations_apply_group(text, text, text, jsonb, boolean)',
    'public.rxdb_mutations_depends_on(text, text, text, jsonb)',
    'public.rxdb_mutations_replay_group(text, text, text, jsonb, boolean)',
    'public.rxdb_insert_changes(jsonb)',
    'public.rxdb_batch_upsert(text, text, jsonb)',
    'public.rxdb_execute_batch_update(text, text, jsonb, boolean)',
    'public.rxdb_batch_update_rows(text, text, jsonb)',
    'public.rxdb_batch_update(text, text, jsonb)',
    'public.rxdb_batch_delete(text, text, text[])',
    'public.rxdb_id_array_type(text, text)',
    'public.rxdb_existing_ids(text, text, text[])',
    'public.rxdb_entity_history(text, text, text, bigint, integer)'
  ]::regprocedure[]
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_function);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_function);
  END LOOP;
END $$;

-- 分区只读协议同时服务 anon 的公开区与 authenticated 的授权区。
GRANT EXECUTE ON FUNCTION public.rxdb_caller_buckets() TO anon, authenticated;
-- 成员权限（US-234）：调用者读自己在各作用域上的权限，anon 得到空结果；业务表 RLS 以调用者身份调 rxdb_caller_scopes
GRANT EXECUTE ON FUNCTION public.rxdb_caller_grants() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_caller_scopes(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_entity_sync_info(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_bucket_snapshot_point(text, text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_pull_bucket_changes(integer, integer, text, text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_pull_bucket_snapshot(text, text, text, jsonb, text, integer) TO anon, authenticated;
-- 快照 RPC 在调用者权限下执行，需允许它使用纯 JSON filter helper；helper 不访问业务表。
GRANT EXECUTE ON FUNCTION public.rxdb_jsonb_matches_rule(jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_jsonb_matches_filter(jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_selectable_columns(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_assert_snapshot_filter_columns(jsonb, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rxdb_selectable_row_expression(text[]) TO anon, authenticated;

-- 部署时调用的建表辅助函数不对 anon 开放
REVOKE ALL ON FUNCTION public.rxdb_enable_sync_for_table(text, text, text) FROM PUBLIC, anon;

-- 只由 SECURITY DEFINER 函数与触发器内部调用，不授给任何客户端角色
REVOKE ALL ON FUNCTION public.rxdb_claim_branch(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rxdb_change_broadcast() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rxdb_strip_bucket_change_payload() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rxdb_record_change_history(
  integer, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rxdb_caller_can_edit(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rxdb_caller_can_edit_default(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rxdb_jsonb_pick(jsonb, text[]) FROM PUBLIC, anon, authenticated;

-- 4. 实时变更通知：Realtime 在加入私有频道时以登录用户身份试读 realtime.messages，有 SELECT 策略才放行。
-- 只建 SELECT 策略、不建 INSERT 策略：广播只由日志插入触发器经 realtime.send 写入，客户端发不了伪造通知。
-- 未分区旧日志继续使用统一频道；分区日志使用带 bucket 的频道，策略只放行 caller buckets 对应的频道。
-- 不用 DROP POLICY 重建：在 Supabase 上对 auth / realtime 表做 DROP 类 DDL 可能和 GoTrue 迁移互锁
-- （见 01-rxdb-system-tables.sql 的触发器一节），已存在时改用 ALTER POLICY 刷新条件
DO $$
DECLARE
  v_policy text := $policy$
    extension = 'broadcast'
    AND (
      topic = 'rxdb:changes'
      OR (
        topic LIKE 'rxdb:changes:bucket:%'
        AND pg_catalog.substr(topic, pg_catalog.char_length('rxdb:changes:bucket:') + 1)
          = ANY(public.rxdb_caller_buckets())
      )
    )
  $policy$;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages' AND policyname = 'rxdb_changes_receive'
  ) THEN
    EXECUTE pg_catalog.format(
      'ALTER POLICY rxdb_changes_receive ON realtime.messages TO authenticated USING (%s)',
      v_policy
    );
  ELSE
    EXECUTE pg_catalog.format(
      'CREATE POLICY rxdb_changes_receive ON realtime.messages FOR SELECT TO authenticated USING (%s)',
      v_policy
    );
  END IF;
END $$;
