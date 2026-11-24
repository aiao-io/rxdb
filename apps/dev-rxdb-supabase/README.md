# Supabase RxDB demo

## 一键本地开发

在仓库根目录执行（需要 Node.js 26+、pnpm 与已启动的 Docker）：

```bash
pnpm nx dev dev-rxdb-supabase
```

一条命令依次完成：

1. 检查固定端口 4203（应用）与 4204（测试起始页）没有被占用；
2. 起本 checkout 专属的隔离 Supabase 栈并初始化数据库（即 `rxdb-adapter-supabase:test-env`，与适配器测试、远端 e2e 共用），再叠加 Supabase Studio；
3. 应用以远端同步模式热更新运行，连上这套栈；首次打开是不登录的访客，右上角可切换身份；
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

### 身份：访客、匿名用户与演示账号

启动时只读出浏览器里保存的会话，不替用户登录（epic-015：公开数据给 anon，不靠匿名账号）。右上角切换身份：

| 身份       | 会话                         | 能做什么                                                              |
| ---------- | ---------------------------- | --------------------------------------------------------------------- |
| 访客       | 没有会话，以 anon 访问       | 商品目录只同步公开区里关注的分类，其余公开商品在线浏览；Todo 只存本机 |
| 匿名用户   | `signInAnonymously()`        | 数据库角色 authenticated，演示 Todo 的日志推送与拉取                  |
| Alice、Bob | 邮箱口令登录，第一次用时注册 | Alice 在星河零售、Bob 在极光百货，各自还同步所在租户的内部商品        |

本地库按会话身份命名并绑定（US-035）：切换身份就是登录或退出之后重新加载，打开那个身份自己的库。
会话按浏览器保存、所有标签页共用：在一个标签页换了身份，其他标签页会提示重新加载；它们还开着上一个身份的库，
同步会被身份守卫拦下并报身份不匹配，本地数据不动。

Todo 走未分区的日志同步，只对登录身份开放（US-225），所以访客的 Todo 只存本机，点 Todo 页上的「匿名登录」即可同步。
匿名登录要求远端项目开启匿名用户：仓库的 CI 栈（`docker/docker-compose.ci.yml`）已开启；`docker/.env` 里是
`ENABLE_ANONYMOUS_USERS=true`；Supabase 托管项目在 Authentication → Sign In / Providers 里打开 Anonymous Sign-Ins。
开启匿名登录等于让任何访客都能读到未分区的同步日志，生产部署应关闭它，改用正式登录。

演示账号的口令写在前端代码里（`src/app/supabase-session.ts`），注册依赖项目关闭邮箱确认（CI 栈是自动确认），只用于本地隔离栈。

## 商品目录：按身份授权的同步

`/catalog` 演示 epic-015 的第一批故事：按授权分区同步（US-033）、每个身份一个本地库（US-035）、规则之外的公开数据在线浏览（US-036）。

数据模型：参考夹具 `catalog_items` 与公开视图 `catalog_items_public` 在 `docker/sql/03-business-tables.sql`；
演示用的租户、成员关系、按成员关系扩展的 `rxdb_caller_buckets()`、成员的写权限与种子数据在
[`supabase/catalog-demo.sql`](supabase/catalog-demo.sql)，由 `docker/init-db.sh` 与 CI 在初始化链里加载。
公开商品在 `public` 区，租户内部商品在 `tenant:<租户>` 区；anon 对成本价没有列权限。

可以这样试（开两个浏览器，或一个普通窗口加一个隐身窗口）：

1. 访客点「同步」：只拿到关注分类（默认数码）的公开商品，成本价显示「无权读取」；在线浏览里能看到其他分类的公开商品。
2. 浏览「家居」时点「关注」，再同步：规则放宽，家居的公开商品补进本机。
3. 另一个窗口切到 Alice 同步：多出星河零售的内部商品。在「模拟服务端变更」里把一件公开商品收回为内部，
   访客再同步时它从本机消失，Alice 再同步时它换到租户区。
4. Alice 加入极光百货、退出星河零售，再同步：业务行一行没改，极光的区补快照，星河的区整块删掉。
5. 在一个标签页切换身份，回到另一个标签页同步：被身份守卫拦下，提示重新加载。

「模拟服务端变更」以当前身份直接写远端业务表（RLS 只放行所在租户的商品）；自助加入、退出租户只为演示方便，
真实应用由管理员或服务端维护成员关系。恢复初始演示数据（成员关系不动）：

```bash
docker/supabase-ci-compose.sh exec -T db psql -U postgres -c 'SELECT public.demo_catalog_reset()'
```
