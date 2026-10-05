#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/supabase-sql-security-regressions.sql"
PRODUCTION_GRANTS_FILE="$SCRIPT_DIR/../../../../docker/sql/production/rxdb-change-grants.sql"
DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-db}"
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
  production-change-grants
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
