#!/bin/bash
#
# 重置 Supabase 测试数据库
#
# 删除所有测试 schema/table/function，然后重新执行 init-db.sh
# 用于测试环境的完全重置
#
# 使用方法:
#   ./docker/reset.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔄 重置 Supabase 测试数据库..."
echo ""

# 检查容器是否运行
if ! docker ps | grep -q supabase-db; then
  echo "❌ Supabase 容器未运行，请先执行: ./docker/start.sh"
  exit 1
fi

echo "🗑️  删除所有测试 schema 和函数..."

# 删除测试使用的 schema/table/function
docker exec supabase-db psql -U postgres -d postgres -c "
-- 禁用外键约束检查（加速删除）
SET session_replication_role = 'replica';

-- 删除业务 schema
DROP SCHEMA IF EXISTS shop CASCADE;

-- 动态删除 public schema 中的所有表
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS \"' || r.tablename || '\" CASCADE';
        RAISE NOTICE 'Dropped table: %', r.tablename;
    END LOOP;
END \$\$;

-- 删除 public schema 中的所有用户定义函数（排除系统函数）
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT n.nspname as schema, p.proname as name,
               pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS \"' || r.schema || '\".\"' || r.name || '\"(' || r.args || ') CASCADE';
        RAISE NOTICE 'Dropped function: %.%', r.schema, r.name;
    END LOOP;
END \$\$;

-- 恢复外键约束检查
SET session_replication_role = 'origin';
"

echo ""
echo "📦 重新初始化数据库..."
echo ""

# 执行初始化脚本
"$SCRIPT_DIR/init-db.sh"

echo ""
echo "✅ 测试数据库重置完成！"
