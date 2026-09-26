---
id: US-028
title: 可排序实体（普通实体手动排序）
status: Backlog
priority: Low
epic: epic-004-future-features
created: 2026-09-20
updated: 2026-09-26
tags: [core, sortable, model, rxdb-model, tree]
---

# 用户故事：可排序实体（普通实体手动排序）

## 作为/我想要/以便

**作为** 模型开发者
**我想要** 让任意实体（不限于树形实体）声明可排序，并在 rxdb-model 实体列表里拖拽手动排序
**以便** 菜单、待办、看板列、清单等扁平列表也能获得与树形节点一致的排序能力，且排序能力不依赖 `@aiao/rxdb-plugin-tree`

## 背景与动机

- **表格的拖拽重排没有写入路径。** `buildTableOptions()`（`table-factory.ts`）默认开 `rowSeriesNumber.dragOrder`；
  三框架的 `EntityTable` 监听 `change_header_position`、经 `collectReorderedIds` 抛出 `rowReordered`，`QueryTable`
  原样透传，但没有任何组件接它。三框架的 `EntityList` 因此经 `tableOptions` 传 `LIST_TABLE_OPTIONS`
  （`dragOrder: false`）关掉了手柄，即 AC#6 的提前交付；直接渲染 `EntityTable` / `QueryTable` 又不传 `tableOptions`
  的调用方仍拿到默认的拖拽手柄，拖完不落库。`patchDragIconForReadonlyRows` 隐藏 `_readonly` 行与新增行的手柄；
  `EntityList` 给系统表的行挂 `_readonly`（[US-027](US-027-entity-permission-model.md) AC#16 的列表侧）。
- **排序只存在于树形实体与应用层。** `ISortableTreeEntity`（`@aiao/rxdb-plugin-tree` 的 `tree-entity.interface.ts`：
  `ITreeEntity` 加 `sortOrder?: string | null`）是仓库里唯一的排序类型；`sortOrder` 在 `@aiao/rxdb` 与
  `@aiao/rxdb-model` 中零实现、零读取。三个 demo 应用的树菜单与文件管理页各自调 `@aiao/utils` 的
  `generateKeyBetween` 算排序键（Angular `MenuDragDropService`、React / Vue `useDragDropService` 及各页 store），
  「新建追加到末尾」「拖放插到两邻之间」三端各写一遍；`rxdb-test` 的 `MenuSimple` / `MenuLarge` / `FileNode` /
  `FileLarge` 声明 `sortOrder` 并建 `(parentId, sortOrder)` 索引。
- **排序要在树之外独立成模块。** 树实体在 `@aiao/rxdb-plugin-tree`，`RxDBBranch` 是普通实体；排序若只挂在
  `ISortableTreeEntity` 下，扁平列表要排序就得装树插件。依赖方向应是树插件依赖排序模块，而不是反过来；
  排序模块放在核心（见技术笔记「排序模块归属与依赖方向」），[US-025](US-025-core-plugin-extraction.md) 阶段 E 与此没有先后约束。
- 普通实体同样需要手动排序：菜单顺序、看板列序、清单拖拽。US-010 的 AC#2/#3 只覆盖了树形节点排序，扁平列表是空白。

## 核心设计方向（待 `/speckit-plan` 细化）

- **接口解耦**：新增 `ISortableEntity extends IEntity { sortOrder?: string | null }`，与 `ITreeEntity` 平行；
  `@aiao/rxdb-plugin-tree` 的 `ISortableTreeEntity` 改为同时 extends `ITreeEntity` 与 `ISortableEntity`，名字与现有引用不变。
- **实体级声明**：普通实体通过某种声明获得可排序语义——具体 surface 待设计（命名冲突见技术笔记），需覆盖：
  schema 携带 sortOrder、查询默认按 sortOrder 升序、UI 启用拖拽。
- **排序键**：复用 `@aiao/utils` 已导出的 `generateKeyBetween(a, b)` / `generateKeysBetween(a, b, n)`
  （`@aiao/rxdb` 已依赖 `@aiao/utils`，三个 demo 应用也在用）；core 只加「按实体取相邻键、算新键」的薄封装，不另写算法。
- **重排写路径**：拖拽后仅对受影响行批量重写 sortOrder（相邻间隙取新键），其余行不动；重排是普通 update，走同一条写路径。
- **rxdb-model 接线**：三框架 `EntityList` 接 `QueryTable` 的 `rowReordered` → 计算新键 → 批量持久化 → 刷新列表；
  拖拽只对可排序实体开启，其余实体经 `tableOptions` 关掉 `dragOrder`；只读行（`_readonly`）沿用现有守卫。

## 交付阶段

| 阶段 | 交付                                                                                                                              | 直接前置 | AC 区段 | 状态 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ---- |
| A    | core 排序语义：`ISortableEntity`、实体级声明与元数据校验、查询默认按 `sortOrder` 升序、create 追加键、基于 `@aiao/utils` 的键计算 | 无       | AC#1～4 | ⬜   |
| B    | 三框架 `EntityList` 拖放持久化：接 `rowReordered` → 算新键 → 批量写入 → 刷新；只对可排序实体开拖拽；三端 e2e 同交                 | 阶段 A   | AC#5～7 | ⬜   |
| C    | 树兼容：`ISortableTreeEntity` 由排序模块的类型组合而成，依赖方向测试                                                              | 阶段 A   | AC#8～9 | ⬜   |

AC#10（未声明可排序的实体行为不变）每个阶段都要守住。B 与 C 都只依赖 A，可以并行。

AC#6 已提前交付：三框架 `EntityList` 经 `tableOptions` 关掉了拖拽手柄，阶段 B 只对可排序实体重新打开。

## 范围边界

### In Scope

- 普通（非树）实体的可排序声明与 `sortOrder` 字段语义（元数据 / 接口 / 查询默认排序）
- core 排序模块（与树无关）：基于 `@aiao/utils` fractional indexing 的键计算
- 创建时未提供 `sortOrder` 的自动生成（追加到末尾）
- rxdb-model 三框架 `EntityList` 的拖放持久化接线（复用底层已有 dragOrder / rowReordered 能力），不可排序实体关掉拖拽手柄
- `ISortableTreeEntity` 向后兼容与树实体复用同一套排序类型与工具

### Out of Scope

- `@aiao/rxdb-plugin-tree` 自身的树能力；本故事只改 `ISortableTreeEntity` 的类型来源
- 跨层级树拖拽移动（改变 parentId 的拖放，属树能力）
- 三个 demo 应用树拖放服务的重构（可以改用排序模块，但不是本故事的验收项）
- 实体操作权限（→ [US-027](US-027-entity-permission-model.md)：其阶段 C 给 `canEdit=false` 的行挂 `_readonly`，直接落进 AC#7 的守卫）
- 分页 / 虚拟滚动列表内的跨页排序（loadMore 场景）
- 多设备离线重排的冲突合并（归 vision 阶段 3 协作）
- sortOrder 的数据库索引 / 查询性能优化（性能单列）

## 验收标准

| #   | 前置条件                                  | 操作                       | 预期结果                                                                                                                          | 状态 |
| --- | ----------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 普通（非树）实体声明可排序                | 创建若干记录并查询         | schema 含 sortOrder；查询结果默认按 sortOrder 升序                                                                                | ⬜   |
| 2   | 同上，创建时未提供 sortOrder              | create 一条新记录          | 自动生成排序键，追加到序列末尾                                                                                                    | ⬜   |
| 3   | 可排序实体列表                            | 拖拽一行到新位置           | 仅受影响行的 sortOrder 被重写（批量更新），其余行不变                                                                             | ⬜   |
| 4   | 同一序列                                  | 连续快速拖拽多次           | 键值始终严格有序且不耗尽精度（fractional indexing 基本性质）                                                                      | ⬜   |
| 5   | 三框架 rxdb-model 实体列表（可排序实体）  | 拖拽行并刷新页面           | 顺序持久化，重查后仍保持                                                                                                          | ⬜   |
| 6   | 三框架实体列表（不可排序实体）            | 打开实体列表               | 不显示拖拽手柄，`rowReordered` 不触发                                                                                             | ⚠️   |
| 7   | 可排序实体含只读行（`_readonly`）         | 拖拽该行，或把其他行拖过它 | 只读行无拖拽手柄、不进 `rowReordered` 载荷；重排写入不改写只读行的 `sortOrder`                                                    | ⬜   |
| 8   | 树形实体（含 `ISortableTreeEntity` 引用） | 执行排序相关操作           | 行为与普通实体一致（同一套工具），现有接口引用不破坏                                                                              | ⬜   |
| 9   | `@aiao/rxdb-plugin-tree` 与排序模块       | 类型检查 + 依赖分析        | `sortOrder` 的类型只在排序模块声明一处，`ISortableTreeEntity` 由它组合而成；排序模块不 import 树插件（依赖方向：tree → sortable） | ⬜   |
| 10  | 未声明可排序的现有实体                    | 原有查询、写入与 UI 操作   | 查询顺序、schema、写入与 UI 行为不变（拖拽手柄已按 AC#6 关闭）                                                                    | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

AC#6 的保留：三框架 `EntityList` 已传 `dragOrder: false`，三端 `entity-list.real.spec` 的
「行序号列不带拖拽手柄…」用例断言了传给表格的 `rowSeriesNumber`；三端 e2e 未做——行画在 canvas 上，
随阶段 B 的拖拽 e2e 一起补。

## 技术笔记

**关键设计决策（留待 plan 阶段）**：

- **可排序声明 surface**：显式声明与「识别 `sortOrder` 字段」二选一——前者可校验，后者少一层配置但靠约定。
  显式声明**不宜叫 `sortable`**：`sortable?: boolean` 已是属性级与关系级的标志（`property-types.interface.ts` 的
  `ISortable`、`relation-types.interface.ts`，含义是列头可排序，`entity-field.utils.ts` 按它输出字段元数据），
  实体级再叫 `sortable` 就同名异义。`EntityMetadataFeatures`（`entity-options.interface.ts`）是插件挂特性的落点，
  其 TSDoc 写明核心不内置任何具体特性，core 的排序声明要放进 `features`，得先改这条约定。
- **权限**：重排是 update 的一种，与其他 update 走同一条写路径，本故事不为权限单独接线。
  [US-027](US-027-entity-permission-model.md) 若落地，其写边界拒绝无权 update，其阶段 C 给 `canEdit=false` 的行挂
  `_readonly`，两者都自动覆盖重排；本故事不依赖 US-027。
- **现有资产复用**：`table-factory.ts` 的 `dragOrder: true`、三框架 `EntityTable` / `QueryTable` 的 `rowReordered` 与
  `tableOptions`、`patchDragIconForReadonlyRows` 与 `collectReorderedIds` 均已有单测，接线时不动其 API。
  `buildTableOptions()` 对 `rowSeriesNumber` 是整体覆盖，关 `dragOrder` 时 `title` / `width` 要一并带上。
- **排序模块归属与依赖方向**：本故事定为 core——查询默认排序与 create 追加键都在引擎写路径上。
  `@aiao/rxdb-plugin-tree` 依赖 `@aiao/rxdb`，core 反向 import 树插件会被 nx 项目图判成环，AC#9 的依赖方向因此有现成门禁。
- **现有树拖放是阶段 C 的对照**：三个 demo 应用的树菜单 / 文件管理页已按 fractional indexing 实现拖放插位与追加
  （见背景第 2 条），AC#8 的「同一套工具」以它们的行为为基准。

## 价值待证

本故事**价值待证**。用户踩得到的症状只有一处：三框架 `EntityList` 显示拖拽手柄、拖完不落库。AC#6 已经提前交付，
不靠本故事的任何抽象就把它关掉了（背景第 1 条）。剩下的都不是今天有人踩到的症状：直接渲染 `EntityTable` /
`QueryTable` 的调用方默认仍有手柄，但 `rowReordered` 本就是交给调用方处理的输出，仓内 apps / modules / website
没有这样的调用方；三个 demo 的树拖放各自算排序键（背景第 2 条），但 demo 拖放服务的重构在 Out of Scope，本故事不验收它。

本故事要新增的抽象至少 3 个：`ISortableEntity` 与实体级可排序声明、core 的排序键封装与查询默认排序、
rxdb-model 的重排写入协调。病灶数 < 抽象数，`priority` 因此为 Low。

**解锁条件**（满足其一）：出现需要手动排序的扁平实体（demo 或外部 issue）；或有调用方直接渲染
`EntityTable` / `QueryTable` 并要把 `rowReordered` 落库。届时一并上调优先级，交付阶段与技术笔记里的定案不变。

## 实现文件

| 阶段 | 文件                                                                                                                                                                                          | 说明                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| A    | `packages/rxdb/src/entity/sortable-entity.interface.ts`                                                                                                                                       | `ISortableEntity`（新）                      |
| A    | `packages/rxdb/src/entity/`                                                                                                                                                                   | 基于 `@aiao/utils` 的排序键薄封装（新）      |
| A    | `packages/rxdb/src/entity/entity-options.interface.ts` / `metadata-validate.ts`                                                                                                               | 可排序声明与校验                             |
| A    | `packages/rxdb/src/repository/`                                                                                                                                                               | 查询默认排序接线                             |
| B    | `packages/rxdb-model/src/entity-table/`                                                                                                                                                       | 重排键计算与写入协调                         |
| B    | `packages/rxdb-model-angular/src/entity-list/entity-list.component.ts`、`packages/rxdb-model-react/src/entity-list/entity-list.tsx`、`packages/rxdb-model-vue/src/entity-list/EntityList.vue` | 拖拽持久化接线，三端同交                     |
| B    | `apps/dev-rxdb-angular-e2e/`、`apps/dev-rxdb-react-e2e/`、`apps/dev-rxdb-vue-e2e/`                                                                                                            | 拖拽排序 e2e                                 |
| C    | `packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts`                                                                                                                               | `ISortableTreeEntity` 改由排序模块的类型组合 |

## References

- [US-010 树形实体](US-010-tree-entity.md) — 树节点排序的原始验收（AC#2/#3）
- [US-025 核心包子系统按插件边界外移](US-025-core-plugin-extraction.md) — 树实体已外移到 `@aiao/rxdb-plugin-tree`；排序模块由本故事定为 core
- [US-027 实体操作权限模型](US-027-entity-permission-model.md) — 无 update 权限的行经其阶段 C 挂 `_readonly`，落进 AC#7 的守卫
- [tree-entity.interface.ts](../../../packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts) — `ISortableTreeEntity` 现状
- [fractional-indexing.ts](../../../packages/utils/src/indexing/fractional-indexing.ts) — `generateKeyBetween` / `generateKeysBetween`
- [table-factory.ts](../../../packages/rxdb-model/src/entity-table/vtable/table-factory.ts) — `buildTableOptions()` 默认开 `dragOrder`
- [entity-table.component.ts](../../../packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts) — 已有 dragOrder / rowReordered 半成品
- [entity-list.component.ts](../../../packages/rxdb-model-angular/src/entity-list/entity-list.component.ts) — `LIST_TABLE_OPTIONS` 关手柄（React `entity-list.tsx`、Vue `EntityList.vue` 同构）
