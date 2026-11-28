---
id: US-038
title: 双向一对一的实体能开同步：同步层按可空外键断环
status: In Review
priority: High
epic: epic-004-future-features
created: 2026-11-25
updated: 2026-11-26
tags: [core, sync, relationship, one-to-one, supabase, sql]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 前置 US-037（先收敛成一次全量级联，再在上面按强连通分量调度）；阶段 B 的服务端参数可选，旧客户端不受影响
- [x] Negotiable (可协商): 方向已定（同步层支持环）；断环边的选法、分批粒度与错误形状在技术笔记里给出，可在实现时细化
- [x] Valuable (有价值): 注册了一对双向一对一实体的库，今天所有仓库都推不上、拉不下
- [x] Estimable (可估算): 依赖图强连通分量 + 客户端按分量合批 + `rxdb_mutations` 延迟列三遍执行 + 拉取补齐翻页；四个 PR
- [ ] Small (小): 跨依赖图、推送、拉取、服务端 SQL 四层，分三个交付阶段
- [x] Testable (可测试): shop 夹具在真栈上可复现（见「现状」）
-->

# 用户故事：双向一对一的实体能开同步

## 作为/我想要/以便

**作为** 用关系模型做推拉同步的应用开发者
**我想要** 两个实体互相持有外键（双向一对一，例如 shop 夹具的 `User.idCard` ↔ `IdCard.owner`）时照样能推拉
**以便** 不必为了能同步把模型改成单向，也不会因为一处环让整个库的推拉全部失败

## 现状

1. [`buildDependencyGraph`](../../../packages/rxdb-plugin-sync/src/dependency-graph.ts) 认为一对一与多对一的外键都在声明的一侧，两侧都声明的一对一就成了两条方向相反的依赖边：

   ```ts
   // MANY_TO_ONE 和 ONE_TO_ONE 关系中，外键存储在当前实体侧
   if (relation.kind === RelationKind.MANY_TO_ONE || relation.kind === RelationKind.ONE_TO_ONE) {
   ```

   随后环检测 `detectCycles` 抛 `Circular dependency detected`（本故事已把它换成按强连通分量找环的 `findDependencyCycles`）。它只跳过自引用（树），两个实体互指的环照抛。一对一没有「持有外键的一侧」之分，两侧声明就各有一列外键。

2. 推送时每个仓库的级联都建全量依赖图（`pushWithCascade`），批量拉取（[`pullBatch`](../../../packages/rxdb-plugin-sync/src/pull-batch.ts)）、单仓拉取（`pullRepository`）与分支物化也一样。所以库里只要注册了这样一对实体，所有仓库的推拉都会失败，与这对实体有没有数据无关。

3. shop 夹具就是这种模型，远端两侧也都有外键，且都不是 `DEFERRABLE`（[`03-business-tables.sql`](../../../docker/sql/03-business-tables.sql)）：

   ```sql
   FOREIGN KEY ("ownerId") REFERENCES shop."user"(id) ON DELETE CASCADE      -- id_card_ownerId_fkey
   FOREIGN KEY ("idCardId") REFERENCES shop.id_card(id) ON DELETE SET NULL   -- user_idCardId_fkey
   ```

   另有复合外键 `user_id_card_owner_consistency_fkey`（`("idCardId", id)` → `id_card(id, "ownerId")`）。`User.idCardId` 可空、`IdCard.ownerId` 非空，所以存在合法的写入顺序：先写 User（`idCardId` 为空），再写 IdCard，最后补写 `User.idCardId`。

4. 这个顺序没法由客户端自己拼出来（读代码得出，未实测）：
   - 本地压缩 [`compactChanges`](../../../packages/rxdb/src/sync-contract/compact-changes.ts) 会把同一实体的 INSERT 与随后的 UPDATE 合成一条带外键值的 INSERT；
   - `rxdb_mutations` 的配对校验不接受没有日志的补写 UPDATE（RX002 `unpaired_write`），同一实体既 upsert 又 update 也不接受（RX002 `duplicate_write`）；
   - 补写如果复用已落库的源变更，会被幂等逻辑跳过，回执却报成功；
   - 推送按仓库各调一次 RPC，User 与 IdCard 不在同一个服务端事务里。

5. 本地外键都是延迟检查：SQLite 系在事务开头执行 `PRAGMA defer_foreign_keys = ON`，PGlite 的外键是 `DEFERRABLE INITIALLY DEFERRED`。所以环在**一个**本地事务里落库没有问题；但单仓拉取按仓库、按页各开事务，`pullBatch` 的一页也可能在环中间截断，提交时都会撞上外键。

6. 夹具与远端不一致：本地 `User.idCard` 没有声明 `onDelete`，一对一的默认值是 `CASCADE`；远端是 `SET NULL`。在本地删掉 IdCard 会连带删掉 User。

复验方式（实测，用例未入库）：在本 checkout 的 Supabase 测试栈上注册 `@aiao/rxdb-test/shop` 的 `ENTITIES`、`SyncType.Full`，本地新建一个 User 后调 `push()`：结果的 `failures` 覆盖全部仓库（含系统表与两张中间表），错误都是 `Circular dependency detected: shop:IdCard -> shop:User -> shop:IdCard`，远端一行未写。再调 `pull()`，直接抛同一个错误。第 4、5 点读代码得出。

## 交付阶段

| 阶段 | 状态 | 交付                                                                                                     | 必过 AC   | 门禁                                                               |
| ---- | ---- | -------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| A    | ✅   | 依赖图按强连通分量断环；推送把环内成员合进一次 `mergeChanges` 并带上延迟列；无法断开的环只拖垮自己和下游 | AC#1～5   | 与适配器无关，用假远端与 PGlite `ScriptedRemote` 验收；不改服务端  |
| B    | ✅   | `rxdb_mutations` 支持延迟列（三遍执行、按实体原子）；Supabase 适配器发送延迟列；夹具对齐                 | AC#6～12  | SQL 回归全绿；`rxdb-change-grants.sql` 签名清单同步；迁移文档随 PR |
| C    | ✅   | 拉取：翻页补齐环内引用、单仓拉取把环放进一个本地事务；删除与级联两端一致；文档                           | AC#13～17 | 真栈 AC#13～16 通过；分支物化不再因环失败                          |

阶段 A 可以先合入：服务端还不支持时，Supabase 适配器的能力标志保持 `false`，环内需要延迟列的批次以 `remote-unsupported` 失败，不会推上去撞外键。阶段 B 拆成两个 PR：先 SQL 与回归（参数可选，单独合入安全），再适配器、夹具与真栈用例。

**前置**：[US-037](./US-037-push-order-by-foreign-key.md)。本故事在 US-037 的一次全量级联（`runCascade`）上按强连通分量调度。

## 范围边界

### In Scope

- 依赖图：边带上关系名与可空标记；用强连通分量取代整体抛错；在每个分量里确定性地选出断环边（只选可空外键）。
- 推送：环内成员的同一相位条目合进一次 `mergeChanges`，互相引用的行不拆到两次 RPC；需要延迟的外键列随请求发给远端。
- 远端协议：`rxdb_mutations` 新增可选参数 `p_deferred_columns`，在同一事务里先写置空的行，再补写延迟列，最后执行删除；补写失败按实体原子回滚并给出回执。
- 拉取：环内引用在本页与本地都找不到时续拉下一页；单仓拉取把整个环放进一个本地事务。
- 错误：无法断开的环（环上没有可空外键）、远端不支持延迟列、环内有 `Filter` / 分区成员的拉取，都给出指明环与原因的错误，只让环及其下游失败。
- 夹具对齐：shop 的 `User.idCard` 显式声明 `onDelete: SET_NULL`，与远端一致；不改核心默认值。
- 迁移文档与旧服务端识别：旧服务端收到延迟列参数时报 `PGRST202`，客户端给出指向迁移文档的错误。

### Out of Scope

- 跨仓推送的声明顺序问题：归 [US-037](./US-037-push-order-by-foreign-key.md)。
- 要求部署方把约束改成 `DEFERRABLE`：不作为前提。
- 两侧外键都是 `RESTRICT` / `NO ACTION` 时同批删除整个环：不支持，AC 只覆盖 `SET NULL` + `CASCADE` 的组合。
- 让一对一的一侧只做导航、不建外键列：会改实体模型与已有表结构，不在本故事。
- 三个及以上实体组成的环：机制相同，AC 只用两实体环验收。

## 验收标准

### 阶段 A：依赖图与客户端推送

| #   | 前置条件                                                        | 操作                 | 预期结果                                                                                                                         | 状态 |
| --- | --------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 注册 shop 夹具全部实体，`SyncType.Full`                         | `push()` 与 `pull()` | 都不抛 `Circular dependency`；没有变更的仓库正常返回                                                                             | ✅   |
| 2   | 两个实体互相持有非空外键（排不出顺序），本地有待推变更          | `push()`             | 环内仓库以 `RxDBForeignKeyCycleError`（`unbreakable`）失败，消息指明环上的关系并提示把一侧改为可空；下游被阻断；环外仓库照常推送 | ✅   |
| 3   | 远端适配器不支持延迟列；本地同批新建互相引用的 User 与 IdCard   | `push()`             | 这一环以 `remote-unsupported` 失败，不发请求、不删本地行；其他仓库照常推送                                                       | ✅   |
| 4   | 假远端；本地有两对互相引用的 User / IdCard，`batchSize = 1`     | `push()`             | 每对各一次 `mergeChanges`，同一对不拆开；请求带上延迟列 `shop.User.idCardId`                                                     | ✅   |
| 5   | PGlite + `ScriptedRemote`；远端拒绝环内一个成员（`dependency`） | `push()`             | 两个仓库的回执、被拒对齐与水位线在一个本地事务里落库，没有本地外键错误                                                           | ✅   |

### 阶段 B：服务端协议与 Supabase 适配器

| #   | 前置条件                                                                                 | 操作                                     | 预期结果                                                                         | 状态 |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- | ---- |
| 6   | 一次调用里有 User（`idCardId = X`）与 IdCard X（`ownerId` = 该 User）                    | `rxdb_mutations` 带 `p_deferred_columns` | 两行都写入，复合外键成立；日志的 `afterData` 是最终值；无被拒                    | ✅   |
| 7   | 同 AC#6，不带延迟列（旧客户端）                                                          | `rxdb_mutations`                         | 行为与现在一致：一个实体以 `dependency` 被拒                                     | ✅   |
| 8   | 同 AC#6，IdCard 的写入被 RLS 拒绝                                                        | `rxdb_mutations` 带延迟列                | 两个实体都被拒（User 的补写以 `dependency` 失败）；两行都不存在，没有日志        | ✅   |
| 9   | 延迟列不合格：非空、不是外键、是 `id`、列不存在、所在复合外键是 `MATCH FULL`、标识符非法 | `rxdb_mutations` 带该延迟列              | 以 RX003 拒绝，什么都不写                                                        | ✅   |
| 10  | AC#6 的同一次调用重复执行                                                                | `rxdb_mutations`                         | 幂等：没有重复写入与重复日志                                                     | ✅   |
| 11  | 服务端未升级（没有 `p_deferred_columns`）                                                | 客户端推送需要延迟列的批次               | 报 `SupabaseConfigError`，指向迁移文档；本地不对齐、不删行；没有环的模型照常推送 | ✅   |
| 12  | 真栈；本地同批新建互相引用的 User 与 IdCard                                              | `push()`                                 | 远端两行都在、互相引用一致，无被拒                                               | ✅   |

### 阶段 C：拉取与端到端

| #   | 前置条件                                      | 操作                                         | 预期结果                                                  | 状态 |
| --- | --------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- | ---- |
| 13  | 客户端 A 完成 AC#12                           | 客户端 B 以 `limit = 1` 调 `pull()`          | 环内引用跨页时续拉；B 本地两行都在、互相引用一致          | ✅   |
| 14  | 同 AC#13                                      | 客户端 B 调 `pullRepository('shop', 'User')` | 环内成员在一个本地事务里落库；两行一致                    | ✅   |
| 15  | 两端都有 AC#12 的数据                         | A 删除 IdCard 并推送，B 拉取                 | 远端与 B 本地的 `User.idCardId` 都为空，User 仍在，无被拒 | ✅   |
| 16  | 两端都有 AC#12 的数据                         | A 删除 User 并推送，B 拉取                   | 远端与 B 本地的 IdCard 一并消失                           | ✅   |
| 17  | 环内有一个成员是 `SyncType.Filter` 或分区实体 | `pull()`                                     | 这一环以 `pull-unsupported-member` 失败；其他仓库照常拉取 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：

| AC            | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1            | plugin-sync [push-repository.spec.ts](../../../packages/rxdb-plugin-sync/src/__tests__/push-repository.spec.ts)「外键成环的推送（US-038）」：注册了成环的实体，`push()` 不抛 `Circular dependency`，没有变更的仓库正常返回。PGlite [fk-cycle-push.spec.ts](../../../packages/rxdb-adapter-pglite/src/__tests__/fk-cycle-push.spec.ts)「注册 shop 夹具全部实体」：`@aiao/rxdb-test/shop` 的 `ENTITIES` 全部注册，`push()` 与 `pull({ fetchAll: true })` 都没有失败。[dependency-graph.spec.ts](../../../packages/rxdb-plugin-sync/src/__tests__/dependency-graph.spec.ts)「双向一对一成环」：shop 同形的模型断在 User 的两条外键（共用可空的 `idCardId`），成员先 User 后 IdCard                                                                                                                                                                                                                                                                                                                                                                                  |
| #2            | push-repository.spec AC#2：互相持有非空外键的 LockA ↔ LockB 以 `unbreakable` 失败，消息给出环路并提示把一侧改为可空；下游 LockChild 被依赖闸门挡下，环外仓库照常推送                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| #3            | push-repository.spec AC#3 与 PGlite「远端不支持延迟外键」：这一环以 `remote-unsupported` 失败，不发请求，本地两行与待推原样保留。环内的行没有互相引用时不带延迟列，远端不支持也照常推                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| #4            | push-repository.spec AC#4：两对、`batchSize = 1`，每对各一次 `mergeChanges`，同一对不拆开，带延迟列。PGlite AC#4 与 shop 夹具（含复合外键）：一次 `mergeChanges`，`deferredForeignKeys` 为 `shop.User.idCardId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| #5            | PGlite AC#5：远端以 `dependency` 拒绝证件、用户的补写随之失败：两个仓库的回执、被拒对齐与水位线在一个本地事务里落库，没有本地外键错误                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| #6～#10       | SQL 回归 `deferred-cycle`：AC#6 两行写入、复合外键成立、日志 `afterData` 是最终值；AC#10 重复调用幂等；AC#7 不带延迟列时以 `dependency` 被拒、什么都不写；AC#8 证件被 RLS 拒绝时两个实体都被拒、两行都不在、没有日志；另覆盖只改延迟列的修改、DELETE 在补写之后执行，并核实子事务回滚时 `rxdb.captured_deletes` 一起撤销。`deferred-columns-validation`（AC#9）：非数组、标识符非法、表或列不存在、`id`、非空、不属于外键、`MATCH FULL` 都以 RX003 拒绝，什么都不写。整套 53 个用例逐个通过，整体在一个事务里再跑一遍也通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| #11           | Supabase [deferred-foreign-keys.spec.ts](../../../packages/rxdb-adapter-supabase/src/__tests__/deferred-foreign-keys.spec.ts)：适配器声明支持；main 分支把延迟外键换成 `p_deferred_columns`；没有延迟外键或不是 main 分支时不带这个参数；服务端报 `PGRST202` 时抛 `SupabaseConfigError`、指向迁移文档，只发一次请求                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| #12～#16      | 真栈 [fk-cycle-sync.spec.ts](../../../packages/rxdb-adapter-supabase/src/__tests__/fk-cycle-sync.spec.ts)：两个客户端（各一个内存 wa-sqlite）在 shop 表上。A 同批新建互相引用的用户与身份证，一次推送 2 条、无被拒；B 以 `limit = 1` 拉取后两行一致；新客户端 `pullRepository('shop', 'User')`，环内成员一起落库；A 删身份证后，远端与 B 的 `idCardId` 都为空、用户还在；A 删用户后，远端与 B 的身份证一并消失。变异核实：去掉续拉补齐，AC#13 报 `FOREIGN KEY constraint failed`；去掉延迟外键，AC#12 的两行都被远端拒绝。本文件只建、只删自己的行，结束时按 id 清掉日志与历史                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| #13、#14、#17 | plugin-sync [pull-cycle.spec.ts](../../../packages/rxdb-plugin-sync/src/__tests__/pull-cycle.spec.ts)：一页在环中间截断时从被引用仓库的水位线续拉，续拉到的行再缺就接着拉，远端拉空就原样交回；环上有不支持的成员时判出这个环。[pull-batch.spec.ts](../../../packages/rxdb-plugin-sync/src/__tests__/pull-batch.spec.ts)「补齐外键环内的引用」：续拉发生在事务之前，两行在一个事务里落库；引用的行本地已有时不续拉。[pull-repository.spec.ts](../../../packages/rxdb-plugin-sync/src/__tests__/pull-repository.spec.ts)「级联把外键环当一个单元拉」：整个环交给一次只拉环上仓库的批量拉取，环外的父仓单独拉；环上有 `Filter` 或分区成员、环外父仓失败、批量拉取抛错时环上每个成员各记一条失败。[pull-cycle-gate.spec.ts](../../../packages/rxdb-plugin-sync/src/__tests__/pull-cycle-gate.spec.ts)：`pull()` 把这样的环与下游排除出批量、分区与条件拉取，各记一条失败。PGlite AC#13（`limit = 1`，两对都在一个事务里落库）、AC#14（`pullRepository` 拉环上的一个仓库）、AC#17（环上有 `Filter` 成员：这一环以 `pull-unsupported-member` 失败，环外的仓库照常拉） |
| 物化          | plugin-sync [branch-materialization-source.spec.ts](../../../packages/rxdb-plugin-sync/src/__tests__/branch-materialization-source.spec.ts)：注册了双向一对一的库照常冻结物化范围，环内成员连续；恢复「遇环抛错」时这条用例失败                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

复验命令：`pnpm nx test rxdb-plugin-sync -- src/__tests__/dependency-graph.spec.ts src/__tests__/topological-sort.spec.ts src/__tests__/push-repository.spec.ts src/__tests__/pull-cycle.spec.ts src/__tests__/pull-cycle-gate.spec.ts src/__tests__/pull-batch.spec.ts src/__tests__/pull-repository.spec.ts src/__tests__/branch-materialization-source.spec.ts`；`pnpm nx test rxdb-adapter-pglite -- src/__tests__/fk-cycle-push.spec.ts`（依赖从 dist 解析，先构建 `rxdb`、`rxdb-plugin-sync` 与 `rxdb-test`）；`pnpm nx test rxdb-adapter-supabase -- src/__tests__/deferred-foreign-keys.spec.ts`；SQL 回归 `pnpm nx run rxdb-adapter-supabase:sql-security-regressions`；真栈先 `pnpm nx run rxdb-adapter-supabase:test-env`，再 `pnpm nx test rxdb-adapter-supabase -- src/__tests__/fk-cycle-sync.spec.ts`。

## 技术笔记

- **断环边**：在每个强连通分量里先去掉全部可空边；还有环就标 `unbreakable`，记下按最小仓库键 DFS 得到的环；否则按 `(fromKey, property)` 排序逐条加回可空边，加回会成环的就是断环边。shop 夹具的断环边是 `User.idCardId`，成员顺序 `[User, IdCard]`。
- **排序**：在分量的凝聚图上做拓扑排序，环内成员连续排列，DELETE 相位倒序。没有环时输出与现在完全一致。
- **错误类型**：`RxDBForeignKeyCycleError`，`reason` 为 `unbreakable` / `remote-unsupported` / `pull-unsupported-member`，从 `index.ts` 导出。下游走现有的 `RxDBDependencyFailedError` 闸门。
- **核心契约**：`RxDBAdapterRemoteBase.mergeChanges` 加可选的第四个参数 `options?: { deferredForeignKeys }`，并加能力标志 `supportsDeferredForeignKeys`（默认 `false`）。第三方适配器忽略第四个参数会把环推上去撞外键，再被对齐删掉本地行，所以必须显式声明支持。`capture-mount-points.spec.ts` 对参数列表的断言要同步改。
- **合批**：环内条目按行用并查集分组——补丁里指向另一条目实体的环内外键值把两者并在一起；按 `batchSize` 贪心装批，单组超过上限就单独成批。延迟列只在本批确有非空值时才发。
- **服务端三遍执行**：
  1. 写 INSERT / UPDATE，延迟列先从载荷里拿掉（INSERT 缺键即 NULL，`DO UPDATE SET` 只改载荷里有的键），记下待补写的值；
  2. 在 DELETE 之前补写；23503 照常给出 `dependency` 与 `dependsOn`；
  3. 执行 DELETE。
     补写失败时整轮回滚、把该实体标为被拒后重试；排除集只增不减，循环必然收敛。配对校验、幂等跳过与日志都不变，`afterData` 本来就是最终值。
- **签名**：新增第七个参数 `p_deferred_columns jsonb DEFAULT '[]'`，`DROP` 旧的 6 参数签名，否则 PostgREST 无法在两个签名之间选择。授权清单 `production/rxdb-change-grants.sql` 手写了签名，要同步改。升级方式与 US-218 / US-220 相同：`psql --single-transaction -f 04 -f production/rxdb-change-grants.sql`；迁移文档写在 `website/docs/migration/supabase-fk-cycle-push.md`。
- **补写的权限**：补写是以调用者身份执行的 UPDATE，环上的表必须给行的创建者开 UPDATE 策略。
- **拉取补齐**：`closeCycleReferences` 收集本页环内成员的外键值，去掉本页最终存在的与本地已有的，还缺就续拉下一页；远端拉空了就让提交如实失败。远端加事务 id 列的做法要迁移系统表、只对 Supabase 有效，不采用。
- **与 US-229 的关系**：本故事重构 `rxdb_mutations` 第 3 步时，必须保留 US-229 加的变更历史写入。
- **实现时先核实**：子事务回滚时，`rxdb.captured_deletes` 的 GUC 变更会一起撤销（加一条回归用例证明）；拉取删除「已被本地级联删掉的行」时不报错（由 AC#16 验证）。

### 实现记录

- **断环与排序**按技术笔记实现：`findDependencyCycles`（Tarjan 强连通分量）给环上每个节点挂同一份 `DependencyCycle`，记着成员、环内外键与断环边，断不开时记 `unbreakable` 与环路。依赖图的边带上关系名、属性与可空标记（`DependencyForeignKey`），复合外键也成边；一条外键里有可空属性就算可空（`MATCH SIMPLE` 下一列为空就不检查）。shop 夹具的断环边有两条：关系外键 `idCard` 与复合外键 `id_card_owner_consistency`，共用可空的 `idCardId`。
- **文件与草案不同**：推送的切批在 `push-cycle.ts`（`planCycleBatches`），相位调度与回执分发留在 `push-repository.ts`（`runCyclePhase`、`pushCyclePlans`、`distributeCycleReceipts`），没有抽出 `push-plan.ts`；拉取补齐在 `pull-cycle.ts`；Supabase 只改了 `RxDBAdapterSupabase.ts`。`RxDBForeignKeyCycleError` 放在 `@aiao/rxdb-plugin-sync`，与 `RxDBDependencyFailedError` 同一层。
- **切批只按关系外键并组**：复合外键与断环的关系外键共用那一列，由关系外键带上，并查集只看单属性外键。
- **分支深度评审之后（2026-11-27）**：只由复合外键成的环原先不并组，互相引用的行会拆进两批、永远推不上去，拉取补齐同样看不到这种外键。依赖图的边改为记下 `referencedIdProperty`（关系外键是它那一列，复合外键是映射到被引用实体 `id` 的那一列），推送并组、延迟外键与拉取补齐都按它认出被引用的行；复合外键引用别的唯一列时仍认不出，见 sync.md「外键成环」。续拉补齐加了 16 页上限：被引用的行远端一直看不到时，不再把整段历史拉进内存。
- **远端能力**：`RxDBAdapterRemoteBase.supportsDeferredForeignKeys` 默认 `false`；`mergeChanges` 的第四个参数是 `RemoteMergeOptions`，其中 `deferredForeignKeys` 是 `RemoteDeferredForeignKey[]`。只在本批确有指向同批行的非空值时才带；Supabase 适配器只在 main 分支发 `p_deferred_columns`。
- **服务端三遍执行**：第 3 步抽成 `rxdb_mutations_apply_groups`；延迟列在 `rxdb_mutations_deferred_columns` 里校验，并换成按表的列清单；补写在 `rxdb_mutations_fill_deferred`。补写失败的实体与原因经 plpgsql 变量带出整轮回滚，`RX004` 只是内部的重来信号，不会抛给客户端。一开始用事务级设置传，它随子事务回滚一起撤销了；回归用例同时核实了 `rxdb.captured_deletes` 也会撤销，补写失败的那一轮不留脏的删除捕获。只改了延迟列的 UPDATE 在第一遍记为已写、直接跳过（否则是一条只有 `id` 的空 UPDATE），第二遍补写。同一个实体第二次补写失败直接抛错，循环必然收敛。
- **拉取**：补齐在 `pullBatch` 开事务之前做，因为要问远端，不能握着写事务。`pull()` 与 `pullRepository` 的级联把整个环当一个单元，经 `pullBatch` 的 `onlyRepositories` 一次拉进一个本地事务。环上有 `Filter` 或分区成员时，`pull()` 把这个环与它的下游排除出批量、分区与条件拉取，环上每个成员记一条 `pull-unsupported-member`，下游记 `RxDBDependencyFailedError`。
- **分支物化**：投影本来就在屏障那一笔事务里逐页执行，依赖图不再整体抛错就够了，物化代码没有改。
- **夹具对齐**：shop 的 `User.idCard` 显式 `onDelete: SET_NULL`。改动之后 PGlite 与 SQLite 全量套件（1697 / 846 条）通过。
- **已知限制**（本地全并行跑 dev-rxdb-supabase 远端 e2e 时发现）：删证件时，证件的删除走删除相位、客户的置空走新建/修改相位，是两次 `rxdb_mutations`。远端外键在第一次请求里就把 `idCardId` 置空了，但 `rxdb_mutations` 不给外键动作改动的行补日志，置空要等第二次请求才写进日志。两次请求之间，本地还没有这张证件、又在同一轮里拉到它的新建与删除的客户端（从头拉取的新客户端），客户还指着它，本地提交撞外键；这一轮不落库，下一次拉取恢复。这与环无关，任何 `SET NULL` 的外键都有同样的窗口，已写进 sync.md「推送顺序」。彻底修要让服务端像补级联删除的日志（US-224）那样，给外键动作置空的行补一条修改日志，本故事没有做。订单 e2e 改为文件内按顺序跑（与 CI 一致），不再让同文件的用例互相撞上这个窗口。
- **文档**：[relations.md](../../../website/docs/model-definition/relations.md#双向一对一)、[sync.md](../../../website/docs/collaboration/sync.md#外键成环)、[supabase.md](../../../website/docs/adapters/supabase.md#外键成环的三遍执行) 与迁移说明 [supabase-fk-cycle-push.md](../../../website/docs/migration/supabase-fk-cycle-push.md)。

## 实现文件

| 阶段 | 路径                                                                                            | 说明                                                   |
| ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| A    | `packages/rxdb-plugin-sync/src/dependency-graph.ts`、`topological-sort.ts`                      | 强连通分量、断环边、按环为单元的拓扑排序               |
| A    | `packages/rxdb-plugin-sync/src/push-cycle.ts`、`push-repository.ts`                             | 环内切批；环的相位调度与回执分发                       |
| A    | `packages/rxdb-plugin-sync/src/foreign-key-cycle-error.ts`                                      | `RxDBForeignKeyCycleError`                             |
| A    | `packages/rxdb/src/rxdb-adapter.ts`                                                             | `mergeChanges` 的 `options` 与能力标志                 |
| B    | `docker/sql/04-rxdb-utils-functions.sql`                                                        | `p_deferred_columns`、校验函数、三遍执行               |
| B    | `docker/sql/production/rxdb-change-grants.sql`                                                  | 签名清单                                               |
| B    | `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts`                                     | 发送延迟列、`PGRST202` 识别、能力标志                  |
| B    | `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql`            | `deferred-cycle` 与 `deferred-columns-validation` 用例 |
| B    | `packages/rxdb-test/shop/User.ts`                                                               | `idCard` 声明 `onDelete: SET_NULL`                     |
| C    | `packages/rxdb-plugin-sync/src/pull-cycle.ts`、`pull-batch.ts`、`pull-repository.ts`、`pull.ts` | 续拉补齐；环放进一个本地事务；补不齐的环与下游         |
| C    | `packages/rxdb-adapter-supabase/src/__tests__/fk-cycle-sync.spec.ts`                            | 两个客户端的真栈用例                                   |
| C    | `website/docs/`                                                                                 | `relations.md`、`sync.md`、`supabase.md` 与迁移文档    |

## References

- [US-005 关系映射](./US-005-relationship-mapping.md) — 一对一、多对一的外键列来由
- [US-037 全量推送按外键依赖排序](./US-037-push-order-by-foreign-key.md) — 前置
- [US-218 Supabase 远端启用 RLS 时的推送完整性](../adapter/US-218-supabase-rls-push-integrity.md) — 逐实体回执与配对校验
- [US-229 Supabase 远端变更历史](../adapter/US-229-supabase-change-history.md) — 同样改 `rxdb_mutations`
- [US-227 dev-rxdb-supabase 关系数据的推拉同步演示](../adapter/US-227-supabase-relational-sync-demo.md) — 阶段 C 依赖本故事
