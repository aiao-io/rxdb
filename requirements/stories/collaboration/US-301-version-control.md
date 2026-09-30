---
id: US-301
title: 版本控制
status: Done
priority: Medium
epic: epic-002-data-sync
created: 2025-12-08
updated: 2026-09-20
tags: [collaboration, versioning]
---

# 用户故事：版本控制

## 作为/我想要/以便

**作为** 用户
**我想要** 拥有数据的版本历史
**以便** 我可以追踪随时间的变化

## 范围边界

### In Scope

- 分支生命周期：`createBranch()` / `switchBranch()` / `deleteBranch()` 与 `RxDBBranch` 树形结构管理
- 分支切换时按外键依赖的拓扑排序处理实体
- 分支合并：可插拔 `ConflictResolver`，默认 Last-Write-Wins
- 变更压缩：`compactChanges()` — INSERT→DELETE 丢弃，INSERT→UPDATE\* 合并
- push / pull 增量同步：`pullChanges(sinceId)` 拉取并合并远程变更

### Out of Scope

- commit 图、HEAD 持久化与工作树状态机 —— 属 [US-305](./US-305-commit-graph-head.md) / [US-306](./US-306-working-tree-commits.md)
- 历史恢复会话语义 —— 属 [US-307](./US-307-restore-session.md)
- 分支隔离与跨 realm 冲突检测 —— 属 [US-308](./US-308-branch-isolation-conflict.md)
- change codec 的 bigint/binary 无损表示 —— 属 [US-303](./US-303-bigint-binary-change-codec.md)
- 远程多人协作的权限与签名

## 验收标准

| #   | 前置条件                          | 操作                            | 预期结果                                 | 状态 |
| --- | --------------------------------- | ------------------------------- | ---------------------------------------- | ---- |
| 1   | 调用 `createBranch('experiment')` | 成功                            | 基于当前状态创建新分支                   | ✅   |
| 2   | 在分支 A                          | 切换到分支 B                    | 数据库状态反映分支 B 的数据，UI 自动更新 | ✅   |
| 3   | 分支切换涉及外键依赖              | 执行切换操作                    | 按拓扑排序处理实体                       | ✅   |
| 4   | 两个分支有冲突变更                | 合并                            | 通过 `ConflictResolver` 解决冲突         | ✅   |
| 5   | 执行 push 同步                    | 压缩变更                        | INSERT→DELETE 丢弃，INSERT→UPDATE\* 合并 | ✅   |
| 6   | 执行 pull 同步                    | 拉取远程变更                    | `pullChanges(sinceId)` 增量拉取并合并    | ✅   |
| 7   | 实体被删除                        | 调用 `restoreEntity(entityKey)` | 恢复到删除前状态                         | ✅   |
| 8   | `RxDBBranch` 树形结构             | 管理分支                        | 支持创建/切换/删除操作                   | ✅   |

## 技术笔记

- 分支管理：`createBranch()` / `switchBranch()` / `deleteBranch()`
- 分支存储：分支是同一数据库内 `rxdb_branch` 表的行（[`branch.ts`](../../../packages/rxdb/src/system/branch.ts)，`activated` 列切换），各分支的 change/ref 也在同一主库内
- 拓扑排序：分支切换时按外键依赖顺序处理实体
- 变更压缩：`compactChanges()` - INSERT→DELETE 丢弃，INSERT→UPDATE\* 合并
- 冲突解决：可插拔 `ConflictResolver`，默认 Last-Write-Wins
- 实体恢复：通过 `inversePatch` 实现删除恢复

## 实现文件

- `packages/rxdb-plugin-history/src/VersionManager.ts` — 版本管理器核心
- `packages/rxdb-plugin-history/src/HistoryManager.ts` — 历史记录管理
- `packages/rxdb/src/sync-contract/compact-changes.ts` — 变更压缩
- `packages/rxdb/src/sync-contract/conflict.ts` — 冲突解决（`LWWConflictResolver`）

## References

- 测试：`packages/rxdb-plugin-history/src/__tests__/HistoryManager.spec.ts` — 历史管理测试
- 测试：`packages/rxdb-plugin-history/src/__tests__/sync-undo.spec.ts` — 同步与撤销测试
- [文档: 版本控制](../../../website/docs/collaboration/branch.md)
