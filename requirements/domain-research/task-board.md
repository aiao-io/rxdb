# 候选领域：任务看板 / 项目管理（Trello 类）

> 本文是冻结的设计依据，不参与故事状态统计。已孵化范围见
> [epic-011 任务看板领域模型](../epics/epic-011-task-board-domain-model.md)，
> 当前交付与验收只在 US-534～US-541 和派生视图维护；候选状态见 [本目录 README](README.md)。

**一句话结论**：单人任务看板已按完整演示应用目标孵化，US-534～US-540 共 7 条已授权。
团队身份、授权、远端策略与冲突规则属于仍待准入的 US-541，不能从单人底座推定团队版已可交付。

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

首轮复用已有排序、事务、历史、备份与搜索底座；领域模型、移动语义、板内搜索协调和恢复编排
按 [epic 首轮切片](../epics/epic-011-task-board-domain-model.md#首轮可开工切片)验收，不把底座存在当作领域完成。

## 引擎外成本

单人版需完成看板状态、跨列排序、详情与恢复。团队版必须定义身份、服务端授权和同步策略，
US-027 的实体操作约束不代替按人授权；评论 / @ 提醒的消息通道另定范围。

## 立项前置

无硬前置。

## 入场条件（什么信号才值得立项）

- 出现具名团队「离线拖拽任务、回网后互相覆盖」的具体症状（价值待证判据）
- 或 owner 决定做「下一个完整演示应用」——演示价值入场（先例：BOM 由完整功能演示应用驱动，
  见 [epic-009](../epics/epic-009-bom-domain-model.md) 解锁记录）
