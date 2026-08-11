---
id: US-302
title: 撤销/重做
status: Done
priority: Medium
epic: epic-002-data-sync
created: 2025-12-08
updated: 2026-02-28
tags: [collaboration, undo]
---

# 用户故事：撤销/重做

## 作为/我想要/以便

**作为** 用户
**我想要** 撤销和重做我的操作
**以便** 我可以轻松纠正错误

## 验收标准

| #   | 前置条件                    | 操作          | 预期结果                   | 状态 |
| --- | --------------------------- | ------------- | -------------------------- | ---- |
| 1   | 执行了一系列 CRUD 操作      | 调用 `undo()` | 最后一个操作被反转         | ✅   |
| 2   | 执行了 undo                 | 调用 `redo()` | 之前撤销的操作被重新应用   | ✅   |
| 3   | 执行 undo 后进行了新操作    | 检查 redo 栈  | redo 栈被清空（失效逻辑）  | ✅   |
| 4   | 历史按 `transactionId` 分组 | undo 一个事务 | 该事务内所有变更一起撤销   | ✅   |
| 5   | `inversePatch` 记录         | 执行 undo     | 通过反转补丁恢复数据       | ✅   |
| 6   | redo 栈为会话级（内存）     | 页面刷新      | redo 栈清空（undo 仍可用） | ✅   |

## 技术笔记

- Undo 栈：基于 `RxDBChange` 表的 `inversePatch` 实现，按 transactionId 分组
- Redo 栈：会话级内存存储，页面刷新后清空
- 失效逻辑：undo 后执行新操作，清空 redo 栈
- 事务级撤销：同一事务内所有变更一起撤销
- 存储：undo 历史来自数据库中的 `RxDBChange` 表（刷新后仍可 undo）；redo 栈仅存在于内存，刷新即清空

## 实现文件

- `packages/rxdb/src/version/HistoryManager.ts` — undo/redo 主流程（`#apply_undo_redo_histories`、按 transactionId 分组、redo 失效）
- `packages/rxdb/src/version/redo-stack.ts` — 会话级 redo 栈（内存 `BehaviorSubject`，上限 `MAX_REDO_STACK_SIZE`）
- `packages/rxdb/src/version/VersionManager.interface.ts` — `undo(step?)` / `redo(step?)` 接口定义
- `packages/rxdb/src/system/change.ts` — 变更记录（包含 inversePatch）

## 测试文件

- `packages/rxdb/src/__tests__/version/sync-undo.spec.ts` — Undo/Redo 测试
- `packages/rxdb/src/__tests__/version/HistoryManager.spec.ts` — HistoryManager 主流程测试

## 参考

- [文档: 撤销/重做](../../../website/docs/collaboration/undo-redo.md)
