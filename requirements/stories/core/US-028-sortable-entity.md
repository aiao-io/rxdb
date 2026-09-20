---
id: US-028
title: 可排序实体（普通实体手动排序）
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-09-20
updated: 2026-09-20
tags: [core, sortable, model, rxdb-model, tree]
---

# 用户故事：可排序实体（普通实体手动排序）

## 作为/我想要/以便

**作为** 模型开发者
**我想要** 让任意实体（不限于树形实体）声明可排序，并在 rxdb-model 表格里拖拽手动排序
**以便** 菜单、待办、看板列、清单等扁平列表也能获得与树形节点一致的排序能力，且排序能力独立于树形结构存在——树定义插件化（US-025 阶段 E）之后排序依然可用

## 背景与动机

- `ISortableTreeEntity` 接口已存在（`tree-entity.interface.ts`：`sortOrder?: string | null`，文档指明 fractional indexing 如 `generateKeyBetween` 产生），但**全仓库无任何消费方**：`sortOrder` 在 core 与 rxdb-model 中零实现、零读取，排序能力从未落地。
- rxdb-model 底层表格已具备拖拽重排的 UI 半成品：`table-factory.ts` 开启 `dragOrder`，`entity-table.component.ts` 监听 `change_header_position` 并经 `collectReorderedIds` 输出 `rowReordered: string[]`，还有只读行拖拽手柄 hack（`patchDragIconForReadonlyRows`）——但该组件没有生产消费者，重排结果无持久化。
- US-025 阶段 E 将把树实体外移为插件（前置 `RxDBBranch` 去树化，尚未开始）。排序能力若继续挂在树接口下，树插件化时会被一并拖走或撕裂；必须在树外独立成模块，让未来的树插件**依赖**排序模块，而不是反过来。
- 普通实体同样需要手动排序：菜单顺序、看板列序、清单拖拽。US-010 的 AC#2/#3 只覆盖了树形节点排序，扁平列表是空白。

## 核心设计方向（待 `/speckit-plan` 细化）

- **接口解耦**：新增 `ISortableEntity extends IEntity { sortOrder?: string | null }`，与 `ITreeEntity` 平行；`ISortableTreeEntity` 保留为 `ITreeEntity & ISortableEntity` 的兼容别名，不破坏现有引用。
- **实体级声明**：普通实体通过某种声明获得可排序语义（候选：`@Entity({ sortable: true })` 或识别 `sortOrder` 字段约定）——具体 surface 待设计，需覆盖：schema 携带 sortOrder、查询默认按 sortOrder 升序、UI 启用拖拽。
- **fractional indexing 工具**：`generateKeyBetween(a, b)` / `generateNKeysBetween` 等，自研或引入 `fractional-indexing` 包（当前无此依赖）——待设计决策；约束类型供拖放、手动排序场景使用。
- **重排写路径**：拖拽后仅对受影响行批量重写 sortOrder（相邻间隙取新键），其余行不动；写入走统一 mutation 边界（与 US-027 权限联动：无 `update` 权限的实体不可重排）。
- **rxdb-model 接线**：高层 `entity-list` 消费底层 `rowReordered` 事件 → 计算新键 → 批量持久化 → 刷新列表；不可排序实体、只读行（`_readonly`）、无更新权限实体禁用拖拽。

## 范围边界

### In Scope

- 普通（非树）实体的可排序声明与 `sortOrder` 字段语义（元数据 / 接口 / 查询默认排序）
- fractional indexing 排序工具（core，与树无关的独立模块）
- 创建时未提供 `sortOrder` 的自动生成（追加到末尾）
- rxdb-model 拖放排序的持久化接线（复用底层已有 dragOrder / rowReordered 能力）
- `ISortableTreeEntity` 向后兼容与树实体复用同一套排序工具

### Out of Scope

- 树实体插件化本身（US-025 阶段 E，前置 `RxDBBranch` 去树化）
- 跨层级树拖拽移动（改变 parentId 的拖放，属树能力）
- 分页 / 虚拟滚动列表内的跨页排序（loadMore 场景）
- 多设备离线重排的冲突合并（归 vision 阶段 3 协作）
- sortOrder 的数据库索引 / 查询性能优化（性能单列）

## 验收标准

| #   | 前置条件                                                      | 操作               | 预期结果                                                        | 状态 |
| --- | ------------------------------------------------------------- | ------------------ | --------------------------------------------------------------- | ---- |
| 1   | 普通（非树）实体声明可排序                                    | 创建若干记录并查询 | schema 含 sortOrder；查询结果默认按 sortOrder 升序              | ⬜   |
| 2   | 同上，创建时未提供 sortOrder                                  | create 一条新记录  | 自动生成排序键，追加到序列末尾                                  | ⬜   |
| 3   | 可排序实体列表                                                | 拖拽一行到新位置   | 仅受影响行的 sortOrder 被重写（批量更新），其余行不变           | ⬜   |
| 4   | 同一序列                                                      | 连续快速拖拽多次   | 键值始终严格有序且不耗尽精度（fractional indexing 基本性质）    | ⬜   |
| 5   | rxdb-model 实体列表（可排序实体）                             | 拖拽行并刷新页面   | 顺序持久化，重查后仍保持                                        | ⬜   |
| 6   | 不可排序实体                                                  | 打开实体列表       | 不显示拖拽手柄，`rowReordered` 不触发                           | ⬜   |
| 7   | 可排序实体但含只读行（`_readonly`）或无 update 权限（US-027） | 尝试拖拽该行       | 拖拽禁用，重排写入被拒                                          | ⬜   |
| 8   | 树形实体（含 `ISortableTreeEntity` 引用）                     | 执行排序相关操作   | 行为与普通实体一致（同一套工具），现有接口引用不破坏            | ⬜   |
| 9   | 排序模块源码                                                  | 依赖分析           | 不 import 任何 `tree-entity*` 模块（依赖方向：tree → sortable） | ⬜   |
| 10  | 未声明可排序的现有实体                                        | 原有查询与 UI 操作 | 行为完全不变                                                    | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**交付阶段**：

- **阶段 A：core 排序语义**。`ISortableEntity` 接口 + fractional indexing 工具模块 + 实体级声明与元数据校验 + 查询默认排序 + create 自动追加键。
- **阶段 B：rxdb-model 拖放持久化**。高层 `entity-list` 接线 `rowReordered` → 键计算 → mutation 批量写入 → 刷新；拖拽启用条件（可排序 ∧ 有 update 权限 ∧ 行非只读）。
- **阶段 C：树兼容与验收**。`ISortableTreeEntity` 兼容别名、树实体走同一套工具、依赖方向测试（AC#9）、e2e 覆盖。

**关键设计决策（留待 plan 阶段）**：

- **fractional indexing 自研 vs 引入依赖**：当前无 `fractional-indexing` 依赖；自研需覆盖 AC#4 的精度性质测试。
- **可排序声明 surface**：`@Entity({ sortable: true })` 与「识别 sortOrder 字段」二选一——前者显式、可校验，后者少一层配置但靠约定。
- **与 US-027 权限联动**：重排是 update 的一种，必须过同一写边界；`update: 'system'` / `'none'` 的实体一律不可拖拽。
- **现有资产复用**：`table-factory.ts` 的 `dragOrder: true`、`entity-table.component.ts` 的 `rowReordered` 输出与 `patchDragIconForReadonlyRows` hack 均已有单测，接线时不动其 API。
- **树插件化前瞻**：排序模块独立成核内模块（或随树一起外移时保持独立包），树的插件化不应要求排序迁移。

## 实现文件

- `packages/rxdb/src/entity/sortable-entity.interface.ts` — `ISortableEntity` 与兼容别名（新）
- `packages/rxdb/src/entity/` — fractional indexing 工具模块（新，如 `order-keys.ts`）
- `packages/rxdb/src/entity/metadata-options.interface.ts` / `metadata-validate.ts` — 可排序声明与校验
- `packages/rxdb/src/repository/` — 查询默认排序接线
- `packages/rxdb-model/src/entity-table/` — 重排键计算与写入协调
- `packages/rxdb-model-angular/src/entity-list/entity-list.component.ts` — 拖拽持久化接线
- `apps/dev-rxdb-angular-e2e/` — 拖拽排序 e2e

## References

- [US-010 树形实体](US-010-tree-entity.md) — 树节点排序的原始验收（AC#2/#3）
- [US-025 核心包子系统按插件边界外移](US-025-core-plugin-extraction.md) — 阶段 E 树实体外移及其前置
- [tree-entity.interface.ts](../../../packages/rxdb/src/entity/tree-entity.interface.ts) — `ISortableTreeEntity` 现状（零消费）
- [entity-table.component.ts](../../../packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts) — 已有 dragOrder / rowReordered 半成品
