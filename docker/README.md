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

> [!WARNING]
> `.env.example` 里的 `JWT_SECRET`、`ANON_KEY`、`SERVICE_ROLE_KEY`、`POSTGRES_PASSWORD`、`DASHBOARD_PASSWORD` 等是 Supabase 官方模板的公开默认值，谁都查得到（`SERVICE_ROLE_KEY` 能绕过行级安全读写全部数据）。这套值只用于本机测试：不要用在别人能访问到的机器或部署环境上；compose 发布 `8000` / `5432` / `6543` 等端口时没有限定网卡，默认监听本机所有网卡，也别在不可信的网络里跑。
>
> 需要换成自己的密钥时，在 `docker/` 目录运行 `sh utils/generate-keys.sh`（需要 `openssl`）：它随机生成这些密钥与密码并打印出来，回答 `y` 或加 `--update-env` 就写回当前目录的 `.env`（旧文件备份为 `.env.old`）。要赶在第一次 `./start.sh` 之前换：数据库角色密码和 `JWT_SECRET` 只在数据库首次初始化时写进 `volumes/db/data`，启动过之后再换不会同步到已有的库，得先清空该目录重新初始化（本地测试数据会丢）。

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
docker compose logs -f api-gw

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
├── 00-realtime-schema.sql
├── 01-rxdb-system-tables.sql
├── 02-rxdb-sync-functions.sql
├── 03-business-tables.sql
├── 04-rxdb-utils-functions.sql
└── production/
    └── rxdb-change-grants.sql
```

其中 `03-business-tables.sql` 会创建适配器测试需要的业务表，例如 `Todo`、`TypeDemo`、`User`、`Order`、`OrderItem`、`Category`、`MenuLarge` 等。

`production/rxdb-change-grants.sql` 收回 `anon` / `authenticated` 对变更日志表 `rxdb_change` 的写权限（保留 `SELECT`），必须最后加载：01 / 03 里的 `GRANT ALL ON ALL TABLES IN SCHEMA public` 会把权限放宽回去。开发库因此与生产同口径，适配器测试对 `rxdb_change` 的预置与清理走 `service_role`。生产部署的用法见 [Supabase 适配器文档](../website/docs/adapters/supabase.md#收紧变更日志表的写权限)。

## 服务结构

```text
Envoy / api-gw (8000)
├── Auth
├── REST
├── Realtime
├── Storage
└── PostgreSQL (5432)
    └── Supavisor (6543)
```

> 上游默认网关已从 Kong 切换为 Envoy（`api-gw` 服务）。Kong 作为网络别名仍然可用，
> 也可以通过 `docker compose -f docker-compose.yml -f docker-compose.kong.yml up -d` 显式启用。

## 故障排除

### Docker 没启动

如果看到 `Cannot connect to the Docker daemon`，先启动 Docker Desktop。

### 端口冲突

直接改 `docker/.env`，常见变量如下：

```bash
API_GW_HTTP_PORT=8001
POSTGRES_PORT=5433
POOLER_PROXY_PORT_TRANSACTION=6544
```

> `start.sh` 兼容旧变量：如果没设 `API_GW_HTTP_PORT`，会自动回退到 `KONG_HTTP_PORT`。

### 数据库没起来

```bash
docker compose ps
docker compose logs db
docker compose exec db pg_isready -U postgres -h localhost
```

### 需要彻底重来

只重建测试表与函数：在环境运行时执行 `./reset.sh`。它要求容器正在运行，会删掉测试用的 schema / 函数，再执行一遍 `init-db.sh`。

连数据库本身也要从头初始化（例如换过 `docker/.env` 里的密钥）：

```bash
./stop.sh
rm -rf volumes/db/data
./start.sh
```

库数据在绑定挂载的 `volumes/db/data` 里，`docker compose down -v` 只删命名 volume，删不掉它。本地测试数据会随之丢失。

## 目录说明

```text
docker/
├── .env
├── .env.example
├── docker-compose.yml
├── docker-compose.caddy.yml
├── docker-compose.ci.yml          # CI 精简版（仅测试必需服务）
├── docker-compose.envoy.yml       # Envoy API 网关覆盖
├── docker-compose.kong.yml        # Kong API 网关覆盖
├── docker-compose.logs.yml        # 日志/分析服务
├── docker-compose.nginx.yml
├── docker-compose.pg15.yml        # Postgres 15 兼容覆盖
├── docker-compose.pg17.yml        # Postgres 17 覆盖
├── docker-compose.rustfs.yml
├── docker-compose.s3.yml
├── run.sh                         # 上游入口脚本
├── setup.sh                       # 上游一键部署
├── update.sh                      # 上游升级脚本
├── versions.md                    # 上游镜像版本清单
├── upgrades.json                  # 上游升级路径配置
├── start.sh                       # rxdb 测试环境启动
├── stop.sh
├── reset.sh
├── init-db.sh
├── supabase-ci-down.sh                 # CI：清理本 checkout 专属隔离环境（RV-036）
├── supabase-ci-identity.sh             # CI：按 checkout 路径派生确定性隔离标识（RV-036）
├── supabase-ci-isolation-regression.sh # CI：RV-036 隔离回归，两个 checkout 并行互不干扰
├── supabase-ci-up.sh                   # CI：起本 checkout 专属的隔离测试环境（RV-036）
├── supabase-ci-url.sh                  # CI：打印隔离环境的 REST/Kong 入口 URL
├── dev/
│   ├── docker-compose.dev.yml
│   └── data.sql
├── ci/                            # CI 专用配置
│   ├── kong.yml
│   └── roles.sql
├── sql/
│   ├── 00-realtime-schema.sql
│   ├── 01-rxdb-system-tables.sql
│   ├── 02-rxdb-sync-functions.sql
│   ├── 03-business-tables.sql
│   ├── 04-rxdb-utils-functions.sql
│   └── production/
│       └── rxdb-change-grants.sql # 收紧 rxdb_change 写权限，init-db.sh 最后加载
├── tests/                         # 环境测试脚本
├── utils/                         # 密钥/升级工具脚本
│   ├── add-new-auth-keys.sh
│   ├── db-passwd.sh
│   ├── generate-keys.sh
│   ├── reassign-owner.sh
│   ├── rotate-new-api-keys.sh
│   └── upgrade-pg17.sh
└── volumes/
    ├── api/
    │   ├── envoy/                 # Envoy 网关配置
    │   ├── kong.yml
    │   └── kong-entrypoint.sh
    ├── db/                        # 数据库初始化 SQL
    ├── functions/                 # Edge Functions
    ├── logs/                      # 日志配置
    ├── pooler/                    # 连接池配置
    ├── proxy/                     # Caddy/Nginx 反向代理
    ├── snippets/                  # Studio SQL 片段
    └── storage/                   # 本地文件存储
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
