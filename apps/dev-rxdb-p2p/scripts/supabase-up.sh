#!/bin/bash
# 起本 checkout 专属的隔离 Supabase 栈（docker/supabase-ci-up.sh，已在跑就复用），再灌入 dev-rxdb-p2p 的表结构。
# Kong 的动态端口落在 docker/.supabase-ci-state.<id>.env，docker/supabase-ci-url.sh 读得到。

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd -P)"
# shellcheck source=../../../docker/supabase-ci-identity.sh
source "$REPO_ROOT/docker/supabase-ci-identity.sh"

running="$(docker compose -p "$SUPABASE_CI_PROJECT_NAME" -f "$REPO_ROOT/docker/docker-compose.ci.yml" ps --status running --services)"
if [ ! -f "$SUPABASE_CI_STATE_FILE" ] || ! grep -qx kong <<< "$running"; then
  bash "$REPO_ROOT/docker/supabase-ci-up.sh"
fi

bash "$APP_DIR/scripts/supabase-schema.sh"
echo "   Supabase: $(bash "$REPO_ROOT/docker/supabase-ci-url.sh")"
