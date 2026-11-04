#!/bin/bash
# e2e 的服务端：灌入表结构、写 .dev.vars，再用 wrangler 以构建产物起 Worker（静态资源 + 信令 DO + 本地 R2），与线上同构。
#
# CI：supabase action 已起好 docker-compose.ci.yml 的默认栈（VITE_SUPABASE_URL / VITE_SUPABASE_KEY 由 workflow 给出）；
# 本地：起本 checkout 专属的隔离栈。Durable Object 与 R2 的本地状态每次放进新的临时目录，用例之间互不残留。

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PORT="${P2P_E2E_PORT:-4382}"

if [ -n "${CI:-}" ]; then
  # 表结构由 supabase action 的初始化链建好（与 docker/init-db.sh 同一条链）
  export P2P_SUPABASE_URL="$VITE_SUPABASE_URL" P2P_SUPABASE_ANON_KEY="$VITE_SUPABASE_KEY"
else
  bash "$APP_DIR/scripts/supabase-up.sh"
fi

node "$APP_DIR/scripts/dev-vars.mjs"

STATE_DIR="$(mktemp -d)"
cd "$APP_DIR"
exec ./node_modules/.bin/wrangler dev --port "$PORT" --ip 127.0.0.1 --show-interactive-dev-session=false --persist-to "$STATE_DIR"
