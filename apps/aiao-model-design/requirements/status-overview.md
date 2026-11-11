# 模型设计器状态总览

真相源为各 story 的 YAML `status`，应用能力不继承平台故事的状态。

## 状态汇总

| 状态           | 数量 |
| -------------- | ---- |
| ✅ Done        | 1    |
| 🚧 In Progress | 5    |
| 👀 In Review   | 0    |
| 📝 Backlog     | 0    |
| 🚫 Blocked     | 0    |
| **合计**       | 6    |

## 进行中（5 条）

持久建模智能体的代码与离线验收已完成：智能体与工具、Worker 会话签发、设计器接入、回读与提问都有离线测试。MODEL-US-002 / MODEL-US-101 / MODEL-US-102 各剩一条真实环境 AC（自建 Trigger.dev 实例 + 真实 DeepSeek + 真实浏览器）；MODEL-US-102 #3 与 MODEL-US-104 #1、#4 还缺浏览器或实例一侧的证据；MODEL-US-103 的 AC 已全部通过，随硬依赖 MODEL-US-102 关闭。

## 待评审（0 条）

无。

## 按 Epic 索引

### MODEL-EPIC-001 持久建模智能体

- ✅ [MODEL-US-001 应用需求管理与结构门禁](stories/platform/MODEL-US-001-application-requirements.md)
- 🚧 [MODEL-US-002 Trigger.dev 会话签发与自建部署](stories/platform/MODEL-US-002-trigger-session-gateway.md)
- 🚧 [MODEL-US-101 结构化建模工具与智能体定义](stories/agent/MODEL-US-101-modeling-tools-agent.md)
- 🚧 [MODEL-US-102 设计器接入持久会话](stories/agent/MODEL-US-102-designer-durable-session.md)
- 🚧 [MODEL-US-103 手动修改回读](stories/agent/MODEL-US-103-manual-edit-readback.md)
- 🚧 [MODEL-US-104 需求澄清提问](stories/agent/MODEL-US-104-clarifying-questions.md)
