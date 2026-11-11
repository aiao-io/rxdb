# 模型设计器路线图

状态见 [status-overview](status-overview.md)，本页不维护第二份状态。整个史诗在同一个分支、同一个 PR 里推进。

## 当前批次：持久建模智能体

| 顺序 | 故事                                                                                       | 交付条件                                                         |
| ---- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1    | [MODEL-US-001](stories/platform/MODEL-US-001-application-requirements.md) 需求管理与门禁    | 本应用与 Admin 两道门禁都通过                                    |
| 2    | [MODEL-US-101](stories/agent/MODEL-US-101-modeling-tools-agent.md) 建模工具与智能体定义    | 离线测试驱动多步工具调用；共享模块覆盖率 ≥ 80%                   |
| 3    | [MODEL-US-002](stories/platform/MODEL-US-002-trigger-session-gateway.md) 会话签发与部署     | Worker 只签发会话；旧接口删除；部署说明可照做                    |
| 4    | [MODEL-US-102](stories/agent/MODEL-US-102-designer-durable-session.md) 设计器接入持久会话   | ops 幂等写入 AI 分支，刷新可续；旧解析链路删除                   |
| 5    | [MODEL-US-103](stories/agent/MODEL-US-103-manual-edit-readback.md) 手动修改回读             | 回读块只插在最新消息前，历史前缀不变                             |
| 6    | [MODEL-US-104](stories/agent/MODEL-US-104-clarifying-questions.md) 需求澄清提问             | 提问暂停本轮，选择后自动续轮                                     |

MODEL-US-101 与 MODEL-US-002 互不依赖，可以并行；MODEL-US-103、MODEL-US-104 都排在 MODEL-US-102 之后。

## 真实环境验收

MODEL-US-002、MODEL-US-101、MODEL-US-102 各有一条真实环境 AC（自建 Trigger.dev 实例 + 真实 DeepSeek + 真实浏览器），需要实例地址、项目 ref 与密钥到位后执行，记在[验收台账](verification-report.md)。拿到证据前，这三条故事不标 `Done`。

## 不排期目标

Worker 代理会话流、多标签页协作、后台任务唤醒智能体（如从现有数据库反向建模）见 [future-requirements](future-requirements.md)，具体场景出现后再立故事。
