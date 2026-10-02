---
id: RV-022
title: US-029 多用户 RBAC 与租户隔离——立项准入评审
status: Open # Open / Resolved
created: 2026-10-02
updated: 2026-10-02
pr: # 修复 PR 链接，Resolved 时填
---

# Review：US-029 立项准入

对象：[US-029](../stories/core/US-029-rbac-tenant-permission-design.md)（RV-017 回写后的版本）。
方法：「背景与动机」「声明层」「上下文层」的每条现状断言逐条对照源码与参考 SQL；
写读层、同步层、权威端的设计落点逐个读调用点；`node scripts/audit/requirements-consistency.mjs` 对 US-029 无锚点告警。

## 结论

❌ **不建议按现稿整条立项。** 现状实证扎实（无一条断言为假），但有两条准入问题（R01 / R02）和九条会让阶段 B～D 返工的设计缺口（R03～R11）。

一旦拍板，等于把 **US-029 A～E 共 5 个阶段、6 个包 + 参考 SQL + 三框架**一起排进批次；上游 US-027 阶段 A / B / C
不等本故事立项，已独立交付。

后续处置：US-029 已回写为价值待证（R01 选 b）；R04 已实验复现为与租户无关的真实缺陷，拆为
[US-218](../stories/adapter/US-218-supabase-rls-push-integrity.md) 先行。去掉租户能否立项见「去掉租户后的评估」。

## 准入问题（P0）

### R01 价值待证：写不出「今天用户踩得到的具体症状」

故事的「背景与动机」7 条全是**能力缺口**，没有一条是**症状**：全仓 `packages/` / `apps/` / `modules/` 里没有任何 `tenant` 引用，
也没有具名的多租户使用方（demo、外部 issue、下游项目都没有）。唯一挨得上的
[`RemoteSecurityNotice`](../../apps/dev-rxdb-supabase/src/app/remote-security-notice.ts) 是一条提示文案，
它告诉用户「此 demo 未启用身份认证或 RLS」，并不是有人因此出了事。

按 [CONVENTIONS 价值待证](../CONVENTIONS.md#价值待证)「病灶数 ≥ 抽象数」：新增抽象至少 10 项（`access` 声明、`tenantId` / `roles` 冻结快照、
`EntityPermissionRule` 谓词、`switchContext` 代次、`evictTenantData`、按租户水位、严格拉取、逐操作确认 + rejected 状态、
RLS fixture、操作级能力派生），已知病灶为 0。US-028 / US-030 / epic-009 都按同一判据标了价值待证，
US-029 现稿没有「价值待证」节，也没有解锁条件。

**需要 owner 二选一**：

- (a) 给出驱动样本（具体的多租户使用方或场景），写进「背景与动机」作为症状，然后按 R02 的顺序立项；
- (b) 补「价值待证」节，`priority` 下调为 Low，写明解锁条件（出现具名多租户使用方），留在立项池。

### R02 阶段顺序把唯一的安全边界排在最后

故事自己的调研结论是「信任客户端 = 安全剧场」，「边界」表也写明安全边界只在权威端。但交付顺序是 A → B → C → D → E，
权威端在 D。只交付 A～C 时，产出的是本地过滤与本地拒绝——按故事自己的定义，这属于快速反馈，不是隔离。
一阶段一 PR 的节奏下，任何在 D 之前停下来的时间点，仓库里都有一套「看起来像多租户、实际零隔离」的 API。

建议（若 R01 选 a）：

- 把 D 里**与租户无关**的两项拆出来前置：`rxdb_mutations` 的日志改由真实生效的写推导（R04），以及 push 逐操作确认（R05）。
  这两项修的是现有同步协议的完整性，不依赖租户。反例已复现（见 R04），已拆为独立故事
  [US-218](../stories/adapter/US-218-supabase-rls-push-integrity.md)，不论 R01 选哪一项都可以先排。
- 严格拉取与 RLS fixture 只依赖 A 的声明，可与 B 并行，不必等 C。
- 在故事里写明：D 关闭前，任何文档、TSDoc、release note 都不得把 `access` 描述为「隔离」或「安全」。

## 设计缺口（P1，立项前回写进故事）

### R03 拉取条件「三路 AND」在现有代码里是「二选一覆盖」

[`pullRepository()`](../../packages/rxdb-plugin-sync/src/pull-repository.ts) 只有在调用方没传 `opts.filter` 时才求值 `remote.filter()`：

```ts
let effectiveFilter = opts.filter;
if (syncType === 'filter' && !effectiveFilter) {
```

全仓没有 `RuleGroup` 的 AND 组合工具。故事「同步层」与 AC#16 写的 `AND(tenant, remote.filter(), PullRepositoryOptions.filter)`
是**行为变更**，不是包一层。回写：「实现文件」阶段 C 补「`RuleGroup` 组合器 + 改写 `pullRepository()` 的 filter 选择逻辑」；
写明未声明 `access` 的实体保持现有覆盖语义不变（否则就是 AC#1 的回归）。

### R04 `rxdb_mutations` 先写日志、后写业务表，与「日志由真实生效的写推导」顺序相反

[`04-rxdb-utils-functions.sql`](../../docker/sql/04-rxdb-utils-functions.sql) 的 `rxdb_mutations` 先用 `op->'patch'` 拼出
`beforeData` / `afterData` 并 `INSERT INTO public.rxdb_change`，之后才调 `rxdb_batch_upsert` / `rxdb_batch_delete`；
`rxdb_batch_delete` 内 `GET DIAGNOSTICS affected = ROW_COUNT` 拿到的真实受影响行数没有被 `rxdb_mutations` 用来回收日志。

**已实验确认**：给业务表加一条「只有 owner 能删」的 DELETE 策略，以非 owner 身份调 `rxdb_mutations` 删除一行可见的行，
函数不报错、行仍在，`rxdb_change` 却多了一条 DELETE；推送方本地删掉该行，其它端拉到后也删掉，远端与所有客户端从此分叉。
复现用例为 [`supabase-sql-security-regressions.sql`](../../packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql)
的 `test_rls_filtered_delete()`（`rls-filtered-delete`，当前为红）。这条不需要租户或角色，任何启用了业务表 RLS 的部署今天就会踩到，
由 [US-218](../stories/adapter/US-218-supabase-rls-push-integrity.md) 阶段 A 修复。

所以 AC#24「`USING` 零行生效不产生日志」不是「加参数」能做到的——函数的阶段顺序要整体反转：先写业务表、以 `RETURNING` 取真实前后像，
再据此写日志并按受影响行数判定 applied / rejected。回写：「留给 plan 阶段的落点」把这条从「返回形状」升级为「`rxdb_mutations` 执行顺序重排」。

### R05 push 逐操作确认是远端适配器接口的破坏性变更

[`RemoteMergeResult`](../../packages/rxdb/src/rxdb-adapter.ts) 的两个字段都是可选的，TSDoc 明写「甚至都不回传（那种情况下调用方按『无映射』处理）」；
[`getChangeIdMapping`](../../packages/rxdb-plugin-sync/src/push-repository.ts) 对缺映射 `return []`。
AC#24 要求「确认缺失整批失败」，等于把 `changeIdMapping` 从可选映射升级为**强制的逐条回执**（再加 applied / retried / rejected 三态），
这改的是 `RxDBAdapterRemoteBase.mergeChanges` 的契约，波及所有远端适配器（含第三方）。回写：「实现文件」阶段 D 补
`packages/rxdb/src/rxdb-adapter.ts`，交付阶段表写明 API 基线变更与 `website/docs/migration/` 说明。

同时：`mergeChanges` 的 TSDoc 已经规定「相同批次重试时不得重复执行实体副作用，并且必须为每个本地 change ID 返回首次提交得到的同一个远端 ID」。
AC#25「已应用的重试」是**既有契约的回归验收**，不是新能力；故事应引用它，并在 plan 阶段核实 Supabase 实现是否已兑现。

### R06 按租户水位要改系统表结构，不只是改 id 字符串

[`RxDBSync`](../../packages/rxdb/src/system/sync.ts) 是持久化系统表，`namespace` / `entity` / `branchId` 各自是列，且有唯一索引：

```ts
name: 'idx_repo_sync_entity',
properties: ['namespace', 'entity', 'branchId'],
unique: true
```

只往 [`getOrCreateSyncRecord`](../../packages/rxdb/src/sync-contract/sync-record-utils.ts) 的 `syncId` 里追加 `:${tenantId}`，
同一实体的第二个租户就会撞这条唯一索引。回写：`rxdb_sync` 新增 `tenantId` 列（未声明 `access.tenant` 的实体为 null）、唯一索引加入该列，
按系统表 schema 迁移走（本地 6 个后端 + Supabase 参考 SQL）；`evictTenantData` 按列筛选。测试里按位置 `split(':')` 解析 `syncId` 的用例同步改。

### R07 严格拉取的「零水位即全量基线」在存量表上不成立

故事规定租户列由使用方经 `MigrationType[]` 给**已有的表**加列并回填——这是主路径，不是边角。但严格拉取只返回 `snapshotComplete` 的变更、
按 `afterData` 的租户归属求值，而：

- 回填迁移之前产生的 INSERT，其 `afterData` 里根本没有租户属性，严格过滤会把它们全部丢掉；
- [`01-rxdb-system-tables.sql`](../../docker/sql/01-rxdb-system-tables.sql) 的快照列回填把所有历史 UPDATE 的 `snapshotComplete` 定为 `false`（`ELSE false`），严格模式同样丢弃。

结果是：给存量表声明租户后，新设备从零水位拉取拿不到完整基线，且没有报错。另外 `Filter` 型从零水位拉取本身就是全量回放该实体的日志，没有快照引导。
回写：技术笔记锁定基线策略，二选一——要求声明租户的实体从建表起就带租户列（不支持给存量表追加），或交付一次「为现存行各补一条完整快照」的服务端迁移步骤；
AC#23 的 fixture 显式加入「回填前的 INSERT + 历史 incomplete UPDATE + 行仍存在」场景。

### R08 「同库多连接分处不同租户」只在 1/6 个后端成立，且漏了跨 tab 广播

- [`working-tree-cross-connection.spec.ts`](../../packages/rxdb-adapter-wa-sqlite/src/__tests__/working-tree-cross-connection.spec.ts) 的注释：
  「v1 的六个后端里只有它支持**多个真实连接同时打开同一个持久库**……PGlite 与 OPFS-AHP 都是单写者，第二个句柄开不出来」。
  AC#21 现稿当成全后端共性验收，做不到。
- US-009 的 [`RxDBTabsGateway`](../../packages/rxdb/src/gateway/RxDBTabsGateway.ts) 按 `dbName` 开 `BroadcastChannel`，
  `multiInstance !== false`（默认）即启用，把本地 CREATE / UPDATE / REMOVE 连同 patch 广播给同库所有 tab，不看 `tenantId`。
  接收方的实时查询靠内存重判（[`merge_create.ts`](../../packages/rxdb/src/query/merge_create.ts) 的 `isEntityMatchWhere(e.patch, where)`、
  `merge-update.utils.ts` 的 `classifyUpdates`）决定是否并入结果——租户条件如果只加在适配器 SQL 层、没进 `task.options.where`，
  外租户的行会经这条路径进入当前租户的查询结果。

回写：AC#21 限定为「支持多连接的后端」并列名；「读取层」锁定注入点为**构造 `where` 的那一刻**（先于 `queryManager.createTask()`），不是适配器 SQL 层；
新增 AC：两个 tab 同 `dbName`、分处 A / B，A 的本地写不进入 B 的任何实时查询结果。

### R09 读取入口清单不全，且没有单一注入点

[`Repository`](../../packages/rxdb/src/repository/Repository.ts) 里 `count()` 走适配器的 `repo.count()`，不经 `find()`；
`findAll()` / `findByCursor()` 各自拼 `where`；`relation-helper.ts` 另有独立的 `where` 构造；
树插件的 `findDescendants` / `findAncestors` / `countDescendants` / `countAncestors` 与图插件的 `findNeighbors` / `countNeighbors` / `findPaths`
走各自的专用 SQL（递归 CTE），不经 `RuleGroup` 编译。故事「读取层」只列了 `get` / `find` / `findOne` / `count` / 关联 / 实时查询 / identity cache。
回写：把上述入口逐一列入「必须覆盖」清单，或在 Out of Scope 显式排除树 / 图插件对声明租户实体的支持（metadata-validate 拒绝 `access.tenant` 与 `@TreeEntity` / `@GraphEntity` 组合）。

### R10 写入层：漏了图插件边写入，前像读取的成本与事务边界未定

- [`GraphRepository.addEdge()` / `removeEdge()`](../../packages/rxdb-plugin-graph/src/GraphRepository.ts) 直接 `this.local$.pipe(switchMap(local => local.addEdge(...)))`，
  不经门面写入口，故事「写入层」的入口枚举与 AC#12 / AC#13 都没覆盖。处置同 R09：纳入或显式排除。
- 「按持久化前像判定」需要每次 update / delete 先读本地库；现在 [`update_sql()`](../../packages/rxdb-adapter-sqlite-core/src/entity/update_sql.ts) 链路上没有任何写前读。
  回写：锁定「前像按批一次 `WHERE id IN (...)` 读取、与随后的写在同一事务内」，并为 `saveMany` 给出可复验的耗时基线，否则 N 行批量会变成 N+1 次往返。

### R11 `evictTenantData`「不生成 `RxDBChange`」没有实现路径

sqlite 的 [`trigger_sql.ts`](../../packages/rxdb-adapter-sqlite-core/src/table/trigger_sql.ts) 给每张实体表建的 `AFTER DELETE` 触发器没有 `WHEN` 守卫，
任何 DELETE 都会写 `RxDBChange`；本地删除之后这些日志会被当成业务 DELETE 推上远端——正是故事要防的事。
回写：技术笔记写明驱逐的机制（同事务内删除触发器产生的日志行，或给触发器加会话级抑制开关），并给 AC#21 补一条「驱逐后 push 队列为空」的负向用例。

## 次要问题（P2）

- **系统写可产生跨租户外键**：级联由 [`create_table_sql.ts`](../../packages/rxdb-adapter-sqlite-core/src/table/create_table_sql.ts) 编进 `FOREIGN KEY ... ON DELETE`，由数据库执行；
  迁移 `up(executor)`、working-tree 物化、分支合并都是系统写，不过「写时归属校验」。AC#13「级联不触及外租户」只在用户写前提下成立，应写成已知限制。
- **权威端验收基础设施要从零搭**：`docker/docker-compose.yml` 有 GoTrue，但 `rxdb-adapter-supabase` / `rxdb-plugin-sync` / `apps/dev-rxdb-supabase` 里没有任何
  `signInWithPassword` / `auth.admin` 调用。阶段 D 应单列「测试登录态 harness（建用户、取 JWT、注入 PostgREST 与 Realtime）」，否则估算失真。
- **rejected 与撤销 / 重做的交互未定义**：待推查询以 `revertChangeId = null` 为条件；撤销一条已被权威端拒绝的变更会产生作用于远端不存在前态的补偿变更。写明归属（跨 US-302 协调）或本期禁止撤销 rejected 变更。
- **实时信号化缺合并窗口**：`handleSupabaseChange` 每条 INSERT 派发一次，改成「触发逐仓拉取」后批量写入会变成拉取风暴，需写明去抖 / 合并窗口。
- **「Supabase 侧四条写路径」计数不实**：按 `if (userId)` 守卫数，`build_upsert_params`、`executeUpsert`、`SupabaseRepository.create()` / `update()`、`mergeChanges` 至少 5 处。改为列出函数名或删去计数。
- **「字符串类 ID 类型」口径不清**：[`EntityBase.id`](../../packages/rxdb/src/entity/entity-base.ts) 是 `PropertyType.uuid`，不是 `string`。写明 `uuid` 与 `string` 都接受。
- **`DISPLAY_ONLY_FIELDS` 是写死字段名的全局 `Set`**（`build-editable-columns.ts`），要改成按实体 `access` 声明动态判断，不是往集合里加字面量。
- **切换后清缓存缺负向用例**：AC#17 补「切换后经 `getEntityRef` 命中旧租户实例」的断言。

## 去掉租户后的评估

owner 追问：不做多租户，只做多用户（owner / 角色），是否可以立项。

**消失的**：R06（按租户水位）、R07（存量表补租户列）、R08（同库多连接分处不同租户）、R11（`evictTenantData`），
以及 R03 / R09 中与租户过滤相关的部分。阶段 C 的大半和 `switchContext` 的清理语义随之消失，范围约减半。

**仍在的**：`access.owner` 声明、`RxDBContext.roles` 冻结快照、角色 / 所有权谓词、写入前像读取（R10）、
push 逐操作确认（R05）、权威端 RLS 与 fixture、三框架操作级能力派生。`ownerOnly` 只限写不限读，所以拉取侧基本不动，
但写入侧与权威端的工作量不变。新增抽象仍有 6～7 项。

**结论**：❌ 去掉租户不改变 R01。多用户版同样没有具名使用方，病灶数仍为 0，价值待证照旧成立。

但评审过程中复现出一个**与租户、角色都无关**的真实病灶：业务表开 RLS 后的幽灵 DELETE（R04）。它属于现有同步协议，
修复它不需要 `access` 声明，因此拆为独立故事 [US-218](../stories/adapter/US-218-supabase-rls-push-integrity.md)（High，可直接排期）。
US-029 回写为价值待证、`priority: Low`，阶段 D 以 US-218 为前置；解锁后可以先交付 owner / 角色，租户作为增量追加，
不必一次排进五个阶段。

## 需 owner 定案

1. R01：选 (a) 给驱动样本后立项，还是 (b) 标价值待证留池。现稿已按 (b) 回写，见「去掉租户后的评估」。
2. R02（仅 R01 选 a 时）：是否接受「严格拉取与 B 并行」的阶段重排。权威端完整性已拆为 US-218，不再占用这项决策。
3. R07：存量表追加租户列是否在本期支持（决定是否要服务端补快照迁移）。
4. R09 / R10：树、图插件实体本期是否支持声明租户（建议显式排除）。

R03～R06、R08、R11 与 P2 各条不依赖 owner 决策，可直接回写进故事。
