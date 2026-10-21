---
id: US-222
title: 删分支之后按活查询列分支的地方不刷新：`log: false` 的实体删行派不出本地事件
status: In Review
priority: Medium
epic: epic-006-working-tree-commits
created: 2026-10-20
updated: 2026-10-20
tags: [adapter, reactive-query, branch, bug]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动适配器的本地事件派发（或分支表的通知），不依赖在途故事
- [x] Negotiable (可协商): 修法二选一（适配器为 `log: false` 实体补派事件 / 只给分支拓扑一个显式通知），owner 2026-10-20 定 A
- [x] Valuable (有价值): 三端 demo 的分支列表删分支后还列着已经不存在的分支，点它就是对一条不存在的分支做切换、合并
- [x] Estimable (可估算): 定了 A：两个适配器家族各一个派发小模块，挂在批量写入与仓库单删两条删行路径上
- [x] Small (小): sqlite-core（SQLite 系与 Tauri 共用）与 PGlite 各改两处
- [x] Testable (可测试): 活查询订阅分支表，建 / 删分支后逐次比对发出的行与库里的行
-->

# 用户故事：删分支之后按活查询列分支的地方不刷新

## 作为/我想要/以便

**作为** 用分支管理界面的用户，以及按活查询列分支的组件作者
**我想要** 删掉一条分支之后，按活查询列出来的分支列表立刻不再有它
**以便** 不会对一条已经不存在的分支做切换、合并之类的操作

## 症状

在 PGlite 上实测（`store: 'memory'`，装历史插件），订阅 `rxdb.entityManager.getRepository(RxDBBranch).findAll()` 两条：
一条按 `parentId = 'main'` 过滤，一条不过滤。

| 步骤                      | 子分支查询发出 | 全部分支查询发出  |
| ------------------------- | -------------- | ----------------- |
| 初始                      | `[]`           | `[main]`          |
| `createBranch('feature')` | `[feature]`    | `[main, feature]` |
| `removeBranch('feature')` | **不再发出**   | **不再发出**      |

三端 demo 的分支列表（工作树页的分支下拉、`branch-manager`）都是 `useFindAll(RxDBBranch, …)`。三端 e2e 只验证了分支右键菜单里有
`Delete…`，没有真去删，所以没有用例抓到这一处。

## 根因

- `RxDBBranch` 声明 `log: false`（`packages/rxdb/src/system/branch.ts`），没有变更日志触发器。
- 写变更日志的实体，本地事件（`EntityLocalCreatedEvent` / `EntityLocalUpdatedEvent` / `EntityLocalRemovedEvent`）由变更日志行推导，
  删除带着 `inversePatch`。不写变更日志的表里，只有分支表与迁移表走另一条路：SQLite 系的 `update_hook`、PGlite 的 `NOTIFY`
  只盯变更日志、分支、迁移三张表，拿到被改的行号，`handle_rxdb_change.ts` 再按行号回查行、据此派事件
  （sqlite-core 的 `handle_system_table`，PGlite 的 `dispatchEntityTableEvent`）。其余 `log: false` 的表连行号都没有，一个事件也派不出。
- 插入、更新时回查得到行，事件里有实体；**删除时行已经没了，回查为空**：sqlite-core 派出一个不含实体的删除事件，PGlite 直接不派。
  活查询无从删起。建分支能被看到、删分支看不到，就是这个差别。
- `remove_branch` 在事务里用 `executor.removeMany([...变更行, 分支行])` 删掉分支行，正落在这条路上。
- 同样的原因也让激活状态的变化不一定传到活查询：`findOne({ activated: true })` 这类查询在来回切分支、再清库之后可能停在旧分支上
  （US-315 的共享套件在 SQLite 系与 Tauri 上实测）。`VersionManager` 切分支后显式调 `HistoryManager.setUndoBranch()`，就是因为不能信它。
- 同样声明 `log: false` 的还有 storage 插件的 `StorageFileMeta`（[US-311](../collaboration/US-311-unlogged-entities-scope.md)），
  以及只读检出位快照实例的全部实体（[US-313](../collaboration/US-313-read-only-checkout.md)）。它们的活查询有没有同样的缺口要一起核对。

## 范围边界

### In Scope

- 删分支（`removeBranch()`，以及 `mergeBranch()` 顺手删源分支）之后，按活查询列分支的地方立刻反映
- 核对其余 `log: false` 实体的活查询有没有同样的缺口
- 六个后端的一致性用例；三端 demo 补一条真删分支的 e2e

### Out of Scope

- 变更日志本身：`log: false` 的实体照旧不写变更日志、不进版本化域

## 修法 A：删行时手上有实体就直接派删除事件

owner 2026-10-20 定，随 PR #122 交付（原 #140，2026-10-21 并入 #122）。删行的两条路——批量写入（`rxdb_adapter_mutations`，`removeMany()` / `mutations()` 走这里）
与仓库的单删（`entity.remove()` 走这里）——删的时候手上都有被删的实体：对关掉变更日志的实体，删完就按这些实体派
`EntityLocalRemovedEvent`。行号回查那条路改为跳过这些表的删除，见下。

- **只派删除**：分支表插入、更新的行号回查查得到行，七个后端实测建分支都送得到；只有删除回查为空。
- **其余 `log: false` 的表只补上删除**（In Scope 里那条核对的结论）：`StorageFileMeta` 与插件登记的系统表不在行号监听之列，
  插入、更新原先就没有事件，现在照旧没有：订阅它们的活查询看得到删除，看不到新增与修改。这是
  [US-311](../collaboration/US-311-unlogged-entities-scope.md) 定下的范围（storage 自带 `watch()`），不在本故事。
- **代价**：插件内部表（工作树的物化分页与工作树条目、replay 的录制事件等）批量删行时，也派一条带整行的删除事件，
  并经跨标签页网关广播；这些表没有活查询，事件没人收。量与删掉的行数成正比，只出现在物化、提交、删录制这些本来就重的操作里
  （物化随后的切分支也按切换的行派事件）。要省掉，可以把插件登记的系统表排除在外。
- **事务语义由核心兜着**：在事务里派的事件排进本事务的队列，提交才发出、回滚丢弃。
- **行号回查跳过这些表的删除**：它查不到被删的行，只会撞上实体缓存里的旧实体，或复用了这个行号（PGlite 是同一个 id）的新行。
  测试清库裸删 main 又补回，这样一条迟到的删除会把补回的 main 从活查询里抹掉：wa-sqlite 按完整顺序跑共享套件时，
  本故事的用例第一步就读到 `[]`。跳过之后，删除事件只有删行路径一个来源，也就不再重复。变更日志表的删除原先就不派事件，跳过与否结果相同。
- **变更日志表除外**：`RxDBChange` 也是 `log: false`，但它的删除来自压缩与删分支，影响历史视图，不在本故事。
- **没选 B（分支拓扑单独通知）**：只修分支表，其余关掉变更日志的实体（`StorageFileMeta`、插件系统表）照旧。
- **裸 SQL 删行看不见**：只有测试清库，以及系统表升级时给重名的迁移记录去重这么删，两处都没有活查询。

## 验收标准

| #   | 前置条件                                                 | 操作                               | 预期结果                                                                                | 状态 |
| --- | -------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- | ---- |
| 1   | 订阅分支表的活查询，七个后端（含 Tauri）                 | `createBranch()`、`removeBranch()` | 每一步之后发出的行与库里的行一致                                                        | ✅   |
| 2   | 三端 demo 的分支下拉里有一条非当前分支                   | 删掉它                             | 列表里立刻没有它（三端 e2e；关掉修复时这一步红）                                        | ✅   |
| 3   | `mergeBranch()` 合并之后删源分支                         | 合并                               | 分支列表同样立刻反映                                                                    | ✅   |
| 4   | 修法 A：其余 `log: false` 实体（`entity.remove()` 单删） | 删行                               | 它们的活查询同样立刻反映                                                                | ✅   |
| 5   | 测试清库裸删分支行、再补回 main                          | 下一条用例订阅分支表               | 发出 `[main]`，不被行号回查派出的迟到删除抹掉（两个适配器的单测；wa-sqlite 按完整顺序） | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **US-315 的绕行**：历史插件的子分支分叉点不订阅分支表的活查询，每次现查库里的激活分支与它的子分支，
  在建、删、合并、切分支与从提交建分支之后显式重查（[US-315](../collaboration/US-315-undo-inherited-change-switch-corruption.md)）。
  常驻一条「全部分支」的活查询会被别人同条件的查询共用：sqlite / sqliteai 上的检出位一致性套件因此读到 `['main']`，
  当时推断是建分支的事件没送到。修的时候核对过：本故事的共享套件在七个后端上订阅分支表，同一连接上建分支的插入都送得到，
  这个推断不成立。那次读到旧值的确切路径没再追；历史插件不再常驻这条查询之后，它没再出现。
- **测试清库要等时钟走过清空 undo 会话的那一毫秒**：共享套件的 `cleanup_db` 清空 undo 会话之后，下一条用例的第一次写入
  要靠变更行的记录时间（毫秒）严格晚于清空时刻才能恢复会话（`HistoryManager.resetSyncCleared`）。从前清库产生的行号删除通知
  要回查一趟库，碰巧把写入拖过了这一毫秒；跳过之后写入更快，sqlite-wasm 全量里 US-315 的两条用例 3 次挂 2 次，撤销数一直是 0
  （插桩看到记录时间与清空时刻同为 `…37.069Z`）。`cleanup_db` 现在等时钟走过这一毫秒再返回，修后连跑 4 次全过。
  产品里的严格比较是有意的：同一毫秒里的写入分不清是清空前迟到的通知，还是清空后的新写入，宁可这一次不恢复。
- **来源**：US-315 补「删掉子分支之后限制解除」用例时，撤销视图在删分支之后不更新，追下去是这条活查询收不到删除。

## 实现文件

- `packages/rxdb-adapter-sqlite-core/src/unlogged-removal-events.ts`、`packages/rxdb-adapter-pglite/src/unlogged-removal-events.ts` — 派发
- 两个适配器的 `rxdb_adapter_mutations.ts`（批量写入）与 `repository/*Repository.ts` 的 `remove()`（单删）— 挂载点
- 两个适配器的 `handle_rxdb_change.ts` — 行号回查跳过关掉变更日志的表的删除
- 用例：SQLite 共享分支套件「分支表的活查询跟得上建分支、删分支（US-222）」（五个 SQLite 后端与 Tauri）、
  PGlite `version/branch_live_query.spec.ts`、两个适配器的 `handle_rxdb_change.spec.ts`（行号回查不派删除）、
  三端 e2e `working-tree.spec.ts`「删分支（US-222）」
- `packages/rxdb-adapter-sqlite-core/src/__tests__/test-utils.ts` — 清库之后等时钟走过清空 undo 会话的那一毫秒（单测见同目录 `test-utils.spec.ts`）

## References

- [US-315 撤销子分支已继承的变更之后，切回父分支写错数据](../collaboration/US-315-undo-inherited-change-switch-corruption.md) — 发现处
- [US-311 不写变更日志的实体与插件系统表退出草稿缓存与版本化域](../collaboration/US-311-unlogged-entities-scope.md) — `log: false` 的归类
