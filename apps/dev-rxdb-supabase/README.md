# Supabase RxDB demo

## 一键本地开发

在仓库根目录执行（需要 Node.js 26+、pnpm 与已启动的 Docker）：

```bash
pnpm nx dev dev-rxdb-supabase
```

一条命令依次完成：

1. 检查固定端口 4203（应用）与 4204（测试起始页）没有被占用；
2. 起本 checkout 专属的隔离 Supabase 栈并初始化数据库（即 `rxdb-adapter-supabase:test-env`，与适配器测试、远端 e2e 共用），再叠加 Supabase Studio；
3. 应用以远端同步模式热更新运行，连上这套栈，首次打开自动匿名登录；
4. 应用与起始页都就绪后，浏览器打开测试起始页：测试入口、Studio、连接参数和常用测试命令都在页上，支持一键复制。

| 服务              | 地址                                    |
| ----------------- | --------------------------------------- |
| 测试起始页        | <http://127.0.0.1:4204/>                |
| 应用              | <http://localhost:4203>                 |
| Supabase API 网关 | `http://localhost:<端口>`，见测试起始页 |
| Supabase Studio   | `http://127.0.0.1:<端口>`，见测试起始页 |

Supabase 与 Studio 的宿主端口由 docker 按 checkout 分配（RV-036），多个检出目录可以各起一套；起始页显示本次的实际地址。
Studio 无需登录即可读写整个库，只发布在 127.0.0.1。

- 不需要自动打开浏览器：`AIAO_DEV_OPEN=false pnpm nx dev dev-rxdb-supabase`。
- 固定端口被占时直接失败，并列出占用进程的 pid、命令与目录，不自动换号。
- Ctrl-C 停止应用与起始页；Supabase 容器继续运行并保留数据。Nx 被强制终止时，各常驻进程经
  `scripts/dev/supervise.mjs` 在数秒内自行退出，不会留下孤儿进程占住固定端口。
- Supabase 日志不混进这个终端（工作区关了 Nx TUI，init-db 的 DDL 日志会刷屏），需要时另开终端：
  `docker/supabase-ci-compose.sh logs -f --tail 50`。
- 停止容器并保留数据：`docker/supabase-ci-compose.sh stop`；删除容器与数据：`pnpm nx run rxdb-adapter-supabase:test-env-down`。

开发链脚本的测试：`pnpm nx run dev-rxdb-supabase:dev-test`（`test` 依赖它，CI 一并执行）。

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
