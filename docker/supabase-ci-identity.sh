#!/bin/bash
# 由 checkout 的绝对路径派生确定性隔离标识（RV-036）。
#
# `container_name:` 全局唯一，compose 的 -p/--project-name 对它不生效——多个
# checkout 同时跑 rxdb-adapter-supabase 的 test-env 会直接撞同名容器/撞
# init-db.sh 固定 docker exec 的目标。这里把 compose project 名、五个容器名
# 都换成按 checkout 路径派生的唯一值，Kong 端口交给 docker 动态分配后另行落盘
# （见 supabase-ci-up.sh），不在这里猜一个固定端口去碰撞。
#
# 用法：`source supabase-ci-identity.sh`，之后 $SUPABASE_CI_* 变量即可用。
#
# 测试専用口子：显式设置 SUPABASE_CI_ID 可以绕开路径派生，让回归测试在同一个
# checkout 里模拟"另一个 checkout"得到的不同标识，不需要真的再 clone 一份仓库。

set -euo pipefail

DOCKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$DOCKER_DIR/.." && pwd -P)"

if [ -n "${SUPABASE_CI_ID:-}" ]; then
  _supabase_ci_id="$SUPABASE_CI_ID"
else
  _supabase_ci_id="$(printf '%s' "$REPO_ROOT" | shasum -a 256 | cut -c1-10)"
fi

export SUPABASE_CI_ID="$_supabase_ci_id"
export SUPABASE_CI_PROJECT_NAME="rxdb-supabase-${_supabase_ci_id}"
export SUPABASE_DB_CONTAINER="rxdb-supabase-db-${_supabase_ci_id}"
export SUPABASE_KONG_CONTAINER="rxdb-supabase-kong-${_supabase_ci_id}"
export SUPABASE_AUTH_CONTAINER="rxdb-supabase-auth-${_supabase_ci_id}"
export SUPABASE_REST_CONTAINER="rxdb-supabase-rest-${_supabase_ci_id}"
export SUPABASE_REALTIME_CONTAINER="rxdb-supabase-realtime-${_supabase_ci_id}"
# 起容器前先占住 0（让 docker 分配空闲端口），真正的端口由 supabase-ci-up.sh
# 在 up 之后用 `docker compose port kong 8000` 查出来，写进这个状态文件。
export SUPABASE_KONG_PORT=0
export SUPABASE_CI_STATE_FILE="$DOCKER_DIR/.supabase-ci-state.${_supabase_ci_id}.env"
