# 候选领域：看板 v2 —— GitHub Projects 风格筛选 / 泳道 / 字段体系

> 本文件是候选领域分析，不是用户故事，不参与状态统计；状态与维护规则见
> [本目录 README](README.md)。与 [epic-011](../epics/epic-011-task-board-domain-model.md)
> 决策 5（「多视图与结构化筛选不进首版」）直接冲突：解锁需按本文件入场条件由 owner 复核，
> 首版边界不变。档 3 多视图工作台方向沿用 [本目录 README 草稿区](README.md#草稿区)
> 「多视图数据工作台」行的定调，不在本文件展开。

**一句话结论**：把 GitHub Projects v2 看板中适合本地单人场景的能力（结构化筛选、分组泳道、
可选字段与列头统计、保存视图）分批补进已孵化的任务看板作为 v2 增强；「结构化筛选 + 按标签
泳道 + 结果就地呈现」零 schema 变更、性价比最高，可选字段体系是其余各项的地基。先完成
看板 v1 收尾（[RV-083](../reviews/RV-083-board-v1-closeout-checklist.md)）再评估。

**对标产品**：GitHub Projects v2 看板视图（列由字段驱动、卡片字段可配置、group by 泳道、
slice by 切片、语法化筛选、保存视图、字段求和与列上限、键盘导航与 `?` 快捷键面板）。
经典 Projects 看板已于 2025-04 退役，参照只取 v2；assignee、关联 PR、自动工作流、洞察图表
是多人远端协作产物，单人本地场景不采纳。

## 契合点：现有能力逐项映射

| 产品功能                                    | 引擎现有能力                                    | 出处                                                                           |
| ------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| 结构化筛选（标签多选、截止日范围、有 / 无） | 实体查询；US-538 板级搜索源已交付命中集合与分页 | [US-538](../stories/domain/US-538-board-task-search.md) · rxdb-plugin-search   |
| 分组泳道（按标签 / 优先级）                 | US-028 分组排序域（`groupBy` 排序键）           | [US-028](../stories/core/US-028-sortable-entity.md)                            |
| 搜索结果就地呈现（未命中淡化、命中高亮）    | US-538 命中集合现成，仅改视图呈现               | [US-539](../stories/domain/US-539-board-tri-framework-ui.md) 阶段 B            |
| 可选字段（优先级单选项、规模数字）          | 实体字段声明与索引；schema 版本迁移已有先例     | [US-030](../stories/core/US-030-declarative-storage-constraints.md) · epic-011 |
| 列头统计（字段求和 + WIP 上限）             | 列内聚合的 executor 读写（US-535 本列排序同款） | [US-535](../stories/domain/US-535-cross-column-move-ordering.md)               |
| 保存视图                                    | 新 `BoardView` 实体，与板同仓储、同撤销域       | epic-011 实体族 · [US-302](../stories/collaboration/US-302-undo-redo.md)       |

## 引擎缺口

- **字段与列实体的关系要定**：v1 列是实体（[US-534](../stories/domain/US-534-board-column-task-skeleton.md)），
  v2 字段是 Task 上的属性，两者并存——字段不驱动列、列仍由 Column 实体驱动。与 GitHub
  「列 = 字段值」不同，是有意的模型差异，不应动摇 US-534 的地基。
- **保存视图与可选字段需要 schema 变更**：新实体、新字段各一次迁移；归档恢复到实体结构
  指纹一致版本的约束（US-537）随迁移版本推进。
- 其余各项可用现有公开能力，无计划内引擎前置。

## 引擎外成本

全部本地能力、零后端；主要工作量是筛选 / 泳道 / 字段的 UI 三端对称与 e2e。无账号、无
同步（团队版仍归价值待证的 US-541）。

## 立项前置

无硬前置；建议先完成看板 v1 收尾（RV-083），再按本文件分项清单逐项解锁。

## 入场条件（什么信号才值得立项）

- 看板 MVP（v1）落地后，出现具体用户要「只看带某标签的一部分任务」或「第二个视图」的信号；
- 或 owner 决定把看板作为长期演示应用继续投入（演示价值入场，先例：epic-011 解锁记录）。

## 分项清单（按零 schema 变更优先）

| 项                                              | schema | 依赖       | 备注                                       |
| ----------------------------------------------- | ------ | ---------- | ------------------------------------------ |
| 结构化筛选（标签多选、截止日范围、有 / 无描述） | 无     | US-538     | 筛选器 UI 即可，不必实现 GitHub 全文语法   |
| 搜索结果就地呈现（未命中淡化、命中高亮）        | 无     | 结构化筛选 | 纯视图改法，替代独立结果列表               |
| 分组泳道（按标签）                              | 无     | US-028     | 升级路径与草稿区「按字段分组的视图」一致   |
| 可选字段体系（优先级单选项、规模数字）          | 有     | 无         | 地基项：解锁字段求和、列上限、按优先级分组 |
| 列头统计（字段求和 + WIP 上限）                 | 有     | 可选字段   | 与 GitHub 同为提示性、不强制               |
| 保存视图（`BoardView` 实体）                    | 有     | 前五项     | 布局 + 筛选 + 分组打包，可切换             |

档 3（表格 / 日历等多视图工作台融合）不在此列，触发信号与升级路径见
[README 草稿区](README.md#草稿区)「多视图数据工作台」行。

## 参考资料

- [GitHub Docs · 自定义看板布局](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-board-layout)
- [GitHub Docs · 筛选语法](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/filtering-projects)
- [GitHub Blog · Projects 键盘导航](https://github.blog/news-insights/project-navigation-for-the-way-you-work/)
- [epic-011 决策 5 与首轮切片](../epics/epic-011-task-board-domain-model.md#默认决策第-0-步复核)
