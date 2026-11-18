# 协作服务的部署与运维手册

本手册对应 [ADMIN-US-217](../requirements/stories/collaboration/ADMIN-US-217-production-deployment-operations.md)：迁移、协作命令入口（Supabase Edge Function）与三端静态产物的发布、回滚、监控、审计归档与密钥管理。

目前的全部证据来自**本机 Docker 上的本地预演栈**（`deploy/local/`，一套完整的自托管 Supabase，按生产步骤部署）。它们一律标 ⚠️：故事要求证据来自真实部署环境，上线前要在真实的 staging / production 上按本手册复验（见文末「上线前在真实环境要做的事」）。命令入口本身的行为（命令契约、身份、权限、Realtime）见[协作包 README](../packages/collaboration/README.md)。

## 1. 本地预演栈

```bash
pnpm nx run rxdb-admin-template:local-up                 # 起栈；第一次运行生成 deploy/local/.env.local（随机密钥）
pnpm nx run rxdb-admin-template:deploy-local             # 按生产顺序发布一次（会先执行 local-up）
pnpm nx run rxdb-admin-template:local-status             # 容器状态与 current / staged / 函数指向的发布
pnpm nx run rxdb-admin-template:local-down               # 停栈，保留数据卷与 .state/
pnpm nx run rxdb-admin-template:local-down -- --volumes  # 连数据卷与 .state/ 一起删（.env.local 保留）
pnpm nx run rxdb-admin-template:local-up -- --studio     # 另起 Studio（4503）
```

`deploy-local` 依赖 `local-up`，所以停栈之后一条 `pnpm nx run rxdb-admin-template:deploy-local` 就能把栈拉起并发布；`local-down -- --volumes` 之后再执行同一条命令即从零重建。看 Nx 任务的完整输出加 `--output-style=stream`。

compose 项目名 `admin-template-local`：容器、网络与卷都带这个前缀，不与 CI 隔离栈（`rxdb-supabase-*`）或其他产品的栈共用任何资源。端口只发布到 `127.0.0.1`，本预演独占 4500～4529：

| 端口       | 服务                     | 生产对应                                                                               |
| ---------- | ------------------------ | -------------------------------------------------------------------------------------- |
| 4500       | Kong 网关                | `https://<ref>.supabase.co`（`/auth/v1`、`/rest/v1`、`/realtime/v1`、`/functions/v1`） |
| 4501       | PostgreSQL 直连          | 项目数据库的直连（5432），只给迁移所有者：迁移、设口令、初始化、归档与验收脚本         |
| 4502       | 本地收件服务（inbucket） | 真实的 SMTP 服务（staging 用真实邮箱）                                                 |
| 4503       | Studio（可选）           | Supabase 控制台                                                                        |
| 4504       | PgBouncer（transaction） | Supavisor transaction 模式（6543）                                                     |
| 4505       | 错误收集器               | 真正的监控服务（见第 6 节）                                                            |
| 4510～4512 | 三端当前版本             | React / Angular / Vue 的静态站点                                                       |
| 4513～4515 | 三端发布预览（staged）   | 静态托管的预览部署（切换前的健康检查对它做）                                           |
| 4520       | e2e 夹具服务             | 只在对部署地址跑 e2e 时由 Playwright 起                                                |

服务：`db`（supabase/postgres 17.6.1.136）、`auth`（GoTrue v2.189.0，SMTP 发往 `mail`）、`rest`（PostgREST v14.12，`max-rows` 1000）、`realtime`（v2.102.3）、`pooler`（PgBouncer 1.26.1，固定镜像摘要，与契约测试相同）、`functions`（supabase/edge-runtime v1.74.0，主服务按线上限额：每个请求 CPU 软限 1 秒、硬限 2 秒，内存 256 MB）、`collector`（同一个 edge-runtime 镜像跑的错误收集器）、`kong`（3.9.3）、`web`（nginx 1.28，三端静态站点）、`mail`（inbucket 3.0.3），可选 `studio` 与 `meta`。

身份用**非对称 JWT 签名密钥**（生产计划用它）：GoTrue 以 ES256 私钥签用户令牌，JWKS 公开在 `/auth/v1/.well-known/jwks.json`（网关上不要求 apikey，与托管一致）；PostgREST、Realtime 与命令入口都按 JWKS 验签，签发者 `http://127.0.0.1:4500/auth/v1`。anon / service role 两个 API key 是旧式的 HS256 长期令牌（同托管的旧版 API key），GoTrue 的 `JWT_KEYS` 另带一把只验签的对称密钥，PostgREST 与 Realtime 的 JWKS 也带它，JWKS 接口不公开这把对称密钥。access token 有效期 15 分钟。

### 状态目录 `deploy/local/.state/`（不进仓库）

| 路径                              | 内容                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `site/releases/<发布 ID>/`        | 一次发布的全部产物：`web/{react,angular,vue}`、`functions/admin-collaboration`（函数入口与 esbuild 产物）、`release.json` |
| `site/current`、`site/staged`     | 指向某个发布目录的相对符号链接：当前版本、正在发布的预览                                                                  |
| `site/functions`                  | 指向在线函数的链接（`releases/<发布 ID>/functions`），函数容器挂载它                                                      |
| `private/`（700）                 | 由 `.env.local` 生成的 Kong 声明式配置（含 API key）与 PgBouncer 口令文件                                                 |
| `monitor/errors.jsonl`            | 错误收集器收到的报告（已脱敏）                                                                                            |
| `deployments.jsonl`               | 发布记录：每次发布、失败与回滚一行                                                                                        |
| `acceptance.jsonl`、`acceptance/` | 对部署地址跑的 e2e 结果（与发布 ID 关联）与各验收脚本的结果                                                               |
| `stack.json`                      | 栈的非密钥信息：初始管理员账号与 ID                                                                                       |

## 2. 环境变量与密钥

服务端密钥**只来自部署环境**。本地预演里它就是 `deploy/local/.env.local`：`local-up` 第一次运行时用随机数生成，权限 600，被 `deploy/local/.gitignore` 忽略，已存在时绝不覆盖；仓库里只有不含任何值的 [`.env.example`](local/.env.example)。前端产物不含任何服务端密钥：三端在运行时经 `GET /collaboration-api/config` 取公开地址与 anon key。

| 变量                                                           | 用途                                                                     | 本地预演                          | 生产（托管 Supabase）                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                            | 数据库超级用户与 Supabase 内置角色的口令；迁移所有者连接 `postgres` 用它 | `.env.local`                      | 项目数据库口令（控制台），只在可信的部署环境里                          |
| `JWT_SECRET`                                                   | 旧式 HS256 共享密钥：签 anon / service role API key                      | `.env.local`                      | 托管项目的 JWT secret（迁到新 API key 后停用）                          |
| `ANON_KEY`                                                     | 公开 anon key：浏览器与命令入口的公开配置                                | `.env.local`                      | 控制台的 anon / publishable key                                         |
| `SERVICE_ROLE_KEY`                                             | service role key：初始化（向 Auth 确认初始管理员）、e2e 夹具             | `.env.local`                      | 控制台的 service role / secret key，只给部署与测试环境                  |
| `JWT_KEYS` / `JWT_JWKS`                                        | GoTrue 的 ES256 签名私钥；PostgREST 与 Realtime 校验用的公开 JWKS        | `.env.local`                      | 控制台启用非对称签名密钥即可，平台自管                                  |
| `REALTIME_DB_ENC_KEY`、`SECRET_KEY_BASE`、`PG_META_CRYPTO_KEY` | Realtime 与 Studio 的内部密钥                                            | `.env.local`                      | 平台自管                                                                |
| `ADMIN_SERVICE_PASSWORD`                                       | 协作专用角色 `admin_collaboration` 的口令（流水线第 2 步设置）           | `.env.local`                      | 部署环境的密钥，同时出现在函数密钥 `ADMIN_DATABASE_URL` 里              |
| `ADMIN_BOOTSTRAP_KEY`                                          | 初始化的稳定键（初始化幂等）                                             | `.env.local`                      | 部署环境的密钥                                                          |
| `ADMIN_OWNER_DATABASE_URL`                                     | 迁移所有者的连接：迁移、口令、初始化、归档                               | 由 `POSTGRES_PASSWORD` 拼出       | 直连或 session 模式的连接串，只在部署环境                               |
| `ADMIN_DATABASE_URL`                                           | 命令入口以专用角色连库                                                   | `pooler:6432`（compose 内）       | `supabase secrets set`：`admin_collaboration.<ref>@<Supavisor>:6543`    |
| `ADMIN_JWKS_URL` / `ADMIN_JWT_ISSUER`                          | 命令入口本地验签                                                         | `http://kong:8000/...` / 网关地址 | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` / `…/auth/v1` |
| `ADMIN_ALLOWED_ORIGINS`                                        | 允许的工作台来源                                                         | 4510～4515                        | 三端的正式域名                                                          |
| `ADMIN_ERROR_REPORT_URL`                                       | 错误收集器地址（可选，见第 6 节）                                        | `http://collector:9000/ingest`    | 监控服务的 HTTP 接入地址（可能带它自己的密钥，按密钥对待）              |
| `ADMIN_RELEASE`                                                | 发布标识：出现在健康检查与错误报告里，不是密钥                           | 流水线重建函数容器时传入          | `supabase secrets set ADMIN_RELEASE=<发布 ID>`（随函数部署更新）        |

托管平台会给函数注入 `SUPABASE_SERVICE_ROLE_KEY` 与 `SUPABASE_DB_URL`；本地预演照样注入，命令入口从不读取它们（`runtime.spec.ts` 以环境访问记录证明）。

核对命令：`pnpm nx run rxdb-admin-template:env-check`——扫描当前发布的三端产物（`check-secrets` 的产物规则，再逐字节搜 `.env.local` 里每个密钥的原值）、函数产物与产品根里会被提交的全部文件；逐个容器读环境变量，确认密钥只在需要它的服务端容器里、函数的连接串与密钥都来自部署环境、静态站点容器没有任何密钥；三端下发的公开配置只有地址与 anon key；`.env.local` 权限 600、被忽略且未被跟踪。仓库门禁仍是 `pnpm nx run rxdb-admin-template:secrets-check`。

## 3. 发布

```bash
pnpm nx run rxdb-admin-template:deploy-local --output-style=stream
```

[`scripts/deploy-local.mjs`](scripts/deploy-local.mjs) 按生产顺序执行 8 步，每一步都是仓库里的同一个命令：

| #   | 步骤              | 本地预演                                                                                                                                                          | 生产                                                                                                                       |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | 迁移              | `nx run admin-collaboration:migrate`（迁移所有者连接，全部文件按名执行，幂等）                                                                                    | 同一命令，或 `supabase db push`                                                                                            |
| 2   | 专用角色口令      | `nx run admin-collaboration:service-role`（`ADMIN_SERVICE_PASSWORD`，只发 SCRAM 校验值）                                                                          | 同一命令                                                                                                                   |
| 3   | 构建并部署函数    | `nx run admin-collaboration:build-edge`，产物拷进发布目录，函数链接指向它，以发布 ID 重建函数容器，等健康检查报出该 ID                                            | `build-edge` 后 `supabase secrets set ADMIN_RELEASE=<ID>`、`supabase functions deploy admin-collaboration --no-verify-jwt` |
| 4   | 初始化（幂等）    | `nx run admin-collaboration:bootstrap`（稳定键一致时返回既有团队）                                                                                                | 同一命令                                                                                                                   |
| 5   | 构建三端产物      | 三个应用的 `build`                                                                                                                                                | 同一命令                                                                                                                   |
| 6   | 发布 release 目录 | 三端产物拷进 `releases/<发布 ID>/web/`，写 `release.json`（提交、迁移清单与各产物摘要），`staged` 指向它                                                          | 上传到静态托管的新部署（不切流量）                                                                                         |
| 7   | 健康检查          | 函数 `/health`（数据库与 Auth、发布 ID）、Auth / REST / Realtime、三端预览：首页、前端路由、脚本、`/collaboration-api/config` 与 `/collaboration-api/health` 改写 | 对预览部署做同样的检查                                                                                                     |
| 8   | 原子切换 current  | 临时链接 rename 覆盖 `current`（POSIX 原子），再核对三端送出的就是本次发布的页面                                                                                  | 静态托管的「发布 / promote」                                                                                               |

**任一步失败即停止**：后面的步骤不执行；第 3 步已上线的新函数换回上一份产物（重建函数容器，等健康检查报出上一个发布 ID），第 6 步建的 `staged` 链接撤掉；`current` 从未改动，线上仍是上一个发布。迁移只向前、不回退（第 5 节）。

- **发布 ID**：`r<UTC 日期>-<时刻>-<提交前 7 位>`，例如 `r20261118-062816-121bbf2`；工作区有未提交改动时清单里 `git.dirty` 为 true。
- **发布记录** `.state/deployments.jsonl`：发布 ID、开始与结束时间、每一步的状态与耗时、失败的步骤与原因（是否注入）、补偿动作及结果、发布前后的 current 与函数、健康检查结果，不含任何密钥。
- **历史发布**：保留最近 5 个上线过的发布，当前、上一个在线与函数正在用的发布从不删除；失败的发布目录在下一次成功发布时删除。
- **失败注入**：`ADMIN_DEPLOY_FAIL_STEP=<N>` 让第 N 步在它的注入点失败（第 1～7 步在这一步的工作做完之后，第 8 步在 rename 之前）。`pnpm nx run rxdb-admin-template:failure-drill` 依次注入 1～8 步，每次断言：非 0 退出、记录里是这一步、后面的步骤都跳过、补偿成功、`current` 不变、`staged` 已撤、函数健康检查报出旧发布、三端仍送出旧发布的页面。
- 静态站点把 `/collaboration-api/*` 改写到函数（nginx：`/functions/v1/admin-collaboration/$1`，与 Netlify 的 `/collaboration-api/* <函数地址>/:splat 200` 相同），请求体上限放宽到 5 MiB（命令上限 4 MiB；Netlify 等托管的代理有自己的上限，要确认）。

## 4. 回滚

```bash
pnpm nx run rxdb-admin-template:rollback-local                       # 回到当前发布之前最近一次上线的发布
pnpm nx run rxdb-admin-template:rollback-local -- --to <发布 ID>    # 回到指定发布
```

[`scripts/rollback-local.mjs`](scripts/rollback-local.mjs)：

1. 定目标（发布记录里当前之前最近一次上线的发布，或 `--to`），目标的发布目录与清单必须还在；
2. **函数回到目标发布的产物**：函数链接指向它，以它的发布 ID 重建函数容器，等健康检查报出目标 ID（生产：用目标发布里保存的 `dist/collaboration.js` 重新 `supabase functions deploy`，并 `supabase secrets set ADMIN_RELEASE=<目标 ID>`）；
3. **三端切回**：`current` 原子地指向目标发布，核对三端送出目标发布的页面（生产：静态托管回滚到上一个部署）；
4. **迁移不回退**：列出当前发布有、目标发布没有的迁移，以及 [`migrations.json`](migrations.json) 里它们的回滚与前向修复说明；
5. 健康检查通过后写发布记录（`result: rolled_back`）。

共享数据都在数据库里，回滚应用不动它们。前提是每个迁移对上一版代码兼容（只增不删、不改语义）；做不到的迁移必须拆成「先加、再切代码、最后删」几次发布。

**演练**：`pnpm nx run rxdb-admin-template:rollback-drill` 在发布 A 上合并一条记录，发布新版 B 并在 B 上再合并一条，回滚到 A，断言函数与三端都回到 A、共享头 / 修订号 / 审计总数 / 共享记录与回滚前完全相同，在 A 上再合并第三条照常成功，最后对三端各跑一遍浏览器冒烟（`e2e/deployed-smoke.spec.ts`：登录、打开演练团队，三条记录都在共享数据里）。

### 各迁移的回滚说明

完整内容（含 SQL）在 [`migrations.json`](migrations.json)，新增迁移必须在那里登记，`deploy-test` 核对每个迁移文件都有完整的说明：

| 迁移                            | 能否回滚 | 对数据的影响                                                      | 前向修复                                                   |
| ------------------------------- | -------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| `202611160001_collaboration`    | 否       | 首版结构，删除即丢失全部协作数据                                  | 新的幂等迁移                                               |
| `202611170001_commit_store`     | 否       | 提交历史与共享记录在这些表里                                      | 新迁移（提交表此后由 202611180002 改成交换格式）           |
| `202611170002_workspace_tables` | 否       | 拆出的表承载全部协作状态                                          | 新迁移                                                     |
| `202611170003_schema_manifests` | 否       | 键索引可重建；清单只追加                                          | `schema` 命令登记更高版本（同时重建键索引）                |
| `202611170004_supabase_native`  | 可以     | 投影与函数不存数据；回滚会让当前前端的读取失败                    | `CREATE OR REPLACE` 后重跑                                 |
| `202611180001_service_role`     | 可以     | 不存数据；收回授权会让命令入口全部失败                            | 补 `GRANT` 的新迁移；口令泄露时第 2 步换口令并更新函数密钥 |
| `202611180002_exchange_commits` | 否       | 在旧结构上执行会清空协作数据；新结构上重跑不改数据                | 新迁移；部署前确认目标库已是新结构，否则先备份             |
| `202611180003_audit_archive`    | 可以     | 只新增对象；撤销前先把归档按原 seq 移回热表，否则丢失已归档的审计 | 调整归档策略；函数有误时 `CREATE OR REPLACE`               |

## 5. 迁移

迁移按文件名顺序执行，每个文件自带事务且幂等。`pnpm nx run rxdb-admin-template:migration-check`（AC#1）在**干净的**栈上连续执行两次：第一次之后导出整库结构（`pg_dump --schema-only`，含 RLS 策略、授权、函数与 Realtime publication；去掉 Realtime 按天自建的消息分区），写入一份数据，第二次之后再导出，断言第二次不报错、两次导出逐字节相同、目录查询（RLS 开关、策略、表与列授权、函数、publication 成员、专用角色属性）相同、数据摘要不变；另核对产品表全部开着 RLS、都不在 `supabase_realtime` publication 里（失效通知走 Broadcast）、`realtime.messages` 上恰好两条频道策略。干净栈的做法：

```bash
pnpm nx run rxdb-admin-template:local-down -- --volumes
pnpm nx run rxdb-admin-template:local-up
pnpm nx run rxdb-admin-template:migration-check
```

结果目录里的 `product-schema.sql` 只含产品对象（`public`、`admin_private` 与 `realtime.messages` 上的策略），可以拿真实项目的同一份导出与它比对，发现结构漂移。

## 6. 健康检查与监控

**健康检查**：Node 入口与 Edge Function 都提供 `GET /health`（不要求令牌；经静态站点是 `/collaboration-api/health`）。并行探测数据库（以命令入口自己的连接池、专用角色读一行治理表：连通、认证与授权都在其中）与 Auth（带公开 key 访问 `<SUPABASE_URL>/auth/v1/health`），每项 3 秒时限：

```json
{
  "checks": { "database": { "status": "ok", "latencyMs": 16 }, "auth": { "status": "ok", "latencyMs": 4 } },
  "entry": "edge",
  "release": "r20261118-062816-121bbf2",
  "status": "ok"
}
```

全部可用回 200，任一不可用回 503，并给出该项的 `reason`（`timeout` / `error` / `status`）与可公开的 `code`（SQLSTATE、系统错误码或 HTTP 状态）；不带连接串、密钥、令牌或错误原文。

**错误监控**：命令入口里的未处理错误（请求处理中抛出的非业务错误，回 500 `internal`）与连接池里空闲连接的错误交给可插拔的上报器（`packages/collaboration/src/server/monitor.ts`）：

- 控制台上报器总是开着：每条一行 `ADMIN_ERROR <JSON>`，写进函数日志 / Node 进程的标准错误，由平台的日志汇收集；
- 配置了 `ADMIN_ERROR_REPORT_URL` 时另发 HTTP 收集器（JSON POST，2 秒超时；投递失败只记一行 `ADMIN_ERROR_DELIVERY_FAILED <原因>`，不带收集器地址）。本地预演发给 `collector`（4505，`GET /events` 读回），生产换成真正的监控服务；
- 报告只带时刻、入口、发布 ID、来源（请求或连接池）、请求的方法与路径（不含查询串、请求头与请求体）、错误名、消息、SQLSTATE、详情与堆栈，**全部先脱敏**：JWT（access token 与 API key）、`Bearer` / `Basic` 凭据、`sb_secret_` / `sb_publishable_` key、URL 里的口令、`token` / `password` / `secret` / `apikey` / `otp` 等键值、邮箱（含受邀邮箱）、32 位以上的十六进制串（令牌摘要）与 6～10 位数字（验证码）；保留 UUID 标识、SQLSTATE 与压缩产物里的堆栈行列号。SQL 文本与绑定参数从不进入报告。单测见 `monitor.spec.ts`。

**演练**：`pnpm nx run rxdb-admin-template:monitor-drill`——健康检查（直连网关与经三端改写）、停连接池与停 Auth 时的 503 与恢复、以迁移所有者临时装一个让邀请插入抛出「带受邀邮箱、6 位数字与令牌形状串」异常的触发器，再以真实会话发邀请：断言 500 `internal`、收集器与函数日志各有这次报告、发布 ID 与路径正确、任何地方都不含 access token、验证码、受邀邮箱与密钥原值，最后删掉触发器。

其余要监控的（生产）：Realtime 的 `realtime.send` WARNING（它不抛错，客户端靠修订号跳号补齐）、`realtime.messages` 的分区清理、Supavisor 的排队与连接数、Edge Function 的 546 / 503 比例与 CPU 时间、PostgREST 的 5xx。

## 7. 审计归档与保留期

- **回执**保留 30 天：期内用原操作 ID 重试返回原结果；过期回执由之后的写事务顺手清理（每个写事务至多 20 条，最旧的先清），过期后同一 ID 按新请求裁决。
- **通知**不修剪，按用户分页读取（团队页只带最近 50 条与未读总数）。
- **审计归档**（迁移 `202611180003_audit_archive.sql`）：热表 `public.admin_audit` 里满足策略的事件由迁移所有者分批移入归档表 `admin_private.audit_archive`（每列原样保留，含原 seq），只读投影 `public.admin_audit_events` 合并两张表（审计游标按它查），分页与最近一窗经读取函数 `public.admin_audit_page()`：两张表各自按 seq 倒序、带上限地取再合并，每页读的行数只与页大小有关。审计分页、最近一窗与按 PR / 线程筛选照常读得到归档的事件，审计总数不变。（预演发现：直接经 security_barrier 投影分页时排序与上限推不进 UNION ALL 的两支，5 万条审计每页约 0.2 秒并随总量线性增长，因此改走读取函数；集成测试以 auto_explain 数出每页扫描的行数不超过两页。）策略二选一或同时给出，满足任一条件即归档：

  ```bash
  ADMIN_OWNER_DATABASE_URL=… ADMIN_AUDIT_ARCHIVE_AFTER_DAYS=90 ADMIN_AUDIT_KEEP_LATEST=20000 \
    pnpm nx run admin-collaboration:audit-archive
  ```

  每批至多 `ADMIN_AUDIT_ARCHIVE_BATCH`（默认 5000）行、一个短事务，重复到一批不满为止，重跑幂等。生产可在 Supabase 上用 pg_cron 定期执行同一个函数：`SELECT cron.schedule('admin-audit-archive', '17 3 * * *', $$SELECT admin_private.archive_audit(interval '90 days', 20000, 5000)$$);`（一次调用一批；积压时按批多跑几次）。上一版前端只读热表，**归档要在读 `admin_audit_events` 的前端上线之后再启用**。

`pnpm nx run rxdb-admin-template:retention-check`（AC#6）在一个工作区里写入预设规模（回执 2 万条在保留期内、5 千条已过期，审计 5 万条分布在 180 天，通知 1 万条；可用 `RETENTION_*` 环境变量调整），测普通命令（发评论、标记已读、订阅，各 100 次）经网关的 p95 耗时（预算 50 ms，另记中位数与最大值）与团队页经 PostgREST 的体积（预算 50 KB），验证保留期内重试返回原结果、超期按新请求裁决、过期回执被清理，再按策略归档并断言归档前后全部审计分页、最近一窗与按 PR 筛选逐条相同，归档后再测一次。

## 8. 验收脚本一览

| AC  | 命令                                                                                             | 内容                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1   | `rxdb-admin-template:migration-check`                                                            | 干净栈上迁移两次，结构导出与数据不变                                                                             |
| 2   | `rxdb-admin-template:deploy-local`、`failure-drill`                                              | 8 步发布；逐步注入失败，current 与函数都保持上一版                                                               |
| 3   | `rxdb-admin-template:env-check`、`secrets-check`                                                 | 产物、仓库与容器环境里的密钥                                                                                     |
| 4   | `rxdb-admin-template:e2e-local -- --otp 20`                                                      | 三端各一遍：真实发信（本地收件服务）、登录、验证码 20 秒过期后被拒、重新请求可用                                 |
| 5   | `rxdb-admin-template:e2e-local -- --project react --project angular --project vue --project rls` | 三端协作 e2e 打部署地址，加 PostgREST / Realtime 层的 RLS 矩阵，结果与发布 ID 一起记进 `.state/acceptance.jsonl` |
| 6   | `rxdb-admin-template:retention-check`                                                            | 预设规模下的命令耗时、团队页体积、幂等重试与审计归档                                                             |
| 7   | `rxdb-admin-template:monitor-drill`                                                              | 健康检查、依赖不可用、未处理错误的脱敏上报                                                                       |
| 8   | `rxdb-admin-template:rollback-drill`                                                             | 发布新版 → 回滚 → 共享数据不丢、e2e 冒烟                                                                         |

对部署地址跑 e2e 用协作包的「已部署目标」模式（`ADMIN_E2E_TARGET=deployed`，`admin-collaboration:e2e-deployed`）：三端打部署出的前端地址，不起 `browser-server.mjs`，只起 `scripts/deployed-fixtures.mjs`——账号与验证码经部署栈的 Auth 管理接口（service key），工作区经初始化步骤（迁移所有者连接），邀请经部署出的命令入口、令牌来自真实的验证码登录。service key 与所有者连接只在测试侧，由运行环境给出（`ADMIN_E2E_SUPABASE_URL`、`ADMIN_E2E_ANON_KEY`、`ADMIN_E2E_SERVICE_KEY`、`ADMIN_E2E_OWNER_DATABASE_URL`、`ADMIN_E2E_COMMANDS_URL`、`ADMIN_E2E_WEB_URLS`、`ADMIN_E2E_FIXTURES_PORT`）；对 staging 跑时由 CI 的密钥提供同样的变量。

## 9. 与真实 Supabase 云的差异

| 方面       | 本地预演                                                                                        | 真实环境要确认的                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 连接池     | PgBouncer 1.26.1 transaction 模式（同样的约束：无会话状态、不转发启动参数、无跨事务预编译语句） | Supavisor transaction 模式（6543）：用户名 `admin_collaboration.<ref>`、SSL 与 CA、排队上限与池大小                   |
| 函数运行时 | edge-runtime v1.74.0 容器，主服务按线上限额起 worker                                            | 托管的冷启动、CPU 计量与 worker 回收；`supabase functions deploy` 的生效时间（发布期间新旧函数并存）                  |
| 函数部署   | 函数链接换到新产物后重建容器                                                                    | 部署即在线，没有预览：第 3 步之后到第 8 步之间，新函数已经对旧前端服务（迁移与命令契约须向后兼容）                    |
| 邮件       | inbucket（本地收件服务，不是真实邮箱），自定义验证码模板经 HTTP 读取                            | 真实 SMTP 服务、发件域名（SPF / DKIM）、Email Templates 填 `deploy/local/templates/*.html` 的内容、速率限制           |
| 速率限制   | 为了 e2e 放宽了 GoTrue 的验证与发信速率                                                         | 托管默认值；对 staging 跑 e2e 前评估是否要调高或减少登录次数                                                          |
| 域名与 TLS | `http://127.0.0.1`，没有 TLS                                                                    | 正式域名、证书、HSTS；`ADMIN_ALLOWED_ORIGINS`、Auth 的 Site URL / Redirect URLs；CSP                                  |
| 静态站点   | nginx，`current` 链接原子切换，`/collaboration-api/*` 反向代理                                  | 托管的改写规则、请求体上限（≥ 4 MiB）与超时、预览部署与 promote、缓存策略                                             |
| 身份       | GoTrue 以 ES256 私钥签发，JWKS 经网关公开                                                       | 控制台启用非对称签名密钥、密钥轮换（命令入口遇到未知 kid 至多每 30 秒重取一次 JWKS）、access token 有效期 10～15 分钟 |
| Realtime   | 自托管租户 `realtime-dev`，没有开「只允许私有频道」                                             | 评估开启「只允许私有频道」；`realtime.messages` 分区清理                                                              |
| PostgREST  | `max-rows` 1000                                                                                 | `db-max-rows` ≥ 500                                                                                                   |
| 备份       | 无                                                                                              | 每日备份 / PITR；`202611180002` 之类不可回滚的迁移执行前先备份                                                        |
| 监控       | 控制台日志 + 本地 HTTP 收集器                                                                   | 接入真正的监控服务与告警（错误率、503 / 546、健康检查）                                                               |

## 10. 上线前在真实环境要做的事

1. 建 staging 与 production 两个 Supabase 项目，启用非对称 JWT 签名密钥，access token 有效期设为 10～15 分钟，`db-max-rows` ≥ 500，配置真实 SMTP 与验证码模板，评估 Realtime「只允许私有频道」。
2. 把本手册的 8 步接进真实的发布流水线（CI 里执行同样的 Nx 命令，静态托管用预览部署 + promote 实现第 6～8 步），发布记录写到 CI 的制品或发布系统里。
3. 在干净的 staging 项目上跑 `migration-check` 的等价检查（两次迁移、结构导出比对，可与本地的 `product-schema.sql` 比对）。
4. 对 staging 跑 `env-check` 的等价检查（产物扫描 + 托管平台的函数密钥清单）与 `secrets-check`。
5. 用**真实邮箱**完成 AC#4：请求验证码、登录，另取一码等它按真实有效期自然过期后提交被拒，重新请求可用（同时补齐 ADMIN-US-201 AC#2 / #3 的真实邮箱证据）。
6. 对 staging 的部署地址跑 `e2e-deployed`（三端 + `rls`），结果与发布 ID 关联；复测托管 Edge Function 的冷启动与 CPU 计量（`benchmark-edge` 的规模）。
7. 在 staging 上跑 AC#6 的规模与预算、配置 pg_cron 的审计归档。
8. 接入真正的错误监控（`ADMIN_ERROR_REPORT_URL` 或日志平台），人为触发一次未处理错误核对脱敏；健康检查接入告警。
9. 在 staging 上实际演练一次「发布新版 → 回滚」，并确认备份与恢复流程。
