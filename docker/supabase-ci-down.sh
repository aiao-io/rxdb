#!/bin/bash
# 清理本 checkout 专属的 Supabase CI 测试环境（RV-036）。
#
# `-p "$SUPABASE_CI_PROJECT_NAME"` 是关键：down 只认这个 project 打的
# com.docker.compose.project 标签，绝不会碰到别的 checkout（或别的字面量
# supabase-db/supabase-kong 默认环境）起的容器。

set -euo pipefail

DOCKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$DOCKER_DIR"
# shellcheck source=./supabase-ci-identity.sh
source ./supabase-ci-identity.sh

echo "🧹 Tearing down isolated Supabase CI stack"
echo "   project = $SUPABASE_CI_PROJECT_NAME"
echo "   id      = $SUPABASE_CI_ID"

docker compose -p "$SUPABASE_CI_PROJECT_NAME" -f docker-compose.ci.yml down -v --remove-orphans

rm -f "$SUPABASE_CI_STATE_FILE"

echo "✅ 已清理：$SUPABASE_CI_PROJECT_NAME"
