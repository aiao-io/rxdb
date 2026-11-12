# 模型设计器应用需求

当前交付：[2/6 已交付]。状态真相源为 `stories/<domain>/MODEL-US-*.md` 的 YAML `status`，其余视图由故事派生。

## 当前范围

把模型设计器的 AI 从「Worker 一次性返回整块 JSON、对话回复里夹带变更块」重构为运行在自建 Trigger.dev 上的持久建模智能体。做法参考 [rendi](https://github.com/mcheemaa/rendi)：

- 智能体是一份 Markdown 定义文件（frontmatter 声明模型与工具清单，正文是系统提示词），每个能力是一个工具文件。
- 每个会话是一个 `chat.agent` 持久会话，刷新、断线、重新部署后都能接着进行。
- 结构约束放在工具里：工具负责生成 ID、成对创建关系、校验命名，校验不过就把错误还给模型，由模型自己改，而不是靠提示词叮嘱。
- 用户在两轮之间手动做的修改会回读给智能体。
- 智能体的产出只写进 AI 分支，由用户审阅后合并。

浏览器本地 RxDB 仍是模型真相源，见 [D-03](decisions.md#d-03本地模型是真相源)。范围依据见 [decisions](decisions.md)，调研结论见 [rendi 与 Trigger.dev 调研](plans/agent-harness-research.md)。

## 导航

| 文档                                                   | 用途                       |
| ------------------------------------------------------ | -------------------------- |
| [CONVENTIONS.md](CONVENTIONS.md)                       | 编号段、引用规则与应用门禁 |
| [status-overview.md](status-overview.md)               | 故事状态与统计             |
| [roadmap.md](roadmap.md)                               | 当前批次、后续顺序与前置   |
| [decisions.md](decisions.md)                           | 生效决策与执行条件         |
| [capability-matrix.md](capability-matrix.md)           | 当前能力与未验证的边界     |
| [verification-report.md](verification-report.md)       | 分层验收证据与待验项       |
| [future-requirements.md](future-requirements.md)       | 长期方向与准入条件         |
| [epics/MODEL-EPIC-001.md](epics/MODEL-EPIC-001.md)     | 持久建模智能体             |
| [stories/story.template.md](stories/story.template.md) | 新故事模板                 |
| [plans/README.md](plans/README.md)                     | 调研、实施计划与验收记录   |
| [reviews/README.md](reviews/README.md)                 | 应用旧 review 记录入口     |
| [code-scanning/README.md](code-scanning/README.md)     | CodeQL 告警工作集          |

## 平台与应用

根 [requirements](../../../requirements/README.md) 管可复用的平台能力，本目录管模型设计器的产品需求与集成，管理规则沿用 [app-template](../../../requirements/app-template/README.md)。故事用 `capabilities: [rxdb:US-301]` 引用平台能力，应用内的前置写 `dependsOn`，不复制平台故事，也不继承平台故事的完成状态。

应用入口、启动与部署命令见[应用 README](../README.md)。结构门禁只证明文档一致，不能代替浏览器操作、真实 Trigger.dev 实例或真实模型的验收。

## 术语

| 术语     | 含义                                                                         |
| -------- | ---------------------------------------------------------------------------- |
| 智能体   | `agent/model-designer.md` 定义、在 Trigger.dev 上运行的 `chat.agent` 任务    |
| 会话     | 一个持久的 Trigger.dev Session，以 `chatId` 为键，跨 run 存活                |
| 快照     | 浏览器每轮随消息发送的当前模型（实体、属性、关系、索引），智能体据此建立草稿 |
| 草稿     | 智能体在服务端对快照做工具修改后的模型，只活在当前轮                         |
| 操作日志 | 工具输出里的 `ops`，浏览器按 `toolCallId` 幂等写入 AI 分支                   |
| AI 分支  | 智能体写入的 RxDB 分支（平台版本控制能力），由用户合并或丢弃                 |
| 回读     | 上一轮结束后用户手动做的修改，在下一轮注入给智能体                           |
