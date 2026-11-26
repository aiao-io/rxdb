# Abstract Interface: RxDBAdapterSqliteBase

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:24

Backend-agnostic SQLite adapter base class.

Subclasses are responsible for implementing `createClient()` and `adapterName`.

## Extends

- [`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md)

## Extended by

- [`RxDBAdapterSqlite`](../classes/RxDBAdapterSqlite.md)

## Implements

- [`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)

## Properties

### clientOwner \{#clientowner\}

```ts
protected readonly clientOwner: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:33

Owner key of this adapter on the client: handed to the client during `init` inside `createClient()`, and carried both when registering listeners and when releasing on disconnect (US-314 B2.3b).

#### Remarks

Inside a SharedWorker there is only one client, and every tab's adapter connects to it; on disconnect this key makes sure only one's own share is released and only one's own listeners are removed
([SqliteClientLike.release](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#release)). Backends that do not share a client can ignore it.

---

### name \{#name\}

```ts
abstract readonly name: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:34

Adapter name, same value as the key used when registering with `RxDB.adapter()`; error messages and `getAdapter()` both identify it by this name

#### Implementation of

`IRxDBAdapter.name`

---

### repository\_cache \{#repository_cache\}

```ts
protected readonly repository_cache: Map<EntityType, RepositoryInstance<EntityType>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:349

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`repository_cache`](../../rxdb/classes/RxDBAdapterLocalBase.md#repository_cache)

---

### repository\_map \{#repository_map\}

```ts
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterSqliteBase, RepositoryInstance<EntityType>>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:348

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`repository_map`](../../rxdb/classes/RxDBAdapterLocalBase.md#repository_map)

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:347

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`rxdb`](../../rxdb/classes/RxDBAdapterLocalBase.md#rxdb)

## Accessors

### encryption \{#encryption\}

#### Get Signature

```ts
get encryption(): AdapterEncryptionFacade;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:41

##### Returns

[`AdapterEncryptionFacade`](../../rxdb-adapter-sqlite-core/interfaces/AdapterEncryptionFacade.md)

---

### encryptionContext \{#encryptioncontext\}

#### Get Signature

```ts
get encryptionContext(): EncryptionContext;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:40

##### Returns

[`EncryptionContext`](../../rxdb-adapter-sqlite-core/interfaces/EncryptionContext.md)

---

### tableSet \{#tableset\}

#### Get Signature

```ts
get tableSet(): WorktreeTableSet;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:411

The set of business tables this instance is mounted on (US-314 in-database shadow tables)

##### Remarks

It lives on the RxDB instance ([RxDB.worktreeTableSet](../../rxdb/classes/RxDB.md#worktreetableset-1)); this is just a read-through: an instance is mounted on only one table set at a time,
and if the adapter stored another copy it would be a second source of truth. All SQL reading or writing business tables resolves physical names against it; entities without copies, such as system tables and QueryCache,
always land in the main table set regardless of which set they are mounted on.

##### Returns

[`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`tableSet`](../../rxdb/classes/RxDBAdapterLocalBase.md#tableset)

---

### workingTreeCaptureHook \{#workingtreecapturehook\}

#### Get Signature

```ts
get workingTreeCaptureHook():
  | WorkingTreeCaptureHook
  | undefined;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:379

**`Internal`**

The capture runtime; always `undefined` on databases where commit capability is not enabled.

##### Returns

\| [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md)
\| `undefined`

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`workingTreeCaptureHook`](../../rxdb/classes/RxDBAdapterLocalBase.md#workingtreecapturehook)

---

### workingTreeRawWriteContext \{#workingtreerawwritecontext\}

#### Get Signature

```ts
get workingTreeRawWriteContext(): RawWriteContext;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:402

**`Internal`**

This adapter's current raw-write judgment context (adapter-contract.md §2)

##### Remarks

`rawQuery?()` is an **optional method** on that interface (see `IRxDBAdapter` above), so the core package cannot wrap it for adapters the way it does for the four mount points — the judgment can only be invoked by each adapter's own `rawQuery` implementation calling `gateRawWrite(sql, ctx, …)`.
The `ctx` that call needs is handed out here, so the only thing the six adapters must get right is "passing it to the judgment";
the two questions that are actually easy to get wrong — "how the capability bit is computed" and "where the domain comes from" — never land on them.

The capability bit is determined directly by **whether the capture runtime is installed**, with no separate boolean stored: the runtime is only installed when the bit is true
(`RxDB.connect()` reads true, or `workingTree.enable()` just flipped it). Storing another copy would be a second source of truth,
and the consequence of the two going out of sync is one-directional — the gate thinks it is off and all raw writes pass. The context object itself is built in
`setWorkingTreeCaptureHook()` in the **same assignment** as the runtime, not created anew on each access: the getter is called on every
raw statement, and it holds no per-call state. The two fields only change together in that one place, so "a new runtime was installed but
a closure bound to the old runtime is handed out" is not a reachable state.

What is handed out is the **judgment entry point itself**, not the things the judgment needs to look at (domain, column set, trusted intent). The core therefore does not need to
restate what capture recognizes, and there is no such thing as a duplicated list where "a copy of the domain was made and derived index columns registered later by a plugin only landed in one of the copies" —
the judgment always runs on the copy held by the runtime.

##### Returns

[`RawWriteContext`](../../rxdb/type-aliases/RawWriteContext.md)

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`workingTreeRawWriteContext`](../../rxdb/classes/RxDBAdapterLocalBase.md#workingtreerawwritecontext)

## Methods

### addChangeErrorListener() \{#addchangeerrorlistener\}

```ts
addChangeErrorListener(listener): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:96

Subscribes to change handling failures.

#### Parameters

| Parameter  | Type                                                                                                    | Description                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `listener` | [`SqliteChangeErrorListener`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteChangeErrorListener.md) | Callback that receives [SqliteChangeErrorEvent](../../rxdb-adapter-sqlite-core/interfaces/SqliteChangeErrorEvent.md); exceptions are isolated |

#### Returns

`void`

#### Remarks

As long as a listener is registered, the default `console.error` fallback is handed over to the listener (SQLC-012).

---

### adoptWorktreeEncryption() \{#adoptworktreeencryption\}

```ts
adoptWorktreeEncryption(source): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:83

Adopts the keyring of the main database's adapter (read-only checkout, US-313).

#### Parameters

| Parameter | Type                                                              | Description                               |
| --------- | ----------------------------------------------------------------- | ----------------------------------------- |
| `source`  | [`LocalRxDBAdapter`](../../rxdb/type-aliases/LocalRxDBAdapter.md) | The main database's SQLite-family adapter |

#### Returns

`void`

#### Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) when `source` is not a SQLite-family adapter

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`adoptWorktreeEncryption`](../../rxdb/classes/RxDBAdapterLocalBase.md#adoptworktreeencryption)

---

### assertDisconnectedForDrop() \{#assertdisconnectedfordrop\}

```ts
protected assertDisconnectedForDrop(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:331

Precondition guard for `dropStorage()`: refuses while still connected (read-only checkout reclaims the snapshot database, US-313).

#### Returns

`void`

#### Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) when the adapter is still connected

#### Remarks

`dropStorage()` lives on each concrete adapter rather than here: only they know where the database lives (IndexedDB name, OPFS file name, file on the host),
and a base-class implementation would be inherited as-is by subclasses like Tauri or mini-programs that do not know how to delete.

---

### backup() \{#backup\}

```ts
backup(sink, options?): Promise<RxDBBackupResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:164

Writes the entire database out as a restorable archive.

#### Parameters

| Parameter  | Type                                                              | Description                                          |
| ---------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| `sink`     | `WritableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;     | Output stream; closed on success, aborted on failure |
| `options?` | [`RxDBBackupOptions`](../../rxdb/interfaces/RxDBBackupOptions.md) | Cancellation signal and queueing time limit          |

#### Returns

`Promise`&lt;[`RxDBBackupResult`](../../rxdb/interfaces/RxDBBackupResult.md)&gt;

End marker (entry count, byte count, SHA-256) and manifest; the output stream close has completed

#### Remarks

The archive is a logical dump: all schema statements and row literals, taken on the adapter's serial queue in the same read transaction, so it is consistent with a certain
transaction commit boundary, and data committed in the WAL is all included. **The whole write process holds the database**: while the output stream applies backpressure,
reads and writes during that period queue up. Calling it inside this adapter's transaction callback waits on itself, and reports `lock_timeout` after `lockTimeoutMs`.

The archive contains business tables, system tables, change history, and the keyring's ciphertext; encrypted columns stay ciphertext and do not need to be unlocked;
external files are not included (`scope.externalFiles === 'excluded'`). See each adapter's README for supported storage.

#### Throws

RxDBBackupError `unsupported_combination` / `lock_timeout` / `aborted` / `io_error` / `storage_full`

#### Example

```typescript
const handle = await showSaveFilePicker({ suggestedName: 'notes.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());
console.log(result.sha256);
```

---

### backupStorage() \{#backupstorage\}

```ts
protected backupStorage(): SqliteBackupStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:341

The backup storage backend for the current configuration, determining whether [backup](#backup) / [restore](#restore) can be used and which restore path is taken.

#### Returns

[`SqliteBackupStorage`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteBackupStorage.md)

The storage backend

#### Remarks

The base class does not support it by default; adapters where it has been delivered override it according to their storage options. The persistent backend's `storageKey` is generated by
[persistentBackupStorage](#persistentbackupstorage), guaranteeing the same lock for the same database on both the connection side and the restore side.

---

### bootstrapTransaction() \{#bootstraptransaction\}

```ts
bootstrapTransaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:304

**`Internal`**

Bootstrap-phase transaction: same as [transaction](#transaction), but **skips the readiness gate**.

#### Type Parameters

| Type Parameter                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Description                                                           |
| ----------------- | --------- | --------------------------------------------------------------------- |
| `transactionFun`  | `T`       | Transaction work, whose parameter is the current transaction executor |
| `transactionLog?` | `boolean` | Whether to write the transaction log                                  |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

#### Remarks

Only for the bootstrap chain of `RxDB.connect()` (watermark, table creation, migration) and bootstrap steps inside this class —
they already run inside the promise of `RxDB.connect()`, so waiting on the readiness gate is waiting on themselves.

Tables may not have been created at this point; ordering is guaranteed by the bootstrap chain itself. Do **not** call it inside a transaction body: the facade does not rewrite this method,
so it lands on the real adapter and enqueues again — enqueueing twice while holding a slot hangs permanently.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`bootstrapTransaction`](../../rxdb/classes/RxDBAdapterLocalBase.md#bootstraptransaction)

---

### cacheRowIdEntity() \{#cacherowidentity\}

```ts
cacheRowIdEntity(rowId, entity): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:258

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `rowId`   | `bigint` |
| `entity`  | `any`    |

#### Returns

`void`

---

### canDropStorage()? \{#candropstorage\}

```ts
canDropStorage?(): boolean;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:691

Whether, under the current configuration, [dropStorage](../../rxdb/classes/RxDBAdapterLocalBase.md#dropstorage) can delete this database (asked once before the read-only checkout builds its snapshot database, US-313).

#### Returns

`boolean`

When `false`, `dropStorage()` will necessarily refuse

#### Remarks

Only looks at configuration and does not touch storage. There is no other way to know before building the snapshot: trying a delete first would delete a database whose identity has not been verified yet,
and if the snapshot factory is misconfigured and points at the main database's storage, that would be the main database. And a snapshot database that can be built but not deleted throws on close, and every later reclaim reports an error.

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`canDropStorage`](../../rxdb/classes/RxDBAdapterLocalBase.md#candropstorage)

---

### checkEntityConstraints() \{#checkentityconstraints\}

```ts
checkEntityConstraints(EntityTypes): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:138

Read-only drift check: compares the storage constraints declared in metadata against the actual objects in `sqlite_master` (US-030 AC#10).

#### Parameters

| Parameter     | Type                                                    |
| ------------- | ------------------------------------------------------- |
| `EntityTypes` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Called by the core inside `RxDB.connect()` at the same point as `reconcileEntityIndexes` (after user migrations and
backfilling missing tables). Compares `ck_` CHECK constraints, `uq_` conditional unique indexes, and `ex_` range-exclusion triggers;
throws RxDBConstraintDriftError on mismatch.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`checkEntityConstraints`](../../rxdb/classes/RxDBAdapterLocalBase.md#checkentityconstraints)

---

### cleanAllCache() \{#cleanallcache\}

```ts
cleanAllCache(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:262

#### Returns

`void`

---

### cleanupIncompleteRestore() \{#cleanupincompleterestore\}

```ts
cleanupIncompleteRestore(): Promise<boolean>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:203

Cleans up an unfinished restore (the page closed mid-restore, or cleanup itself failed after a restore failure).

#### Returns

`Promise`&lt;`boolean`&gt;

`true` when residue was actually cleaned up

#### Remarks

Must be called before connecting. If the exclusive lock cannot be acquired it means the target is being connected to or is mid-restore, and it reports `target_busy`;
does nothing when there is no incomplete-restore marker. In-memory storage has no residue to speak of, so it is always `false`.

#### Throws

RxDBBackupError `target_busy` / `unsupported_combination` / `cleanup_pending`

---

### completeBootstrap() \{#completebootstrap\}

```ts
completeBootstrap(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:129

**`Internal`**

Closes the **bootstrap window**: called once after `RxDB.connect()` finishes creating tables.

#### Returns

`void`

#### Remarks

Adapters with a built-in readiness gate (SQLite family / PGlite) let `query()` / `rawQuery()` /
`createTables()` skip the gate during the bootstrap window — the gate is waiting for exactly the `RxDB.connect()` that has not settled yet.
This method flips the state to `ready`; from then on all entry points take the normal readiness wait.
Adapters without a readiness gate keep the default no-op implementation.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`completeBootstrap`](../../rxdb/classes/RxDBAdapterLocalBase.md#completebootstrap)

---

### connect() \{#connect\}

```ts
connect(): Promise<IRxDBAdapter>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:128

Establishes the connection and brings the system tables up to the current watermark.

#### Returns

`Promise`&lt;[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)&gt;

Itself, for chaining

#### Remarks

Table creation and system migration both happen here (see `isCurrentRxDBSystemVersion`), so it can be slow,
and it can throw `UnsupportedRxDBSystemVersionError` when the database is newer than this process.

#### Implementation of

`IRxDBAdapter.connect`

---

### createClient() \{#createclient\}

```ts
abstract protected createClient(): Promise<SqliteClientLike>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:39

Creates or acquires the SQLite client.
Concrete adapters implement this method with their own backend's logic.

#### Returns

`Promise`&lt;[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)&gt;

---

### createRestoreTargetClient() \{#createrestoretargetclient\}

```ts
protected createRestoreTargetClient(): Promise<SqliteClientLike>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:370

Opens the target connection used for restore or cleanup.

#### Returns

`Promise`&lt;[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)&gt;

A new connection to the target database

#### Remarks

The default is just [createClient](#createclient): a browser backend's database is only opened in same-origin contexts, and the exclusive Web Lock acquired before restore
already blocks all other connections. Backends whose database file can also be opened by other processes (desktop hosts) override it, making this connection
hold the underlying storage exclusively until disconnect, so that nobody else can connect from the empty-state check until restore finishes.

---

### createTables() \{#createtables\}

```ts
createTables<T>(EntityTypes, entities?): Promise<boolean>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:208

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-1"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter     | Type                        |
| ------------- | --------------------------- |
| `EntityTypes` | `T`[]                       |
| `entities?`   | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`createTables`](../../rxdb/classes/RxDBAdapterLocalBase.md#createtables)

---

### createUncachedRepository() \{#createuncachedrepository\}

```ts
createUncachedRepository<T>(EntityType, host): IRepository<T>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:127

**`Internal`**

Creates a new repository bound to `host`, **without writing** into `repository_cache`.

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-2"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter    | Type                    | Description                                                                       |
| ------------ | ----------------------- | --------------------------------------------------------------------------------- |
| `EntityType` | `T`                     | Entity type                                                                       |
| `host`       | `RxDBAdapterSqliteBase` | Adapter the repository binds to (in transaction scenarios, the executor's facade) |

#### Returns

[`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

#### Remarks

Used by [SqliteTransactionExecutor.getRepository](../../rxdb-adapter-sqlite-core/classes/SqliteTransactionExecutor.md#getrepository). The reason the cache must be bypassed: repositories in the cache
have the same lifetime as the adapter; if a transaction-scoped repository were written into it, after the transaction ends it would still sit in the cache pointing at a
committed/rolled-back transaction context, and later **external** writes would land on it.

---

### createWorktreeTableSet() \{#createworktreetableset\}

```ts
createWorktreeTableSet(
   executor,
   tableSet,
   seed
): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:220

Creates and seeds a table set for a writable checkout inside the caller's transaction (US-314 B1.5); see `worktree/worktree-table-set.ts` for the approach.

#### Parameters

| Parameter  | Type                                                                    | Description                                                                                   |
| ---------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)   | Executor of a transaction on this adapter                                                     |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)            | The table set to create; members are decided by the caller (entities in the versioned domain) |
| `seed`     | [`WorktreeTableSetSeed`](../../rxdb/interfaces/WorktreeTableSetSeed.md) | Holds the branches and the increments to apply on top                                         |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) when given the main table set, when a member does not record change history, when an increment falls outside the table set, or when the main table is missing columns

#### Remarks

Does not write the holder key: the checkout-opening flow writes it itself in the same transaction. The main table set is created together with database creation ([RxDBAdapterSqliteBase.createTables](#createtables)), not through here.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`createWorktreeTableSet`](../../rxdb/classes/RxDBAdapterLocalBase.md#createworktreetableset)

---

### deleteByIds() \{#deletebyids\}

```ts
deleteByIds(entityName, ids): Observable<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:321

Bulk delete by ID list (QueryCache only)

Used to clean up data that has been deleted remotely from the local cache.

#### Parameters

| Parameter    | Type       | Description           |
| ------------ | ---------- | --------------------- |
| `entityName` | `string`   | Entity name           |
| `ids`        | `string`[] | List of IDs to delete |

#### Returns

`Observable`&lt;`void`&gt;

`Observable<void>`

#### Example

```typescript
adapter.deleteByIds('Product', ['p1', 'p2']).subscribe();
```

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`deleteByIds`](../../rxdb/classes/RxDBAdapterLocalBase.md#deletebyids)

---

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:139

Disconnects and releases the underlying handles.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Unlike `RxDB.destroy()`, disconnecting is **reversible**: the same adapter instance can `connect()` again later.
Implementations must be idempotent — calling while not connected is a no-op, not an error.

#### Implementation of

`IRxDBAdapter.disconnect`

---

### dropStorage()? \{#dropstorage\}

```ts
dropStorage?(): Promise<void>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:681

Permanently deletes this adapter's persistent storage for this database (read-only checkout reclaims the snapshot database, US-313).

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

Throws while this adapter is still connected: disconnect first, then delete

#### Remarks

The storage location is derived the same way as at connection time (`rxdb.config.dbName` plus adapter options); does nothing when the database does not exist.
An in-memory database disappears on disconnect, so this is a no-op here too. Deleted data cannot be recovered: callers must first confirm no other context is still using this database.

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`dropStorage`](../../rxdb/classes/RxDBAdapterLocalBase.md#dropstorage)

---

### dropWorktreeTableSet() \{#dropworktreetableset\}

```ts
dropWorktreeTableSet(executor, tableSet): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:231

Drops a writable checkout's table set inside the caller's transaction (US-314 B1.5): finds them by the catalog, removes triggers first, then drops tables.

#### Parameters

| Parameter  | Type                                                                  | Description                               |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | Executor of a transaction on this adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)          | The table set to drop                     |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) when given the main table set

#### Remarks

The holder keys on the branch tables are not released here; the checkout-closing flow releases them itself in the same transaction.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`dropWorktreeTableSet`](../../rxdb/classes/RxDBAdapterLocalBase.md#dropworktreetableset)

---

### emitChangeError() \{#emitchangeerror\}

```ts
emitChangeError(event): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:112

Reports a change handling failure.

#### Parameters

| Parameter | Type                                                                                            | Description     |
| --------- | ----------------------------------------------------------------------------------------------- | --------------- |
| `event`   | [`SqliteChangeErrorEvent`](../../rxdb-adapter-sqlite-core/interfaces/SqliteChangeErrorEvent.md) | Failure details |

#### Returns

`void`

#### Remarks

Called by the change handling pipeline (`handle_rxdb_change`), not for application code. This method **never throws**:
the path it sits on has no caller that could catch an exception; throwing would just become an unhandled rejection.

---

### getEntityByRowId() \{#getentitybyrowid\}

```ts
getEntityByRowId(rowId, EntityType): any;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:260

#### Parameters

| Parameter    | Type                                                  |
| ------------ | ----------------------------------------------------- |
| `rowId`      | `bigint`                                              |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Returns

`any`

---

### getMetadataByIds() \{#getmetadatabyids\}

```ts
getMetadataByIds(entityName, ids): Observable<Map<string, string>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:319

Gets the metadata of a given ID list (QueryCache only)

Used for local cache freshness checks; returns an ID → updatedAt map.

#### Parameters

| Parameter    | Type       | Description    |
| ------------ | ---------- | -------------- |
| `entityName` | `string`   | Entity name    |
| `ids`        | `string`[] | Entity ID list |

#### Returns

`Observable`&lt;`Map`&lt;`string`, `string`&gt;&gt;

`Observable<Map<string, string>>` - ID → updatedAt map

#### Example

```typescript
adapter.getMetadataByIds('Product', ['p1', 'p2']).subscribe(map => {
  // map: Map `{ 'p1' => '2026-01-12T10:00:00Z', 'p2' => '2026-01-12T09:30:00Z' }`
});
```

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`getMetadataByIds`](../../rxdb/classes/RxDBAdapterLocalBase.md#getmetadatabyids)

---

### getRepository() \{#getrepository\}

```ts
getRepository<T, RT>(EntityType): RT;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:113

#### Type Parameters

| Type Parameter                                                                                      | Default type                                                    |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| <a id="type-parameter-t-3"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) | -                                                               |
| <a id="type-parameter-rt"></a> `RT`                                                                 | [`SqliteRepository`](../classes/SqliteRepository.md)&lt;`T`&gt; |

#### Parameters

| Parameter    | Type |
| ------------ | ---- |
| `EntityType` | `T`  |

#### Returns

`RT`

#### Implementation of

`IRxDBAdapter.getRepository`

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`getRepository`](../../rxdb/classes/RxDBAdapterLocalBase.md#getrepository)

---

### getRowIdByEntity() \{#getrowidbyentity\}

```ts
getRowIdByEntity(entity): bigint | undefined;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:261

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `entity`  | `any` |

#### Returns

`bigint` \| `undefined`

---

### getRxDBChangeSequence() \{#getrxdbchangesequence\}

```ts
getRxDBChangeSequence(): Promise<number>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:317

#### Returns

`Promise`&lt;`number`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`getRxDBChangeSequence`](../../rxdb/classes/RxDBAdapterLocalBase.md#getrxdbchangesequence)

---

### importWorktreeSnapshot() \{#importworktreesnapshot\}

```ts
importWorktreeSnapshot(snapshot): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:76

Writes rows and increments read from the main database into this database (read-only checkout builds a snapshot, US-313).

#### Parameters

| Parameter  | Type                                                                        | Description                                       |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------- |
| `snapshot` | [`WorktreeSnapshotImport`](../../rxdb/interfaces/WorktreeSnapshotImport.md) | Tables to copy and the increments to apply on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) when this database has a capture runtime installed

#### Remarks

One transaction, no event dispatch: entities on the snapshot instance are all `log: false`, so there is no change history to derive events from.
The increments use the same SQL generation as branch switching, except that encrypted columns pass through as envelopes.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`importWorktreeSnapshot`](../../rxdb/classes/RxDBAdapterLocalBase.md#importworktreesnapshot)

---

### internalQuery() \{#internalquery\}

```ts
internalQuery(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:316

#### Parameters

| Parameter   | Type                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `sql`       | `string`                                                                                        |
| `bindings?` | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md)&gt;

---

### isEncryptedAtRest() \{#isencryptedatrest\}

```ts
isEncryptedAtRest(value): boolean;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:55

Determines whether a stored value is already in the encrypted at-rest form (FR-038).

#### Parameters

| Parameter | Type      | Description                |
| --------- | --------- | -------------------------- |
| `value`   | `unknown` | Value in the stored column |

#### Returns

`boolean`

`true` when it is an envelope string

#### Remarks

There is only one authoritative judge — `isEnvelope` from `@aiao/rxdb-adapter-encrypted`. This method is
a one-line forward from that optional slot on the core ([RxDBAdapterLocalBase.isEncryptedAtRest](../../rxdb/classes/RxDBAdapterLocalBase.md#isencryptedatrest)),
not a second shape recognition here. `@aiao/rxdb` cannot depend on the encryption package (the dependency direction is reversed), so this one line
can only live on the adapter side.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`isEncryptedAtRest`](../../rxdb/classes/RxDBAdapterLocalBase.md#isencryptedatrest)

---

### isTableExisted() \{#istableexisted\}

```ts
isTableExisted<T>(EntityType): Promise<boolean>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:207

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-4"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter    | Type |
| ------------ | ---- |
| `EntityType` | `T`  |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Implementation of

`IRxDBAdapter.isTableExisted`

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`isTableExisted`](../../rxdb/classes/RxDBAdapterLocalBase.md#istableexisted)

---

### listWorktreeTableSetSuffixes() \{#listworktreetablesetsuffixes\}

```ts
listWorktreeTableSetSuffixes(executor): Promise<readonly string[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:238

Lists existing writable checkout table sets via the catalog (US-314 B2.6): which set each table whose name ends in `$<suffix>` belongs to.

#### Parameters

| Parameter  | Type                                                                  | Description                               |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | Executor of a transaction on this adapter |

#### Returns

`Promise`&lt;readonly `string`[]&gt;

Table set suffixes, sorted and deduplicated; does not count when a configured entity's main table happens to have exactly this shape

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`listWorktreeTableSetSuffixes`](../../rxdb/classes/RxDBAdapterLocalBase.md#listworktreetablesetsuffixes)

---

### mergeChanges() \{#mergechanges\}

```ts
mergeChanges(
   actions,
   localChanges?,
   disableTriggers?
): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:257

Applies compressed changes to local entity tables

Implementation strategy (SQLite):

1. Convert actions into SQL operations
2. In a transaction:
   a) Execute the SQL operations on entity tables (INSERT/UPDATE/DELETE)
   b) Bulk-insert localChanges into the RxDBChange table (for history tracking)
3. Dispatch local events to notify the UI to update

#### Parameters

| Parameter          | Type                                                                     | Description                                                                               |
| ------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `actions`          | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md)  | Compressed change operation set (pulled from remote)                                      |
| `localChanges?`    | `Omit`&lt;[`RxDBChange`](../../rxdb/classes/RxDBChange.md), `"id"`&gt;[] | Records to save into the local RxDBChange table (optional)                                |
| `disableTriggers?` | `boolean`                                                                | Whether to disable triggers (used for operations like pull, to avoid creating RxDBChange) |

#### Returns

`Promise`&lt;`void`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`mergeChanges`](../../rxdb/classes/RxDBAdapterLocalBase.md#mergechanges)

---

### migrateSystemSchema() \{#migratesystemschema\}

```ts
migrateSystemSchema(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:239

Upgrades the tables owned by RxDB before application migrations or repository operations run.
Adapters that do not need to persist system schema state keep the default no-op implementation.

#### Returns

`Promise`&lt;`void`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`migrateSystemSchema`](../../rxdb/classes/RxDBAdapterLocalBase.md#migratesystemschema)

---

### mutations() \{#mutations\}

```ts
mutations<T>(options): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:206

Bulk-modifies entities (create/update/delete)

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-5"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type                                                                       |
| --------- | -------------------------------------------------------------------------- |
| `options` | [`RxDBMutationsMap`](../../rxdb/interfaces/RxDBMutationsMap.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Implementation of

`IRxDBAdapter.mutations`

---

### persistentBackupStorage() \{#persistentbackupstorage\}

```ts
protected persistentBackupStorage(label): SqliteBackupStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:348

Generates the description of a persistent storage backend.

#### Parameters

| Parameter | Type     | Description                                                 |
| --------- | -------- | ----------------------------------------------------------- |
| `label`   | `string` | Storage name written into the manifest, e.g. `idb` / `opfs` |

#### Returns

[`SqliteBackupStorage`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteBackupStorage.md)

Persistent backend whose `storageKey` is `<adapter>:<label>:<dbName>`

---

### physicalTableNames() \{#physicaltablenames\}

```ts
physicalTableNames(metadata): readonly string[];
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:255

The SQLite family folds the namespace into the table name: `public$todos`.

#### Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |

#### Returns

readonly `string`[]

The logical name (the base class's one) plus the name this family actually creates

#### Remarks

The entire point of the override is **having a single copy of the rules**: the name comes from get\_table\_name\_by\_metadata,
the same function used by table creation, queries, and triggers. Before this, the versioned domain of `@aiao/rxdb-plugin-working-tree`
assembled its own copy by splitting on `'$'`; when the assembly changes, that copy does not error — it just stops recognizing the table, and
the raw-write gate silently lets it through.

Keep the logical name from the base class instead of returning only the folded name: the raw judgment would rather **recognize one extra** name — recognizing more just blocks
one more statement that would not run on this backend anyway; the one it fails to recognize is exactly the name a capture-bypassing write would use.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`physicalTableNames`](../../rxdb/classes/RxDBAdapterLocalBase.md#physicaltablenames)

---

### query() \{#query\}

```ts
query(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:269

#### Parameters

| Parameter   | Type                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `sql`       | `string`                                                                                        |
| `bindings?` | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md)&gt;

---

### rawQuery() \{#rawquery\}

```ts
rawQuery(sql, params?): Promise<RawQueryResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:287

Raw SQL.

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `sql`     | `string`    |
| `params?` | `unknown`[] |

#### Returns

`Promise`&lt;[`RawQueryResult`](../../rxdb/interfaces/RawQueryResult.md)&gt;

#### Remarks

**The judgment is produced by the core package; this is only where it gets wired in** (adapter-contract.md §2). `rawQuery?()` is
an optional method on `IRxDBAdapter`, so the core package cannot wrap it for adapters the way it does for the four capture mount points; therefore this one
`gateRawWrite` call is the only place this class must get right. The judgment itself is not restated here by a single word — if any one of the six implementations
wrote lexical normalization loosely, the whole defense would have a hole, and that hole would never show up in any backend's own tests.

This one line covers the **5 v1 adapters** (wa-sqlite / sqlite-wasm / sqlite / sqliteai / electron):
they all inherit this class and none overrides `rawQuery`. Writing it once in each of the five subclasses is a form T064 "do not write one per adapter" explicitly rules out;
if some subclass ever really overrides `rawQuery`, it must wire it in itself, which is backstopped by T068's 6 consistency call sites.

Registered business tables are rejected before the transaction opens; calls that would have been allowed re-read the physical catalog inside the executing transaction and pass the same gate again,
to avoid missing shadow tables created by another instance. Both judgments happen before the business statement is issued. Original behavior is kept when no capture is installed during the bootstrap window.

#### Implementation of

`IRxDBAdapter.rawQuery`

---

### readWorktreeSnapshotPage() \{#readworktreesnapshotpage\}

```ts
readWorktreeSnapshotPage(
   executor,
   EntityType,
   after,
   limit
): Promise<WorktreeSnapshotPage>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:65

Reads one page of storage-form rows (read-only checkout builds a snapshot, US-313).

#### Parameters

| Parameter    | Type                                                                                       | Description                                                    |
| ------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `executor`   | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)                      | Executor of the main database's transaction                    |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)                                      | Entity class on the main instance                              |
| `after`      | \| [`WorktreeSnapshotCursor`](../../rxdb/type-aliases/WorktreeSnapshotCursor.md) \| `null` | Cursor from the previous page; `null` reads from the beginning |
| `limit`      | `number`                                                                                   | Maximum rows on this page                                      |

#### Returns

`Promise`&lt;[`WorktreeSnapshotPage`](../../rxdb/interfaces/WorktreeSnapshotPage.md)&gt;

Rows of raw SQLite values, paginated by rowid

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`readWorktreeSnapshotPage`](../../rxdb/classes/RxDBAdapterLocalBase.md#readworktreesnapshotpage)

---

### ready() \{#ready\}

```ts
protected ready(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:385

The readiness gate: **must be called before acquiring a queue slot, never inside a queue task**.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Queue concurrency is 1. Waiting for `RxDB.connect()` inside the critical section forms a cycle: the first-install path of `RxDB.connect()` relies on
the watermark transaction behind it in the queue to complete, and that transaction can never get the occupied slot (see design doc §1.2 for the measured trace).

The gate waits for the **whole `RxDB.connect()`**, not "whether this adapter's client is connected". Between the two lie table creation,
system migration, and the watermark; the gate once admitted by client state, so external writes arriving in that window landed directly on tables that did not exist yet
(`no such table`). `RxDB.connect()` itself caches its promise by name, so when it has completed this is just one extra
microtask hop.

The bootstrap chain itself must **not** go through this gate (that is waiting on itself); it always goes via [bootstrapTransaction](#bootstraptransaction).

---

### reconcileEntityIndexes()? \{#reconcileentityindexes\}

```ts
reconcileEntityIndexes ? EntityTypes : Promise<void>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:611

Idempotently reconciles entity indexes after user migrations and backfilling missing tables.

#### Parameters

| Parameter     | Type                                                    |
| ------------- | ------------------------------------------------------- |
| `EntityTypes` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`reconcileEntityIndexes`](../../rxdb/classes/RxDBAdapterLocalBase.md#reconcileentityindexes)

---

### removeCacheEntity() \{#removecacheentity\}

```ts
removeCacheEntity(entity): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:259

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `entity`  | `any` |

#### Returns

`void`

---

### removeChangeErrorListener() \{#removechangeerrorlistener\}

```ts
removeChangeErrorListener(listener): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:102

Cancels the subscription from [addChangeErrorListener](#addchangeerrorlistener).

#### Parameters

| Parameter  | Type                                                                                                    | Description                                        |
| ---------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `listener` | [`SqliteChangeErrorListener`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteChangeErrorListener.md) | The same function reference passed at registration |

#### Returns

`void`

---

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:205

Bulk-deletes entities.

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-6"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        |
| ---------- | --------------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The deleted entities

#### Implementation of

`IRxDBAdapter.removeMany`

---

### repository() \{#repository\}

```ts
protected repository<RT>(repositoryName, RepositoryClass): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:352

#### Type Parameters

| Type Parameter                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-rt-1"></a> `RT` _extends_ [`RepositoryInstance`](../../rxdb/interfaces/RepositoryInstance.md)&lt;[`EntityType`](../../rxdb/type-aliases/EntityType.md)&gt; |

#### Parameters

| Parameter         | Type                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `repositoryName`  | `string`                                                                                                                       |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterSqliteBase`, `RT`&gt; |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`repository`](../../rxdb/classes/RxDBAdapterLocalBase.md#repository)

---

### restore() \{#restore\}

```ts
restore(source, options?): Promise<RxDBRestoreResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:192

Restores an archive produced by [backup](#backup) into this adapter's configured empty storage.

#### Parameters

| Parameter  | Type                                                                                        | Description                             |
| ---------- | ------------------------------------------------------------------------------------------- | --------------------------------------- |
| `source`   | `ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;                               | Archive byte stream                     |
| `options?` | [`SqliteRestoreOptions`](../../rxdb-adapter-sqlite-core/interfaces/SqliteRestoreOptions.md) | Cancellation signal and stage callbacks |

#### Returns

`Promise`&lt;[`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md)&gt;

End marker and manifest

#### Remarks

Must be called before `rxdb.connect()` (get the not-yet-connected instance via `rxdb.getAdapter(name)`): when already connected or mid-restore it
reports `target_busy`. Only writes into an **empty** target; compatibility (adapter, engine major version, virtual table modules, system table / change encoding version,
entity schema fingerprint, encryption auth domain) is determined before the first statement is written, and the commit only happens after everything checks out.

- Persistent storage: after restore completes, just `rxdb.connect()` normally; if the page is closed mid-restore, later connections report `restore_incomplete`,
  requiring [cleanupIncompleteRestore](#cleanupincompleterestore) first.
- In-memory storage: the restored database only lives in this instance and is taken over by the next `rxdb.connect()`; if not connecting, [disconnect](#disconnect) releases it.

Restored rows produce no change history; encrypted databases stay locked. The input stream is cancelled on failure, and only the read lock is released on success.

#### Throws

RxDBBackupError see RxDBBackupErrorCode; `cleanup_pending` means even the cleanup after the failure did not finish

#### Example

```typescript
rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS' }));
const adapter = await rxdb.getAdapter('wa-sqlite');
await adapter.restore(file.stream());
await rxdb.connect('wa-sqlite');
```

---

### runInTransaction() \{#runintransaction\}

```ts
runInTransaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:315

Executes transaction work.

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-7"></a> `T` _extends_ [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Description                                                           |
| ----------------- | --------- | --------------------------------------------------------------------- |
| `transactionFun`  | `T`       | Transaction work, whose parameter is the current transaction executor |
| `transactionLog?` | `boolean` | -                                                                     |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The transaction work's return value

#### Remarks

The real adapter entry always opens a new transaction; the executor facade maps `runInTransaction()` inside a transaction to
`executor.run()`, reusing the current transaction without enqueueing again.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`runInTransaction`](../../rxdb/classes/RxDBAdapterLocalBase.md#runintransaction)

---

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:204

Bulk-writes entities (inserts when absent, updates when present).

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-8"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        |
| ---------- | --------------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

Entities after landing in the database; fields backfilled by the database, such as primary keys and database-side defaults, only have values here

#### Implementation of

`IRxDBAdapter.saveMany`

---

### sealWorktreeReadOnly() \{#sealworktreereadonly\}

```ts
sealWorktreeReadOnly(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:87

Seals this database read-only (read-only checkout, US-313): from then on, write statements on this connection are rejected by SQLite.

#### Returns

`Promise`&lt;`void`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`sealWorktreeReadOnly`](../../rxdb/classes/RxDBAdapterLocalBase.md#sealworktreereadonly)

---

### setRxDBChangeSequence() \{#setrxdbchangesequence\}

```ts
setRxDBChangeSequence(sequence): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:318

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `sequence` | `number` |

#### Returns

`Promise`&lt;`void`&gt;

---

### settleRepositoryTransaction() \{#settlerepositorytransaction\}

```ts
protected settleRepositoryTransaction(executor, committed): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:793

Commits or rolls back the entity state of public repositories; must be called before handing the transaction queue back.

#### Parameters

| Parameter   | Type                                                                  |
| ----------- | --------------------------------------------------------------------- |
| `executor`  | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) |
| `committed` | `boolean`                                                             |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`settleRepositoryTransaction`](../../rxdb/classes/RxDBAdapterLocalBase.md#settlerepositorytransaction)

---

### setWorkingTreeCaptureHook() \{#setworkingtreecapturehook\}

```ts
setWorkingTreeCaptureHook(hook): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:429

**`Internal`**

Installs or uninstalls the capture runtime (the four mount points of adapter-contract.md §1).

#### Parameters

| Parameter | Type                                                                                          | Description                                                           |
| --------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `hook`    | \| [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md) \| `undefined` | Runtime that takes over the four mount points; `undefined` uninstalls |

#### Returns

`void`

#### Remarks

The mount lives **here** instead of having each of the six adapters insert a line in its own `transaction()`: writing it one time fewer,
or one moment later (validating the token only after the business write), would be discoverable by nothing — and that is exactly the form §2 "the judgment implementation has only
one copy" exists to rule out.

The callers are `RxDB.connect()` (after confirming the capability bit is true) and `workingTree.enable()` (after the bit flip succeeds).
On a database where it is not enabled, this is never called once, so the four write primitives do not even have one layer of forwarding.

Idempotent: if already installed, it uninstalls first and then installs, never stacking two layers.

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`setWorkingTreeCaptureHook`](../../rxdb/classes/RxDBAdapterLocalBase.md#setworkingtreecapturehook)

---

### shadowTablesWritable() \{#shadowtableswritable\}

```ts
protected shadowTablesWritable(): boolean;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:359

Whether this backend can write the shadow tables of virtual tables (FTS5's `_data`, `_idx`, etc.).

#### Returns

`boolean`

`true` when writable

#### Remarks

The archive stores shadow tables row by row as-is, and restore must rewrite whole tables. Default is yes; backends that run SQLite in defensive mode cannot modify shadow tables,
so they override to `false`: both backup and restore of a database containing shadow tables report `unsupported_combination`, instead of producing an archive they cannot restore themselves,
or failing halfway through the write.

---

### sharedClientLockName() \{#sharedclientlockname\}

```ts
protected sharedClientLockName(): string | undefined;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:396

Web Lock name for cross-tab transaction serialization when the client is shared by multiple tabs; returns `undefined` (the default) when not shared.

#### Returns

`string` \| `undefined`

Lock name; adapters on the same shared connection must give the same name

#### Remarks

Under SharedWorker transport, each tab's adapter only serializes its own queue: while one tab's transaction is open, another tab's statements fall into
that transaction (US-314 B2.3b, fix for main). With a lock name, every queued task runs inside this lock; on acquiring the lock it first rolls back the transaction left by a dead tab
([SqliteClientLike.rollbackOrphanTransaction](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#rollbackorphantransaction)), and disconnect changes to releasing only one's own share ([SqliteClientLike.release](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#release)).

---

### switchBranch() \{#switchbranch\}

```ts
switchBranch(options): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:256

#### Parameters

| Parameter | Type                                                                  |
| --------- | --------------------------------------------------------------------- |
| `options` | [`SwitchBranchOptions`](../../rxdb/interfaces/SwitchBranchOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`switchBranch`](../../rxdb/classes/RxDBAdapterLocalBase.md#switchbranch)

---

### transaction() \{#transaction\}

```ts
transaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:288

Reads and writes within the same transaction via the executor.

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-9"></a> `T` _extends_ [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Description                                  |
| ----------------- | --------- | -------------------------------------------- |
| `transactionFun`  | `T`       | Callback holding this transaction's executor |
| `transactionLog?` | `boolean` | Whether to record the transaction log        |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The callback's result

#### Remarks

An `entity.save()` that does not hold an executor enqueues again. Awaiting it inside the transaction callback waits on itself, and the transaction cannot end.
Inside a transaction use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository); for saving entity instances see [EntityBase.save](../../rxdb/classes/EntityBase.md#save).

#### Examples

```ts
// ✅ Get the repository via the executor; all reads and writes belong to this transaction.
await adapter.transaction(async executor => {
  const repository = executor.getRepository(Note);
  const note = adapter.rxdb.entityManager.instantiate(Note);
  note.label = 'ready';
  const created = await repository.create(note);
  await repository.update(created, { label: 'done' });
  await repository.find({ where: { combinator: 'and', rules: [] } });
});
```

```ts
// ❌ The entity instance does not hold an executor; save() enqueues again and waits for the current transaction to end.
await adapter.transaction(async () => {
  await entity.save();
});
```

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`transaction`](../../rxdb/classes/RxDBAdapterLocalBase.md#transaction)

---

### transactionalRepository() \{#transactionalrepository\}

```ts
protected transactionalRepository<T, R>(EntityType, repository): R;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:795

Puts a public repository's whole operation into a transaction; not called when the executor creates repositories.

#### Type Parameters

| Type Parameter                                                                                       |
| ---------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-10"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |
| <a id="type-parameter-r"></a> `R` _extends_ `object`                                                 |

#### Parameters

| Parameter    | Type |
| ------------ | ---- |
| `EntityType` | `T`  |
| `repository` | `R`  |

#### Returns

`R`

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`transactionalRepository`](../../rxdb/classes/RxDBAdapterLocalBase.md#transactionalrepository)

---

### upsertMany() \{#upsertmany\}

```ts
upsertMany<T>(entityName, data): Observable<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:320

Bulk upserts data (QueryCache only)

Executes INSERT OR REPLACE semantics, for caching data fetched from remote.

#### Type Parameters

| Type Parameter                       |
| ------------------------------------ |
| <a id="type-parameter-t-11"></a> `T` |

#### Parameters

| Parameter    | Type     | Description           |
| ------------ | -------- | --------------------- |
| `entityName` | `string` | Entity name           |
| `data`       | `T`[]    | List of data to write |

#### Returns

`Observable`&lt;`void`&gt;

`Observable<void>`

#### Example

```typescript
adapter.upsertMany('Product', [product1, product2]).subscribe();
```

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`upsertMany`](../../rxdb/classes/RxDBAdapterLocalBase.md#upsertmany)

---

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:140

Version number of the underlying database engine (e.g. SQLite's `3.45.0`), for diagnostics and capability detection.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Unrelated to the system table watermark (`RXDB_SYSTEM_SCHEMA_VERSION`), which is RxDB's own number.

#### Implementation of

`IRxDBAdapter.version`

---

### worktreeTableSetMounted() \{#worktreetablesetmounted\}

```ts
worktreeTableSetMounted(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:268

**`Internal`**

Clears the row id cache after this instance remounts onto a different table set (US-314 B1.4): row ids are recorded per physical table, and on a different table set the same row id refers to a different row.

#### Returns

`void`

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`worktreeTableSetMounted`](../../rxdb/classes/RxDBAdapterLocalBase.md#worktreetablesetmounted)

---

### writeQuery() \{#writequery\}

```ts
writeQuery(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:270

#### Parameters

| Parameter   | Type                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `sql`       | `string`                                                                                        |
| `bindings?` | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md)&gt;
