# Supabase 本地测试环境

这里提供的是 `@aiao/rxdb-adapter-supabase` 的本地测试环境，不是通用生产部署模板。目标很明确：在本机拉起一套可控的 Supabase 依赖，跑适配器测试、联调 RPC 和 Realtime 链路。

## 快速开始

### 前置要求

- Docker Desktop 已安装并运行
- 建议至少分配 4GB 内存

### 初始化环境变量

```bash
cd docker
cp .env.example .env
```

如果 `docker/.env` 已经存在，可以直接复用，不需要重复复制。

### 启动环境

```bash
./start.sh
```

`start.sh` 会做四件事：

- 拉取镜像
- 启动容器
- 等待数据库和 API 网关可用
- 自动执行 `init-db.sh` 初始化测试表与函数

### 运行适配器测试

```bash
cd ..
pnpm nx test rxdb-adapter-supabase
```

## 常用命令

```bash
# 启动
./start.sh

# 停止容器
./stop.sh

# 重置 public schema 中的测试对象后重新初始化
./reset.sh

# 仅执行数据库初始化脚本
./init-db.sh

# 查看全部日志
docker compose logs -f

# 查看指定服务日志
docker compose logs -f db
docker compose logs -f kong

# 查看服务状态
docker compose ps

# 额外拉起 Studio
docker compose -f docker-compose.yml -f ./dev/docker-compose.dev.yml up -d
```

> [!IMPORTANT]
> `reset.sh` 当前会清空 `public` schema 下的测试表和用户定义函数，然后重新执行 `init-db.sh`。它不会删除 Docker volume，也不会重建整个容器环境。

## 连接信息

默认端口来自 `docker/.env`：

- API Gateway: `http://localhost:8000`
- PostgreSQL: `localhost:5432`
- Supavisor: `localhost:6543`
- Studio: `http://localhost:3000`（需要额外用 dev compose 启动）

实际的 `ANON_KEY`、`SERVICE_ROLE_KEY`、数据库密码请直接以 `docker/.env` 为准，`start.sh` 启动完成后也会打印当前值。

## 初始化内容

`init-db.sh` 按顺序加载以下 SQL：

```text
sql/
├── 01-rxdb-system-tables.sql
├── 02-rxdb-sync-functions.sql
├── 03-business-tables.sql
├── 04-rxdb-utils-functions.sql
└── 99-cleanup-tables.sql
```

其中 `03-business-tables.sql` 会创建适配器测试需要的业务表，例如 `Todo`、`TypeDemo`、`User`、`Order`、`OrderItem`、`Category`、`MenuLarge` 等。

## 服务结构

```text
Kong (8000/8443)
├── Auth
├── REST
├── Realtime
├── Storage
└── PostgreSQL (5432)
    └── Supavisor (6543)
```

## 故障排除

### Docker 没启动

如果看到 `Cannot connect to the Docker daemon`，先启动 Docker Desktop。

### 端口冲突

直接改 `docker/.env`，常见变量如下：

```bash
KONG_HTTP_PORT=8001
POSTGRES_PORT=5433
POOLER_PROXY_PORT_TRANSACTION=6544
```

### 数据库没起来

```bash
docker compose ps
docker compose logs db
docker compose exec db pg_isready -U postgres -h localhost
```

### 需要彻底重来

先执行：

```bash
./stop.sh
./reset.sh
./start.sh
```

如果你连 volume 也要删，那就不要靠 README 里的脚本，直接自己执行 `docker compose down -v`。

## 目录说明

```text
docker/
├── .env
├── .env.example
├── docker-compose.yml
├── docker-compose.s3.yml
├── docker-compose.ci.yml
├── start.sh
├── stop.sh
├── reset.sh
├── init-db.sh
├── dev/
│   ├── docker-compose.dev.yml
│   └── data.sql
├── sql/
│   ├── 01-rxdb-system-tables.sql
│   ├── 02-rxdb-sync-functions.sql
│   ├── 03-business-tables.sql
│   ├── 04-rxdb-utils-functions.sql
│   └── 99-cleanup-tables.sql
└── volumes/
    ├── logs/              # 日志配置
    ├── pooler/            # 连接池配置
    └── storage/           # 存储配置
```

## 与远程 Supabase 对比

| 特性       | 本地           | 远程               |
| ---------- | -------------- | ------------------ |
| 速度       | 快（<10ms）    | 慢（100-500ms）    |
| 费用       | 免费           | 可能产生费用       |
| 数据隔离   | ✅ 完全隔离    | ❌ 共享环境        |
| 需要网络   | ❌ 不需要      | ✅ 需要            |
| 设置复杂度 | 中等           | 简单               |
| 完整功能   | ✅ 全部        | ✅ 全部            |

## 参考

- [Supabase Self-Hosting 文档](https://supabase.com/docs/guides/self-hosting)
- [Supabase Docker 官方仓库](https://github.com/supabase/supabase/tree/master/docker)
- [rxdb-adapter-supabase 包](../packages/rxdb-adapter-supabase/)
