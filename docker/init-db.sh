#!/bin/bash
# Supabase 测试数据库初始化脚本
#
# 用法：
#   ./init-db.sh                                          # 初始化 start.sh 起的默认栈
#   ./init-db.sh -p <compose 项目> -f docker-compose.ci.yml # 初始化隔离 CI 栈（supabase-ci-up.sh 传）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="$SCRIPT_DIR/sql"
# 初始化哪套栈由调用者说了算：参数原样交给 `docker compose`，与调用者起栈时的项目和配置文件一致。
# 不带参数就是 start.sh / reset.sh / README 单独初始化面对的默认栈 —— 和 start.sh 一样在 docker/
# 下直接跑 `docker compose`，由同一份 docker-compose.yml 与 .env 解析出同一个项目（supabase）。
# 不能再按 SUPABASE_CI_PROJECT_NAME 退回一个固定项目名：默认栈不叫 supabase-ci，退回去就把初始化
# 发给了根本没起的项目，start.sh / reset.sh 每次都在这一步失败（RV-01a1bb42a8df）。
COMPOSE_ARGS=("$@")
cd "$SCRIPT_DIR"

echo "📦 Initializing Supabase test database..."
echo ""

# RV-036：用 `docker compose exec` + 服务名 `db`，而不是固定 `docker exec supabase-db`——
# 后者是宿主机全局名字，多个 checkout 并行跑会直接撞车或初始化到别的 checkout 的库。
# compose exec 按调用者给的项目解析，天然不会越界。
compose() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

# `-v ON_ERROR_STOP=1` 不能省：psql 非交互读脚本时，默认遇到 SQL 错误只打一行到
# stderr 就接着往下跑，最后照样 exit 0。少了它，`set -e` 形同虚设 —— 建表失败的
# 数据库会带着 “✅ 初始化完成” 进入测试，报出来的是一堆莫名其妙的用例错误。
#
# 这里也不再用 `[ -f ]` 兜底：下面这些 SQL 都在仓库里，且互相有依赖（02 的函数是 03
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
# 其余脚本继续用 postgres —— 业务表/函数的 owner 不能跟着变。
psql_file 00-realtime-schema.sql 'Creating realtime schema...' supabase_admin
psql_file 01-rxdb-system-tables.sql 'Loading system tables...'
psql_file 02-rxdb-sync-functions.sql 'Loading sync functions...'
psql_file 03-business-tables.sql 'Loading business tables...'
psql_file 04-rxdb-utils-functions.sql 'Loading utility functions...'
# dev-rxdb-p2p 的设备登记与清单表（p2p schema）。PGRST_DB_SCHEMAS 含 p2p，schema 不存在时
# PostgREST 加载不了 schema 缓存（PGRST002）；表结构归 demo 所有，这里只负责在初始化链里建好。
psql_file ../../apps/dev-rxdb-p2p/supabase/p2p-schema.sql 'Loading dev-rxdb-p2p schema...'
# 生产权限脚本必须最后加载：01 / 03 的 `GRANT ALL ON ALL TABLES IN SCHEMA public` 会把
# rxdb_change 的写权限放宽回去，排在它们之后收紧才作数。开发库因此与生产同口径，
# 测试对 rxdb_change 的预置与清理走 service_role（见 rxdb-adapter-supabase 的 test-utils.ts）。
psql_file production/rxdb-change-grants.sql 'Tightening rxdb_change grants...'

echo "✅ Database initialization complete!"
echo ""
echo "📊 Created tables:"
compose exec -T db psql -U postgres -d postgres -c "
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
"
