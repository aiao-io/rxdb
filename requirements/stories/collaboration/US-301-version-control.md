---
id: US-301
title: 版本控制
status: Done
priority: Medium
epic: epic-002-data-sync
created: 2025-12-08
updated: 2026-02-28
tags: [collaboration, versioning]
---

# 用户故事：版本控制

## 作为/我想要/以便

**作为** 用户
**我想要** 拥有数据的版本历史
**以便** 我可以追踪随时间的变化

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
- 分支存储：每个分支对应独立的 SQLite 文件或 PGlite 数据库
- 拓扑排序：分支切换时按外键依赖顺序处理实体
- 变更压缩：`compactChanges()` - INSERT→DELETE 丢弃，INSERT→UPDATE\* 合并
- 冲突解决：可插拔 `ConflictResolver`，默认 Last-Write-Wins
- 实体恢复：通过 `inversePatch` 实现删除恢复

## 实现文件

- `packages/rxdb/src/version/VersionManager.ts` — 版本管理器核心
- `packages/rxdb/src/version/HistoryManager.ts` — 历史记录管理
- `packages/rxdb/src/version/compact-changes.ts` — 变更压缩
- `packages/rxdb/src/version/conflict.ts` — 冲突解决

## 测试文件

- `packages/rxdb/src/__tests__/version/HistoryManager.spec.ts` — 历史管理测试
- `packages/rxdb/src/__tests__/version/sync-undo.spec.ts` — 同步与撤销测试

## 参考

- [文档: 版本控制](../../../website/docs/collaboration/branch.md)
