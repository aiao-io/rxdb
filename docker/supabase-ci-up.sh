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

echo "📡 Kong 端口已发布 127.0.0.1:${kong_port}（状态文件：${SUPABASE_CI_STATE_FILE}）"

# 初始化发给刚起的这个隔离项目：项目名与配置文件和上面的 up 逐字一致，init-db.sh 不再自己猜。
./init-db.sh -p "$SUPABASE_CI_PROJECT_NAME" -f docker-compose.ci.yml

# 端口先于 Kong 开始监听发布出来：amd64 镜像在 Apple 芯片上靠模拟运行，Kong 要十几秒才健康，
# 这段时间连上去只会收到连接重置。等 Kong 通过容器健康检查再退出，调用方拿到状态文件就能直接用；
# 初始化占掉的时间与 Kong 启动重叠，通常这里不用再等。
kong_wait_seconds="${SUPABASE_CI_KONG_WAIT_SECONDS:-180}"
kong_poll_seconds="${SUPABASE_CI_KONG_POLL_SECONDS:-2}"
kong_deadline=$((SECONDS + kong_wait_seconds))
kong_health=''
while true; do
  kong_health="$(docker inspect -f '{{.State.Health.Status}}' "$SUPABASE_KONG_CONTAINER" 2>/dev/null || true)"
  [ "$kong_health" = 'healthy' ] && break
  if [ "$SECONDS" -ge "$kong_deadline" ]; then
    echo "🔴 Kong 在 ${kong_wait_seconds} 秒内没有通过健康检查（${SUPABASE_KONG_CONTAINER} status=${kong_health:-unknown}）" >&2
    exit 1
  fi
  sleep "$kong_poll_seconds"
done
echo "✅ Kong ready on 127.0.0.1:${kong_port}"
