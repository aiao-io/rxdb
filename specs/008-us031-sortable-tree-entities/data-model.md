# Data Model: US-031 阶段 A

四个新实体 1:1 复刻旧实体，只在三处不同：实体名 / 表名、`manualOrder: { groupBy: ['parentId'] }`、`sortOrder` 非空。
复刻而不继承的理由见 [research.md](research.md) R1。旧实体（`MenuSimple` / `MenuLarge` / `FileNode` / `FileLarge`）不改。

## 实体

| 新实体               | 表名                   | 复刻自       | `features.tree.hasChildren` | 使用页面（三端相同）      |
| -------------------- | ---------------------- | ------------ | --------------------------- | ------------------------- |
| `SortableMenuSimple` | `sortable_menu_simple` | `MenuSimple` | `false`（内存计算）         | 菜单 simple               |
| `SortableMenuLarge`  | `sortable_menu_large`  | `MenuLarge`  | `true`（库计算）            | 菜单 virtual、菜单 lazy   |
| `SortableFileNode`   | `sortable_file_node`   | `FileNode`   | `false`                     | 文件 simple、文件 virtual |
| `SortableFileLarge`  | `sortable_file_large`  | `FileLarge`  | `true`                      | 文件 lazy                 |

全部继承 `TreeAdjacencyListEntityBase`、用 `@TreeEntity` 声明，`namespace` 取默认 `public`。

### 字段

菜单两个实体：

| 字段          | 类型    | 约束                                                        |
| ------------- | ------- | ----------------------------------------------------------- |
| `id`          | UUID    | 主键（基类）                                                |
| `parentId`    | UUID    | 可空，自引用外键，`ON DELETE CASCADE`（基类 `parent` 关系） |
| `title`       | string  | 非空                                                        |
| `sortOrder`   | string  | **非空**，列名 `sort_order`；手动排序键                     |
| `hasChildren` | boolean | 计算属性（只读）；`SortableMenuSimple` 恒为 null            |

文件两个实体：在菜单的 `id` / `parentId` / `sortOrder` / `hasChildren` 之外有 `name`（string 非空）、`type`（enum `file` / `folder` 非空）、
`extension`（string 可空）、`size`（number 可空），以及类上的 getter `fullName` / `isFolder` / `sizeFormatted`（与旧实体逐字相同）。

### 索引

| 实体                 | 索引名            | 列                              | 唯一 | normalized |
| -------------------- | ----------------- | ------------------------------- | ---- | ---------- |
| `SortableMenuSimple` | `parent_title`    | `parentId`, `title`             | 是   | 是         |
| `SortableMenuLarge`  | `parent_sort`     | `parentId`, `sortOrder`         | 否   | —          |
| `SortableMenuLarge`  | `parent_title`    | `parentId`, `title`             | 是   | 是         |
| `SortableFileNode`   | `parent_sort`     | `parentId`, `sortOrder`         | 否   | —          |
| `SortableFileNode`   | `parent_fullname` | `parentId`, `name`, `extension` | 是   | 是         |
| `SortableFileLarge`  | `parent_sort`     | `parentId`, `sortOrder`         | 否   | —          |
| `SortableFileLarge`  | `parent_fullname` | `parentId`, `name`, `extension` | 是   | 是         |

DDL 里的索引名带表名前缀（`idx_<table>_<index>`），与旧实体的同名索引不冲突。

## 排序域

- 排序域 = 同一 `parentId` 下的全部行；`parentId IS NULL` 的根节点自成一组。
- 不带 `orderBy` 的查询归一化为 `[parentId asc, sortOrder asc, id asc]`（US-028），根组在最前。
- 键不变量（US-028「键不变量」）：非空、默认字母表、组内严格递增；不同组可以重复。

## 写入状态转移（阶段 A 涉及的三种）

| 写入             | 页面给出的字段                    | 引擎补上的                                       | 提交             |
| ---------------- | --------------------------------- | ------------------------------------------------ | ---------------- |
| 新建一个节点     | 业务字段 + `parentId`（根为空）   | `sortOrder` = 目标组尾键之后                     | 一次             |
| 批量添加 n 个    | 同上，不写 `sortOrder`（含空串）  | 按目标组拆分，组内按批内顺序连续追加             | 一次 `saveMany`  |
| 删除并提升子节点 | 子节点只改 `parentId`；父节点删除 | 子节点按批内顺序追加到新组尾部（改分组字段追加） | 一次 `mutations` |

删除提升的一次提交里，适配器先执行更新、再执行删除（`rxdb_adapter_mutations.ts`：create → update → remove），
子节点在父节点被删、级联生效之前已改挂，因而不会被级联删掉。这条顺序由回归用例守住（见 [contracts/demo-write-paths.md](contracts/demo-write-paths.md)）。

## 与旧数据的关系

新实体是新表：既有 demo 库连接时由「补建缺失表」建出，旧表与旧数据原样留在库里、页面不再读取。不做数据搬迁。
