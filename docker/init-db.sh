#!/bin/bash
# Supabase 测试数据库初始化脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="$SCRIPT_DIR/sql"

echo "📦 Initializing Supabase test database..."
echo ""

# 通过 docker exec 直接连接数据库容器，避免连接池问题

# 0. 创建 realtime schema - 必须最先执行
if [ -f "$SQL_DIR/00-realtime-schema.sql" ]; then
  echo "📦 Creating realtime schema..."
  docker exec -i supabase-db psql -U postgres -d postgres < "$SQL_DIR/00-realtime-schema.sql" > /dev/null
fi

# 1. 加载系统表（RxDBChange 等）
if [ -f "$SQL_DIR/01-rxdb-system-tables.sql" ]; then
  echo "📦 Loading system tables..."
  docker exec -i supabase-db psql -U postgres -d postgres < "$SQL_DIR/01-rxdb-system-tables.sql" > /dev/null
fi

# 2. 加载通用函数 - 依赖系统表
if [ -f "$SQL_DIR/02-rxdb-sync-functions.sql" ]; then
  echo "📦 Loading sync functions..."
  docker exec -i supabase-db psql -U postgres -d postgres < "$SQL_DIR/02-rxdb-sync-functions.sql" > /dev/null
fi

# 3. 加载业务表 - 依赖函数（用于创建触发器）
echo "📦 Loading business tables..."
docker exec -i supabase-db psql -U postgres -d postgres < "$SQL_DIR/03-business-tables.sql" > /dev/null

# 4. 加载工具函数 (批量操作等)
if [ -f "$SQL_DIR/04-rxdb-utils-functions.sql" ]; then
  echo "📦 Loading utility functions..."
  docker exec -i supabase-db psql -U postgres -d postgres < "$SQL_DIR/04-rxdb-utils-functions.sql" > /dev/null
fi

echo "✅ Database initialization complete!"
echo ""
echo "📊 Created tables:"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
"
