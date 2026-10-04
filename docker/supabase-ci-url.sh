#!/bin/bash
# 打印本 checkout 隔离环境的 REST/Kong 入口 URL，供
# `rxdb-adapter-supabase:test` 拼 VITE_SUPABASE_URL 用。
#
# 端口是 supabase-ci-up.sh 起容器之后动态查出来再落盘的，这里只读状态文件，
# 不重新猜——没有状态文件说明 test-env 没跑过或已被清理，直接报错而不是
# 兜底回退到固定的 54331（那正是 RV-036 的根因，不能再引入一次）。

set -euo pipefail

DOCKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./supabase-ci-identity.sh
source "$DOCKER_DIR/supabase-ci-identity.sh"

if [ ! -f "$SUPABASE_CI_STATE_FILE" ]; then
  echo "🔴 找不到隔离环境状态文件，先跑 test-env：$SUPABASE_CI_STATE_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$SUPABASE_CI_STATE_FILE"

echo "http://localhost:${SUPABASE_CI_KONG_PORT}"
