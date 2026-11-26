# rxdb-adapter-sqlite-core

The shared kernel for `@aiao/rxdb` SQLite adapters. It abstracts "entity → SQL" mapping, table name resolution, rule group building, the base Repository, and change events into backend-agnostic base classes that each concrete SQLite adapter reuses.

> This package is generally not installed directly; it is pulled in transitively as a dependency of adapters such as `@aiao/rxdb-adapter-sqlite`, `@aiao/rxdb-adapter-sqlite-wasm`, and `@aiao/rxdb-adapter-sqliteai`.

## Capabilities

- `RxDBAdapterSqliteBase`: base class for SQLite adapters, encapsulating transactions, table creation, and change hooks
- `SqliteTransactionExecutor`: the SQLite-side implementation of `TransactionExecutor`; this is what the `transaction()` callback receives
- `SqliteRepository`: type-safe Repository implementation on top of SQLite
- `buildRuleGroup`: compiles query rules into SQL conditions
- `sqliteGetTableName` / `sqliteGetTableNameByMetadata`: entity → table name resolution
- Backend contract types: `SqliteBackend`, `SqliteChangeEvent`, `SQLiteChangeType`, etc.

A concrete backend only needs to implement the `SqliteBackend` contract to plug in.

## Transaction API (step 1 of C2 has landed)

The callback signature of `RxDBAdapterSqliteBase.transaction()` / `runInTransaction()` has been tightened to receive a `SqliteTransactionExecutor`:

```typescript
import type { TransactionFun } from '@aiao/rxdb-adapter-sqlite-core';

const fun: TransactionFun = async executor => {
  // Holding the executor is what counts as "inside this transaction"; repositories only accept entity instances, not plain objects
  const repo = executor.getRepository(Todo);
  await repo.create(rxdb.entityManager.instantiate(Todo, { title: 'inside tx' }));

  // executor.execute(sql, bindings) passes through to the underlying client.execute,
  // so the existing `transaction(async tx => tx.execute(sql))` style keeps working
  await executor.execute('SELECT 1');

  // Run nested inner work
  await executor.run(async inner => inner.getRepository(Todo).count());

  // Merge remote changes
  await executor.mergeChanges(actions, localChanges, /* disableTriggers */ false);
};
```

> Zero-parameter callbacks remain compatible (TS allows fewer formal parameters). `SqliteTransactionExecutor` is not exported directly — it is an internal product of `RxDBAdapterSqliteBase`; external code interacts with it only through the `TransactionExecutor` interface from `@aiao/rxdb`.

## Backup and restore

The six SQLite adapters (four browser-side ones, plus desktop `sqlite-electron` and `sqlite-tauri`) share this implementation: `adapter.backup(sink)` writes the whole database as a `.rxdb-backup` archive stream,
and `adapter.restore(source)` restores the archive into the **empty** storage configured for that adapter. Both ends stream block by block and never read the entire database into memory.

> **External files are not part of the backup.** The archive contains only the database itself (`scope: { database: 'included', externalFiles: 'excluded' }`). Files stored outside the database by plugins such as `rxdb-plugin-storage` need to be backed up separately.

```typescript
// Backup: write to any WritableStream (e.g. a File System Access file handle)
const handle = await showSaveFilePicker({ suggestedName: 'notes.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());

// Restore: the target RxDB instance has the adapter registered but is not connected yet
const target = await rxdb.getAdapter('wa-sqlite');
await target.restore(file.stream());
await rxdb.connect('wa-sqlite');
```

Key points:

- **Logical dump**: the archive is all schema statements (tables / indexes / views / triggers / virtual tables, `user_version`, `application_id`, `sqlite_sequence`)
  plus row literals produced by `quote()`, taken in the same read transaction on the adapter's serial queue, so it lands on a committed transaction boundary
  and there is no "only the main file was copied, WAL was missed" problem. **The database is busy while writing**: when the output stream applies backpressure, both reads and writes queue up;
  the lock wait limit is controlled by `lockTimeoutMs` (default 30s), and exceeding it throws `lock_timeout`.
- **Compatibility**: the adapter name, SQLite major version, virtual table modules used by the archive (e.g. `fts5`), system table / change encoding version, entity schema fingerprint,
  and encryption auth domain are all determined before the first statement is written; incompatibility reports `incompatible_archive` / `auth_domain_mismatch`.
  Integrity (SHA-256) can only be confirmed at the end of the read; on failure, what has already been written is rolled back in the same transaction (`corrupt_archive` / `truncated_archive`).
- **Empty target**: the target may only be exactly what a freshly created empty database looks like. Objects the engine creates automatically on every connection (e.g. tables of sqliteai's built-in extensions)
  are described by the client's `describeBlankDatabase()` on a temporary `:memory:` connection; the target counts as empty only if both the object list and the contents match exactly.
  A target with existing business data, with only RxDB system tables, or with data written into engine tables reports `target_not_empty`.
- **Interruption**: for persistent targets, a "restore in progress" marker table is committed first, then schema and data are written in a single transaction. If the page is closed mid-restore,
  both connecting and restoring again report `restore_incomplete`; calling `adapter.cleanupIncompleteRestore()` cleans it up and restore can be retried;
  if cleanup itself fails it reports `cleanup_pending`. In-memory targets leave no residue; the restored database is taken over by the next `connect()`.
- **Exclusivity**: persistent targets are protected by the Web Lock `rxdb-sqlite-storage:<storageKey>`; only one concurrent restore to the same target can win (`target_busy`),
  and connection attempts during a restore report `restore_in_progress`. A desktop database file may also be opened by other windows or processes, which Web Lock cannot stop:
  restore and cleanup first acquire SQLite's file-level exclusive lock on their own connection (`locking_mode = EXCLUSIVE`); if the database file is opened elsewhere it reports `target_busy`
  (`details.field` is `storage`).
- **Encrypted databases**: the archive contains only ciphertext and keyring metadata, never passwords or keys; a restored database stays locked and is unlocked with the original password via `unlock()`.
- Rows written by a restore produce no change history.

### Capability matrix

| adapter                                            | in-memory storage                | persistent storage           | other configurations                                | persistent `journal_mode` | FTS5 | engine-created objects        |
| -------------------------------------------------- | -------------------------------- | ---------------------------- | --------------------------------------------------- | ------------------------- | :--: | ----------------------------- |
| `@aiao/rxdb-adapter-wa-sqlite`                     | `MemoryVFS` / `MemoryAsyncVFS`   | `IDBBatchAtomicVFS` (`idb`)  | other VFSes: `unsupported_combination` (`vfs`)      | `delete`                 |  ❌  | none                          |
| `@aiao/rxdb-adapter-sqlite-wasm`                   | `vfs: 'memory'`                  | `vfs: 'idb'`                 | other VFSes: `unsupported_combination` (`vfs`)      | `delete`                 |  ✅  | none                          |
| `@aiao/rxdb-adapter-sqlite`                        | `opfs` off                       | `opfs: true` (`opfs`)        | `opfsFallback: 'memory'`: `unsupported_combination` | `delete`                 |  ✅  | none                          |
| `@aiao/rxdb-adapter-sqliteai`                      | `opfs` off                       | `opfs: true` (`opfs`)        | `opfsFallback: 'memory'`: `unsupported_combination` | `delete`                 |  ✅  | vector / memory extension tables |
| `@aiao/rxdb-adapter-electron` (`sqlite-electron`) | none                             | database file (`file`)       | all options are within the matrix                   | `wal`                    |  ❌  | none                          |
| `@aiao/rxdb-adapter-tauri` (`sqlite-tauri`)       | none                             | database file (`file`)       | all options are within the matrix                   | `wal`                    |  ✅  | none                          |

- Within the same adapter, the in-memory and persistent storages are each other's source / target; archives across adapters report `incompatible_archive`.
- **WAL**: connection initialization requests WAL. The persistent VFSes of the four browser adapters do not provide the shared memory WAL needs, so SQLite silently keeps `delete`;
  the two desktop adapters open a real database file, so WAL takes effect. The backup itself is a read transaction at the SQL layer, independent of the journal mode; WAL-specific cases
  (auto-checkpoint turned off, frames that are committed and only in the WAL must also make it into the snapshot) run on the two desktop backends.
- **FTS5**: `sqlite-electron`'s SQLite has FTS5 compiled in, but the host runs in defensive mode and cannot write back to the virtual table's shadow tables,
  so both backup and restore of a database containing FTS5 report `unsupported_combination` (`details.field` is `adapter.extensions`); `sqlite-tauri`'s Rust host does not enable defensive mode, so FTS5 is available.
- All errors are `RxDBBackupError`; branch on `error.code` (`isRxDBBackupError()` can narrow the type).
- For a custom backend to support restore, the client must implement `setChangeEventsMuted()` and `describeBlankDatabase()` (the `describeSqliteDatabase()` exported by this package can be used);
  when missing, restore reports `unsupported_combination` (`details.field` is `client.<method name>`).
  If calling these two methods fails (e.g. the request is blocked by the host application's kind guard) it reports `io_error`, with the original error in `cause`, and the target has not been written yet at that point.

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- See the project documentation site for the adapter guides

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

## Enumerations

| Enumeration | Description |
| ------ | ------ |
| [SQLiteChangeType](enumerations/SQLiteChangeType.md) | SQLite change type constants consistent with the C API |

## Classes

| Class | Description |
| ------ | ------ |
| [Oo1ClientBase](classes/Oo1ClientBase.md) | SQLite client base class wrapping `oo1.DB`-style runtimes (`@sqlite.org/sqlite-wasm`, `@sqliteai/sqlite-wasm`, etc.). |
| [RxDBAdapterSqliteBase](classes/RxDBAdapterSqliteBase.md) | Backend-agnostic base class for SQLite adapters. |
| [RxDBAdapterSqliteError](classes/RxDBAdapterSqliteError.md) | Error class for RxDB SQLite adapters |
| [RxDBQueryCacheRowContractError](classes/RxDBQueryCacheRowContractError.md) | Raised when QueryCache lands a fetch and a remote row does not satisfy the local table's column contract. |
| [SqliteCoreKeyringStorage](classes/SqliteCoreKeyringStorage.md) | Persists the keyring singleton row into the SQLite database that comes with the adapter. Used by both the wa-sqlite and sqliteai subclasses. |
| [SqliteRepository](classes/SqliteRepository.md) | Entity repository operations |
| [SqliteRepositoryBase](classes/SqliteRepositoryBase.md) | Entity repository operations |
| [SqliteTransactionExecutor](classes/SqliteTransactionExecutor.md) | SQLite-side implementation of [TransactionExecutor](../rxdb/interfaces/TransactionExecutor.md). |
| [SqliteTreeRepository](classes/SqliteTreeRepository.md) | Tree entity repository |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [AdapterEncryptionFacade](interfaces/AdapterEncryptionFacade.md) | Developer-facing facade exposed on `adapter.encryption`, forwarding internally to `Keyring`. If no entity in the database declares encrypted columns, all methods throw `EncryptedConfigurationError(code: 'no_encrypted_columns')`. |
| [ChangeRecordEvent](interfaces/ChangeRecordEvent.md) | Payload of a single-row change event dispatched by SQLite's update_hook. Collected by each backend's SqliteClient and dispatched in batches to the RxDB upper layer. |
| [CreateSqliteClientOptions](interfaces/CreateSqliteClientOptions.md) | Options for creating a Worker-capable SQLite client. |
| [EncryptionContext](interfaces/EncryptionContext.md) | Encryption context: keyring, namespace, and entity metadata resolver. |
| [ExistsScope](interfaces/ExistsScope.md) | The alias assigned to one layer of an EXISTS subquery |
| [ExistsSubquery](interfaces/ExistsSubquery.md) | The compiled WHERE result of an EXISTS subquery |
| [FtsField](interfaces/FtsField.md) | FTS5 field descriptor |
| [FtsTriggerOptions](interfaces/FtsTriggerOptions.md) | Options for [buildFtsTriggersSql](functions/buildFtsTriggersSql.md). |
| [GenerateSqlResult](interfaces/GenerateSqlResult.md) | SQL generation result: the complete SQL statement and optional parameter bindings. |
| [InsertSqlOptions](interfaces/InsertSqlOptions.md) | Options when generating insert SQL. |
| [IRxDBAdapterDataChange](interfaces/IRxDBAdapterDataChange.md) | RxDB adapter data change interface |
| [JoinContext](interfaces/JoinContext.md) | Shared context during JOIN planning: alias table, relation aliases, and field alias mappings. |
| [Oo1Capi](interfaces/Oo1Capi.md) | Minimal contract of `sqlite3.capi`: only the part needed to register update hooks is kept here. |
| [Oo1ClientEvents](interfaces/Oo1ClientEvents.md) | Event signature table dispatched by `Oo1ClientBase`, for EventDispatcher type inference. |
| [Oo1ClientLoadOptions](interfaces/Oo1ClientLoadOptions.md) | Runtime options accepted by `Oo1ClientBase.init`. Subclasses can extend them via generics (e.g. `WaSqliteLoadOptions extends Oo1ClientLoadOptions`). |
| [Oo1Database](interfaces/Oo1Database.md) | Minimal contract of `sqlite3.oo1.DB` / `OpfsDb`: execute SQL, register functions, and close the connection. |
| [Oo1LoadFingerprint](interfaces/Oo1LoadFingerprint.md) | Configuration fingerprint that determines "which WASM module to load". |
| [Oo1LoadOptions](interfaces/Oo1LoadOptions.md) | `oo1` WASM load options, shared by all sqlite/sqliteai adapters. |
| [Oo1PreparedStatement](interfaces/Oo1PreparedStatement.md) | Structured type alias of the `oo1` API, shared by `@sqlite.org/sqlite-wasm` and `@sqliteai/sqlite-wasm`. |
| [Oo1Static](interfaces/Oo1Static.md) | Minimal contract of the sqlite-wasm module's export object: capi, the oo1 namespace, and version information. |
| [OpfsOpenRetryOptions](interfaces/OpfsOpenRetryOptions.md) | Options for [openOpfsWithRetry](functions/openOpfsWithRetry.md). |
| [RelationPair](interfaces/RelationPair.md) | One segment of a relation path: the metadata of the entity owning the relation and the relation itself |
| [RuleGroupJoinOptions](interfaces/RuleGroupJoinOptions.md) | JOIN planning options |
| [RuleScope](interfaces/RuleScope.md) | The query layer in which a rule is compiled |
| [SqliteBackend](interfaces/SqliteBackend.md) | Abstract interface implemented by SQLite WASM backends. |
| [SqliteBackendOptions](interfaces/SqliteBackendOptions.md) | Options for opening a SQLite backend |
| [SqliteBackupInput](interfaces/SqliteBackupInput.md) | All the context needed for one backup. |
| [SqliteBaseOptions](interfaces/SqliteBaseOptions.md) | Base options for SQLite adapters (backend-agnostic). |
| [SqliteBlankDatabase](interfaces/SqliteBlankDatabase.md) | Result of [SqliteClientLike.describeBlankDatabase](interfaces/SqliteClientLike.md#describeblankdatabase). |
| [SqliteChangeErrorEvent](interfaces/SqliteChangeErrorEvent.md) | Change handling failure event |
| [SqliteChangeEvent](interfaces/SqliteChangeEvent.md) | SQLite change event interface |
| [SqliteClientLike](interfaces/SqliteClientLike.md) | Minimal client interface for SQLite adapters. Both wa-sqlite's SqliteClient and sqliteai's SqliteaiClient satisfy this contract. |
| [SqliteData](interfaces/SqliteData.md) | A single result set, containing column names and row data |
| [SqliteExecResult](interfaces/SqliteExecResult.md) | Result of executing SQL through the backend |
| [SqliteRestoreInput](interfaces/SqliteRestoreInput.md) | All the context needed for one restore, provided by the adapter. |
| [SqliteRestoreOptions](interfaces/SqliteRestoreOptions.md) | SQLite restore options. |
| [SqliteRestoreOutcome](interfaces/SqliteRestoreOutcome.md) | Result of [restoreSqliteDatabase](functions/restoreSqliteDatabase.md). |
| [SqliteStatement](interfaces/SqliteStatement.md) | A SQL statement to execute and its bind parameters. |
| [SqliteSuccessResult](interfaces/SqliteSuccessResult.md) | SQLite query result with timing information |
| [SwitchVersionSqlItem](interfaces/SwitchVersionSqlItem.md) | The SQL collection for one kind of operation (delete/insert/update) in a version switch, with its change records. |
| [SwitchVersionSqlResult](interfaces/SwitchVersionSqlResult.md) | Complete SQL result produced by a version switch: grouped into delete/insert/update. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [BuildRuleGroupFn](type-aliases/BuildRuleGroupFn.md) | Function form of `buildRuleGroup`: called back when recursively compiling WHERE for EXISTS subqueries |
| [OpfsFallback](type-aliases/OpfsFallback.md) | Behavior when the OPFS backend database cannot be opened (e.g. the browser does not support `Atomics.wait`, lacks `crossOriginIsolated`, etc.). |
| [RowId](type-aliases/RowId.md) | SQLite rowId type (bigint) |
| [SqlExecutor](type-aliases/SqlExecutor.md) | A transaction facade that can issue SQL directly. |
| [SqliteBackupStorage](type-aliases/SqliteBackupStorage.md) | The storage backend corresponding to the adapter's current configuration, determining whether backup / restore is possible and which restore path is taken. |
| [SqliteChangeErrorListener](type-aliases/SqliteChangeErrorListener.md) | Listener for [SqliteChangeErrorEvent](interfaces/SqliteChangeErrorEvent.md) |
| [SqliteChangeErrorPhase](type-aliases/SqliteChangeErrorPhase.md) | Phase at which change handling failed |
| [SQLiteCompatibleType](type-aliases/SQLiteCompatibleType.md) | Data types compatible with SQLite parameter binding |
| [SqliteDataType](type-aliases/SqliteDataType.md) | SQLite data type names |
| [SqliteRestoreStage](type-aliases/SqliteRestoreStage.md) | Stages a restore progresses through, each fired once in order. |
| [SqliteResult](type-aliases/SqliteResult.md) | Alias of SqliteSuccessResult |
| [SqliteSupportedBackupStorage](type-aliases/SqliteSupportedBackupStorage.md) | Storage backends for which backup and restore have been delivered. |
| [TransactionFun](type-aliases/TransactionFun.md) | Transaction callback. |
| [UpdateHookCallback](type-aliases/UpdateHookCallback.md) | SQLite update_hook notification callback |

## Variables

| Variable | Description |
| ------ | ------ |
| [BATCH\_TIMEOUT](variables/BATCH_TIMEOUT.md) | Change event batching timeout tiers (milliseconds). Shorter means lower latency but more frequent CPU wakeups; longer saves power but delays UI response. - `IMMEDIATE` (0): synchronous dispatch, only for test scenarios - `FAST` (4): merged within about one frame - `BALANCED` (16): the default, about one frame (60fps) - `POWER_SAVE` (50): mobile / background scenarios |
| [DEFAULT\_BATCH\_TIMEOUT](variables/DEFAULT_BATCH_TIMEOUT.md) | Default batching timeout (milliseconds), about one frame at 60fps. |
| [DEFAULT\_CACHE\_SIZE\_KB](variables/DEFAULT_CACHE_SIZE_KB.md) | Default SQLite page cache size (KB), 50 MB. |
| [deserializeFromEnvelope](variables/deserializeFromEnvelope.md) | Restores authenticated plaintext bytes into business values according to the property types at persistence time. |
| [envelopePlaintextPatches](variables/envelopePlaintextPatches.md) | Iterates the top-level keys of plaintext patches; for keys present in `entity.encryptedPropertyMap`, replaces the value with the envelope string produced by `keyring.encrypt`. Unencrypted keys are copied as-is. |
| [FTS\_BIGRAM\_SQL\_FUNCTION](variables/FTS_BIGRAM_SQL_FUNCTION.md) | Name of the index-side transform function registered with SQLite, shared by triggers and backfill. |
| [MAIN\_RULE\_SCOPE](variables/MAIN_RULE_SCOPE.md) | Rule scope for top-level queries (`FROM <table> _`) |
| [MAIN\_TABLE\_ALIAS](variables/MAIN_TABLE_ALIAS.md) | **Leaf** utility module for table aliases |
| [MAX\_BATCH\_WAIT\_MS](variables/MAX_BATCH_WAIT_MS.md) | Hard cap (milliseconds) that forces a flush of batched events. |
| [normalizeCreateEntity](variables/normalizeCreateEntity.md) | Normalizes create data (filters out unassigned fields). |
| [normalizeUpdateEntity](variables/normalizeUpdateEntity.md) | Normalizes update data and filters out readonly fields. |
| [ROWID](variables/ROWID.md) | SQLite row id column name |
| [serializeForEnvelope](variables/serializeForEnvelope.md) | Encodes a single non-null business value into envelope plaintext bytes according to its property type. |
| [SQLITE\_BACKUP\_ENGINE](variables/SQLITE_BACKUP_ENGINE.md) | Engine name recorded in the archive. |
| [SQLITE\_BACKUP\_ENGINE\_COMPATIBILITY](variables/SQLITE_BACKUP_ENGINE_COMPATIBILITY.md) | Engine data compatibility key. |
| [SQLITE\_BACKUP\_LOCK\_TIMEOUT\_MS](variables/SQLITE_BACKUP_LOCK_TIMEOUT_MS.md) | Default value of RxDBBackupOptions.lockTimeoutMs. |
| [SQLITE\_MAX\_BIND\_VARIABLES](variables/SQLITE_MAX_BIND_VARIABLES.md) | - |
| [unenvelopePlaintextPatches](variables/unenvelopePlaintextPatches.md) | Inverse of `envelopePlaintextPatches`: decrypts top-level envelope strings back to plaintext. Used when applying the `inversePatch` of undo/redo. |
| [WAL\_AUTOCHECKPOINT\_PAGES](variables/WAL_AUTOCHECKPOINT_PAGES.md) | Page threshold for automatic checkpointing in WAL mode. |
| [WATCH\_TABLES](variables/WATCH_TABLES.md) | Set of system tables that trigger entity event dispatch. Only update_hook events for these three tables are surfaced as RxDBChange / RxDBBranch / RxDBMigration events. |

## Functions

| Function | Description |
| ------ | ------ |
| [assertLoadOptionsTransferable](functions/assertLoadOptionsTransferable.md) | Asserts that load options about to be passed across a worker can be structurally cloned. |
| [assertOo1Static](functions/assertOo1Static.md) | Asserts that a third-party sqlite-wasm init result satisfies the minimal runtime contract of the shared oo1 client. |
| [assertQueryCacheRowContract](functions/assertQueryCacheRowContract.md) | Validates the column set of remote rows before landing them, failing fast on contract violations. |
| [build\_order\_by](functions/build_order_by.md) | Builds ordering SQL |
| [build\_rule](functions/build_rule.md) | Generates the SQL query condition for a rule |
| [build\_rule\_group\_join](functions/build_rule_group_join.md) | Computes the JOIN string needed by a query |
| [build\_substring\_condition](functions/build_substring_condition.md) | Generates the SQL condition for substring-like operators |
| [buildCreateFtsTableSql](functions/buildCreateFtsTableSql.md) | Generates the FTS5 external content virtual table DDL for a single collection. |
| [buildFtsTriggersSql](functions/buildFtsTriggersSql.md) | Generates the trio of FTS5 sync triggers (`_ai` / `_ad` / `_au`). |
| [buildOo1InitOptions](functions/buildOo1InitOptions.md) | Builds the Emscripten module init object from `Oo1LoadOptions` (fed to `sqlite3InitModule`). |
| [buildRuleGroup](functions/buildRuleGroup.md) | Generates the SQL query condition for a ruleGroup |
| [cleanupIncompleteSqliteRestore](functions/cleanupIncompleteSqliteRestore.md) | Cleans up an unfinished restore (the page closed mid-restore, or cleanup itself failed after a restore failure). |
| [compileCjkToken](functions/compileCjkToken.md) | Query-side transform: compiles a query token into an FTS5 MATCH fragment. |
| [convertSwitchResultToSql](functions/convertSwitchResultToSql.md) | - |
| [count\_sql](functions/count_sql.md) | Generates a count query |
| [create\_table\_sql](functions/create_table_sql.md) | Computes the SQL for creating a table |
| [create\_tables\_sql](functions/create_tables_sql.md) | Generates SQL for creating multiple tables |
| [defaultPrintErr](functions/defaultPrintErr.md) | Default `printErr` implementation: filters out known noise and forwards to `console.error`. |
| [defaultWarn](functions/defaultWarn.md) | Default warn implementation: filters out known noise and forwards to `console.warn`. |
| [deleteIndexedDatabase](functions/deleteIndexedDatabase.md) | Deletes an IndexedDB database; does nothing when the database does not exist. |
| [describeSqliteDatabase](functions/describeSqliteDatabase.md) | Describes a database's structure and all rows, for restore to decide whether the target "is exactly a freshly created empty database". |
| [dispatch\_switch\_events](functions/dispatch_switch_events.md) | Dispatches local events corresponding to switch operations |
| [execute\_switch\_actions](functions/execute_switch_actions.md) | Executes the SQL operations in a SwitchVersionSqlResult and dispatches events |
| [executeOo1Helper](functions/executeOo1Helper.md) | SQL execution helper that works with any `oo1.DB`-style runtime. |
| [find\_by\_row\_ids\_sql](functions/find_by_row_ids_sql.md) | Generates the findByRowIds query |
| [find\_sql](functions/find_sql.md) | Generates the find query |
| [format\_table\_alias](functions/format_table_alias.md) | - |
| [generate\_entity\_count\_ancestors\_sql](functions/generate_entity_count_ancestors_sql.md) | Queries the number of ancestor nodes |
| [generate\_entity\_count\_descendants\_sql](functions/generate_entity_count_descendants_sql.md) | Queries the number of descendant nodes |
| [generate\_entity\_delete\_sql](functions/generate_entity_delete_sql.md) | Generates the SQL statement for deleting an entity |
| [generate\_entity\_deletes\_sql](functions/generate_entity_deletes_sql.md) | Generates SQL statements for bulk-deleting entities |
| [generate\_entity\_find\_ancestors\_sql](functions/generate_entity_find_ancestors_sql.md) | Queries ancestor nodes |
| [generate\_entity\_find\_descendants\_sql](functions/generate_entity_find_descendants_sql.md) | Queries descendant nodes |
| [generate\_entity\_insert\_sql](functions/generate_entity_insert_sql.md) | Generates the SQL statement for creating an entity |
| [generate\_entity\_inserts\_sql](functions/generate_entity_inserts_sql.md) | Generates parameterized SQL for bulk-creating entities |
| [generate\_sql](functions/generate_sql.md) | Generates the SQL query statement |
| [generate\_table\_set\_trigger\_sql](functions/generate_table_set_trigger_sql.md) | Rebuilds only one table set's change triggers: both the table set and the branch are provided by the caller, branch tables are untouched. |
| [generate\_table\_trigger\_sql](functions/generate_table_trigger_sql.md) | Generates a table's triggers |
| [generate\_tree\_sql](functions/generate_tree_sql.md) | Generates the tree query |
| [generateSwitchBranchSql](functions/generateSwitchBranchSql.md) | Generates the SQL statements for switching branches (the whole block assembled by [generateSwitchBranchStatements](functions/generateSwitchBranchStatements.md)). |
| [generateSwitchBranchStatements](functions/generateSwitchBranchStatements.md) | Generates the sequence of SQL statements to execute when switching branches, returned in execution order. |
| [get\_cached\_regexp](functions/get_cached_regexp.md) | RegExp factory with an LRU-ish cache, for reuse by the SQLite `regexp` / `regexp_replace` custom functions. |
| [get\_field\_sql](functions/get_field_sql.md) | Gets the SQL representation of a field |
| [get\_init\_sql](functions/get_init_sql.md) | Generates the connection initialization PRAGMA SQL for a database. |
| [get\_or\_create\_relation\_alias](functions/get_or_create_relation_alias.md) | - |
| [get\_persistent\_db\_file\_name](functions/get_persistent_db_file_name.md) | Normalizes a database name into a persistent file path. |
| [get\_relation\_key](functions/get_relation_key.md) | Gets the relation key |
| [get\_rule\_value](functions/get_rule_value.md) | Gets the SQL representation of a rule value |
| [get\_sql\_operator](functions/get_sql_operator.md) | Gets the SQL operator |
| [get\_sql\_value](functions/get_sql_value.md) | Gets the SQL value representation |
| [get\_sql\_with\_params](functions/get_sql_with_params.md) | Merges a SQL template and parameters into the complete SQL |
| [get\_storage\_object\_name](functions/get_storage_object_name.md) | Name of a database-level constraint object (conditional unique index, range exclusion constraint) within a given table set. |
| [get\_table\_name](functions/get_table_name.md) | Builds the physical name of a main table set: `<namespace>$<logical name>`. |
| [get\_table\_name\_by\_entity\_type](functions/get_table_name_by_entity_type.md) | Physical table name of an entity within a given table set. |
| [get\_table\_name\_by\_metadata](functions/get_table_name_by_metadata.md) | Physical table name of an entity within a given table set. |
| [get\_table\_name\_info](functions/get_table_name_info.md) | Splits a physical name back into `[namespace, rest]`: cut at the first `$`; the namespace is an empty string when there is no `$`. |
| [getEntityObjectFromResult](functions/getEntityObjectFromResult.md) | Creates an entity object from a query result row |
| [getRxDBChangeEventType](functions/getRxDBChangeEventType.md) | Maps SQLite change types to RxDB change event strings |
| [getTableColumnIndexName](functions/getTableColumnIndexName.md) | Index name for a column (or relation column): `idx_<physical table name>_<property name>`, which follows the physical table name so the various sets naturally never collide. |
| [handle\_array\_in](functions/handle_array_in.md) | Handles in/notIn queries on array fields |
| [handle\_exists](functions/handle_exists.md) | Handles the EXISTS/NOT EXISTS operators |
| [handle\_flatmap\_contains](functions/handle_flatmap_contains.md) | Handles contains/notContains queries on keyValue fields |
| [handle\_rxdb\_change](functions/handle_rxdb_change.md) | Handles SQLite change events, converting row changes fired by update_hook into RxDB entity events. |
| [hasCjk](functions/hasCjk.md) | Determines whether a string contains consecutive CJK text. |
| [indexTextForFts](functions/indexTextForFts.md) | Index-side transform: replaces each run of consecutive CJK in the text with a space-separated unigram + bigram sequence. |
| [isOpfsAccessHandleBusy](functions/isOpfsAccessHandleBusy.md) | Whether the database file in the OPFS root directory is currently held by another context via a sync access handle. |
| [isReadOnlyStatement](functions/isReadOnlyStatement.md) | Determines whether a statement is read-only (SELECT / EXPLAIN). |
| [isSameOo1LoadConfig](functions/isSameOo1LoadConfig.md) | Whether two loads point at the same WASM module. |
| [isSqlResultEmpty](functions/isSqlResultEmpty.md) | Checks whether a sqlite result is empty |
| [isTableExistedSql](functions/isTableExistedSql.md) | Checks whether a sqlite table exists |
| [normalizeSingleStatementSql](functions/normalizeSingleStatementSql.md) | Strips the trailing semicolon and whitespace, to make it easier to decide whether this is a single statement. |
| [openOpfsWithRetry](functions/openOpfsWithRetry.md) | Opens an OPFS database; retries with a backoff sequence when the open fails with `SQLITE_CANTOPEN` or when creating a new VFS collides with an unclosed temporary handle. |
| [process\_relation\_joins](functions/process_relation_joins.md) | Handles JOINs for relation fields |
| [quote\_sql\_identifier](functions/quote_sql_identifier.md) | Escapes an identifier (table name, column name, trigger name, etc.) into a double-quoted SQL identifier. |
| [readCurrentBranchId](functions/readCurrentBranchId.md) | Reads the current branch id (activated takes precedence, otherwise main), for rebuilding triggers. |
| [releaseComlinkProxy](functions/releaseComlinkProxy.md) | Releases the MessagePort held by a Comlink proxy. |
| [releaseOpfsCoopSyncHandles](functions/releaseOpfsCoopSyncHandles.md) | Releases the sync access handles and temporary directory left behind by `OPFSCoopSyncVFS`: the handles of database files (including ones opened later), the handles in the temporary directory, and then releases the temporary directory's lock (US-221). |
| [remove\_all\_triggers\_sql](functions/remove_all_triggers_sql.md) | Removes all change triggers of a table set. |
| [remove\_entity\_ids\_from\_cache](functions/remove_entity_ids_from_cache.md) | Removes deleted entities from the cache (by id) and marks their state as removed |
| [removeOpfsFiles](functions/removeOpfsFiles.md) | Deletes a set of files under the OPFS root directory; skips ones that do not exist. |
| [requiredQueryCacheColumns](functions/requiredQueryCacheColumns.md) | Computes the columns that "remote rows must carry themselves": those that are NOT NULL on the local table and have **no default value available at table creation time**. |
| [resolve\_column\_name](functions/resolve_column_name.md) | Resolves a JS property name to a database column name; if entityMetadata exists, prefers columnName and supports nested paths such as keyValue.string |
| [resolveLocateFile](functions/resolveLocateFile.md) | Resolves the Emscripten `locateFile` hook. |
| [restoreSqliteDatabase](functions/restoreSqliteDatabase.md) | Restores an archive produced by [writeSqliteBackup](functions/writeSqliteBackup.md) into an empty SQLite database. |
| [rewriteOpfsProxyWorkerUrl](functions/rewriteOpfsProxyWorkerUrl.md) | Rewrites sqlite3's built-in OPFS proxy worker URL to a user-provided path. |
| [rxdb\_adapter\_mutations](functions/rxdb_adapter_mutations.md) | - |
| [rxDBColumnTypeToSqliteType](functions/rxDBColumnTypeToSqliteType.md) | Converts RxDB property types to SQLite data types |
| [shouldIgnoreSqliteMessage](functions/shouldIgnoreSqliteMessage.md) | Determines whether SQLite output is known ignorable noise (e.g. the OPFS main-thread downgrade notice). |
| [shouldUsePreparedStatementPath](functions/shouldUsePreparedStatementPath.md) | Determines whether to take the prepared statement path (rather than batch exec). |
| [sqliteStorageLockName](functions/sqliteStorageLockName.md) | Lock name protecting the same SQLite persistent database. |
| [switch\_branch](functions/switch_branch.md) | Switches the current active branch and applies the required data migrations. |
| [toOo1LoadFingerprint](functions/toOo1LoadFingerprint.md) | Computes the [Oo1LoadFingerprint](interfaces/Oo1LoadFingerprint.md) from load options. |
| [transaction\_sqlite\_result](functions/transaction_sqlite_result.md) | Processes a SQLite transaction result and returns an entity array |
| [transformEntityValueSqliteToJs](functions/transformEntityValueSqliteToJs.md) | Converts SQLite entity values to JS object values |
| [transformEntityValueToSql](functions/transformEntityValueToSql.md) | Converts entity values to SQLite format |
| [transformValueJsToSqlite](functions/transformValueJsToSqlite.md) | Converts JS typed values to SQLite-compatible types |
| [transformValueSqliteToJs](functions/transformValueSqliteToJs.md) | Converts SQLite typed values to JS types |
| [try\_process\_relation\_flatmap](functions/try_process_relation_flatmap.md) | Handles keyValue fields on relations |
| [try\_resolve\_relation\_path](functions/try_resolve_relation_path.md) | - |
| [update\_entity\_from\_sqlite\_result](functions/update_entity_from_sqlite_result.md) | Updates the entity cache; only updates existing entities, delegating to transaction_sqlite_result |
| [update\_sql](functions/update_sql.md) | - |
| [validateSqliteNumericOption](functions/validateSqliteNumericOption.md) | Validates integer numeric options of the SQLite client. |
| [withGlobalOo1LoadLock](functions/withGlobalOo1LoadLock.md) | Serializes one complete oo1 module load into a single global channel. |
| [withPatchedOpfsProxyWorker](functions/withPatchedOpfsProxyWorker.md) | Temporarily replaces `globalThis.Worker` with a Proxy that rewrites the OPFS proxy worker's script URL to `opfsProxyPath`. |
| [withSqliteApiConfig](functions/withSqliteApiConfig.md) | Temporarily sets `globalThis.sqlite3ApiConfig`, runs `run`, then restores the original value. |
| [withTriggersDisabled](functions/withTriggersDisabled.md) | Runs a piece of writing inside a window with triggers disabled: drop triggers → run `body` → rebuild triggers. |
| [wrapWithComlink](functions/wrapWithComlink.md) | Wraps the client with Comlink when Worker/SharedWorker options are provided, otherwise returns the direct client. |
| [wrapWithComlinkEndpoint](functions/wrapWithComlinkEndpoint.md) | Creates an independent Comlink child port for one client connection. |
| [writeSqliteBackup](functions/writeSqliteBackup.md) | Writes a connected SQLite database out as an archive. |
