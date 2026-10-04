#!/bin/bash
# Supabase 测试数据库初始化脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="$SCRIPT_DIR/sql"
# 未显式隔离时退回 docker-compose.ci.yml 的默认 project 名，和它的
# `name: ${SUPABASE_CI_PROJECT_NAME:-supabase-ci}` 保持一致。
PROJECT_NAME="${SUPABASE_CI_PROJECT_NAME:-supabase-ci}"

echo "📦 Initializing Supabase test database..."
echo ""

# RV-036：改用 `docker compose -p "$PROJECT_NAME" exec` + 服务名 `db`，而不是
# 固定 `docker exec supabase-db`——后者是宿主机全局名字，多个 checkout 并行跑
# 会直接撞车或初始化到别的 checkout 的库。compose exec 按 project 隔离，天然
# 不会越界。
compose() {
  docker compose -p "$PROJECT_NAME" -f "$SCRIPT_DIR/docker-compose.ci.yml" "$@"
}

# `-v ON_ERROR_STOP=1` 不能省：psql 非交互读脚本时，默认遇到 SQL 错误只打一行到
# stderr 就接着往下跑，最后照样 exit 0。少了它，`set -e` 形同虚设 —— 建表失败的
# 数据库会带着 “✅ 初始化完成” 进入测试，报出来的是一堆莫名其妙的用例错误。
#
# 这里也不再用 `[ -f ]` 兜底：四个 SQL 都在仓库里，且互相有依赖（02 的函数是 03
# 建触发器用的）。文件没了就该在这一步炸，而不是静默跳过、把问题推到后面。
psql_file() {
  echo "📦 $2"
  compose exec -T db psql -v ON_ERROR_STOP=1 -U "${3:-postgres}" -d postgres < "$SQL_DIR/$1" > /dev/null
}

# 00 必须以 supabase_admin 执行：它要把 _realtime 的 owner 改成 supabase_admin，
# 而 supabase/postgres 镜像里的 postgres 并不是超级用户、也不是 supabase_admin 的
# 成员（`pg_has_role('postgres','supabase_admin','MEMBER')` = false），以 postgres
# 跑会稳定报 `ERROR: must be able to SET ROLE "supabase_admin"`。
# 加上 ON_ERROR_STOP 之前这行错误只打在 stderr 上、退出码仍是 0，所以一直没人发现。
# 其余四个继续用 postgres —— 业务表/函数的 owner 不能跟着变。
psql_file 00-realtime-schema.sql 'Creating realtime schema...' supabase_admin
psql_file 01-rxdb-system-tables.sql 'Loading system tables...'
psql_file 02-rxdb-sync-functions.sql 'Loading sync functions...'
psql_file 03-business-tables.sql 'Loading business tables...'
psql_file 04-rxdb-utils-functions.sql 'Loading utility functions...'

echo "✅ Database initialization complete!"
echo ""
echo "📊 Created tables:"
compose exec -T db psql -U postgres -d postgres -c "
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
"
