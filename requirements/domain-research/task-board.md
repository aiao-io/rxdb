# 候选领域：任务看板 / 项目管理（Trello 类）

> 本文是候选领域分析，不是用户故事，不参与状态统计。状态与维护规则见
> [本目录 README](README.md)。

**一句话结论**：投入产出比最高的候选——现有三端 demo 就是雏形，引擎内零缺口，远端用 Supabase
现成；在「无评论 / @ 提醒需求」的边界内完整可交付（不需要补引擎、不需要自建服务端）。

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

无。这也是它与 BOM 最大的差别：BOM 要先补 CHECK / 多重边（US-030 / US-507）才能开工，
看板什么都不用补。

## 引擎外成本

无重大成本。多租户写授权（RBAC）有 US-029 候选但价值待证，单团队场景用 US-027 已足够。
评论 / @ 提醒的轻实时需求走引擎外通道，超出「完整可交付」的边界。

## 立项前置

无硬前置。

## 入场条件（什么信号才值得立项）

- 出现具名团队「离线拖拽任务、回网后互相覆盖」的具体症状（价值待证判据）
- 或 owner 决定做「下一个完整演示应用」——演示价值入场（先例：BOM 由完整功能演示应用驱动，
  见 [epic-009](../epics/epic-009-bom-domain-model.md) 解锁记录）
