---
id: US-007
title: 变更追踪
status: Done
priority: Medium
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-08
tags: [core, sync, change-tracking]
---

# 用户故事：变更追踪

## 作为/我想要/以便

**作为** 系统
**我想要** 追踪所有实体的变更历史
**以便** 支持数据同步、版本控制和冲突检测

## 验收标准

| #   | 前置条件             | 操作                             | 预期结果                                          | 状态 |
| --- | -------------------- | -------------------------------- | ------------------------------------------------- | ---- |
| 1   | 实体发生 CRUD 操作   | 生成变更记录                     | `RxDBChange` 表记录 patch + inversePatch          | ✅   |
| 2   | 变更日志存在         | 执行 push 同步                   | `compactChanges()` 压缩变更（INSERT→DELETE 丢弃） | ✅   |
| 3   | 本地和远程有冲突变更 | 合并                             | 通过可插拔 `ConflictResolver` 解决（默认 LWW）    | ✅   |
| 4   | 过期变更记录         | 调用 `cleanupExpired()`          | 清理本地过期变更且不同步到远程                    | ✅   |
| 5   | 17 种事件类型        | 实体/事务/分支/同步/冲突状态变化 | 派发对应事件                                      | ✅   |

## 技术笔记

- 变更记录：`RxDBChange` 表，存储 patch + inversePatch
- 变更压缩：`compact-changes.ts` — INSERT→DELETE 抵消，INSERT→UPDATE\* 合并
- 冲突解决：可插拔 `ConflictResolver`，默认 Last-Write-Wins
- 事件体系：17 种事件类型（本地实体、远程实体、事务、分支、同步、冲突）
- 过期清理：`cleanup-expired.ts` 清理过期变更，已修复远程同步副作用

## 实现文件

- `packages/rxdb/src/system/change.ts` — 变更记录
- `packages/rxdb/src/version/compact-changes.ts` — Push 变更压缩
- `packages/rxdb/src/version/cleanup-expired.ts` — 过期清理
- `packages/rxdb/src/rxdb-events.ts` — 17 种事件 + map (464 LOC)

## 参考

- [文档: 同步](../../../website/docs/collaboration/sync.md)
