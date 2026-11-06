# Admin 应用需求

当前交付：[0/4 已交付]。状态真相源为 `stories/<domain>/ADMIN-US-*.md` 的 YAML `status`，其余视图由故事派生。

## 当前范围

将 `dev-rxdb-admin` 从后台框架的领域测试应用，发展为在当前仓库持续孵化的 Admin 应用模板。当前批次交付应用级需求管理、结构门禁和统一的应用标识配置，保留资产样例与既有使用行为。随后用真实的新业务实体和自定义页面验证模板扩展路径。

未来可作为独立 Admin 启动项目模板；本轮不实施复制、导出、发包或独立仓库工程。范围依据见 [D-01](decisions.md#d-01在当前仓库孵化)。

## 导航

| 文档                                                   | 用途                       |
| ------------------------------------------------------ | -------------------------- |
| [CONVENTIONS.md](CONVENTIONS.md)                       | 编号段、引用规则与应用门禁 |
| [status-overview.md](status-overview.md)               | 故事状态与统计             |
| [roadmap.md](roadmap.md)                               | 当前批次、后续顺序与前置   |
| [decisions.md](decisions.md)                           | 生效决策与执行条件         |
| [capability-matrix.md](capability-matrix.md)           | 当前能力与未验边界         |
| [verification-report.md](verification-report.md)       | 本地验收证据与待验项       |
| [future-requirements.md](future-requirements.md)       | 长期目标与准入条件         |
| [epics/ADMIN-EPIC-001.md](epics/ADMIN-EPIC-001.md)     | 应用模板孵化范围           |
| [stories/story.template.md](stories/story.template.md) | 新故事模板                 |
| [plans/README.md](plans/README.md)                     | 实施计划与验收记录         |
| [reviews/README.md](reviews/README.md)                 | 待处理 review 工作集       |
| [code-scanning/README.md](code-scanning/README.md)     | CodeQL 告警工作集          |

## 平台与应用

根 [requirements](../../../requirements/README.md) 管可复用平台能力，本目录管应用级集成与产品体验，管理规则沿用 [app-template](../../../requirements/app-template/README.md)。故事使用 `capabilities: [rxdb:US-526]` 引用平台能力，应用内前置写 `dependsOn`，不复制平台故事或继承其完成状态。

应用入口与启动命令见 [应用 README](../README.md)。结构门禁只证明文档一致性，不能替代浏览器操作、持久化或备份恢复验收。
