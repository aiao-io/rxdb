---
id: US-216
title: 参考后端以 RxDB 引擎实现：后端可初始化 RxDB、前后端共享 schema 与查询逻辑
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-08-29
updated: 2026-08-29
tags: [adapter, http, server, node, pglite, shared-domain]
---

<!--
INVEST 检查清单:
- [x] Independent: 前置 US-212 / US-213 / US-214 / US-215 / US-023 全部 Done。本故事只动 `apps/` 下两个 demo 项目 + 新建共享模块，不改 `packages/` 生产代码
- [x] Negotiable: 共享模块位置与命名、阶段 B 的 SSE 接线细节、pglite 落盘路径可协商；「wire 协议逐字不变（server.spec.ts + dev-rxdb-http-e2e 全绿）」「前端行为零变化」不可协商
- [x] Valuable: 今天协议语义有两份实现（后端手写 SQL vs 引擎 RuleGroup 编译），靠 README 一句话互相拉齐；后端拿不到 RxDB 的类型安全仓储与 rxjs 查询能力，照抄 http-protocol.md 实现后端的开发者只能复制 SQL
- [x] Estimable: 阶段 A / B 各自可估（A ≈ 共享模块 + 全端点迁移，B ≈ SSE 事件驱动 + 控制端点 + 落盘）
- [x] Small: 体量偏大，按「大故事分阶段」拆 A / B（同一文件、同一条状态）
- [x] Testable: server.spec.ts 端点级契约 + dev-rxdb-http-e2e 17 条是验收主体（US-213 套件测的是适配器 vs 其自有 reference-server，本故事不触碰，只作回归）；每条 AC 都有可执行的用例
-->

# 用户故事：参考后端以 RxDB 引擎实现

## 作为/我想要/以便

**作为** 照 [http-protocol.md](../../../website/docs/adapters/http-protocol.md) 实现自己后端、并希望在后端复用 RxDB 查询能力的开发者
**我想要** 参考后端本身就是「后端初始化 RxDB」的活样板——七个协议端点由 RxDB 的 Repository / EntityManager 实现、SSE 变更通知由 RxDB 事件驱动、Recipe 实体与前端共享同一份 schema 定义
**以便** 协议语义不再由两份实现各自维护，且我能照抄这个后端：同一套实体定义、同一个 `repo.find()` 查询方法、同一段 rxjs 组合计算，在前后端两端都能执行

## 问题现状

### 病灶一：协议语义有两份实现，靠 README 一句话互相拉齐

后端把 RuleGroup 手写翻译成 SQL：`compileRuleGroup` 在
[rule-group-to-sql.ts](../../../apps/dev-rxdb-http-server/src/rule-group-to-sql.ts)，七个端点的 SQL 在
[recipes-store.ts](../../../apps/dev-rxdb-http-server/src/recipes-store.ts)（如 `ORDER BY updatedAt, id`，
[recipes-store.ts:22](../../../apps/dev-rxdb-http-server/src/recipes-store.ts#L22)）。
而同一份 RuleGroup 语义在引擎里另有实现（`rxdb-adapter-sqlite-core` 的 `buildRuleGroup`）。两份实现的拉齐方式写在
[参考后端 README:65](../../../apps/dev-rxdb-http-server/README.md#L65)：

> `contains` 用 `instr` / `substr` 而不是 `LIKE`，因此**大小写敏感**——与 `rxdb-adapter-sqlite-core` 的本地实现一致。
> QueryCache 下客户端会用同一份 `where` 再过滤一遍本地缓存，两边语义必须逐字对齐，否则会出现「远端给了、本地滤掉」的空列表。

任何一次引擎语义演进都要在这个文件上再手工复刻一遍；任何一次漏改都是「远端给了、本地滤掉」的空列表。

### 病灶二：schema 也存了两份

Recipe 的字段定义在前端实体类 [recipe.ts](../../../apps/dev-rxdb-http/src/app/recipe.ts)
（`@Entity({ name: 'Recipe', tableName: 'recipes', properties: [...] })`），在后端是
[config.ts](../../../apps/dev-rxdb-http-server/src/config.ts) 的 `RECIPE_COLUMNS` 白名单。
字段名被协议文档的示例 curl 钉死，改一处漏一处，文档里的示例就成了跑不通的伪代码。
（[recipe.ts:33](../../../apps/dev-rxdb-http/src/app/recipe.ts#L33) 的实体级 `sync: { type: SyncType.QueryCache, ... }`
与白名单并列，见 D1 的拆法。）

### 病灶三：「后端不能初始化 RxDB」这个前提并不存在

核心包 [@aiao/rxdb](../../../packages/rxdb/package.json) 的依赖只有 `rxjs` / `uuid` / `type-fest` / `@aiao/utils`，
零 DOM 依赖；查询面全部是 Observable——`Repository.find()` 返回 `Observable<InstanceType<T>[]>`
（[Repository.ts:251](../../../packages/rxdb/src/repository/Repository.ts#L251)），
`findOne` / `findByCursor` / `count` / `get(id)` 同构。存储侧，`RxDBAdapterPGlite` 自己的 vitest 套件就在 Node
环境里初始化（[test-menu.spec.ts](../../../packages/rxdb-adapter-pglite/src/__tests__/test-menu.spec.ts)，
`store: 'memory'`）；`PGliteClient.shouldUsePGliteWorker` 只在 `dataDir` 以 `opfs-ahp://` 开头时才要求 Worker
（[PGliteClient.ts:74](../../../packages/rxdb-adapter-pglite/src/PGliteClient.ts#L74)），Node 下主线程直跑。

真正挡路的只有一处：**同步策略焊死在实体装饰器上**。`getSyncConfig` 的实现是
`return metadata.sync || globalSync`（[sync-type-utils.ts:30](../../../packages/rxdb/src/version/sync-type-utils.ts#L30)）——
实体级配置永远赢。前端 `Recipe` 类上写着 `SyncType.QueryCache + http/wa-sqlite`，后端要的是纯本地 pglite；
把同一个类直接拿到后端，`init()` 会因缺 remote 适配器被 US-021 的 fail-fast 拒绝。
让「同一个类」两端共用需要核心的实例级 sync 覆盖能力——**另立 core 故事，本故事不阻塞于它**；
本故事先用「一份 schema 常量装饰出两个类」的路（D1），并在那条 core 故事落地后收敛为单类。

### 复验方式

- 病灶一/二：读 [recipe.ts](../../../apps/dev-rxdb-http/src/app/recipe.ts)、
  [config.ts](../../../apps/dev-rxdb-http-server/src/config.ts)、
  [rule-group-to-sql.ts](../../../apps/dev-rxdb-http-server/src/rule-group-to-sql.ts)、
  [recipes-store.ts](../../../apps/dev-rxdb-http-server/src/recipes-store.ts) 源码实证；
  README 第 65 行的对齐声明是现状的自述。
- 病灶三前半（引擎环境无关）：读核心包 `package.json` 依赖清单与 `Repository.ts` 方法签名；
  pglite 的 Node 可用性由 `rxdb-adapter-pglite` 自身测试套件在 Node 环境全绿实证。
- 病灶三后半（sync 优先级）：源码实证 `getSyncConfig` 一行实现；「缺 remote 会被 US-021 拒绝」
  是 US-021 的验收行为，属既有结论引用。
- wire 不变的总判据：本故事落地前后各跑一次 `dev-rxdb-http-server` 的 `server.spec.ts`（端点级契约，断言内容不变）
  与 `dev-rxdb-http-e2e`（17 条），差异必须为零。US-213 套件测的是适配器 vs 它自己的
  `tests/reference-server.ts`（[wire-integration.spec.ts:46](../../../packages/rxdb-adapter-http/tests/wire-integration.spec.ts#L46)
  的导入证实），本故事不触碰两者，只要求保持绿——它**不作**本后端的一致性证据。

## 范围边界

### In Scope

- 新建共享领域模块（位置与命名可协商，暂定 `modules/recipes-domain`）：Recipe schema 常量单一来源 +
  两个装饰类（前端 QueryCache 策略 / 后端本地策略）+ 共享的查询函数与 rxjs 组合（被两端 demo 实际调用，A9）
- 后端 [dev-rxdb-http-server](../../../apps/dev-rxdb-http-server/) 初始化 RxDB（pglite 适配器，Node 26），
  七个协议端点改为 Repository / EntityManager 实现
- SSE 变更通知由 RxDB 实体事件（`ENTITY_LOCAL_CREATE` / `ENTITY_LOCAL_UPDATE` / `ENTITY_LOCAL_REMOVE`）驱动
- `__control/*` 全部适配新存储层；确定性种子经新路径写入；pglite 文件落盘（B3）
- 前端 demo 切换到共享实体，wire 行为逐字不变
- 参考后端 README 随之修订（B6）：「零依赖」一节改为如实声明新增依赖，照抄者须知

### Out of Scope

- **单实体类收敛**：依赖核心的实例级 sync 覆盖能力（另立 core 故事），本故事 A / B 不阻塞于它，见 References
- **Full-sync / 离线写队列 / 冲突解决**：`RxDBAdapterHttp` v1 刻意不实现 changelog
  （`pullChanges` 抛 `HttpChangelogUnsupportedError`，[RxDBAdapterHttp.ts:469](../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L469)），
  本故事不改变这条边界
- 真实身份认证与行级作用域：demo 保持假认证；D9 只记录真实后端的模式（租户过滤 AND 组合、写授权、
  每请求审计身份）。「每请求审计身份」若需要 core 的按操作/事务级 context 覆盖，另立 core story
- 水平扩展：两种模式的结论见 D9（共享真库 + 失效广播 / 主从复制）；本故事只交付单进程参考后端
- CORS / 安全边界语义的任何变化（后端仍只监听 `127.0.0.1`）
- 新的纯 Node `node:sqlite` **适配器包**：`NodeSqliteEngine` 已在 `rxdb-adapter-electron` 落地
  （`RxDBAdapterElectron extends RxDBAdapterSqliteBase`，Electron 专有的只是 host/IPC 分发，
  SQL 引擎与 sqlite-core 的仓储/查询层都不依赖 Electron），抽包是薄层提取——另立故事，本故事不阻塞于它
- **Drizzle ORM 适配器**（真实多数据库连接）：暂不立项。不可替代的增量只有 MySQL；真实 PG 服务有更近的路
  （pglite 的 SQL 生成层已是 PG 方言，接 `pg` 驱动即可，语义与 pglite 逐字一致）；核心风险是跨引擎语义
  与 wire 协议的对齐——drizzle 抽象语法、不抽象语义（collation、`LIKE` 大小写、`instr` vs `strpos`），
  而协议要求服务端求值与客户端 refilter 逐字一致。按「病灶数 ≥ 抽象数」铁律，出现真实多库病灶时另立故事评估
- 协议文档改动（wire 不变；文档中的示例 curl 必须继续逐字可跑）
- US-213 的 `tests/reference-server.ts` 保持手写 SQL 不动——它是协议的第二份独立实现，
  本故事保留这份独立性，不把 demo 后端与它合并

## 设计决策

### D1 — 共享模块用「schema 常量 + 两个装饰类」，单类收敛留给 core 故事

装饰器参数是静态的，无法按实例改写。`getSyncConfig` 的优先级（实体级赢）决定了：核心覆盖能力落地前，
同一个装饰器类没法同时承担「前端 QueryCache」「后端本地」两种策略。
因此共享模块导出一份 `RECIPE_SCHEMA`（name / tableName / properties），用它装饰出两个类：
前端 `Recipe`（沿用今天的 QueryCache 策略，前端行为零变化）与后端 `ServerRecipe`（本地策略）。
两者用一条「元数据一致性」测试冻结（字段名、类型、nullable 逐项相等），漂移在 CI 里变红而不是在文档里被遗忘。
core 覆盖故事落地后，本故事追加一个小收尾：删除第二个类，两端共用单类（该收尾单独一条 AC 评估，不进本故事承诺）。

### D2 — 后端存储用 pglite，`memory` 起步

PGlite 的 Node 可用性有本仓测试套件实证：`PGliteClient` 只在 `dataDir` 以 `opfs-ahp://` 开头时才创建
Worker（[PGliteClient.ts:74](../../../packages/rxdb-adapter-pglite/src/PGliteClient.ts#L74)），Node 下主线程直跑。
不选与前端行缓存同款的 wa-sqlite：它的 Node 路径无本仓用例背书（Worker 可选、memory VFS 在形状上支持，
但没有任何 Node 测试）。

一条**必须接受的取舍**：pglite 的 RuleGroup 编译是独立实现
（`packages/rxdb-adapter-pglite/src/query/query_sql.ts`），与前端行缓存（sqlite-core 家族）不是同一份代码，
语义对齐靠测试背书而不是结构保证——`server.spec.ts`（端点级契约）与 dev-rxdb-http-e2e 17 条正是这道背书，
本故事把它们当验收主体（D3）的原因也在这里。

阶段 A 用 `store: 'memory'` 打通全部七个端点；文件落盘（PGlite 的 Node `dataDir` 路径）在阶段 B 验证（B3），
因为它引入跨进程状态（重启、`reset` 删库），而 demo 后端的生命周期测试要跟着一起想清楚。
「零依赖」属性随依赖引入消失，README 同条修订（B6）。零依赖 `node:sqlite` 路线见 Out of Scope。

### D3 — wire 不变是硬约束，不是回归兜底

`server.spec.ts` 的端点级契约断言（短页、稳定排序、token 逐页推进、五算子求值）与
dev-rxdb-http-e2e 的 17 条用例是**验收主体**，断言内容逐字不变；US-213 套件测的是适配器 vs 它自己的
reference-server，本故事不触碰，只作不改包的回归。前端只换实体导入来源，其余代码不动。
任何「为了迁就新实现而改协议或改测试判词」的做法都是范围违约，参照 US-213 对
「协议本身不自洽」的处置惯例（标 `it.fails` 或单列协议缺陷故事）。

### D4 — 服务端定型与冲突映射只冻结 wire 行为，机制实现阶段确认

协议要求 `createdAt` / `updatedAt` 由服务端定型、不看入参（[recipes-store.ts:170-176](../../../apps/dev-rxdb-http-server/src/recipes-store.ts#L170-L176)）。
引擎侧时间戳的盖章机制（引擎在服务端写路径自动盖章，还是 server 层落库前覆写）**未核实**，
属**推断**范围：`EntityBase` 把 `createdAt` / `updatedAt` 声明为 `readonly Date`
（[entity-base.ts:109-115](../../../packages/rxdb/src/entity/entity-base.ts#L109-L115)），
而 wire 上是 ISO 字符串（`nowIso()`）。实现阶段以用例确认盖章点与序列化路径（US-018 的序列化管线），
AC 只冻结线行为：回执的 `updatedAt` 来自服务端时钟、`create` 时 `createdAt === updatedAt`。

同一口径下还有两组**未核实**机制，实现阶段以用例确认、AC 只冻结线行为：
客户端提供的 `id` 能否原样进 `entityManager.create`（协议要求采纳，不采纳则离线新建的行会变孤儿行）；
重复 `id` 时引擎是否抛可映射为 409 的错误、`findOneOrFail` 的失败能否映射为 404（A6 / A7 依赖这两个映射）。

### D5 — token 翻页保留水位线语义，查询改走引擎

`POST recipes/metadata?pageMode=token` 的 keyset 游标 + 读取水位线（[page-token.ts](../../../apps/dev-rxdb-http-server/src/page-token.ts)）
是协议语义，必须原样保留。实现候选：`repo.findByCursor()`（核心已有该 API）或
`orderBy` + keyset 规则；选型以「短页/水位线/快照上界」三条断言能在 `server.spec.ts` 下原样通过为准（A3）。
token 编解码逻辑保留为薄层，不重写。

### D6 — 注入面随手写 SQL 一起消失，白名单校验由 core 承接

`rule-group-to-sql.ts` 删除后，「field 白名单 + 全参数化」这道防线改由 core 的 RuleGroup 校验
与引擎的参数化 SQL 承担。「未知字段会被 core 查询校验拒绝、可映射回 400」是**推断**，
wire `where` 的嵌套 group 形状能否原样进 core 的 `RuleGroup` 亦**未核实**——两者实现阶段一并以用例确认；
若 core 不拒未知字段，则白名单校验保留在 server 薄层（校验只做「拒绝」，
不再做「翻译」——翻译是引擎的事，这正是本故事要消灭的那一半）。原有的注入载荷测试随文件退役，
安全语义改由「引擎参数化 SQL」这条既有结论承担，不另写等效测试。

### D7 — 种子确定性的承诺从「库文件逐字节相同」改为「行内容逐字节相同」

现行承诺是「reset seed 跑两遍，产出的库文件逐字节相同」（[参考后端 README:111](../../../apps/dev-rxdb-http-server/README.md#L111)），
那是 SQLite 文件格式下的表述。换成 pglite 后文件是 PostgreSQL 格式，文件字节级确定性不在承诺范围。
改为：跑两遍 reset，读出的 250 行**逐字节相同**（id / createdAt / updatedAt 仍由固定基准派生，
前三行 id 仍钉在协议文档示例用的三个值上）。若引擎盖章机制（D4）导致时间戳不可注入，
seed 路径改用适配器层写入（如 `mergeChanges` / 行契约路径），**不**为此给引擎加时间戳注入的公共 API。

另有一条 seed 专有约束：种子写入**不得**逐行派发实体事件——250 行会刷出 250 条 SSE 广播。
适配器层写入路径的 `disableTriggers` 语义（`mergeChanges` 已有该参数）正好满足；
`reset` 只在结尾广播一次（B2 判据）。

### D8 — 订阅与变更的协调模型：实例内同机制，跨端保持实体粒度广播

两端各自实例**内**的响应式是同一套核心机制：pglite 的行级变更事件（change-pipeline 的触发器/notify）
驱动 core 按订阅查询的 `where` 决策「哪些订阅要重跑」——后端自己的订阅（若有）与前端本地缓存的订阅
走同一个 `QueryManager`，不存在需要额外协调的「后端增量计算」：后端读路径每次都是即席查询，
**不**增量维护任何客户端的查询结果。

跨端协调保持 US-023 D8 的模型不变：后端广播实体粒度 `{ entity, clientId }`，不带行数据、
不维护客户端订阅；前端收到后 `invalidateRemoteEntity` → 重跑该实体的订阅查询 → 按各自 `where` 重拉。
「按查询条件过滤通知」「行级变更载荷」都被 US-023 D8 否掉了（那一行该不该给这个人看只有查询路径答得出来），
本故事不复活它们——复活的前提是状态化后端 + 鉴权耦合进通知路径，属于协议演进故事，不在本故事范围。

广播接在 `ENTITY_LOCAL_*` 事件上有一个结构收益：core 的 `dispatchEvent` 把事务内的实体事件缓冲到
`TRANSACTION_COMMIT` 才派发（`open.events.push(event)`，[RxDB.ts:816-825](../../../packages/rxdb/src/RxDB.ts#L816-L825)），
「写入落库之后广播」这条协议语义由核心机制保证，不靠端点调用点再判一次。

代价照旧且已承认：实体粒度广播会放大重拉流量（一次写入让每个活查询多跑一趟远端），
demo 的变更通知开关就是留给这类实验的。

### D9 — 多用户共享实例的边界：实例级 vs 每请求

前端实例是**一人一库**（每个浏览器 profile 一个实例，`context` 就是该用户）；后端实例是**全租户共享**——
身份随请求来，不能进实例级 `context`（其契约是「用于写入 `createdBy` 等审计字段、以及行级过滤时的环境变量」，
[rxdb.interface.ts:129](../../../packages/rxdb/src/rxdb.interface.ts#L129)）。据此画线：

**实例级**（后端合法持有）：schema、存储、事件流、`clientId`。后端 `context` 填服务器身份（不是任何用户），
引擎拿它盖审计字段。回声抑制用的 `x-client-id` 从**请求头**读，与实例 `clientId` 无关——这条与现行后端一致。

**每请求级**（必须由 server 层按请求携带，引擎不背）：
1. **查询作用域**。客户端送来的 `where` 是「该用户想看的窗口」，不是执行面：server 层把租户/行级过滤
   与 `where` 做 AND 组合后再交给 `repo.find`。D8 的广播模型在多用户下恰恰因此是对的——通知不带行数据、
   不过滤，权威过滤发生在每个客户端重拉时；行级推送反而会把行数据/存在性泄漏给未授权订阅者。
2. **写授权**。create / update / delete 前校验请求身份对目标行的权限；有鉴权时 404 与 403 的区分要想清楚
   （避免存在性泄漏）。demo 保持假认证（Out of Scope），本条是给真实后端照抄的模式说明，不是 demo AC。
3. **审计字段**。`createdBy` / `updatedBy` 是只读系统字段（[entity-base.ts:121-127](../../../packages/rxdb/src/entity/entity-base.ts#L121-L127)），
   共享实例下引擎会把它们全盖成服务器身份。demo 的 wire 不带这两个字段，接受；
   真实后端要「每请求审计身份」——core 是否有按操作/事务级的 context 覆盖**未核实**（属推断），
   若无则另立 core story。**实现阶段确认**。

**共享实例的两个实际边界**：并发写由 pglite 单进程事务串行化，demo 规模足够。
水平扩展不在本故事范围，两条模式的结论先记在这里：pglite 嵌入式库是单进程语义，
**多进程不能共享同一 `dataDir`**。要么共享真 PG（复用 pglite SQL 层的 pg 适配器）+
外部 pub/sub 实体粒度失效广播——各进程的订阅靠失效重查，**无本地增量**（D8 模型的 server-to-server 版）；
要么主从复制——secondary 进程用引擎既有 Full-sync 机制（`pullChanges` / `mergeChanges`）把 changelog
复制进**各自本地实例**，订阅回到真本地增量（本地事件驱动），读扩容 + SSE 本地广播，代价是复制延迟与单写者。
两条路都要求每个进程持有自己的 RxDB 实例，单机多 Node 与跨机分布式同理。

**浏览器专属机制一律不生效**：跨 tab 协调（`RxDBTabsGateway`，BroadcastChannel + Web Locks）用
`multiInstance: false` 显式关闭——该开关的既有先例就是「单 realm 且没有这些 Web API」的微信小程序逻辑层
（[rxdb.interface.ts:109](../../../packages/rxdb/src/rxdb.interface.ts#L109)），Node 后端是同一情形；
可达性检测有 `typeof` 守卫（`resolveGlobalNavigatorOnLine` 取不到 `navigator.onLine` 就返回 `undefined`，
[reachability.ts:72-76](../../../packages/rxdb/src/network/reachability.ts#L72-L76)），Node 下自动失效不抛错；
离线降级、QueryCache 出站队列、SSE 通道、DevTools 连接器则因后端 `SyncType.None + local` 根本不构造。

## 交付阶段

| 阶段 | 内容                                                                                             | 关闭条件                                                              |
| :--- | :----------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| A    | 共享模块 + 后端 RxDB 装配（pglite memory）+ 确定性种子 + **七个协议端点全部**迁移（读+写一体）+ 前端切共享实体 | AC A1–A10 全绿；server.spec.ts 断言内容不变 + e2e 17 条零差异          |
| B    | SSE 改事件驱动 + `__control/*` 适配 + 文件落盘 + 退役手写 SQL + README 修订                      | AC B1–B6 全绿；`rule-group-to-sql.ts` / `recipes-store.ts` 已删除      |

## 验收标准

### 阶段 A

| #   | 前置条件                         | 操作                                     | 预期结果                                                                                       | 状态 |
| --- | -------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- | ---- |
| A1  | Node 26，后端进程                 | 初始化 `RxDB`（`multiInstance: false`）+ pglite 适配器并 `connect` | `getRepository(ServerRecipe)` 可用，Recipe 表建成（schema 来自共享模块）                        | ⬜   |
| A2  | A1 就绪                          | `POST recipes/metadata`（offset 形态）   | 由 `repo.find({ where, orderBy, limit, offset })` 实现；`server.spec.ts` 断言内容不变且全绿：短页只在真末页、跨页排序稳定、五算子求值逐字一致 | ⬜   |
| A3  | A1 就绪                          | `POST recipes/metadata`（token 形态）    | 水位线 / 快照上界 / keyset 逐页推进与现行一致（D5）；`server.spec.ts` 的 token 用例全绿；`__control/page-mode` 切换语义不变 | ⬜   |
| A4  | A1 就绪                          | `POST recipes/by-ids`                    | `repo.find` + `in` 实现；缺失的 id 不回行、不补空对象、不回 5xx                                  | ⬜   |
| A5  | A1 就绪                          | `HEAD recipes`                           | 表存在性判断，语义与现行一致（存在 200 / 不存在 404）                                            | ⬜   |
| A6  | A1 就绪                          | `POST recipes`                           | `entityManager.create` 实现；回执 = 持久化行（来自库，不是入参回声）；id 采纳/缺省生成、已存在回 409（映射机制见 D4） | ⬜   |
| A7  | A1 就绪                          | `PATCH recipes/:id`                      | `findOneOrFail` + `repo.update` 实现；不存在回 404（映射机制见 D4）；`updatedAt` 服务端定型且非入参（D4 冻结的 wire 行为） | ⬜   |
| A8  | A1 就绪                          | `POST recipes/delete`                    | 批量删除；响应条数；空列表幂等返回 0                                                            | ⬜   |
| A9  | 共享模块建成                     | 两端各至少一条真实查询路径调用**同一个**共享查询函数（如分页元数据查询）；两个装饰类元数据一致 | 行为与类型层面同一份代码；一致性测试冻结 name / tableName / 字段名 / 类型 / nullable              | ⬜   |
| A10 | A9 就绪，前端切到共享实体        | 跑 `server.spec.ts` + dev-rxdb-http-e2e  | 17 条 e2e 全绿；协议流量面板、条件请求、离线降级行为与切换前零差异                               | ⬜   |

### 阶段 B

| #   | 前置条件                         | 操作                                        | 预期结果                                                                                                 | 状态 |
| --- | -------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---- |
| B1  | 阶段 A 完成                      | 开两个客户端，一端写入                      | SSE 广播由 `rxdb.addEventListener(ENTITY_LOCAL_*)` 驱动；载荷 `{ entity, clientId }`；`x-client-id` 回显抑制不变；广播发生在写入事务提交之后（core 事务事件缓冲保证，D8）；`__control/reset`、`clear` 同样广播（判据仍是「库里的行变没变」） | ⬜   |
| B2  | 阶段 B 就绪                      | `__control/reset` 跑两遍 + 其余 `__control/*` 开关 | 全部适配新存储层；两次 reset 读出的 250 行逐字节相同（D7）；种子不逐行广播、reset 只在结尾广播一次（D7）；前三行 id 与协议文档示例一致（文档 curl 不 404）；offline / fault / cors / page-mode 行为与现行一致 | ⬜   |
| B3  | 阶段 B 就绪                      | 文件落盘（pglite `dataDir`）+ 重启进程     | 重启后数据仍在；`__control/reset` 删库重建语义与现行一致（`.data` 目录行为）                             | ⬜   |
| B4  | 阶段 B 就绪                      | 跑 dev-rxdb-http-e2e 变更通知相关用例       | 双页收敛、抑制回声、断开重连（US-023 D7 的全量失效）行为与切换前零差异                                  | ⬜   |
| B5  | 阶段 B 实现完成                  | 跑门禁                                        | 全绿；[rule-group-to-sql.ts](../../../apps/dev-rxdb-http-server/src/rule-group-to-sql.ts) 与 [recipes-store.ts](../../../apps/dev-rxdb-http-server/src/recipes-store.ts) 已删除；注入载荷测试按 D6 退役；覆盖率不回退 | ⬜   |
| B6  | 阶段 B 实现完成                  | 修订 [参考后端 README](../../../apps/dev-rxdb-http-server/README.md) | 「零依赖」一节改为如实声明新增依赖；确定性种子表述按 D7 改判（「读出的 250 行逐字节相同」）；协议示例 curl 仍逐字可跑 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **存储选型（D2）的 Node 可行性依据**：pglite——`PGliteClient` 只在 `dataDir` 为 `opfs-ahp://` 前缀时
  创建 Worker，Node 下 `memory` 与文件 `dataDir` 都走主线程，本仓测试套件在 Node 环境全绿是就近实证；
  node:sqlite——`NodeSqliteEngine` 已实证（Electron 主进程），纯 Node 化见 Out of Scope。
- **后端实例里有系统实体**（分支簿记等），对协议不可见：`HEAD recipes` 只答业务实体；`metadata` / `by-ids`
  只查 Recipe。库级 sync 用 `SyncType.None + local: pglite`（无 remote），后端实体不触发任何远端路径。
- **订阅协调（D8）的实现落点**：SSE 广播订阅 `ENTITY_LOCAL_CREATE / UPDATE / REMOVE` 三个事件即可——
  事件载荷带实体名与 namespace（[rxdb-events.ts:161-171](../../../packages/rxdb/src/rxdb-events.ts#L161-L171)），
  正是 `broadcastChange({ entity, clientId })` 需要的字段。覆盖范围与现行后端同判据：
  只有经本 RxDB 实例落库的行变更才产生事件，外部进程直写数据库文件不会被广播。
- **D4 的时间戳机制确认点**：`EntityBase` 声明 `readonly createdAt/updatedAt: Date`，wire 上是 ISO 字符串。
  实现阶段先写一个「时间戳归属」用例（服务端写 → 回执 `updatedAt` 是服务端时钟且非入参），再按结果选盖章机制。
- **`reset` 的语义迁移**：从「删库文件 → 重建表 → 写种子」变为「销毁 RxDB 实例 → 重建 → 经引擎写种子」。
  `__control/reset` 的广播与 `HEAD` 行为必须保持（现行 README 里它们有明确的契约）。
  实例热替换的并发语义：在途请求与 SSE 连接要么看见旧实例、要么看见新实例，不存在半替换态；
  替换点收口后旧实例 `destroy`（释放 pglite 句柄）。
- **`GET meta/version` 不迁移**：后端版本串与存储无关，端点原样保留。
- **serve 的构建顺序**：`dev-rxdb-http-server` 现走 Node 26 类型剥离直跑（无 build target）；引入 workspace
  依赖后，serve 前需先构建 `@aiao/rxdb` 与 `rxdb-adapter-pglite` 的 dist（nx `dependsOn`）。
  「零 build」属性随「零依赖」同条修订（B6）。
- **共享模块的 project 配置**：`modules/recipes-domain` 按 `modules/` 既有先例注册为 Nx TS lib，
  依赖 `@aiao/rxdb`（类型 + 装饰器），不进 npm 发布范围。
- **删除注入载荷测试的处置**：随 `rule-group-to-sql.ts` 退役。安全边界的表述从「这个文件做了参数化」
  迁移为「引擎生成的 SQL 全程参数化」——后者由引擎既有测试背书，不在本故事里重写等效测试（D6）。
- **e2e 不新增、不改判词**：现有 17 条是零差异判据（D3）。阶段 B 的 B1 / B4 若需要新增用例，
  只允许**新增**「后端引擎化后行为不变」的对照断言，不允许改既有判词。

## 实现文件

| 文件                                                                                          | 阶段 | 说明                                                              |
| --------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------- |
| `modules/recipes-domain/`（新建）                                                              | A    | schema 常量 + 两个装饰类 + 共享查询函数 / rxjs 组合（A9 两端实际调用） |
| [apps/dev-rxdb-http-server/src/](../../../apps/dev-rxdb-http-server/src/) 新增 RxDB 装配模块   | A    | 后端 `RxDB` + pglite 初始化，替代 `db.ts` 的直接 `DatabaseSync` 路径 |
| [apps/dev-rxdb-http-server/src/recipes-store.ts](../../../apps/dev-rxdb-http-server/src/recipes-store.ts) | B    | 删除；读+写路径已在 A 全迁到 Repository / EntityManager             |
| [apps/dev-rxdb-http-server/src/rule-group-to-sql.ts](../../../apps/dev-rxdb-http-server/src/rule-group-to-sql.ts) | B    | 删除；翻译职责回引擎（D6）                                          |
| [apps/dev-rxdb-http-server/src/change-feed.ts](../../../apps/dev-rxdb-http-server/src/change-feed.ts) / change-subscribers.ts | B    | 广播改由 `rxdb.addEventListener` 驱动，SSE 传输层不动                |
| [apps/dev-rxdb-http-server/src/control.ts](../../../apps/dev-rxdb-http-server/src/control.ts) / seed.ts | B    | 适配新存储层；seed 按 D7（确定性 + 不逐行广播）                      |
| [apps/dev-rxdb-http-server/README.md](../../../apps/dev-rxdb-http-server/README.md)          | B    | 「零依赖」节与确定性种子表述修订（B6）                                |
| [apps/dev-rxdb-http/src/app/recipe.ts](../../../apps/dev-rxdb-http/src/app/recipe.ts)        | A    | 改为从共享模块导入；demo 特有注释与 `syncStaleTime: 0` 保留           |
| 两个 server spec 文件（`rule-group-to-sql.spec.ts` / `server.spec.ts`）                        | A/B  | 前者退役；后者改为「引擎化后端」的端点级契约，断言内容不变            |
| [packages/rxdb-adapter-http/tests/reference-server.ts](../../../packages/rxdb-adapter-http/tests/reference-server.ts) | —    | 不动——协议第二份独立实现，保留独立性（Out of Scope）                 |

## References

- [US-212 HTTP 适配器](../../../requirements/stories/adapter/US-212-http-adapter.md) — 协议的另一半（客户端），本故事不触碰
- [US-213 HTTP 适配器 wire 级集成测试](../../../requirements/stories/adapter/US-213-http-wire-integration-test.md) — 适配器 vs 其自有 `tests/reference-server.ts` 的 wire 验收；本故事不触碰两者，只要求保持绿
- [US-214 HTTP 适配器浏览器端到端 demo](../../../requirements/stories/adapter/US-214-http-browser-demo.md) — 后端与 e2e 的现状来源
- [US-023 QueryCache 远端变更的失效上报口与实时同步](../../../requirements/stories/core/US-023-querycache-remote-invalidation.md) — SSE 通道的客户端一侧
- [http-protocol.md](../../../website/docs/adapters/http-protocol.md) — wire 契约，逐字不可变
- [US-207 Electron 连接本地 SQLite 文件](../../../requirements/stories/adapter/US-207-desktop-local-database.md) — `NodeSqliteEngine` 的出处（node:sqlite + sqlite-core），Out of Scope 里纯 Node 抽包的前置
- [NodeSqliteEngine](../../../packages/rxdb-adapter-electron/src/node-sqlite-engine.ts) — 文件路径落盘、同步接口、触发器驱动变更事件
- 核心实例级 sync 覆盖能力——另立 core story（编号待定），本故事 D1 的收尾依赖它，A / B 不阻塞于它
