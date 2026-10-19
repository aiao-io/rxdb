---
id: US-528
title: 任务详情与编辑：标签、截止日与撤销重做
status: Backlog
priority: Low
epic: epic-010-task-board-domain-model
created: 2026-10-19
updated: 2026-10-19
tags: [domain, board, detail, label]
---

# 用户故事：任务详情与编辑：标签、截止日与撤销重做

## 作为/我想要/以便

**作为** 单人看板用户
**我想要** 打开任务卡片改标题、写描述、贴标签、设截止日，改错了能撤销
**以便** 卡片装得下「这个任务到底要做什么、什么时候要」

## 范围边界

### In Scope

- **标题与描述编辑**：标题必填（[US-526](US-526-board-column-task-skeleton.md) AC#4），描述为
  可选多行文本
- **board 级标签**：`board_label`（board 内唯一的名字 + 颜色）是 board 的 1:N 子表；task 以
  多对多引用标签（一张 `task_label` 关联表）。删标签 → 从该板全部任务上移除（Trello 语义，
  不留悬空引用）
- **截止日**：task 可选 `due_date`（日期，无时间部分）；逾期展示由 UI 派生（[US-531](US-531-board-tri-framework-ui.md)），
  本故事只存值
- **详情对话框复用**：三端 rxdb-model 的 `EntityDetail` 已交付列表 / 详情 / 表单（2026-10-18
  优先级评审核对后的事实），本故事在其上做看板字段接线，不自造第二个详情 UI
- **撤销重做**：任务的全部编辑（含标签增删、截止日）经 `RxDBChange` 记录；`undo()` 反转最近
  一次编辑、`redo()` 重放（会话级），语义沿用 [US-302](../collaboration/US-302-undo-redo.md)
  已交付行为（durable undo + 会话级 redo + 新操作清空 redo 栈），本故事只做入口接线

### Out of Scope

- 评论 / @ 提醒 / 附件 / 子任务清单（Trello checklist）——引擎外通道或后续批次，模型不预留
  对应表（epic 默认决策 5）
- 任务搜索（→ [US-530](US-530-board-task-search.md)）
- 标签的跨板复用——标签是 board 级定义，不做全局标签库
- 三端 UI 的编辑交互形态（→ [US-531](US-531-board-tri-framework-ui.md)）

## 验收标准

| #   | 前置条件                                     | 操作                               | 预期结果                                                                                 | 状态 |
| --- | -------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- | ---- |
| 1   | task T 存在                                  | 改标题与描述并保存；重开库         | 新值持久化，重开后仍在                                                                   | ⬜   |
| 2   | 板 B 定义标签 L1（红）、L2（蓝）             | 给 task T 贴 L1、L2；查询 T 的标签 | T 引用两条标签；标签定义在板级、任务引用多对多                                           | ⬜   |
| 3   | 板 B 有 3 条任务都贴了 L1                    | 删除标签 L1                        | 3 条任务的 L1 引用一并移除，无悬空引用；其余标签不受影响                                 | ⬜   |
| 4   | 同名标签已存在                               | 在同板再建同名标签                 | 拒绝（board 内标签名唯一），零写入                                                       | ⬜   |
| 5   | task T 设截止日 2026-12-31                   | 保存并重开库                       | 截止日原值保留（纯日期，无时区换算漂移）                                                 | ⬜   |
| 6   | 完成一次标题编辑                             | 调用 `undo()`，再调用 `redo()`     | 标题回退到编辑前，再回到编辑后；redo 栈随新操作清空（US-302 已交付语义，本故事接线）     | ⬜   |
| 7   | 完成「改标题 + 贴标签 + 设截止日」的连续编辑 | 连续 `undo()` 三次                 | 每次反转一个编辑（按 `RxDBChange` 序），任务回到初始状态；页面刷新后仍可 undo（durable） | ⬜   |
| 8   | 描述粘贴超长文本（如 100 KiB）               | 保存                               | 接受并完整读回（描述无长度上限的领域需求）；如实现层有限制则显式拒绝并提示，不静默截断   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**详情对话框是复用不是新建。** 三端 rxdb-model 已交付 `EntityDetail`（列表、详情、表单、查询
构建器；跨框架对拍 T049 与三端对称复核 T050 已关，见 roadmap 零散收尾项），看板的任务详情是
它的一个消费页面——本故事只做字段接线（标题 / 描述 / 标签多对多 / 截止日），任何「自造第二个
详情 UI」的倾向都违反复用。

**标签为什么是 board 级定义 + 多对多引用。** Trello 的标签是板级调色板，任务从板级标签里选。
两级建模（`board_label` 1:N 属 board，`task_label` N:M 关联）与「task 直接存标签数组」的差别在
删除语义：板级定义让「删标签从全部任务移除」是一次按 `label_id` 的关联清理；数组方案要把
每条任务的数组逐条改写，且同名标签改色要全板扫描。看板不引入通用标签引擎——一个 1:N + 一个
关联表就是全部，新增抽象只有 `board_label` 一项，不值得为它做可复用组件。

**撤销重做是接线不是重实现。** US-302 已交付 durable undo（基于 `RxDBChange.inversePatch`，
页面刷新后仍可撤销）与会话级 redo。看板侧唯一要做的是保证「贴标签」「设截止日」这些编辑都
落在普通 `RxDBChange` 路径上（不绕道直连 SQL），undo 就能天然覆盖它们——AC#7 的连续 undo 是
这条不变量的验收。批量改序的 undo 见 [US-527](US-527-cross-column-move-ordering.md) AC#7。

**落点：`packages/rxdb-plugin-board`** 的标签仓储与详情编辑服务；三端交互见 US-531。

**关闭条件**：任务全部字段（含标签与截止日）编辑持久化且重开不丢；删标签无悬空引用；
编辑全部可 undo（durable）且 redo 语义与 US-302 一致；无第二套详情 UI。

## 价值待证

本故事已随 [epic-010 解锁记录](../../epics/epic-010-task-board-domain-model.md#价值待证整个-epic)
解锁（2026-10-19，owner 决定）：新增 `board_label` 抽象对应零个已知病灶，「病灶数 ≥ 抽象数」
按 owner 决定豁免（演示价值入场），依据与边界见 epic。

## 实现文件

- `packages/rxdb-plugin-board/` — 待建；`board_label` / `task_label` 实体与标签仓储、详情编辑服务

## References

- [epic-010 任务看板领域模型](../../epics/epic-010-task-board-domain-model.md)
- [US-526 看板领域模型骨架](US-526-board-column-task-skeleton.md) — 前置：task 实体
- [US-302 撤销/重做](../collaboration/US-302-undo-redo.md) — `undo()` / `redo()` 已交付语义
- [US-027 实体操作权限模型](../core/US-027-entity-permission-model.md) — 公开写入口判定（编辑都走普通变更路径的底座）
- [rxdb-model 实体模型库](../../../packages/rxdb-model/src/index.ts) — `EntityDetail` 复用点
- [roadmap 零散收尾项](../../roadmap.md#零散收尾项不成故事随手可带) — T049 / T050 对拍与对称复核记录
