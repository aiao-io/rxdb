#!/bin/bash
# Supabase Test Environment 停止脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🛑 Stopping Supabase test environment..."
docker compose down

echo "✅ Supabase test environment stopped"
