# rxdb-adapter-pglite

RxDB adapter that runs PostgreSQL in the browser via PGlite.

## Features

- **Local-first**: runs a full PostgreSQL engine in the browser via WebAssembly
- **Zero server**: no backend server required; data is stored locally
- **PostgreSQL compatible**: supports standard PostgreSQL syntax and features
- **Reactive**: data changes trigger updates automatically

## When to use

- You need PostgreSQL features (JSONB, tsvector full-text search, advanced indexes)
- You plan to migrate to a PostgreSQL backend later
- You need stronger SQL standard compliance
- Your app needs complex queries and transaction support

## Comparison with other adapters

| Feature       | PGlite                      | wa-sqlite | sqlite-wasm |
| ---------- | --------------------------- | --------- | ----------- |
| Database engine | PostgreSQL                  | SQLite    | SQLite      |
| Runtime assets   | ~50.9 MB (uncompressed Worker) | ~500KB    | ~800KB      |
| Full-text search   | tsvector                    | FTS5      | FTS5        |
| JSON support  | JSONB                       | JSON1     | JSON1       |
| Ecosystem compatibility   | PostgreSQL                  | SQLite    | SQLite      |

Sizes are recorded against the current build output: the browser Worker is about 50.9 MB uncompressed, and the npm tarball is about 16.9 MB compressed. Actual first-transfer size depends on deployment-side compression; subsequent loads depend on the browser's caching policy.

## Installation

```bash
npm install @aiao/rxdb-adapter-pglite
# or
pnpm add @aiao/rxdb-adapter-pglite
```

## Usage

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [],
  sync: {
    type: SyncType.None,
    local: `{ adapter: 'pglite' }`
  }
});

rxdb.adapter('pglite', database => new RxDBAdapterPGlite(database, { store: 'memory' }));
await rxdb.connect('pglite');

// Release Worker and database resources when the app exits
await rxdb.disconnect('pglite');
```

## Transaction API (C2 step 2 delivered)

The PGlite adapter matches `rxdb-adapter-sqlite-core` — the `transaction()` / `runInTransaction()` callback receives a `PGliteTransactionExecutor`:

```typescript
await adapter.transaction(async executor => {
  const repo = executor.getRepository(Post);
  await repo.create({ title: 'inside tx' });
  await executor.mergeChanges(actions, localChanges, /* disableTriggers */ false);
});
```

> `PGliteTransactionExecutor` is not exported directly — it is an internal product of `RxDBAdapterPGlite`; its state is **self-contained**, never derived from the driver's `tx.closed` (that flag does not flip on failure paths, so an escaped tx would keep writing in autocommit). External code interacts with it through the `TransactionExecutor` interface of `@aiao/rxdb`.

## Backup and restore

`backup()` writes the whole database as a `.rxdb-backup` archive stream; `restorePGliteDatabase()` restores the archive into an **empty, unconnected** target. Both sides stream chunk by chunk and never read the whole database into memory.

> **External files are not part of the backup.** The archive contains only the database itself (`scope: { database: 'included', externalFiles: 'excluded' }`). Files kept outside the database by plugins such as `rxdb-plugin-storage` need to be backed up separately.

```typescript
import { restorePGliteDatabase, cleanupIncompletePGliteRestore } from '@aiao/rxdb-adapter-pglite';

// Backup: write to any WritableStream (e.g. a File System Access file handle)
const handle = await showSaveFilePicker({ suggestedName: 'demo.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());
console.log(result.sha256, result.bytes);

// Restore into IndexedDB: the target RxDB instance has the adapter registered but is not connected yet
const file = await (await showOpenFilePicker())[0].getFile();
await restorePGliteDatabase(file.stream(), { rxdb: target, options: { store: 'idb' } });
await target.connect('pglite');
```

When restoring to a memory target, the `database` handle in the result must be claimed via the adapter's `restoredDatabase` option (it can be claimed only once, and only by the RxDB instance that was validated during restore, with the same set of extensions; otherwise `invalid_state` is thrown):

```typescript
const { database } = await restorePGliteDatabase(stream, { rxdb: target, options: { store: 'memory' } });
target.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory', restoredDatabase: database }));
await target.connect('pglite');
```

| Storage                                | Backup                         | Restore                         |
| ----------------------------------- | ---------------------------- | ---------------------------- |
| `memory`                            | ✅                           | ✅                           |
| `idb`                               | ✅                           | ✅                           |
| Others (`opfs-ahp://`, `file://`, etc.) | ❌ `unsupported_combination` | ❌ `unsupported_combination` |

Key points:

- **Consistency**: a backup lands on a committed transaction boundary; writes during the backup are queued behind it. The lock wait ceiling is controlled by `lockTimeoutMs` (default 30s); on timeout it throws `lock_timeout`. Each connection to an `idb` source database reads one in-memory view from IndexedDB only at open time and never sees commits from other connections afterwards, so a backup requires this connection to have exclusively held the storage since it was opened:
  if other connections (another instance in the same page, other tabs or Workers) are still open, or any other connection has been around since this connection opened — even if already closed — it reports `target_busy`.
  In that case close the other connections first, then `disconnect()` and `connect()` again on the instance used for backup, then back up.
- **Runtime environment**: backing up an `idb` source database relies on `navigator.locks.query()` to count connections in other tabs / Workers; if the environment does not provide it, it reports `unsupported_combination` (`navigator.locks.query`).
  The consistent snapshot uses internal runtime parts of PGlite that are not exposed in its type declarations (two mutexes and the Emscripten filesystem); after a PGlite upgrade, if any of them is missing, backup reports `unsupported_combination` (`pglite`) instead of failing halfway.
- **Validate before writing**: the manifest is read in the first chunk; an incompatible engine version, schema fingerprint, extensions, or encryption auth domain is rejected before writing to the target (`incompatible_archive` / `auth_domain_mismatch`). Integrity (SHA-256) can only be confirmed at the end of the stream; on failure the already-written data is discarded (`corrupt_archive` / `truncated_archive`).
- **Encrypted databases**: the archive contains only ciphertext and keyring metadata — no passphrases or keys; the restored database stays locked, `unlock()` it with the original passphrase.
- **Interruption**: the IndexedDB target writes nothing to IndexedDB before validation passes, and uses a persistent marker to record "restore in progress". If the process is killed mid-restore, both connecting and restoring again report `restore_incomplete`; call `cleanupIncompletePGliteRestore(target)` and then restore again. If the cleanup itself fails, it reports `cleanup_pending`.
- **Exclusivity**: only one concurrent restore to the same target can win (`target_busy`); connection attempts during a restore report `restore_in_progress`.

All errors are `RxDBBackupError`; branch on `error.code` (`isRxDBBackupError()` can narrow the type).

## Full example

See the integration example in [dev-rxdb-angular](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-angular).

`@aiao/rxdb-adapter-pglite` — RxDB adapter (PGlite / WebAssembly PostgreSQL backend).

Three public API layers:
- Adapter and client: [RxDBAdapterPGlite](classes/RxDBAdapterPGlite.md), [PGliteClient](classes/PGliteClient.md)
- Data access: Repositories obtained through [RxDBAdapterPGlite](classes/RxDBAdapterPGlite.md)
- SQL generation (pure functions): `create_tables_sql`, `generate_trigger_sql`,
  `notify_function_sql`, plus the native PG FTS module (`fts/`)

Test utilities are imported separately from the `@aiao/rxdb-adapter-pglite/testing` subpath to avoid polluting the runtime package.

## Enumerations

| Enumeration | Description |
| ------ | ------ |
| [PGliteChangeType](enumerations/PGliteChangeType.md) | PGlite change event type enumeration, corresponding to PostgreSQL's TG_OP (trigger operation) |

## Classes

| Class | Description |
| ------ | ------ |
| [PGliteClient](classes/PGliteClient.md) | PGlite client: wraps a `@electric-sql/pglite` instance and provides: - a unified query/exec/transaction API (aligned with [IPGliteClient](interfaces/IPGliteClient.md)) - NOTIFY listening on system tables (rxdb_change/rxdb_branch/rxdb_migration) with batched dispatch (16ms trailing debounce, plus max-wait and capacity ceilings as safeguards, see [PGliteNotificationBatcher](classes/PGliteNotificationBatcher.md)) - safe disconnect (`syncToFs` first, then `close`, to avoid callbacks throwing after IDBFS closes) - LiveQuery support (depends on the `live` extension injected at init) |
| [PGliteNotificationBatcher](classes/PGliteNotificationBatcher.md) | Aggregates raw NOTIFY messages into [PGliteChangeEvent](interfaces/PGliteChangeEvent.md). |
| [PGliteRestoredDatabase](classes/PGliteRestoredDatabase.md) | One-shot database handle obtained after restoring to a memory target. |
| [PostgreSQLDialect](classes/PostgreSQLDialect.md) | PostgreSQL dialect implementation |
| [RxDBAdapterPGlite](classes/RxDBAdapterPGlite.md) | RxDB PGlite adapter |
| [RxdbAdapterPGliteError](classes/RxdbAdapterPGliteError.md) | PGlite adapter error class |
| [RxDBChangePipelineTimeoutError](classes/RxDBChangePipelineTimeoutError.md) | The PGlite change pipeline did not become idle within the time limit. |
| [RxDBQueryCacheRowContractError](classes/RxDBQueryCacheRowContractError.md) | When QueryCache fetch results are persisted, a remote row does not satisfy the local table's column contract. |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [AdapterEncryptionFacade](interfaces/AdapterEncryptionFacade.md) | Developer facade exposed on `adapter.encryption`, forwarding internally to the `Keyring`. If no entity in the database declares encrypted columns, all methods throw `EncryptedConfigurationError(code: 'no_encrypted_columns')`. |
| [EncryptionContext](interfaces/EncryptionContext.md) | Encryption context, threaded through every PGlite helper that can touch encrypted columns. When the database has no encrypted columns, keyring is `null` and the helpers take the plaintext branch. Structurally consistent with sqlite-core's `EncryptionContext`. |
| [FtsField](interfaces/FtsField.md) | - |
| [FtsOptions](interfaces/FtsOptions.md) | FTS DDL generation options. |
| [IPGliteClient](interfaces/IPGliteClient.md) | Minimal public contract of the PGlite client. |
| [ISqlDialect](interfaces/ISqlDialect.md) | SQL dialect interface, defining database-specific SQL syntax conversion methods |
| [PGliteChangeEvent](interfaces/PGliteChangeEvent.md) | PGlite change event — a database change event sent by triggers via NOTIFY |
| [PGliteChangeEventSource](interfaces/PGliteChangeEventSource.md) | Change event source: a client that can attach/detach [PGliteChangeType](enumerations/PGliteChangeType.md) listeners. |
| [PGliteClientEvents](interfaces/PGliteClientEvents.md) | PGlite client event map: each [PGliteChangeType](enumerations/PGliteChangeType.md) maps to a [PGliteChangeEvent](interfaces/PGliteChangeEvent.md), used for strongly-typed inference of `addEventListener` on [PGliteClient](classes/PGliteClient.md) (based on [EventDispatcher](../utils/classes/EventDispatcher.md)). |
| [PGliteClientOptions](interfaces/PGliteClientOptions.md) | PGlite client configuration options, extending native PGlite options |
| [PGliteEngineInfo](interfaces/PGliteEngineInfo.md) | Engine version and data-format compatibility key. |
| [PGliteNotificationBatcherOptions](interfaces/PGliteNotificationBatcherOptions.md) | Arguments of [PGliteNotificationBatcher](classes/PGliteNotificationBatcher.md). |
| [PGliteNotifyPayload](interfaces/PGliteNotifyPayload.md) | PGlite notification payload structure — data parsed from NOTIFY messages |
| [PGliteQueryable](interfaces/PGliteQueryable.md) | Minimal interface for executing read-only queries: satisfied by both PGlite instances and [IPGliteClient](interfaces/IPGliteClient.md). |
| [PGliteRestoreOptions](interfaces/PGliteRestoreOptions.md) | PGlite restore options. |
| [PGliteRestoreResult](interfaces/PGliteRestoreResult.md) | PGlite restore result. |
| [PGliteRestoreTarget](interfaces/PGliteRestoreTarget.md) | Restore target: a **not-yet-connected** RxDB instance, plus the adapter options it will use when connecting. |
| [PGliteServerExtensionRequirements](interfaces/PGliteServerExtensionRequirements.md) | Server extensions loaded by the adapter on the user's behalf. |
| [PgliteTableColumn](interfaces/PgliteTableColumn.md) | PGlite database table column info interface, containing all fields of the PostgreSQL information_schema.columns view |
| [RxDBChangePipelineTimeoutDiagnostics](interfaces/RxDBChangePipelineTimeoutDiagnostics.md) | Change pipeline timeout diagnostics snapshot. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [ForeignKey](type-aliases/ForeignKey.md) | Foreign key constraint info type, describing foreign key relationships between tables |
| [FtsArrayKind](type-aliases/FtsArrayKind.md) | The **physical** storage shape of an array column. |
| [PGliteBackupStorage](type-aliases/PGliteBackupStorage.md) | The storage backend where the data directory lives; only these two variants support backup and restore. |
| [PGliteDataDirItem](type-aliases/PGliteDataDirItem.md) | One item in a data directory snapshot: an entry header for a directory or file, or a chunk of content following a file entry header. |
| [PGliteRestoreStage](type-aliases/PGliteRestoreStage.md) | The stage restore has reached; each fires once, in order. |

## Variables

| Variable | Description |
| ------ | ------ |
| [ADAPTER\_NAME](variables/ADAPTER_NAME.md) | PGlite adapter name constant |
| [DEFAULT\_FTS\_ARRAY\_KIND](variables/DEFAULT_FTS_ARRAY_KIND.md) | Default physical shape of array columns, consistent with the adapter's table-creation mapping. |
| [DEFAULT\_FTS\_REGCONFIG](variables/DEFAULT_FTS_REGCONFIG.md) | Default PostgreSQL `regconfig` for FTS, which determines tokenizer / stopwords / stemmer. |
| [DEFAULT\_NOTIFY\_BATCH\_TIMEOUT\_MS](variables/DEFAULT_NOTIFY_BATCH_TIMEOUT_MS.md) | Default trailing debounce interval (milliseconds). |
| [DEFAULT\_NOTIFY\_MAX\_BATCH\_WAIT\_MS](variables/DEFAULT_NOTIFY_MAX_BATCH_WAIT_MS.md) | Ceiling (milliseconds) from when a batch window opens until it **must** flush. |
| [DEFAULT\_NOTIFY\_MAX\_PENDING\_EVENTS](variables/DEFAULT_NOTIFY_MAX_PENDING_EVENTS.md) | Ceiling of events accumulated in a single window; exceeding it flushes immediately, forming backpressure. |
| [deserializeFromEnvelope](variables/deserializeFromEnvelope.md) | Restores authenticated plaintext bytes to the business value, using the property type at persistence time. |
| [FTS\_COLUMN](variables/FTS_COLUMN.md) | Physical column name of the FTS table (tsvector type). Always added to the original table to avoid collisions with business columns. |
| [INVALID\_QUERY\_ERROR\_CODE](variables/INVALID_QUERY_ERROR_CODE.md) | Error code for query compilation failures: `where` / `orderBy` could not be translated into SQL. |
| [normalizeCreateEntity](variables/normalizeCreateEntity.md) | Normalizes create data (filters out unassigned fields). |
| [normalizeUpdateEntity](variables/normalizeUpdateEntity.md) | Normalizes update data and filters readonly fields. |
| [PG\_MAX\_PARAMS](variables/PG_MAX_PARAMS.md) | Maximum parameter count of a single PostgreSQL protocol query (int16). Large batches are sliced by column count to avoid exceeding INSERT ... VALUES (...) limits. |
| [pgDialect](variables/pgDialect.md) | Default exported PostgreSQL dialect instance |
| [PGLITE\_BACKUP\_ENGINE](variables/PGLITE_BACKUP_ENGINE.md) | Engine name recorded in the archive. |
| [PGLITE\_BACKUP\_LOCK\_TIMEOUT\_MS](variables/PGLITE_BACKUP_LOCK_TIMEOUT_MS.md) | Default value of [RxDBBackupOptions.lockTimeoutMs](../rxdb/interfaces/RxDBBackupOptions.md#locktimeoutms). |
| [PGLITE\_EXCLUDED\_FILES](variables/PGLITE_EXCLUDED_FILES.md) | File names excluded from the archive (at any depth). |
| [serializeForEnvelope](variables/serializeForEnvelope.md) | Encodes a single non-null business value into envelope plaintext bytes by property type. |

## Functions

| Function | Description |
| ------ | ------ |
| [asPGliteChangeEventSource](functions/asPGliteChangeEventSource.md) | Narrows a client to a change event source; returns `undefined` when it lacks the capability. |
| [assertQueryCacheRowContract](functions/assertQueryCacheRowContract.md) | Validates the column set of remote rows before persisting them; fails fast when the contract is violated. |
| [buildCreateFtsTableSql](functions/buildCreateFtsTableSql.md) | Generates PostgreSQL FTS physical-structure DDL: appends a `_fts` `tsvector` column + GIN index on the original table. |
| [buildFtsTriggersSql](functions/buildFtsTriggersSql.md) | Generates the PostgreSQL FTS sync trigger (function + trigger). |
| [chunkByPgParamLimit](functions/chunkByPgParamLimit.md) | Slices batch data by the parameter count limit. |
| [cleanupIncompletePGliteRestore](functions/cleanupIncompletePGliteRestore.md) | Cleans up an incomplete restore (the page closed mid-restore, or the cleanup itself failed after a restore failure). |
| [create\_tables\_sql](functions/create_tables_sql.md) | Generates the creation SQL for multiple tables (multi-statement string) |
| [create\_tables\_statements](functions/create_tables_statements.md) | Generates the creation statement list for multiple tables |
| [generate\_trigger\_sql](functions/generate_trigger_sql.md) | Generates PostgreSQL trigger SQL |
| [generateNotifyFunctionSQL](functions/generateNotifyFunctionSQL.md) | Generates the NOTIFY trigger function SQL |
| [generateNotifyInfrastructureSQL](functions/generateNotifyInfrastructureSQL.md) | Generates the complete NOTIFY infrastructure SQL |
| [generateNotifyTriggerSQL](functions/generateNotifyTriggerSQL.md) | Creates the NOTIFY trigger for a given table |
| [getChangeTriggerFunctionName](functions/getChangeTriggerFunctionName.md) | Fully qualified name of an entity change trigger function: `"<schema>"."<table>_change_trigger_fn"`. |
| [getEntityObjectFromResult](functions/getEntityObjectFromResult.md) | Gets entity object data from a PGlite result row. PGlite returns rows as objects; mainly used for type conversion |
| [getMonotonicUpdatedAt](functions/getMonotonicUpdatedAt.md) | Guarantees `updatedAt` is monotonically increasing: multiple updates within the same millisecond are incremented by 1ms, so sync-side comparisons by `updatedAt` do not break. |
| [getSchemaName](functions/getSchemaName.md) | The schema an entity lives in within a given table set. |
| [getSqlWithParams](functions/getSqlWithParams.md) | Replaces PostgreSQL parameter placeholders ($1, $2, etc.) with actual values. For batch operations where parameterized queries cannot be used |
| [getSwitchUpdatedAt](functions/getSwitchUpdatedAt.md) | Computes the `updatedAt` to write in a branch-switch (undo / redo) UPDATE. |
| [getTableColumnIndexName](functions/getTableColumnIndexName.md) | Gets the table column index name |
| [getTableName](functions/getTableName.md) | Assembles a fully qualified table name such as `"public"."users"` (with double-quote escaping). |
| [getTableNameByMetadata](functions/getTableNameByMetadata.md) | Fully qualified table name of an entity within a given table set. |
| [getTableSetSchemaSuffix](functions/getTableSetSchemaSuffix.md) | Schema name suffix of a shadow table set: `$<suffix>`. Every schema in the catalog whose name ends with it belongs to this table set. |
| [getTableSetSuffixOfSchemaName](functions/getTableSetSuffixOfSchemaName.md) | Recognizes which shadow table set a catalog schema name belongs to: it matches when the segment after the last `$` has the shape of a table set suffix (US-314 B2.6). |
| [pgliteServerExtensionRequirementsOf](functions/pgliteServerExtensionRequirementsOf.md) | The PGlite server extensions a set of entities requires the adapter to load (see `pglite-server-extensions.ts`): `btree_gist` is required if any entity declares range exclusions (`exclusions`). |
| [quoteIdentifier](functions/quoteIdentifier.md) | Wraps an identifier (schema name, table name, column name) in double quotes. |
| [quoteLiteral](functions/quoteLiteral.md) | Assembles a string into an SQL string literal. |
| [remove\_all\_triggers\_sql](functions/remove_all_triggers_sql.md) | Generates the SQL to drop all entity triggers |
| [remove\_trigger\_sql](functions/remove_trigger_sql.md) | Generates the SQL to drop a single entity's trigger |
| [removeNotifyTriggerSQL](functions/removeNotifyTriggerSQL.md) | Removes a table's NOTIFY trigger |
| [requiredQueryCacheColumns](functions/requiredQueryCacheColumns.md) | Computes the columns a "remote row must carry": those that are NOT NULL on the local table and **get no default at table creation time**. |
| [resolvePGliteInitOptions](functions/resolvePGliteInitOptions.md) | Normalizes [PGliteClientOptions](interfaces/PGliteClientOptions.md) into a shape the PGlite constructor can consume directly. |
| [restorePGliteDatabase](functions/restorePGliteDatabase.md) | Restores an archive produced by [RxDBAdapterPGlite.backup](classes/RxDBAdapterPGlite.md#backup) into a new PGlite database. |
| [rxDBColumnTypeToPGliteType](functions/rxDBColumnTypeToPGliteType.md) | Converts RxDB property types to PGlite data types |
| [rxDBColumnTypeToPGliteTypeIndexName](functions/rxDBColumnTypeToPGliteTypeIndexName.md) | Gets the index operator class of a property. http://www.postgres.cn/docs/current/indexes-opclass.html |
| [shouldUsePGliteWorker](functions/shouldUsePGliteWorker.md) | Determines whether a Web Worker must be enabled for PGlite. |
| [toPGliteEngineInfo](functions/toPGliteEngineInfo.md) | Computes engine info from the raw `SHOW server_version` text. |
| [transformEntityValuePGliteToJs](functions/transformEntityValuePGliteToJs.md) | Converts all values of an entity object from PGlite format to JS types. Mainly used for the patch/inversePatch fields of the RxDBChange table |
| [transformEntityValueToSql](functions/transformEntityValueToSql.md) | Converts entity values to an SQL-compatible format |
| [verifyPGliteRestored](functions/verifyPGliteRestored.md) | Verifies that the restored database really is the database declared by the manifest, not merely a pile of bytes with correct digests. |
