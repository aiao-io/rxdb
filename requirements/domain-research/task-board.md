# 候选领域：任务看板 / 项目管理（Trello 类）

> **已孵化（2026-10-19，owner 决定）**：本文件冻结为设计依据，不再独立演进——候选已建成
> [epic-011 任务看板领域模型](../epics/epic-011-task-board-domain-model.md) 与
> [US-534～US-541](../stories/domain/)，内容并入对应故事（孵化即冻结，见
> [本目录 README](README.md) 维护规则 3）。下文保留候选定位，执行范围与能力边界以
> 各故事与 [capability-matrix](../capability-matrix.md) 为准。
>
> 本文是候选领域分析，不是用户故事，不参与状态统计。状态与维护规则见
> [本目录 README](README.md)。

**一句话结论**：单人任务看板复用现有引擎能力，无需必选服务端；现有三端 demo 是交互雏形，
应用层仍需模型、本列排序、板内搜索、恢复流程与三端交互。团队身份与并发合并不随单人版交付。

**对标产品**：Trello（品类鼻祖，RxDB 上游经典 demo 原型）；Asana / Teambition / 飞书项目；
Jira（重协作侧）。

## 契合点：现有能力逐项映射

| 产品功能            | 引擎现有能力                                                                                     | 出处                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 看板拖拽排序        | 可排序实体（独立可排序 `Task` 实体，三端 Playwright 真实拖拽验收）+ 树排序迁移                   | [US-028](../stories/core/US-028-sortable-entity.md) · [US-031](../stories/core/US-031-tree-sortable-migration.md)              |
| 三端 demo 雏形      | 现有三端 demo（Todo / 文件管理器 / 菜单）已是这条产品线的雏形                                    | [capability-matrix](../capability-matrix.md) 项目统计                                                                          |
| 离线拖拽 + 回网合并 | Local-first 双向同步                                                                             | [epic-002](../epics/epic-002-data-sync.md)                                                                                     |
| 多成员协作          | 工作树 + commit graph 已交付（本地实体版本历史，作者由调用方提供）；身份、授权与远程提交协议另做 | [epic-006](../epics/epic-006-working-tree-commits.md) · [US-308](../stories/collaboration/US-308-branch-isolation-conflict.md) |
| 远端现成            | Supabase 适配器（RLS 推送完整性已打磨）或 HTTP 适配器                                            | [US-218](../stories/adapter/US-218-supabase-rls-push-integrity.md)                                                             |
| 任务搜索            | FTS5 / PGlite pg-tsvector（web）；原生桌面与小程序后端按放行表核对                               | [US-702](../stories/future/US-702-full-text-search.md)                                                                         |

## 引擎缺口

单人版按现有公开能力设计，无计划内引擎前置；可组合事务与板内搜索的实现边界见
[US-535](../stories/domain/US-535-cross-column-move-ordering.md) 与
[US-538](../stories/domain/US-538-board-task-search.md)。团队版不能由单人底座直接推定完成。

## 引擎外成本

单人版成本集中在领域模型、交互、备份与组合验收。团队版还需应用身份、成员写门禁与 Supabase RLS；
US-027 只约束公开 / 系统写入口，不能替代身份授权。US-029 不是单团队版的硬前置。
评论 / @ 提醒的轻实时需求走引擎外通道，超出「完整可交付」的边界。

## 立项前置

无硬前置。

## 入场条件（什么信号才值得立项）

- 出现具名团队「离线拖拽任务、回网后互相覆盖」的具体症状（价值待证判据）
- 或 owner 决定做「下一个完整演示应用」——演示价值入场（先例：BOM 由完整功能演示应用驱动，
  见 [epic-009](../epics/epic-009-bom-domain-model.md) 解锁记录）
