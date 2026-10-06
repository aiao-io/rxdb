---
id: US-009
title: 跨 Tab 数据同步
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-10-06
tags: [core, sync, broadcast]
---

# 用户故事：跨 Tab 数据同步

## 作为/我想要/以便

**作为** 同时打开多个标签页的用户
**我想要** 在一个标签页修改数据后其他标签页自动更新
**以便** 保持所有标签页的数据一致性

## 验收标准

| #   | 前置条件                | 操作              | 预期结果                       | 状态 |
| --- | ----------------------- | ----------------- | ------------------------------ | ---- |
| 1   | 两个标签页打开同一应用  | 在 Tab A 创建数据 | Tab B 自动收到事件并更新 UI    | ✅   |
| 2   | 使用 `BroadcastChannel` | 消息广播          | 所有标签页接收                 | ✅   |
| 3   | `LeaderElection` 机制   | 新 tab 发 HELLO   | 仅 leader tab 应答首次连接时间 | ✅   |
| 4   | Leader tab 被关闭       | 重新选举          | 自动选出新 leader tab 继续应答 | ✅   |

## 技术笔记

- 核心类：`RxDBTabsGateway`，留在核心包，由连接纪元作用域管理；`multiInstance !== false` 时启用
- 通信机制：`BroadcastChannel`（经 `@aiao/utils` 的 `createBroadcastTopic`），单一频道，按消息 `type` 区分
- Leader 选举（`LeaderElection`）：只用于应答 HELLO 与广播首次连接时间（`firstConnectedAt`）；同步、清理等操作不受 leader 约束
- 事件：复用 `RxDBEvent` 体系，本地 CREATE / UPDATE / REMOVE 实体事件跨 tab 广播，接收端标记 `origin: 'cross-tab'` 且不再转发；另有 `CAPABILITY_ENABLED` 消息通知其他 tab 接通刚启用的能力

## 实现文件

- `packages/rxdb/src/gateway/` — TabsGateway 核心实现

## 参考

- [文档: isCrossTabEvent](../../../website/docs/api/rxdb/functions/isCrossTabEvent.md)
