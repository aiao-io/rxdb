---
id: US-535
title: 跨列移动与本列排序的领域语义
status: Backlog
priority: Low
epic: epic-011-task-board-domain-model
created: 2026-10-19
updated: 2026-10-19
tags: [domain, board, ordering, drag]
---

# 用户故事：跨列移动与本列排序的领域语义

## 作为/我想要/以便

**作为** 单人看板用户
**我想要** 把任务拖到另一列的指定位置、拖回原列改序、空列也能落，还能把一列按截止日或标题一键排好
**以便** 工作流推进就是把卡片从「待办」拖到「进行中」，顺序反映下一步先做什么

## 范围边界

### In Scope

- **跨列移动** = [US-028 跨组移动](../core/US-028-sortable-entity.md)：领域服务先校验源列与目标列
  存在且同板，再由单卡 `Repository.reorder()` 在一个事务内只写 `columnId`（存储列
  `column_id`）与 `sortOrder`。支持目标列两邻之间、首部、末尾及空列（空列用 `{ group: { columnId } }` 目标）
- **拖回原列** = 组内移动：只写 `sortOrder`，原位拖拽零写（US-028 已交付语义）
- **本列排序**：列菜单「按截止日排序」「按标题排序」，一次性重写本列顺序。按截止日：升序，无截止日排最后，
  同日按标题、再按 `id`；按标题：`Intl.Collator('zh-Hans-CN', { numeric: true })` 升序，同标题按 `id`。
  服务在一个 executor 事务内重读整列、算出目标顺序、生成整列排序键并写回，任一失败整批回滚；
  只更新 `sortOrder`，已是目标顺序则零写。它不是持久排序模式：之后新建的任务仍追加到列尾，拖拽照常生效
- **落点换算**：指针坐标 → 列首 / 两邻之间 / 列尾 / 空列；列头横向拖动 → 前后两邻。核心包内一份纯函数换算表，
  三端只采集指针事件；邻居换算复用 `@aiao/rxdb` 的 `reorderTargetForDrop`
- **失败恢复**：落库失败（含 `staleTarget` / `notFound` / `PermissionDeniedError`）时，移动服务状态机发布
  失败原因并要求重查已提交数据；UI 据此恢复显示，不复活已删除邻居，不静默重试（US-028 阶段 B 先例）
- **撤销重做**：移动与本列排序经 `RxDBChange` 记录，一次 `undo()` 反转整个事务（[US-302](../collaboration/US-302-undo-redo.md)
  已交付，范围是本次会话；接线见 [US-536](US-536-task-detail-editing.md)）

### Out of Scope

- 三端 UI 组件与拖拽交互（→ [US-539](US-539-board-tri-framework-ui.md)，本故事只定语义、落点换算与状态机）
- 离线双端并发冲突的合并规则（→ [US-541](US-541-board-team-sync.md)，本故事定义的
  单人语义是其设计输入）
- 跨板移动、多选拖拽、持久排序模式（按字段自动保持顺序）、自定义排序字段
- 引擎新原语：批量重排 API、跨列拖拽原语；不改 `packages/rxdb`，不调用内部 `reorderRow`

## 验收标准

| #   | 前置条件                                                  | 操作                                    | 预期结果                                                                                                                        | 状态 |
| --- | --------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 列 C1、C2 各 3 条任务                                     | 把 C1 第 1 条拖到 C2 第 2、3 条之间     | 一个事务内只写 `column_id` 与 `sortOrder`；C1 剩余行不改写；重开库后位置不变                                                    | ⬜   |
| 2   | 空列 C3                                                   | 把 C1 任一任务拖到 C3                   | 任务落入 C3（空组的首个键），`column_id` 与 `sortOrder` 正确                                                                    | ⬜   |
| 3   | 列 C1 有 3 条任务                                         | 把第 3 条拖到第 1、2 条之间（同列改序） | 只写 `sortOrder`，`column_id` 不变；原位拖拽零写                                                                                | ⬜   |
| 4   | 列 C1 有 5 条任务，截止日含空值与同日                     | 执行「按截止日排序」并重开库            | 同一 `transactionId` 下只写 `sortOrder`；截止日升序、空值在后、同日按标题再按 `id`；`columnId`、其余字段及其它列不变            | ⬜   |
| 5   | 本列排序第 3 次 executor 写入注入后端失败                 | 观察库、历史与状态机                    | 全事务回滚，排序键与变更历史均无部分提交；状态机发布失败并要求重查已提交数据，可再次执行                                        | ⬜   |
| 6   | 移动前目标邻居被另一入口删除                              | 执行跨列移动                            | 拒绝（`staleTarget`），零写；状态机要求重查已提交顺序，不显示已删除邻居（US-028 AC#15 已交付行为，本故事接线）                  | ⬜   |
| 7   | 完成一次跨列移动                                          | 调用 `undo()`                           | 任务回到原列原位置（整个移动事务一并反转）；redo 栈行为随 US-302 已交付语义                                                     | ⬜   |
| 8   | 任务拖到不存在的列 / 目标列与任务不同板                   | 执行移动                                | 拒绝，零写，状态机发布可展示的原因（列必须存在且与任务同板——board 由列推导，见 [US-534](US-534-board-column-task-skeleton.md)） | ⬜   |
| 9   | 列已按截止日排好                                          | 再次执行「按截止日排序」                | 零写，且不新增撤销项                                                                                                            | ⬜   |
| 10  | 标题含中英文、数字与重名                                  | 执行「按标题排序」                      | 顺序按 `Intl.Collator('zh-Hans-CN', { numeric: true })`，重名按 `id`；同一数据多次执行结果一致                                  | ⬜   |
| 11  | 完成一次本列排序；另有 remote-only / QueryCache 配置      | undo / redo；在不完整本地序列上排序     | 一次 undo / redo 还原 / 重放整列；不完整本地序列配置在写入前明确拒绝，不能拿缓存子集算键                                        | ⬜   |
| 12  | 换算表输入：卡片矩形、指针坐标、列尾 / 空列区、列头横向区 | 逐行执行落点换算表                      | 每行得到确定结果（两邻、`{ group }` 或拒绝）；原位落点得到零写结果；三端绑定调用同一份函数                                      | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**本故事不新增引擎原语，是领域接线加一份新建的落点换算。** US-028 阶段 D 的契约套件已经钉住跨组移动的全部
存储语义（[`manual-order-group.spec.ts`](../../../packages/rxdb/src/__tests__/sortable/manual-order-group.spec.ts)
「AC#15 分组实体的 reorder()」：组内移动只写 `sortOrder`；跨组移动一个事务内只写分组字段与
`sortOrder`；邻居不同组 / 不相邻 / 移动行已删除时拒绝并零写；`PermissionDeniedError` 在开事务前抛）。
看板要补的是**产品语义的三个环节**：

- **落点换算**：拖放是坐标事件，重排是邻居引用。仓库里没有可复用的看板落点实现：US-031 的
  `resolveTreeDrop` / `treeDropPosition` 是三个 demo 应用各一份的同名拷贝（如
  [`tree-drop.ts`](../../../apps/dev-rxdb-angular/src/app/shared/tree-drop.ts)），按树的前 / 内 / 后三等分，卡片没有「拖进」；
  US-028 也把「看板跨列拖拽 UI」列在范围外，只给 core API。本故事在核心包新建一份纯函数换算表，三端只负责
  Pointer Events 采集（与树页面相同的手写指针事件做法）；邻居换算复用
  [`reorderTargetForDrop`](../../../packages/rxdb/src/sortable/sortable.utils.ts)，它要求组的完整序列，
  高亮或筛选时也按完整列计算，否则得到 `staleTarget`。
- **本列排序的原子性**：门面 `Repository.reorder()` 自行开启事务，executor 的 `IRepository` 没有 `reorder()`；
  在外层事务里等待门面会排队等待自身而永久挂起。本列排序采用下述公开 API 流程，不在事务内调用门面
  `reorder()`、普通 `adapter.query()`、`undo()` 或未绑定 executor 的实体保存。
- **冲突语义的单人边界**：单人版没有远端同步，`staleTarget` 可来自同设备的另一写入口
  （另一标签页经 US-009 跨页事件更新的活查询）。本故事的单人语义提供设计输入；离线双端的
  合并规则由 US-541 定义并实现，本故事不提前定义冲突胜负。

**本列排序的事务算法。** 输入为列 ID 与排序方式（截止日 / 标题）。只支持配置为本地完整版本化主端的看板：
先用公开 [`getEntitySync`](../../../packages/rxdb/src/entity/primary-adapter.ts) 读取 task 的同步配置，
remote-only（只有 remote、没有 local）与 QueryCache 在写入前拒绝——remote-only 下 `localAdapter$` 不会发出，
必须先判配置再取主端。再用公开 `assertEntityOperationAllowed(Task, 'update')` 检查实体操作权限并通过
US-534 的恢复中写门禁，然后取本地主端调用一次 `adapter.transaction(async executor => ...)`：

1. 通过 `executor.getRepository(Column/Task).find()` 重读列、板归属与整列任务，不分页；显式指定
   `sortOrder asc, id asc`，executor 仓储不补默认排序。目标列必须属于当前板。
2. 用公开 `assertSortOrderKey` 校验全部现存键，按排序方式算出目标顺序；与当前顺序一致则直接返回，不生成新键。
3. 用 `@aiao/utils` 公开 `generateKeysBetween(当前整列最大键, null, 任务数)` 生成整列新键，按目标顺序分配；
   最大键按码点比较，不用 `localeCompare`。新键严格大于全部旧键；引擎对（分组, `sortOrder`）没有唯一约束，
   同键按 `id` 定序。
4. 经同一个 `executor.getRepository(Task).update(task, { sortOrder })` 写回，绝不保存其它草稿字段。
   全部变更保留默认事务日志与 `RxDBChange`，任一写入抛错则整批回滚；提交后再发布成功状态，
   一次 undo 按 `transactionId` 撤销整列。

以上依赖的 [`TransactionExecutor`](../../../packages/rxdb/src/transaction/transaction-executor.interface.ts)、
[`IRepository.find/update`](../../../packages/rxdb/src/repository/repository.interface.ts)、
[`generateKeysBetween`](../../../packages/utils/src/indexing/fractional-indexing.ts) 均已公开，无须补引擎
API。几十条卡片的整列读写可直接验收，不引入后台重试或存储临时排序键。

**落点：`packages/rxdb-plugin-board`** 的移动服务（落点换算表、本列排序事务、失败恢复状态机），三端绑定只消费它。

**关闭条件**：列首 / 两邻之间 / 列尾 / 空列 + 同列改序 + 本列排序的语义与回滚全部在存储层可复验；
原位拖拽与已排好的本列排序零写；落点换算表只有一份、三端共用；失败恢复不静默；undo 按事务
反转整个移动或本列排序。

## 价值待证

本故事已随 [epic-011 解锁记录](../../epics/epic-011-task-board-domain-model.md#价值待证整个-epic)
解锁（2026-10-19，owner 决定）：新增跨列移动与本列排序语义对应零个已知病灶，「病灶数 ≥ 抽象数」
按 owner 决定豁免（演示价值入场），依据与边界见 epic。

## 实现文件

- `packages/rxdb-plugin-board/` — 待建；跨列移动与本列排序服务、落点换算表、失败恢复状态机

## References

- [epic-011 任务看板领域模型](../../epics/epic-011-task-board-domain-model.md)
- [US-028 可排序实体](../core/US-028-sortable-entity.md) — 前置：跨组移动原语（阶段 D ✅）、`reorder()`、`reorderTargetForDrop`、失败语义；看板跨列拖拽 UI 在其范围外
- [US-031 树形实体迁移到排序模块](../core/US-031-tree-sortable-migration.md) — 树的落点判定是三个 demo 各一份的同名拷贝；看板改为核心包一份
- [US-534 看板领域模型骨架](US-534-board-column-task-skeleton.md) — 前置：实体、排序域与恢复中写门禁
- [US-008 事务支持](../core/US-008-transaction-support.md) — 本列排序的事务底座
- [US-302 撤销/重做](../collaboration/US-302-undo-redo.md) — `undo()` 接线（范围是本次会话）
- [US-541 团队版看板](US-541-board-team-sync.md) — 离线并发合并规则（设计输入，实现另行）
