---
id: US-222
title: 删分支之后按活查询列分支的地方不刷新：`log: false` 的实体删行派不出本地事件
status: Backlog
priority: Medium
epic: epic-006-working-tree-commits
created: 2026-10-20
updated: 2026-10-20
tags: [adapter, reactive-query, branch, bug]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动适配器的本地事件派发（或分支表的通知），不依赖在途故事
- [ ] Negotiable (可协商): 修法二选一（适配器为 `log: false` 实体补派事件 / 只给分支拓扑一个显式通知），待 owner 定
- [x] Valuable (有价值): 三端 demo 的分支列表删分支后还列着已经不存在的分支，点它就是对一条不存在的分支做切换、合并
- [ ] Estimable (可估算): 修法定了才估得出
- [x] Small (小): 修法 B 是历史插件内的改动；修法 A 是六个后端事件派发路径上的一处补派
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
  删除带着 `inversePatch`。不写变更日志的表走另一条路：SQLite 系靠 `update_hook`、PGlite 靠 `NOTIFY`，只拿到被改的行号，
  `handle_rxdb_change.ts` 再按行号回查行、据此派事件（sqlite-core 的 `handle_system_table`，PGlite 的 `dispatchEntityTableEvent`）。
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

## 修复方向（待 owner 定）

| 修法                         | 做法                                                                                                                                              | 代价                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A 批量删除路径直接派删除事件 | `rxdb_adapter_mutations` 删行时手里就有被删的实体：对不写变更日志的实体，在事务提交之后按这些实体派 `EntityLocalRemovedEvent`；行号回查那条路不动 | 覆盖所有不写变更日志的实体；只有两份实现（sqlite-core 供 SQLite 系与 Tauri，PGlite 一份）；裸 SQL 删行照旧看不见（只有测试清库这么删） |
| B 分支拓扑单独通知           | 建、删、合并删源分支之后由 `VersionManager` 派一个分支变更信号，分支列表的活查询（或它的订阅方）据此重查                                          | 只修分支表，改动集中在历史插件；其余不写变更日志的实体同样的问题另算                                                                   |

## 验收标准

| #   | 前置条件                                     | 操作                               | 预期结果                         | 状态 |
| --- | -------------------------------------------- | ---------------------------------- | -------------------------------- | ---- |
| 1   | 订阅分支表的活查询（过滤与不过滤），六个后端 | `createBranch()`、`removeBranch()` | 每一步之后发出的行与库里的行一致 | ⬜   |
| 2   | 三端 demo 的分支下拉里有一条非当前分支       | 删掉它                             | 列表里立刻没有它（e2e）          | ⬜   |
| 3   | `mergeBranch()` 合并之后删源分支             | 合并                               | 分支列表同样立刻反映             | ⬜   |
| 4   | 修法 A：其余 `log: false` 实体               | 删行                               | 它们的活查询同样立刻反映         | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **US-315 的绕行**：历史插件的子分支分叉点不订阅分支表的活查询，每次现查库里的激活分支与它的子分支，
  在建、删、合并、切分支与从提交建分支之后显式重查（[US-315](../collaboration/US-315-undo-inherited-change-switch-corruption.md)）。
  常驻一条「全部分支」的活查询会被别人同条件的查询共用：sqlite / sqliteai 上建分支的事件也没送到，共用的缓存停在旧值，
  检出位一致性套件因此读到 `['main']`。插入在这两个后端上也靠不住，修的时候要一并核对。
- **来源**：US-315 补「删掉子分支之后限制解除」用例时，撤销视图在删分支之后不更新，追下去是这条活查询收不到删除。

## 实现文件

修法定了再填。

## References

- [US-315 撤销子分支已继承的变更之后，切回父分支写错数据](../collaboration/US-315-undo-inherited-change-switch-corruption.md) — 发现处
- [US-311 不写变更日志的实体与插件系统表退出草稿缓存与版本化域](../collaboration/US-311-unlogged-entities-scope.md) — `log: false` 的归类
