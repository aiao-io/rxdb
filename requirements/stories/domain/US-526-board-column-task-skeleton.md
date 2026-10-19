---
id: US-526
title: 看板领域模型骨架：Board / Column / Task 与按列排序域
status: Backlog
priority: Low
epic: epic-010-task-board-domain-model
created: 2026-10-19
updated: 2026-10-19
tags: [domain, board, schema]
---

# 用户故事：看板领域模型骨架：Board / Column / Task 与按列排序域

## 作为/我想要/以便

**作为** 单人看板用户
**我想要** 建一块板、在板里建列、在列里建任务，列与任务都能手动排序，任务属于且只属于一列
**以便** 像 Trello 一样把工作摊开在一面墙上，顺序即优先级

## 范围边界

### In Scope

- 三个实体：`board`（标题必填、描述）、`column`（标题必填，属 board）、`task`（标题必填，属 column）
- **按列排序域**：`task` 声明 `manualOrderGroupFields: ['columnId']`（分组字段强制非空），
  列内手动排序、按组创建追加、默认排序带分组字段——全部由 [US-028 阶段 D](../core/US-028-sortable-entity.md)
  已交付的分组排序域承载，本故事只做声明与实体
- **列序**：`column` 以 `boardId` 为分组字段的排序域（板内拖列）
- **结构归属**：task 无独立 `board_id`，board 由 column 推导（单一真相源，见技术笔记）；
  `column.board_id` 创建后不可改；`task.column_id` 引用必须存在且其 board 与当前板一致（跨列移动
  允许改 `task.column_id`，见 [US-527](US-527-cross-column-move-ordering.md)）
- **删除级联**：删列 → 该列全部任务一并删除；删板 → 全部列与任务一并删除。级联在**应用层事务内**
  显式执行（先列出会删的任务数再确认，不静默），引擎侧只依赖已交付的组合外键与事务
  （[US-005](../core/US-005-relationship-mapping.md)、[US-008](../core/US-008-transaction-support.md)）

### Out of Scope

- 跨列移动与批量改序语义（→ [US-527](US-527-cross-column-move-ordering.md)）
- 任务详情字段：描述、标签、截止日（→ [US-528](US-528-task-detail-editing.md)）
- 备份导出与重开恢复（→ [US-529](US-529-board-backup-restore.md)）
- 任务搜索（→ [US-530](US-530-board-task-search.md)）
- 三端 UI（→ [US-531](US-531-board-tri-framework-ui.md)）
- 同步与身份（→ [US-533](US-533-board-team-sync.md)）

## 验收标准

| #   | 前置条件                       | 操作                                                                                 | 预期结果                                                                                                                    | 状态 |
| --- | ------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 空库                           | 建 1 块板、板下 3 列（按 To do / Doing / Done 顺序）、各列 2 条任务                  | 实体可查询；`task` 的 board 由所属列推导正确                                                                                | ⬜   |
| 2   | 板 B 有列 C1、C2               | 列内创建追加任务，不改 `sortOrder`                                                   | 新任务追加到所属列末尾；默认排序按「分组字段 + sortOrder」，列间互不影响                                                    | ⬜   |
| 3   | 板 B 有列 C1                   | 再建列 C2 与 C3                                                                      | 列序是板内排序域：C1 → C2 → C3，重开库后顺序不变                                                                            | ⬜   |
| 4   | task 标题为空                  | 保存                                                                                 | 拒绝（标题必填），零写入                                                                                                    | ⬜   |
| 5   | task T 属列 C1（板 B1）        | 直连 SQL 把 `column.board_id` 改为板 B2 的 id；把 T 的 `column_id` 改为不存在的列 id | 前者拒绝（结构归属列创建后不可改）；后者拒绝（引用完整性）                                                                  | ⬜   |
| 6   | 板 B 有列 C1、C2，各 2 条任务  | ① 应用层删除列 C1 ② 删除板 B                                                         | ① C1 的 2 条任务一并删除，C2 与其任务不受影响（级联在应用层事务内原子执行）② 板、列、任务全部删除，不留孤儿行               | ⬜   |
| 7   | 删除级联执行到一半（模拟中断） | 检查库状态                                                                           | 不存在「列已删、任务还在」的半状态：级联要么整批提交要么整批回滚                                                            | ⬜   |
| 8   | 既有库已装其他插件与实体       | 重开后再装看板插件并建板                                                             | 新实体表在既有库上正常创建，既有实体数据不受影响（既有库重开的组合验收在 [US-532](US-532-board-end-to-end-demo.md) 阶段 A） | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**引擎缺口为零，本故事必须新建 schema 但不需要新建引擎能力。** 排序域（含分组排序域与跨组移动）
已由 [US-028](../core/US-028-sortable-entity.md) 交付（阶段 A～E 全 ✅）：core 的排序模块提供
[`ManualOrderOptions` / `manualOrderGroupFields`](../../../packages/rxdb/src/sortable/sortable.interface.ts)
与 [`Repository.reorder()`](../../../packages/rxdb/src/repository/Repository.ts)，写集合最小——
组内移动只写 `sortOrder`，跨组移动在一个事务内只写分组字段与 `sortOrder`。本故事只做三件事：
实体声明、结构归属约束、删除级联的领域语义。

**为什么 task 不挂 `board_id`。** 若 task 同时有 `board_id` 与 `column_id`，「task 属于哪个板」
就有两个真相源，`task.board_id ≠ task.column.board_id` 的漂移没有任何一方会报错。单一真相源是
column 归属：board 由 column 推导，跨列移动只需改一个字段（US-028 跨组移动的既有路径），
也不需要跨表校验。BOM 的结构归属列用存储层触发器拒绝改写（[US-507](US-507-bom-graph-skeleton.md)
AC#13），是因为改归属会悄悄改变判环图；看板没有图的完整性要守，`column.board_id` 不可改落到
应用层写入口（与 US-027 已交付的公开写入口判定同层），不开第二条触发器路径。

**为什么列序也是一个排序域。** Trello 支持拖列。列序以 `boardId` 为分组字段声明排序域即可，
与 task 的按列排序域同一条引擎路径，不新增任何原语。

**落点：新建 `packages/rxdb-plugin-board`**（BOM 先例：`packages/rxdb-plugin-bom`，owner 2026-10-02
决定新建包而非扩 graph 插件）。看板实体与仓储是该包的最小内核，三框架绑定见
[US-531](US-531-board-tri-framework-ui.md)。**不复用 `rxdb-test` 的 `Task` 实体**——现有
[`Task`](../../../packages/rxdb-test/entities/Task.ts) 是带排序的 Todo 数据，不包含 Board / Column /
跨列移动产品（2026-10-18 优先级评审核对后的事实），看板需要自己的三个实体。

**删除级联为什么不靠存储层触发器。** 级联本身可以由外键 `ON DELETE CASCADE` 表达，但看板的
删除是**用户可见的产品动作**：Trello 删列前会列出「将删除 N 个任务」并要求确认。确认清单与
删除必须在同一事务里（AC#7），应用层事务（US-008 已交付）足够；触发器只省一次删除，却把
产品语义（确认、清单、回滚粒度）埋进存储层。

**关闭条件**：三个实体在既有库上可建；task 的 board 由 column 推导且无第二真相源；
`column.board_id` 创建后不可改；删除级联原子。

## 价值待证

本故事已随 [epic-010 解锁记录](../../epics/epic-010-task-board-domain-model.md#价值待证整个-epic)
解锁（2026-10-19，owner 决定）：新增 `board` / `column` / `task` 抽象对应零个已知病灶，
「病灶数 ≥ 抽象数」按 owner 决定豁免（演示价值入场），依据与边界见 epic。

## 实现文件

- `packages/rxdb-plugin-board/` — 待建；`board` / `column` / `task` 实体、装饰器与仓储

## References

- [epic-010 任务看板领域模型](../../epics/epic-010-task-board-domain-model.md)
- [US-028 可排序实体](../core/US-028-sortable-entity.md) — 前置：分组排序域（阶段 D ✅）、`reorder()`、默认排序带分组字段
- [US-001 定义数据模型](../core/US-001-model-definition.md)、[US-005 关系映射](../core/US-005-relationship-mapping.md)、[US-008 事务支持](../core/US-008-transaction-support.md) — 已交付底座
- [US-507 BOM 图骨架](US-507-bom-graph-skeleton.md) — 结构归属列先例（看板选择应用层而非触发器，理由见技术笔记）
- [domain-research 任务看板](../../domain-research/task-board.md) — 冻结的设计依据
