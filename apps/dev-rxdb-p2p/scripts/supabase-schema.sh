#!/bin/bash
# 把 dev-rxdb-p2p 的表结构灌进正在运行的 Supabase 测试栈，可重复执行。
#
# 本地隔离栈：由 supabase-up.sh 先 source docker/supabase-ci-identity.sh 再调用本脚本；
# CI：supabase action 起的是 docker-compose.ci.yml 的默认 project（supabase-ci），直接调用即可。

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd -P)"
PROJECT_NAME="${SUPABASE_CI_PROJECT_NAME:-supabase-ci}"

docker compose -p "$PROJECT_NAME" -f "$REPO_ROOT/docker/docker-compose.ci.yml" exec -T db \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$APP_DIR/supabase/p2p-schema.sql" > /dev/null

echo "✅ dev-rxdb-p2p schema applied (${PROJECT_NAME})"
