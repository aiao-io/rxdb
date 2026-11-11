---
id: MODEL-US-103
title: 手动修改回读
status: Backlog
priority: Medium
epic: MODEL-EPIC-001
created: 2026-11-11
updated: 2026-11-11
tags: [agent, readback]
dependsOn: [MODEL-US-102]
capabilities: []
---

# 用户故事：手动修改回读

## 作为/我想要/以便

**作为** 在 AI 产出上继续手动调整的设计器用户
**我想要** 我在两轮之间做的修改（改名、删字段、调关系、丢弃 AI 分支）被智能体看到
**以便** 它不会把我删掉的东西加回来，也不会继续用旧名字。

现状（源码可复验）：对话接口的请求体 `ChatBody.modelContext` 只有实体名、选中实体及其关联实体（见迁移前的 `server/ai.ts`），没有任何「用户改过什么」的信息。由此推断（未实测）：AI 会把用户删掉的字段重新提出来，或沿用它上一轮起的名字。

## 范围边界

### In Scope

- 每轮结束、ops 全部写入后，把当前快照记为回读基线（存于会话状态实体）。
- 下次发送时由共享差异函数计算「基线 → 当前」的变更，随快照一起发出，标注操作者为用户。
- 智能体在最新用户消息之前注入 `<model_state>` 与 `<since_your_last_turn>`，历史前缀保持不变，以利提示缓存。

### Out of Scope

- 精确区分同一轮里用户与 AI 交错的修改（AI 写入以工具输出为准，用户修改以基线差异为准）。

## 验收标准

| #   | 前置条件                       | 操作                         | 预期结果                                                                          | 状态 |
| --- | ------------------------------ | ---------------------------- | --------------------------------------------------------------------------------- | ---- |
| 1   | 上一轮已结束                   | 检查会话状态                 | 回读基线等于本轮 ops 写入后的快照                                                 | ⬜   |
| 2   | 用户把 `Order` 改名为 `PurchaseOrder` | 发送下一条消息         | 元数据里的变更列出这次改名；智能体收到的最新用户消息前出现对应的回读块            | ⬜   |
| 3   | 用户没有任何修改               | 发送下一条消息               | 只注入 `<model_state>`，不注入 `<since_your_last_turn>`                           | ⬜   |
| 4   | 用户丢弃了 AI 分支             | 继续对话                     | 回读把被丢弃的实体与关系列为用户移除                                              | ⬜   |
| 5   | 多轮对话                       | 比较连续两轮发给模型的消息   | 回读块只出现在最新用户消息之前，之前各轮的消息逐字节不变                          | ⬜   |

验收证据入口：[验收台账](../../verification-report.md)。

## 技术笔记

基线差异在浏览器计算，智能体不保存跨轮状态（D-06）。注入走 `chat.agent` 的 `prepareMessages`（`reason: "run"`），与 rendi 的 `withInstrumentState` 一样插在最后一条消息之前。

## 实现文件

- `apps/aiao-model-design/shared/model-ops/diff.ts` — 快照差异。
- `apps/aiao-model-design/agent/readback.ts` — 回读块与注入位置。
- `apps/aiao-model-design/src/app/model-designer/services/` — 基线记录与变更计算。

## References

- [rendi 的 readback](https://github.com/mcheemaa/rendi/blob/main/lib/rendi/harness/readback.ts)
