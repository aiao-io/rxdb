#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/supabase-sql-security-regressions.sql"
DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-db}"
CASES=(
  text-varchar
  entity-id
  idempotent-retry
  uuid
  search-path
  rls-invoker
  rls-write-boundary
  branch-search-path
  trigger-schema
)
failed=0

if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  echo "🔴 PostgreSQL test container not found: $DB_CONTAINER" >&2
  exit 1
fi

for test_case in "${CASES[@]}"; do
  echo "▶ SQL regression: $test_case"
  if docker exec -i "$DB_CONTAINER" psql \
    -X \
    -U postgres \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    -v test_case="$test_case" < "$SQL_FILE"; then
    echo "🟢 PASS: $test_case"
  else
    echo "🔴 FAIL: $test_case" >&2
    failed=1
  fi
done

exit "$failed"
