# RxDBAdapterSqliteBase

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:521](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L521)

Backend-agnostic base class for SQLite adapters.

Subclasses are responsible for implementing `createClient()` and `adapterName`.

## Extends

- [`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md)

## Implements

- [`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)

## Constructors

### Constructor

```ts
new RxDBAdapterSqliteBase(rxdb, options?): RxDBAdapterSqliteBase;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:603](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L603)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |
| `options?` | [`SqliteBaseOptions`](../interfaces/SqliteBaseOptions.md) |

#### Returns

`RxDBAdapterSqliteBase`

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`constructor`](../../rxdb/classes/RxDBAdapterLocalBase.md#constructor)

## Properties

### clientOwner \{#clientowner\}

```ts
protected readonly clientOwner: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:564](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L564)

The holder key of this adapter on the client: handed to the client at `init` time inside `createClient()`, and carried along when registering listeners and when handing back on disconnect (US-314 B2.3b).

#### Remarks

Inside a SharedWorker there is only one client, and every tab's adapter is connected to it; on disconnect, this key is used to hand back only one's own share and remove only one's own listeners
([SqliteClientLike.release](../interfaces/SqliteClientLike.md#release)). Backends that do not share a client can ignore it.

***

### name \{#name\}

```ts
abstract readonly name: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:566](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L566)

The adapter name, the same value as the key used when registering with `RxDB.adapter()`; error messages and `getAdapter()` both identify the adapter by it

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`name`](../../rxdb/interfaces/IRxDBAdapter.md#name)

***

### repository\_cache \{#repository_cache\}

```ts
protected readonly repository_cache: Map<EntityType, RepositoryInstance<EntityType>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:349

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`repository_cache`](../../rxdb/classes/RxDBAdapterLocalBase.md#repository_cache)

***

### repository\_map \{#repository_map\}

```ts
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterSqliteBase, RepositoryInstance<EntityType>>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:348

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`repository_map`](../../rxdb/classes/RxDBAdapterLocalBase.md#repository_map)

***

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

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:582](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L582)

##### Returns

[`AdapterEncryptionFacade`](../interfaces/AdapterEncryptionFacade.md)

***

### encryptionContext \{#encryptioncontext\}

#### Get Signature

```ts
get encryptionContext(): EncryptionContext;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:574](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L574)

##### Returns

[`EncryptionContext`](../interfaces/EncryptionContext.md)

***

### tableSet \{#tableset\}

#### Get Signature

```ts
get tableSet(): WorktreeTableSet;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:411

The set of business tables this instance is mounted on (US-314 in-database shadow tables)

##### Remarks

It lives on the RxDB instance ([RxDB.worktreeTableSet](../../rxdb/classes/RxDB.md#worktreetableset-1)); here it is only read through: an instance is mounted on only one table set at a time,
and storing a second copy in the adapter would be a second source of truth. SQL reading and writing business tables resolves physical names through it; entities without a replica, such as system tables and QueryCache,
land in the main table set no matter which set they are mounted on.

##### Returns

[`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`tableSet`](../../rxdb/classes/RxDBAdapterLocalBase.md#tableset)

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

The capture runtime; always `undefined` on databases where the commit capability is not enabled.

##### Returns

  \| [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md)
  \| `undefined`

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`workingTreeCaptureHook`](../../rxdb/classes/RxDBAdapterLocalBase.md#workingtreecapturehook)

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

`rawQuery?()` is an **optional method** on this interface (see `IRxDBAdapter` above), so the core package cannot wrap it for the adapter the way it does the four mount points
— the judgment can only be invoked by each adapter's own `rawQuery` implementation calling `gateRawWrite(sql, ctx, …)`.
The `ctx` that call needs is handed out here, so the only thing the six adapters need to get right is the single line "pass it to the judgment";
the two problems that are actually easy to get wrong — "how are capability bits computed" and "where does the domain come from" — never fall on them at all.

The capability bit is determined directly by **whether the capture runtime is installed**, without storing a separate boolean: the runtime is only installed when the bit is true
(established when `RxDB.connect()` reads true, or when `workingTree.enable()` has just flipped it). Storing another copy would be a second source of truth,
and the consequence of the two copies drifting is one-directional — the gate thinks it is off, and all raw writes are allowed through. The context object itself is built
in `setWorkingTreeCaptureHook()` in the **same assignment** as the runtime, not created anew on every read: the getter is called on every
raw statement, and it holds no per-call state. The two fields only change together in that one place, so "a new runtime installed while
a closure bound to the old runtime is handed out" is not a reachable state.

What is handed out is the **judgment entry itself**, not the things the judgment needs to look at (the domain, the column set, the trusted intents). The core therefore does not
restate what capture recognizes, and there is no such thing as a duplicated list where "a copy of the domain is taken and derived index columns registered later by a plugin only land in one of the copies"
— the judgment always runs on the copy held by the runtime.

##### Returns

[`RawWriteContext`](../../rxdb/type-aliases/RawWriteContext.md)

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`workingTreeRawWriteContext`](../../rxdb/classes/RxDBAdapterLocalBase.md#workingtreerawwritecontext)

## Methods

### addChangeErrorListener() \{#addchangeerrorlistener\}

```ts
addChangeErrorListener(listener): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:698](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L698)

Subscribes to change handling failures.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `listener` | [`SqliteChangeErrorListener`](../type-aliases/SqliteChangeErrorListener.md) | The callback receiving [SqliteChangeErrorEvent](../interfaces/SqliteChangeErrorEvent.md); exceptions are isolated |

#### Returns

`void`

#### Remarks

As long as a listener is registered, the default `console.error` fallback is taken over by the listener (SQLC-012).

***

### adoptWorktreeEncryption() \{#adoptworktreeencryption\}

```ts
adoptWorktreeEncryption(source): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:675](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L675)

Adopts the keyring of the main database's adapter (read-only checkout, US-313).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | [`LocalRxDBAdapter`](../../rxdb/type-aliases/LocalRxDBAdapter.md) | The main database's SQLite-family adapter |

#### Returns

`void`

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) `source` is not a SQLite-family adapter

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`adoptWorktreeEncryption`](../../rxdb/classes/RxDBAdapterLocalBase.md#adoptworktreeencryption)

***

### assertDisconnectedForDrop() \{#assertdisconnectedfordrop\}

```ts
protected assertDisconnectedForDrop(): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1511](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1511)

The pre-guard of `dropStorage()`: refuses while still connected (read-only checkout recycles the snapshot database, US-313).

#### Returns

`void`

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) The adapter is still connected

#### Remarks

`dropStorage()` lives on each concrete adapter rather than here: where the database lives (IndexedDB database name, OPFS file name, a file on the host)
is known only to them; an implementation in the base class would be inherited verbatim by subclasses such as Tauri and mini-programs that do not know how to delete it.

***

### backup() \{#backup\}

```ts
backup(sink, options?): Promise<RxDBBackupResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:871](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L871)

Writes the entire database as a restorable archive.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sink` | `WritableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; | The output stream; closed on success, aborted on failure |
| `options?` | [`RxDBBackupOptions`](../../rxdb/interfaces/RxDBBackupOptions.md) | Cancellation signal and queueing time limit |

#### Returns

`Promise`&lt;[`RxDBBackupResult`](../../rxdb/interfaces/RxDBBackupResult.md)&gt;

The end marker (entry count, byte count, SHA-256) and the manifest; the output stream close has completed

#### Remarks

The archive is a logical dump: all structure statements and row literals, obtained inside the adapter's serial queue and within the same read transaction, so it is consistent with one
transaction commit boundary, and committed data in the WAL is all included. **The database is occupied for the entire write**: when the output stream applies backpressure,
reads and writes during this period are queued. Calling it inside this adapter's transaction callback waits on itself until `lockTimeoutMs`, then reports `lock_timeout`.

The archive contains business tables, system tables, change history, and the keyring's ciphertext; encrypted columns stay ciphertext, no unlock needed;
external files are not in it (`scope.externalFiles === 'excluded'`). See each adapter's README for supported storage.

#### Throws

RxDBBackupError `unsupported_combination` / `lock_timeout` / `aborted` / `io_error` / `storage_full`

#### Example

```typescript
const handle = await showSaveFilePicker({ suggestedName: 'notes.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());
console.log(result.sha256);
```

***

### backupStorage() \{#backupstorage\}

```ts
protected backupStorage(): SqliteBackupStorage;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1524](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1524)

The backup storage backend corresponding to the current configuration, deciding whether [backup](#backup) / [restore](#restore) can be used and which path restore takes.

#### Returns

[`SqliteBackupStorage`](../type-aliases/SqliteBackupStorage.md)

The storage backend

#### Remarks

Unsupported by default in the base class; delivered adapters override it according to their own storage options. A persistent backend's `storageKey` is generated by
[persistentBackupStorage](#persistentbackupstorage), ensuring the same database uses the same lock on both the connect and the restore side.

***

### bootstrapTransaction() \{#bootstraptransaction\}

```ts
bootstrapTransaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1333](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1333)

**`Internal`**

Bootstrap-phase transaction: same as [transaction](#transaction), but **skips the readiness gate**.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`TransactionFun`](../type-aliases/TransactionFun.md) |

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `transactionFun` | `T` | `undefined` | The transaction work; its parameter is the current transaction executor |
| `transactionLog?` | `boolean` | `true` | Whether to write a transaction log |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

#### Remarks

Only for calls from `RxDB.connect()`'s bootstrap chain (watermark, table creation, migration) and this class's own bootstrap steps —
they already run inside the promise of `RxDB.connect()`, and waiting on the readiness gate would be waiting on themselves.

Tables may not have been created yet at this point; the order is guaranteed by the bootstrap chain itself. **Do not** call it from inside a transaction body: the facade does not rewrite this method,
so it lands on the real adapter and enqueues again — re-enqueueing while holding the slot is a permanent hang.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`bootstrapTransaction`](../../rxdb/classes/RxDBAdapterLocalBase.md#bootstraptransaction)

***

### cacheRowIdEntity() \{#cacherowidentity\}

```ts
cacheRowIdEntity(rowId, entity): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1216](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1216)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rowId` | `bigint` |
| `entity` | `any` |

#### Returns

`void`

***

### canDropStorage()? \{#candropstorage\}

```ts
canDropStorage?(): boolean;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:691

Whether, under the current configuration, [dropStorage](../../rxdb/classes/RxDBAdapterLocalBase.md#dropstorage) can delete this database (asked once before a read-only checkout builds the snapshot database, US-313).

#### Returns

`boolean`

When `false`, `dropStorage()` is guaranteed to refuse

#### Remarks

Only looks at the configuration, never touches storage. Before building the snapshot there is no other way to know: trying by deleting once would delete a database whose identity has not been verified —
if the snapshot factory is misconfigured and points at the main database's storage, that would be the main database. And a snapshot database that can be built but not deleted throws on close, and every subsequent recycle reports an error.

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`canDropStorage`](../../rxdb/classes/RxDBAdapterLocalBase.md#candropstorage)

***

### checkEntityConstraints() \{#checkentityconstraints\}

```ts
checkEntityConstraints(EntityTypes): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:807](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L807)

Read-only drift check: compares the storage constraints declared by metadata with the actual objects in `sqlite_master` (US-030 AC#10).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityTypes` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Called by the core inside `RxDB.connect()` at the same point as `reconcileEntityIndexes` (after user migrations and
the backfill of missing tables). Compares `ck_` CHECKs, `uq_` conditional unique indexes, and `ex_` interval exclusion triggers;
throws RxDBConstraintDriftError on mismatch.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`checkEntityConstraints`](../../rxdb/classes/RxDBAdapterLocalBase.md#checkentityconstraints)

***

### cleanAllCache() \{#cleanallcache\}

```ts
cleanAllCache(): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1238)

#### Returns

`void`

***

### cleanupIncompleteRestore() \{#cleanupincompleterestore\}

```ts
cleanupIncompleteRestore(): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:951](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L951)

Cleans up an unfinished restore (the page was closed mid-restore, or the cleanup itself failed after a failed restore).

#### Returns

`Promise`&lt;`boolean`&gt;

`true` when residue was actually cleaned up

#### Remarks

Must be called before connecting. Failing to acquire the exclusive lock means the target is being connected to or restored, reports `target_busy`;
does nothing when there is no incomplete marker. In-memory storage has no residue to speak of, always `false`.

#### Throws

RxDBBackupError `target_busy` / `unsupported_combination` / `cleanup_pending`

***

### completeBootstrap() \{#completebootstrap\}

```ts
completeBootstrap(): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:795](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L795)

**`Internal`**

Closes the **bootstrap window**: called once after `RxDB.connect()` finishes creating tables.

#### Returns

`void`

#### Remarks

Adapters with a built-in readiness gate (SQLite family / PGlite) let `query()` / `rawQuery()` /
`createTables()` skip the readiness gate inside the bootstrap window — that gate is waiting for exactly the `RxDB.connect()` that has not settled yet.
This method flips the state to `ready`; afterwards all entry points go through the normal readiness wait.
Adapters without a readiness gate keep the default no-op implementation.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`completeBootstrap`](../../rxdb/classes/RxDBAdapterLocalBase.md#completebootstrap)

***

### connect() \{#connect\}

```ts
connect(): Promise<IRxDBAdapter>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:780](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L780)

Establishes the connection and brings the system tables up to the current watermark.

#### Returns

`Promise`&lt;[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)&gt;

Itself, for chaining

#### Remarks

Table creation and system migration both happen here (see `isCurrentRxDBSystemVersion`), so it may be slow,
and it may throw `UnsupportedRxDBSystemVersionError` because the database is newer than this process.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`connect`](../../rxdb/interfaces/IRxDBAdapter.md#connect)

***

### createClient() \{#createclient\}

```ts
abstract protected createClient(): Promise<SqliteClientLike>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:572](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L572)

Creates or obtains the SQLite client.
Concrete adapters implement this method with their own backend's logic.

#### Returns

`Promise`&lt;[`SqliteClientLike`](../interfaces/SqliteClientLike.md)&gt;

***

### createRestoreTargetClient() \{#createrestoretargetclient\}

```ts
protected createRestoreTargetClient(): Promise<SqliteClientLike>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1562](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1562)

Opens the target connection used for restore or cleanup.

#### Returns

`Promise`&lt;[`SqliteClientLike`](../interfaces/SqliteClientLike.md)&gt;

A new connection to the target database

#### Remarks

The default is just [createClient](#createclient): browser backends' databases are only opened in same-origin contexts, and the exclusive Web Lock acquired before restore
already blocks all other connections. Backends whose database file may also be opened by other processes (desktop hosts) override it, making this connection
exclusively hold the underlying storage before returning and keep holding it until disconnect, so that from the empty-state check to the end of restore no one else can connect.

***

### createTables() \{#createtables\}

```ts
createTables<T>(EntityTypes, entities?): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:989](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L989)

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

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`createTables`](../../rxdb/classes/RxDBAdapterLocalBase.md#createtables)

***

### createUncachedRepository() \{#createuncachedrepository\}

```ts
createUncachedRepository<T>(EntityType, host): IRepository<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:766](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L766)

**`Internal`**

Creates a new repository bound to `host`, **without writing** it into `repository_cache`.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | The entity type |
| `host` | `RxDBAdapterSqliteBase` | The adapter the repository binds to (in a transaction scenario, the executor's facade) |

#### Returns

[`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

#### Remarks

Used by [SqliteTransactionExecutor.getRepository](SqliteTransactionExecutor.md#getrepository). The reason the cache must be bypassed: repositories in the cache
live as long as the adapter; if a transaction-scoped repository were written into it, it would remain in the cache after the transaction ends, pointing at a
committed/rolled-back transaction context, and subsequent **external** writes would hit it.

***

### createWorktreeTableSet() \{#createworktreetableset\}

```ts
createWorktreeTableSet(
   executor, 
   tableSet, 
   seed
): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1019](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1019)

Creates and seeds a writable checkout's table set inside the caller's transaction (US-314 B1.5); see `worktree/worktree-table-set.ts` for the approach.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of a transaction on this adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | The table set to create; its members are decided by the caller (entities in the versioned domain) |
| `seed` | [`WorktreeTableSetSeed`](../../rxdb/interfaces/WorktreeTableSetSeed.md) | Holds the branches and the increments to apply on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) When given the main table set, when a member is an entity that does not record a change log, when an increment falls outside the table set, or when the main table is missing columns

#### Remarks

Does not write the holding key: the checkout-opening flow writes it itself in the same transaction. The main table set is created along with database creation and table creation ([RxDBAdapterSqliteBase.createTables](#createtables)), not through here.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`createWorktreeTableSet`](../../rxdb/classes/RxDBAdapterLocalBase.md#createworktreetableset)

***

### deleteByIds() \{#deletebyids\}

```ts
deleteByIds(entityName, ids): Observable<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1475](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1475)

Batch delete by a list of IDs (QueryCache only)

Used to clean up data deleted remotely from the local cache.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | The entity name |
| `ids` | `string`[] | The list of IDs to delete |

#### Returns

`Observable`&lt;`void`&gt;

`Observable<void>`

#### Example

```typescript
adapter.deleteByIds('Product', ['p1', 'p2']).subscribe();
```

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`deleteByIds`](../../rxdb/classes/RxDBAdapterLocalBase.md#deletebyids)

***

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:816](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L816)

Disconnects and releases the underlying handle.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Unlike `RxDB.destroy()`, disconnecting is **reversible**: the same adapter instance can `connect()` again afterwards.
The implementation must be idempotent — calling it while not connected is a no-op rather than an error.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`disconnect`](../../rxdb/interfaces/IRxDBAdapter.md#disconnect)

***

### dropStorage()? \{#dropstorage\}

```ts
dropStorage?(): Promise<void>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:681

Permanently deletes this adapter's persistent storage of this database (read-only checkout recycles the snapshot database, US-313).

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

Throws while this adapter is still connected: disconnect first, then delete

#### Remarks

The storage location is derived the same way as at connection time (`rxdb.config.dbName` plus adapter options); does nothing if the database does not exist.
An in-memory database is gone on disconnect, so this is a no-op here too. What is deleted cannot be recovered: the caller must first confirm no other context is still using this database.

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`dropStorage`](../../rxdb/classes/RxDBAdapterLocalBase.md#dropstorage)

***

### dropWorktreeTableSet() \{#dropworktreetableset\}

```ts
dropWorktreeTableSet(executor, tableSet): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1041](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1041)

Drops a writable checkout's table set inside the caller's transaction (US-314 B1.5): found via the directory, triggers removed first, then tables dropped.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of a transaction on this adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | The table set to drop |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) When given the main table set

#### Remarks

The holding keys on branch tables are not released here; the checkout-closing flow releases them itself in the same transaction.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`dropWorktreeTableSet`](../../rxdb/classes/RxDBAdapterLocalBase.md#dropworktreetableset)

***

### emitChangeError() \{#emitchangeerror\}

```ts
emitChangeError(event): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:720](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L720)

Reports a change handling failure.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | [`SqliteChangeErrorEvent`](../interfaces/SqliteChangeErrorEvent.md) | Failure details |

#### Returns

`void`

#### Remarks

Called by the change handling pipeline (`handle_rxdb_change`), not intended for application code. This method **never throws**:
the path it sits on has no caller that can catch the exception; throwing would only become an unhandled rejection.

***

### getEntityByRowId() \{#getentitybyrowid\}

```ts
getEntityByRowId(rowId, EntityType): any;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1230](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1230)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rowId` | `bigint` |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Returns

`any`

***

### getMetadataByIds() \{#getmetadatabyids\}

```ts
getMetadataByIds(entityName, ids): Observable<Map<string, string>>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1405](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1405)

Gets the metadata of a given list of IDs (QueryCache only)

Used for local cache freshness checks; returns an ID → updatedAt map.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | The entity name |
| `ids` | `string`[] | The list of entity IDs |

#### Returns

`Observable`&lt;`Map`&lt;`string`, `string`&gt;&gt;

`Observable<Map<string, string>>` - ID → updatedAt map

#### Example

```typescript
adapter.getMetadataByIds('Product', ['p1', 'p2'])
  .subscribe(map => {
    // map: Map `{ 'p1' => '2026-01-12T10:00:00Z', 'p2' => '2026-01-12T09:30:00Z' }`
  });
```

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`getMetadataByIds`](../../rxdb/classes/RxDBAdapterLocalBase.md#getmetadatabyids)

***

### getRepository() \{#getrepository\}

```ts
getRepository<T, RT>(EntityType): RT;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:739](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L739)

Gets the repository instance of this entity on **this adapter**.

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

#### Remarks

Returns the repository on the adapter axis (see [AdapterRepositoryConstructor](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)),
which is not the same object as the facade repository users usually get from `RxDB.getRepository()`.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`getRepository`](../../rxdb/interfaces/IRxDBAdapter.md#getrepository)

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`getRepository`](../../rxdb/classes/RxDBAdapterLocalBase.md#getrepository)

***

### getRowIdByEntity() \{#getrowidbyentity\}

```ts
getRowIdByEntity(entity): bigint | undefined;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1234)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entity` | `any` |

#### Returns

`bigint` \| `undefined`

***

### getRxDBChangeSequence() \{#getrxdbchangesequence\}

```ts
getRxDBChangeSequence(): Promise<number>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1370](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1370)

#### Returns

`Promise`&lt;`number`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`getRxDBChangeSequence`](../../rxdb/classes/RxDBAdapterLocalBase.md#getrxdbchangesequence)

***

### importWorktreeSnapshot() \{#importworktreesnapshot\}

```ts
importWorktreeSnapshot(snapshot): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:658](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L658)

Writes the rows and increments read from the main database into this database (read-only checkout builds a snapshot, US-313).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `snapshot` | [`WorktreeSnapshotImport`](../../rxdb/interfaces/WorktreeSnapshotImport.md) | The tables to copy and the increments applied on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) This database has a capture runtime installed

#### Remarks

One transaction, no events dispatched: the entities of a snapshot instance are all `log: false`, with no change log to derive events from.
The increments use the same SQL generation as branch switching, except encrypted columns go through the envelope passthrough.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`importWorktreeSnapshot`](../../rxdb/classes/RxDBAdapterLocalBase.md#importworktreesnapshot)

***

### internalQuery() \{#internalquery\}

```ts
internalQuery(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1366](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1366)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sql` | `string` |
| `bindings?` | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../interfaces/SqliteSuccessResult.md)&gt;

***

### isEncryptedAtRest() \{#isencryptedatrest\}

```ts
isEncryptedAtRest(value): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:626](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L626)

Determines whether a persisted value is already in the encrypted at-rest form (FR-038).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value in the persisted column |

#### Returns

`boolean`

`true` when it is an envelope string

#### Remarks

There is only one authoritative judgment function, `isEnvelope` from `@aiao/rxdb-adapter-encrypted` — this method is
a one-line forward from the core's optional slot ([RxDBAdapterLocalBase.isEncryptedAtRest](../../rxdb/classes/RxDBAdapterLocalBase.md#isencryptedatrest)) to it,
not another shape recognized locally. `@aiao/rxdb` cannot depend on the encryption package (the dependency direction is reversed), so this line
can only live on the adapter side.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`isEncryptedAtRest`](../../rxdb/classes/RxDBAdapterLocalBase.md#isencryptedatrest)

***

### isTableExisted() \{#istableexisted\}

```ts
isTableExisted<T>(EntityType): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:981](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L981)

Whether the table corresponding to this entity already exists in the database.

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

#### Remarks

Asks about the **physical table**, not whether this entity is registered in metadata.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`isTableExisted`](../../rxdb/interfaces/IRxDBAdapter.md#istableexisted)

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`isTableExisted`](../../rxdb/classes/RxDBAdapterLocalBase.md#istableexisted)

***

### listWorktreeTableSetSuffixes() \{#listworktreetablesetsuffixes\}

```ts
listWorktreeTableSetSuffixes(executor): Promise<readonly string[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1056](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1056)

Lists the existing writable checkout table sets via the directory (US-314 B2.6): which set each table whose name ends with `$<suffix>` belongs to.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of a transaction on this adapter |

#### Returns

`Promise`&lt;readonly `string`[]&gt;

The table set suffixes, sorted and deduplicated; a configured entity's main table that happens to have exactly this shape does not count

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`listWorktreeTableSetSuffixes`](../../rxdb/classes/RxDBAdapterLocalBase.md#listworktreetablesetsuffixes)

***

### mergeChanges() \{#mergechanges\}

```ts
mergeChanges(
   actions, 
   localChanges?, 
   disableTriggers?
): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1207](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1207)

Applies compressed changes to local entity tables

Implementation strategy (SQLite):
1. Convert actions to SQL operations
2. In a transaction:
   a) Execute the SQL operations on the entity tables (INSERT/UPDATE/DELETE)
   b) Batch-insert localChanges into the RxDBChange table (for history tracking)
3. Send local events to notify UI updates

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `actions` | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md) | `undefined` | The set of compressed change operations (pulled from the remote) |
| `localChanges?` | `Omit`&lt;[`RxDBChange`](../../rxdb/classes/RxDBChange.md), `"id"`&gt;[] | `undefined` | Records to save to the local RxDBChange table (optional) |
| `disableTriggers?` | `boolean` | `false` | Whether to disable triggers (used for operations such as pull, to avoid creating RxDBChange) |

#### Returns

`Promise`&lt;`void`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`mergeChanges`](../../rxdb/classes/RxDBAdapterLocalBase.md#mergechanges)

***

### migrateSystemSchema() \{#migratesystemschema\}

```ts
migrateSystemSchema(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1060](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1060)

Upgrades the tables owned by RxDB before app migrations or repository operations run.
Adapters that do not need to persist system schema state keep the default no-op implementation.

#### Returns

`Promise`&lt;`void`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`migrateSystemSchema`](../../rxdb/classes/RxDBAdapterLocalBase.md#migratesystemschema)

***

### mutations() \{#mutations\}

```ts
mutations<T>(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:971](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L971)

Batch-mutates entities (create/update/delete)

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

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`mutations`](../../rxdb/interfaces/IRxDBAdapter.md#mutations)

***

### persistentBackupStorage() \{#persistentbackupstorage\}

```ts
protected persistentBackupStorage(label): SqliteBackupStorage;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1534](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1534)

Generates the description of a persistent storage backend.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `label` | `string` | The storage name written into the manifest, for example `idb` / `opfs` |

#### Returns

[`SqliteBackupStorage`](../type-aliases/SqliteBackupStorage.md)

A persistent backend whose `storageKey` is `<adapter>:<label>:<dbName>`

***

### physicalTableNames() \{#physicaltablenames\}

```ts
physicalTableNames(metadata): readonly string[];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1192)

The SQLite family folds the namespace into the table name: `public$todos`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |

#### Returns

readonly `string`[]

The logical name (the base class's one) plus the name this family actually creates

#### Remarks

The whole point of the override is **to keep the rules in one place**: the name is given by [get\_table\_name\_by\_metadata](../functions/get_table_name_by_metadata.md),
the same function used by table creation, queries, and triggers. Before this, the versioned domain of `@aiao/rxdb-plugin-working-tree`
assembled its own copy by splitting on `'$'`; when the assembly rule changed, that copy did not error — it just started failing to recognize the table, and
the raw-write gate silently allowed it through.

Keeping the logical name given by the base class instead of returning only the folded name: the raw judgment would rather **recognize one extra** name — an extra recognition only blocks
one statement that would not run on this backend anyway; the one name missed could be exactly the name a capture-bypassing write uses.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`physicalTableNames`](../../rxdb/classes/RxDBAdapterLocalBase.md#physicaltablenames)

***

### query() \{#query\}

```ts
query(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1252](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1252)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sql` | `string` |
| `bindings?` | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../interfaces/SqliteSuccessResult.md)&gt;

***

### rawQuery() \{#rawquery\}

```ts
rawQuery(sql, params?): Promise<RawQueryResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1291](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1291)

Raw SQL.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sql` | `string` |
| `params?` | `unknown`[] |

#### Returns

`Promise`&lt;[`RawQueryResult`](../../rxdb/interfaces/RawQueryResult.md)&gt;

#### Remarks

**The judgment comes from the core package; here it is only wired up** (adapter-contract.md §2). `rawQuery?()` is
an optional method on `IRxDBAdapter`, so the core package cannot wrap it for the adapter the way it does the four capture mount points, so this one
`gateRawWrite` is the only place this class must get right. The judgment itself is not rewritten by a single word here — if any one of the six implementations
wrote the lexical normalization loosely, the whole line of defense would have a hole, and that hole would never show up in any single backend's own tests.

This one line covers the **5 v1 adapters** (wa-sqlite / sqlite-wasm / sqlite / sqliteai / electron):
they all extend this class and none of them overrides `rawQuery`. Writing it once in each of the five subclasses is the form T064 "do not write one per adapter" explicitly excludes;
the day a subclass really overrides `rawQuery`, it must wire it up itself, and that is covered by T068's 6 consistency call sites.

Registered business tables are refused before the transaction opens; calls that would have been allowed re-read the physical directory inside the execution transaction and pass the same gate again,
preventing shadow tables newly created by another instance from slipping through. Both judgments happen before the business statement is issued. The original behavior is kept inside the bootstrap window when capture is not installed.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`rawQuery`](../../rxdb/interfaces/IRxDBAdapter.md#rawquery)

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

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:639](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L639)

Reads one page of rows in storage form (read-only checkout builds a snapshot, US-313).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of a main-database transaction |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md) | The entity class on the main instance |
| `after` | \| [`WorktreeSnapshotCursor`](../../rxdb/type-aliases/WorktreeSnapshotCursor.md) \| `null` | The cursor of the previous page; `null` reads from the beginning |
| `limit` | `number` | At most how many rows per page |

#### Returns

`Promise`&lt;[`WorktreeSnapshotPage`](../../rxdb/interfaces/WorktreeSnapshotPage.md)&gt;

Rows of raw SQLite values, paginated by rowid

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`readWorktreeSnapshotPage`](../../rxdb/classes/RxDBAdapterLocalBase.md#readworktreesnapshotpage)

***

### ready() \{#ready\}

```ts
protected ready(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1580](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1580)

The readiness gate: **must be called before acquiring a queue slot, never inside a queue task**.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Queue concurrency is 1. Waiting on `RxDB.connect()` inside the critical section would form a cycle: the first-install path of `RxDB.connect()` depends on
the watermark transaction behind the queue to finish, and that transaction can never get the occupied slot (the measured trace is in design doc §1.2).

The gate waits for the **entire `RxDB.connect()`**, not "has this adapter's client connected". Between the two lie table creation,
system migration and the watermark; it once allowed through on client state, so external writes arriving in this window hit tables that did not exist yet
(`no such table`). `RxDB.connect()` caches its promise by name, so when it is already complete this is just one extra
microtask hop.

The bootstrap chain itself **must not** go through this gate (that would be waiting on itself); it always goes through [bootstrapTransaction](#bootstraptransaction).

***

### reconcileEntityIndexes()? \{#reconcileentityindexes\}

```ts
reconcileEntityIndexes?(EntityTypes): Promise<void>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:611

Idempotently converges entity indexes after user migrations and backfilling of missing tables.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityTypes` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`reconcileEntityIndexes`](../../rxdb/classes/RxDBAdapterLocalBase.md#reconcileentityindexes)

***

### removeCacheEntity() \{#removecacheentity\}

```ts
removeCacheEntity(entity): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1221)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entity` | `any` |

#### Returns

`void`

***

### removeChangeErrorListener() \{#removechangeerrorlistener\}

```ts
removeChangeErrorListener(listener): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:707](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L707)

Cancels a subscription made with [addChangeErrorListener](#addchangeerrorlistener).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `listener` | [`SqliteChangeErrorListener`](../type-aliases/SqliteChangeErrorListener.md) | The same function reference passed at registration |

#### Returns

`void`

***

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:963](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L963)

Batch-deletes entities.

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

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`removeMany`](../../rxdb/interfaces/IRxDBAdapter.md#removemany)

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
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterSqliteBase`, `RT`&gt; |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`repository`](../../rxdb/classes/RxDBAdapterLocalBase.md#repository)

***

### restore() \{#restore\}

```ts
restore(source, options?): Promise<RxDBRestoreResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:922](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L922)

Restores the archive produced by [backup](#backup) into the empty storage configured for this adapter.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | `ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; | The archive byte stream |
| `options?` | [`SqliteRestoreOptions`](../interfaces/SqliteRestoreOptions.md) | Cancellation signal and stage callbacks |

#### Returns

`Promise`&lt;[`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md)&gt;

The end marker and the manifest

#### Remarks

Must be called before `rxdb.connect()` (obtain the not-yet-connected instance via `rxdb.getAdapter(name)`): when already connected or restoring,
reports `target_busy`. Only writes to an **empty** target; compatibility (adapter, engine major version, virtual table modules, system table / change encoding version,
entity structure fingerprint, encryption auth domain) is checked before the first statement is written, and commits only after all checks pass.

- Persistent storage: after restore completes, a normal `rxdb.connect()` is enough; if the page is closed mid-restore, later connections report `restore_incomplete`,
  and [cleanupIncompleteRestore](#cleanupincompleterestore) must run first.
- In-memory storage: the restored database only lives in this instance, taken over by the next `rxdb.connect()`; when not connecting, [disconnect](#disconnect) releases it.

Rows written by a restore do not produce change history; encrypted databases stay locked. The input stream is cancelled on failure; on success only the read lock is released.

#### Throws

RxDBBackupError See RxDBBackupErrorCode; `cleanup_pending` means even the cleanup after failure was not finished

#### Example

```typescript
rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS' }));
const adapter = await rxdb.getAdapter('wa-sqlite');
await adapter.restore(file.stream());
await rxdb.connect('wa-sqlite');
```

***

### runInTransaction() \{#runintransaction\}

```ts
runInTransaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1353](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1353)

Executes the transaction work.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-7"></a> `T` *extends* [`TransactionFun`](../type-aliases/TransactionFun.md) |

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `transactionFun` | `T` | `undefined` | The transaction work; its parameter is the current transaction executor |
| `transactionLog?` | `boolean` | `true` | - |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The return value of the transaction work

#### Remarks

The real adapter entry always opens a new transaction; the executor facade maps `runInTransaction()` inside a transaction to
`executor.run()`, reusing the current transaction without re-enqueueing.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`runInTransaction`](../../rxdb/classes/RxDBAdapterLocalBase.md#runintransaction)

***

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:955](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L955)

Batch-writes entities (inserts when absent, updates when present).

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

The entities after persistence; fields backfilled by the database, such as the primary key and database-side defaults, only have values here

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`saveMany`](../../rxdb/interfaces/IRxDBAdapter.md#savemany)

***

### sealWorktreeReadOnly() \{#sealworktreereadonly\}

```ts
sealWorktreeReadOnly(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:685](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L685)

Seals this database read-only (read-only checkout, US-313): from now on write statements on this connection are rejected by SQLite.

#### Returns

`Promise`&lt;`void`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`sealWorktreeReadOnly`](../../rxdb/classes/RxDBAdapterLocalBase.md#sealworktreereadonly)

***

### setRxDBChangeSequence() \{#setrxdbchangesequence\}

```ts
setRxDBChangeSequence(sequence): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1376](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1376)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sequence` | `number` |

#### Returns

`Promise`&lt;`void`&gt;

***

### settleRepositoryTransaction() \{#settlerepositorytransaction\}

```ts
protected settleRepositoryTransaction(executor, committed): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:793

Commits or rolls back the entity state of the public repository; must be called before handing the transaction queue back.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) |
| `committed` | `boolean` |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`settleRepositoryTransaction`](../../rxdb/classes/RxDBAdapterLocalBase.md#settlerepositorytransaction)

***

### setWorkingTreeCaptureHook() \{#setworkingtreecapturehook\}

```ts
setWorkingTreeCaptureHook(hook): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:429

**`Internal`**

Installs or uninstalls the capture runtime (the four mount points of adapter-contract.md §1).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `hook` | \| [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md) \| `undefined` | The runtime taking over the four mount points; `undefined` uninstalls |

#### Returns

`void`

#### Remarks

The mounting lives **here** rather than each of the six adapters inserting a line in its own `transaction()`: writing it one fewer time,
or one step too late (validating the token only after the business write), would be discoverable by nothing at all — and that is exactly the form §2 "the judgment implementation exists in only one place" exists to rule out.

The callers are `RxDB.connect()` (after confirming the capability bit is true) and `workingTree.enable()` (after a successful flip).
On databases where it is not enabled it is never called, so the four write primitives do not even have one layer of forwarding.

Idempotent: if already installed, it uninstalls first and then installs, never stacking into two layers.

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`setWorkingTreeCaptureHook`](../../rxdb/classes/RxDBAdapterLocalBase.md#setworkingtreecapturehook)

***

### shadowTablesWritable() \{#shadowtableswritable\}

```ts
protected shadowTablesWritable(): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1548](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1548)

Whether this backend can write the shadow tables of virtual tables (FTS5's `_data`, `_idx`, etc.).

#### Returns

`boolean`

`true` when writable

#### Remarks

The archive preserves shadow tables row by row as-is, and restore must rewrite them wholesale. Allowed by default; backends running SQLite in defensive mode cannot modify shadow tables,
so they override to `false`: backing up and restoring a database containing shadow tables reports `unsupported_combination`, rather than producing an archive it cannot restore itself,
or failing halfway through the write.

***

### sharedClientLockName() \{#sharedclientlockname\}

```ts
protected sharedClientLockName(): string | undefined;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1594](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1594)

The Web Lock name used for cross-tab serial transactions when a client is shared by multiple tabs; returns `undefined` (default) when not shared.

#### Returns

`string` \| `undefined`

The lock name; adapters on the same shared connection must give the same name

#### Remarks

Under SharedWorker transport, each tab's adapter only serializes its own queue: while one tab's transaction is open, another tab's statements fall into
that transaction (US-314 B2.3b, fixed on main). With a lock name given, every queued task runs inside this lock; upon acquiring the lock it first rolls back the transaction left by a dead tab
([SqliteClientLike.rollbackOrphanTransaction](../interfaces/SqliteClientLike.md#rollbackorphantransaction)), and disconnect becomes handing back one's own share ([SqliteClientLike.release](../interfaces/SqliteClientLike.md#release)).

***

### switchBranch() \{#switchbranch\}

```ts
switchBranch(options): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1203](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1203)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`SwitchBranchOptions`](../../rxdb/interfaces/SwitchBranchOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`switchBranch`](../../rxdb/classes/RxDBAdapterLocalBase.md#switchbranch)

***

### transaction() \{#transaction\}

```ts
transaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1307](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1307)

Reads and writes within the same transaction through the executor.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-9"></a> `T` *extends* [`TransactionFun`](../type-aliases/TransactionFun.md) |

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `transactionFun` | `T` | `undefined` | The callback holding this transaction's executor |
| `transactionLog?` | `boolean` | `true` | Whether to record a transaction log |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The callback's result

#### Remarks

An `entity.save()` that does not hold the executor re-enqueues. Waiting on it inside a transaction callback waits on itself, and the transaction cannot end.
Inside a transaction use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository); for the save entry of entity instances see [EntityBase.save](../../rxdb/classes/EntityBase.md#save).

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
// ❌ The entity instance does not hold the executor; save() re-enqueues and waits for the current transaction to end.
await adapter.transaction(async () => {
  await entity.save();
});
```

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`transaction`](../../rxdb/classes/RxDBAdapterLocalBase.md#transaction)

***

### transactionalRepository() \{#transactionalrepository\}

```ts
protected transactionalRepository<T, R>(EntityType, repository): R;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:795

Puts the public repository's whole operation into a transaction; not called when the executor creates a repository.

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

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`transactionalRepository`](../../rxdb/classes/RxDBAdapterLocalBase.md#transactionalrepository)

***

### upsertMany() \{#upsertmany\}

```ts
upsertMany<T>(entityName, data): Observable<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1435](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1435)

Batch upserts data (QueryCache only)

Executes INSERT OR REPLACE semantics, used for caching remotely pulled data.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-11"></a> `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | The entity name |
| `data` | `T`[] | The list of data to write |

#### Returns

`Observable`&lt;`void`&gt;

`Observable<void>`

#### Example

```typescript
adapter.upsertMany('Product', [product1, product2]).subscribe();
```

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`upsertMany`](../../rxdb/classes/RxDBAdapterLocalBase.md#upsertmany)

***

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:843](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L843)

The version number of the underlying database engine (for example SQLite's `3.45.0`), for diagnostics and capability judgment.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Unrelated to the system table watermark number (`RXDB_SYSTEM_SCHEMA_VERSION`), which is RxDB's own number.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`version`](../../rxdb/interfaces/IRxDBAdapter.md#version)

***

### worktreeTableSetMounted() \{#worktreetablesetmounted\}

```ts
worktreeTableSetMounted(): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1248](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1248)

**`Internal`**

Clears the row-id cache after this instance remounts onto a different table set (US-314 B1.4): row ids are recorded per physical table; after switching to a different set, the same row id refers to a different row.

#### Returns

`void`

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`worktreeTableSetMounted`](../../rxdb/classes/RxDBAdapterLocalBase.md#worktreetablesetmounted)

***

### writeQuery() \{#writequery\}

```ts
writeQuery(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1265](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1265)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sql` | `string` |
| `bindings?` | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../interfaces/SqliteSuccessResult.md)&gt;
