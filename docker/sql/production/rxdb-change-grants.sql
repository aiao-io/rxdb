-- ============================================
-- RxDB 生产权限：收口 rxdb_change 写入（US-218 阶段 C）
-- ============================================
-- 用途: 撤销客户端角色（anon / authenticated）对变更日志表的直接写权限，
--       日志只能经 rxdb_mutations → rxdb_insert_changes 与同步触发器（均为 SECURITY DEFINER）写入
-- 依赖: 必须在 docker/sql/01～04 全部执行之后执行
-- 加载: init-db.sh 与 CI 的 .github/actions/supabase 都会在 01～04 之后自动加载（开发默认与生产一致，
--       零散收尾项第 13 条）；生产部署时手工执行亦可。幂等，可重复执行。
-- 测试前提: Supabase 测试对 rxdb_change 的直写与清理经 service_role 身份
--       （见 packages/rxdb-adapter-supabase/src/__tests__/test-utils.ts），anon 只读。
-- ============================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rxdb_change FROM anon, authenticated;
REVOKE USAGE, UPDATE ON SEQUENCE public.rxdb_change_id_seq FROM anon, authenticated;

-- 保留 SELECT：rxdb_pull_changes（SECURITY INVOKER）与 realtime 以调用方身份读日志
GRANT SELECT ON public.rxdb_change TO anon, authenticated;
