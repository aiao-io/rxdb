---
id: US-527
title: 跨列移动与批量改序的领域语义
status: Backlog
priority: Low
epic: epic-010-task-board-domain-model
created: 2026-10-19
updated: 2026-10-19
tags: [domain, board, ordering, drag]
---

# 用户故事：跨列移动与批量改序的领域语义

## 作为/我想要/以便

**作为** 单人看板用户
**我想要** 把任务拖到另一列的指定位置、把整列按新顺序重排、拖回原列改序，空列也能落
**以便** 工作流推进就是把卡片从「待办」拖到「进行中」，顺序反映下一步先做什么

## 范围边界

### In Scope

- **跨列移动** = [US-028 跨组移动](../core/US-028-sortable-entity.md)：领域服务先校验源列与目标列
  存在且同板，再由单卡 `Repository.reorder()` 在一个事务内只写 `columnId`（存储列
  `column_id`）与 `sortOrder`。支持目标列两邻之间、首部、末尾及空列；NULL 组直接拒绝
- **拖回原列** = 组内移动：只写 `sortOrder`，原位拖拽零写（US-028 已交付语义）
- **批量改序**：整列按完整目标 ID 排列重排；选中多条时，只将选中项按给定顺序填回其原有
  槽位，未选中项位置不变（如 `[A,B,C,D]` 选中 A、C 改为 C、A，结果是 `[C,B,A,D]`）。
  服务在一个 executor 事务内重读全列、校验预览快照、生成整列排序键并写回；任一失败整批
  回滚。排序域不变，只更新 `sortOrder`；完整顺序未变则零写，不新增引擎批量原语
- **落点换算**：拖放坐标 → 目标组两邻或列尾，三端共用同一张落点判定表（[US-031](../core/US-031-tree-sortable-migration.md)
  先例：三端同一张落点判定表与三等分落点区间）
- **失败恢复**：落库失败（含 `staleTarget` / `notFound` / `PermissionDeniedError`）时 UI 重新查询
  已提交数据、恢复显示并提示，不复活已删除邻居，不静默重试（US-028 阶段 B 先例）
- **撤销重做**：移动与改序经 `RxDBChange` 记录，`undo()` 反转整个移动事务（US-302 已交付，
  接线见 [US-528](US-528-task-detail-editing.md)）

### Out of Scope

- 三端 UI 组件与拖拽交互（→ [US-531](US-531-board-tri-framework-ui.md)，本故事只定语义与判据）
- 离线双端并发冲突的合并规则（→ [US-533](US-533-board-team-sync.md)，本故事定义的
  单人语义是其设计输入）
- 跨板移动、批量跨列移动、选中项整体插入新落点
- 引擎新原语：批量重排 API、跨列拖拽原语；不改 `packages/rxdb`，不调用内部 `reorderRow`

## 验收标准

| #   | 前置条件                                             | 操作                                    | 预期结果                                                                                                         | 状态 |
| --- | ---------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 列 C1、C2 各 3 条任务                                | 把 C1 第 1 条拖到 C2 第 2、3 条之间     | 一个事务内只写 `column_id` 与 `sortOrder`；C1 剩余行不改写；重开库后位置不变                                     | ⬜   |
| 2   | 空列 C3                                              | 把 C1 任一任务拖到 C3                   | 任务追加到 C3 末尾（空组末尾），`column_id` 与 `sortOrder` 正确                                                  | ⬜   |
| 3   | 列 C1 有 3 条任务                                    | 把第 3 条拖到第 1、2 条之间（同列改序） | 只写 `sortOrder`，`column_id` 不变；原位拖拽零写                                                                 | ⬜   |
| 4   | 列 C1 有 5 条任务，预览快照与完整目标排列已给出      | 一次批量改序并重开库                    | 同一 `transactionId` 下只写 `sortOrder`，最终与目标完全一致；`columnId`、其余字段及其它列不变，重开保序          | ⬜   |
| 5   | 批量改序第 3 次 executor 写入注入后端失败            | 观察库、历史与 UI                       | 全事务回滚，排序键与变更历史均无部分提交；UI 从已提交数据恢复并提示，支持用户修正后再次提交                      | ⬜   |
| 6   | 移动前目标邻居被另一入口删除                         | 执行跨列移动                            | 拒绝（`staleTarget`），零写，UI 重查已提交顺序，不显示已删除邻居（US-028 AC#15 已交付行为，本故事接线）          | ⬜   |
| 7   | 完成一次跨列移动                                     | 调用 `undo()`                           | 任务回到原列原位置（整个移动事务一并反转）；redo 栈行为随 US-302 已交付语义                                      | ⬜   |
| 8   | 任务拖到不存在的列 / 目标列与任务不同板              | 执行移动                                | 拒绝，零写，UI 提示（列必须存在且与任务同板——board 由列推导，见 [US-526](US-526-board-column-task-skeleton.md)） | ⬜   |
| 9   | 原排列 `[A,B,C,D]`，选中 A、C                        | 将选中顺序改为 C、A；再提交同一顺序     | 首次结果 `[C,B,A,D]`，B、D 位置不变；第二次零写且不新增撤销项                                                    | ⬜   |
| 10  | 预览后成员新增、移列、删除或键已改变                 | 提交批量改序                            | 事务内发现快照变化即拒绝，零写并刷新；重复 ID、缺失 ID、异列 ID 或非法旧键同样拒绝                               | ⬜   |
| 11  | 完成一次批量改序；另有 remote-only / QueryCache 配置 | undo / redo；在不完整本地序列上改序     | 一次 undo / redo 还原 / 重放整批；不完整本地序列配置在写入前明确拒绝，不能拿缓存子集算键                         | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**本故事不新增引擎原语，是纯领域接线。** US-028 阶段 D 的契约套件已经钉住跨组移动的全部
存储语义（[`manual-order-group.spec.ts`](../../../packages/rxdb/src/__tests__/sortable/manual-order-group.spec.ts)
「AC#15 分组实体的 reorder()」：组内移动只写 `sortOrder`；跨组移动一个事务内只写分组字段与
`sortOrder`；邻居不同组 / 不相邻 / 移动行已删除时拒绝并零写；`PermissionDeniedError` 在开事务前抛）。
看板要补的不是原语，而是**产品语义的三个环节**：

- **落点换算**：拖放是坐标事件，重排是邻居引用。「列首 / 两邻之间 / 列尾 / 空列」落点换算成
  `reorder()` 的目标描述，三端必须共用同一张判定表——US-031 已经用同一张落点判定表与三等分
  落点区间消除了三端在拖放语义上的分叉，看板沿用该先例，不允许每端各写一份。
- **批量改序的原子性**：门面 `Repository.reorder()` 自行开启事务，executor 的 `IRepository`
  没有 `reorder()`；在外层事务里等待门面会排队等待自身。批量服务采用下述公开 API 流程，
  不在事务内调用门面 `reorder()`、普通 `adapter.query()` 或未绑定 executor 的实体保存。
- **冲突语义的单人边界**：单人版没有远端同步，`staleTarget` 可来自同设备的另一写入口
  （另一 tab 走 US-009 跨 tab 同步的活查询）。本故事的单人语义提供设计输入；离线双端的
  合并规则由 US-533 定义并实现，本故事不提前定义冲突胜负。

**批量服务的事务算法。** 输入为列 ID、预览时按 `sortOrder asc, id asc` 读取的完整
`(id, sortOrder)` 快照，以及完整目标 ID 排列或选中项目标排列。只支持配置为本地完整版本化
主端的看板；remote-only / QueryCache 拒绝。先用公开 `assertEntityOperationAllowed(Task, 'update')`
检查实体操作权限，并通过 US-526 的应用可写上下文门禁，再取该主端并调用一次 `adapter.transaction(async executor => ...)`：

1. 通过 `executor.getRepository(Column/Task).find()` 重读列、板归属与全列任务，不分页；显式
   指定 `sortOrder asc, id asc`，不依赖 executor 仓储补默认排序。目标列必须属于当前板。
2. 对照预览快照逐项校验 ID、排序键；校验目标无重复、无缺失、无异列成员，选中排列是原选中
   集合的精确置换。用公开 `assertSortOrderKey` 校验全部现存键，再生成完整目标排列。变化或
   非法输入在任何写入前拒绝；若完整排列与当前一致，直接返回且不生成新键。
3. 用 `@aiao/utils` 公开 `generateKeysBetween(当前全列最大键, null, 任务数)` 生成整列新键，
   按目标顺序分配并校验。新键严格大于所有旧键，逐行写入期间也不会与尚未更新的旧键碰撞；
   空列无须生成。批量允许重写整列排序键，未选中任务的显示位置保持不变。
4. 经同一个 `executor.getRepository(Task).update(task, { sortOrder })` 写入键变化行，绝不保存
   其它草稿字段。全部变更保留默认事务日志与 `RxDBChange`，任一写入抛错则整批回滚；提交后
   再发布成功状态，一次 undo 按 `transactionId` 撤销整批。

以上依赖的 [`TransactionExecutor`](../../../packages/rxdb/src/transaction/transaction-executor.interface.ts)、
[`IRepository.find/update`](../../../packages/rxdb/src/repository/repository.interface.ts)、
[`generateKeysBetween`](../../../packages/utils/src/indexing/fractional-indexing.ts) 均已公开，无须补引擎
API。几十条卡片的整列读写可直接验收，不引入后台重试或存储临时排序键。

**落点：`packages/rxdb-plugin-board`** 的移动服务（坐标 → 目标描述的换算、批量改序事务、
失败恢复提示的状态机），三端 UI 只消费它。

**关闭条件**：列首 / 两邻之间 / 列尾 / 空列 + 同列改序 + 批量改序的语义与回滚全部在存储层可复验；
原位拖拽与同序批量提交零写；批量有完整快照和选中槽位语义；失败恢复不静默；undo 按事务
反转整个移动或批量改序。

## 价值待证

本故事已随 [epic-010 解锁记录](../../epics/epic-010-task-board-domain-model.md#价值待证整个-epic)
解锁（2026-10-19，owner 决定）：新增跨列移动与批量改序语义对应零个已知病灶，「病灶数 ≥ 抽象数」
按 owner 决定豁免（演示价值入场），依据与边界见 epic。

## 实现文件

- `packages/rxdb-plugin-board/` — 待建；跨列移动与批量改序服务、落点换算表、失败恢复状态机

## References

- [epic-010 任务看板领域模型](../../epics/epic-010-task-board-domain-model.md)
- [US-028 可排序实体](../core/US-028-sortable-entity.md) — 前置：跨组移动原语（阶段 D ✅）、`reorder()`、失败语义
- [US-031 树形实体迁移到排序模块](../core/US-031-tree-sortable-migration.md) — 三端同一张落点判定表先例
- [US-526 看板领域模型骨架](US-526-board-column-task-skeleton.md) — 前置：实体与排序域声明
- [US-008 事务支持](../core/US-008-transaction-support.md) — 批量改序的事务底座
- [US-302 撤销/重做](../collaboration/US-302-undo-redo.md) — `undo()` 接线
- [US-533 团队版看板](US-533-board-team-sync.md) — 离线并发合并规则（设计输入，实现另行）
