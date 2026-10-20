# 表名与 SQL 生成函数改为必传表集

`@aiao/rxdb-adapter-sqlite-core` 与 `@aiao/rxdb-adapter-pglite` 里推导物理表名、生成建表 / 读写 / 触发器 SQL 的公开函数，多了一个**必填**参数：表集（`WorktreeTableSet`）。四个 SQLite 后端包重新导出的 `sqliteGetTableNameByMetadata` 跟着变。

这是一次**破坏性变更**，只影响直接调用这些底层函数的代码（自己拼 raw SQL、自己生成建表语句）。只用仓库、实体与查询 API 的应用不受影响。主检出位的物理名与之前**逐字相同**，库文件不需要任何迁移。

## 为什么必须改

可写检出位（[US-314](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/collaboration/US-314-writable-worktrees.md)）在同一个库里给每个检出位一套业务表：主检出位就是现有业务表，可写检出位各有一套影子表（SQLite 系给表名加后缀，PGlite 换 schema）。

物理名原先只从实体元数据推出来，没有别的输入。同一个实体有了好几套表之后，「不说哪一套」推出来的永远是主检出位那一套——挂在可写检出位上的实例用它拼 SQL，会**静默**读写主检出位的数据，不报错。所以表集做成必填，编译器逼着每个调用点说清楚。

## 怎么改

只有主检出位的应用（引入可写检出位之前的全部用法），补一个 `WorktreeTableSet.MAIN`，行为与之前完全一样：

```typescript
import { getEntityMetadata, WorktreeTableSet } from '@aiao/rxdb';
import { get_table_name_by_metadata, quote_sql_identifier } from '@aiao/rxdb-adapter-sqlite-core';

// 之前
// const table = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(Todo)));

// 之后
const table = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(Todo), WorktreeTableSet.MAIN));
```

写在适配器或仓库内部、要跟着实例走的代码，传适配器当前挂的表集：

```typescript
const table = get_table_name_by_metadata(metadata, adapter.tableSet);
```

系统表（分支、变更日志、迁移水位等）全库只有一份，任何表集都解析到主表集；传 `WorktreeTableSet.MAIN` 最直白。

## 签名对照

**`@aiao/rxdb-adapter-sqlite-core`**（四个 SQLite 后端包的 `sqliteGetTableNameByMetadata` 同 `get_table_name_by_metadata`）

| 函数                            | 新签名                                                    |
| ------------------------------- | --------------------------------------------------------- |
| `get_table_name_by_metadata`    | `(metadata, tableSet)`                                    |
| `get_table_name_by_entity_type` | `(EntityType, tableSet)`                                  |
| `getTableColumnIndexName`       | `(metadata, property, tableSet)`                          |
| `generate_entity_insert_sql`    | `(metadata, tableSet, entity, context?)`                  |
| `generate_entity_inserts_sql`   | `(metadata, tableSet, entities, context?, encryption?)`   |
| `update_sql`                    | `(metadata, tableSet, entityOrEntities, patch, context?)` |
| `generate_entity_delete_sql`    | `(metadata, tableSet, entity)`                            |
| `generate_entity_deletes_sql`   | `(metadata, tableSet, entities)`                          |
| `find_by_row_ids_sql`           | `(metadata, tableSet, rowIds)`                            |
| `create_table_sql`              | `(adapter, metadata, tableSet)`                           |
| `create_tables_sql`             | `(adapter, tableSet, EntityTypes, branchId, entities?)`   |
| `remove_all_triggers_sql`       | `(adapter, tableSet)`                                     |
| `generate_table_trigger_sql`    | `(metadata, { branchId, tableSet, … })`：`tableSet` 必填  |

`readCurrentBranchId(tx)` 改为 `readCurrentBranchId(tx, tableSet)`：挂在可写检出位上时读的是那套表持有的分支，主表集照旧读激活的那一条。

`switch_transaction_id(adapter, branchId, transactionId?)` 去掉了，改用 `generate_table_set_trigger_sql(adapter, tableSet, branchId, transactionId?)`：按表集重建变更触发器的唯一入口，只给这套表里记日志、且有自己那张表的实体生成。

查询类函数（`find_sql`、`count_sql`、关联与树查询）本来就收 `adapter`，签名不变，内部取 `adapter.tableSet`。

**`@aiao/rxdb-adapter-pglite`**

| 函数                       | 新签名                                                   |
| -------------------------- | -------------------------------------------------------- |
| `getTableNameByMetadata`   | `(metadata, tableSet)`                                   |
| `create_tables_sql`        | `(adapter, tableSet, EntityTypes, entities?)`            |
| `create_tables_statements` | `(adapter, tableSet, EntityTypes, entities?)`            |
| `remove_trigger_sql`       | `(metadata, tableSet)`                                   |
| `remove_all_triggers_sql`  | `(adapter, tableSet)`                                    |
| `generate_trigger_sql`     | `(metadata, { branchId, tableSet, … })`：`tableSet` 必填 |

## 新增

- `@aiao/rxdb` 的 `WorktreeTableSet`：`WorktreeTableSet.MAIN` 是主检出位那一套；`WorktreeTableSet.of(suffix, entities)` 造可写检出位的一套。
- 两个适配器的 `adapter.tableSet`：本实例挂的表集。
- sqlite-core 的 `get_companion_table_name`（附属表，如图插件的边表）与 `get_storage_object_name`（条件唯一索引、区间排他触发器这类库级对象的名字）。
- PGlite 的 `getSchemaName` 与 `getChangeTriggerFunctionName`。
- `WorktreeTableSet.holderKey` 与 `WorktreeTableSet.suffixOfHolderKey`：检出位持有分支时写进 `rxdb_branch.activeKey` 的键由表集推出。
- 两个适配器的 `createWorktreeTableSet(tableSet, branchId)` / `dropWorktreeTableSet(tableSet)`：建 / 删一套可写检出位的表。
- `rxdb.mountWorktreeTableSet(tableSet)` 与 `rxdb.worktreeTableSet` / `worktreeTableSet$`：实例换挂一套表；适配器的 `tableSet` 转读实例上的这一份。
- `WorktreeTableSet.heldBranchWhere`：这套表持有的分支怎么查，「当前分支」一律按它读。
