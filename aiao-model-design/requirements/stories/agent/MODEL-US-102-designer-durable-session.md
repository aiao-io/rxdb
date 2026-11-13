---
id: MODEL-US-102
title: 设计器接入持久会话
status: In Progress
priority: High
epic: MODEL-EPIC-001
created: 2026-11-11
updated: 2026-11-12
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

| #   | 前置条件                         | 操作                                             | 预期结果                                                                                       | 状态 |
| --- | -------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---- |
| 1   | 已登录，AI 可用                  | 在 AI 面板发送建模需求                           | 首个写入工具的输出到达时 fork AI 分支，每个工具输出的 ops 按到达顺序各自作为一个事务写入       | ✅   |
| 2   | 同一工具输出因重连或重放再次到达 | 处理消息                                         | 同一 `toolCallId` 只写入一次                                                                   | ✅   |
| 3   | 一轮进行中                       | 刷新页面后重新打开该会话                         | 消息与流游标恢复，流从游标继续；已写入的 ops 不重复，漏写的补写                                | ✅   |
| 4   | AI 分支已有写入                  | 合并或丢弃                                       | 合并后父分支包含 AI 写入；丢弃后模型回到 fork 前，对话记录保留                                 | ✅   |
| 5   | 一轮进行中                       | 点击停止                                         | 本轮中止，已写入的 ops 留在 AI 分支                                                            | ✅   |
| 6   | 存在迁移前的本地会话             | 打开该会话                                       | 历史消息只读展示，不能继续发送                                                                 | ✅   |
| 7   | 未登录或 Worker 返回不可用       | 打开 AI 面板                                     | 入口禁用并说明原因，不发请求                                                                   | ✅   |
| 8   | 代码仓库                         | 检索旧链路模块                                   | 旧的增量 JSON 解析、变更块解析与旧接口适配器全部删除，无残留引用                               | ✅   |
| 9   | 本地                             | 运行应用 lint、类型检查、单测与构建              | 全部通过                                                                                       | ✅   |
| 10  | 自建实例 + 真实 DeepSeek         | 真实浏览器生成一个模型并合并                     | 画布逐步出现实体，合并后模型与 AI 分支一致（真实环境）                                         | ✅   |
| 11  | AI 分支既没合并也没丢弃          | 刷新页面后重新打开设计器                         | 合并、丢弃入口与差异预览恢复，后续写入接着同一条分支；停在 AI 分支却找不到 fork 记录时说明原因 | ✅   |
| 12  | 本地存储或实例调用出错           | 保存会话、写入工具输出、加载会话列表、停止或合并 | 面板显示失败原因，不留未处理的拒绝；本轮对话先于回读基线保存，读模型失败也不丢对话             | ✅   |
| 13  | 一轮正在准备或进行               | 连按发送                                         | 只发出一条消息                                                                                 | ✅   |

验收证据入口：`__tests__/services/agent-conversation.service.spec.ts`（假传输按脚本回放片段）、`__tests__/integration/agent-model-store.spec.ts` 与 `agent-branch-repository.spec.ts`（真实 SQLite）、`services/agent-messages.spec.ts`。#3、#10、#11 在本机自建实例 + 真实 DeepSeek 上用真实浏览器验收：中途刷新后从游标续流，刷新后才到达的索引写进了同一条 AI 分支并随合并进入 main；合并前后画布上的实体卡片与连线逐项一致。登录用验收 Worker 的模拟 Supabase 身份，见[验收台账](../../verification-report.md)。

## 技术笔记

`chatId` 为 `md-<用户 ID>-<AgentConversation.id>`，Worker 据此判定归属（D-06）。每次发送前先等写入队列排空，再直接查库构建当前分支的快照，经 `transport.setClientData` 随本轮元数据发出。工具输出在传输层被观察到（`watchTransport`），新发送与刷新后的续流都经过这里。写入器用 `entityManager.instantiate` 按操作里的 ID 建行，修改与删除按 ID 直接读库，整批一个 `mutations` 事务，不读可能滞后的界面信号；新实体的画布位置沿用 `calculateLayout`。每轮结束时先保存消息与只含 `publicAccessToken`、`lastEventId` 的游标，再记下回读基线，刷新后由服务端判断这一轮是否仍在进行。

数据库的检出分支会持久化：fork 之后没合并就刷新，重新打开时仍停在 AI 分支上。所以 fork 时把分支、父分支与 fork 前的快照写进 `AgentBranch`（`log: false`），合并或丢弃后删除；服务启动时若当前检出的是 AI 分支，就按这条记录恢复预览，首次写入前先等恢复完成，免得在 AI 分支上再 fork 一层。发送、回答、重试从调用起就算忙，准备这一轮（等写入队列、读快照）时连点也不会重复提交。用户操作与后台收尾的失败都显示在面板上。

## 实现文件

- `aiao-model-design/apps/web/entities/agent-conversation.entity.ts` — 会话状态实体（`log: false`）。
- `aiao-model-design/apps/web/entities/agent-branch.entity.ts` — 正在预览的 AI 分支的 fork 记录（`log: false`）。
- `aiao-model-design/apps/web/src/app/model-designer/services/ai-branch.service.ts` — fork、合并、丢弃与识别仍检出着的 AI 分支。
- `aiao-model-design/apps/web/src/app/adapters/agent-gateway.ts` — Worker 配置与会话签发客户端。
- `aiao-model-design/apps/web/src/app/model-designer/services/agent-conversation.service.ts` — 会话编排：可用状态、发送、回答、续流、写入队列、分支、保存。
- `aiao-model-design/apps/web/src/app/model-designer/services/agent-transport.ts` — 传输工厂（`TriggerChatTransport`）与观察包装。
- `aiao-model-design/apps/web/src/app/model-designer/services/agent-conversation-repository.ts` — 会话状态存储与模型存取。
- `aiao-model-design/apps/web/src/app/model-designer/services/model-snapshot.ts` / `model-ops-writer.ts` — 快照读取与事务写入。
- `aiao-model-design/apps/web/src/app/model-designer/services/agent-messages.ts` / `agent-branch-diff.ts` — 消息映射与分支差异。
- `aiao-model-design/apps/web/src/app/model-designer/components/ai/` — 消息与工具卡片展示。

## References

- [D-03](../../decisions.md#d-03本地模型是真相源)
- [D-08](../../decisions.md#d-08ai-分支的-fork-记录持久化)
- 平台能力：[US-301 版本控制](../../../../requirements/stories/collaboration/US-301-version-control.md)
