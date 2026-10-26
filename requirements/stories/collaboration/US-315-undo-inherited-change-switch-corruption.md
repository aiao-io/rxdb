---
id: US-315
title: 撤销子分支已继承的变更之后，切回父分支写错数据
status: In Review
priority: High
epic: epic-006-working-tree-commits
created: 2026-10-19
updated: 2026-10-20
tags: [collaboration, branch, undo, history]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动历史插件的撤销 / 重做候选或切换增量，不依赖其他在途故事
- [x] Negotiable (可协商): 修法二选一（禁止撤销已被继承的变更，或切换时从父分支一侧重算），owner 2026-10-20 定 A
- [x] Valuable (有价值): 用户照常操作就会把父分支的数据写错，且不报错
- [x] Estimable (可估算): 定了 A：历史插件的撤销 / 重做候选、核心一个接口两个成员、三端实体列表的说明文案
- [x] Small (小): 历史插件内的改动，加六个后端的一致性用例与三端按钮说明
- [x] Testable (可测试): 复现步骤是确定性的，切回父分支后的值与「撤销之后、切走之前」逐行对照
-->

# 用户故事：撤销子分支已继承的变更之后，切回父分支写错数据

## 作为/我想要/以便

**作为** 在本地优先应用里用分支与撤销的用户
**我想要** 在父分支上撤销建分支之前的改动之后，来回切换分支，父分支读到的仍是撤销之后的数据
**以便** 切换分支不会悄悄改掉我的数据

## 症状

在 PGlite 上复现（`RxDBAdapterPGlite`，`store: 'memory'`，只装历史插件），一条 Todo：

| 步骤                                                                 | main 上读到的 `title` |
| -------------------------------------------------------------------- | --------------------- |
| main 上建成 `a`，再改成 `b`；`createBranch('feature')`               | `b`                   |
| 切到 feature，改成 `c`；切回 main；`versionManager.history().undo()` | `a`（撤销生效）       |
| 切到 feature（读到 `c`），再切回 main                                | **`b`**，应为 `a`     |

不报错，切回来的 main 就是错的值。同一处缺陷让 US-312 的对比与合并预览跟着失真（它们与切换用同一份增量）：
`compareBranches('main', 'feature')` 给出 main 一侧的值 `b`，`previewMerge('feature')` 的目标当前值也是 `b`、覆盖标注为空——
main 在 feature 分叉之后把 `title` 改回了 `a`，合并会把它盖成 `c`，本该标 `overwrite`。

## 根因

由读源码与上面的复现确认：

1. **撤销能改动子分支已继承的历史。** 撤销的候选是 active 分支、本会话、边界之后的变更
   （[`undo-redo-apply.ts`](../../../packages/rxdb-plugin-history/src/undo-redo-apply.ts)），不看有没有子分支在它之后分叉。
   被撤销的变更只打上 `revertChangeId`，此后所有按 `revertChangeId = null` 过滤的查询都看不见它。
2. **子分支的反向补丁记的是撤销之前的值。** feature 改 `title` 时记下的 `inversePatch` 是 `b`（分叉时继承的值）；
   main 随后撤销 `a → b` 那一笔，feature 那条变更行的 `inversePatch` 不会跟着变。
3. **切回父分支时，切换增量逐段反向应用子分支的变更**
   （[`switch-branch-actions.ts`](../../../packages/rxdb-plugin-history/src/switch-branch-actions.ts) 的 `compute_branch_transition_actions`）：
   反向应用 feature 那条得到 `b`；main 上「分叉点 → tip」那一段里的 `a → b` 已被撤销、被过滤掉，于是没有任何东西把它改回 `a`。

只在「子分支在分叉之后改过、父分支随后又撤销了分叉之前的那一笔」时出现：子分支没碰过的实体、或撤销发生在子分支改动之前，
切换都是对的。redo 同理：重做一笔已被继承范围覆盖、却在分叉时还处于撤销状态的变更，同样会让子分支记下的反向补丁过期。

## 范围边界

### In Scope

- 撤销 / 重做不越过子分支的分叉点；栈停在那里时说明原因（`HistoryScopeAPI.undoBarrier$` / `redoBarrier$`，三端实体列表的按钮）
- 切回父分支（以及沿父链跨多级切换）读到的数据与父分支此刻的真实数据逐行一致，对比与合并预览随之一致
- 六个后端的一致性用例

### Out of Scope

- 撤销 / 重做的其余交互形态（撤销栈的容量、作用域选取）
- 远端同步写入的回滚（`remote_sync` 不经撤销）
- 分支表删行的活查询通知：`RxDBBranch` 不写变更日志，适配器派不出删除事件，按活查询列分支的地方删分支后都不刷新。
  本故事只在历史插件里绕开（见技术笔记），根上的缺口见 [US-222](../adapter/US-222-unlogged-entity-delete-live-query.md)

## 修法 A：撤销 / 重做不越过子分支分叉点

owner 2026-10-20 定。撤销与重做的候选去掉「当前分支上、不晚于某条子分支分叉点」的变更：被继承的变更都比可撤销的早，排除它们等于让栈停在分叉点，
不会跳着撤；重做截在第一项被继承的之前，不跳过它去重做后面的。不一致的状态从源头上不再出现，切换、对比与合并预览都不用改。

- **代价（已接受）**：建分支之前的改动，建完分支就撤不了，与 git「分支所基于的历史不改写」一致；要改回去就再改一次。
  删掉继承它们的子分支之后限制解除（有子分支的分支本来就删不掉，父链不会断）。
- **说明原因**：`HistoryScopeAPI` 新增 `undoBarrier$` / `redoBarrier$`，栈停在分叉点时发 `{ reason: 'inherited_by_branch', branchIds }`。
  `undo()` / `redo()` 撤到那一步时什么也不做、不抛错，与「没有可撤的」同一个结果：三端现有的入口都是 `void history.undo()`，
  抛错只会变成未处理的拒绝。三端实体列表在按钮停用时把说明放进 `title`（文案在 `@aiao/rxdb-model` 的 `describeHistoryBarrier`）。
- **没选 B（切换时从父分支一侧重算）**：动的是六个后端共用的切换核心路径，对比与预览的基准也要换成同一套算法，被碰过的实体越多越贵；
  A 只动撤销 / 重做的候选。

## 验收标准

| #   | 前置条件                                                      | 操作                                                            | 预期结果                                                                                              | 状态 |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---- |
| 1   | 「症状」一节的复现步骤，六个后端                              | 在 main 上撤销，再切到 feature、切回 main                       | 撤销那一步被拒：`undoCount$` 为 0，`undoBarrier$` 给出 `feature`；main 保持 `b`，切换往返之后仍是 `b` | ✅   |
| 2   | 同上                                                          | `compareBranches('main', 'feature')`、`previewMerge('feature')` | main 一侧的值与 main 此刻读到的一致，预览没有覆盖标注                                                 | ✅   |
| 3   | 父分支多级（main → a → a-child），在 main 上撤销 a 继承的变更 | 沿父链来回切换                                                  | 每一级都撤销不了下一级继承的变更；每条分支读到的都与它此刻的真实数据一致                              | ✅   |
| 4   | main 上的改动在分叉时还撤销着、却落在继承范围里（作用域撤销） | 建分支后重做它                                                  | 重做被拒：`redoCount$` 为 0，`redoBarrier$` 给出原因；切换往返数据不变                                | ✅   |
| 5   | AC1 的状态                                                    | 删掉 feature                                                    | 限制解除：两步都可撤销，`undoBarrier$` 为 `null`                                                      | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **候选与说明**：`history-filters.ts` 的 `partitionUndoableHistories()` 把历史分成可撤销的与「其余条件都满足、只因被继承而撤销不了」的两组，
  后一组里作用域内最新的那项就是栈撞上的那一步；`splitRedoableHistories()` 给出重做能做到哪、被哪一项拦住。
  分叉点取「`parentId` 指向当前分支、`fromChangeId` 非空」的分支行；孙分支不用看，它继承的一定也被它的父分支继承了。
- **执行与视图分开**：`undo()` / `redo()` 执行前现查分叉点，写事务的 `prepare` 再按事务内读到的子分支复核一次（另一个标签页
  刚从本分支建出子分支时回滚，什么也不写，结果与停在分叉点相同）。视图（`undoHistories$` / `redoBarrier$` 等）用的分叉点每次都现查
  「库里当前激活的分支 + 它的子分支」：连上时查一次，此后在 `refreshChildForks()` 时重查（`VersionManager` 的建、删、合并分支之后，
  切分支时 `setUndoBranch()` 先清空再重查，工作树插件从提交建分支之后），`undo()` / `redo()` 执行前现查到的也写回视图。
- **不用分支表的活查询**：`RxDBBranch` 不写变更日志，适配器派不出它的事件——删分支看不见；来回切分支、再清库之后，`current_branch$`
  这类查询会停在旧分支上；常驻一条「全部分支」的查询还会被别人同条件的查询共用，把旧缓存发给它们。三样都在 PR #140 的 CI 上撞过
  （SQLite 系与 Tauri 的共享套件、sqlite / sqliteai 上的检出位一致性套件）。
- **判定基准**：`MemoryBranchHistory.stateOf()`（`rxdb-plugin-history` 的测试夹具）按「撤销过的变更不算」正向重放出各分支的真实数据，
  可以直接当对比、预览、切换增量三者的判定基准；今天三者在这个场景下都与它不符。
- **与 US-314 的关系**：从提交建分支已经用提交时记下的回滚状态挡住「提交之后撤销过」的情形
  （`history_rewritten`，[`commit-fork-point.ts`](../../../packages/rxdb-plugin-working-tree/src/commit/commit-fork-point.ts)）；
  本故事管的是普通子分支，建完分支之后在父分支上撤销，那里管不到。
- **来源**：PR #122 评审的决策 4（`mergeBasePoint` 的回滚边界，结论见 reviews 的[清理记录](../../reviews/README.md#清理记录)）。
  补用例时发现失真的根子不在 `mergeBasePoint`，在切换增量本身；修法 A 让这个状态不再出现，切换增量不用改。

## 实现文件

- `packages/rxdb/src/sync-contract/VersionManager.interface.ts` — `HistoryScopeAPI.undoBarrier$` / `redoBarrier$`
- `packages/rxdb-plugin-history/src/history-filters.ts` — 分叉点、撤销候选分组、重做截断、拦住栈的原因
- `packages/rxdb-plugin-history/src/undo-redo-apply.ts` — 现查分叉点；写事务里复核
- `packages/rxdb-plugin-history/src/HistoryManager.ts`、`history-scope-api.ts`、`VersionManager.ts` — 视图与执行、建 / 删 / 合并后的重查
- `packages/rxdb-model/src/entity-list/history-barrier.ts` 与三端实体列表 — 按钮停用时的说明
- 用例：PGlite `version/undo_inherited_change.spec.ts`、SQLite 共享分支套件（五个后端）、历史插件 `undo-redo-inherited-change.spec.ts`、三端实体列表

## References

- [US-302 撤销/重做](US-302-undo-redo.md)、[US-312 对比与合并预览](US-312-branch-compare-merge-preview.md)
