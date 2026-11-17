# 产品协作包

`@rxdb-admin-template/collaboration` 是三个工作台复用的产品私有包，不发布到 npm。React、Angular、Vue 都在 `/collaboration` 懒加载同一套任务、讨论与审核交互；原匿名资产工作台、数据库名称与连接前恢复入口保持独立。

## 运行方式

协作服务是一个 Node.js 服务，使用 Supabase 验证每次请求的真实身份，并通过 PostgreSQL 事务修改协作状态。浏览器只使用 Supabase 的公开 key 和本产品 HTTP API。部署时将 `/collaboration-api/*` 转发到协作服务；开发时三个应用已有代理，默认指向 `127.0.0.1:8088`，可用 `ADMIN_API_URL` 更改开发代理目标。

服务端环境变量：

| 变量                                | 用途                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| `SUPABASE_URL`                      | Supabase 项目地址                                              |
| `SUPABASE_ANON_KEY`                 | 公开 anon / publishable key；服务端启动时拒绝 service role key |
| `ADMIN_DATABASE_URL`                | 仅服务端使用的 PostgreSQL 连接，具有产品迁移表的事务写入权限   |
| `ADMIN_ALLOWED_ORIGINS`             | 允许的工作台来源，逗号分隔，含协议与端口                       |
| `ADMIN_API_PORT` / `ADMIN_API_HOST` | 默认 `8088` / `127.0.0.1`                                      |

邮箱登录需要在 Supabase 配置邮件发送服务，并将 passwordless 邮件模板配置为显示 `{{ .Token }}` 验证码。允许创建认证账号不等于授予团队成员关系；新用户必须接受匹配其已验证邮箱的邀请。邀请链接把团队、应用、邀请标识与一次性令牌放在 URL fragment（`#join=…`）里，浏览器不会把它发给服务器，也不会写进代理日志或 Referer；服务端只保存令牌摘要，审计详情不含受邀邮箱。

先应用迁移（按文件名顺序执行 `supabase/migrations/` 下的全部文件，每个文件幂等，可重复执行）：

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:migrate
```

然后使用可信服务端环境执行一次初始化，额外提供 `SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_INITIAL_USER_ID`、`ADMIN_TEAM_ID`、`ADMIN_APP_ID`、`ADMIN_TEAM_NAME`、`ADMIN_BOOTSTRAP_KEY`。初始用户必须已在 Supabase 验证邮箱；初始化只创建空共享分支、管理员和默认审批策略，不导入样例数据。

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:bootstrap
NX_NO_CLOUD=true pnpm nx run admin-collaboration:serve-api
```

初始化参数与稳定键一致时返回既有团队，不重置策略与权限。浏览器没有初始化接口，也不得获得数据库连接或 service role key。

## 状态与事务

本地数据库名和索引均包含用户、团队、应用、任务。编辑器输入先保存到任务工作树；点击同步时，不可变提交与 outbox 在同一 IndexedDB 事务里写入。提交只含「上次提交的内容」到「当前已保存内容」之间逐字段的差异（`ChangeSet`，见下），带 UUIDv7 提交 ID 与内容指纹；上传期间的后续保存留在下一份工作树中。任务同步保留提交 ID、父链与作者，不把通用实体推拉当成提交图复制，失败与超时重试复用同一个提交 ID 与内容。

服务端按团队/应用锁定状态行，先校验当前身份与权限，再执行命令。提交、候选、审批、阻塞讨论、成员与策略变更共享这一裁决顺序。只有 `merge` 能更新共享业务数据；共享头、数据、逐记录变更日志、PR、合并提交、候选关联、策略快照和审计在同一个 PostgreSQL 事务中落地。所有普通客户端角色都只能按 RLS 读取公开投影，不能直接写入。

每次业务命令有稳定幂等键。上传 outbox 持久化原请求；其他尚未确认的请求保留在当前用户的会话存储中，并提供回执查询与原请求重试入口。分叉恢复通过另存为新任务完成，原任务与 PR 的远端头不被覆盖。同一页面上下文中的云端变更顺序执行，避免 Realtime 更新先于请求确认时阻挡下一操作；账号或团队切换会取消尚未发送的旧上下文操作。

候选包含 B/S/T 的版本、冲突选择、冲突、规则版本和检查，最终结果以相对目标版本 T 的字段级变更保存（`GET .../candidates/:id` 由 T 加变更推导出整份记录）。审批只绑定检查通过的当前候选；撤销审核权后再授权不会复活旧批准。未解除的要求修改与必须处理线程不会被新候选或免审批策略清除。多阶段审批支持人数、阶段审核人和前置阶段。候选尚未生成时，审核者也可对当前来源提交提出要求修改；批准始终要求当前候选及其完整检查通过。

浏览器会话沿用 supabase-js 的默认持久化，写入 `localStorage` 的 `admin-collaboration-auth:<Supabase 地址>` 键，离线冷启动恢复依赖这份缓存。同源页面上的任何脚本注入都能读到其中的 access token 与 refresh token：协作 UI 只用文本节点渲染用户内容，模板使用方新增页面或引入第三方脚本时须保持同等约束并配置 CSP；若改用内存或 `sessionStorage` 存储会话，需要重新验证冷启动离线恢复（ADMIN-US-201 AC#5）。

协作页面的 Service Worker 只缓存静态页面和脚本等资源，不缓存认证或产品 API。它以 `/collaboration` 为 scope 注册，不接管应用其余页面，也不与宿主应用在 `/` 注册的 Service Worker 互相顶替；挂载时把当前已加载的资源清单交给它缓存。从其他路由经前端路由进入协作页时，页面本身不受它控制，挂载之后才懒加载的资源要等下次直接打开 `/collaboration` 才会进入缓存。冷启动离线仍须有未过期的验证记录，且只能打开原用户已缓存且未锁定的任务。主动退出立即锁定本机上下文；远端撤权在在线重新验证时生效。Presence 每 15 秒更新，45 秒过期，不授予操作权限。`admin_workspace_versions` 表通过 Supabase Realtime 发送版本失效通知，接收后重新调用受服务端授权的 API；切换团队、离线任务或退出时撤销旧频道。正式部署须让协作 API 的 `ADMIN_DATABASE_URL` 指向该 Supabase 项目的 PostgreSQL，并启用迁移中的 publication。

## 提交协议与存储

提交是字段级变更的列表，形状对齐平台 working-tree 的 `CommitChangeSet`：`{ namespace, entity, entityId, operation, patch, inversePatch }`。`insert` 的 `patch` 是整行字段、`inversePatch` 为 null；`update` 的 `patch` 只含变更字段的新值、`inversePatch` 含这些字段的旧值（只在 `patch` 里出现的字段是新增字段，只在 `inversePatch` 里出现的是被移除的字段）；`delete` 的 `patch` 为 null、`inversePatch` 是整行。`namespace` 目前固定为 `assets`。

提交 ID 使用 UUIDv7。客户端对规范化（键排序）的 `parent`、`authorId`、`message`、`changes` 用 `crypto.subtle` 计算 SHA-256 指纹随提交上传，服务端重新计算，不一致以 `invalid` 拒绝整批；同一个提交 ID 重传时指纹一致则幂等（已有祖先不重复写入、不能改写作者），不一致或不属于该任务则拒绝。上传的提交不能带合并关联，合并提交由服务端在合并时生成并补算指纹。

存储（迁移 `202611170001_commit_store.sql`）：

| 表                             | 内容                                                                                           | 写入方式     |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | ------------ |
| `admin_private.workspaces`     | 成员、任务、PR、候选（含相对 T 的变更）、审核、讨论、回执、审计与共享头 `head`；不含提交与记录 | 命令事务     |
| `admin_private.commits`        | 提交元数据：父指针（带索引）、作者、说明、合并关联、内容指纹，按追加顺序编号                   | 只追加       |
| `admin_private.commit_changes` | 按提交与序号存放的字段级变更                                                                   | 只追加       |
| `public.shared_records`        | 共享头的记录，每条记录一行；可读成员经 RLS 只读，客户端角色没有任何写权限                      | 只经合并事务 |
| `public.admin_shared`          | 只保留共享头                                                                                   | 合并事务     |

引擎仍是纯函数，不碰存储：仓储先让引擎做授权与状态校验并声明所需数据（`plan`），按声明预加载（`content.ts`），再把数据交给引擎裁决，最后把返回的新提交与共享记录改动写回，全部在同一个事务里。内容由变更推导，成本只与所问内容有关：

- 上传：只按命令里的提交 ID 查一次已存在的提交（指纹相等与归属校验），新 ID 不可能成环，不再沿祖先链回溯；另存分叉再读一次原任务头到共同起点的路径。
- 共享头 T 取自 `shared_records`；合并基 B 由 T 反向应用共享分支上 B 之后各合并提交的 `inversePatch` 得到；任务头 S 由 B 加任务分支在 B 之后的变更得到；任意提交的内容同理（`GET .../commits/:id`）。
- 候选与合并沿用 `mergeRecords` / `checkRecords`，候选时加载完整的 T，成本与记录数相关、与提交数无关；合并把候选的变更应用到共享头，生成以 T 为父的合并提交，同一事务里更新 `shared_records` 与 `admin_shared.head`，`admin_changes` 投影照旧。
- 返回的记录表按记录标识排序，冲突按记录与字段标识排序，结果只取决于内容。

## 读取接口

读取接口都只读：要求成员有 read 权限（被移除或不在团队内返回 403，未登录或邮箱未验证返回 401），基于已提交版本读取，不加锁、不写库，不会排在进行中的写事务后面。工作区摘要不含记录，记录与更早的审计按需读取：

| 接口                                                   | 返回                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `GET /workspaces/:teamId/:appId`                       | 工作区摘要，见下                                                                     |
| `GET /workspaces/:teamId/:appId/records`               | `{ head, records }`：共享分支当前的全部记录，`head` 与摘要的 `head` 一致才与摘要匹配 |
| `GET /workspaces/:teamId/:appId/commits/:id`           | 含 `records` 的提交（由字段级变更推导）；未知 ID 返回 `not_found`                    |
| `GET /workspaces/:teamId/:appId/candidates/:id`        | 含 `records` 的合并候选（由 T 加存储的变更推导）；未知 ID 返回 `not_found`           |
| `GET /workspaces/:teamId/:appId/audit`                 | `{ events, nextBefore }`：审计事件按时间从新到旧分页，参数见下                       |
| `GET /workspaces/:teamId/:appId/receipts/:operationId` | 幂等回执：`{ status: 'accepted', value }` 或 `{ status: 'unknown' }`，只能读自己的   |

摘要（`WorkspaceSummary`）包含成员、审批策略、任务、PR、审核、讨论、在线成员、治理状态与当前用户自己的通知；邀请只对有 manage 权限者非空。提交只含元数据（`id`、`parent`、`authorId`、`message`，合并提交另有 `mergeSource`、`candidateId`），候选去掉 `records` 但保留来源、目标、冲突选择、冲突与检查结果，共享数据只有 `head`，审计只含最近 50 条（时间正序）并附总数 `auditCount`。摘要体积只随提交数线性增长（每个提交约 0.2 KB，与记录数无关）；合并事件的审计详情带着被合并改动记录的前后值（`result.changes`），所以这 50 条的体积还会随单次合并的改动量增长。

审计分页参数：`before` 是游标事件 ID，只返回比它更早的事件，游标事件本身不必匹配筛选；`limit` 为 1～100 的整数，默认 50；`prId` 只返回与该 PR 相关的事件（PR 命令本身及属于该 PR 的讨论线程上的事件）；`threadId` 只返回该线程的创建、回复、编辑与解决事件，两者同时给出时取交集。还有更早的匹配事件时 `nextBefore` 是本页最旧事件的 ID，作为下一页的 `before`，否则为 `null`。未知游标返回 `not_found`，范围外的 `limit`、重复或未知的参数返回 `invalid`。

浏览器端的 `CollaborationController` 按需读取并缓存这些内容：提交与候选不可变，按 ID 缓存；共享数据按摘要的 `head` 缓存，`head` 变化即失效；讨论线程的处理历史随工作区修订号失效；同一 ID 的并发读取只发一次请求。同步读取（`commitContent`、`candidateContent`、`sharedRecords`、`threadEvents`）未命中时返回 `undefined` 并在后台加载，加载完成后派发 `change`，界面先显示「正在加载」占位；需要内容才能执行的操作（打开任务、拉取远端版本、另存分叉、从历史版本创建恢复草稿、预览匿名数据导入）用 `loadCommit`、`loadSharedRecords` 等异步入口先等内容加载完成。失败会提示一次，之后不自动重试，下一次刷新或用户操作再试。历史与审计里每个提交、候选和审计时间线都只在 `<details>` 展开时才生成并加载内容；尚未打开过的内容离线时不可用。

## 验证

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:test
NX_NO_CLOUD=true pnpm nx run admin-collaboration:test-integration
NX_NO_CLOUD=true pnpm nx run admin-collaboration:e2e
NX_NO_CLOUD=true pnpm nx run-many -t typecheck,lint -p admin-collaboration
```

容量基准用同一镜像的临时 PostgreSQL，随提交数增长记录普通命令耗时、单次命令 WAL、工作区行与快照体积，以及并发读取时写命令的等待；参数见 [脚本](scripts/workspace-growth-benchmark.mjs) 开头，`BENCH_OUT` 指定结果文件，历次结果存于 [需求证据目录](../../requirements/plans/evidence/)：

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:benchmark-growth
```

数据库集成测试使用临时 Docker PostgreSQL，验证 RLS、并发头比较与事务失败回滚。三端浏览器测试使用工作区隔离的 Supabase Auth 和临时 PostgreSQL；测试脚本把工作区版本与成员读取权限投影同步至隔离 Supabase CI 数据库，以验证真实 Realtime 通知，业务记录仍留在临时 PostgreSQL。正式部署使用同一 Supabase 数据库，不需要这段测试桥接。验证码由 Auth 的管理测试接口生成，再由真实 `verifyOtp` 验证，因此不代表生产 SMTP 投递已验收。测试运行后移除临时数据库；共享 Supabase 测试栈可用 `rxdb-adapter-supabase:test-env-down` 关闭。

首版协议使用完整记录快照，每次请求最多 2 MiB、单任务最多 10000 条记录、单次最多 100 个提交。超限明确拒绝。协作 API 收完请求头最多等 10 秒、收完整个请求最多等 60 秒，超时返回 408 并断开连接；连接数上限、限流与 TLS 由部署环境的反向代理负责。摘要接口已不下发记录与完整审计，但提交元数据仍随摘要整体下发；提交数很大时的元数据分页与历史存储分区仍须另行实现，不能通过跳过校验或截断提交解决。

工作区状态以每个团队/应用一行 JSONB 保存：每个命令复制完整状态并整行更新；幂等回执、审计与通知目前不修剪，摘要返回当前用户的全部通知与最近 50 条审计（完整审计经分页接口读取），但每次读取仍要加载完整状态、每个命令还要整行重写它，长期运行后单次操作的成本会随之增长。回执保留期、审计归档与存储拆分由 [ADMIN-US-217](../../requirements/stories/collaboration/ADMIN-US-217-production-deployment-operations.md) 承接，上线长期运行前必须完成。

产品故事与未完成验收以 `../../requirements/plans/collaboration-implementation.md` 为准；本包存在并不意味着所有 AC 已通过或功能已合入。
