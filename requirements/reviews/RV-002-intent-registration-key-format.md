---
id: RV-002
title: 意图登记表键格式三方不一致，且 US-306 漂移测试示例用了不存在的符号 mergeBranchChanges
status: Open
created: 2026-08-22
updated: 2026-08-22
pr:
---

# Review：意图登记表键格式不一致，发布门禁 10 漂移测试的比对依据含糊

## 问题

发布门禁 10 要求漂移测试「与 epic 登记表逐条比对」，但三处文档对登记键的格式说法互相矛盾：

1. [epic-006:191](../epics/epic-006-working-tree-commits.md:191) 规定键为「**文件 + 符号 + 意图**」；
2. 同一张表的表头（[epic-006:194](../epics/epic-006-working-tree-commits.md:194)）却写「登记键（**文件 + 符号**）」；
3. 表内单元格实际是混合格式：「HistoryManager.ts · 失效 redo 栈」「merge-branch.ts · per-change 分支
   executor.mergeChanges」等行是文件 + 描述/传输层，不是符号（[epic-006:194-203](../epics/epic-006-working-tree-commits.md:194)）；
4. [US-306:372](../stories/collaboration/US-306-working-tree-index.md:372) 的示例键
   「merge-branch.ts · **mergeBranchChanges** · per-change 应用」——`mergeBranchChanges` 这个符号在全仓库不存在
   （merge-branch.ts 里的实际函数是 `merge_branch`，已 grep 全 `packages/` 验证零命中）。

漂移测试要与登记表「逐条比对」，参考数据却有两种键格式和一个不存在的符号，plan 阶段实现测试时会
被迫再发明一套口径。

## 根因

登记表是从「调用方意图」论证中直接生长出来的，没有在写成规范性表格时统一键的构成；US-306 的示例键
是按设想的函数名写的，未与代码核对。

## 修复方案

1. epic 登记表按「文件 + 符号 + 意图」重填真实符号：`invalidateRedoStack`、`merge_branch`（normal /
   squash 两个分支各自一行）、`pullBatch` / `pullBatchOnce`、`pullRepository`、`cleanupExpired`。
2. 同步修正 [US-306:372](../stories/collaboration/US-306-working-tree-index.md:372) 的示例键为
   `merge-branch.ts · merge_branch · per-change 应用`。
3. 表头与第 191 行的规则文字统一。

## 审查结论（2026-08-22 复核）

**成立，且低估了严重程度。** 本评审只指出 US-306 漂移测试示例用了不存在的符号，实际情况更糟：

1. `mergeBranchChanges` 确实不存在，真实符号是 `merge_branch`（[merge-branch.ts](../../packages/rxdb/src/version/merge-branch.ts)）。
2. 本评审自己建议的替代符号 `pullRepository` **也是错的**——`pullRepository` 只是导出门面，
   真正发起 `mergeChanges` 的是同文件内的 `pullSingleRepository`。同类错误还有
   `VersionManager.restoreEntity`（真实调用点在 `restore-entity.ts` 的 `restore_entity`）。
3. 已冻结的 [adapter-contract §4](../../specs/001-working-tree-commits/contracts/adapter-contract.md) 本身
   就是本评审所指缺陷的重灾区：它一边声明键「不含行号」，一边**整表没有符号列**、全部用行号锚点定位，
   且逐条核对后 4 条锚点**全错**：`HistoryManager.ts#L1472`（真实 1360）、`VersionManager.ts#L936`
   （真实调用点根本不在该文件）、`VersionManager.ts#L769`（真实 736）、`HistoryManager.ts#L948`（真实 836）。

**已修复**：

- epic-006 登记表表头改为「登记键（文件 + 符号 + 意图）」，9 行全部换成**经代码核对**的真实符号。
- adapter-contract §4 补齐**符号列**、删除全部行号锚点、订正第 8 项文件为 `restore-entity.ts`，
  并补两条扫描规则：同三元组的两个调用点 MUST 按调用点计数（不得去重）、本地/远端同名重载按参数形态区分。
- US-306 漂移测试示例改为 `merge-branch.ts · merge_branch · per-change 应用`，并写死
  「符号取实际发起该次批量重写的最内层具名函数，不是委托调用的公开门面方法」。

## 解决记录

- [x] 文档修复已落在工作区（见「审查结论」）
- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
