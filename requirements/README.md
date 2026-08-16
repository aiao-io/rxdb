# 需求管理

这里维护 rxdb 的用户故事、史诗和状态总览。这个目录不是“想法回收站”，而是当前实现范围、优先级和完成状态的业务入口。

## 真相源规则

所有 story 的 YAML `status` 字段（`stories/*/US-*.md`）是状态的**唯一真相源**。

其他地方（`status-overview.md`、各 epic 文件）都是它的派生视图，不允许独立维护。出现冲突时以 YAML 为准，并同步修复派生视图。

### 大故事用「交付阶段」，不用子故事文件

个别 story 因 INVEST「Small」不成立而体量偏大。这类 story **仍是一个文件、一条状态**，
在正文里用 `## 交付阶段` 表把交付切成 A / B / C…，AC 表按阶段分段编号，实现文件表加「阶段」列。
现有四条：[US-012](stories/core/US-012-field-semantic-metadata.md)、[US-015](stories/core/US-015-plugin-inject-dependency.md)、[US-306](stories/collaboration/US-306-working-tree-index.md)、[US-904](stories/future/US-904-devtools-native-storage-contract.md)。

规则：

- **不创建 `US-XXXa` / `US-XXXb` 这类中间版本文件。** 一个编号一个文件，
  外部引用因此永远指向同一个路径
- 分阶段的理由写进 INVEST 清单的 `Small` 一项，说明为什么体量不成立、按什么顺序分批
- 阶段有独立可验收的 AC 区段与前置；全部阶段关闭后才置 `Done`
- 阶段可以有不同的完成度（例如 US-904 阶段 B 已交付、其余未开始），在「交付阶段」表的状态列体现
- 若某阶段被机器可读的 feasibility 门禁（如 US-904 的 `decision: unsupported`）否决，
  **只有受它门禁的阶段**转 `Blocked` 并记录替代故事，不受该前提影响的阶段继续交付；
  story 整体 `status` 相应转 `Blocked` 并在「交付阶段」表下注明

**编号只在能独立交付时才新开。** 一段工作如果有自己的用户价值、自己的前置和自己的关闭条件
（例如 US-905 相对 US-904），它就该占一个新编号；否则它是前一条 story 的一个阶段。

## 目录结构

一个问题一个文件。查什么去哪里：

| 文件                                         | 回答的问题                                     |
| -------------------------------------------- | ---------------------------------------------- |
| [status-overview.md](status-overview.md)     | 每条故事**现在是什么状态**、哪些在做、哪些卡住 |
| [roadmap.md](roadmap.md)                     | **接下来做什么**、什么必须排在什么前面         |
| [capability-matrix.md](capability-matrix.md) | 仓库**现在能做什么**、哪些组合还不支持         |
| [release-plan.md](release-plan.md)           | **下一次发布**要做什么、桥接版本卡在哪         |
| [versioning-policy.md](versioning-policy.md) | 什么算公开 API、什么改动算破坏性               |
| `migration-release.json`                     | 当前发布的迁移清单（门禁读它）                 |
| `epics/`                                     | 史诗目标与阶段划分                             |
| `stories/`                                   | 按领域拆分的用户故事（**状态真相源**）         |
| `api-baseline/`                              | 各包公开 API 表面基线（由门禁生成与校验）      |
| `template.md`                                | 新建 story 的模板                              |

`stories/` 子目录：

| 目录             | 内容                                                        | 编号段     |
| ---------------- | ----------------------------------------------------------- | ---------- |
| `core/`          | 核心引擎                                                    | US-001~099 |
| `framework/`     | Angular / React / Vue 集成                                  | US-101~199 |
| `adapter/`       | SQLite / PGlite / Supabase / sqliteai / 小程序 / 桌面适配器 | US-201~299 |
| `collaboration/` | 版本控制、撤销/重做、迁移协作                               | US-301~399 |
| `ui/`            | 代码编辑器等跨框架 UI 组件                                  | US-401~499 |
| `plugin/`        | RxDB plugin 包（workspace / storage / graph）               | US-501~599 |
| `tooling/`       | 门禁、基线与发布工具链（不是产品能力）                      | US-601~699 |
| `future/`        | 中长期规划                                                  | US-700~999 |

## 状态定义

| 状态          | 含义                       |
| ------------- | -------------------------- |
| `Backlog`     | 已确认要做，但还没开始     |
| `In Progress` | 正在实现                   |
| `In Review`   | 代码已完成，等待审核或收尾 |
| `Done`        | 已合并，当前仓库能力已覆盖 |
| `Blocked`     | 被外部依赖或前置条件卡住   |

## 跨故事 AC 转移

当一个 story 的某条 AC 被推迟到另一个 story 实现，**不要**只在源 story 的 HTML 注释里写 `<!-- deferredACs: AC#X→US-NNN -->`。

在 **接收方** story 的 frontmatter 加 `inherited_acs` 字段：

```yaml
inherited_acs:
  - from: US-NNN
    ac: N
    note: 简述为什么这条 AC 从源故事迁来
```

源 story 文件本体注释保留作为反向索引可读性辅助，但接收方 YAML 是机器可读的真相。

## 命名规范

- 用户故事：`US-XXX-description.md`
- **不使用** `US-XXXa` / `US-XXXb` 这类字母后缀文件；大故事在文件内分「交付阶段」，见上文
- 史诗：`epic-XXX-name.md`

## 工作流

1. 从 `template.md` 复制出新 story
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

视图：

- [状态概览](status-overview.md) · [排期与约束](roadmap.md) · [能力矩阵](capability-matrix.md) · [发布计划](release-plan.md)
