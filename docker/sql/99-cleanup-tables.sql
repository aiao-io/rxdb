-- ============================================
-- Supabase 测试表清理脚本
-- ============================================
-- ⚠️ 警告: 此脚本会删除所有测试表及其数据！
-- ============================================

SET session_replication_role = 'replica';

DROP TABLE IF EXISTS public.todos CASCADE;

SET session_replication_role = 'origin';
