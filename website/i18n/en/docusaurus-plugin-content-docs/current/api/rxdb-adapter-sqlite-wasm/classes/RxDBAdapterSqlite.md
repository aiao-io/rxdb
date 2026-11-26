# RxDBAdapterSqlite

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts#L21)

Browser @subframe7536/sqlite-wasm adapter.

Reuses the capabilities provided by [RxDBAdapterSqliteBase](../interfaces/RxDBAdapterSqliteBase.md) (DDL / repository proxying / change dispatch),
and only injects sqlite-wasm's
[createSqliteClient](../functions/createSqliteClient.md) and VFS loading logic at [RxDBAdapterSqlite.createClient](#createclient).

## Extends

- [`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md)

## Constructors

### Constructor

```ts
new RxDBAdapterSqlite(rxdb, options): RxDBAdapterSqlite;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts#L28)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |
| `options` | [`SqliteOptions`](../interfaces/SqliteOptions.md) |

#### Returns

`RxDBAdapterSqlite`

#### Overrides

`RxDBAdapterSqliteBase.constructor`

## Properties

### clientOwner \{#clientowner\}

```ts
protected readonly clientOwner: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:33

This adapter's owner key on the client: handed to the client on `init` in `createClient()`, and carried when registering listeners and when returning them on disconnect (US-314 B2.3b).

#### Remarks

Inside a SharedWorker there is only one client, and every tab's adapter connects to it; on disconnect this key returns only its own share and removes only its own listeners
([SqliteClientLike.release](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#release)). Backends that do not share a client can ignore it.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`clientOwner`](../interfaces/RxDBAdapterSqliteBase.md#clientowner)

***

### name \{#name\}

```ts
readonly name: string = ADAPTER_NAME;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts#L26)

Adapter name, the same value as the key used when registering with `RxDB.adapter()`; error messages and `getAdapter()` both identify adapters by it

#### Overrides

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`name`](../interfaces/RxDBAdapterSqliteBase.md#name)

***

### options \{#options\}

```ts
readonly options: SqliteOptions;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts#L30)

***

### repository\_cache \{#repository_cache\}

```ts
protected readonly repository_cache: Map<EntityType, RepositoryInstance<EntityType>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:349

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`repository_cache`](../interfaces/RxDBAdapterSqliteBase.md#repository_cache)

***

### repository\_map \{#repository_map\}

```ts
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterSqlite, RepositoryInstance<EntityType>>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:348

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`repository_map`](../interfaces/RxDBAdapterSqliteBase.md#repository_map)

***

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:347

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`rxdb`](../interfaces/RxDBAdapterSqliteBase.md#rxdb)

## Accessors

### encryption \{#encryption\}

#### Get Signature

```ts
get encryption(): AdapterEncryptionFacade;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:41

##### Returns

[`AdapterEncryptionFacade`](../../rxdb-adapter-sqlite-core/interfaces/AdapterEncryptionFacade.md)

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`encryption`](../interfaces/RxDBAdapterSqliteBase.md#encryption)

***

### encryptionContext \{#encryptioncontext\}

#### Get Signature

```ts
get encryptionContext(): EncryptionContext;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:40

##### Returns

[`EncryptionContext`](../../rxdb-adapter-sqlite-core/interfaces/EncryptionContext.md)

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`encryptionContext`](../interfaces/RxDBAdapterSqliteBase.md#encryptioncontext)

***

### tableSet \{#tableset\}

#### Get Signature

```ts
get tableSet(): WorktreeTableSet;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:411

The set of business tables this instance is mounted on (US-314 in-database shadow tables)

##### Remarks

Stored on the RxDB instance ([RxDB.worktreeTableSet](../../rxdb/classes/RxDB.md#worktreetableset-1)); this only relays the read: an instance is mounted on exactly one table set at a time,
and if the adapter stored another copy that would be a second source of truth. SQL that reads or writes business tables resolves physical names through it; entities without replicas, such as system tables and QueryCache,
always land in the primary table set regardless of which set they are mounted on.

##### Returns

[`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`tableSet`](../interfaces/RxDBAdapterSqliteBase.md#tableset)

***

### workingTreeCaptureHook \{#workingtreecapturehook\}

#### Get Signature

```ts
get workingTreeCaptureHook(): 
  | WorkingTreeCaptureHook
  | undefined;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:379

**`Internal`**

The capture runtime; always `undefined` on databases without commit capability enabled.

##### Returns

  \| [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md)
  \| `undefined`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`workingTreeCaptureHook`](../interfaces/RxDBAdapterSqliteBase.md#workingtreecapturehook)

***

### workingTreeRawWriteContext \{#workingtreerawwritecontext\}

#### Get Signature

```ts
get workingTreeRawWriteContext(): RawWriteContext;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:402

**`Internal`**

This adapter's current raw-write judgment context (adapter-contract.md §2)

##### Remarks

`rawQuery?()` is an **optional method** on this interface (see `IRxDBAdapter` above), so the core package cannot wrap it on behalf of adapters the way it does the four mount points — the judgment can only be invoked by each adapter's own `rawQuery` implementation calling `gateRawWrite(sql, ctx, …)`.
The `ctx` that call needs is handed out here, so the only thing six adapters need to get right is that one line of "forward it to the judgment";
the two genuinely error-prone questions — "how is the capability bit computed" and "where does the domain come from" — never land on them at all.

The capability bit is determined directly by **whether the capture runtime is installed**, with no separate boolean stored: the runtime is installed only when the bit is true
(either `RxDB.connect()` read it as true, or `workingTree.enable()` just flipped it on). Storing another copy would be a second source of truth,
and the consequence of the two drifting apart is one-directional — the gate believes it is off and every raw write is let through. The context object itself is built
in `setWorkingTreeCaptureHook()` in the **same assignment** as the runtime, not created fresh on every access: the getter is called on every
raw statement and it holds no per-call state. Both fields change only together in that one place, so "a new runtime installed while a closure bound to the old runtime is handed out" is not a reachable state.

What is handed out is the **judgment entry point itself**, not the things the judgment looks at (domain, column set, trusted intent). The core therefore never has to
restate what capture recognizes, and there is no such thing as a duplicated list where "a copy of the domain was made and derived index columns registered later by a plugin only land in one copy" — the judgment always runs on the copy the runtime holds.

##### Returns

[`RawWriteContext`](../../rxdb/type-aliases/RawWriteContext.md)

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`workingTreeRawWriteContext`](../interfaces/RxDBAdapterSqliteBase.md#workingtreerawwritecontext)

## Methods

### addChangeErrorListener() \{#addchangeerrorlistener\}

```ts
addChangeErrorListener(listener): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:96

Subscribe to change-handling failures.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `listener` | [`SqliteChangeErrorListener`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteChangeErrorListener.md) | Callback receiving [SqliteChangeErrorEvent](../../rxdb-adapter-sqlite-core/interfaces/SqliteChangeErrorEvent.md); exceptions are isolated |

#### Returns

`void`

#### Remarks

As soon as a listener is registered, the default `console.error` fallback is taken over by the listener (SQLC-012).

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`addChangeErrorListener`](../interfaces/RxDBAdapterSqliteBase.md#addchangeerrorlistener)

***

### adoptWorktreeEncryption() \{#adoptworktreeencryption\}

```ts
adoptWorktreeEncryption(source): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:83

Adopt the primary database adapter's keyring (read-only checkout, US-313).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | [`LocalRxDBAdapter`](../../rxdb/type-aliases/LocalRxDBAdapter.md) | The primary database's SQLite-family adapter |

#### Returns

`void`

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) `source` is not a SQLite-family adapter

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`adoptWorktreeEncryption`](../interfaces/RxDBAdapterSqliteBase.md#adoptworktreeencryption)

***

### assertDisconnectedForDrop() \{#assertdisconnectedfordrop\}

```ts
protected assertDisconnectedForDrop(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:331

Pre-guard for `dropStorage()`: refuse while still connected (read-only checkout reclaiming the snapshot database, US-313).

#### Returns

`void`

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) adapter is still connected

#### Remarks

`dropStorage()` lives on each concrete adapter rather than here: only they know where the database lives (the IndexedDB database name, the OPFS file name, files on the host),
and a base-class implementation would be inherited as-is by subclasses such as Tauri or mini programs that don't know how to delete it.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`assertDisconnectedForDrop`](../interfaces/RxDBAdapterSqliteBase.md#assertdisconnectedfordrop)

***

### backup() \{#backup\}

```ts
backup(sink, options?): Promise<RxDBBackupResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:164

Write the entire database as a restorable archive.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sink` | `WritableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; | Output stream; closed on success, aborted on failure |
| `options?` | [`RxDBBackupOptions`](../../rxdb/interfaces/RxDBBackupOptions.md) | Cancellation signal and queueing time limit |

#### Returns

`Promise`&lt;[`RxDBBackupResult`](../../rxdb/interfaces/RxDBBackupResult.md)&gt;

End marker (entry count, byte count, SHA-256) and manifest; the output stream's close has completed

#### Remarks

The archive is a logical dump: all schema statements and row literals, taken inside the adapter's serial queue and within the same read transaction, so it is consistent with some
transaction commit boundary and includes everything committed in the WAL. **The entire write-out holds the database**: while the output stream is under backpressure,
all reads and writes during that window are queued. Calling this inside this adapter's own transaction callback waits on itself, until `lock_timeout` is reported after `lockTimeoutMs`.

The archive contains business tables, system tables, the change history, and the keyring ciphertext; encrypted columns stay ciphertext and do not need to be unlocked;
external files are not included (`scope.externalFiles === 'excluded'`). See each adapter's README for the supported storages.

#### Throws

RxDBBackupError `unsupported_combination` / `lock_timeout` / `aborted` / `io_error` / `storage_full`

#### Example

```typescript
const handle = await showSaveFilePicker({ suggestedName: 'notes.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());
console.log(result.sha256);
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`backup`](../interfaces/RxDBAdapterSqliteBase.md#backup)

***

### backupStorage() \{#backupstorage\}

```ts
protected backupStorage(): SqliteBackupStorage;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts#L71)

VFS supported for backup / restore: `memory` (in-memory) and `idb` (IndexedDB).
Other VFS values report `unsupported_combination`.

#### Returns

[`SqliteBackupStorage`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteBackupStorage.md)

#### Remarks

Only main-thread connections are delivered: backup and restore over dedicated Worker / SharedWorker transports have not been tested,
and setting either option reports `unsupported_combination` (`field` is `transport`).

#### Overrides

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`backupStorage`](../interfaces/RxDBAdapterSqliteBase.md#backupstorage)

***

### bootstrapTransaction() \{#bootstraptransaction\}

```ts
bootstrapTransaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:304

**`Internal`**

Bootstrap-phase transaction: same as [transaction](../interfaces/RxDBAdapterSqliteBase.md#transaction), but **skips the ready gate**.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `transactionFun` | `T` | Transaction work; its argument is the current transaction executor |
| `transactionLog?` | `boolean` | Whether to write the transaction log |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

#### Remarks

Only for calls from `RxDB.connect()`'s bootstrap chain (watermark, table creation, migration) and this class's internal bootstrap steps —
they themselves already run inside `RxDB.connect()`'s promise, so waiting on the ready gate means waiting on itself.

Tables may not have been created yet at this moment; ordering is guaranteed by the bootstrap chain itself. **Do not** call it inside a transaction body: the facade does not rewrite this method,
so it would land on the real adapter and enqueue again, and a second enqueue while holding the slot hangs forever.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`bootstrapTransaction`](../interfaces/RxDBAdapterSqliteBase.md#bootstraptransaction)

***

### cacheRowIdEntity() \{#cacherowidentity\}

```ts
cacheRowIdEntity(rowId, entity): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:258

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rowId` | `bigint` |
| `entity` | `any` |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`cacheRowIdEntity`](../interfaces/RxDBAdapterSqliteBase.md#cacherowidentity)

***

### canDropStorage() \{#candropstorage\}

```ts
canDropStorage(): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts#L42)

By the current VFS, whether `dropStorage()` can delete this database (asked once before the read-only checkout creates its snapshot database, US-313).

#### Returns

`boolean`

`false` for `fs-handle`, `true` for the other VFS values

#### Overrides

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`canDropStorage`](../interfaces/RxDBAdapterSqliteBase.md#candropstorage)

***

### checkEntityConstraints() \{#checkentityconstraints\}

```ts
checkEntityConstraints(EntityTypes): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:138

Read-only drift check: compares the storage constraints declared in metadata against the actual objects in `sqlite_master` (US-030 AC#10).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityTypes` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Called by the core inside `RxDB.connect()`, at the same point as `reconcileEntityIndexes` (after user migrations and
missing-table creation). Compares `ck_` CHECK constraints, `uq_` conditional unique indexes, and `ex_` range-exclusion triggers;
throws RxDBConstraintDriftError on mismatch.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`checkEntityConstraints`](../interfaces/RxDBAdapterSqliteBase.md#checkentityconstraints)

***

### cleanAllCache() \{#cleanallcache\}

```ts
cleanAllCache(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:262

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`cleanAllCache`](../interfaces/RxDBAdapterSqliteBase.md#cleanallcache)

***

### cleanupIncompleteRestore() \{#cleanupincompleterestore\}

```ts
cleanupIncompleteRestore(): Promise<boolean>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:203

Clean up a restore that was never finished (the page closed mid-restore, or the cleanup itself failed after a failed restore).

#### Returns

`Promise`&lt;`boolean`&gt;

`true` when residue was actually cleaned up

#### Remarks

Must be called before connecting. Failing to acquire the exclusive lock means the target is being connected to or is mid-restore, reported as `target_busy`;
with no incomplete marker it does nothing. In-memory storage has no residue to speak of and always returns `false`.

#### Throws

RxDBBackupError `target_busy` / `unsupported_combination` / `cleanup_pending`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`cleanupIncompleteRestore`](../interfaces/RxDBAdapterSqliteBase.md#cleanupincompleterestore)

***

### completeBootstrap() \{#completebootstrap\}

```ts
completeBootstrap(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:129

**`Internal`**

Close the **bootstrap window**: called once after `RxDB.connect()` finishes creating tables.

#### Returns

`void`

#### Remarks

Adapters with a ready gate of their own (SQLite family / PGlite) let `query()` / `rawQuery()` /
`createTables()` skip the gate inside the bootstrap window — that gate waits precisely on the not-yet-settled `RxDB.connect()`.
This method flips the state to `ready`, after which every entry point takes the normal ready wait.
Adapters without a ready gate keep the default no-op implementation.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`completeBootstrap`](../interfaces/RxDBAdapterSqliteBase.md#completebootstrap)

***

### connect() \{#connect\}

```ts
connect(): Promise<IRxDBAdapter>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:128

Establish the connection and bring the system tables up to the current watermark.

#### Returns

`Promise`&lt;[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)&gt;

Itself, for convenient chaining

#### Remarks

Table creation and system migration both happen here (see `isCurrentRxDBSystemVersion`), so it can be slow,
and can throw `UnsupportedRxDBSystemVersionError` when the database is newer than this process.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`connect`](../interfaces/RxDBAdapterSqliteBase.md#connect)

***

### createClient() \{#createclient\}

```ts
protected createClient(): Promise<SqliteClientLike>;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts#L80)

Create or obtain the SQLite client.
Concrete adapters implement this method with their own backend logic.

#### Returns

`Promise`&lt;[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)&gt;

#### Overrides

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`createClient`](../interfaces/RxDBAdapterSqliteBase.md#createclient)

***

### createRestoreTargetClient() \{#createrestoretargetclient\}

```ts
protected createRestoreTargetClient(): Promise<SqliteClientLike>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:370

Open a target connection for restore or cleanup.

#### Returns

`Promise`&lt;[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)&gt;

A new connection to the target database

#### Remarks

Defaults to [createClient](../interfaces/RxDBAdapterSqliteBase.md#createclient): browser backends only open the database in a same-origin context, and the exclusive Web Lock acquired before restore
already blocks every other connection. Backends whose database file can be opened by other processes (desktop hosts) override it, making this connection
take exclusive hold of the underlying storage before returning and keep it until disconnect, ensuring nobody else can connect from the empty-state check through the end of the restore.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`createRestoreTargetClient`](../interfaces/RxDBAdapterSqliteBase.md#createrestoretargetclient)

***

### createTables() \{#createtables\}

```ts
createTables<T>(EntityTypes, entities?): Promise<boolean>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:208

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityTypes` | `T`[] |
| `entities?` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`createTables`](../interfaces/RxDBAdapterSqliteBase.md#createtables)

***

### createUncachedRepository() \{#createuncachedrepository\}

```ts
createUncachedRepository<T>(EntityType, host): IRepository<T>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:127

**`Internal`**

Create a new repository bound to `host`, **without writing** to `repository_cache`.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity type |
| `host` | [`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md) | The adapter the repository binds to (the executor's facade in transaction scenarios) |

#### Returns

[`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

#### Remarks

Used by [SqliteTransactionExecutor.getRepository](../../rxdb-adapter-sqlite-core/classes/SqliteTransactionExecutor.md#getrepository). The cache must be bypassed because: repositories in the cache
have the same lifetime as the adapter; if a transaction-scoped repository were written into it, it would remain in the cache after the transaction ends pointing at
a committed/rolled-back transaction context, and subsequent **external** writes would hit it.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`createUncachedRepository`](../interfaces/RxDBAdapterSqliteBase.md#createuncachedrepository)

***

### createWorktreeTableSet() \{#createworktreetableset\}

```ts
createWorktreeTableSet(
   executor, 
   tableSet, 
   seed
): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:220

Create and seed a set of tables for a writable checkout inside the caller's transaction (US-314 B1.5); see `worktree/worktree-table-set.ts` for the approach.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of a transaction on this adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | The table set to create; members are chosen by the caller (entities in the versioned domain) |
| `seed` | [`WorktreeTableSetSeed`](../../rxdb/interfaces/WorktreeTableSetSeed.md) | Holds the branch and the deltas to apply on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) when given the primary table set, when members include entities without change logging, when a delta falls outside the table set, or when the primary tables are missing columns

#### Remarks

Does not write the hold keys: the checkout-opening flow writes them itself in the same transaction. The primary table set is created along with database and table creation ([RxDBAdapterSqliteBase.createTables](../interfaces/RxDBAdapterSqliteBase.md#createtables)), not through here.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`createWorktreeTableSet`](../interfaces/RxDBAdapterSqliteBase.md#createworktreetableset)

***

### deleteByIds() \{#deletebyids\}

```ts
deleteByIds(entityName, ids): Observable<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:321

Batch delete by a list of IDs (QueryCache only)

Used to clean up data that was deleted remotely out of the local cache.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | Entity name |
| `ids` | `string`[] | List of IDs to delete |

#### Returns

`Observable`&lt;`void`&gt;

`Observable<void>`

#### Example

```typescript
adapter.deleteByIds('Product', ['p1', 'p2']).subscribe();
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`deleteByIds`](../interfaces/RxDBAdapterSqliteBase.md#deletebyids)

***

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:139

Disconnect and release the underlying handles.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Unlike `RxDB.destroy()`, disconnecting is **reversible**: the same adapter instance can `connect()` again afterwards.
Implementations must be idempotent — calling while not connected is a no-op, not an error.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`disconnect`](../interfaces/RxDBAdapterSqliteBase.md#disconnect)

***

### dropStorage() \{#dropstorage\}

```ts
dropStorage(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts#L56)

Delete this database's persistent storage (read-only checkout reclaiming the snapshot database, US-313).

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) still connected; the IndexedDB database is blocked elsewhere, the OPFS file is still in use; the VFS does not support deletion

#### Remarks

The location is derived with the same logic as at connect time (database file `<db name>.sqlite`): `idb` / `idb-memory` are a separate IndexedDB database
`<db name>.sqlite.db`, `opfs` is the database file plus `-journal` / `-wal` under the OPFS root; `memory` is gone once disconnected.
The `fs-handle` root directory is provided by the caller, so there is no way to know where to delete.

#### Overrides

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`dropStorage`](../interfaces/RxDBAdapterSqliteBase.md#dropstorage)

***

### dropWorktreeTableSet() \{#dropworktreetableset\}

```ts
dropWorktreeTableSet(executor, tableSet): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:231

Drop a set of tables for a writable checkout inside the caller's transaction (US-314 B1.5): locate by catalog, drop the triggers before the tables.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of a transaction on this adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | The table set to drop |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) when given the primary table set

#### Remarks

Hold keys on branch tables are not released here; the checkout-closing flow releases them itself in the same transaction.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`dropWorktreeTableSet`](../interfaces/RxDBAdapterSqliteBase.md#dropworktreetableset)

***

### emitChangeError() \{#emitchangeerror\}

```ts
emitChangeError(event): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:112

Report a change-handling failure.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | [`SqliteChangeErrorEvent`](../../rxdb-adapter-sqlite-core/interfaces/SqliteChangeErrorEvent.md) | Failure details |

#### Returns

`void`

#### Remarks

Called by the change-handling pipeline (`handle_rxdb_change`), not meant for application code. This method **never throws**:
the path it sits on has no caller that can catch an exception, and throwing would only become an unhandled rejection.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`emitChangeError`](../interfaces/RxDBAdapterSqliteBase.md#emitchangeerror)

***

### getEntityByRowId() \{#getentitybyrowid\}

```ts
getEntityByRowId(rowId, EntityType): any;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:260

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rowId` | `bigint` |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Returns

`any`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`getEntityByRowId`](../interfaces/RxDBAdapterSqliteBase.md#getentitybyrowid)

***

### getMetadataByIds() \{#getmetadatabyids\}

```ts
getMetadataByIds(entityName, ids): Observable<Map<string, string>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:319

Get the metadata of a list of IDs (QueryCache only)

Used for local cache freshness checks, returning an ID → updatedAt mapping.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | Entity name |
| `ids` | `string`[] | List of entity IDs |

#### Returns

`Observable`&lt;`Map`&lt;`string`, `string`&gt;&gt;

`Observable<Map<string, string>>` - ID → updatedAt mapping

#### Example

```typescript
adapter.getMetadataByIds('Product', ['p1', 'p2'])
  .subscribe(map => {
    // map: Map `{ 'p1' => '2026-01-12T10:00:00Z', 'p2' => '2026-01-12T09:30:00Z' }`
  });
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`getMetadataByIds`](../interfaces/RxDBAdapterSqliteBase.md#getmetadatabyids)

***

### getRepository() \{#getrepository\}

```ts
getRepository<T, RT>(EntityType): RT;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:113

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t-3"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) | - |
| <a id="type-parameter-rt"></a> `RT` | [`SqliteRepository`](SqliteRepository.md)&lt;`T`&gt; |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityType` | `T` |

#### Returns

`RT`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`getRepository`](../interfaces/RxDBAdapterSqliteBase.md#getrepository)

***

### getRowIdByEntity() \{#getrowidbyentity\}

```ts
getRowIdByEntity(entity): bigint | undefined;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:261

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entity` | `any` |

#### Returns

`bigint` \| `undefined`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`getRowIdByEntity`](../interfaces/RxDBAdapterSqliteBase.md#getrowidbyentity)

***

### getRxDBChangeSequence() \{#getrxdbchangesequence\}

```ts
getRxDBChangeSequence(): Promise<number>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:317

#### Returns

`Promise`&lt;`number`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`getRxDBChangeSequence`](../interfaces/RxDBAdapterSqliteBase.md#getrxdbchangesequence)

***

### importWorktreeSnapshot() \{#importworktreesnapshot\}

```ts
importWorktreeSnapshot(snapshot): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:76

Write the rows and deltas read from the primary database into this database (read-only checkout snapshot creation, US-313).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `snapshot` | [`WorktreeSnapshotImport`](../../rxdb/interfaces/WorktreeSnapshotImport.md) | The tables to copy and the deltas applied on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) this database has the capture runtime installed

#### Remarks

One transaction, no events dispatched: snapshot instance entities are all `log: false`, so there is no change log to derive events from.
Deltas are generated by the same SQL as branch switching, except that encrypted columns pass through as envelopes.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`importWorktreeSnapshot`](../interfaces/RxDBAdapterSqliteBase.md#importworktreesnapshot)

***

### internalQuery() \{#internalquery\}

```ts
internalQuery(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:316

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sql` | `string` |
| `bindings?` | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md)&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`internalQuery`](../interfaces/RxDBAdapterSqliteBase.md#internalquery)

***

### isEncryptedAtRest() \{#isencryptedatrest\}

```ts
isEncryptedAtRest(value): boolean;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:55

Determine whether a stored value is already in its encrypted at-rest form (FR-038).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value in the stored column |

#### Returns

`boolean`

`true` when it is an envelope string

#### Remarks

There is exactly one authoritative detector, the `isEnvelope` of `@aiao/rxdb-adapter-encrypted` — this method is
a one-line forward from the core's optional slot ([RxDBAdapterLocalBase.isEncryptedAtRest](../../rxdb/classes/RxDBAdapterLocalBase.md#isencryptedatrest)) to it,
and does not recognize any shape of its own here. `@aiao/rxdb` cannot depend on the encryption package (the dependency direction is reversed), so that one line
can only live on the adapter side.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`isEncryptedAtRest`](../interfaces/RxDBAdapterSqliteBase.md#isencryptedatrest)

***

### isTableExisted() \{#istableexisted\}

```ts
isTableExisted<T>(EntityType): Promise<boolean>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:207

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-4"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityType` | `T` |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`isTableExisted`](../interfaces/RxDBAdapterSqliteBase.md#istableexisted)

***

### listWorktreeTableSetSuffixes() \{#listworktreetablesetsuffixes\}

```ts
listWorktreeTableSetSuffixes(executor): Promise<readonly string[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:238

List existing writable checkout table sets by catalog (US-314 B2.6): which set each table whose name ends with `$<suffix>` belongs to.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of a transaction on this adapter |

#### Returns

`Promise`&lt;readonly `string`[]&gt;

Table set suffixes, sorted and deduplicated; primary tables of configured entities that happen to take this shape are not counted

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`listWorktreeTableSetSuffixes`](../interfaces/RxDBAdapterSqliteBase.md#listworktreetablesetsuffixes)

***

### mergeChanges() \{#mergechanges\}

```ts
mergeChanges(
   actions, 
   localChanges?, 
   disableTriggers?
): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:257

Apply compressed changes to the local entity tables

Implementation strategy (SQLite):
1. Convert actions to SQL operations
2. Inside a transaction:
   a) Execute the SQL operations on the entity tables (INSERT/UPDATE/DELETE)
   b) Batch insert localChanges into the RxDBChange table (for history tracking)
3. Send local events to notify the UI to update

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `actions` | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md) | The set of compressed change operations (pulled from remote) |
| `localChanges?` | `Omit`&lt;[`RxDBChange`](../../rxdb/classes/RxDBChange.md), `"id"`&gt;[] | Records to save to the local RxDBChange table (optional) |
| `disableTriggers?` | `boolean` | Whether to disable triggers (used for pull and similar operations, to avoid creating RxDBChange) |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`mergeChanges`](../interfaces/RxDBAdapterSqliteBase.md#mergechanges)

***

### migrateSystemSchema() \{#migratesystemschema\}

```ts
migrateSystemSchema(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:239

Upgrade RxDB-owned tables before app migrations or repositories run.
Adapters that do not need to persist system schema state keep the default no-op implementation.

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`migrateSystemSchema`](../interfaces/RxDBAdapterSqliteBase.md#migratesystemschema)

***

### mutations() \{#mutations\}

```ts
mutations<T>(options): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:206

Batch modify entities (create/update/delete)

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-5"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`RxDBMutationsMap`](../../rxdb/interfaces/RxDBMutationsMap.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`mutations`](../interfaces/RxDBAdapterSqliteBase.md#mutations)

***

### persistentBackupStorage() \{#persistentbackupstorage\}

```ts
protected persistentBackupStorage(label): SqliteBackupStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:348

Generate a description of a persistent storage backend.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `label` | `string` | Storage name written into the manifest, e.g. `idb` / `opfs` |

#### Returns

[`SqliteBackupStorage`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteBackupStorage.md)

A persistent backend whose `storageKey` is `<adapter>:<label>:<dbName>`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`persistentBackupStorage`](../interfaces/RxDBAdapterSqliteBase.md#persistentbackupstorage)

***

### physicalTableNames() \{#physicaltablenames\}

```ts
physicalTableNames(metadata): readonly string[];
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:255

The SQLite family folds the namespace into the table name: `public$todos`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |

#### Returns

readonly `string`[]

The logical name (the base class's one) plus the name this family actually creates

#### Remarks

The entire point of the override is **a single copy of the rule**: the name comes from get\_table\_name\_by\_metadata,
the same function used for table creation, queries, and triggers. Before it, `@aiao/rxdb-plugin-working-tree`'s
versioned domain composed its own copy by `'$'`; change that composition and that copy reports no error — it just stops recognizing the table, and the
raw-write gate silently lets it through.

The logical name from the base class is kept instead of returning only the folded name: the raw judgment prefers to **recognize one extra** name — recognizing more only blocks
one more statement that would not have worked on this backend anyway; the one it fails to recognize is exactly the name a capture-bypassing write would use.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`physicalTableNames`](../interfaces/RxDBAdapterSqliteBase.md#physicaltablenames)

***

### query() \{#query\}

```ts
query(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:269

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sql` | `string` |
| `bindings?` | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md)&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`query`](../interfaces/RxDBAdapterSqliteBase.md#query)

***

### rawQuery() \{#rawquery\}

```ts
rawQuery(sql, params?): Promise<RawQueryResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:287

Raw SQL.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sql` | `string` |
| `params?` | `unknown`[] |

#### Returns

`Promise`&lt;[`RawQueryResult`](../../rxdb/interfaces/RawQueryResult.md)&gt;

#### Remarks

**The judgment comes from the core package; this only wires it up** (adapter-contract.md §2). `rawQuery?()` is
an optional method on `IRxDBAdapter`, so the core package cannot wrap it on behalf of adapters the way it does the four capture mount points; thus this one
`gateRawWrite` call is the only thing this class must get right. The judgment itself is not rewritten here in any way — if even one of the six implementations
wrote the lexical normalization loosely, the whole line of defense would have a hole, and that hole would never surface in any single backend's own tests.

This one line covers the **5 v1 adapters** (wa-sqlite / sqlite-wasm / sqlite / sqliteai / electron):
they all extend this class and none overrides `rawQuery`. Writing it once in each of the five subclasses is the form T064 "no per-subclass copies" explicitly rules out;
should some subclass ever really override `rawQuery`, it must wire the call up itself, and T068's 6 consistency call sites cover that.

Registered business tables are rejected before a transaction opens; calls that would have been let through re-read the physical catalog inside the executing transaction and pass the same gate again,
to avoid missing shadow tables created by other instances. Both judgments happen before the business statement is issued. Behavior is unchanged inside the bootstrap window when no capture is installed.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`rawQuery`](../interfaces/RxDBAdapterSqliteBase.md#rawquery)

***

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

Read one page of rows in storage form (read-only checkout snapshot creation, US-313).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of a primary database transaction |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md) | The entity class on the primary instance |
| `after` | \| [`WorktreeSnapshotCursor`](../../rxdb/type-aliases/WorktreeSnapshotCursor.md) \| `null` | The cursor of the previous page; `null` reads from the start |
| `limit` | `number` | Maximum number of rows on this page |

#### Returns

`Promise`&lt;[`WorktreeSnapshotPage`](../../rxdb/interfaces/WorktreeSnapshotPage.md)&gt;

Rows of raw SQLite values, paginated by rowid

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`readWorktreeSnapshotPage`](../interfaces/RxDBAdapterSqliteBase.md#readworktreesnapshotpage)

***

### ready() \{#ready\}

```ts
protected ready(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:385

Ready gate: **must be called before acquiring the queue slot, never inside a queue task**.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Queue concurrency is 1. Waiting for `RxDB.connect()` inside the critical section forms a cycle: `RxDB.connect()`'s first-install path relies on
the watermark transaction behind the queue to complete, and that transaction can never get the occupied slot (see design doc §1.2 for the measured trace).

The gate waits for the **entire `RxDB.connect()`**, not "has this adapter's client connected yet". Between the two lie table creation,
system migration, and the watermark; it once let things through based on client state, so external writes arriving in that window hit tables that had not been created yet
(`no such table`). `RxDB.connect()` itself caches its promise by name; once complete, this is just one extra
microtask hop.

The bootstrap chain itself **must not** pass through this gate (that would be waiting on itself); it always goes via [bootstrapTransaction](../interfaces/RxDBAdapterSqliteBase.md#bootstraptransaction).

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`ready`](../interfaces/RxDBAdapterSqliteBase.md#ready)

***

### reconcileEntityIndexes()? \{#reconcileentityindexes\}

```ts
reconcileEntityIndexes?(EntityTypes): Promise<void>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:611

Idempotently reconcile entity indexes after user migrations and missing-table creation.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityTypes` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`reconcileEntityIndexes`](../interfaces/RxDBAdapterSqliteBase.md#reconcileentityindexes)

***

### removeCacheEntity() \{#removecacheentity\}

```ts
removeCacheEntity(entity): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:259

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entity` | `any` |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`removeCacheEntity`](../interfaces/RxDBAdapterSqliteBase.md#removecacheentity)

***

### removeChangeErrorListener() \{#removechangeerrorlistener\}

```ts
removeChangeErrorListener(listener): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:102

Cancel the subscription of [addChangeErrorListener](../interfaces/RxDBAdapterSqliteBase.md#addchangeerrorlistener).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `listener` | [`SqliteChangeErrorListener`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteChangeErrorListener.md) | The same function reference passed at registration |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`removeChangeErrorListener`](../interfaces/RxDBAdapterSqliteBase.md#removechangeerrorlistener)

***

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:205

Batch delete entities.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-6"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The deleted entities

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`removeMany`](../interfaces/RxDBAdapterSqliteBase.md#removemany)

***

### repository() \{#repository\}

```ts
protected repository<RT>(repositoryName, RepositoryClass): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:352

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-rt-1"></a> `RT` *extends* [`RepositoryInstance`](../../rxdb/interfaces/RepositoryInstance.md)&lt;[`EntityType`](../../rxdb/type-aliases/EntityType.md)&gt; |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `repositoryName` | `string` |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterSqlite`, `RT`&gt; |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`repository`](../interfaces/RxDBAdapterSqliteBase.md#repository)

***

### restore() \{#restore\}

```ts
restore(source, options?): Promise<RxDBRestoreResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:192

Restore the archive produced by [backup](../interfaces/RxDBAdapterSqliteBase.md#backup) into the empty storage this adapter is configured with.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | `ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; | Archive byte stream |
| `options?` | [`SqliteRestoreOptions`](../../rxdb-adapter-sqlite-core/interfaces/SqliteRestoreOptions.md) | Cancellation signal and phase callbacks |

#### Returns

`Promise`&lt;[`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md)&gt;

End marker and manifest

#### Remarks

Must be called before `rxdb.connect()` (obtain the not-yet-connected instance via `rxdb.getAdapter(name)`): reports
`target_busy` when already connected or mid-restore. Writes only into an **empty** target; compatibility (adapter, engine major version, virtual table module, system table / change encoding version,
entity structure fingerprint, encryption authentication domain) is judged before the first statement is written, and commits only after all checks pass.

- Persistent storage: after the restore completes, a normal `rxdb.connect()` suffices; if the page closes mid-restore, subsequent connections report `restore_incomplete`,
  requiring [cleanupIncompleteRestore](../interfaces/RxDBAdapterSqliteBase.md#cleanupincompleterestore) first.
- In-memory storage: the restored database only lives inside this instance and is taken over by the next `rxdb.connect()`; [disconnect](../interfaces/RxDBAdapterSqliteBase.md#disconnect) releases it when not connecting.

Restored rows produce no change history; encrypted databases stay locked. The input stream is cancelled on failure; on success only the read lock is released.

#### Throws

RxDBBackupError see RxDBBackupErrorCode; `cleanup_pending` means even the cleanup after a failure was not finished

#### Example

```typescript
rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS' }));
const adapter = await rxdb.getAdapter('wa-sqlite');
await adapter.restore(file.stream());
await rxdb.connect('wa-sqlite');
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`restore`](../interfaces/RxDBAdapterSqliteBase.md#restore)

***

### runInTransaction() \{#runintransaction\}

```ts
runInTransaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:315

Execute transaction work.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-7"></a> `T` *extends* [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `transactionFun` | `T` | Transaction work; its argument is the current transaction executor |
| `transactionLog?` | `boolean` | - |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The return value of the transaction work

#### Remarks

The real adapter entry always opens a new transaction; the executor facade maps `runInTransaction()` inside a transaction to
`executor.run()`, reusing the current transaction without re-enqueueing.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`runInTransaction`](../interfaces/RxDBAdapterSqliteBase.md#runintransaction)

***

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:204

Batch write entities (insert if absent, update if present).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-8"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The entities after they land in the database; fields backfilled by the database, such as the primary key and database-side defaults, only have values here

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`saveMany`](../interfaces/RxDBAdapterSqliteBase.md#savemany)

***

### sealWorktreeReadOnly() \{#sealworktreereadonly\}

```ts
sealWorktreeReadOnly(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:87

Seal this database read-only (read-only checkout, US-313): from then on, write statements on this connection are rejected by SQLite.

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`sealWorktreeReadOnly`](../interfaces/RxDBAdapterSqliteBase.md#sealworktreereadonly)

***

### setRxDBChangeSequence() \{#setrxdbchangesequence\}

```ts
setRxDBChangeSequence(sequence): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:318

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sequence` | `number` |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`setRxDBChangeSequence`](../interfaces/RxDBAdapterSqliteBase.md#setrxdbchangesequence)

***

### settleRepositoryTransaction() \{#settlerepositorytransaction\}

```ts
protected settleRepositoryTransaction(executor, committed): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:793

Commit or roll back the entity state of the public repositories, must be called before returning the transaction queue.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) |
| `committed` | `boolean` |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`settleRepositoryTransaction`](../interfaces/RxDBAdapterSqliteBase.md#settlerepositorytransaction)

***

### setWorkingTreeCaptureHook() \{#setworkingtreecapturehook\}

```ts
setWorkingTreeCaptureHook(hook): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:429

**`Internal`**

Install or uninstall the capture runtime (the four mount points of adapter-contract.md §1).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `hook` | \| [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md) \| `undefined` | The runtime taking over the four mount points; `undefined` uninstalls |

#### Returns

`void`

#### Remarks

The mount lives **here** instead of each of the six adapters inserting a line into its own `transaction()`: writing it once less,
or once too late (validating the token only after the business write), nothing could ever detect — and that is exactly the form §2 "a single copy of the judgment implementation"
exists to rule out.

Callers are `RxDB.connect()` (after confirming the capability bit is true) and `workingTree.enable()` (after the flip succeeds).
On a database that was never enabled this is never called, so the four write primitives do not even get one layer of forwarding.

Idempotent: if already installed, it is uninstalled first and then installed, never stacked into two layers.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`setWorkingTreeCaptureHook`](../interfaces/RxDBAdapterSqliteBase.md#setworkingtreecapturehook)

***

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

Archives save shadow tables row by row as-is, and restore rewrites them table-wide. Allowed by default; backends running SQLite in defensive mode cannot modify shadow tables
and override with `false`: backing up or restoring a database containing shadow tables then reports `unsupported_combination`, rather than producing an archive it cannot restore itself,
or failing halfway through the write.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`shadowTablesWritable`](../interfaces/RxDBAdapterSqliteBase.md#shadowtableswritable)

***

### sharedClientLockName() \{#sharedclientlockname\}

```ts
protected sharedClientLockName(): string | undefined;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts#L92)

Under the SharedWorker transport, multiple tabs share the one client inside the worker: return the lock name for cross-tab serialized transactions (US-314 B2.3b).

#### Returns

`string` \| `undefined`

A lock name differentiated by database name; `undefined` when not going through a SharedWorker

#### Remarks

The criterion is the same one as the transport actually used at connect time: passing only `sharedWorkerInstance` without `sharedWorker: true` is also a shared connection.

#### Overrides

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`sharedClientLockName`](../interfaces/RxDBAdapterSqliteBase.md#sharedclientlockname)

***

### switchBranch() \{#switchbranch\}

```ts
switchBranch(options): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:256

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`SwitchBranchOptions`](../../rxdb/interfaces/SwitchBranchOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`switchBranch`](../interfaces/RxDBAdapterSqliteBase.md#switchbranch)

***

### transaction() \{#transaction\}

```ts
transaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:288

Read and write within the same transaction through the executor.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-9"></a> `T` *extends* [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `transactionFun` | `T` | Callback holding this transaction's executor |
| `transactionLog?` | `boolean` | Whether to record the transaction log |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

Callback result

#### Remarks

An `entity.save()` that does not hold the executor re-enqueues. Awaiting it inside the transaction callback waits on itself, so the transaction cannot end.
Inside a transaction use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository); for the save entry point on entity instances see [EntityBase.save](../../rxdb/classes/EntityBase.md#save).

#### Examples

```ts
// ✅ Obtain the repository through the executor; all reads and writes belong to this transaction.
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
// ❌ The entity instance does not hold the executor; after re-enqueueing, save() waits for the current transaction to end.
await adapter.transaction(async () => {
  await entity.save();
});
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`transaction`](../interfaces/RxDBAdapterSqliteBase.md#transaction)

***

### transactionalRepository() \{#transactionalrepository\}

```ts
protected transactionalRepository<T, R>(EntityType, repository): R;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:795

Put the whole operation of a public repository into a transaction; this method is not called when the executor creates repositories.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-10"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |
| <a id="type-parameter-r"></a> `R` *extends* `object` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityType` | `T` |
| `repository` | `R` |

#### Returns

`R`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`transactionalRepository`](../interfaces/RxDBAdapterSqliteBase.md#transactionalrepository)

***

### upsertMany() \{#upsertmany\}

```ts
upsertMany<T>(entityName, data): Observable<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:320

Batch upsert data (QueryCache only)

Executes INSERT OR REPLACE semantics, used to cache remotely pulled data.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-11"></a> `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | Entity name |
| `data` | `T`[] | List of data to write |

#### Returns

`Observable`&lt;`void`&gt;

`Observable<void>`

#### Example

```typescript
adapter.upsertMany('Product', [product1, product2]).subscribe();
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`upsertMany`](../interfaces/RxDBAdapterSqliteBase.md#upsertmany)

***

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:140

The version number of the underlying database engine (e.g. `3.45.0` for SQLite), used for diagnostics and capability checks.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Unrelated to the system table watermark number (`RXDB_SYSTEM_SCHEMA_VERSION`), which is RxDB's own number.

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`version`](../interfaces/RxDBAdapterSqliteBase.md#version)

***

### worktreeTableSetMounted() \{#worktreetablesetmounted\}

```ts
worktreeTableSetMounted(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:268

**`Internal`**

Clear the row-id cache after this instance switches its mounted table set (US-314 B1.4): row ids are recorded per physical table; once the table set changes, the same row id points to a different row.

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`worktreeTableSetMounted`](../interfaces/RxDBAdapterSqliteBase.md#worktreetablesetmounted)

***

### writeQuery() \{#writequery\}

```ts
writeQuery(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:270

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sql` | `string` |
| `bindings?` | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md)&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md).[`writeQuery`](../interfaces/RxDBAdapterSqliteBase.md#writequery)
