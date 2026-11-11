---
id: MODEL-US-102
title: 设计器接入持久会话
status: Backlog
priority: High
epic: MODEL-EPIC-001
created: 2026-11-11
updated: 2026-11-11
tags: [agent, designer, angular, branch]
dependsOn: [MODEL-US-002, MODEL-US-101]
capabilities: [rxdb:US-301]
---

# 用户故事：设计器接入持久会话

## 作为/我想要/以便

**作为** 用 AI 建模的设计器用户
**我想要** 在 AI 面板里和持久会话对话，AI 每完成一次工具调用，画布上的 AI 分支就多出对应的实体和关系，刷新页面后还能接着进行
**以便** 生成不再因为超时或刷新而丢失，审阅之后再决定合并。

## 范围边界

### In Scope

- AI 面板改用 `@ai-sdk/angular` 的 `Chat` 与 `TriggerChatTransport`，生成与对话合并为同一个会话入口。
- 工具输出里的 ops 按到达顺序、按 `toolCallId` 幂等写进 AI 分支；首个写入到达时 fork 分支。
- 会话状态存进新的 `log: false` 实体，刷新后恢复消息与流游标并续流。
- 合并、丢弃、停止沿用现有分支与界面能力；迁移前的本地会话只读展示。
- 删除旧链路：`ai-api.service`、`ai-event-stream`、`parse-partial-json`、`fix-json`、`streaming-entity-parser`、`chat-change-parser`、`ai-chat-apply.service`、`ai-model-populate.service` 及其类型。

### Out of Scope

- 回读用户修改（MODEL-US-103）与澄清提问（MODEL-US-104）。
- 多标签页同时驱动同一会话（Trigger.dev 的 `multiTab` 协调），当前只保证单标签页。

## 验收标准

| #   | 前置条件                          | 操作                                     | 预期结果                                                                                   | 状态 |
| --- | --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ | ---- |
| 1   | 已登录，AI 可用                   | 在 AI 面板发送建模需求                   | 首个写入工具的输出到达时 fork AI 分支，画布按工具输出顺序逐步出现实体与关系                | ⬜   |
| 2   | 同一工具输出因重连或重放再次到达  | 处理消息                                 | 同一 `toolCallId` 只写入一次                                                               | ⬜   |
| 3   | 一轮进行中                        | 刷新页面后重新打开该会话                 | 消息与流游标恢复，流从游标继续；已写入的 ops 不重复，漏写的补写                            | ⬜   |
| 4   | AI 分支已有写入                   | 合并或丢弃                               | 合并后父分支包含 AI 写入；丢弃后模型回到 fork 前，对话记录保留                             | ⬜   |
| 5   | 一轮进行中                        | 点击停止                                 | 本轮中止，已写入的 ops 留在 AI 分支                                                        | ⬜   |
| 6   | 存在迁移前的本地会话              | 打开该会话                               | 历史消息只读展示，不能继续发送                                                             | ⬜   |
| 7   | 未登录或 Worker 返回不可用        | 打开 AI 面板                             | 入口禁用并说明原因，不发请求                                                               | ⬜   |
| 8   | 代码仓库                          | 检索旧链路模块                           | 旧的增量 JSON 解析、变更块解析与旧接口适配器全部删除，无残留引用                           | ⬜   |
| 9   | 本地                              | 运行应用 lint、类型检查、单测与构建      | 全部通过                                                                                   | ⬜   |
| 10  | 自建实例 + 真实 DeepSeek          | 真实浏览器生成一个模型并合并             | 画布逐步出现实体，合并后模型与 AI 分支一致（真实环境）                                     | ⬜   |

验收证据入口：[验收台账](../../verification-report.md)。

## 技术笔记

`chatId` 为 `md-<用户 ID>-<ChatSession.id>`，Worker 据此判定归属（D-06）。每次发送前先等写入队列排空，再用当前分支构建快照，经 `transport.setClientData` 随本轮元数据发出。写入器复用现有 `DesignEntityService` / `DesignPropertyService` / `DesignRelationService` / `DesignIndexService`，新实体的画布位置沿用现有的自动布局。

## 实现文件

- `apps/aiao-model-design/entities/agent-conversation.entity.ts` — 会话状态实体（`log: false`）。
- `apps/aiao-model-design/src/app/adapters/agent-gateway.ts` — Worker 配置与会话签发客户端。
- `apps/aiao-model-design/src/app/model-designer/services/` — 会话服务、快照构建与 ops 写入器。
- `apps/aiao-model-design/src/app/model-designer/components/ai/` — 消息与工具卡片展示。

## References

- [D-03](../../decisions.md#d-03本地模型是真相源)
- 平台能力：[US-301 版本控制](../../../../../requirements/stories/collaboration/US-301-version-control.md)
