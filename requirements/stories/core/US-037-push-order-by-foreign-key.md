---
id: US-037
title: 全量推送按外键依赖排序：子实体声明在前时不再被拒并删掉本地行
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-11-25
updated: 2026-11-25
tags: [core, sync, push, relationship]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只改同步插件的依赖图、跨仓推送顺序与汇总；不改远端回执协议（US-218），不改依赖图对环的处理（US-038）
- [x] Negotiable (可协商): 事件序列与 `BulkSyncResult` 的映射细节留待实现时定；做法已定，见技术笔记
- [x] Valuable (有价值): 父子行同批新建时，结果不再取决于 `config.entities` 的书写顺序；子行不会被远端当成终态拒绝、在本地被删掉
- [x] Estimable (可估算): 依赖图补边 + `runCascade` 抽取 + `bulkSync` 推送路径 + `push()` 汇总；单测按 `mergeChanges` 调用序列断言，Supabase 真栈补外键用例
- [x] Small (小): 一个 PR
- [x] Testable (可测试): 真栈上可复现（见「现状」）
-->

# 用户故事：全量推送按外键依赖排序

## 作为/我想要/以便

**作为** 用 `SyncType.Full` / `SyncType.Filter` 同步关系模型的应用开发者
**我想要** `syncManager.push()` 按外键依赖顺序把各仓库推上远端，与 `config.entities` 的声明顺序无关
**以便** 父行和子行同批新建时，子行不会因为声明在前就先到远端撞上外键，被拒绝并在本地被删掉

## 现状

不带过滤的 `push()` 逐个仓库推送，顺序就是声明顺序；每个仓库的级联只带下游，不带上游。

1. [`getRepositoriesToSync`](../../../packages/rxdb-plugin-sync/src/bulk-sync.ts) 按 `config.entities` 的顺序列出仓库，`bulkSync` 默认顺序逐个推：

   ```ts
   for (const EntityClass of rxdb.config.entities) {
   ```

2. 单个仓库推送默认 `includeRelated: true`，[`pushWithCascade`](../../../packages/rxdb-plugin-sync/src/push-repository.ts) 只沿 `requiredBy` 收子仓：

   ```ts
   for (const child of d.requiredBy) {
   ```

   子实体声明在父实体前面时，轮到子仓那一次级联里只有它自己，父行这时还没到远端。级联内部的两个相位（`PUSH_PHASES`：DELETE 子先父后、INSERT/UPDATE 父先子后）只排同一次级联里的仓库，排不到声明在后面的父仓。

3. 远端按外键违例拒绝这一条：Supabase 的 [`rxdb_mutations_replay_group`](../../../docker/sql/04-rxdb-utils-functions.sql) 把 23503 记成 `'reason', 'dependency'` 并附上 `dependsOn`。

4. 客户端把被拒当成终态。被拒的源变更写上 `rejectedAt`，[`queryUnpushedChanges`](../../../packages/rxdb-plugin-sync/src/push-repository.ts) 不再把它当待推变更（`{ field: 'rejectedAt', operator: '=', value: null }`）；远端没有这一行时，[`addAlignmentAction`](../../../packages/rxdb-plugin-sync/src/push-repository.ts) 删掉本地行：

   ```ts
   if (entry.actionKind !== 'deletes') {
     alignment.removals.deletes.set(entry.key, { patch: null, inversePatch: null });
   ```

5. 汇总少计、失败丢失。[`push`](../../../packages/rxdb-plugin-sync/src/push.ts) 只累加每个目标仓自己的 `result.result?.pushResult`；级联顺带推上去的仓库挂在 `relatedResults` 上，不进汇总，轮到它自己时又已经没有待推变更。失败也只在目标仓失败时才记：

   ```ts
   if (result.success) continue;
   ```

   目标仓成功而关联仓失败时，这条失败不会出现在 `push()` 的 `failures` 里（读代码得出，未实测）。

6. 依赖图漏边。[`buildDependencyGraph`](../../../packages/rxdb-plugin-sync/src/dependency-graph.ts) 只读实体自己声明的 `relations`，不读继承链合并后的 `relationMap`，也不读实体级复合外键 `foreignKeys`：

   ```ts
   interface DependencyGraphEntityMetadata {
     name: string;
     namespace: string;
     relations?: readonly DependencyGraphEntityRelation[];
   }
   ```

   [`SchemaManager`](../../../packages/rxdb/src/schema/SchemaManager.ts) 生成中间表时就为此改读 `relationMap`：「关系声明在父类上时，子类的 relations 是空的」。关系声明在父类上、或只用 `foreignKeys` 声明的外键，都不会成为依赖边，排序照样出错（读代码得出，未实测）。

7. 系统表也被当成推送目标。库级配置为 `SyncType.Full` 时，`getRepositoriesToSync` 不排除系统实体；下面 US-038 的复现里，`push()` 的 `failures` 列出了 `RxDBBranch`、`RxDBChange`、`RxDBSync` 等系统表。

复验方式（实测，用例未入库）：在本 checkout 的 Supabase 测试栈（`rxdb-adapter-supabase:test-env`）上声明两个映射到 shop 表的实体：`User`（`shop.user`）与 `Order`（`shop."order"`，`owner` 为 MANY_TO_ONE → `User`，远端有 `order_ownerId_fkey`）。本地先存一个 User，再存一条引用它的 Order，调 `syncManager.push()`：

- 声明为 `[Order, User]`：返回 `pushed: 1, rejected: 1`；远端只有 user 行；本地 Order 被删除，它的源变更 `rejectedAt` 非空；`syncState.snapshot.lastRejections` 里是这条 Order 的 INSERT，`code: '23503'`、`reason: 'dependency'`，`dependsOn` 指向同一次 `push()` 随后送达的那个 User。
- 声明为 `[User, Order]`：两行都到了远端，本地 Order 保留并拿到 `remoteId`，无被拒；返回的 `pushed` 却是 1（第 5 点）。

单仓推送子仓（`syncManager.pushRepository('shop', 'Order')`）同样不会先推父仓：级联方向只有 `requiredBy`，父行没推时第 3、4 点照样发生（**推断**，由第 2 点的代码得出，未单独实测）。

## 范围边界

### In Scope

- 全量推送（`push()` 不带 `repositoryFilter`）：跨仓提交顺序只由依赖图决定——DELETE 子先父后、INSERT/UPDATE 父先子后，与 `config.entities` 的顺序无关。
- 带 `repositoryFilter` 的推送：点名的仓库之间同样按依赖排序。
- 单仓推送：推目标所在的连通分量（沿 `dependsOn` 与 `requiredBy` 双向闭包），父行先于子行到远端。
- 依赖图补边：继承链合并后的关系（`relationMap`）与实体级复合外键（`foreignKeys`）都成为依赖边。
- `PushResult` 汇总：每个仓库只计一次，包括级联顺带推送的仓库；关联仓的失败进 `failures`；`originalCount = pushed + failed + rejected + compacted` 不变。
- 枚举推送目标时排除系统表。

### Out of Scope

- 依赖图成环（双向一对一）：归 [US-038](./US-038-bidirectional-one-to-one-sync.md)。
- 被拒语义：远端确实没有父行（例如已被别的客户端删除）时，`dependency` 仍按 [US-218](../adapter/US-218-supabase-rls-push-integrity.md) 当终态并对齐本地。
- 同一仓库内的自引用外键（树）：沿用单次 `mergeChanges` 内的顺序。
- 拉取方向：[`pullBatch`](../../../packages/rxdb-plugin-sync/src/pull-batch.ts) 已按 `topologicalSortForPull` 的顺序在一个本地事务里落库。

## 验收标准

| #   | 前置条件                                                                                                         | 操作                                                     | 预期结果                                                                                  | 状态 |
| --- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---- |
| 1   | 实体声明为 `[Order, User]`（Order MANY_TO_ONE → User）；本地新建 User 与引用它的 Order，都未推送                 | `syncManager.push()`                                     | 远端两行都在；无被拒；本地 Order 保留，源变更拿到 `remoteId`                              | ⬜   |
| 2   | 三层模型声明为 `[OrderItem, Order, User]`；三层同批新建                                                          | `push()`                                                 | 三行都到远端，无被拒                                                                      | ⬜   |
| 3   | 实体声明为 `[Order, User]`；远端已有 User1 与它的 Order1；本地删除 Order1、User1，并新建 User2 与引用它的 Order2 | `push()`                                                 | 远端只剩 User2 与 Order2；四条变更都被接受，无 23503                                      | ⬜   |
| 4   | 本地新建 User 与引用它的 Order，都未推送                                                                         | `push()` 带 `repositoryFilter`，依次点名 Order、User     | 同 AC#1                                                                                   | ⬜   |
| 5   | 本地新建 User 与引用它的 Order，都未推送                                                                         | 只推子仓：`syncManager.pushRepository('shop', 'Order')`  | User 与 Order 都被推上去，User 在前；Order 被接受，无被拒                                 | ⬜   |
| 6   | 实体声明为 `[User, Order]`；本地新建 User 与引用它的 Order                                                       | `push()`                                                 | 返回 `pushed: 2, rejected: 0`                                                             | ⬜   |
| 7   | 远端的父行已被别的客户端删除；本地新建引用它的子行                                                               | `push()`                                                 | 子行仍以 `dependency` 被拒并对齐本地（US-218 语义不变）                                   | ⬜   |
| 8   | 外键关系声明在父类上，子类实体声明在被引用实体之前；同批新建                                                     | `push()`                                                 | 被引用的行先到远端，无被拒                                                                | ⬜   |
| 9   | 实体 A 只用实体级 `foreignKeys` 引用实体 B，A 声明在前；同批新建                                                 | `push()`                                                 | B 的行先到远端，无被拒                                                                    | ⬜   |
| 10  | 目标仓推送成功，同一次级联里的关联仓推送失败                                                                     | `push()`                                                 | 关联仓出现在 `failures` 里；`failed` 与各计数满足 `originalCount` 等式                    | ⬜   |
| 11  | 库级 `SyncType.Full`，注册了业务实体                                                                             | `push()`                                                 | 结果、`failures` 与仓库事件里都不出现系统表（`RxDBBranch`、`RxDBChange`、`RxDBSync` 等） | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：待实现。AC#1～#6、#8～#11 由 `rxdb-plugin-sync` 单测与 `rxdb-adapter-pglite` 的 `sync-push-integrity.spec.ts`（`ScriptedRemote`）断言 `mergeChanges` 的调用顺序与汇总；AC#1、#3、#5、#7 另由 `rxdb-adapter-supabase` 真栈用例在 shop 表的外键上复验。

## 技术笔记

- 做法：全量推送不再逐仓各起一次级联，改为对全部有推送资格的仓库建一次依赖图，按现有两个相位一次推完。从 `pushWithCascade` 抽出 `runCascade(sm, graph, repoKeys, options, inFlight, rejections)`：按相位排序 → `runCascadePhase` → `commitPushPlans` 一次提交，依赖闸门（`findBlockingDependency`）沿用。
- 只按父在前排序不够：`pushRepository(User)` 的级联 `{User, Post}` 不含 Post 的其他父仓（如 Category），Post 引用新建的 Category 行时照样会撞外键。
- 单仓推送取连通分量，而不是只收父仓：提交会把每个仓库的水位线推过它的全部待推变更（`maxPlanChangeId`），带进来的父仓的待推 DELETE 又需要它的其他子仓先删。
- `bulkSync`：`'push'` 走一次 `runCascade`，再把各仓库结果映射回 `BulkSyncResult.results`，返回形状不变；`'sync'` 先逐仓拉取，再统一推送。
- 系统表的排除口径参照 `sync-listeners` 的 `consumerEntities`。
- 事件：提交后每个仓库仍发一次 `REPOSITORY_SYNC_COMPLETE`，历史插件靠它重算待推数。
- `PushInFlightSession`：一次 `push()` 里同一仓库只规划、只认领一次（`runCascade` 的节点表按仓库键去重）。
- `forkPointPending` 的补推条件随汇总口径修正：只推了关联仓时也要补推分支。
- 需要同步改的既有断言：`contracts/push-repository.spec.ts`（事件序列）、`sync-repository.boundaries.spec.ts`、`sync-entrypoints.spec.ts`（`PushResult` 的精确 `toEqual` 与 bulkSync 参数）、`push-filter.spec.ts`、`push-batch-size.spec.ts`、`contracts/sync-manager-api.spec.ts`。
- 真栈用例读远端、做清理都用 `createAuthenticatedTestClient()`：service role 没有 shop schema 的权限。

## 实现文件

- `packages/rxdb-plugin-sync/src/dependency-graph.ts` — 读 `relationMap` 与 `foreignKeys`
- `packages/rxdb-plugin-sync/src/push-repository.ts` — `runCascade`、连通分量
- `packages/rxdb-plugin-sync/src/bulk-sync.ts`、`push.ts` — 全量推送的跨仓顺序、系统表排除与汇总
- `packages/rxdb-plugin-sync/src/__tests__/` — 顺序与计数单测
- `packages/rxdb-adapter-pglite/src/__tests__/sync-push-integrity.spec.ts` — 子在前声明的端到端用例
- `packages/rxdb-adapter-supabase/src/__tests__/` — shop 表外键真栈用例

## References

- [US-218 Supabase 远端启用 RLS 时的推送完整性](../adapter/US-218-supabase-rls-push-integrity.md) — 逐实体回执、`dependsOn` 与被拒实体本地对齐的来由
- [US-038 双向一对一的实体能开同步](./US-038-bidirectional-one-to-one-sync.md)
- [US-227 dev-rxdb-supabase 关系数据的推拉同步演示](../adapter/US-227-supabase-relational-sync-demo.md) — 端到端守住本故事
