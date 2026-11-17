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

然后使用可信服务端环境执行一次初始化，额外提供 `SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_INITIAL_USER_ID`、`ADMIN_TEAM_ID`、`ADMIN_APP_ID`、`ADMIN_TEAM_NAME`、`ADMIN_BOOTSTRAP_KEY`，以及 `ADMIN_SCHEMA_FILE`（数据模式清单文件，产品的清单是 `rxdb-admin-template/schema/collaboration-schema.json`，见下文「数据模式清单」）。初始用户必须已在 Supabase 验证邮箱；初始化只创建空共享分支、管理员、默认审批策略和第一个数据模式版本，不导入样例数据。

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:bootstrap
NX_NO_CLOUD=true pnpm nx run admin-collaboration:serve-api
```

初始化参数与稳定键一致时返回既有团队，不重置策略、权限与数据模式（新版本经 `schema` 命令登记）。浏览器没有初始化接口，也不得获得数据库连接或 service role key。

## 状态与事务

本地数据库名和索引均包含用户、团队、应用、任务。编辑器输入先保存到任务工作树；点击同步时，不可变提交与 outbox 在同一 IndexedDB 事务里写入。提交只含「上次提交的内容」到「当前已保存内容」之间逐字段的差异（`ChangeSet`，见下），带 UUIDv7 提交 ID 与内容指纹；上传期间的后续保存留在下一份工作树中。任务同步保留提交 ID、父链与作者，不把通用实体推拉当成提交图复制，失败与超时重试复用同一个提交 ID 与内容。

服务端按固定顺序只锁命令涉及的行（见「提交协议与存储」的锁顺序），先校验当前身份与权限，再执行命令。提交、候选、审批、阻塞讨论、成员与策略变更共享这一裁决顺序：成员、邀请与策略命令对治理行加排他锁，其余命令加共享锁，撤权因此要等在途的批准、合并与评论提交，撤权提交之后的命令一律按撤权后的成员关系裁决。只有 `merge` 能更新共享业务数据；共享头、数据、逐记录变更日志、PR、合并提交、候选关联、策略快照和审计在同一个 PostgreSQL 事务中落地。所有普通客户端角色都只能按 RLS 读取公开投影，不能直接写入。

每次业务命令有稳定幂等键。回执保留 30 天（`receiptRetentionMs`）：期内用原操作 ID 重试返回原结果；过期回执由之后的写事务顺手清理（每个写事务最多 20 条，最旧的先清），过期后同一 ID 按新请求裁决，提交仍按提交 ID 去重，不会重复建提交。上传 outbox 持久化原请求；其他尚未确认的请求保留在当前用户的会话存储中，并提供回执查询与原请求重试入口；两者都记下首次发出的时间，超过自动重试期限（比回执保留期早一天，留出时钟偏差）仍未确认时不再自动重发：查不到回执的普通请求交给用户选择「重新发送上次请求」或「放弃上次请求」，待上传提交先核对远端任务头，已是它的提交就直接确认，否则提示核对后点「确认同步过期提交」。分叉恢复通过另存为新任务完成，原任务与 PR 的远端头不被覆盖。同一页面上下文中的云端变更顺序执行，避免 Realtime 更新先于请求确认时阻挡下一操作；账号或团队切换会取消尚未发送的旧上下文操作。

候选包含 B/S/T 的版本、冲突选择、冲突、规则版本和检查，最终结果以相对目标版本 T 的字段级变更保存（`GET .../candidates/:id` 由 T 加变更推导出整份记录）。审批只绑定检查通过的当前候选；撤销审核权后再授权不会复活旧批准。未解除的要求修改与必须处理线程不会被新候选或免审批策略清除。多阶段审批支持人数、阶段审核人和前置阶段。候选尚未生成时，审核者也可对当前来源提交提出要求修改；批准始终要求当前候选及其完整检查通过。

浏览器会话沿用 supabase-js 的默认持久化，写入 `localStorage` 的 `admin-collaboration-auth:<Supabase 地址>` 键，离线冷启动恢复依赖这份缓存。同源页面上的任何脚本注入都能读到其中的 access token 与 refresh token：协作 UI 只用文本节点渲染用户内容，模板使用方新增页面或引入第三方脚本时须保持同等约束并配置 CSP；若改用内存或 `sessionStorage` 存储会话，需要重新验证冷启动离线恢复（ADMIN-US-201 AC#5）。

协作页面的 Service Worker 只缓存静态页面和脚本等资源，不缓存认证或产品 API。它以 `/collaboration` 为 scope 注册，不接管应用其余页面，也不与宿主应用在 `/` 注册的 Service Worker 互相顶替；挂载时把当前已加载的资源清单交给它缓存。从其他路由经前端路由进入协作页时，页面本身不受它控制，挂载之后才懒加载的资源要等下次直接打开 `/collaboration` 才会进入缓存。冷启动离线仍须有未过期的验证记录，且只能打开原用户已缓存且未锁定的任务。主动退出立即锁定本机上下文；远端撤权在在线重新验证时生效。Presence 每 15 秒更新，45 秒过期，不授予操作权限。`admin_workspace_versions` 表通过 Supabase Realtime 发送版本失效通知，接收后重新调用受服务端授权的 API；切换团队、离线任务或退出时撤销旧频道。正式部署须让协作 API 的 `ADMIN_DATABASE_URL` 指向该 Supabase 项目的 PostgreSQL，并启用迁移中的 publication。

## 提交协议与存储

提交是字段级变更的列表，形状对齐平台 working-tree 的 `CommitChangeSet`：`{ namespace, entity, entityId, operation, patch, inversePatch }`。`insert` 的 `patch` 是整行字段、`inversePatch` 为 null；`update` 的 `patch` 只含变更字段的新值、`inversePatch` 含这些字段的旧值（只在 `patch` 里出现的字段是新增字段，只在 `inversePatch` 里出现的是被移除的字段）；`delete` 的 `patch` 为 null、`inversePatch` 是整行。`namespace` 是实体在数据模式清单里的命名空间，实体、命名空间与字段都按工作区当前的清单核对。

提交 ID 使用 UUIDv7。客户端对规范化（键排序）的 `parent`、`authorId`、`message`、`changes` 用 `crypto.subtle` 计算 SHA-256 指纹随提交上传，服务端重新计算，不一致以 `invalid` 拒绝整批；同一个提交 ID 重传时指纹一致则幂等（已有祖先不重复写入、不能改写作者），不一致或不属于该任务则拒绝。上传的提交不能带合并关联，合并提交由服务端在合并时生成并补算指纹。

上传时服务端还核对每个新提交都能按顺序应用到它的父内容上：新增的记录原来不存在；修改与删除的记录原来存在、实体相同，`inversePatch` 与原值一致（修改只核对它列出的字段，并要求只出现在 `patch` 里的新增字段原来不存在；删除的 `inversePatch` 必须就是原来的整行）。任一项不符整批以 `invalid`（「提交内容与其父提交不一致」）拒绝，什么都不写。父内容只按新提交改动到的记录推导：共同起点时的共享记录（共享头反向应用之后的合并）加上任务在共同起点之后对这些记录的变更，成本与任务分叉以来的改动有关，与历史长度无关。

存储（迁移 `202611170001_commit_store.sql`、`202611170002_workspace_tables.sql`、`202611170003_schema_manifests.sql`）。工作区不再是一行 JSONB，各集合分表存放，命令只读写它涉及的行：

| 表                                                     | 内容                                                                                 | 写入方式                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------ |
| `admin_private.workspaces`                             | 治理行：名称、初始化归属、数据模式版本、当前策略版本                                 | 只有成员、邀请、策略命令改写   |
| `admin_private.memberships`                            | 成员：权限、授权代次、启用状态；`can_read` 由权限推导，RLS 的 `can_read()` 读它      | 成员命令（治理行排他锁）       |
| `admin_private.policies` / `invitations`               | 按版本只追加的审批策略；邀请（令牌只存摘要）                                         | 策略、邀请命令（治理行排他锁） |
| `admin_private.tasks` / `refs`                         | 任务的不可变元数据；共享分支（`shared`）与任务分支（`tasks/<ID>`）的头及修订号       | 引用只经比较交换推进           |
| `admin_private.prs` / `candidates` / `reviews`         | PR 状态与修订号；不可变候选（含相对 T 的变更）；只追加的审核记录                     | PR 命令（PR 行排他锁）         |
| `admin_private.threads` / `comments` / `notifications` | 讨论线程与定位；评论；按接收者的站内通知与已读标记                                   | 讨论命令；通知只追加加已读标记 |
| `admin_private.operations`                             | 幂等回执：操作者、请求指纹、结果与时间，保留 30 天                                   | 命令事务，过期按批清理         |
| `admin_private.commits` / `commit_changes`             | 提交元数据（父指针带索引、作者、说明、合并关联、内容指纹）；按提交与序号的字段级变更 | 只追加                         |
| `public.shared_records`                                | 共享头的记录，每条记录一行；可读成员经 RLS 只读，客户端角色没有任何写权限            | 只经合并事务                   |
| `admin_private.schemas`                                | 数据模式清单，按版本只追加；治理行的 `schema_version` 指向当前版本                   | 初始化与 `schema` 命令         |
| `admin_private.record_keys`                            | 共享记录的键索引：唯一字段的取值与单值关联指向的记录，唯一与关联检查按键查询         | 与共享记录同一合并事务         |
| `public.admin_shared` / `admin_changes`                | 共享头投影；逐记录变更日志（合并前后的整行），合并改动只由它承载                     | 合并事务                       |
| `public.admin_audit`                                   | 审计事件：只追加，`seq` 给出写入顺序，`pr_id` / `thread_id` 供分页筛选，均有索引     | 命令事务                       |
| `public.admin_workspace_versions`                      | 版本行：全局修订号与审计条数，Realtime 经它通知版本变化                              | 每个写事务的最后一步           |

锁顺序（`server/scope.ts`）：治理行（普通命令 `FOR SHARE`，成员、邀请、策略与数据模式命令 `FOR UPDATE`）→ PR 行（PR 相关命令 `FOR UPDATE`，按 ID 升序；上传锁住任务名下的全部 PR，因为上传要让它们的候选过期）→ 引用行（上传、建 PR、改 PR 状态锁任务引用；合并先锁共享引用再对任务引用加共享锁；上传、另存分叉、生成候选、带记录的评论与在线状态对共享引用加共享锁，读共享内容期间合并不能推进）→ 版本行。所有读取都在取得治理行锁之后发出（读已提交隔离下每条语句取新快照），因此必然看到在此之前提交的撤权。修订号不放在治理行上：普通命令都持治理行共享锁，若再在治理行上加一，两个共享锁持有者都要升级为排他锁，互相等待成死锁；它放在版本行，作为每个写事务提交前的最后一条语句，写事务之间只在这一步排队，持锁时间只覆盖提交本身，其余步骤按各自涉及的行并行（不同任务的上传、不同 PR 的评论互不等待，同一 PR 上的命令按 PR 行串行）。版本行的修订号按提交顺序递增，与摘要内容取自同一份快照。上传锁定任务名下的 PR 之后、取得任务引用之前若有人在这个任务上建了 PR，上传会发现 PR 集合变了，整体回滚重试；死锁、序列化失败与并发插入同一主键同样整体重试（最多 4 次），第二次就按对方已提交的结果裁决。引用推进按期望头比较交换，比较交换失败时任务引用报 `diverged`（附 `remoteHead`，与客户端已有的「任务已分叉」处理一致），共享引用报 `stale`。

引擎仍是纯函数，不碰存储：仓储先按命令加载并锁定它涉及的行，拼成只含这些行的局部工作区状态（`scope.ts`），让引擎做授权与状态校验并声明所需提交数据（`plan`），按声明预加载（`content.ts`），再把数据交给引擎裁决，最后把局部状态的差异（`state-changes.ts`）与返回的新提交、共享记录改动写回，全部在同一个事务里。内存实现（测试用）走同一套加载、差异与写回，引擎用例因此也检验每条命令加载的范围是否够用。内容由变更推导，成本只与所问内容有关：

- 上传：只按命令里的提交 ID 查一次已存在的提交（指纹相等与归属校验），新 ID 不可能成环，不做祖先链的环检测；父内容只按新提交改动到的记录推导（见上），读取任务头到共同起点的路径与这几条记录的变更；另存分叉再读一次原任务头到共同起点的路径。
- 共享头 T 取自 `shared_records`；合并基 B 由 T 反向应用共享分支上 B 之后各合并提交的 `inversePatch` 得到；任务头 S 由 B 加任务分支在 B 之后的变更得到；任意提交的内容同理（`GET .../commits/:id`）。
- 候选与合并只读合并基以来任一侧改动过的记录（`server/merge-inputs.ts`）：共享分支在合并基之后各合并提交的变更、任务分支在合并基之后各提交的变更，涉及的记录就是改动过的记录；T 只读这些记录，B 由 T 反向应用共享分支上的变更得到，S 由 B 加上任务的变更得到，其余记录三方相同、合并结果就是 T。三方合并（`mergeRecords`）只在改动过的记录上进行，检查按清单定向进行（`checks.ts` 的 `checkMerged`），结果与在整份合并结果上检查（`checkRecords`）完全一致，见下文「数据模式清单」。合并把候选的变更应用到共享头，生成以 T 为父的合并提交，同一事务里推进共享引用、更新 `shared_records`、键索引与 `admin_shared.head`，并把改动记录的前后值写进 `admin_changes`。命令结果、回执与审计详情不再带这些前后值（`result.changes` 已移除），审计因此不随单次合并的改动量增长。合并基为空（第一次合并之前起步的任务）时 B 没有记录，T 的每条记录都算改动过。
- 返回的记录表按记录标识排序，冲突按记录与字段标识排序，结果只取决于内容。

## 数据模式清单

协作包不含任何实体特定的代码：记录的实体与字段白名单、必填、类型、枚举、数值范围、日期、唯一与关联约束都来自工作区的数据模式清单（`SchemaManifest`）。

- **格式**：`{ schemaVersion, entities }`。`schemaVersion` 是从 1 开始的整数；`entities` 是应用实体经平台 `describeEntityFields()` 得到的字段描述（`EntityFieldsDescriptor`，`dtoVersion` 1）。服务端与客户端都用 `parseSchemaManifest()`（`src/schema.ts`）严格解析：顶层只认这两个键，字段描述交给平台的 `parseEntityFieldsDescriptor()`；另要求实体名唯一、实体名与字段名是安全标识、单值关联的目标在清单里、记录字段只用协作能承载的类型（文本、枚举、UUID、数字、整数、布尔、日期；数组、键值、JSON 等类型的字段会让整份清单被拒绝）。
- **记录字段**：每个实体的普通属性，加上单值关联（1:1、m:1）写在记录里的外键字段（`writeField`，即关联名加 `Id`），按清单顺序；系统字段、计算属性与 1:m / m:n 关联不进记录。
- **存放**：产品的清单在 `rxdb-admin-template/schema/collaboration-schema.json`，三端应用各有一条一致性用例（`src/app/entities/schema-manifest.spec.ts`）断言它就是本端实体定义的 `describeEntityFields()` 输出。改了实体定义就重新生成这份文件并提高 `schemaVersion`。
- **登记**：初始化登记第一个版本；之后由有成员管理权限的成员发 `schema` 命令（`{ type: 'schema', schema, expectedVersion }`）登记更高的版本，版本按 `admin_private.schemas` 只追加。新版本必须让共享分支当前的全部记录通过检查，否则以 `checks` 拒绝，`details.checks` 是前 100 条违规明细（实体不在清单里报在 `$record` 上），`details.total` 是总数；登记成功后已有候选随之过期，键索引按新清单重建。审计详情不收录清单全文。
- **读取**：`GET /workspaces/:teamId/:appId/schemas/:version` 返回登记过的版本；客户端按摘要里的 `schemaVersion` 读取并按版本缓存，打开任务时把清单存进本机草稿，离线时编辑器与形成提交都用草稿里的清单。
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
- **界面**：任务编辑器按草稿的清单逐个实体渲染记录表，字段、输入框类型与关联下拉都来自清单；实体与字段的标签由宿主应用经 `mountCollaboration` 的 `labels` 提供（中文原文，经协作词条表翻译），不提供时实体显示实体名、字段显示清单里声明的显示名。匿名数据导入（`readAnonymousRecords`）只读清单里的实体与记录字段。

## 读取接口

读取接口都只读：要求成员有 read 权限（被移除或不在团队内返回 403，未登录或邮箱未验证返回 401），基于已提交版本读取，不加锁、不写库，不会排在进行中的写事务后面。工作区摘要不含记录，记录与更早的审计按需读取：

| 接口                                                   | 返回                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `GET /workspaces/:teamId/:appId`                       | 工作区摘要，见下                                                                        |
| `GET /workspaces/:teamId/:appId/records`               | `{ head, records }`：共享分支当前的全部记录，`head` 与摘要的 `head` 一致才与摘要匹配    |
| `GET /workspaces/:teamId/:appId/history`               | `{ commits, nextBefore }`：提交元数据分页（从新到旧，不含变更），参数见下               |
| `GET /workspaces/:teamId/:appId/commits/:id`           | 提交元数据、它自身的字段级变更 `changes` 与推导出的 `records`；未知 ID 返回 `not_found` |
| `GET /workspaces/:teamId/:appId/candidates/:id`        | 含 `records` 的合并候选（由 T 加存储的变更推导）；未知 ID 返回 `not_found`              |
| `GET /workspaces/:teamId/:appId/schemas/:version`      | 登记过的数据模式清单（版本只追加、不可修改）；未登记的版本返回 `not_found`              |
| `GET /workspaces/:teamId/:appId/audit`                 | `{ events, nextBefore }`：审计事件按时间从新到旧分页，参数见下                          |
| `GET /workspaces/:teamId/:appId/receipts/:operationId` | 幂等回执：`{ status: 'accepted', value }` 或 `{ status: 'unknown' }`，只能读自己的      |

摘要（`WorkspaceSummary`）包含成员、审批策略、任务、PR、审核、讨论、在线成员、治理状态与当前用户自己的通知；邀请只对有 manage 权限者非空。摘要不含提交元数据（经提交历史分页读取），候选去掉 `records` 但保留来源、目标、冲突选择、冲突与检查结果，共享数据只有 `head`，审计只含最近 50 条（时间正序）并附总数 `auditCount`。摘要体积与记录数、提交数都无关，合并事件的审计详情也不再带改动记录的前后值；它仍随任务、PR、讨论、审核与本人通知的条数增长，这些的分页读取由 ADMIN-US-219 的 RLS 直读承接。

提交历史分页参数：`branch=shared`（共享分支，只有合并提交）、`taskId`（任务分支，从任务头走到它的共同起点，不含）、`prId`（该 PR 的来源任务）三者恰好取一；`before` 是上一页的 `nextBefore`，从它的父提交接着往前读；`limit` 为 1～100 的整数，默认 50。还有更早的提交时 `nextBefore` 是本页最旧提交的 ID，否则为 `null`。只沿父指针读本页的提交，成本只与页大小有关；未知的任务、PR 或游标返回 `not_found`，选择器缺失或重复、范围外的 `limit`、未知参数返回 `invalid`。

审计分页参数：`before` 是游标事件 ID，只返回比它更早的事件，游标事件本身不必匹配筛选；`limit` 为 1～100 的整数，默认 50；`prId` 只返回与该 PR 相关的事件（PR 命令本身及属于该 PR 的讨论线程上的事件）；`threadId` 只返回该线程的创建、回复、编辑与解决事件，两者同时给出时取交集。还有更早的匹配事件时 `nextBefore` 是本页最旧事件的 ID，作为下一页的 `before`，否则为 `null`。未知游标返回 `not_found`，范围外的 `limit`、重复或未知的参数返回 `invalid`。

浏览器端的 `CollaborationController` 按需读取并缓存这些内容：提交与候选不可变，按 ID 缓存；共享数据按摘要的 `head` 缓存，`head` 变化即失效；提交历史（`commitHistory`，共享分支或 PR 的来源任务）按分支与摘要里的头缓存已读的页，头变化即从第一页重读，`loadEarlierCommits` 读更早的一页，第一页与摘要的头对不上时按版本已变化处理、等下一次刷新；讨论线程的处理历史随工作区修订号失效；同一 ID 的并发读取只发一次请求。同步读取（`commitContent`、`candidateContent`、`sharedRecords`、`commitHistory`、`threadEvents`）未命中时返回 `undefined` 并在后台加载，加载完成后派发 `change`，界面先显示「正在加载」占位；需要内容才能执行的操作（打开任务、拉取远端版本、另存分叉、从历史版本创建恢复草稿、预览匿名数据导入）用 `loadCommit`、`loadSharedRecords` 等异步入口先等内容加载完成。失败会提示一次，之后不自动重试，下一次刷新或用户操作再试。「历史与审计」按时间正序分页列出共享分支的合并提交（每页 50 个，最前面可加载更早的提交），PR「提交」页签从新到旧分页列出来源任务的提交；每个提交、候选和审计时间线都只在 `<details>` 展开时才生成并加载内容，共享提交展开后另显示它的字段级变更表；尚未打开过的内容离线时不可用。

## 验证

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:test
NX_NO_CLOUD=true pnpm nx run admin-collaboration:test-integration
NX_NO_CLOUD=true pnpm nx run admin-collaboration:e2e
NX_NO_CLOUD=true pnpm nx run-many -t typecheck,lint -p admin-collaboration
```

容量基准用同一镜像的临时 PostgreSQL，随提交数增长记录普通命令耗时、单次命令 WAL、治理行与各行大小、摘要（含各字段字节数）与提交历史页的体积，以及并发读取时写命令的等待；参数见 [脚本](scripts/workspace-growth-benchmark.mjs) 开头（`BENCH_SHARED=1` 先合并出 `BENCH_RECORDS` 条共享记录，`BENCH_COMMANDS` 选择要测的普通命令，`BENCH_BULK` 是每个测量点「上传一个改动多少条记录的提交」与「生成候选并合并这些改动」的改动条数，默认 100，结果在 `upload100Ms`、`candidateMerge100Ms` 与 `bulkChanges`），`BENCH_OUT` 指定结果文件，历次结果存于 [需求证据目录](../../requirements/plans/evidence/)：

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:benchmark-growth
```

数据库集成测试使用临时 Docker PostgreSQL，验证 RLS、并发头比较与事务失败回滚。三端浏览器测试使用工作区隔离的 Supabase Auth 和临时 PostgreSQL；测试脚本把工作区版本与成员读取权限投影同步至隔离 Supabase CI 数据库，以验证真实 Realtime 通知，业务记录仍留在临时 PostgreSQL。正式部署使用同一 Supabase 数据库，不需要这段测试桥接。验证码由 Auth 的管理测试接口生成，再由真实 `verifyOtp` 验证，因此不代表生产 SMTP 投递已验收。测试运行后移除临时数据库；共享 Supabase 测试栈可用 `rxdb-adapter-supabase:test-env-down` 关闭。

每次请求最多 2 MiB、单任务最多 10000 条记录、单次最多 100 个提交。超限明确拒绝。协作 API 收完请求头最多等 10 秒、收完整个请求最多等 60 秒，超时返回 408 并断开连接；连接数上限、限流与 TLS 由部署环境的反向代理负责。摘要接口不下发记录、提交元数据与完整审计，提交历史按页读取。

命令只加载、锁定并写回它涉及的行，单条命令的耗时与 WAL 不随工作区的历史长度增长；回执保留 30 天并在写事务中按批清理。审计只追加、不删除，按 `seq` 分页读取，归档另行设计；通知不修剪，摘要返回当前用户的全部通知，按用户分页读取由 ADMIN-US-219 承接；审计归档与运维护栏由 [ADMIN-US-217](../../requirements/stories/collaboration/ADMIN-US-217-production-deployment-operations.md) 承接。

产品故事与未完成验收以 `../../requirements/plans/collaboration-implementation.md` 为准；本包存在并不意味着所有 AC 已通过或功能已合入。
