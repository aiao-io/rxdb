# Admin 产品需求

当前交付：[8/30 已交付]。17 条 In Review：ADMIN-US-201 与 ADMIN-US-220 各有 AC 等待真实环境证据，ADMIN-US-202～216 的 AC 已全部通过、等待硬依赖 ADMIN-US-201 关闭。ADMIN-US-217（生产部署）进行中，ADMIN-US-101 因缺少真实业务输入保持 Backlog；ADMIN-US-222～224（Supabase 接入标准化，[D-11](decisions.md#d-11supabase-接入走平台标准层)）待排期。状态真相源为 `stories/<domain>/ADMIN-US-*.md` 的 YAML `status`，其余视图由故事派生。

## 当前范围

以 `rxdb-admin-template` 为产品根目录，在当前 Nx 工作区统一维护 Angular / React / Vue 三端 Admin 应用模板的需求。应用需求基线、统一配置、国际化、页面扩展、产品根需求与协作后端收敛已按本地同层证据交付。协作首版（ADMIN-US-201～216）的 AC 已在本地隔离栈通过，关闭取决于 ADMIN-US-201 的两项真实邮件环境证据；正式部署由 ADMIN-US-217 承接。当前保留资产样例与既有使用行为，真实业务实体替换仍等待输入。

协作产品模型固定为：**团队空间 → 任务草稿/分支 → 持续提交 → 数据 PR → 讨论、差异与最终候选 → 审核 → 有权限成员原子合并到共享数据**。本目录的故事只描述目标行为和验收条件，不把现有 RxDB 插件、Supabase 适配器或交互原型当作已经完成的应用闭环；协作实现记录见 [协作实现与验收记录](plans/collaboration-implementation.md)。

范围依据见 [D-01](decisions.md#d-01在当前仓库孵化) 和 [D-06](decisions.md#d-06数据协作的产品模型)。

## 导航

| 文档                                                   | 用途                               |
| ------------------------------------------------------ | ---------------------------------- |
| [CONVENTIONS.md](CONVENTIONS.md)                       | 编号段、引用规则与应用门禁         |
| [status-overview.md](status-overview.md)               | 故事状态与统计                     |
| [roadmap.md](roadmap.md)                               | 当前批次、协作闭环顺序与前置       |
| [collaboration-contract.md](collaboration-contract.md) | 协作状态、并发、候选与审核共享规则 |
| [decisions.md](decisions.md)                           | 生效决策与执行条件                 |
| [capability-matrix.md](capability-matrix.md)           | 当前能力与未验边界                 |
| [verification-report.md](verification-report.md)       | 本地验收证据与待验项               |
| [future-requirements.md](future-requirements.md)       | 长期目标与后续候选                 |
| [epics/ADMIN-EPIC-001.md](epics/ADMIN-EPIC-001.md)     | 应用模板孵化范围                   |
| [epics/ADMIN-EPIC-002.md](epics/ADMIN-EPIC-002.md)     | 认证与团队工作区                   |
| [epics/ADMIN-EPIC-003.md](epics/ADMIN-EPIC-003.md)     | 数据变更中心与合并治理             |
| [epics/ADMIN-EPIC-004.md](epics/ADMIN-EPIC-004.md)     | 协作后端收敛、部署与运维           |
| [epics/ADMIN-EPIC-005.md](epics/ADMIN-EPIC-005.md)     | Supabase 接入标准化                |
| [stories/story.template.md](stories/story.template.md) | 新故事模板                         |
| [stories/collaboration/](stories/collaboration)        | 认证、团队和数据协作故事           |
| [plans/README.md](plans/README.md)                     | 实施计划与验收记录                 |
| [reviews/README.md](reviews/README.md)                 | 待处理 review 工作集               |
| [code-scanning/README.md](code-scanning/README.md)     | CodeQL 告警工作集                  |

## 平台与应用

根 [requirements](../../requirements/README.md) 管可复用平台能力，本目录管应用级集成与产品体验；通用治理规则见[应用级需求与项目治理办法](../../requirements/application-governance.md)，目录结构和文件模板见[应用级需求模板](../../requirements/app-template/README.md)。故事使用 `capabilities: [rxdb:US-XXX]` 引用平台能力，应用内前置写 `dependsOn`，不复制平台故事或继承其完成状态。

本目录是三个应用及其 E2E 的产品需求唯一真相源，共用 `ADMIN-*` 前缀；认证、团队权限和数据 PR 的行为必须在 Angular、React、Vue 三端保持同一业务状态、权限规则和验收结果。应用入口与启动命令见 [产品 README](../README.md)。结构门禁只证明文档一致性，不能替代浏览器操作、Supabase RLS、跨设备同步或原子合并验收。

## 产品归属与校验

产品包含 `rxdb-admin-template-angular`、`rxdb-admin-template-react`、`rxdb-admin-template-vue` 及对应三个 E2E 项目。跨端行为只建一条产品故事，框架专属入口和证据写入同一故事，不按框架复制状态。

```bash
pnpm nx run rxdb-admin-template:requirements-check
pnpm nx run rxdb-admin-template:requirements-test
```

三端的同名门禁入口依赖上述产品任务；各应用 `test` 自动带入统一门禁。产品需求目录变化通过 Nx 依赖进入三端和 E2E 的 affected 范围。迁移与验证见 [ADMIN-US-004](stories/platform/ADMIN-US-004-product-requirements.md)。
