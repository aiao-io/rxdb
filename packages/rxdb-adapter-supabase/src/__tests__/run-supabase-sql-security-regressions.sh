#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/supabase-sql-security-regressions.sql"
PRODUCTION_GRANTS_FILE="$SCRIPT_DIR/../../../../docker/sql/production/rxdb-change-grants.sql"

# 目标容器名解析（RV-036，零散收尾项第 9 条）：
# - 显式 SUPABASE_DB_CONTAINER 优先；
# - 否则看本 checkout 是否起过隔离栈（docker/.supabase-ci-state.<id>.env 存在说明
#   test-env 跑过，容器名按 checkout 路径派生）——source identity 脚本拿派生名；
# - 都没有（CI：.github/actions/supabase 直接用 compose 默认名起栈）退回 supabase-db。
if [ -z "${SUPABASE_DB_CONTAINER:-}" ]; then
  DOCKER_DIR="$SCRIPT_DIR/../../../../docker"
  IDENTITY_FILE="$DOCKER_DIR/supabase-ci-identity.sh"
  STATE_FILE="$(compgen -G "$DOCKER_DIR/.supabase-ci-state.*.env" | head -n1 || true)"
  if [ -n "$STATE_FILE" ] && [ -f "$IDENTITY_FILE" ]; then
    # shellcheck source=/dev/null
    source "$IDENTITY_FILE"
    DB_CONTAINER="$SUPABASE_DB_CONTAINER"
  else
    DB_CONTAINER="supabase-db"
  fi
else
  DB_CONTAINER="$SUPABASE_DB_CONTAINER"
fi

CASES=(
  text-varchar
  entity-id
  idempotent-retry
  uuid
  search-path
  rls-invoker
  rls-write-boundary
  rls-filtered-delete
  branch-search-path
  trigger-schema
  existence-probe
  update-partial-columns
  update-owner-rls
  update-shared-edit
  update-denied
  update-gone
  delete-hidden-row
  delete-gone
  mixed-batch-rollback
  push-integrity
  receipts-partial
  receipts-fanout
  receipts-dependency
  receipts-gone
  receipts-unclassified
  receipts-idempotent
  receipts-legacy
  receipts-many-groups
  cascade-delete-logging
  production-change-grants
  # 最后把全部用例放进同一个事务再跑一遍（SQL 文件不给 test_case 时的默认模式）：
  # 逐用例各起一个 psql 互相隔离，看不见用例之间经事务级设置漏过去的状态——
  # 比如 p_skip_sync = true 留下的 rxdb.sync_enabled = 'false'，依赖同步触发器的用例必须自己恢复。
  all
)
failed=0

if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  echo "🔴 PostgreSQL test container not found: $DB_CONTAINER" >&2
  exit 1
fi

if [ ! -f "$PRODUCTION_GRANTS_FILE" ]; then
  echo "🔴 Production grants script not found: $PRODUCTION_GRANTS_FILE" >&2
  exit 1
fi
PRODUCTION_GRANTS_SQL="$(cat "$PRODUCTION_GRANTS_FILE")"

for test_case in "${CASES[@]}"; do
  echo "▶ SQL regression: $test_case"
  if docker exec -i "$DB_CONTAINER" psql \
    -X \
    -U postgres \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    -v test_case="$test_case" \
    -v production_grants_sql="$PRODUCTION_GRANTS_SQL" < "$SQL_FILE"; then
    echo "🟢 PASS: $test_case"
  else
    echo "🔴 FAIL: $test_case" >&2
    failed=1
  fi
done

exit "$failed"
