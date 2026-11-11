---
id: MODEL-EPIC-001
status: In Progress
startDate: 2026-11-11
targetDate: TBD
owner: jimmy
---

# 持久建模智能体

## 愿景

把模型设计器的 AI 从一次性请求改成运行在自建 Trigger.dev 上的持久智能体：工具保证模型结构正确，会话跨刷新和部署持续，用户的修改被智能体看见，产出由用户在 AI 分支上审阅后合并。

## 目标

- [ ] 应用需求独立管理，门禁约束状态、引用与派生视图（[MODEL-US-001](../stories/platform/MODEL-US-001-application-requirements.md)）。
- [ ] Worker 只负责登录与会话签发，智能体部署到自建 Trigger.dev，旧接口删除（[MODEL-US-002](../stories/platform/MODEL-US-002-trigger-session-gateway.md)）。
- [ ] 建模通过自带校验的工具完成，关系成对、引用按名称、错误回到模型（[MODEL-US-101](../stories/agent/MODEL-US-101-modeling-tools-agent.md)）。
- [ ] 设计器接入持久会话，工具产出幂等写入 AI 分支，刷新可续（[MODEL-US-102](../stories/agent/MODEL-US-102-designer-durable-session.md)）。
- [ ] 两轮之间的手动修改回读给智能体（[MODEL-US-103](../stories/agent/MODEL-US-103-manual-edit-readback.md)）。
- [ ] 需求不清时先提问再建模（[MODEL-US-104](../stories/agent/MODEL-US-104-clarifying-questions.md)）。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [MODEL-US-001 应用需求管理与结构门禁](../stories/platform/MODEL-US-001-application-requirements.md) (High)
- [MODEL-US-002 Trigger.dev 会话签发与自建部署](../stories/platform/MODEL-US-002-trigger-session-gateway.md) (High)
- [MODEL-US-101 结构化建模工具与智能体定义](../stories/agent/MODEL-US-101-modeling-tools-agent.md) (High)
- [MODEL-US-102 设计器接入持久会话](../stories/agent/MODEL-US-102-designer-durable-session.md) (High)
- [MODEL-US-103 手动修改回读](../stories/agent/MODEL-US-103-manual-edit-readback.md) (Medium)
- [MODEL-US-104 需求澄清提问](../stories/agent/MODEL-US-104-clarifying-questions.md) (Medium)

## 非目标

- 不实现 rendi 的定时心跳、邮件、分享链接、浏览器截图自检等与建模无关的能力。
- 不把模型数据搬到服务端：浏览器本地 RxDB 仍是真相源。
- 不搭建或运维自建 Trigger.dev 实例本身。
