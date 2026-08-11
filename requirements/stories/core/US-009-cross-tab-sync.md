---
id: US-009
title: 跨 Tab 数据同步
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-08
tags: [core, sync, broadcast]
---

# 用户故事：跨 Tab 数据同步

## 作为/我想要/以便

**作为** 同时打开多个标签页的用户
**我想要** 在一个标签页修改数据后其他标签页自动更新
**以便** 保持所有标签页的数据一致性

## 验收标准

| #   | 前置条件                | 操作                   | 预期结果                       | 状态 |
| --- | ----------------------- | ---------------------- | ------------------------------ | ---- |
| 1   | 两个标签页打开同一应用  | 在 Tab A 创建数据      | Tab B 自动收到事件并更新 UI    | ✅   |
| 2   | 使用 `BroadcastChannel` | 消息广播               | 所有标签页接收                 | ✅   |
| 3   | `LeaderElection` 机制   | 需要唯一操作（如同步） | 仅 leader tab 执行             | ✅   |
| 4   | Leader tab 被关闭       | 重新选举               | 自动选出新 leader tab 继续任务 | ✅   |

## 技术笔记

- 核心类：`RxDBTabsGateway`
- 通信机制：`BroadcastChannel` API
- Leader 选举：避免多 tab 同时执行同步、清理等独占操作
- 事件类型：复用 `RxDBEventType` 体系，跨 tab 广播实体变更事件

## 实现文件

- `packages/rxdb/src/tabs/` — TabsGateway 核心实现

## 参考

- [文档: 跨 Tab 同步](../../../website/docs/collaboration/sync.md)
