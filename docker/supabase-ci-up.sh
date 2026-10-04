#!/bin/bash
# 起本 checkout 专属的、隔离的 Supabase CI 测试环境（RV-036）。
#
# 和之前「固定 compose project + 固定 container_name + 固定 54331」不同：
# 这里按 checkout 路径派生出本次专属的 project 名和五个容器名，Kong 端口交给
# docker 动态分配，起完之后把实际分到的端口查出来落盘到状态文件，供
# `rxdb-adapter-supabase:test` 读取拼 VITE_SUPABASE_URL。

set -euo pipefail

DOCKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$DOCKER_DIR"
# shellcheck source=./supabase-ci-identity.sh
source ./supabase-ci-identity.sh

echo "🚀 Starting isolated Supabase CI stack"
echo "   project = $SUPABASE_CI_PROJECT_NAME"
echo "   id      = $SUPABASE_CI_ID"

docker compose -p "$SUPABASE_CI_PROJECT_NAME" -f docker-compose.ci.yml up -d

# Kong 发布的是 0:8000（启动前由 identity 脚本设成动态端口），起来之后才知道
# 宿主机实际分到了哪个端口。`docker compose port` 按 project + service 解析，
# 不靠猜测的固定值，两个 checkout 并行跑永远拿到各自的端口。
kong_port_output="$(docker compose -p "$SUPABASE_CI_PROJECT_NAME" -f docker-compose.ci.yml port kong 8000)"
kong_port="${kong_port_output##*:}"

if [ -z "$kong_port" ] || [ "$kong_port" = '0' ]; then
  echo "🔴 无法解析 Kong 动态分配到的端口（原始输出：${kong_port_output}）" >&2
  exit 1
fi

cat > "$SUPABASE_CI_STATE_FILE" <<EOF
SUPABASE_CI_ID=$SUPABASE_CI_ID
SUPABASE_CI_PROJECT_NAME=$SUPABASE_CI_PROJECT_NAME
SUPABASE_CI_KONG_PORT=$kong_port
EOF

echo "✅ Kong ready on 127.0.0.1:${kong_port}（状态文件：${SUPABASE_CI_STATE_FILE}）"

./init-db.sh
