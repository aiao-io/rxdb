# 需求管理

这里维护 rxdb 的用户故事、史诗和状态总览。这个目录不是“想法回收站”，而是当前实现范围、优先级和完成状态的业务入口。

## 术语

| 缩写 | 全称                   | 含义                                                                                                |
| ---- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| AC   | Acceptance Criteria    | 验收标准（验收准则）。每条 story 正文「## 验收标准」表里的一行；`AC#N` 指该 story 第 N 条验收标准。 |
| US   | User Story             | 用户故事。需求编号 `US-XXX`，对应 `stories/*/US-XXX.md`。                                           |
| FR   | Functional Requirement | 功能需求条目。用 MUST 句式声明（如 `FR-052`），主要出现在 collaboration 相关 story 与 epic-006。    |

## 真相源规则

所有 story 的 YAML `status` 字段（`stories/*/US-*.md`）是状态的**唯一真相源**。

其他地方（`status-overview.md`、各 epic 文件）都是它的派生视图，不允许独立维护。出现冲突时以 YAML 为准，并同步修复派生视图。

### 大故事用「交付阶段」，不用子故事文件

个别 story 因 INVEST「Small」不成立而体量偏大。这类 story **仍是一个文件、一条状态**，
在正文里用 `## 交付阶段` 表把交付切成 A / B / C…，AC 表按阶段分段编号，实现文件表加「阶段」列。
现有 39 条：[US-012 扩展字段语义与前端通信契约](stories/core/US-012-field-semantic-metadata.md)、[US-015 插件依赖声明与按需装卸](stories/core/US-015-plugin-inject-dependency.md)、[US-020 将 QueryCache 接入统一 Repository](stories/core/US-020-querycache-repository.md)、[US-023 QueryCache 远端变更的失效上报口与实时同步](stories/core/US-023-querycache-remote-invalidation.md)、[US-025 核心包子系统按插件边界外移](stories/core/US-025-core-plugin-extraction.md)、[US-027 实体操作权限模型](stories/core/US-027-entity-permission-model.md)、[US-028 可排序实体（普通实体手动排序）](stories/core/US-028-sortable-entity.md)、[US-029 多用户 RBAC：角色与所有权写权限](stories/core/US-029-rbac-owner-role-permission.md)、[US-030 实体元数据层的声明式存储约束](stories/core/US-030-declarative-storage-constraints.md)、[US-031 树形实体迁移到排序模块](stories/core/US-031-tree-sortable-migration.md)、[US-207 Electron 连接本地 SQLite 文件](stories/adapter/US-207-desktop-local-database.md)、[US-210 Tauri 连接应用作用域 SQLite 文件](stories/adapter/US-210-tauri-sqlite-local-database.md)、[US-211 多端小程序宿主（支付宝 / 抖音 / 百度 / QQ）](stories/adapter/US-211-multi-miniprogram-platforms.md)、[US-212 HTTP 远程适配器](stories/adapter/US-212-http-adapter.md)、[US-214 HTTP 适配器浏览器端到端 demo（Angular 前端 + node:sqlite 参考后端）](stories/adapter/US-214-http-browser-demo.md)、[US-216 参考后端以 RxDB 引擎实现：后端可初始化 RxDB、前后端共享 schema 与查询逻辑](stories/adapter/US-216-server-side-rxdb.md)、[US-217 本地数据库一致性备份与恢复](stories/adapter/US-217-local-database-backup-restore.md)、[US-218 Supabase 远端启用 RLS 时的推送完整性](stories/adapter/US-218-supabase-rls-push-integrity.md)、[US-219 Taro 插件一行接入小程序 adapter 的构建配置](stories/adapter/US-219-taro-plugin.md)、[US-305 提交图与 HEAD 持久化](stories/collaboration/US-305-commit-graph-head.md)、[US-306 工作树与提交操作](stories/collaboration/US-306-working-tree-commits.md)、[US-313 只读检出位：不切换分支就打开另一条分支或一个可达提交的完整数据](stories/collaboration/US-313-read-only-checkout.md)、[US-314 可写检出位与从提交建分支：对齐 GitHub Desktop 3.6 的 worktree](stories/collaboration/US-314-writable-worktrees.md)、[US-403 实体组件 Headless API 与可定制展示层](stories/ui/US-403-entity-components-headless.md)、[US-507 BOM 图骨架：物料、修订与多重边 BOM 行](stories/domain/US-507-bom-graph-skeleton.md)、[US-510 多级展开与 where-used 反查](stories/domain/US-510-bom-multilevel-explosion.md)、[US-511 展开数量正确性：用量语义、三类损耗、虚拟件穿透](stories/domain/US-511-bom-quantity-semantics.md)、[US-513 联产品与副产品：多输出物料流](stories/domain/US-513-bom-coproduct-byproduct.md)、[US-524 工艺路线本体：工序、工作中心、工时与费率](stories/domain/US-524-routing-master-model.md)、[US-525 BOM 端到端 demo：一份数据集走完全域](stories/domain/US-525-bom-end-to-end-demo.md)、[US-526 模型驱动数据工作台：预置 schema 的录入 / 编辑 / 筛选闭环](stories/domain/US-526-admin-workbench.md)、[US-527 工作台备份恢复闭环：失败语义与数据保留](stories/domain/US-527-admin-backup-restore.md)、[US-528 独立消费接入示例与接入成本记录](stories/domain/US-528-admin-consumer-example.md)、[US-539 三框架看板视图与交互](stories/domain/US-539-board-tri-framework-ui.md)、[US-540 看板端到端 demo：一份数据集走完全域](stories/domain/US-540-board-end-to-end-demo.md)、[US-602 发布产物面向 AI 的可理解性](stories/tooling/US-602-ai-comprehensible-artifacts.md)、[US-705 P2P 字节传输](stories/future/US-705-p2p-byte-transfer.md)、[US-904 DevTools 原生本地存储调试](stories/future/US-904-devtools-native-storage-contract.md)、[US-909 会话录制回放与失败现场数据还原](stories/future/US-909-session-replay-debugging.md)。

> 判据是**正文里有阶段表**，不是 `status`——列表里既有 `Done` 也有 `Backlog`。核对方式：`grep -rl "交付阶段" requirements/stories/`（`node scripts/audit/requirements-consistency.mjs` 会比对本清单）。

分阶段规则（不建子文件、阶段各自可验收、门禁否决只转受门禁的阶段、编号只在能独立交付时才新开）
见 [CONVENTIONS.md](CONVENTIONS.md)「大故事分阶段」一节。

## 目录结构

一个问题一个文件。查什么去哪里：

| 文件                                          | 回答的问题                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| [status-overview.md](status-overview.md)      | 每条故事**现在是什么状态**、哪些在做、哪些卡住                             |
| [roadmap.md](roadmap.md)                      | **接下来做什么**、什么必须排在什么前面                                     |
| [capability-matrix.md](capability-matrix.md)  | 仓库**现在能做什么**、哪些组合还不支持                                     |
| [release-plan.md](release-plan.md)            | **下一次发布**要做什么、桥接版本卡在哪                                     |
| [vision.md](vision.md)                        | 1.0 之后的长期方向（不是排期、不是承诺）                                   |
| [versioning-policy.md](versioning-policy.md)  | 什么算公开 API、什么改动算破坏性                                           |
| [zh-glossary.md](zh-glossary.md)              | 中文注释 / TSDoc 词汇规约（哪些词保留、哪些要改）                          |
| [code-scanning/](code-scanning/README.md)     | GitHub CodeQL 告警工作集（open 才留文件，关闭即归档删除）                  |
| `migration-release.json`                      | 当前发布的迁移清单（门禁读它）                                             |
| `epics/`                                      | 史诗目标与阶段划分                                                         |
| `stories/`                                    | 按领域拆分的用户故事（**状态真相源**，含 `story.template.md`）             |
| `api-baseline/`                               | 各包公开 API 表面基线（由门禁生成与校验）                                  |
| `reviews/`                                    | review 模板与尚未处理的问题报告（修复后删除，留清理记录）                  |
| [domain-research/](domain-research/README.md) | 候选领域研究区：领域想法在成为用户故事之前的家（不是故事、不参与状态统计） |
| `CONVENTIONS.md`                              | 命名 / 状态 / 写作规范（单一真相源）                                       |

`stories/` 子目录与编号段见 [CONVENTIONS.md](CONVENTIONS.md#文档类型与编号段)（唯一真相源，不在此重复）。

## 状态定义

各文档类型的状态集合见 [CONVENTIONS.md](CONVENTIONS.md#状态定义)（story 五态：`Backlog` / `In Progress` /
`In Review` / `Done` / `Blocked`）。

## 跨故事 AC 转移

被推迟的 AC 在接收方 story 的 frontmatter 用 `inherited_acs` 字段声明（机器可读真相），详见
[CONVENTIONS.md](CONVENTIONS.md#跨故事-ac-转移)。

## 命名规范

四类文档的命名与编号段见 [CONVENTIONS.md](CONVENTIONS.md#命名规范)。

## 工作流

1. 从 [story.template.md](stories/story.template.md) 复制出新 story
2. 选正确领域目录、未占用编号
3. 完整填写 frontmatter（id / title / status / priority / epic / created / updated / tags）、目标、AC 表、范围边界、实现文件
4. 推进过程中持续更新 `status`、`priority`、`updated`、`References`
5. 合并后：YAML `status: Done`，补 PR 链接

## 提交与 PR 关联方式

story ID 是仓库内的需求编号，不是 GitHub issue 编号。**不要**写成 `Closes #US-001`。

推荐写法：

```text
feat(core): implement model decorators

Refs: US-001
```

PR 描述：

```text
## Related Stories
- US-001
- US-002
```

## 快速导航

Epic：

- [epic-001 核心 MVP](epics/epic-001-core-mvp.md)
- [epic-002 数据同步与协作](epics/epic-002-data-sync.md)
- [epic-003 UI 与开发者工具](epics/epic-003-ui-developer-tools.md)
- [epic-004 未来功能](epics/epic-004-future-features.md)
- [epic-005 类型系统演进](epics/epic-005-type-system-evolution.md)
- [epic-006 本地工作树与提交历史](epics/epic-006-working-tree-commits.md)
- [epic-007 公开 API 门禁](epics/epic-007-public-api-gates.md)
- [epic-008 生命周期作用域](epics/epic-008-lifecycle-scope.md)
- [epic-009 BOM 领域模型](epics/epic-009-bom-domain-model.md)
- [epic-010 模型驱动后台管理框架](epics/epic-010-model-driven-admin-framework.md)
- [epic-011 任务看板领域模型](epics/epic-011-task-board-domain-model.md)
- [epic-011 局域网 P2P 大文件共享](epics/epic-011-p2p-file-share.md)

视图：

- [状态概览](status-overview.md) · [排期与约束](roadmap.md) · [能力矩阵](capability-matrix.md) · [发布计划](release-plan.md)
