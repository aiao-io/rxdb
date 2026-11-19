# Supabase RxDB demo

## 配置来源

远端同步是 **dev-server 独有能力**：`import.meta.env` 只有 Vite dev server 会注入。

生产构建（`nx run dev-rxdb-supabase:build`，即 `serve-static` 和 e2e 用的产物）在构建期就把
`import.meta.env` 定死为**不含任何 Supabase 配置**的常量（见 `project.json` 的
`build.configurations.production.define`），所以产物恒为 local-only，环境变量和工作区 `.env`
都影响不了它。要改这个行为，改 `define`，不要指望环境变量。

## Local-only mode

Local-only mode does not require Supabase and keeps all Todo data in the browser database.

```bash
pnpm nx run dev-rxdb-supabase:serve-local
```

`serve-local` 会从子进程环境里删掉 `VITE_SUPABASE_*` 并设 `NX_LOAD_DOT_ENV_FILES=false`，
工作区 `.env` 里残留的 Supabase 地址不会再被 Nx 灌回来（这曾让 e2e 静默连上远端而 flaky）。

## Remote sync mode

Start the repository Supabase stack. Its host API port is `54331` (the container listens on `8000`).

```bash
docker compose -f docker/docker-compose.ci.yml up -d
```

Set the browser-facing URL and anonymous key in the shell or the workspace `.env`, then start the guarded remote target:

```bash
VITE_SUPABASE_URL=http://localhost:54331 \
VITE_SUPABASE_KEY='<anon-key>' \
pnpm nx run dev-rxdb-supabase:serve-remote
```

`serve-remote` fails before starting Angular when either variable is missing or the configured Supabase URL is unreachable. Extra Angular dev-server options are forwarded, for example `--port 8312`.

### 会话：匿名登录

日志同步只对已登录身份开放，anon key 本身拉不到日志、推不了变更（US-225）。demo 连接远端前先检查
Supabase 会话，没有就调用 `signInAnonymously()`，每个浏览器得到一个匿名用户，刷新后沿用同一个会话。
匿名用户的数据库角色是 authenticated，因此远端项目必须开启匿名登录：仓库的 CI 栈
（`docker/docker-compose.ci.yml`）已开启；`docker/.env` 里是 `ENABLE_ANONYMOUS_USERS=true`；
Supabase 托管项目在 Authentication → Sign In / Providers 里打开 Anonymous Sign-Ins。

开启匿名登录等于让任何访客都能读到同步日志——这个 demo 的数据本来公开，生产部署应关闭匿名登录，
改用正式登录，并为业务表配置 RLS。
