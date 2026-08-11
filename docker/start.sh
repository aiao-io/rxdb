#!/bin/bash
# Supabase Test Environment 启动脚本
# 用于 rxdb-adapter-supabase 测试

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 从 .env 读取端口配置（安全方式，只提取特定变量）
API_PORT=$(grep -E '^API_GW_HTTP_PORT=' .env 2>/dev/null | cut -d'=' -f2 || grep -E '^KONG_HTTP_PORT=' .env 2>/dev/null | cut -d'=' -f2 || echo "8000")
POSTGRES_PORT=$(grep -E '^POSTGRES_PORT=' .env 2>/dev/null | cut -d'=' -f2 || echo "5432")
POOLER_PORT=$(grep -E '^POOLER_PROXY_PORT_TRANSACTION=' .env 2>/dev/null | cut -d'=' -f2 || echo "6543")
ANON_KEY=$(grep -E '^ANON_KEY=' .env 2>/dev/null | cut -d'=' -f2)
SERVICE_ROLE_KEY=$(grep -E '^SERVICE_ROLE_KEY=' .env 2>/dev/null | cut -d'=' -f2)

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
