#!/bin/bash
# Supabase Test Environment 启动脚本
# 用于 rxdb-adapter-supabase 测试

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 从 .env 读取端口配置（安全方式，只提取特定变量）。
#
# 不能写成 `grep A .env | cut ... || grep B .env | cut ...`：`||` 看的是整条管道的
# 退出码，而末端的 `cut` 读到空输入照样返回 0，后面的分支永远不会执行 ——
# 缺 API_GW_HTTP_PORT 时 API_PORT 会静默变成空串，健康检查去请求
# `http://localhost//rest/v1/` 并一路超时，报错信息与真实原因毫无关系。
# 用函数取值 + `${VAR:-默认}` 做回退，判据落在「值是否为空」上。
read_env() {
    grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d'=' -f2-
}

API_PORT=$(read_env API_GW_HTTP_PORT)
# Kong → Envoy 迁移期间两个变量名并存，旧 .env 只有 KONG_HTTP_PORT。
API_PORT=${API_PORT:-$(read_env KONG_HTTP_PORT)}
API_PORT=${API_PORT:-8000}
POSTGRES_PORT=$(read_env POSTGRES_PORT)
POSTGRES_PORT=${POSTGRES_PORT:-5432}
POOLER_PORT=$(read_env POOLER_PROXY_PORT_TRANSACTION)
POOLER_PORT=${POOLER_PORT:-6543}
ANON_KEY=$(read_env ANON_KEY)
SERVICE_ROLE_KEY=$(read_env SERVICE_ROLE_KEY)

echo "🚀 Starting Supabase test environment..."

# 拉取最新镜像
docker compose pull

# 启动服务
docker compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."

# 等待数据库健康
timeout=120
counter=0
until docker compose exec -T db pg_isready -U postgres -h localhost > /dev/null 2>&1; do
    counter=$((counter + 1))
    if [ $counter -gt $timeout ]; then
        echo "❌ Timeout waiting for database"
        exit 1
    fi
    echo "  Waiting for database... ($counter/$timeout)"
    sleep 1
done

echo "✅ Database is ready"

# 等待 API gateway 健康
counter=0
until curl -s "http://localhost:${API_PORT}/rest/v1/" > /dev/null 2>&1; do
    counter=$((counter + 1))
    if [ $counter -gt $timeout ]; then
        echo "❌ Timeout waiting for API gateway"
        exit 1
    fi
    echo "  Waiting for API gateway... ($counter/$timeout)"
    sleep 1
done

echo "✅ API gateway is ready"
echo ""

# 自动初始化数据库
if [ -f "$SCRIPT_DIR/init-db.sh" ]; then
    echo "📦 Initializing database tables..."
    "$SCRIPT_DIR/init-db.sh"
fi

echo ""
echo "=========================================="
echo "🎉 Supabase test environment is ready!"
echo "=========================================="
echo ""
echo "📍 API URL:        http://localhost:${API_PORT}"
echo "📍 Studio:         http://localhost:3000 (if started with dev compose)"
echo "🗄️  DB Port:        ${POSTGRES_PORT}"
echo "🔌 Pooler Port:    ${POOLER_PORT}"
echo ""
echo "🔑 Anon Key:       ${ANON_KEY}"
echo "🔑 Service Key:    ${SERVICE_ROLE_KEY}"
echo ""
echo "💡 Usage:"
echo "   Stop:     ./stop.sh"
echo "   Reset:    ./reset.sh"
echo "   Logs:     docker compose logs -f"
echo ""
