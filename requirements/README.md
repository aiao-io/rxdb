# 需求管理

这里维护 rxdb 的用户故事、史诗和状态总览。这个目录不是“想法回收站”，而是当前实现范围、优先级和完成状态的业务入口。

## 真相源规则

所有 story 的 YAML `status` 字段（`stories/*/US-*.md`）是状态的**唯一真相源**。

其他地方（`status-overview.md`、各 epic 文件）都是它的派生视图，不允许独立维护。出现冲突时以 YAML 为准，并同步修复派生视图。

### 父故事（共享契约文档）

个别 story 因 INVEST「Small」不成立而被拆分，原文件保留为**父故事**：只承载子故事共享的契约、设计决策与不变式，
**不直接交付**。目前有四条：

| 父故事                                                              | 子故事                  | 子故事文件 |
| ------------------------------------------------------------------- | ----------------------- | ---------- |
| [US-012](stories/core/US-012-field-semantic-metadata.md)            | US-012a/b/c             | ✅ 已落盘  |
| [US-306](stories/collaboration/US-306-working-tree-index.md)        | US-306a/b/c             | ✅ 已落盘  |
| [US-904](stories/future/US-904-devtools-native-storage-contract.md) | US-904a/b/c/d 与 US-905 | ✅ 已落盘  |
| [US-015](stories/core/US-015-plugin-inject-dependency.md)           | US-015a / US-015b       | ❌ 未创建  |

父故事的 `status` 仍然参与计数（通常要等所有子故事 Done 才能置 Done）。若 feasibility 子故事以机器可读
`decision: unsupported` 关闭，受它门禁的子故事与父故事转 `Blocked` 并记录替代故事；不受该运行时前提影响的
共享子故事继续交付。`status-overview.md` 和 epic 列表用 `📄` 而非 `⬜` 标记父故事，并把子故事缩进列在其下，
避免读者以为它是一条可以直接开工的交付项。
拆分理由必须写进父故事 INVEST 清单的 `Small` 一项，说明拆分日期与承接的子故事编号。

**拆分即落盘（硬规则）**：把一条 story 降级为父故事时，**必须在同一次改动里创建全部子故事文件**，
哪怕只有 frontmatter + 一句「承接父故事的哪一段」。理由是拆分动作同时做了两件事——
它把父故事从 Backlog 移出（不再可开工），却没有把等量的可交付项放回去。子文件缺席时，
Epic 会呈现出「有故事在排队」的假象，而实际上没有任何一条可以开工。
US-015 是这条规则被违反的**现存唯一实例**，在补齐之前它是 epic-008 的开工前置。

## 目录结构

一个问题一个文件。查什么去哪里：

| 文件                                         | 回答的问题                                                       |
| -------------------------------------------- | ---------------------------------------------------------------- |
| [status-overview.md](status-overview.md)     | 每条故事**现在是什么状态**、哪些在做、哪些卡住                   |
| [roadmap.md](roadmap.md)                     | **接下来做什么**、什么必须排在什么前面                           |
| [capability-matrix.md](capability-matrix.md) | 仓库**现在能做什么**、哪些组合还不支持                           |
| [release-plan.md](release-plan.md)           | **下一次发布**要做什么、桥接版本卡在哪                           |
| [CHANGELOG.md](CHANGELOG.md)                 | **什么时候完成了什么**、历轮评审的决策                           |
| [versioning-policy.md](versioning-policy.md) | 什么算公开 API、什么改动算破坏性                                 |
| `migration-release.json`                     | 当前发布的迁移清单（门禁读它）                                   |
| `epics/`                                     | 史诗目标与阶段划分；`epic-008-parking-lot.md` 是明确不做的停车位 |
| `stories/`                                   | 按领域拆分的用户故事（**状态真相源**）                           |
| `api-baseline/`                              | 各包公开 API 表面基线（由门禁生成与校验）                        |
| `template.md`                                | 新建 story 的模板                                                |

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
- 拆分出的子故事：`US-XXXa-description.md` / `US-XXXb-…`，沿用父故事编号加小写字母后缀，不占用新编号段
- 史诗：`epic-XXX-name.md`

## 工作流

1. 从 `template.md` 复制出新 story
2. 选正确领域目录、未占用编号
3. 完整填写 frontmatter（id / title / status / priority / epic / created / updated / tags）、目标、AC 表、范围边界、实现文件
4. 推进过程中持续更新 `status`、`priority`、`updated`、`References`
5. 合并后：YAML `status: Done`，补 PR 链接，在 `CHANGELOG.md` 加一行

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
- [停车位：明确不做的范围](epics/epic-008-parking-lot.md)

视图：

- [状态概览](status-overview.md) · [排期与约束](roadmap.md) · [能力矩阵](capability-matrix.md) · [发布计划](release-plan.md) · [完成记录](CHANGELOG.md)
