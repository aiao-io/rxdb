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

- 三个实体：`board`（标题必填、描述）、`column`（标题必填，属 board）、`task`（标题必填，属 column）；
  标题统一去除首尾空白后校验，空串或全空白拒绝，创建、内联编辑与详情保存共用校验
- **按列排序域**：`task` 声明 `manualOrder: { groupBy: ['columnId'] }`（分组字段强制非空），
  列内手动排序、按组创建追加、默认排序带分组字段——全部由 [US-028 阶段 D](../core/US-028-sortable-entity.md)
  已交付的分组排序域承载，本故事只做声明与实体
- **列序**：`column` 声明 `manualOrder: { groupBy: ['boardId'] }`（板内拖列）
- **结构归属**：task 无独立 `board_id`，board 由 column 推导（单一真相源，见技术笔记）；
  `column.board_id` 在全部应用写入口中创建后不可改；任务创建时目标列必须属于当前板，普通编辑
  不接受归属字段，跨列移动的源列与目标列必须存在且属于同一板（跨列移动
  允许改 `task.column_id`，见 [US-527](US-527-cross-column-move-ordering.md)）
- **删除级联**：删列 → 该列全部任务及其 `task_label` 关联；删板 → 全部列、任务、`task_label`
  关联与该板 `board_label` 定义（标签由 [US-528](US-528-task-detail-editing.md) 引入）。先在事务外
  展示待删列、任务和标签数量并确认，再在一个应用层事务内复核删除集合并显式删除；集合变化
  则零写退出、展示新清单并重新确认，取消零写。引擎侧依赖已交付的外键与事务
  （[US-005](../core/US-005-relationship-mapping.md)、[US-008](../core/US-008-transaction-support.md)）

### Out of Scope

- 跨列移动与批量改序语义（→ [US-527](US-527-cross-column-move-ordering.md)）
- 任务详情字段：描述、标签、截止日（→ [US-528](US-528-task-detail-editing.md)）
- 备份导出与重开恢复（→ [US-529](US-529-board-backup-restore.md)）
- 任务搜索（→ [US-530](US-530-board-task-search.md)）
- 三端 UI（→ [US-531](US-531-board-tri-framework-ui.md)）
- 同步与身份（→ [US-533](US-533-board-team-sync.md)）

## 验收标准

| #   | 前置条件                                        | 操作                                                                             | 预期结果                                                                                                                    | 状态 |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 空库                                            | 建 1 块板、板下 3 列（按 To do / Doing / Done 顺序）、各列 2 条任务              | 实体可查询；`task` 的 board 由所属列推导正确                                                                                | ⬜   |
| 2   | 板 B 有列 C1、C2                                | 列内创建追加任务，不改 `sortOrder`                                               | 新任务追加到所属列末尾；默认排序按「分组字段 + sortOrder」，列间互不影响                                                    | ⬜   |
| 3   | 板 B 有列 C1                                    | 再建列 C2 与 C3                                                                  | 列序是板内排序域：C1 → C2 → C3，重开库后顺序不变                                                                            | ⬜   |
| 4   | board / column / task 标题为空或全空白          | 创建或保存                                                                       | 共用校验拒绝，零写入；合法标题去除首尾空白后保存                                                                            | ⬜   |
| 5   | task T 属列 C1（板 B1），B2 有列 C2             | 通过应用入口改 C1 的 board、普通编辑改 T 的 column、在 B1 下向 C2 建任务或移动 T | 全部拒绝且零写；直连 SQL 写不存在的 board / column 引用仍由外键拒绝，SQL 不验应用层归属不可变规则                           | ⬜   |
| 6   | 板 B 有列 C1、C2，各 2 条任务，尚未安装标签功能 | ① 确认删除 C1 ② 确认删除 B                                                       | ① 只删 C1 与其任务，C2 及任务不变 ② 板、列、任务全部删除，不留孤儿；带标签级联扩展随 US-528 验收                            | ⬜   |
| 7   | 删除级联执行到一半（模拟中断）                  | 检查库状态                                                                       | 不存在「列已删、任务还在」的半状态：级联要么整批提交要么整批回滚                                                            | ⬜   |
| 8   | 既有库已装其他插件与实体                        | 重开后再装看板插件并建板                                                         | 新实体表在既有库上正常创建，既有实体数据不受影响（既有库重开的组合验收在 [US-532](US-532-board-end-to-end-demo.md) 阶段 A） | ⬜   |
| 9   | 已展示删除清单，尚未确认                        | 取消；或另一入口新增、移走任务后再确认                                           | 取消零写；删除集合不同则本次事务零写退出，展示新清单并重新确认；相同数量但 ID 不同也必须识别                                | ⬜   |
| 10  | 只读上下文或恢复切换已开始                      | 从 UI 与应用服务直接请求创建、编辑、删除、移动、批量、撤销重做或另一次恢复       | 共用写门禁拒绝，库与历史零变化；浏览和能力支持时的导出仍可用；恢复完成后按宿主上下文重新判定                                | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**应用写上下文是共同门禁。** 宿主显式提供当前板、是否可写与是否正处于恢复切换；单人 demo
正常打开时可写，只读宿主与恢复期间不可写。创建、编辑、移动、批量排序、删除、撤销重做及
恢复入口都先校验这份上下文，再检查涉及实体的公开操作权限；导出是读取能力，单独判断支持
组合。三端入口状态与领域服务使用同一门禁，不能只禁用按钮。`deriveEntityCapabilities()`
只派生实体 CRUD 声明，不能替代宿主的可写上下文；团队版再由 US-533 将登录与成员资格加入
同一判定。此处定义的是应用服务契约，不为引擎增加权限 API。

**引擎缺口为零，本故事必须新建 schema 但不需要新建引擎能力。** 排序域（含分组排序域与跨组移动）
已由 [US-028](../core/US-028-sortable-entity.md) 交付（阶段 A～E 全 ✅）：core 的排序模块提供
[`ManualOrderOptions`](../../../packages/rxdb/src/sortable/sortable.interface.ts)
与 [`Repository.reorder()`](../../../packages/rxdb/src/repository/Repository.ts)；
`manualOrderGroupFields(metadata)` 只读取声明，不能替代 `manualOrder.groupBy`。写集合最小——
组内移动只写 `sortOrder`，跨组移动在一个事务内只写分组字段与 `sortOrder`。本故事只做三件事：
实体声明、结构归属约束、删除级联的领域语义。

**为什么 task 不挂 `board_id`。** 若 task 同时有 `board_id` 与 `column_id`，「task 属于哪个板」
就有两个真相源，`task.board_id ≠ task.column.board_id` 的漂移没有任何一方会报错。单一真相源是
column 归属：board 由 column 推导，跨列移动的归属变更只改一个外键（US-028 跨组移动的既有路径），
仍要在领域入口校验源、目标列同板。实体属性使用 `boardId` / `columnId`，对应存储列
`board_id` / `column_id`。BOM 的结构归属列用存储层触发器拒绝改写（[US-507](US-507-bom-graph-skeleton.md)
AC#13），是因为改归属会悄悄改变判环图；看板没有图的完整性要守，`column.board_id` 不可改落到
应用层写入口。看板创建、编辑、移动、删除统一经过领域服务；通用表单也必须接该服务，不能
用通用仓储保存绕过校验。直连 SQL 与适配器接口属于受信维护入口，只由外键守引用存在性；
本故事不承诺在这些入口拒绝列归属改写或跨板关联，US-027 的操作权限也不提供这类行级约束。

**为什么列序也是一个排序域。** Trello 支持拖列。列序以 `boardId` 为分组字段声明排序域即可，
与 task 的按列排序域同一条引擎路径，不新增任何原语。

**落点：新建 `packages/rxdb-plugin-board`**（BOM 先例：`packages/rxdb-plugin-bom`，owner 2026-10-02
决定新建包而非扩 graph 插件）。看板实体与仓储是该包的最小内核，三框架绑定见
[US-531](US-531-board-tri-framework-ui.md)。**不复用 `rxdb-test` 的 `Task` 实体**——现有
[`Task`](../../../packages/rxdb-test/entities/Task.ts) 是带排序的 Todo 数据，不包含 Board / Column /
跨列移动产品（2026-10-18 优先级评审核对后的事实），看板需要自己的三个实体。

**删除级联为什么不靠存储层触发器。** 级联本身可以由外键 `ON DELETE CASCADE` 表达，但看板的
删除是**用户可见的产品动作**：先计算包含行 ID 的删除清单并等待确认，此时不持有事务。
确认后通过 `adapter.transaction(executor => ...)` 重读目标及全部依赖行，比较已确认的 ID 集合；
任何变化都退出并重新确认，不在事务里等待用户。集合不变才通过 `executor.getRepository()`
依次删除关联、任务、列、标签定义、板；删列保留板级标签定义。任务删除同样先清 `task_label`。
所有实体变更走 executor 仓储并保留 `RxDBChange`，权限在进入受信 executor 前用公开
`assertEntityOperationAllowed` 检查各实体的删除操作；中途失败回滚整个删除动作。US-528 引入
标签实体时必须扩展这一份删除服务及验收，不能另开一条漏清关联的删除入口。

**关闭条件**：三个实体在既有库上可建；task 的 board 由 column 推导且无第二真相源；
应用入口禁止修改 `column.board_id`、禁止跨板任务归属；确认在事务外、删除集合在事务内复核；
删除级联包含当期全部关联并保持原子。US-526 的基础验收不等待标签实体；US-528 安装标签时
负责关闭带标签的级联扩展与组合验收。

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
