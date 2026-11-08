# Aiao Pool 需求管理

这里维护 Aiao Pool（文件池）的用户故事、史诗和状态总览。这个目录不是「想法回收站」，而是产品当前实现范围、优先级和完成状态的业务入口。当前状态、未完成 AC 与关闭条件见[状态概览](status-overview.md)。

本目录管理 Aiao Pool 的独立产品需求，编号为 `POOL-US-XXX`。仓库根 `requirements/` 管理平台与领域能力（本产品技术底座的 US-704～US-713 也在那里），两者分别统计；通过带作用域的能力引用关联，底层故事 Done 不代表应用已接线或验收。

产品立项、市场依据与决策记录见[决策](decisions.md)与[立项方案](plans/p2p-product-proposal.md)；后续产品方向（桌面端、跨网中继、扩展渠道、商业化）见[未来功能需求与目录规划](future-requirements.md)。

## 术语

| 缩写 | 全称                | 含义                                                                                                |
| ---- | ------------------- | --------------------------------------------------------------------------------------------------- |
| AC   | Acceptance Criteria | 验收标准（验收准则）。每条 story 正文「## 验收标准」表里的一行；`AC#N` 指该 story 第 N 条验收标准。 |
| US   | User Story          | 用户故事。需求编号 `POOL-US-XXX`，对应 `stories/*/POOL-US-XXX.md`。                                 |

## 真相源规则

所有 story 的 YAML `status` 字段（`stories/*/POOL-US-*.md`）是状态的**唯一真相源**。

其他地方（`status-overview.md`、各 epic 文件）都是它的派生视图，不允许独立维护。出现冲突时以 YAML 为准，并同步修复派生视图。状态数量、合并状态与剩余验收只写在[状态概览](status-overview.md)，其他页面链接过去，不再复述。

## 目录结构

一个问题一个文件。查什么去哪里：

| 文件                                             | 回答的问题                                                     |
| ------------------------------------------------ | -------------------------------------------------------------- |
| [status-overview.md](status-overview.md)         | 每条故事**现在是什么状态**、哪些在做、哪些卡住                 |
| [roadmap.md](roadmap.md)                         | **接下来做什么**、什么必须排在什么前面                         |
| [future-requirements.md](future-requirements.md) | **未来产品做什么**、形态路线与验收边界                         |
| [capability-matrix.md](capability-matrix.md)     | 产品**现在能做什么**、哪些组合还不支持                         |
| [verification-report.md](verification-report.md) | 哪些证据来自本地/模拟，哪些仍需真实环境（分层验收台账）        |
| [decisions.md](decisions.md)                     | 产品定位、命名、商业模式与里程碑的当前结论                     |
| [plans/](plans/README.md)                        | 立项方案、实施验收记录和历史归档                               |
| `epics/`                                         | 史诗目标与范围划分                                             |
| `stories/`                                       | 按领域拆分的用户故事（**状态真相源**，含 `story.template.md`） |
| `reviews/`                                       | AI review 模板与尚未处理的问题报告（修复后删除，留清理记录）   |
| `code-scanning/`                                 | GitHub CodeQL 告警工作集（open 才留文件，关闭即归档删除）      |
| `CONVENTIONS.md`                                 | 命名 / 状态 / 写作规范（单一真相源）                           |

`stories/` 子目录与编号段见 [CONVENTIONS.md](CONVENTIONS.md#文档类型与编号段)（唯一真相源，不在此重复）。

## 状态定义

各文档类型的状态集合见 [CONVENTIONS.md](CONVENTIONS.md#状态定义)（story 五态：`Backlog` / `In Progress` / `In Review` / `Done` / `Blocked`）。

## 命名规范

文档的命名与编号段见 [CONVENTIONS.md](CONVENTIONS.md#命名规范)。

## 工作流

1. 从 [story.template.md](stories/story.template.md) 复制出新 story
2. 选正确领域目录、未占用编号
3. 完整填写 frontmatter（id / product / title / status / priority / epic / created / updated / dependsOn / capabilities / tags）、目标、AC 表、范围边界、实现文件
4. 推进过程中持续更新 `status`、`priority`、`updated`、`References`
5. 合并后：YAML `status: Done`，补 PR 链接
