# 产品协作包

`@rxdb-admin-template/collaboration` 是三个工作台复用的产品私有包，不发布到 npm。React、Angular、Vue 都在 `/collaboration` 懒加载同一套任务、讨论与审核交互；原匿名资产工作台、数据库名称与连接前恢复入口保持独立。

## 运行方式

浏览器直接使用 Supabase：经 supabase-js 登录、经 PostgREST 读 public 下的只读投影（RLS 按成员资格裁决）、经 Realtime 的私有频道收失效通知与在线状态。写入只有一条路径：协作命令入口，它在本进程里校验 access token，在 PostgreSQL 事务里执行命令，并在同一事务里向私有频道广播失效通知。

命令入口是一个 fetch 风格的处理函数（`server/handler.ts`），同一套领域引擎与仓储有两个部署入口（ADMIN-US-220）：

- **Supabase Edge Function**（`rxdb-admin-template/supabase/functions/admin-collaboration`，推荐）：只部署 Supabase 即可上线，不另外托管服务，步骤见下文「只部署 Supabase」；
- **Node 服务**（`server/main.ts`，`nx run admin-collaboration:serve-api`）：等价的部署选项，与 Edge Function 跑同一套命令契约测试。

两种入口都只以协作专用数据库角色 `admin_collaboration` 连库（迁移 `202611180001_service_role.sql`），不用超级用户、postgres 或 service role。前端把 `/collaboration-api/*` 交给命令入口：开发时三个应用已有代理，默认指向 `127.0.0.1:8088`（Node 服务），可用 `ADMIN_API_URL` 改指向别处，例如本机 Edge Function 的 `http://127.0.0.1:54329/admin-collaboration`；部署时由静态站点把 `/collaboration-api/*` 改写到命令入口（见「只部署 Supabase」第 6 步）。

命令入口的环境变量（只在命令入口里，前端产物不得出现这些名字与值；Edge Function 与 Node 服务读同样的设置，只有身份校验的三个变量名不同）：

| 变量（Node 服务 / Edge Function）          | 用途                                                                                                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                             | 命令入口访问 Supabase 的地址（接受邀请时向 Auth 确认邮箱），也是下发给浏览器的地址。Edge Function 里由平台注入                                                                                                                |
| `SUPABASE_ANON_KEY`                        | 公开 anon / publishable key；启动时拒绝 service role key。Edge Function 里由平台注入                                                                                                                                          |
| `ADMIN_PUBLIC_SUPABASE_URL`                | 可选：只有命令入口访问 Supabase 的地址与浏览器不同（自托管时函数经内部网络访问网关）才设置，作为下发给浏览器的地址                                                                                                            |
| `SUPABASE_JWKS_URL` / `ADMIN_JWKS_URL`     | 生产：非对称签名密钥的 JWKS 地址（`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`），与下一项**恰好配置一个**                                                                                                                  |
| `SUPABASE_JWT_SECRET` / `ADMIN_JWT_SECRET` | 本机隔离栈：GoTrue 的 HS256 共享密钥，与上一项恰好配置一个；两项都缺或都给时入口启动即失败，运行中不在两种方式之间回退                                                                                                        |
| `SUPABASE_JWT_ISSUER` / `ADMIN_JWT_ISSUER` | 令牌的签发者（`iss`），必须完全一致。用 JWKS 时必填（托管 Supabase 为 `<SUPABASE_URL>/auth/v1`）；用共享密钥时可选，不配置即要求令牌不带 `iss`（本机隔离栈的 GoTrue 不签发 `iss`）                                            |
| `ADMIN_DATABASE_URL`                       | 协作专用数据库角色的连接，指向**同一个 Supabase 项目的 PostgreSQL**（广播写在它的 `realtime.messages`，读取投影也在这里）；用户名不是 `admin_collaboration`（经 Supavisor 时为 `admin_collaboration.<项目 ref>`）时启动即失败 |
| `ADMIN_ALLOWED_ORIGINS`                    | 允许的工作台来源，逗号分隔，含协议与端口                                                                                                                                                                                      |
| `ADMIN_API_PORT` / `ADMIN_API_HOST`        | 只用于 Node 服务：默认 `8088` / `127.0.0.1`                                                                                                                                                                                   |
| `ADMIN_RELEASE`                            | 可选：发布标识（不是密钥），出现在健康检查与错误报告里，发布流水线据此确认在线的是哪一次发布                                                                                                                                  |
| `ADMIN_ERROR_REPORT_URL`                   | 可选：错误收集器地址，未处理错误脱敏后另以 JSON POST 给它（控制台日志总是写）；地址可能带收集器自己的密钥，按服务端密钥对待                                                                                                   |

Edge Function 的三个身份校验变量用 `ADMIN_` 前缀：Supabase 不接受 `SUPABASE_` 开头的函数密钥（CLI 设置时直接跳过），平台还会自行注入这个前缀的变量；函数只读自己的三个变量，平台注入的 `SUPABASE_SERVICE_ROLE_KEY` 与 `SUPABASE_DB_URL`（以 postgres 角色连库）一概不读（`runtime.spec.ts` 以环境访问记录证明）。

邮箱登录需要在 Supabase 配置邮件发送服务，并将 passwordless 邮件模板配置为显示 `{{ .Token }}` 验证码。页面打开后先取公开配置（`GET /config`）建出认证客户端，取到之前「发送验证码」与「登录」不可用（`src/client/login-view.ts`）。允许创建认证账号不等于授予团队成员关系；新用户必须接受匹配其已验证邮箱的邀请。邀请链接把团队、应用、邀请标识与一次性令牌放在 URL fragment（`#join=…`）里，浏览器不会把它发给服务器，也不会写进代理日志或 Referer；服务端只保存令牌摘要，审计详情不含受邀邮箱。团队与应用标识不能含冒号（私有频道名以冒号分隔，迁移与初始化都会拒绝）。

### 身份校验与运维须知

命令入口在本进程里验签（`server/identity.ts`）：生产按 kid 从 JWKS 取 ES256 / RS256 公钥（缓存；遇到未知 kid 至多每 30 秒重取一次，取失败按服务暂不可用返回 503），本机隔离栈用 HS256 共享密钥；JWKS 模式只接受非对称算法、共享密钥模式只接受 HS256。逐项校验签名、`iss`、`aud`（含 `authenticated`）、`exp`（与 `nbf`）、`sub` 非空，且 `role` 必须是 `authenticated`；任一项不合格都只回 401「会话已失效，请重新登录」，不透露原因。稳态下每个命令请求都**不访问 Auth**；只有接受邀请时调用一次 Auth 的 `getUser`，确认账号仍存在、邮箱已验证、与令牌是同一账号，并以 Auth 返回的邮箱与邀请比对，成员行里记的就是这个经 Auth 确认的邮箱。成员关系与权限仍由每条命令在服务端事务里按成员表裁决。

运维须知三点：

1. **access token 有效期**：本机隔离栈为 3600 秒（`GOTRUE_JWT_EXP`），托管 Supabase 默认 3600 秒，可在 Auth 设置里缩短（建议 10～15 分钟）；浏览器在到期前自动刷新，刷新时 Realtime 按新令牌重新鉴权。
2. **账号删除后的残留窗口**：在 Auth 里删除账号不会让已签发的 access token 失效。它在过期前仍能通过本服务、PostgREST 与 Realtime 的本地验签，残留窗口最长等于 access token 有效期；缩短有效期即收窄窗口。需要立即切断时，先在团队里撤销该成员（见下一条）。
3. **团队级撤权即时生效**：撤权命令提交后，下一条命令的成员校验、PostgREST 的每次读取（投影条件按成员行判定）立即拒绝；同一事务广播撤权事件，其他成员的页面立即把他移出在线列表，他自己的页面立即锁定；他若绕过页面继续监听频道，Realtime 在他下次刷新令牌或重连时按 RLS 重新鉴权并关闭频道，最迟到令牌过期为止，期间频道里只有修订号、类别与标识，没有业务内容。

迁移、设置专用角色口令与初始化是部署期的一次性步骤，以迁移所有者（Supabase 的 postgres 角色）的连接 `ADMIN_OWNER_DATABASE_URL` 在可信环境里执行，命令入口拿不到这个连接。先应用迁移（按文件名顺序执行 `supabase/migrations/` 下的全部文件，每个文件幂等，可重复执行；托管 Supabase 也可用 `supabase db push`）：

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:migrate
```

迁移只建 NOLOGIN、无口令的专用角色；部署步骤设置它的口令并允许登录（口令取自 `ADMIN_SERVICE_PASSWORD`，只以 SCRAM-SHA-256 校验值发给数据库，明文不进 SQL 与数据库日志；也可以在 Supabase 的 SQL 编辑器里执行 `ALTER ROLE admin_collaboration WITH LOGIN PASSWORD '<口令>'`）：

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:service-role
```

然后执行一次初始化，额外提供 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_INITIAL_USER_ID`、`ADMIN_TEAM_ID`、`ADMIN_APP_ID`、`ADMIN_TEAM_NAME`、`ADMIN_BOOTSTRAP_KEY`，以及 `ADMIN_SCHEMA_FILE`（数据模式清单文件，产品的清单是 `rxdb-admin-template/schema/collaboration-schema.json`，见下文「数据模式清单」）。初始用户必须已在 Supabase 验证邮箱；初始化只创建空共享分支、管理员、默认审批策略和第一个数据模式版本，不导入样例数据。之后起命令入口（Node 服务如下，Edge Function 见「只部署 Supabase」）：

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:bootstrap
NX_NO_CLOUD=true pnpm nx run admin-collaboration:serve-api
```

初始化参数与稳定键一致时返回既有团队，不重置策略、权限与数据模式（新版本经 `schema` 命令登记）。浏览器没有初始化接口，也不得获得数据库连接或 service role key；命令入口的专用角色读不到初始化密钥，也不能新建工作区。

## 只部署 Supabase（Edge Function）

命令入口打包成 Supabase Edge Function，与 Node 服务共用同一个处理函数、领域引擎与仓储（ADMIN-US-220）。`src/server/edge.ts` 是 Deno 入口，`nx run admin-collaboration:build-edge` 用 esbuild 把它连同所需的 `@aiao/rxdb`、`@aiao/rxdb-plugin-working-tree/exchange`（交换格式的纯函数，见「提交协议与存储」）与 `pg` 打成自包含的 ESM 产物 `rxdb-admin-template/supabase/functions/admin-collaboration/dist/collaboration.js`（约 430 KiB），两个平台包都按包的 `exports` 解析到各自的 dist（不读 tsconfig 的 paths），函数目录的 `index.ts` 只导入它。产物不进仓库：随时可由构建重现，部署与本地起函数的 Nx 目标都先依赖构建，避免仓库里留一份与源码不一致的生成物。

部署步骤（在 `rxdb-admin-template/` 目录执行 Supabase CLI；按这个顺序编排的发布流水线、失败即停、回滚与本地预演栈见 [部署与运维手册](../../deploy/README.md)，真实项目上的证据由 ADMIN-US-217 承接）：

1. **迁移**：`supabase db push`（或上文的 `admin-collaboration:migrate`）。
2. **专用角色口令**：`ADMIN_OWNER_DATABASE_URL=… ADMIN_SERVICE_PASSWORD=<随机长口令> pnpm nx run admin-collaboration:service-role`。
3. **构建并部署函数**：`pnpm nx run admin-collaboration:build-edge`，然后 `supabase functions deploy admin-collaboration --no-verify-jwt --project-ref <ref>`。不在网关校验 JWT：`GET /config` 不带令牌，命令入口自己按 JWKS 本地验签（比网关多校验 `role` 与 `aud`），预检请求也直接交给函数。
4. **函数密钥**：`supabase secrets set --project-ref <ref> ADMIN_DATABASE_URL='postgres://admin_collaboration.<ref>:<口令>@<Supavisor 主机>:6543/postgres' ADMIN_JWKS_URL=https://<ref>.supabase.co/auth/v1/.well-known/jwks.json ADMIN_JWT_ISSUER=https://<ref>.supabase.co/auth/v1 ADMIN_ALLOWED_ORIGINS=https://<工作台域名>`。`SUPABASE_URL` 与 `SUPABASE_ANON_KEY` 由平台注入，不用设置。
5. **初始化**：同上文 `admin-collaboration:bootstrap`。
6. **前端**：三端静态产物部署在任意静态站点，把 `/collaboration-api/*` 改写到 `https://<ref>.supabase.co/functions/v1/admin-collaboration/:splat`（例如 Netlify 的 `_redirects` 写 `/collaboration-api/* https://<ref>.supabase.co/functions/v1/admin-collaboration/:splat 200`）；不能改写的站点可在 `mountCollaboration` 的 `apiBase` 直接给函数地址（跨源调用，来源须在 `ADMIN_ALLOWED_ORIGINS` 里，函数会暴露 `Retry-After` 头）。

**Supavisor 连接串**：用控制台 Connect → Transaction pooler 的地址（端口 6543），把用户名前缀 `postgres.` 换成 `admin_collaboration.`，即 `postgres://admin_collaboration.<项目 ref>:<口令>@aws-<n>-<区域>.pooler.supabase.com:6543/postgres`；口令里的特殊字符须百分号编码。不用平台注入的 `SUPABASE_DB_URL`：它以 postgres 角色连库，权限远超协作所需。transaction 模式下每个事务可能落在不同的服务端连接上，命令入口因此遵守这些约束（集成测试以 transaction 模式的 PgBouncer 验证）：

- 不用命名的预编译语句：`pg` 的参数化查询走无名语句，与 Parse/Bind/Execute 在同一事务里完成；
- 不用会话级设置与启动参数：连接参数里不带 `statement_timeout` 等（连接池会拒绝或丢弃它们），每个事务开头以 `SET LOCAL` 设语句超时 30 秒、等锁超时 10 秒、事务空闲超时 15 秒，随事务结束失效；
- 不用 LISTEN / NOTIFY、会话级咨询锁、临时表与跨事务游标：广播是事务里的一次插入（经定义者函数 `admin_private.broadcast()` 调 `realtime.send()`），并发靠行锁与比较交换；只有初始化用到事务级的 `pg_advisory_xact_lock`，事务结束即释放，且初始化以迁移所有者直连执行；
- 连接在借出期间被连接池断开（排队超时等）时，仓储接住连接上的 error 事件、把连接从池里销毁，返回可重试错误，不让进程或 worker 崩溃。

**专用角色的权限**（迁移 `202611180001_service_role.sql`，`service-role.integration.spec.ts` 验证）：只有命令事务用到的表与列权限——治理行只读名称、初始化归属与两个版本号、只改两个版本号，读不到也改不了 `bootstrap_key`，不能新建或删除工作区；策略、数据模式、任务元数据、候选、审核、提交与字段级变更只读与追加；审计与逐记录变更日志只追加、不可读；每张表上只对它生效的 RLS 策略；广播只能经 `admin_private.broadcast()` 发往 `collab:<团队>:<应用>` 的 `changed` / `revoked` 事件。它不是超级用户，不能绕过 RLS，没有 auth、storage、vault、realtime 的权限，不能建表、改表、改 RLS 策略，也不能 `SET ROLE` 成别的角色。

**本机起函数**：`pnpm nx run admin-collaboration:serve-edge` 在 `supabase/edge-runtime:v1.74.0` 容器里加载函数目录，主服务（`scripts/edge-runtime/main`）按线上限额创建 worker（每个请求 CPU 软限 1 秒、硬限 2 秒，内存 256 MB），平台层的失败按线上的状态码回应（启动失败 503 `BOOT_ERROR`、资源上限 546 `WORKER_LIMIT`）。环境变量取自当前进程（同上表的 Edge Function 一栏），`EDGE_PORT`（默认 54329）与 `EDGE_NETWORK`（数据库在 docker 网络里时设置）只给脚本用。

**可重试错误**：冷启动失败、等锁或语句超时、连接池耗尽（取连接超过 5 秒、Supavisor / PgBouncer 排队超时、数据库连接数用尽）、连接中断与重试用尽的并发冲突，命令入口一律回 503、`Retry-After` 与稳定的错误码 `unavailable`（`details.reason` 为 `pool` / `timeout` / `connection` / `conflict`），事务已整体回滚。浏览器端 `CollaborationApi` 对 503、504 与 546 用同一个请求（同一个操作 ID）自动重发，最多 4 次，按 `Retry-After` 等待（没有时 0.5、1、2 秒，单次不超过 10 秒）；仍不可用时报 `unavailable` 并保留待确认的请求，之后按原操作 ID 重试，回执保证同一操作只执行一次。502 等其他失败只发一次，按「结果不确定」处理。

**资源余量**（AC#3，`nx run admin-collaboration:benchmark-edge`）：在 10000 条共享记录、1000 个提交的工作区上，经本机 Edge Function（线上限额）执行批量上传、生成候选与合并，每个请求由新建的 worker 处理，CPU 取该 worker 的 `cpu_time_used`（含冷启动、建连与 SCRAM 认证，约 44 ms，所以是单个请求的上界）。2026-11-18 两轮实测（第二轮每档 3 次）的最大值：

|                 一个 PR 改动的记录数 |   上传 | 生成候选 |    合并 | 合并时的内存（关闭时） |
| -----------------------------------: | -----: | -------: | ------: | ---------------------: |
|                                  100 |  51 ms |    74 ms |   76 ms |                  13 MB |
|                                 1000 |  80 ms |   145 ms |  297 ms |                  13 MB |
|                                 5000 | 161 ms |   383 ms |  650 ms |                  13 MB |
| 10000（全部共享记录，请求 1.44 MiB） | 453 ms |   859 ms | 1423 ms |                  48 MB |

上表在提交改成交换格式（ADMIN-US-221）之前测得。交换格式的单元多了 `unitId`、`transactionId` 与 `origin` 三列，同样改动全部 10000 条记录的上传请求从 1.44 MiB 涨到 2.26 MiB；请求上限因此由 2 MiB 放宽到 4 MiB，让「单个提交最多 10000 项变更」在资产这种体量的记录上先生效（工作树一次提交整棵工作树，客户端无法拆分）。交换格式下的复测（2026-11-18，[结果](../../requirements/plans/evidence/collaboration-edge-resource-exchange-2026-11-18.json)）：改动一万条的上传 2.26 MiB、CPU 318 ms，生成候选 572 ms，合并 1068 ms（2 秒硬限的 53%，余量 1.87 倍）；内存限额收紧到 64 MB 时一万条的合并不通过，与改造前相同。普通命令（建任务、建 PR、改状态等）41～68 ms，带 100 个提交（单次上限）的上传 116 ms。最坏情形是一次合并改动全部 10000 条共享记录：CPU 最大 1423 ms，是 2 秒上限的 71%（余量 1.41 倍）；把限额收紧重跑，CPU 1.5 秒仍通过、1 秒不通过，内存 96 MB 仍通过、64 MB 不通过，即峰值内存在 64～96 MB 之间（余量至少 2.7 倍）。改动 5000 条以内的 PR，CPU 不超过 650 ms（余量 3 倍以上）、内存 13 MB；改动 100 条（预算的度量口径）不超过 76 ms（余量 26 倍）。取舍：单个 PR 一次改动接近全部 10000 条记录时余量最薄；如果业务的特殊检查（`checks`）或更宽的记录让这类整库批改超出 2 秒，就改用 Node 入口部署（同一套代码与契约测试），或把整库批改拆成几个 PR。

## 状态与事务

团队任务的本机数据在团队库里（平台 working-tree，见下文「团队任务：团队库与 working-tree」）：每个「用户 × 团队 × 应用」一个库，任务是其中的分支；记录经模型驱动的实体列表与表单保存，每次保存都进入任务工作树；点击同步时 `commit()` 把整棵工作树形成一个普通提交（作者是当前用户），再用 `exportCommits()` 取远端头之后的本机提交上传。提交是平台 working-tree 的交换记录（见「提交协议与存储」），带 UUIDv7 提交 ID 与平台算的内容指纹；上传期间的后续保存留在下一份工作树中。任务同步保留提交 ID、父链与作者，不把通用实体推拉当成提交图复制，失败与超时重试复用同一个幂等键与同一批提交。

服务端按固定顺序只锁命令涉及的行（见「提交协议与存储」的锁顺序），先校验当前身份与权限，再执行命令。提交、候选、审批、阻塞讨论、成员与策略变更共享这一裁决顺序：成员、邀请与策略命令对治理行加排他锁，其余命令加共享锁，撤权因此要等在途的批准、合并与评论提交，撤权提交之后的命令一律按撤权后的成员关系裁决。只有 `merge` 能更新共享业务数据；共享头、数据、逐记录变更日志、PR、合并提交、候选关联、策略快照和审计在同一个 PostgreSQL 事务中落地。所有普通客户端角色都只能按 RLS 读取公开投影，不能直接写入。

每次业务命令有稳定幂等键。回执保留 30 天（`receiptRetentionMs`）：期内用原操作 ID 重试返回原结果；过期回执由之后的写事务顺手清理（每个写事务最多 20 条，最旧的先清），过期后同一 ID 按新请求裁决，提交仍按提交 ID 去重，不会重复建提交。待确认的上传记在本机任务账本里（幂等键、发出时的远端头与这次上传的最后一个提交，提交本身在团队库的提交图里）；其他尚未确认的请求保留在当前用户的会话存储中，并提供回执查询与原请求重试入口；两者都记下首次发出的时间，超过自动重试期限（比回执保留期早一天，留出时钟偏差）仍未确认时不再自动重发：查不到回执的普通请求交给用户选择「重新发送上次请求」或「放弃上次请求」，待上传提交先核对远端任务头，已是它的提交就直接确认，否则提示核对后点「确认同步过期提交」。分叉恢复通过另存为新任务完成，原任务与 PR 的远端头不被覆盖。同一页面上下文中的云端变更顺序执行，避免 Realtime 更新先于请求确认时阻挡下一操作；账号或团队切换会取消尚未发送的旧上下文操作。

候选包含 B/S/T 的版本、冲突选择、冲突、规则版本和检查，最终结果以相对目标版本 T 的字段级变更保存（浏览器读 `admin_candidates` 的变更，由 T 加变更推导出整份记录）。审批只绑定检查通过的当前候选；撤销审核权后再授权不会复活旧批准。未解除的要求修改与必须处理线程不会被新候选或免审批策略清除。多阶段审批支持人数、阶段审核人和前置阶段。候选尚未生成时，审核者也可对当前来源提交提出要求修改；批准始终要求当前候选及其完整检查通过。

浏览器会话沿用 supabase-js 的默认持久化，写入 `localStorage` 的 `admin-collaboration-auth:<Supabase 地址>` 键，离线冷启动恢复依赖这份缓存。同源页面上的任何脚本注入都能读到其中的 access token 与 refresh token：协作 UI 只用文本节点渲染用户内容，模板使用方新增页面或引入第三方脚本时须保持同等约束并配置 CSP；若改用内存或 `sessionStorage` 存储会话，需要重新验证冷启动离线恢复（ADMIN-US-201 AC#5）。

协作页面的 Service Worker 只缓存静态页面和脚本等资源，不缓存认证、Supabase 读取或命令接口。它以 `/collaboration` 为 scope 注册，不接管应用其余页面，也不与宿主应用在 `/` 注册的 Service Worker 互相顶替；挂载时把当前已加载的资源清单交给它缓存。从其他路由经前端路由进入协作页时，页面本身不受它控制，挂载之后才懒加载的资源要等下次直接打开 `/collaboration` 才会进入缓存。冷启动离线仍须有未过期的验证记录，且只能打开原用户已缓存且未锁定的任务。主动退出立即锁定本机上下文；远端撤权在在线时经撤权事件或重新验证生效。

### 实时：失效通知、撤权与在线状态

每个工作区一个 Realtime **私有频道** `collab:<团队>:<应用>`（`private: true`）。迁移在 `realtime.messages` 上建两条 RLS：select 只允许该团队与应用的可读成员（`extension` 为 broadcast 或 presence），insert 只允许可读成员写 presence（供 Presence 上报）；客户端没有任何写广播的权限，广播只由命令事务写入。Realtime 在加入频道与令牌刷新（`setAuth`）时以登录用户身份试读、试写这张表来鉴权。

- **失效通知**（事件 `changed`）：每条改变状态的命令在事务最后一条语句里把版本行加一，并以新修订号调用 `realtime.send(payload, 'changed', 'collab:<团队>:<应用>', true)`。载荷只有 `revision`、`kinds`（members / policy / schema / tasks / prs / details / shared / notices / audit）、`prIds` 与 `noticeUserIds`（另有 Realtime 自动加的消息 `id`），由写回的行推导（`server/signal.ts`），不含任何业务内容。广播是事务里的一次插入，Realtime 提交后才从 WAL 读到，回滚则不发。客户端据此只重读变化的部分：团队页的类别有变化才重读团队页，否则只读工作区行；点到的 PR 详情标为过期（显示中的照常显示、后台重读）；被点名的成员才重读通知窗口。
- **撤权事件**（事件 `revoked`，载荷 `revision` 与 `userIds`）：成员失去读权限的同一事务里与失效通知一起写入。其他成员把他移出在线列表，他自己的页面立即锁定（与 ADMIN-US-201 AC#7 相同的锁定路径），时限是一次广播的延迟。
- **在线状态**：同一频道的 Realtime Presence，键是页面会话，载荷是 `userId` 与当前查看的 `prId`、`recordId`；只在查看位置变化时上报，订阅成功（含断线重连）后重新上报，不写数据库、不调用命令接口，也不授予任何权限。离开（关闭页面、切换团队、退出、被撤权锁定）即从其他成员的列表消失；网络中断（连接不再收发、也没有关闭握手）时由 Realtime 在连接空闲超时后移除，本机隔离栈实测约 60 秒（原先按 45 秒心跳过期），断网一方的页面约 50 秒后因心跳无应答显示「实时连接暂不可用」并转入重连。可见的在线列表没有变化（重复同步、非成员会话进出）时页面不重绘。显示时只保留当前有效成员；在线载荷是成员自己上报的，只作协作提示（取值经标识格式校验后以文本显示）。
- **版本行保留**：`admin_workspace_versions.revision` 仍是同一工作区写事务的提交顺序。Broadcast 不保证送达，断线期间的消息会丢；客户端靠修订号连续性发现漏收（跳号即整页重读），重连成功或掉线时读一次工作区行，修订号比手里的新就整页重读（补齐），恢复之前不显示已同步之类的结论。广播与版本行加一在同一条语句里（`UPDATE … RETURNING` 之后直接 `realtime.send`），不多一次往返，写事务在版本行上的排队时间与改造前相同，只多一次分区表插入。

## 提交协议与存储

提交就是平台 working-tree 的交换记录（`CommitExchangeRecord`，ADMIN-US-221）：上传、另存分叉与下发传的都是它的 JSON 形态（`serializeCommitExchangeRecord()` 的输出，`createdAt` 是 ISO 串），服务端存的也是它，221-B 的客户端换成平台 working-tree 时不需要再改服务端协议或已存数据。

```ts
{ commitId, parentIds, kind, message, authorId, createdAt, contentFingerprint,
  units: [{ unitId, transactionId, namespace, entity, entityId, operation, patch, inversePatch, origin }] }
```

- **形状与指纹只用平台函数**（`@aiao/rxdb-plugin-working-tree/exchange`：纯函数，不加载实体与运行时，Node 与 Deno 都能跑；Edge 产物经包的 dist 把它打进去）。命令输入逐条经 `parseCommitExchangeRecord()` 严格解析，整批经 `checkCommitExchangeBatch()` 判形状——父先于子、最后一个是新头、都是新头的祖先，父的个数、作者与单元个数合种类，单元九列与两份补丁按操作的有无（插入只有 `patch`，删除只有 `inversePatch`，修改两份都有）；每个提交的内容指纹经 `computeCommitExchangeRecordFingerprint()` 复算，不一致以 `invalid`（「提交指纹与内容不一致」）拒绝整批。平台报的毛病映射到稳定的错误码与中英两份文案（`src/commit.ts`），`details.problem` 原样带上平台的枚举：`empty_batch` 为「一次同步需要 1～100 个提交」，`invalid_parents` / `not_topological` / `unreachable_from_head` 为「提交父链不连续」，`invalid_unit` 为「变更格式错误」，其余（含 JSON 解析的毛病，另带 `path` 与 `commitId`）为「请求字段不合法」。客户端形成提交、服务端合成合并提交与根提交都经 `withFingerprint()` 调平台函数，产品不再有自己的指纹算法。
- **产品规则**（`server/tasks.ts` 的 `acceptChain`）：任务提交必须是 `normal`；第一个新提交的唯一父是任务头（另存分叉是分叉起点），之后每个接上前一个，否则以 `ancestry`（「提交父链不连续」）拒绝；新提交的作者必须是当前用户；同一个提交 ID 重传时指纹一致即幂等（已有祖先不重复写入），指纹不一致（内容或作者变了）以 `idempotency` 拒绝，属于别的任务以 `ancestry` 拒绝。提交 ID、父、作者与单元 ID 用标识字符集（1～128 个字母、数字、下划线或连字符，UUID 都在其中），命名空间与实体是安全标识，消息不超过 10000 字，`createdAt` 是 PostgreSQL 存得下的时刻。合并提交与根提交只由服务端生成。
- **单元能应用到父内容**（`applyVerified`，`src/changes.ts`）：单元的命名空间、实体与字段先按工作区当前清单核对（`assertChangesFit`）；插入的记录原来不存在；修改与删除的记录原来存在、实体相同，修改的 `inversePatch` 里的每个业务字段与原值相同、只出现在 `patch` 里的业务字段原来为空，删除的 `inversePatch` 与原来的整行在两边出现过的每个业务字段上取值相同。核对按落库形态解读（见下）：记录里没有的字段按 NULL 读，系统字段不比。任一项不符整批以 `invalid`（「提交内容与其父提交不一致」）拒绝，什么都不写。父内容只按新提交改动到的记录推导：共同起点时的共享记录加上任务在共同起点之后对这些记录的变更，成本与任务分叉以来的改动有关，与历史长度无关。

**共享分支的根**：初始化在同一个事务里写下一个 `baseline` 提交——没有父、没有作者、没有单元，消息「共享分支起点」，指纹同样由平台函数计算——共享头的初值就是它，工作区行带上它（`admin_workspaces.root`），每个工作区只有一个（部分唯一索引 `commits_root`），重复初始化不再写。任务从根或之后的合并提交起步，提交图里不再有「没有父」的任务提交；还没有合并时头等于根，界面按「空」「空分支」显示，根的内容是空记录表。第二台设备第一次导入共享分支时，链就从这个根开始。

**合并提交**（`server/governance.ts` 的 `mergeCommit`）：`kind: 'merge'`，`parentIds: [合并前的共享头 T, 任务头 S]`，作者是执行合并的成员，消息 `Merge <PR 标题>`，`createdAt` 是合并时刻；单元是候选相对第一父 T 的变更，全部单元共用合并提交的 ID 作 `unitId`（一次合并是一个原子边界），`transactionId` 为 null，`origin` 为 `local`；内容指纹由 `computeCommitExchangeRecordFingerprint()` 计算。合并提交另存它依据的候选（`candidate_id`，产品自己的元数据，不进交换记录与指纹）。两个父必不相同：任务头要么是任务的共同起点（还没有提交，建不了 PR），要么是普通提交，而共享头总是合并提交或根，所以任务头不会等于共享头；合并前仍按 `empty`（「任务没有已同步提交」）守住这一条（平台要求合并提交的父互不相同）。内容推导只沿第一父走：任意提交的内容是根加上第一父链上各提交的单元。

**落库形态**（单元与记录里的取值）：单元是写下它的那台设备的落库形态，服务端原样保存、原样下发，内容指纹覆盖的就是这一份，检查与推导只解读、不归一化。221-B 起团队任务的提交来自平台 working-tree 在 sqlite-wasm 上的捕获，它的形态由代码确定：

| 清单类型                         | SQLite 列（`rxDBColumnTypeToSqliteType`） | 补丁里的取值                                                                                                                                             |
| -------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文本、枚举、UUID、单值关联外键列 | TEXT                                      | 字符串原样；写入时空串转成 NULL（`transformValueJsToSqlite`）                                                                                            |
| 数字 / 整数                      | REAL / INTEGER                            | JSON 数字                                                                                                                                                |
| 布尔                             | INTEGER                                   | `0` / `1`（变更日志触发器 `CASE WHEN col = 1 THEN 1 ELSE 0 END`），NULL 保持 null                                                                        |
| 日期（`PropertyType.date`）      | TEXT                                      | `Date.toISOString()` 的串，例如 `2026-03-01T00:00:00.000Z`；模型驱动表单的日期输入框（`YYYY-MM-DD`）经 rxdb-model 的 `parseDate()` 写成 UTC 零点的这种串 |

代码位置：列类型与写入转换在 `packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts`，变更日志触发器在 `packages/rxdb-adapter-sqlite-core/src/table/trigger_sql.ts`（补丁取列的原值，布尔与 JSON 列另有表达式，主键不进补丁、单元的 `entityId` 就是它；插入的 `patch` 是整行，含为 NULL 的列；修改只带变化了的列；删除的 `inversePatch` 是整行），日期解析在 `packages/rxdb-model/src/entity-value.utils.ts`；working-tree 的捕获把变更日志的补丁原样放进单元，不剔除簿记字段（`ENTITY_BOOKKEEPING_FIELDS`，`packages/rxdb/src/entity/entity-bookkeeping.ts`），导入时修改不回写簿记字段（`packages/rxdb-plugin-working-tree/src/working-tree/projection-actions.ts`）。协作据此这样解读：

- 日期：检查接受以真实存在的 `YYYY-MM-DD` 开头、能解析的串（`decodeDate`），平台的 ISO 串与此前的纯日期都通过；模型驱动表单的日期输入框写成 `YYYY-MM-DDT00:00:00.000Z`，只读面板显示时取日期部分（`client/labels.ts`），匿名数据导入里的 `Date` 同样写成 `toISOString()`。
- 布尔：检查把 `0` / `1` 解码成假 / 真（`decodeBoolean`，`src/checks.ts`），`true` / `false` 照常通过；取值原样保存。
- 缺失与 NULL：设备上每一列都在，没写过的可空列就是 NULL；服务端记录里没有这个键（经命令直接写入的提交没带它、清单后来才加了它）与 NULL 是同一个值，前像核对按此比较（`storedValue`）。
- 系统字段（清单里 `source: 'system'` 的非主键字段，资产实体是 `createdAt`、`updatedAt`、`createdBy`、`updatedBy`）：允许出现在单元与记录里，原样保存与下发；不检查、不进键索引、不参与前像核对，三方合并里从不冲突——来源改过就取来源的，否则取目标的（`mergeRecords`）。记录级的「两边相同」也只看业务字段。

存储（迁移 `202611170001_commit_store.sql`、`202611170002_workspace_tables.sql`、`202611170003_schema_manifests.sql`；只读投影、读取函数与频道策略在 `202611170004_supabase_native.sql`；专用角色在 `202611180001_service_role.sql`；提交表与变更表改成交换格式、提交相关的投影与读取函数、下发接口在 `202611180002_exchange_commits.sql`；审计归档表、合并冷热两表的审计投影与归档函数在 `202611180003_audit_archive.sql`）。迁移全部幂等，可在新结构上整套重跑；`202611180002` 遇到旧结构（提交表还有 `parent_id`）时先清空全部协作数据再改表——产品尚未部署，旧结构的工作区没有根，在新结构下无法继续。工作区不再是一行 JSONB，各集合分表存放，命令只读写它涉及的行：

| 表                                                     | 内容                                                                                                                                                                                                                                                                                                     | 写入方式                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `admin_private.workspaces`                             | 治理行：名称、初始化归属、数据模式版本、当前策略版本                                                                                                                                                                                                                                                     | 只有成员、邀请、策略命令改写   |
| `admin_private.memberships`                            | 成员：权限、授权代次、启用状态；`can_read` 由权限推导，RLS 的 `can_read()` 读它                                                                                                                                                                                                                          | 成员命令（治理行排他锁）       |
| `admin_private.policies` / `invitations`               | 按版本只追加的审批策略；邀请（令牌只存摘要）                                                                                                                                                                                                                                                             | 策略、邀请命令（治理行排他锁） |
| `admin_private.tasks` / `refs`                         | 任务的不可变元数据；共享分支（`shared`）与任务分支（`tasks/<ID>`）的头及修订号                                                                                                                                                                                                                           | 引用只经比较交换推进           |
| `admin_private.prs` / `candidates` / `reviews`         | PR 状态与修订号；不可变候选（含相对 T 的变更）；只追加的审核记录                                                                                                                                                                                                                                         | PR 命令（PR 行排他锁）         |
| `admin_private.threads` / `comments` / `notifications` | 讨论线程与定位；评论；按接收者的站内通知与已读标记                                                                                                                                                                                                                                                       | 讨论命令；通知只追加加已读标记 |
| `admin_private.operations`                             | 幂等回执：操作者、请求指纹、结果与时间，保留 30 天                                                                                                                                                                                                                                                       | 命令事务，过期按批清理         |
| `admin_private.commits` / `commit_changes`             | 完整的交换记录：有序的父（`parent_ids`，按位置展开成 `first_parent` / `merge_parent` 两列，各带外键）、种类、消息、作者（根为 NULL）、记录里的时间与内容指纹，合并提交另带候选；变更表按提交与序号存单元的九列。检查约束：任务提交恰好一个父，合并提交恰好两个不同的父且带候选，根没有父与作者，消息非空 | 只追加                         |
| `public.shared_records`                                | 共享头的记录，每条记录一行；可读成员经 RLS 只读，客户端角色没有任何写权限                                                                                                                                                                                                                                | 只经合并事务                   |
| `admin_private.schemas`                                | 数据模式清单，按版本只追加；治理行的 `schema_version` 指向当前版本                                                                                                                                                                                                                                       | 初始化与 `schema` 命令         |
| `admin_private.record_keys`                            | 共享记录的键索引：唯一字段的取值与单值关联指向的记录，唯一与关联检查按键查询                                                                                                                                                                                                                             | 与共享记录同一合并事务         |
| `public.admin_shared` / `admin_changes`                | 共享头投影；逐记录变更日志（合并前后的整行），合并改动只由它承载                                                                                                                                                                                                                                         | 合并事务                       |
| `public.admin_audit`                                   | 审计事件的热表：只追加，`seq` 给出写入顺序，`pr_id` / `thread_id` 供分页筛选，`created_at` 供按时间选归档对象，均有索引                                                                                                                                                                                  | 命令事务；归档只把旧事件移出   |
| `admin_private.audit_archive`                          | 归档的审计事件：与热表同列（原 `seq` 原样保留）另记归档时间，分页索引相同；客户端与专用角色都不能直接读，经 `admin_audit_events` 读取                                                                                                                                                                    | 只经归档函数（迁移所有者）     |
| `public.admin_workspace_versions`                      | 版本行：全局修订号与审计条数；加一与失效通知广播在同一条语句里                                                                                                                                                                                                                                           | 每个写事务的最后一步           |

锁顺序（`server/scope.ts`）：治理行（普通命令 `FOR SHARE`，成员、邀请、策略与数据模式命令 `FOR UPDATE`）→ PR 行（PR 相关命令 `FOR UPDATE`，按 ID 升序；上传锁住任务名下的全部 PR，因为上传要让它们的候选过期）→ 引用行（上传、建 PR、改 PR 状态锁任务引用；合并先锁共享引用再对任务引用加共享锁；上传、另存分叉、生成候选与带记录的评论对共享引用加共享锁，读共享内容期间合并不能推进）→ 版本行（与广播同一条语句）。所有读取都在取得治理行锁之后发出（读已提交隔离下每条语句取新快照），因此必然看到在此之前提交的撤权。修订号不放在治理行上：普通命令都持治理行共享锁，若再在治理行上加一，两个共享锁持有者都要升级为排他锁，互相等待成死锁；它放在版本行，作为每个写事务提交前的最后一条语句，写事务之间只在这一步排队，持锁时间只覆盖提交本身，其余步骤按各自涉及的行并行（不同任务的上传、不同 PR 的评论互不等待，同一 PR 上的命令按 PR 行串行）。版本行的修订号按提交顺序递增，随失效通知广播（见「实时」）。上传锁定任务名下的 PR 之后、取得任务引用之前若有人在这个任务上建了 PR，上传会发现 PR 集合变了，整体回滚重试；死锁、序列化失败与并发插入同一主键同样整体重试（最多 4 次），第二次就按对方已提交的结果裁决。引用推进按期望头比较交换，比较交换失败时任务引用报 `diverged`（附 `remoteHead`，与客户端已有的「任务已分叉」处理一致），共享引用报 `stale`。

引擎仍是纯函数，不碰存储：仓储先按命令加载并锁定它涉及的行，拼成只含这些行的局部工作区状态（`scope.ts`），让引擎做授权与状态校验并声明所需提交数据（`plan`），按声明预加载（`content.ts`），再把数据交给引擎裁决，最后把局部状态的差异（`state-changes.ts`）与返回的新提交、共享记录改动写回，全部在同一个事务里。内存实现（测试用）走同一套加载、差异与写回，引擎用例因此也检验每条命令加载的范围是否够用。内容由变更推导，成本只与所问内容有关：

- 上传：只按命令里的提交 ID 查一次已存在的提交（指纹相等与归属校验），新 ID 不可能成环（父必须已存在，外键也守着），不做祖先链的环检测；父内容只按新提交改动到的记录推导（见上），读取任务头到共同起点的路径与这几条记录的变更；另存分叉再读一次原任务头到共同起点的路径。
- 共享头 T 取自 `shared_records`；合并基 B 由 T 反向应用共享分支上 B 之后各合并提交的 `inversePatch` 得到；任务头 S 由 B 加任务分支在 B 之后的变更得到；任意提交的内容同理（浏览器经读取函数走提交图，用同一份 `src/derive.ts` 推导）。
- 候选与合并只读合并基以来任一侧改动过的记录（`server/merge-inputs.ts`）：共享分支在合并基之后各合并提交的变更、任务分支在合并基之后各提交的变更，涉及的记录就是改动过的记录；T 只读这些记录，B 由 T 反向应用共享分支上的变更得到，S 由 B 加上任务的变更得到，其余记录三方相同、合并结果就是 T。三方合并（`mergeRecords`）只在改动过的记录上进行，检查按清单定向进行（`checks.ts` 的 `checkMerged`），结果与在整份合并结果上检查（`checkRecords`）完全一致，见下文「数据模式清单」。合并把候选的变更应用到共享头，生成以 T 为第一父、S 为第二父的合并提交，同一事务里推进共享引用、更新 `shared_records`、键索引与 `admin_shared.head`，并把改动记录的前后值写进 `admin_changes`。命令结果、回执与审计详情不再带这些前后值（`result.changes` 已移除），审计因此不随单次合并的改动量增长。合并基是根（第一次合并之前起步的任务）时 B 没有记录，T 的每条记录都算改动过。
- 返回的记录表按记录标识排序，冲突按记录与字段标识排序，结果只取决于内容。

## 团队任务：团队库与 working-tree

团队任务的草稿落在平台 working-tree 上（ADMIN-US-221）：编辑、保存、提交、放弃、恢复、另存与跨设备续作都用平台的 API，协作包只负责与服务端交换提交和界面状态。代码在 `src/client/team-database.ts`（团队库的打开与约定）、`team-tasks.ts`（本机动作）、`task-ledger.ts`（本机任务账本）与 `task-view.ts`（任务状态与动作）。

- **团队库**：应用经 `mountCollaboration` 的 `createTeamDatabase` 提供工厂，按「用户 × 团队 × 应用」返回一个尚未初始化的 RxDB（应用实体的克隆、与匿名工作台相同的 sqlite-wasm `vfs: 'idb'`、history 插件、`context.userId` 是真实用户、`SyncType.None`），库名用 `teamDatabaseName(前缀, 作用域)`：前缀加作用域的 80 位散列。不把三项原样拼进库名，是因为 sqlite-wasm 的 IndexedDB 文件系统路径上限 64 字节（`mxPathname`，回滚日志文件名 `<库名>@0_1.sqlite.db-journal` 要放得下，库名至多 41 个字符），而且带冒号的库名会被当成 URL 协议。协作包在连接前装上 working-tree 插件并 `enableIfEmpty()`（`enable()` 是库级、不可逆的开关，所以团队库与匿名工作台分库）；第一次打开任务时打开团队库，切换团队、退出、锁定时先卸载编辑界面再关库，库里的数据保留。
- **分支**：`main` 是共享分支的镜像，只经 `importCommits()` 推进，用户不在上面编辑；每个任务是一条分支（`task/<任务>/<随机后缀>`），从任务的共同起点（`main` 上的共享提交）`createBranchFromCommit()` 建出，再导入任务在服务端已有的提交——第二台设备上的提交 ID、父链与作者因此与服务端一致（ADMIN-US-206 AC#2），工作树是干净的，导入的提交不会被记成拉取者的提交。打开任务就是切到它的分支；同一个团队库同一时刻只编辑一个任务。
- **下发**：`CollaborationReader.exchange()` 一页一页读（`known` 是本机当前头，`more` 时把这一页的头加进去接着读），每一页原样交给 `importCommits()`；第一次导入从服务端的根开始，换掉本机启用时写下的基线。
- **状态**：未保存是表单里还没点「保存」的输入，属于应用的编辑界面；已保存未提交是工作树里的条目（`status().entryCount`）；已提交未同步是远端头之后的本机提交；三者都没有即已同步。任务视图把后三种分开显示，并列出共同起点之后的本机提交（ID、作者、第一父、是否已同步）。团队库的每次本地写入都会触发一次任务状态重读（工作树没有变更流）。
- **未保存的输入**（ADMIN-US-205 AC#5）：应用把模型驱动 `EntityList` 交出的未保存状态（React `onDirtyChange`、Angular `dirtyChange`、Vue `dirty-change`）转给 `renderEditor` 上下文里的 `reportDirty`。有的时候任务视图在三种状态之外另起一行「有未保存的输入」；窗口上注册 `beforeunload`，关闭、刷新或跳走之前浏览器先问一句，没有了就撤下（`src/client/unsaved-input.ts`）；控制器拦下会卸载编辑界面或改写任务的动作——同步、另存、拉取远端、放弃草稿、切换团队、打开或新建任务、导入、恢复、重放上次请求与退出——提示先在编辑界面里保存或取消（输入在应用的对话框里，协作包没法替用户保存）。会话失效引起的锁定拦不住（安全优先）：编辑界面随之卸载，面板说明其中还没保存的输入已丢弃。只认当前打开着的编辑界面的报告，卸载时列表补报的 `false` 与迟到的报告都不再算数。
- **同步**：工作树有条目时先 `commit()`（作者是当前用户，消息是任务名），再按批上传远端头之后的本机提交（每批至多 100 个、请求不超过 4 MiB，与服务端的上限是同一个常量）。待确认的上传记进本机任务账本（`localStorage` 里每个用户一个键，只有幂等键、远端头与这批的最后一个提交等元数据，没有任何记录取值），重试交出同一个幂等键与同一批提交；离线时只形成提交、排队等联网。服务端报分叉时提示另存为新任务：`fork` 命令带上远端头之后的本机提交，新任务在本机从原任务分支的头另起分支；原任务之后「拉取远端版本」时从远端头另起一条分支再导入（平台不改写历史，原分支留作新任务的来源）。刷新页面之后才确认的另存（按原幂等键重放、回执已接受）同样落地：先按联网验证打开原任务（新会话里它还没解锁），再从它的分支头另起新任务的分支；本机账本里已经没有原任务时不在本机落地，新任务打开时按服务端的提交导入。
- **放弃与恢复**：放弃草稿是 `discard()`，业务表逐行退回任务头（US-317），列表与表单随即读到任务头的数据。从历史版本创建恢复草稿是从当前共享头新建任务，在它的分支上 `restore()` 到所选的共享提交，差异成为未提交改动，之后照常同步、审核与合并；共享头与历史都不动。平台的拒绝成因（侧枝上的提交 `side_branch_target`、不可达、工作树不干净等）映射到协作词条。
- **匿名数据导入**：预览确认之后新建任务，把匿名记录按引用顺序（被引用的实体在前，`importOrder()`）作为普通编辑写进任务分支，经捕获进入工作树；不提交、不上传。一次导入至多 10000 条记录（单个提交的变更上限），超过的在预览时就不能确认。
- **离线**：团队库与本机提交都在 IndexedDB 里，刷新后仍在；退出账号锁定账本里该用户的全部任务（团队库保留），离线冷启动只解锁联网验证过、未锁定的任务。打开任务（团队库懒加载 sqlite-wasm）之后，离线外壳把新加载的资源再缓存一次。

## 数据模式清单

协作包不含任何实体特定的代码：记录的实体与字段白名单、必填、类型、枚举、数值范围、日期、唯一与关联约束都来自工作区的数据模式清单（`SchemaManifest`）。

- **格式**：`{ schemaVersion, entities }`。`schemaVersion` 是从 1 开始的整数；`entities` 是应用实体经平台 `describeEntityFields()` 得到的字段描述（`EntityFieldsDescriptor`，`dtoVersion` 1）。服务端与客户端都用 `parseSchemaManifest()`（`src/schema.ts`）严格解析：顶层只认这两个键，字段描述交给平台的 `parseEntityFieldsDescriptor()`；另要求实体名唯一、实体名与字段名是安全标识、单值关联的目标在清单里、记录字段只用协作能承载的类型（文本、枚举、UUID、数字、整数、布尔、日期；数组、键值、JSON 等类型的字段会让整份清单被拒绝）。
- **记录字段**：每个实体的普通属性，加上单值关联（1:1、m:1）写在记录里的外键字段（`writeField`，即关联名加 `Id`），按清单顺序；系统字段、计算属性与 1:m / m:n 关联不进记录。
- **存放**：产品的清单在 `rxdb-admin-template/schema/collaboration-schema.json`，三端应用各有一条一致性用例（`src/app/entities/schema-manifest.spec.ts`）断言它就是本端实体定义的 `describeEntityFields()` 输出。改了实体定义就重新生成这份文件并提高 `schemaVersion`。
- **登记**：初始化登记第一个版本；之后由有成员管理权限的成员发 `schema` 命令（`{ type: 'schema', schema, expectedVersion }`）登记更高的版本，版本按 `admin_private.schemas` 只追加。新版本必须让共享分支当前的全部记录通过检查，否则以 `checks` 拒绝，`details.checks` 是前 100 条违规明细（实体不在清单里报在 `$record` 上），`details.total` 是总数；登记成功后已有候选随之过期，键索引按新清单重建。审计详情不收录清单全文。
- **读取**：只读投影 `admin_schemas` 按版本返回登记过的清单；客户端按团队页里的 `schemaVersion` 读取并按版本缓存，用于只读面板与匿名数据导入。团队任务的编辑界面与形成提交不读清单：实体与字段来自应用注册在团队库里的实体元数据。
- **检查**（`src/checks.ts`）：每条记录依次查必填 → 唯一 → 关联 → 取值，同一阶段按清单的字段顺序，记录按标识排序。取值交给平台的 `validateFieldValue()`；记录里的日期是 JSON 文本，先按 `YYYY-MM-DD` 开头、能解析、且是真实存在的日子严格解码成 `Date`，其余取值一律判为无效日期。平台规则标识映射到协作词条（中英两份都在 `messages.ts`），平台的中文固定文案不直接显示：

  | 规则                                   | 文案                                                                                                      |
  | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
  | 必填（缺失、null、空串或只有空白）     | 文本类「必填文本不能为空」，日期「日期不能为空」，其他「必填项不能为空」                                  |
  | 唯一                                   | 标题字段（第一个必填文本属性）「名称必须唯一」，其他「取值必须唯一」；按记录标识排在第一的持有者不报      |
  | 关联（外键缺失或悬空）                 | 「关联记录不存在」；可空（nullable）且非必填的关联允许为空；删除仍被引用的记录，报错落在引用方            |
  | type / number / integer                | 「必须为文本」「必须为布尔值」「必须为数字」「必须为整数」                                                |
  | range                                  | 下界为 0 时「必须为非负数」，其余「数值小于允许的最小值」「数值大于允许的最大值」「数值不在允许的刻度上」 |
  | date / enum                            | 「日期无效」「取值不在允许范围内」                                                                        |
  | email / phone / url / urlScheme / uuid | 「邮箱格式无效」「电话号码格式无效」「链接格式无效」「链接协议不受支持」「标识格式无效」                  |

- **定向检查**：共享分支 T 总是通过检查（合并只接受检查通过的候选，登记新清单也要求全部通过），所以只有改动过的记录与受它们牵连的未改动记录可能出错：与改动记录共用唯一键的记录，以及引用了可能消失或换了实体的记录的记录。这些按键索引 `admin_private.record_keys` 查询（`kind` 为 `unique` 时 `value` 是规范化取值，为 `reference` 时是目标记录标识，`(team_id, app_id, kind, value)` 有索引），由合并事务与共享记录同步维护，不扫全表。仓储按候选取值的超集预读这些键与记录，检查用到没有预读的键或记录按内部错误处理。
- **扩展检查**：特殊业务检查由部署入口注入：`new CollaborationRepository(pool, { checks })`（`server/main.ts` 里标出了位置），`checks` 是 `RecordCheck`（`checks.ts`）——拿到这次合并改动过的记录（相对 T 的前后整行）与当前清单，返回追加的检查；候选与合并重新核对时都会执行，结果进候选，任一条都让候选不能批准与合并。默认没有。它不参与登记新清单时的全量校验。
- **界面**：团队任务的编辑界面由应用渲染（`mountCollaboration` 的 `renderEditor`）：三端用各自的模型驱动组件（rxdb-model 的 `EntityList` 与表单）渲染团队库的实体列表，实体与字段的标签来自实体元数据，协作包不认识任何具体实体（ADMIN-US-221 AC#4）。只读面板（共享数据、提交与候选的内容、导入预览）按清单渲染，标签由宿主应用经 `labels` 提供（中文原文，经协作词条表翻译），不提供时实体显示实体名、字段显示清单里声明的显示名。匿名数据导入（`readAnonymousRecords`）只读清单里的实体与记录字段。

## 读取：public 下的只读投影

浏览器不经协作服务读取。迁移 `202611170004_supabase_native.sql` 与 `202611180002_exchange_commits.sql` 在 public 下建只读投影（视图以所有者身份读私有表，可见条件写在视图里：`admin_private.can_read()` 成员资格，通知与回执另限本人，邀请另限管理者；`security_barrier` 防止调用方的筛选先于这些条件求值），浏览器经 PostgREST 按团队与应用筛选、按写入顺序分页读取（`src/reader.ts`、`src/read-source.ts`）。只授予 authenticated 的 SELECT；anon 无权，任何写入都被拒；不暴露邀请令牌摘要、请求指纹与初始化密钥；提交的内容指纹不在投影里，只随下发接口交出（导入方要复算核对）。跨团队、跨应用、被撤权的读取返回空。

| 投影 / 函数                                                                                                                   | 内容                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `admin_workspaces`                                                                                                            | 本人可读的工作区：名称、数据模式版本、当前策略（版本与阶段）、共享头、修订号、审计总数、共享分支的根                     |
| `admin_members` / `admin_invitations`                                                                                         | 有效成员；邀请（只对管理者，无令牌摘要）                                                                                 |
| `admin_tasks` / `admin_prs`                                                                                                   | 任务与任务头；PR 列表元数据                                                                                              |
| `admin_candidates` / `admin_reviews` / `admin_threads` / `admin_comments`                                                     | PR 详情：候选（摘要与相对目标版本的变更）、审核、讨论与评论                                                              |
| `admin_notifications` / `admin_receipts`                                                                                      | 本人的通知；本人的、保留期内的幂等回执（只有操作 ID 与结果）                                                             |
| `admin_commits` / `admin_schemas`                                                                                             | 提交元数据（交换记录去掉单元与内容指纹：父、种类、作者、消息、时间，合并提交另带候选）；登记过的数据模式清单             |
| `admin_audit_events`                                                                                                          | 审计事件：热表 `admin_audit` 与归档表合在一起（两支各按成员资格判定），审计分页与最近一窗读它，归档前后结果相同          |
| `shared_records`、`admin_shared`、`admin_audit`、`admin_changes`、`admin_workspace_versions`                                  | 此前已有的 RLS 公开表（`admin_audit` 只有热表里的审计，归档之后的完整审计读 `admin_audit_events`）                       |
| `admin_shared_records()`、`admin_commit_path()`、`admin_commit_lineage()`、`admin_commit_history()`、`admin_commit_changes()` | 读取函数：同一条语句读出共享头与共享记录、沿第一父走提交图、按提交读单元；返回 JSON，不受行数上限截断，不可读时返回 NULL |
| `admin_commit_exchange()`                                                                                                     | 下发接口：已知提交之后到分支头的交换记录（见下），可见范围与其余读取函数相同                                             |

- **团队页**只读工作区行、成员、邀请、最近 50 个 PR、本人最近 50 个任务（另带这些 PR 的来源任务与当前草稿的任务）与本人最近 50 条通知（另读未读总数），体积不随讨论、审核、通知与提交的条数增长，更早的 PR、任务与通知各有「加载更早的…」入口。读取先发工作区行，其余部分都不早于其中的修订号。
- **PR 详情**（候选、冲突、检查、审核、讨论与评论，阻塞意见与阶段进度按 `src/approval.ts` 的同一份规则推导）在打开 PR 时才读，失效通知点到它时重读；**审计时间线**在展开时才读最近 50 条，更早的按游标分页；**提交与候选内容**由提交图在浏览器里推导（与服务端同一份 `src/derive.ts`），推导时核对共享头，已变化即按「版本已变化」等下一次刷新。
- **下发接口** `admin_commit_exchange(p_team_id, p_app_id, p_ref, p_known, p_limit)`（浏览器经 `CollaborationReader.exchange(workspace, branch, known, limit?)` 调用，`branch` 是 `{ branch: 'shared' }` 或 `{ taskId }`）：`p_ref` 是 `shared` 或 `tasks/<任务 ID>`，`p_known` 是客户端已有的提交（它们连同全部祖先都不再下发，不认识的忽略——只可能是还没上传的本地提交），返回 `{ head, more, commits }`：`head` 是分支此刻的头，`commits` 是这一页的交换记录 JSON，顺序就是平台 `importCommits()` 收的批次——父先于子，最后一个是这一页的头，合并提交经第二父带进来的任务提交（侧枝）排在它前面，侧枝归到最早把它带进来的那个合并提交。每页 1～100 个提交（默认 100），只在分支第一父链上的提交处断开，合并提交与它的侧枝不拆开（一组本身超过上限时这一页就是这一组）；`more` 为 true 时把这一页的头加进已知提交接着读。`reader.exchange` 逐条经平台的 `parseCommitExchangeRecord()` 解析，不可读报 `forbidden`，任务不存在报 `not_found`。集成测试把它的输出原样交给 `checkCommitExchangeBatch()` 并逐个复算指纹（`read-projections.integration.spec.ts`），三端浏览器测试经 PostgREST 再验一次（`e2e/collaboration.spec.ts`）。
- PostgREST 的 `max-rows` 不得小于 500（Supabase 默认 1000）：读取按 500 行一页，不足一页即认为读完。
- 读取全部不加锁、不写库：投影与读取函数都是 STABLE 的只读查询。PostgREST 或 Realtime 暂不可用时，已解锁的任务照常本地编辑与排队，同步在读取失败时停止并提示，不伪报成功；恢复后按修订号补齐。

协作服务只保留三个接口：`GET /config`（公开配置）、`GET /health`（健康检查，见下文「健康检查与错误监控」）与 `POST /workspaces/:teamId/:appId/commands`（命令）；此前的摘要、记录、提交、候选、历史、审计、数据模式与回执读接口都已删除。

### 健康检查与错误监控

两个入口都有 `GET /health`（不要求令牌，`server/health.ts`）：并行探测数据库（以命令入口自己的连接池、专用角色读一行治理表，连通、认证与授权都在其中）与 Auth（带公开 key 访问 `<SUPABASE_URL>/auth/v1/health`），每项 3 秒时限；全部可用回 200，任一不可用回 503。响应是 `{ status, entry, release, checks: { database, auth } }`，每项只有状态、耗时与可公开的原因（`timeout` / `error` / `status`，以及 SQLSTATE、系统错误码或 HTTP 状态），不带连接串、密钥、令牌或错误原文。

未处理错误（请求处理中抛出的非业务错误，回 500 `internal`）与连接池里空闲连接的错误交给可插拔的上报器（`server/monitor.ts`，装配时可经 `collaborationRuntime(env, entry, { reporter })` 注入）：默认总是写一行 `ADMIN_ERROR <JSON>` 到函数日志 / 标准错误，配置了 `ADMIN_ERROR_REPORT_URL` 时另 POST 给收集器（2 秒超时，投递失败只记一行原因）。报告只带时刻、入口、发布标识、来源、请求的方法与路径（不含查询串、请求头与请求体）、错误名、消息、SQLSTATE、详情与堆栈，全部先脱敏：去掉 JWT、`Bearer` / `Basic` 凭据、Supabase API key、URL 里的口令、`token` / `password` / `secret` / `apikey` / `otp` 等键值、邮箱（含受邀邮箱）、32 位以上的十六进制串与 6～10 位数字（验证码），保留 UUID 标识、SQLSTATE 与堆栈行列号；SQL 文本与绑定参数从不进入报告（`monitor.spec.ts`）。部署、监控接入与演练见 [部署与运维手册](../../deploy/README.md)。

浏览器端的 `CollaborationController` 按需读取并缓存这些内容：提交与候选不可变，按 ID 缓存；共享数据按团队页的 `head` 缓存，`head` 变化即失效；提交历史（`commitHistory`，共享分支或 PR 的来源任务）按分支与头缓存已读的页，头变化即从第一页重读，`loadEarlierCommits` 读更早的一页；讨论线程的处理历史随工作区修订号失效；同一 ID 的并发读取只发一次请求。同步读取（`commitContent`、`candidateContent`、`prDetail`、`sharedRecords`、`commitHistory`、`threadEvents`、`auditEvents`）未命中时返回 `undefined` 并在后台加载，加载完成后派发 `change`，界面先显示「正在加载」占位；预览匿名数据导入用 `loadSharedRecords` 与 `loadSchema` 先等内容加载完成；打开任务、拉取远端版本、另存分叉与恢复历史版本不读提交内容，而是经下发接口把提交导入团队库（见「团队任务：团队库与 working-tree」）。失败会提示一次，之后不自动重试，下一次刷新或用户操作再试。「历史与审计」按时间正序分页列出共享分支的合并提交（每页 50 个，最前面可加载更早的提交），PR「提交」页签从新到旧分页列出来源任务的提交；每个提交、候选和审计时间线都只在 `<details>` 展开时才生成并加载内容，共享提交展开后另显示它的字段级变更表；尚未打开过的内容离线时不可用。

## 验证

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:test
NX_NO_CLOUD=true pnpm nx run admin-collaboration:test-integration
NX_NO_CLOUD=true pnpm nx run admin-collaboration:e2e
NX_NO_CLOUD=true pnpm nx run admin-collaboration:e2e -c edge
NX_NO_CLOUD=true DENO_BIN=~/.deno/bin/deno pnpm nx run admin-collaboration:test-deno
NX_NO_CLOUD=true pnpm nx run-many -t typecheck,lint -p admin-collaboration
```

**已部署目标**（ADMIN-US-217 AC#5）：`ADMIN_E2E_TARGET=deployed` 时（Nx 目标 `admin-collaboration:e2e-deployed`），三端都打部署出的前端地址（`ADMIN_E2E_WEB_URLS`），不起 `browser-server.mjs`，只起 `scripts/deployed-fixtures.mjs`：账号与验证码经部署栈的 Auth 管理接口（service key），工作区经初始化步骤（迁移所有者连接），邀请经部署出的命令入口、令牌来自真实的验证码登录；两种目标的夹具是同一份实现（`scripts/e2e-fixtures.mjs`）。这个目标下另有 `rls`（PostgREST 与 Realtime 层的 RLS 矩阵，`e2e/deployed-rls.spec.ts`）、`otp-<端>`（真实发信的验证码登录与过期）与 `smoke-<端>`（回滚后的冒烟）几个项目。对本地预演栈跑用 `pnpm nx run rxdb-admin-template:e2e-local`（见 [部署与运维手册](../../deploy/README.md)）。

`test-integration` 里的命令契约测试（`contract.integration.spec.ts`）对 Node 入口与 Edge Function 入口各跑一遍同一套用例并要求结果逐项一致：两个入口都以专用角色经 transaction 模式的 PgBouncer 连一个干净的临时库，Edge Function 跑在按线上限额起的 `supabase/edge-runtime` 容器里。`e2e -c edge`（即 `ADMIN_E2E_COMMANDS=edge`）让三端的命令改打本机 Edge Function，不起任何 Node 协作服务。`test-deno` 把 `identity.spec.ts` 原样打包，先用 `deno test`、再在 Edge Runtime 的 worker 里各跑一遍。

容量基准用同一镜像的临时 PostgreSQL，随提交数增长记录普通命令耗时、单次命令 WAL、治理行与各行大小、团队页（经只读投影读取，含各部分字节数）与提交历史页的体积，以及并发读取时写命令的等待；参数见 [脚本](scripts/workspace-growth-benchmark.mjs) 开头（`BENCH_SHARED=1` 先合并出 `BENCH_RECORDS` 条共享记录，`BENCH_COMMANDS` 选择要测的普通命令，`BENCH_BULK` 是每个测量点「上传一个改动多少条记录的提交」与「生成候选并合并这些改动」的改动条数，默认 100，结果在 `upload100Ms`、`candidateMerge100Ms` 与 `bulkChanges`），`BENCH_OUT` 指定结果文件，历次结果存于 [需求证据目录](../../requirements/plans/evidence/)：

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:benchmark-growth
```

数据库集成测试使用临时 Docker PostgreSQL（`supabase/postgres` 镜像），先按本机隔离栈里 Realtime v2.102.3 建出的定义装上 `realtime.messages`、`realtime.topic()` 与 `realtime.send()`（`server/realtime-fixture.ts`），再执行全部迁移，验证 RLS 矩阵、广播、并发头比较与事务失败回滚；读取以 authenticated 角色加 JWT 声明经与 PostgREST 等价的读取源（`server/pg-read.ts`）走浏览器同一个 `CollaborationReader`。三端浏览器测试的拓扑与生产一致：命令入口（默认 Node 协作服务，`edge` 模式为 Edge Function 容器）以专用角色直接连本机隔离 Supabase 栈自己的 PostgreSQL（迁移、专用角色口令与初始化由测试服务以迁移所有者执行），浏览器经该栈的 PostgREST 读取、经它的 Realtime 收私有频道的广播与在线状态，身份按该栈的 HS256 共享密钥本地验签。隔离栈的数据库端口没有发布到宿主机，测试服务在本机开一个 TCP 端口，经 `docker exec … nc` 原样转发字节（只是传输）。验证码由 Auth 的管理测试接口生成，再由真实 `verifyOtp` 验证，因此不代表生产 SMTP 投递已验收。每个用例的团队 ID 随机，结束时删除本轮建的团队的全部行与测试账号；共享 Supabase 测试栈可用 `rxdb-adapter-supabase:test-env-down` 关闭。

每次请求最多 4 MiB、单任务最多 10000 条记录、单次最多 100 个提交、单个提交最多 10000 个单元。超限明确拒绝；资产体量的记录改动一万条约 2.3 MiB，更宽的记录可能先撞到字节上限。Node 服务收完请求头最多等 10 秒、收完整个请求最多等 120 秒，超时返回 408 并断开连接；连接数上限、限流与 TLS 由部署环境的反向代理负责（Edge Function 由 Supabase 平台负责）。

命令只加载、锁定并写回它涉及的行，单条命令的耗时与 WAL 不随工作区的历史长度增长；回执保留 30 天并在写事务中按批清理。审计只追加、不改写，热表 `public.admin_audit` 按策略归档（ADMIN-US-217 AC#6）：迁移所有者执行 `nx run admin-collaboration:audit-archive`（读 `ADMIN_OWNER_DATABASE_URL`），`ADMIN_AUDIT_ARCHIVE_AFTER_DAYS`（正整数天数）与 `ADMIN_AUDIT_KEEP_LATEST`（每个工作区热表保留的最新条数，0 为一条不留）至少给一个，满足任一条件的事件按 `seq` 从旧到新、每批至多 `ADMIN_AUDIT_ARCHIVE_BATCH`（默认 5000）行移入 `admin_private.audit_archive`，直到一批不满。每批是一次 `admin_private.archive_audit()` 调用：同一条语句里删除再插入，每一列（含原 `seq`）原样保留，跳过被其他事务锁住的行，重跑幂等，可定期执行（例如 pg_cron 每天一次）；归档函数只授予迁移所有者，客户端与专用角色都不能调用。只读投影 `admin_audit_events` 合并两张表，审计分页（含按 PR、按线程筛选与游标）与最近一窗在归档前后读到相同的结果，审计总数（`audit_count`）不变（`audit-archive.integration.spec.ts`）。旧版前端只读热表，归档要在读这个投影的前端上线之后才启用。通知不修剪，按用户分页读取（团队页只带最近 50 条与未读总数）；其余运维护栏由 [ADMIN-US-217](../../requirements/stories/collaboration/ADMIN-US-217-production-deployment-operations.md) 承接。

产品故事与未完成验收以 `../../requirements/plans/collaboration-implementation.md` 为准；本包存在并不意味着所有 AC 已通过或功能已合入。
