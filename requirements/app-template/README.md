# 应用级需求模板

仓库里每个需要独立产品需求的应用（业务应用、demo 应用）或产品组，在自己的需求根目录建立需求集合，独立统计和验收。通用治理规则见根[应用级需求与项目治理办法](../application-governance.md)，本目录只提供应用级的**目录位置、编号前缀与模板**。单应用通常使用 `apps/<app>/requirements/`；多个 Nx 应用组成一个产品时，可以使用 `<product>/requirements/` 统一管理。

## 与根 requirements 的关系

- 根 `requirements/` 维护平台与可复用领域能力（`US-XXX`）；应用的产品需求（界面、部署、账号、本机能力）在应用目录内管理，编号独立（`<APP>-US-XXX`），不混入平台统计。
- 应用故事引用平台能力，写在 frontmatter `capabilities` 里，形如 `rxdb:US-203`；应用内部前置继续写 `dependsOn`。底层能力 Done 不代表应用已接线或验收。

## 项目文件在哪里

应用需求目录的标准结构（照此自建）：

| 路径                     | 回答的问题                                                     |
| ------------------------ | -------------------------------------------------------------- |
| `README.md`              | 需求管理入口：本应用当前范围、目录导航、术语                   |
| `CONVENTIONS.md`         | 应用级增量约定：编号段、工作流、门禁命令（见本目录模板）       |
| `stories/<domain>/`      | 按领域拆分的用户故事（**状态真相源**，含 `story.template.md`） |
| `epics/`                 | 史诗目标与范围划分（含 `epic.template.md`）                    |
| `status-overview.md`     | 每条故事现在是什么状态、哪些在做、哪些卡住（派生视图）         |
| `roadmap.md`             | 接下来做什么、什么必须排在什么前面（派生视图）                 |
| `decisions.md`           | 已确定的决策与执行条件（`D-XX` 编号）                          |
| `capability-matrix.md`   | 应用现在能做什么、哪些组合还不支持（派生视图）                 |
| `verification-report.md` | 哪些证据来自本地/模拟，哪些仍需真实环境（分层验收台账）        |
| `future-requirements.md` | 未来产品做什么、目录如何演进、范围与验收边界                   |
| `plans/`                 | 实施计划、验收记录与历史归档（不是 story，不参与状态统计）     |
| `reviews/`               | 评审模板与旧记录入口；新代码问题按项目归仓库根并保留处置结果   |
| `code-scanning/`         | GitHub CodeQL 告警工作集（open 才留文件，关闭即归档删除）      |

## 怎么管

沿用根[约定](../CONVENTIONS.md)的全部规则，不重复定义：五态定义与真相源规则、命名规范、证据锚点与结论复验、只写当前结论与过程留档去向、大故事分阶段、跨故事 AC 转移、价值待证。

应用级增量只有四处：

| 增量     | 规则                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| 编号前缀 | story `<APP>-US-XXX`、epic `<APP>-EPIC-XXX`，`<APP>` 为应用短前缀（如 `MEDIA`）        |
| 编号段   | `stories/` 按领域建子目录，每领域分配一段 100 个编号（见本目录 `CONVENTIONS.md`）      |
| 提交关联 | 提交与 PR 用 `Refs: <APP>-US-XXX`，不用 `Closes`（见本目录 `CONVENTIONS.md`）          |
| 需求门禁 | 应用自带结构门禁，脚本随应用代码落地（如 `apps/<app>/scripts/check-requirements.mjs`） |

## 落地步骤

1. 复制本目录的 `CONVENTIONS.md` 与 `stories/`、`epics/`、`reviews/`、`code-scanning/` 下各文件到 `apps/<app>/requirements/`。
2. 全局替换 `<APP>` 为应用短前缀。
3. 建领域目录并分配编号段，按 `story.template.md` 新建故事、`epic.template.md` 新建史诗。
4. 自建派生视图（`status-overview.md` 等）与 `README.md`；每次改动按 `CONVENTIONS.md` 的「变更步骤」同步派生视图并跑应用门禁。

## 需求门禁

应用门禁只读文档与链接目标：校验故事 YAML、唯一 ID/文件名、连续 AC 编号、硬依赖存在与无环、Done 的全部 AC 和关闭依赖、派生视图数字、本地链接与标题锚点。结构检查通过**不证明**真实供应商、公网部署、历史迁移或正式发行；这些仍须逐条 AC 的真实环境证据。
