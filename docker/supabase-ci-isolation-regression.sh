#!/bin/bash
# RV-036 回归：证明两个"checkout"能在同一台机器上并行跑
# rxdb-adapter-supabase 的隔离测试环境，互不撞容器名/端口，也不碰本机已经在跑的
# 默认（非隔离）Supabase 栈。
#
# 这里用两个不同的 SUPABASE_CI_ID 覆盖值模拟"另一个 checkout"，而不是真的再
# clone 一份仓库——生产路径（supabase-ci-identity.sh 默认分支）是按 checkout
# 绝对路径的 sha256 派生同样的 ID，这里显式传参只是跳过了"先 clone"这一步，
# 派生出 ID 之后走的是完全相同的 up/down 脚本和同一份 docker-compose.ci.yml。
#
# 用法：./supabase-ci-isolation-regression.sh
# 退出码非 0 = 回归失败。会自动清理自己起的两套环境；不会 down 任何字面量叫
# supabase-db/supabase-kong 等的默认环境。

set -euo pipefail

DOCKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$DOCKER_DIR"

ID_A="rv036-regress-a-$$"
ID_B="rv036-regress-b-$$"

fail() {
  echo "🔴 $1" >&2
  exit 1
}

cleanup() {
  echo "== cleanup: tearing down both regression environments =="
  (export SUPABASE_CI_ID="$ID_A"; ./supabase-ci-down.sh) || true
  (export SUPABASE_CI_ID="$ID_B"; ./supabase-ci-down.sh) || true
}
trap cleanup EXIT

echo "== 0. snapshot pre-existing default-environment containers (must stay untouched) =="
pre_db_id="$(docker inspect -f '{{.Id}}' supabase-db 2>/dev/null || echo 'absent')"
pre_kong_id="$(docker inspect -f '{{.Id}}' supabase-kong 2>/dev/null || echo 'absent')"
echo "   supabase-db   = $pre_db_id"
echo "   supabase-kong = $pre_kong_id"

echo "== 1. starting two isolated environments in parallel (id=$ID_A / id=$ID_B) =="
(export SUPABASE_CI_ID="$ID_A"; ./supabase-ci-up.sh) &
pid_a=$!
(export SUPABASE_CI_ID="$ID_B"; ./supabase-ci-up.sh) &
pid_b=$!

up_a_rc=0
up_b_rc=0
wait "$pid_a" || up_a_rc=$?
wait "$pid_b" || up_b_rc=$?
[ "$up_a_rc" -eq 0 ] || fail "environment A failed to start (rc=$up_a_rc)"
[ "$up_b_rc" -eq 0 ] || fail "environment B failed to start (rc=$up_b_rc)"

state_a="$DOCKER_DIR/.supabase-ci-state.${ID_A}.env"
state_b="$DOCKER_DIR/.supabase-ci-state.${ID_B}.env"
[ -f "$state_a" ] || fail "missing state file for A: $state_a"
[ -f "$state_b" ] || fail "missing state file for B: $state_b"

# 分别读取，避免两份变量在同一个 shell 里互相覆盖。
project_a="$(grep '^SUPABASE_CI_PROJECT_NAME=' "$state_a" | cut -d= -f2-)"
port_a="$(grep '^SUPABASE_CI_KONG_PORT=' "$state_a" | cut -d= -f2-)"
project_b="$(grep '^SUPABASE_CI_PROJECT_NAME=' "$state_b" | cut -d= -f2-)"
port_b="$(grep '^SUPABASE_CI_KONG_PORT=' "$state_b" | cut -d= -f2-)"
db_container_a="rxdb-supabase-db-${ID_A}"
db_container_b="rxdb-supabase-db-${ID_B}"
kong_container_a="rxdb-supabase-kong-${ID_A}"
kong_container_b="rxdb-supabase-kong-${ID_B}"

echo "   A: project=$project_a kong_container=$kong_container_a port=$port_a"
echo "   B: project=$project_b kong_container=$kong_container_b port=$port_b"

echo "== 2. asserting derived identities never collide =="
[ "$project_a" != "$project_b" ] || fail "compose project names collided: $project_a"
[ "$port_a" != "$port_b" ] || fail "kong ports collided: $port_a"
[ "$port_a" != "54331" ] || fail "env A reused the default literal port 54331"
[ "$port_b" != "54331" ] || fail "env B reused the default literal port 54331"
[ "$db_container_a" != "supabase-db" ] || fail "env A reused the default literal db container name"
[ "$db_container_b" != "supabase-db" ] || fail "env B reused the default literal db container name"
[ "$db_container_a" != "$db_container_b" ] || fail "db container names collided"
[ "$kong_container_a" != "$kong_container_b" ] || fail "kong container names collided"
echo "   ok: distinct project names, distinct container names, distinct ports, none equal to the default literals"

echo "== 3. asserting both isolated stacks AND the pre-existing default stack are simultaneously running =="
for c in "$db_container_a" "$kong_container_a" "$db_container_b" "$kong_container_b"; do
  docker inspect -f '{{.State.Status}}' "$c" | grep -q '^running$' || fail "$c is not running"
done
if [ "$pre_db_id" != "absent" ]; then
  running_pre_db_id="$(docker inspect -f '{{.Id}}' supabase-db)"
  [ "$running_pre_db_id" = "$pre_db_id" ] || fail "pre-existing supabase-db container identity changed!"
fi
if [ "$pre_kong_id" != "absent" ]; then
  running_pre_kong_id="$(docker inspect -f '{{.Id}}' supabase-kong)"
  [ "$running_pre_kong_id" = "$pre_kong_id" ] || fail "pre-existing supabase-kong container identity changed!"
fi
echo "   ok: four isolated containers + pre-existing default containers (same IDs) all running concurrently"

echo "== 4. trivial round-trip against each isolated environment's REST API =="
anon_key="$(grep 'SUPABASE_ANON_KEY:' docker-compose.ci.yml | head -1 | sed 's/.*SUPABASE_ANON_KEY:[[:space:]]*//')"
for label_port in "A:$port_a" "B:$port_b"; do
  label="${label_port%%:*}"
  port="${label_port##*:}"
  status="$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $anon_key" "http://localhost:${port}/rest/v1/todos?select=id&limit=1")"
  [ "$status" = "200" ] || fail "env $label REST round-trip failed (http $status) on port $port"
  echo "   env $label: GET /rest/v1/todos -> HTTP $status (port $port)"
done

echo "✅ RV-036 isolation regression passed: two parallel checkouts, zero collisions, default stack untouched."
