# 模型设计器路线图

状态见 [status-overview](status-overview.md)，本页不维护第二份状态。整个史诗在同一个分支、同一个 PR 里推进。

## 当前批次：已完成

离线验收、本机自建 Trigger.dev、真实本地 Supabase 账号、真实 DeepSeek 会话和真实 Chromium 全流程均已完成，证据见[验收台账](verification-report.md)。MODEL-EPIC-001 的 6 条故事和 MODEL-EPIC-002 的 2 条故事均已完成，当前没有待关闭的范围内故事。

| 故事 | 完成证据 |
| ---- | -------- |
| [MODEL-US-002](stories/platform/MODEL-US-002-trigger-session-gateway.md) 会话签发与部署 | 本地自托管 Trigger 栈、真实账号登录、会话流回复通过 |
| [MODEL-US-102](stories/agent/MODEL-US-102-designer-durable-session.md) 设计器接入持久会话 | AI 分支写入、刷新续流、合并与丢弃通过 |
| [MODEL-US-103](stories/agent/MODEL-US-103-manual-edit-readback.md) 手动修改回读 | 回读差异、改名、丢弃分支和多轮注入通过 |
| [MODEL-US-104](stories/agent/MODEL-US-104-clarifying-questions.md) 需求澄清提问 | 提问选项、回填续轮、刷新恢复和重复点击保护通过 |

正式部署时，按[应用 README](../README.md#部署) 配置生产实例；这属于部署操作，不构成本地需求未完成。

## 不排期目标

Worker 代理会话流、多标签页协作、后台任务唤醒智能体（如从现有数据库反向建模）见 [future-requirements](future-requirements.md)，具体场景出现后再立故事。
