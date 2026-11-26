# Table name and SQL generation functions now require a table set

The public functions in `@aiao/rxdb-adapter-sqlite-core` and `@aiao/rxdb-adapter-pglite` that derive physical table names and generate create-table / read-write / trigger SQL gained a **required** parameter: the table set (`WorktreeTableSet`). The `sqliteGetTableNameByMetadata` re-exported by the four SQLite backend packages changes with them.

This is a **breaking change** that only affects code calling these low-level functions directly (hand-built raw SQL, hand-generated create-table statements). Applications that only use repositories, entities, and query APIs are unaffected. The physical name for the main checkout is **character-for-character identical** to before; database files need no migration.

## Why it had to change

Writable checkouts ([US-314](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/collaboration/US-314-writable-worktrees.md)) give each checkout its own set of business tables in the same database: the main checkout uses the existing business tables, and each writable checkout gets a set of shadow tables (the SQLite family appends a suffix to table names; PGlite switches schemas).

The physical name used to be derived from entity metadata alone, with no other input. Once one entity has several table sets, "without saying which set" always derives the main checkout's set — an instance mounted on a writable checkout would use it to build SQL and **silently** read and write the main checkout's data, with no error. So the table set is required, and the compiler forces every call site to say which one.

## How to update

Applications that only use the main checkout (every usage before writable checkouts arrived) pass `WorktreeTableSet.MAIN`; behavior is exactly as before:

```typescript
import { getEntityMetadata, WorktreeTableSet } from '@aiao/rxdb';
import { get_table_name_by_metadata, quote_sql_identifier } from '@aiao/rxdb-adapter-sqlite-core';

// Before
// const table = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(Todo)));

// After
const table = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(Todo), WorktreeTableSet.MAIN));
```

Code inside an adapter or repository that must follow the instance passes the table set the adapter is currently mounted on:

```typescript
const table = get_table_name_by_metadata(metadata, adapter.tableSet);
```

System tables (branches, change log, migration watermark, and so on) exist once per database; every table set resolves them to the main table set — passing `WorktreeTableSet.MAIN` is the most direct.

## Signature comparison

**`@aiao/rxdb-adapter-sqlite-core`** (the four SQLite backend packages' `sqliteGetTableNameByMetadata` matches `get_table_name_by_metadata`)

| Function                        | New signature                                                   |
| ------------------------------- | --------------------------------------------------------------- |
| `get_table_name_by_metadata`    | `(metadata, tableSet)`                                          |
| `get_table_name_by_entity_type` | `(EntityType, tableSet)`                                        |
| `getTableColumnIndexName`       | `(metadata, property, tableSet)`                                |
| `generate_entity_insert_sql`    | `(metadata, tableSet, entity, context?)`                        |
| `generate_entity_inserts_sql`   | `(metadata, tableSet, entities, context?, encryption?)`         |
| `update_sql`                    | `(metadata, tableSet, entityOrEntities, patch, context?)`       |
| `generate_entity_delete_sql`    | `(metadata, tableSet, entity)`                                  |
| `generate_entity_deletes_sql`   | `(metadata, tableSet, entities)`                                |
| `find_by_row_ids_sql`           | `(metadata, tableSet, rowIds)`                                  |
| `create_table_sql`              | `(adapter, metadata, tableSet)`                                 |
| `create_tables_sql`             | `(adapter, tableSet, EntityTypes, branchId, entities?)`         |
| `remove_all_triggers_sql`       | `(adapter, tableSet)`                                           |
| `generate_table_trigger_sql`    | `(metadata, { branchId, tableSet, … })`: `tableSet` is required |

`readCurrentBranchId(tx)` becomes `readCurrentBranchId(tx, tableSet)`: mounted on a writable checkout it reads the branch held by that table set; the main table set reads the active one as before.

Adapters implementing `TransactionExecutor` themselves must add the read-only member `tableSet` (which business table set this transaction lands on) — taking the adapter's `tableSet` is enough. Code reading the current branch inside a transaction queries by its `heldBranchWhere`.

`switch_transaction_id(adapter, branchId, transactionId?)` is gone, replaced by `generate_table_set_trigger_sql(adapter, tableSet, branchId, transactionId?)`: the single entry point for rebuilding the change triggers per table set, generated only for entities that write logs in this table set and have a table of their own.

Query functions (`find_sql`, `count_sql`, relation and tree queries) already took `adapter`, so their signatures are unchanged; internally they take `adapter.tableSet`.

**`@aiao/rxdb-adapter-pglite`**

| Function                   | New signature                                                   |
| -------------------------- | --------------------------------------------------------------- |
| `getTableNameByMetadata`   | `(metadata, tableSet)`                                          |
| `create_tables_sql`        | `(adapter, tableSet, EntityTypes, entities?)`                   |
| `create_tables_statements` | `(adapter, tableSet, EntityTypes, entities?)`                   |
| `remove_trigger_sql`       | `(metadata, tableSet)`                                          |
| `remove_all_triggers_sql`  | `(adapter, tableSet)`                                           |
| `generate_trigger_sql`     | `(metadata, { branchId, tableSet, … })`: `tableSet` is required |

## Additions

- `WorktreeTableSet` in `@aiao/rxdb`: `WorktreeTableSet.MAIN` is the main checkout's set; `WorktreeTableSet.of(suffix, entities)` builds a writable checkout's set.
- `adapter.tableSet` on both adapters: the table set this instance is mounted on.
- `get_storage_object_name` in sqlite-core (names for database-level objects like conditional unique indexes and interval-exclusion triggers). The graph plugin's edge table is a separately registered entity and resolves through `get_table_name_by_metadata` with its own metadata.
- `getSchemaName` and `getChangeTriggerFunctionName` in PGlite.
- `WorktreeTableSet.holderKey` and `WorktreeTableSet.suffixOfHolderKey`: the key written into `rxdb_branch.activeKey` when a checkout holds a branch is derived from the table set.
- `createWorktreeTableSet(executor, tableSet, seed)` / `dropWorktreeTableSet(executor, tableSet)` on both adapters: create a writable checkout's tables and seed them, or drop them per catalog, inside the caller's transaction; normally used through `db.workingTree.checkouts`, not called directly.
- `rxdb.mountWorktreeTableSet(tableSet)` and `rxdb.worktreeTableSet` / `worktreeTableSet$`: mount an instance on a different table set; the adapter's `tableSet` then reads the instance's.
- `WorktreeTableSet.heldBranchWhere`: how to query the branch held by this table set; always read "the current branch" through it.
