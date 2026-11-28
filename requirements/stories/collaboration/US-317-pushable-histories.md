---
id: US-317
title: 待推送清单：与待推数同一口径的历史项流
status: Done
priority: Medium
epic: epic-016-local-change-workbench
created: 2026-11-26
updated: 2026-11-27
tags: [collaboration, history, sync, push, api]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只加一条只读流；推送、撤销、计数的行为不变
- [x] Negotiable (可协商): 成员名、排序、是否附带每项的仓库归属留待评审定；「与待推数同一口径」已定
- [x] Valuable (有价值): 应用只拿得到待推的数字，列不出会推什么；自己拼查询正是核心注释警告的口径漂移
- [x] Estimable (可估算): 抽出待推条件的构造 + 一条清单流 + 插件单测 + API 基线
- [x] Small (小): 一个 PR
- [x] Testable (可测试): 插件单测
-->

# 用户故事：待推送清单

## 作为/我想要/以便

**作为** 用 RxDB 做 local-first 应用的开发者
**我想要** 一条和 `pushableCount$` 同一口径的流，列出现在推送会推哪些本机修改——一个事务一项，带每条变更的改前改后
**以便** 推送之前给用户看清单和 diff（像 git 的「领先 N 个提交」），而不用自己拼 `RxDBChange` 查询、和待推数对不上

## 背景（改动之前）

1. 只有数字：`versionManager.pushableCount$`。口径的唯一实现是 [`updatePushableCount`](../../../packages/rxdb-plugin-history/src/undo-redo-apply.ts)：当前分支上没撤销、没推上去的变更，再按仓库的推送资格与水位线裁剪——

   ```ts
   const repoRules = buildPushableRepositoryRules(host.rxdb.config.entities, host.rxdb.entitySync, repoSyncs);
   ```

   ——最后经 [`countRxDBChangeRecords`](../../../packages/rxdb/src/sync-contract/change-records.ts) 计数：不在事务里的变更各算一条，一个事务算一条。挂在可写检出位上时直接给 0（只有主检出位同步）。

2. 核心把这套口径当契约导出，注释写明它不能各算各的（[`index.ts`](../../../packages/rxdb/src/index.ts)）：

   ```ts
   // 待推数的计数口径：一个事务一条记录。历史插件的 `pushableCount$` 与同步插件的仓库状态共用，各数一套就会对不上。
   ```

   应用想列清单，只能照着 `updatePushableCount` 再拼一遍——正是这句话警告的漂移。

3. 现成的 `histories$` 替代不了：[`HistoryManager`](../../../packages/rxdb-plugin-history/src/HistoryManager.ts) 只取本次会话的变更（`createdAt` 不早于 `firstConnectedAt`），上次打开时离线改的、还没推的修改计入待推数却不在里面；它也不看推送资格，只存本地的实体（如访客的 Todo）`remoteId` 永远为空，却永远不会被推送。

## 范围边界

### In Scope

- `versionManager.pushableHistories$: Observable<HistoryItem[]>`（名字可协商），最新在前，一项对应计数里的一条：不在事务里的变更一项一条，一个事务一项、带它的全部变更（分组复用 [`convertChangesToHistories`](../../../packages/rxdb-plugin-history/src/history-item-builder.ts)）。
- 与 `pushableCount$` 共用同一个待推条件的构造：从 `updatePushableCount` 抽出「当前分支 + 未撤销 + 未推 + 仓库规则」这一段，计数与清单都调它，口径只有一处。
- 刷新时机与计数相同：写入、撤销、重做、推送完成、被拒落标、切分支、换检出位。
- 只在有人订阅时查询（`refCount`），不订阅不付查询的代价。
- TSDoc、插件单测、API 基线。

### Out of Scope

- 待拉清单：远端只给计数。
- 按作用域过滤的版本：调用方按 `namespace` / `entity` 过滤即可，作用域规则留在 `history(scope)`。
- 框架绑定：三个框架绑定包都没有包装 `versionManager`，不新增 hook。

## 验收标准

| #   | 前置条件                                      | 操作                                                     | 预期结果                                                   | 状态 |
| --- | --------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ---- |
| 1   | 本机有两条独立写入、一次 `saveMany`，都未推送 | 订阅清单                                                 | 发出三项；`saveMany` 那一项的 `changes` 是该事务的全部变更 | ✅   |
| 2   | 任一状态                                      | 写入、撤销、重做、推送成功、部分被拒、切分支之后各读一次 | 每次稳定之后清单长度等于 `pushableCount$` 的值             | ✅   |
| 3   | 上次打开时离线改了两条、没推，库已重新打开    | 订阅清单                                                 | 两条都在清单里（`histories$` 里没有它们）                  | ✅   |
| 4   | 实体的同步类型是只存本地                      | 写入后订阅                                               | 不在清单里，计数也不含它                                   | ✅   |
| 5   | 一条变更被远端拒绝                            | 推送之后                                                 | 它离开清单                                                 | ✅   |
| 6   | 清单里有一条                                  | 撤销，再重做                                             | 撤销后离开清单，重做后回来                                 | ✅   |
| 7   | 实例挂在可写检出位上                          | 订阅清单                                                 | 空清单，与计数给 0 一致                                    | ✅   |
| 8   | —                                             | 插件单测；`pnpm audit:api-surface`                       | 通过；新增成员有 TSDoc，基线已更新                         | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：

- AC#1～#6：`packages/rxdb-adapter-pglite/src/__tests__/pushable-histories.spec.ts`（真实 PGlite 加脚本化远端：每一步都断言清单长度与 `pushableCount$` 同时相等，含切分支、推送成功、部分被拒、重新打开库）；`pnpm nx test rxdb-adapter-pglite`。
- AC#7：`packages/rxdb-plugin-history/src/__tests__/pushable-count-records.spec.ts` 的「buildPendingPushWhere」——挂在可写检出位上时条件为 `null`，计数与清单共用这一个条件，清单为空。
- AC#8：`pnpm nx test rxdb-plugin-history`；`pnpm audit:api-surface`。

## 技术笔记

- 只抽条件，不改计数算法：计数继续走 `countRxDBChangeRecords`（两次 `count`，不取行）；清单是同一条件的 `findAll` 加分组。两边各自刷新，AC#2 断言的是每次操作稳定之后相等，不是每一帧相等。
- 大事务：演示里「批量添加」一次 `saveMany` 能写上万条，清单里就是一项带上万条变更。界面按事务折叠，展开再虚拟滚动；流本身不截断，截断会让「清单长度等于计数」失去意义。
- 放在 `@aiao/rxdb-plugin-history` 的 `VersionManager` 上，与 `pushableCount$` 并列；`HistoryItem` 是核心已有的类型，不新增类型。
- 新增成员按 [versioning-policy](../../versioning-policy.md) 属于基线漂移（只新增符号），跑 `pnpm audit:api-surface:update`。

## 实现文件

- `packages/rxdb-plugin-history/src/undo-redo-apply.ts` — 抽出待推条件的构造
- `packages/rxdb-plugin-history/src/HistoryManager.ts`、`VersionManager.ts` — 清单流
- `packages/rxdb-plugin-history/src/__tests__/` — 单测
- `requirements/api-baseline/rxdb-plugin-history.json` — 基线

## References

- 使用方：[US-230](../adapter/US-230-supabase-header-sync.md) 阶段 C 的同步中心；整体方案见 [epic-016](../../epics/epic-016-local-change-workbench.md)
- [US-034 分区实体的本地写入](../core/US-034-bucketed-entity-local-writes.md)（推送后锁定撤销，清单随之清空）
