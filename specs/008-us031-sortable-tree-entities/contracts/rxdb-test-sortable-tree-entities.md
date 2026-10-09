# Contract: `@aiao/rxdb-test/entities` 新增的四个可排序树实体

`@aiao/rxdb-test` 是发布包（0.0.26），`./entities` 子路径是公开面。本阶段只**新增**导出，不改既有导出。

## 新增导出

| 导出名               | kind  | 说明                                 |
| -------------------- | ----- | ------------------------------------ |
| `SortableMenuSimple` | class | 见 [data-model.md](../data-model.md) |
| `SortableMenuLarge`  | class | 同上                                 |
| `SortableFileNode`   | class | 同上                                 |
| `SortableFileLarge`  | class | 同上                                 |

`ENTITIES` 追加这四个（保持按实体名字母序，落在 `MenuSimple` 与 `Task` 之间），`DEMO_ENTITIES` 的长度断言 14 → 18。
每个类带 TSDoc：用途（哪个 demo 页面）、与对应旧实体的关系（复刻、不可互换）、排序域（按 `parentId`，根节点一组）。

## 不变量（由 `rxdb-test` 的契约单测守住）

1. **与旧实体同形**：新实体的 `properties`（除 `sortOrder.nullable`）、`computedProperties`、`relations`、`indexes`、`features.tree`
   与对应旧实体逐项相等；`FileNode` 系的 `fullName` / `isFolder` / `sizeFormatted` 对同一组字段给出相同结果。复刻发生漂移即红。
2. **可排序声明**：`manualOrder` 为 `{ groupBy: ['parentId'] }`，`sortOrder` 为非空 string，元数据校验无违规。
3. **旧实体不变**：`MenuSimple` / `MenuLarge` / `FileNode` / `FileLarge` 未声明 `manualOrder`，`sortOrder` 仍可空。
4. **命名**：实体名与表名不与 `rxdb-test/src/sortable/` 的契约夹具（`SortableItem` / `SortableList` / `SortableListItem` / `SortableTodo`）
   及任何既有实体重名。

## 下游

- `public-contract/consumer.ts` 与 `baseline.json`：新增四个导出；消费面断言 `new SortableMenuSimple().sortOrder` 的类型是 `string`。
- Electron / Tauri 的五个 setup 不注册新实体（不渲染树页面）。
- 备份与失败现场归档的结构指纹随 `DEMO_ENTITIES` 改变，本阶段合入前导出的 demo 归档恢复时报 `incompatible_archive`（预期）。
