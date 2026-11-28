#!/bin/bash
# 对本 checkout 的隔离 Supabase 栈执行 docker compose，并叠加开发用的 Studio（RV-036 同一身份）。
#
# 用法（参数原样转给 docker compose）：
#   docker/supabase-ci-compose.sh ps
#   docker/supabase-ci-compose.sh logs -f --tail 50
#   docker/supabase-ci-compose.sh exec db psql -U postgres
#   docker/supabase-ci-compose.sh stop
#
# 项目名、容器名与 Kong 端口变量都由 supabase-ci-identity.sh 派生，与 test-env 起栈时逐字一致。
# 不经这里直接跑 docker compose 会按默认值（supabase-db / 54331）解析出另一套配置：
# 要么操作到别的项目，要么把运行中的容器当成过期而重建。

set -euo pipefail

DOCKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./supabase-ci-identity.sh
source "$DOCKER_DIR/supabase-ci-identity.sh"

# Studio 在浏览器里展示与直连的 API 地址取 test-env 落盘的 Kong 端口；还没起过栈就没有状态文件，不编造，
# compose 会因 docker-compose.ci-studio.yml 缺这个变量而报错。不用 SUPABASE_PUBLIC_URL：docker/.env 里的同名变量是默认栈的。
if [ -f "$SUPABASE_CI_STATE_FILE" ]; then
  # shellcheck disable=SC1090
  source "$SUPABASE_CI_STATE_FILE"
  export SUPABASE_CI_PUBLIC_URL="http://localhost:${SUPABASE_CI_KONG_PORT}"
fi

exec docker compose -p "$SUPABASE_CI_PROJECT_NAME" \
  -f "$DOCKER_DIR/docker-compose.ci.yml" \
  -f "$DOCKER_DIR/docker-compose.ci-studio.yml" \
  "$@"
