---
id: MODEL-US-104
title: 需求澄清提问
status: In Progress
priority: Medium
epic: MODEL-EPIC-001
created: 2026-11-11
updated: 2026-11-12
tags: [agent, human-in-the-loop]
dependsOn: [MODEL-US-102]
capabilities: []
---

# 用户故事：需求澄清提问

## 作为/我想要/以便

**作为** 用一句话描述业务的设计器用户
**我想要** 需求不清时 AI 给出 2～4 个选项让我选
**以便** 不再先按猜测生成一整套模型、再推倒返工。

现状（源码可复验）：生成接口的输出结构 `ModelGenerationOutputSchema` 只有 `thinking` 与 `entities`（见迁移前的 `server/prompts/model-schema.ts`），没有提问通道；遇到「订单与商品直接多对多，还是经订单明细」这类分叉，AI 只能自己选一种。

## 范围边界

### In Scope

- `ask_user` 工具不带 `execute`，调用后本轮暂停；面板展示问题与选项。
- 用户选择后用 `addToolOutput` 回填，并立即开始下一轮，智能体按选择继续建模。
- 等待回答期间刷新页面，问题与选项仍可作答。

### Out of Scope

- 自由文本回答（用户可直接发送新消息代替）；需要审批才能执行的工具（AI 分支合并已经承担审批）。

## 验收标准

| #   | 前置条件               | 操作               | 预期结果                                       | 状态 |
| --- | ---------------------- | ------------------ | ---------------------------------------------- | ---- |
| 1   | 智能体调用 `ask_user`  | 本轮结束           | 面板显示问题与 2～4 个选项，本轮没有写入 ops   | ✅   |
| 2   | 问题待回答             | 选择一个选项       | 工具结果回填，下一轮自动开始，智能体收到所选项 | ✅   |
| 3   | 问题待回答             | 刷新页面后打开会话 | 问题与选项仍在且可作答                         | ✅   |
| 4   | 回答已提交或流正在进行 | 再次点击选项       | 选项禁用，不重复提交                           | ✅   |

验收证据入口：`agent/chat.spec.ts`（提问让本轮以待回答的工具调用结束）、`services/agent-messages.spec.ts`（问题与选项的映射）、`__tests__/services/agent-conversation.service.spec.ts`（回填续轮、刷新后作答、准备期间与生成中拒绝重复提交）。#1、#4 在本机自建实例 + 真实 DeepSeek 上用真实浏览器验收：智能体给出 3 个选项，作答前没有实体也没有 AI 分支；点选后 46 ms 内选项禁用，强制再点一次，实例上只收到一次回答。汇总见[验收台账](../../verification-report.md)。

## 技术笔记

做法对应 Trigger.dev 的 human-in-the-loop 模式：省略 `execute` 的工具会让 `streamText` 以待处理的工具调用结束。前端 `addToolOutput` 后显式调用一次不带消息的 `sendMessage()` 续轮，续轮同样先带上最新快照。不用 AI SDK 的 `lastAssistantMessageIsCompleteWithToolCalls` 自动续轮：它只排除 `providerExecuted` 的工具，对服务端执行的建模工具同样成立，一轮恰好以工具调用收尾时会反复重发。等待回答期间禁止自由输入，避免把带未完成工具调用的消息发给智能体。

## 实现文件

- `apps/aiao-model-design/agent/tools/ask-user.ts` — 提问工具。
- `apps/aiao-model-design/src/app/model-designer/components/ai/` — 问题与选项卡片。

## References

- [Trigger.dev human-in-the-loop](https://trigger.dev/docs/ai-chat/patterns/human-in-the-loop)
