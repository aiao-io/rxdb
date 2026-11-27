#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/supabase-sql-security-regressions.sql"
REFERENCE_SQL_DIR="$SCRIPT_DIR/../../../../docker/sql"

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
  update-visibility-transition
  cascade-source-order
  cascade-delete-logging
  cascade-explicit-deletes
  cascade-rejected-child
  cascade-uuid-keys
  cascade-replay-rollback
  cascade-hidden-inverse-patch
  cascade-numeric-keys
  cascade-partition-keys
  backend-identity
  production-change-grants
  bucketed-read-sync
  bucketed-push
  bucketed-documented-policy
  bucketed-guards
  anon-sync-protocol
  branch-ownership
  realtime-notifications
  production-grants-idempotent
  sync-access-upgrade
  change-history
  caller-grants
  deferred-cycle
  deferred-columns-validation
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

if [ ! -f "$REFERENCE_SQL_DIR/production/rxdb-change-grants.sql" ]; then
  echo "🔴 Reference SQL not found: $REFERENCE_SQL_DIR" >&2
  exit 1
fi

# psql 在容器里跑，读不到宿主机的文件：把参考 SQL 整个目录拷进容器。用例按生产部署与迁移指南的顺序
# \i 这些文件，升级的原子性检查用同一组文件直接走 psql -f。按进程号分目录，两个 runner 并行也不互相覆盖。
CONTAINER_SQL_DIR="/tmp/rxdb-sql-regression-$$"
trap 'docker exec "$DB_CONTAINER" rm -rf "$CONTAINER_SQL_DIR" >/dev/null 2>&1 || true' EXIT
if ! docker cp "$REFERENCE_SQL_DIR/." "$DB_CONTAINER:$CONTAINER_SQL_DIR" >/dev/null; then
  echo "🔴 Failed to copy the reference SQL into $DB_CONTAINER" >&2
  exit 1
fi

psql_in_db() {
  docker exec "$DB_CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

for test_case in "${CASES[@]}"; do
  echo "▶ SQL regression: $test_case"
  if docker exec -i "$DB_CONTAINER" psql \
    -X \
    -U postgres \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    -v test_case="$test_case" \
    -v sql_dir="$CONTAINER_SQL_DIR" < "$SQL_FILE"; then
    echo "🟢 PASS: $test_case"
  else
    echo "🔴 FAIL: $test_case" >&2
    failed=1
  fi
done

# US-225 AC#19：迁移指南的升级命令整批是一个事务，任一步失败，本次执行里的改动一条也不留下。
# 哨兵表建在同一次执行的最前面，四份文件按指南的顺序执行，在生产权限脚本之前注入失败。
# 失败之后哨兵不在，说明前面执行过的语句全部回滚，没有哪份文件自己提交了事务。
# 升级成功时业务表权限不变、RxDB 对象达到生产模型，由上面的 sync-access-upgrade 用例在事务内验证。
upgrade_rolls_back_on_failure() {
  local sentinel='public.rxdb_sql_upgrade_sentinel' output
  psql_in_db -qc "DROP TABLE IF EXISTS $sentinel" || return 1
  if output="$(psql_in_db --single-transaction \
    -c "CREATE TABLE $sentinel ()" \
    -f "$CONTAINER_SQL_DIR/production/rxdb-sync-access-upgrade.sql" \
    -f "$CONTAINER_SQL_DIR/02-rxdb-sync-functions.sql" \
    -f "$CONTAINER_SQL_DIR/04-rxdb-utils-functions.sql" \
    -c "DO \$\$ BEGIN RAISE EXCEPTION 'injected upgrade failure'; END \$\$" \
    -f "$CONTAINER_SQL_DIR/production/rxdb-change-grants.sql" 2>&1)"; then
    echo "sync-access-upgrade-atomic: the upgrade must fail at the injected step" >&2
    return 1
  fi
  if ! grep -q 'injected upgrade failure' <<<"$output"; then
    echo "sync-access-upgrade-atomic: the upgrade failed before the injected step: $output" >&2
    return 1
  fi
  if [ "$(psql_in_db -tAc "SELECT pg_catalog.to_regclass('$sentinel') IS NULL")" != 't' ]; then
    echo "sync-access-upgrade-atomic: statements before the failure were committed" >&2
    psql_in_db -qc "DROP TABLE IF EXISTS $sentinel"
    return 1
  fi
}

echo "▶ SQL regression: sync-access-upgrade-atomic"
if upgrade_rolls_back_on_failure; then
  echo "🟢 PASS: sync-access-upgrade-atomic"
else
  echo "🔴 FAIL: sync-access-upgrade-atomic" >&2
  failed=1
fi

exit "$failed"
