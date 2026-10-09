# Data Model: US-031 阶段 B — 树页面拖放与显示顺序

本阶段不新增、不修改任何实体或表。操作对象是阶段 A 的四个可排序树实体（[阶段 A data-model](../008-us031-sortable-tree-entities/data-model.md)）：
`SortableMenuSimple`、`SortableMenuLarge`、`SortableFileNode`、`SortableFileLarge`，均为 `manualOrder: { groupBy: ['parentId'] }`、`sortOrder` 必填。

## 排序域

- 组：`parentId` 相同的行；根节点（`parentId IS NULL`）是一组。
- 组内顺序：`sortOrder asc, id asc`；查询未给 `orderBy` 时引擎补 `[parentId asc, sortOrder asc, id asc]`。
- 一次拖放只改被拖行的 `parentId`（跨组时）与 `sortOrder`，不改其他行（US-028「不重编号」）。

## 拖放的输入与判定结果（页面内存态，不落库）

| 名称     | 形状                                                                                   | 说明                                                                                    |
| -------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 落点     | `{ targetId, position: 'before' \| 'after' \| 'into' }`                                | 由 `treeDropPosition` 按目标行纵向三等分决定，非手动模式非根级行整行为 `into`（FR-013） |
| 排序模式 | 菜单恒为手动；文件管理器取 `SortMode`（`manual` 与 8 个非手动档）                      | 只有手动模式的前后放置需要邻居                                                          |
| 组序列   | `groupIds: readonly Id[]`                                                              | 目标所在组的完整手动序列（research R2），前后放置用                                     |
| 判定结果 | `{ kind: 'reject' } \| { kind: 'noop' } \| { kind: 'reorder', target: ReorderTarget }` | `reject` 与 `noop` 都不调用引擎；`reorder` 交给 `Repository.reorder(id, target)`        |
| 重排目标 | `{ prevId, nextId }`（至少一侧非空）或 `{ group: { parentId } }`（根组为 `null`）      | US-028 `ReorderTarget`；`prevId` / `nextId` 由 `reorderTargetForDrop` 给出              |

## 页内错误提示

沿用阶段 A 的 `TreeWriteOperation`，新增一档 `'拖放'`；状态为「当前错误文案或空」，新一次写入开始时清空、失败时写入、可手动关闭。
