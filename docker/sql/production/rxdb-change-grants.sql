-- ============================================
-- RxDB 生产权限：收口 rxdb_change 写入（US-218 阶段 C）
-- ============================================
-- 用途: 撤销客户端角色（anon / authenticated）对变更日志表的直接写权限，
--       日志只能经 rxdb_mutations → rxdb_insert_changes 与同步触发器（均为 SECURITY DEFINER）写入
-- 依赖: 必须在 docker/sql/01～04 全部执行之后执行
-- 加载: init-db.sh 不自动加载；生产部署时手工执行，幂等，可重复执行
-- 开发: 开发默认保持宽松，Supabase 测试以 anon 清理 rxdb_change，收紧会破坏它们
-- ============================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rxdb_change FROM anon, authenticated;
REVOKE USAGE, UPDATE ON SEQUENCE public.rxdb_change_id_seq FROM anon, authenticated;

-- 保留 SELECT：rxdb_pull_changes（SECURITY INVOKER）与 realtime 以调用方身份读日志
GRANT SELECT ON public.rxdb_change TO anon, authenticated;
