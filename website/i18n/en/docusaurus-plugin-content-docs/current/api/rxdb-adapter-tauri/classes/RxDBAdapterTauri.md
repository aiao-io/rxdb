# RxDBAdapterTauri

Defined in: [packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts#L30)

Connects RxDB to a real SQLite file in the Tauri app's private directory.

## Remarks

Data lives in the Rust host's `rusqlite` connection; the WebView only sends commands through a
narrow transport, so it gets neither a filesystem handle nor a physical path (AC#3).

The adapter has no query implementation of its own: it reuses the full SQL, transaction, and branch
switching logic of [RxDBAdapterSqliteBase](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md),
only swapping "where the client comes from" to the desktop host. The Electron side is an isomorphic
class (`RxDBAdapterElectron` of `@aiao/rxdb-adapter-electron`); both share the same wire protocol and
renderer client — the only differences are what language the host is implemented in, and how the
transport is built.

## Extends

- [`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md)

## Constructors

### Constructor

```ts
new RxDBAdapterTauri(rxdb, options): RxDBAdapterTauri;
```

Defined in: [packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts#L46)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) | The bound RxDB instance |
| `options` | [`TauriOptions`](../interfaces/TauriOptions.md) | Transport and logical database name |

#### Returns

`RxDBAdapterTauri`

#### Throws

[RxDBAdapterDesktopError](RxDBAdapterDesktopError.md) throws `invalid_database_name` when the logical database name escapes the app scope

#### Overrides

`RxDBAdapterSqliteBase.constructor`

## Properties

### clientOwner \{#clientowner\}

```ts
protected readonly clientOwner: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:33

Holder key of this adapter on the client: handed to the client during `init` in `createClient()`, and
carried both when registering listeners and when handing the client back on disconnect (US-314 B2.3b).

#### Remarks

In a SharedWorker there is only one client, and every tab's adapter connects to it; on disconnect,
this key is used to return only its own share and remove only its own listeners
([SqliteClientLike.release](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#release)).
Backends that do not share a client can ignore it.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`clientOwner`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#clientowner)

***

### name \{#name\}

```ts
readonly name: string = ADAPTER_NAME;
```

Defined in: [packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts#L34)

Adapter name, the same value as the key used when registering with `RxDB.adapter()`; error messages
and `getAdapter()` identify adapters by it

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`name`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#name)

***

### options \{#options\}

```ts
readonly options: TauriOptions;
```

Defined in: [packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts#L48)

Transport and logical database name

***

### repository\_cache \{#repository_cache\}

```ts
protected readonly repository_cache: Map<EntityType, RepositoryInstance<EntityType>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:349

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`repository_cache`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#repository_cache)

***

### repository\_map \{#repository_map\}

```ts
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterTauri, RepositoryInstance<EntityType>>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:348

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`repository_map`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#repository_map)

***

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:347

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`rxdb`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#rxdb)

## Accessors

### databaseName \{#databasename\}

#### Get Signature

```ts
get databaseName(): string;
```

Defined in: [packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts#L37)

The resolved logical database name, one-to-one with the physical file on the host side.

##### Returns

`string`

***

### encryption \{#encryption\}

#### Get Signature

```ts
get encryption(): AdapterEncryptionFacade;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:41

##### Returns

[`AdapterEncryptionFacade`](../../rxdb-adapter-sqlite-core/interfaces/AdapterEncryptionFacade.md)

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`encryption`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#encryption)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`encryptionContext`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#encryptioncontext)

***

### tableSet \{#tableset\}

#### Get Signature

```ts
get tableSet(): WorktreeTableSet;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:411

The set of business tables this instance is mounted on (US-314 in-database shadow tables).

##### Remarks

It lives on the RxDB instance ([RxDB.worktreeTableSet](../../rxdb/classes/RxDB.md#worktreetableset-1)) and is only
read through here: one instance mounts one table set at a time, and storing a copy on the adapter
would be a second source of truth. SQL that reads and writes business tables resolves physical names
through it; entities without replicas, such as system tables and QueryCache, always land in the main
table set regardless of which set is mounted.

##### Returns

[`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`tableSet`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#tableset)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`workingTreeCaptureHook`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#workingtreecapturehook)

***

### workingTreeRawWriteContext \{#workingtreerawwritecontext\}

#### Get Signature

```ts
get workingTreeRawWriteContext(): RawWriteContext;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:402

**`Internal`**

This adapter's current raw-write judgment context (adapter-contract.md §2).

##### Remarks

`rawQuery?()` is an **optional method** on this interface (see `IRxDBAdapter` above), so the core
package cannot wrap it for the adapter the way it does for the four capture mount points — the
judgment can only be invoked by each adapter's own `rawQuery` implementation calling
`gateRawWrite(sql, ctx, …)`. The `ctx` that call needs is handed out here, so the only thing the six
adapters have to get right is "forward it to the judgment"; the two genuinely error-prone questions —
"how are capability bits computed" and "where does the domain come from" — never fall on them.

The capability bit is decided directly by **whether the capture runtime is installed**, not stored as
a separate boolean: the runtime is only installed when the bit is true (`RxDB.connect()` reads true,
or `workingTree.enable()` has just flipped it). Storing another copy would be a second source of
truth, and the consequence of the two drifting is one-directional — the gate thinks it is off, and
all raw writes pass through. The context object itself is built in `setWorkingTreeCaptureHook()` in
the **same assignment** as the runtime, not created anew on each read: the getter is called on every
raw statement, and it holds no per-call state. Both fields only ever change together in that one
place, so "a new runtime installed while the closure still binds the old one" is not a reachable
state.

What is handed out is the **judgment entry itself**, not the things the judgment looks at (domain,
column set, trusted intent). The core therefore never needs to restate what capture accepts, and
there is no "a copy of the domain was made, and derived index columns a plugin registers later only
land in one of the two lists" — the judgment always runs on the copy held by the runtime.

##### Returns

[`RawWriteContext`](../../rxdb/type-aliases/RawWriteContext.md)

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`workingTreeRawWriteContext`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#workingtreerawwritecontext)

## Methods

### addChangeErrorListener() \{#addchangeerrorlistener\}

```ts
addChangeErrorListener(listener): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:96

Subscribes to change-handling failures.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `listener` | [`SqliteChangeErrorListener`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteChangeErrorListener.md) | Callback receiving [SqliteChangeErrorEvent](../../rxdb-adapter-sqlite-core/interfaces/SqliteChangeErrorEvent.md); exceptions are isolated |

#### Returns

`void`

#### Remarks

Once a listener is registered, the default `console.error` fallback is handed over to the listener
(SQLC-012).

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`addChangeErrorListener`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#addchangeerrorlistener)

***

### adoptWorktreeEncryption() \{#adoptworktreeencryption\}

```ts
adoptWorktreeEncryption(source): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:83

Adopts the main database adapter's keyring (read-only checkout, US-313).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | [`LocalRxDBAdapter`](../../rxdb/type-aliases/LocalRxDBAdapter.md) | The main database's SQLite-family adapter |

#### Returns

`void`

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when `source` is not a SQLite-family adapter

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`adoptWorktreeEncryption`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#adoptworktreeencryption)

***

### assertDisconnectedForDrop() \{#assertdisconnectedfordrop\}

```ts
protected assertDisconnectedForDrop(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:331

Precondition guard of `dropStorage()`: rejects while still connected (a read-only checkout reclaiming its snapshot database, US-313).

#### Returns

`void`

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when the adapter is still connected

#### Remarks

`dropStorage()` lives on each concrete adapter rather than here: only they know where the database
lives (an IndexedDB database name, an OPFS file name, a file on the host), and a base-class
implementation would be inherited verbatim by subclasses such as Tauri and mini-programs that do not
know how to delete.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`assertDisconnectedForDrop`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#assertdisconnectedfordrop)

***

### backup() \{#backup\}

```ts
backup(sink, options?): Promise<RxDBBackupResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:164

Writes the entire database as a restorable archive.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sink` | `WritableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; | Output stream; closed on success, aborted on failure |
| `options?` | [`RxDBBackupOptions`](../../rxdb/interfaces/RxDBBackupOptions.md) | Cancellation signal and queue wait limit |

#### Returns

`Promise`&lt;[`RxDBBackupResult`](../../rxdb/interfaces/RxDBBackupResult.md)&gt;

End marker (entry count, byte count, SHA-256) and manifest; the output stream close has completed

#### Remarks

The archive is a logical dump: all structural statements and row literals, taken in the adapter's
serial queue and within a single read transaction, so it is consistent with one transaction commit
boundary and includes data already committed in the WAL. **The database is occupied for the whole
write**: while the output stream is applying backpressure, reads and writes during that time queue
up. Calling it inside this adapter's transaction callback would wait on itself until `lockTimeoutMs`
and then report `lock_timeout`.

The archive contains business tables, system tables, change history, and the keyring's ciphertext;
encrypted columns stay ciphertext and do not need unlocking; external files are not included
(`scope.externalFiles === 'excluded'`). See each adapter's README for supported storages.

#### Throws

RxDBBackupError `unsupported_combination` / `lock_timeout` / `aborted` / `io_error` / `storage_full`

#### Example

```typescript
const handle = await showSaveFilePicker({ suggestedName: 'notes.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());
console.log(result.sha256);
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`backup`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#backup)

***

### backupStorage() \{#backupstorage\}

```ts
protected backupStorage(): SqliteBackupStorage;
```

Defined in: [packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts#L74)

A desktop database is a single database file in the app data directory; backup and restore are supported on that basis.

#### Returns

[`SqliteBackupStorage`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteBackupStorage.md)

Persistent storage backend with `label` of `file`

#### Remarks

`storageKey` uses the database file name rather than `dbName`: two instances configured with the
same `databaseName` open the same file and must contend for the same lock; a same-named instance
restored to another `databaseName` (a new data location) is unrelated to the original database.

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`backupStorage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#backupstorage)

***

### bootstrapTransaction() \{#bootstraptransaction\}

```ts
bootstrapTransaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:304

**`Internal`**

Bootstrap-phase transaction: same as [transaction](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#transaction), but **skips the readiness gate**.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `transactionFun` | `T` | Transaction work; its parameter is the current transaction executor |
| `transactionLog?` | `boolean` | Whether to write a transaction log |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

#### Remarks

Only for `RxDB.connect()`'s bootstrap chain (watermark, table creation, migration) and this class's
own internal bootstrap steps — those already run inside `RxDB.connect()`'s promise, so waiting on
the readiness gate would be waiting on themselves.

Tables may not exist yet at this point; the bootstrap chain guarantees the order itself. Do **not**
call it inside a transaction body: the facade does not rewrite this method, so it lands on the real
adapter and enqueues again — re-enqueueing while holding a slot hangs forever.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`bootstrapTransaction`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#bootstraptransaction)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`cacheRowIdEntity`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#cacherowidentity)

***

### canDropStorage()? \{#candropstorage\}

```ts
canDropStorage?(): boolean;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:691

Whether [dropStorage](../../rxdb/classes/RxDBAdapterLocalBase.md#dropstorage) can delete this database under the current configuration (asked once before a read-only checkout builds its snapshot database, US-313).

#### Returns

`boolean`

When `false`, `dropStorage()` is guaranteed to refuse

#### Remarks

Checks configuration only, never touches storage. Before building the snapshot there is no other way
to know: trying by deleting first would delete a database whose identity has not been verified yet —
the main database, if the snapshot factory is misconfigured and points at the main storage. And a
snapshot database that can be built but not deleted throws on close, then reports an error on every
later reclamation.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`canDropStorage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#candropstorage)

***

### checkEntityConstraints() \{#checkentityconstraints\}

```ts
checkEntityConstraints(EntityTypes): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:138

Read-only drift check: compares the storage constraints declared by metadata against the actual objects in `sqlite_master` (US-030 AC#10).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityTypes` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Called by the core inside `RxDB.connect()` at the same point as `reconcileEntityIndexes` (after user
migrations and after missing tables are back-filled). Compares `ck_` CHECK constraints, `uq_`
conditional unique indexes, and `ex_` range-exclusion triggers; throws RxDBConstraintDriftError on
mismatch.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`checkEntityConstraints`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#checkentityconstraints)

***

### cleanAllCache() \{#cleanallcache\}

```ts
cleanAllCache(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:262

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`cleanAllCache`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#cleanallcache)

***

### cleanupIncompleteRestore() \{#cleanupincompleterestore\}

```ts
cleanupIncompleteRestore(): Promise<boolean>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:203

Cleans up an unfinished restore (the page closed mid-restore, or the cleanup itself failed after a failed restore).

#### Returns

`Promise`&lt;`boolean`&gt;

`true` when residue was actually cleaned up

#### Remarks

Must be called before connecting. Failing to take the exclusive lock means the target is being
connected or restored; report `target_busy`. Does nothing when there is no incomplete-restore marker.
In-memory storage has no residue to speak of and always returns `false`.

#### Throws

RxDBBackupError `target_busy` / `unsupported_combination` / `cleanup_pending`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`cleanupIncompleteRestore`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#cleanupincompleterestore)

***

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

Adapters with a readiness gate of their own (the SQLite family / PGlite) let `query()` / `rawQuery()` /
`createTables()` skip the gate during the bootstrap window — that gate is waiting on the very
`RxDB.connect()` that has not settled yet. This method flips the state to `ready`, after which every
entry goes through the normal readiness wait. Adapters without a readiness gate keep the default
no-op implementation.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`completeBootstrap`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#completebootstrap)

***

### connect() \{#connect\}

```ts
connect(): Promise<IRxDBAdapter>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:128

Establishes the connection and brings system tables up to the current watermark.

#### Returns

`Promise`&lt;[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)&gt;

Itself, for chaining

#### Remarks

Table creation and system migration both happen here (see `isCurrentRxDBSystemVersion`), so it can
be slow, and can throw `UnsupportedRxDBSystemVersionError` when the database is newer than this
process.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`connect`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#connect)

***

### createClient() \{#createclient\}

```ts
protected createClient(): Promise<DesktopSqliteClient>;
```

Defined in: [packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts#L57)

Creates or fetches the SQLite client.
Concrete adapters implement this method with the logic of their own backend.

#### Returns

`Promise`&lt;[`DesktopSqliteClient`](DesktopSqliteClient.md)&gt;

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createClient`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createclient)

***

### createRestoreTargetClient() \{#createrestoretargetclient\}

```ts
protected createRestoreTargetClient(): Promise<SqliteClientLike>;
```

Defined in: [packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts#L83)

Other windows and other processes may have the same database file open, and Web Locks cannot stop
them: before restore and cleanup, this connection takes the database file exclusively.

#### Returns

`Promise`&lt;[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)&gt;

A connection exclusively holding the database file

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createRestoreTargetClient`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createrestoretargetclient)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createTables`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createtables)

***

### createUncachedRepository() \{#createuncachedrepository\}

```ts
createUncachedRepository<T>(EntityType, host): IRepository<T>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:127

**`Internal`**

Creates a repository bound to `host` **without writing** it into `repository_cache`.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity type |
| `host` | [`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md) | The adapter the repository binds to (the executor's facade in a transaction) |

#### Returns

[`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

#### Remarks

For use by [SqliteTransactionExecutor.getRepository](../../rxdb-adapter-sqlite-core/classes/SqliteTransactionExecutor.md#getrepository). The cache must be
bypassed because: repositories in the cache live as long as the adapter; if a transaction-scoped
repository were written there, it would stay in the cache after the transaction ends, pointing at a
committed/rolled-back transaction context, and later **external** writes would hit it.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createUncachedRepository`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createuncachedrepository)

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

Creates and seeds a set of writable-checkout tables inside the caller's transaction (US-314 B1.5); see `worktree/worktree-table-set.ts`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | Executor of a transaction on this adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | The table set to create; members are chosen by the caller (entities in a versioned domain) |
| `seed` | [`WorktreeTableSetSeed`](../../rxdb/interfaces/WorktreeTableSetSeed.md) | Holds the branch and the increments to layer on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when given the main table set, when a member entity does not log changes, when an increment falls outside the table set, or when the main tables are missing columns

#### Remarks

Does not write the holding key: the checkout-opening flow writes it itself in the same transaction.
The main table set is created with the database ([RxDBAdapterSqliteBase.createTables](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createtables)), not through here.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createWorktreeTableSet`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createworktreetableset)

***

### deleteByIds() \{#deletebyids\}

```ts
deleteByIds(entityName, ids): Observable<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:321

Bulk delete by ID list (QueryCache only)

Used to clean up data already deleted remotely from the local cache.

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`deleteByIds`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#deletebyids)

***

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:139

Disconnects and releases the underlying handle.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Unlike `RxDB.destroy()`, disconnecting is **reversible**: the same adapter instance can `connect()`
again afterwards. Implementations must be idempotent — calling while not connected is a no-op, not an
error.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`disconnect`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#disconnect)

***

### dropStorage()? \{#dropstorage\}

```ts
dropStorage?(): Promise<void>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:681

Permanently deletes this adapter's persistent storage for this database (a read-only checkout reclaiming its snapshot database, US-313).

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

Throws while this adapter is still connected: disconnect first, then delete

#### Remarks

The storage location is derived with the same rules as at connect time (`rxdb.config.dbName` plus
adapter options); does nothing when the database does not exist. An in-memory database is gone on
disconnect, so this is a no-op here too. Deleted data cannot be recovered: the caller must first be
sure no other context is still using this database.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`dropStorage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#dropstorage)

***

### dropWorktreeTableSet() \{#dropworktreetableset\}

```ts
dropWorktreeTableSet(executor, tableSet): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:231

Deletes a set of writable-checkout tables inside the caller's transaction (US-314 B1.5): found via the catalog, triggers detached before the tables are dropped.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | Executor of a transaction on this adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | The table set to delete |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when given the main table set

#### Remarks

The holding keys on the branch tables are not released here; the checkout-closing flow releases them
itself in the same transaction.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`dropWorktreeTableSet`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#dropworktreetableset)

***

### emitChangeError() \{#emitchangeerror\}

```ts
emitChangeError(event): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:112

Reports a change-handling failure.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | [`SqliteChangeErrorEvent`](../../rxdb-adapter-sqlite-core/interfaces/SqliteChangeErrorEvent.md) | Failure details |

#### Returns

`void`

#### Remarks

Called by the change-handling pipeline (`handle_rxdb_change`), not for application code. This method
**never throws**: no caller on its path can catch an exception, and throwing would only become an
unhandled rejection.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`emitChangeError`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#emitchangeerror)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`getEntityByRowId`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#getentitybyrowid)

***

### getMetadataByIds() \{#getmetadatabyids\}

```ts
getMetadataByIds(entityName, ids): Observable<Map<string, string>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:319

Fetches metadata for a list of IDs (QueryCache only)

Used for local cache freshness checks; returns an ID → updatedAt map.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | Entity name |
| `ids` | `string`[] | List of entity IDs |

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`getMetadataByIds`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#getmetadatabyids)

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
| <a id="type-parameter-rt"></a> `RT` | [`SqliteRepository`](../../rxdb-adapter-wa-sqlite/classes/SqliteRepository.md)&lt;`T`&gt; |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityType` | `T` |

#### Returns

`RT`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`getRepository`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#getrepository)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`getRowIdByEntity`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#getrowidbyentity)

***

### getRxDBChangeSequence() \{#getrxdbchangesequence\}

```ts
getRxDBChangeSequence(): Promise<number>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:317

#### Returns

`Promise`&lt;`number`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`getRxDBChangeSequence`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#getrxdbchangesequence)

***

### importWorktreeSnapshot() \{#importworktreesnapshot\}

```ts
importWorktreeSnapshot(snapshot): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:76

Writes rows and increments read from the main database into this database (a read-only checkout building its snapshot, US-313).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `snapshot` | [`WorktreeSnapshotImport`](../../rxdb/interfaces/WorktreeSnapshotImport.md) | Tables to copy and the increments layered on top of them |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when this database has a capture runtime installed

#### Remarks

One transaction, no events dispatched: the snapshot instance's entities are all `log: false`, so
there is no change log to derive events from. Increments use the same SQL generation as branch
switching; only encrypted columns pass through the envelope verbatim.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`importWorktreeSnapshot`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#importworktreesnapshot)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`internalQuery`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#internalquery)

***

### isEncryptedAtRest() \{#isencryptedatrest\}

```ts
isEncryptedAtRest(value): boolean;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:55

Determines whether a stored value is already in encrypted at-rest form (FR-038).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value in a stored column |

#### Returns

`boolean`

`true` when it is an envelope string

#### Remarks

There is only one authoritative judge, `isEnvelope` from `@aiao/rxdb-adapter-encrypted` — this method
is a one-line forward from the core's optional slot
([RxDBAdapterLocalBase.isEncryptedAtRest](../../rxdb/classes/RxDBAdapterLocalBase.md#isencryptedatrest)) to it; no second shape is
recognized here. `@aiao/rxdb` cannot depend on the encryption package (the dependency direction is
reversed), so this line can only live on the adapter side.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`isEncryptedAtRest`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#isencryptedatrest)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`isTableExisted`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#istableexisted)

***

### listWorktreeTableSetSuffixes() \{#listworktreetablesetsuffixes\}

```ts
listWorktreeTableSetSuffixes(executor): Promise<readonly string[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:238

Lists existing writable-checkout table sets from the catalog (US-314 B2.6): which set each table whose name ends in `$<suffix>` belongs to.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | Executor of a transaction on this adapter |

#### Returns

`Promise`&lt;readonly `string`[]&gt;

Table set suffixes, sorted and deduplicated; a configured entity's main table that happens to look like this shape does not count

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`listWorktreeTableSetSuffixes`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#listworktreetablesetsuffixes)

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

Applies compressed changes to local entity tables

Implementation strategy (SQLite):
1. Convert actions to SQL operations
2. In a transaction:
   a) Execute SQL operations on entity tables (INSERT/UPDATE/DELETE)
   b) Bulk-insert localChanges into the RxDBChange table (for history tracking)
3. Emit local events to notify the UI to update

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `actions` | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md) | The compressed set of change operations (pulled from the remote) |
| `localChanges?` | `Omit`&lt;[`RxDBChange`](../../rxdb/classes/RxDBChange.md), `"id"`&gt;[] | Records to save to the local RxDBChange table (optional) |
| `disableTriggers?` | `boolean` | Whether to disable triggers (used by pull and similar operations to avoid creating RxDBChange records) |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`mergeChanges`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#mergechanges)

***

### migrateSystemSchema() \{#migratesystemschema\}

```ts
migrateSystemSchema(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:239

Upgrades RxDB-owned tables before application migrations or repository operations run.
Adapters that do not need to persist system schema state keep the default no-op implementation.

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`migrateSystemSchema`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#migratesystemschema)

***

### mutations() \{#mutations\}

```ts
mutations<T>(options): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:206

Batch-modifies entities (create/update/delete)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`mutations`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#mutations)

***

### persistentBackupStorage() \{#persistentbackupstorage\}

```ts
protected persistentBackupStorage(label): SqliteBackupStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:348

Generates the description of a persistent storage backend.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `label` | `string` | Storage name written into the manifest, e.g. `idb` / `opfs` |

#### Returns

[`SqliteBackupStorage`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteBackupStorage.md)

Persistent backend with `storageKey` of `<adapter>:<label>:<dbName>`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`persistentBackupStorage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#persistentbackupstorage)

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

The logical names (the base class's copy) plus the name this family actually builds

#### Remarks

The whole point of the override is **a single copy of the rule**: the name is given by
get\_table\_name\_by\_metadata, the same function used for table creation, queries, and triggers.
Before this, `@aiao/rxdb-plugin-working-tree`'s versioned domains assembled their own copy by `'$'`;
when the assembly changed, that copy did not error, it just stopped recognizing the table, and the
raw-write gate silently let it through.

Keeping the base class's logical names instead of returning only the folded name: the raw judgment
would rather **recognize one name too many** — recognizing extra only blocks a statement that would
not run on this backend anyway; the one name it might miss is exactly the name a capture-bypassing
write would use.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`physicalTableNames`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#physicaltablenames)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`query`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#query)

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

**The judgment comes from the core package; here only the wiring happens** (adapter-contract.md §2).
`rawQuery?()` is an optional method on `IRxDBAdapter`, so the core package cannot wrap it for the
adapter the way it does for the four capture mount points — this one `gateRawWrite` call is the only
thing this class has to get right. Not one word of the judgment itself is restated here — if any one
of the six implementations loosens the lexical normalization, the whole defense has a hole, and that
hole will not surface in any single backend's own tests.

This one call covers the **5 v1 adapters** (wa-sqlite / sqlite-wasm / sqlite / sqliteai / electron):
they all extend this class and none overrides `rawQuery`. Writing it separately in five subclasses is
the shape T064 "no per-copy implementations" explicitly rules out; if a subclass really overrides
`rawQuery` someday, it must wire it up itself, and that is covered by T068's six conformance call
sites.

Registered business tables are rejected before a transaction starts; calls that would have passed
re-read the physical catalog inside the execution transaction and pass the same gate again, to avoid
missing shadow tables created by another instance. Both judgments happen before the business
statement is sent. During the bootstrap window, with no capture installed, the original behavior is
kept.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`rawQuery`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#rawquery)

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

Reads one page of storage-form rows (a read-only checkout building its snapshot, US-313).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | Executor of a transaction on the main database |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md) | Entity class on the main instance |
| `after` | \| [`WorktreeSnapshotCursor`](../../rxdb/type-aliases/WorktreeSnapshotCursor.md) \| `null` | Cursor of the previous page; `null` reads from the start |
| `limit` | `number` | Maximum rows in this page |

#### Returns

`Promise`&lt;[`WorktreeSnapshotPage`](../../rxdb/interfaces/WorktreeSnapshotPage.md)&gt;

Rows of raw SQLite values, paginated by rowid

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`readWorktreeSnapshotPage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#readworktreesnapshotpage)

***

### ready() \{#ready\}

```ts
protected ready(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:385

Readiness gate: **must be called before taking a queue slot, never inside a queue task**.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

The queue concurrency is 1. Waiting on `RxDB.connect()` inside the critical section would form a
cycle: `RxDB.connect()`'s initial-install path depends on the watermark transaction behind the queue,
and that transaction can never take the occupied slot (measured trace in the design doc §1.2).

The gate waits on the **whole `RxDB.connect()`**, not "has this adapter's client connected". Table
creation, system migration, and the watermark sit in between; the gate once admitted on client state,
so external writes arriving in that window hit tables that did not exist yet (`no such table`).
`RxDB.connect()` itself caches its promise by name; once it is done, this costs one more microtask hop.

The bootstrap chain itself **must not** go through this gate (that would be waiting on itself); it
always goes through [bootstrapTransaction](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#bootstraptransaction).

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`ready`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#ready)

***

### reconcileEntityIndexes()? \{#reconcileentityindexes\}

```ts
reconcileEntityIndexes?(EntityTypes): Promise<void>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:611

Idempotently converges entity indexes after user migrations and missing-table back-fill.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityTypes` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`reconcileEntityIndexes`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#reconcileentityindexes)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`removeCacheEntity`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#removecacheentity)

***

### removeChangeErrorListener() \{#removechangeerrorlistener\}

```ts
removeChangeErrorListener(listener): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:102

Cancels the subscription of [addChangeErrorListener](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#addchangeerrorlistener).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `listener` | [`SqliteChangeErrorListener`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteChangeErrorListener.md) | The same function reference passed at registration time |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`removeChangeErrorListener`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#removechangeerrorlistener)

***

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:205

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`removeMany`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#removemany)

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
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterTauri`, `RT`&gt; |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`repository`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#repository)

***

### restore() \{#restore\}

```ts
restore(source, options?): Promise<RxDBRestoreResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:192

Restores the archive produced by [backup](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#backup) into this adapter configuration's empty storage.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | `ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; | Archive byte stream |
| `options?` | [`SqliteRestoreOptions`](../../rxdb-adapter-sqlite-core/interfaces/SqliteRestoreOptions.md) | Cancellation signal and phase callbacks |

#### Returns

`Promise`&lt;[`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md)&gt;

End marker and manifest

#### Remarks

Must be called before `rxdb.connect()` (obtain the unconnected instance via `rxdb.getAdapter(name)`):
when already connected or mid-restore it reports `target_busy`. Only writes into an **empty** target;
compatibility (adapter, engine major version, virtual-table modules, system-table / change-encoding
version, entity structure fingerprint, encryption authentication domain) is judged before the first
statement is written, and commits only after every check passes.

- Persistent storage: after restore completes, a normal `rxdb.connect()` is enough; if the page was
  closed mid-restore, later connections report `restore_incomplete` and must first
  [cleanupIncompleteRestore](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#cleanupincompleterestore).
- In-memory storage: the restored database only lives in this instance and is taken over by the next
  `rxdb.connect()`; without connecting, [disconnect](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#disconnect) releases it.

Restored rows produce no change history; an encrypted database stays locked. The input stream is
cancelled on failure and only releases its read lock on success.

#### Throws

RxDBBackupError see RxDBBackupErrorCode; `cleanup_pending` means the cleanup after the failure also did not finish

#### Example

```typescript
rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS' }));
const adapter = await rxdb.getAdapter('wa-sqlite');
await adapter.restore(file.stream());
await rxdb.connect('wa-sqlite');
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`restore`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#restore)

***

### runInTransaction() \{#runintransaction\}

```ts
runInTransaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:315

Executes transaction work.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-7"></a> `T` *extends* [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `transactionFun` | `T` | Transaction work; its parameter is the current transaction executor |
| `transactionLog?` | `boolean` | - |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The transaction work's return value

#### Remarks

The real adapter entry always opens a new transaction; the executor facade maps `runInTransaction()`
inside a transaction to `executor.run()`, reusing the current transaction without re-enqueueing.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`runInTransaction`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#runintransaction)

***

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:204

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

The entities after they hit the database; fields back-filled by the database (primary key, database-side defaults) only have values here

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`saveMany`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#savemany)

***

### sealWorktreeReadOnly() \{#sealworktreereadonly\}

```ts
sealWorktreeReadOnly(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:87

Seals this database read-only (read-only checkout, US-313): from now on, write statements on this connection are rejected by SQLite.

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`sealWorktreeReadOnly`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#sealworktreereadonly)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`setRxDBChangeSequence`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#setrxdbchangesequence)

***

### settleRepositoryTransaction() \{#settlerepositorytransaction\}

```ts
protected settleRepositoryTransaction(executor, committed): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:793

Commits or rolls back the public repositories' entity state; must be called before returning the transaction queue.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) |
| `committed` | `boolean` |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`settleRepositoryTransaction`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#settlerepositorytransaction)

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
| `hook` | \| [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md) \| `undefined` | Runtime taking over the four mount points; `undefined` uninstalls |

#### Returns

`void`

#### Remarks

The mounting lives **here** rather than each of the six adapters inserting its own line in its
`transaction()`: nothing would catch writing it one time fewer, or one step too late (validating the
token after the business write) — exactly the shape §2 "one copy of the judgment implementation" is
meant to rule out.

The callers are `RxDB.connect()` (after confirming the capability bit is true) and
`workingTree.enable()` (after the bit flip succeeds). On a database where the capability is off it is
never called at all, so the four write primitives carry not even a layer of forwarding.

Idempotent: if one is already installed it is uninstalled first, never stacked into two layers.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`setWorkingTreeCaptureHook`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#setworkingtreecapturehook)

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

The archive saves shadow tables row by row as-is, and restore has to rewrite them wholesale. Default
is yes; backends running SQLite in defensive mode cannot modify shadow tables and override to
`false`: backing up or restoring a database that contains shadow tables then reports
`unsupported_combination`, instead of producing an archive it cannot restore itself or failing
halfway through a write.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`shadowTablesWritable`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#shadowtableswritable)

***

### sharedClientLockName() \{#sharedclientlockname\}

```ts
protected sharedClientLockName(): string | undefined;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:396

Name of the Web Lock used to serialize transactions across tabs when a client is shared by multiple tabs; returns `undefined` (default) when not shared.

#### Returns

`string` \| `undefined`

The lock name; adapters on the same shared connection must return the same name

#### Remarks

Under SharedWorker transport, each tab's adapter only serializes its own queue: while one tab's
transaction is open, another tab's statements fall into that transaction (US-314 B2.3b, fixed on
main). With a lock name, every queued task runs inside this lock; upon taking the lock it first rolls
back any transaction a dead tab left behind
([SqliteClientLike.rollbackOrphanTransaction](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#rollbackorphantransaction)), and
disconnect becomes returning its own share ([SqliteClientLike.release](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#release)).

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`sharedClientLockName`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#sharedclientlockname)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`switchBranch`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#switchbranch)

***

### transaction() \{#transaction\}

```ts
transaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:288

Reads and writes within the same transaction through an executor.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-9"></a> `T` *extends* [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `transactionFun` | `T` | Callback holding this transaction's executor |
| `transactionLog?` | `boolean` | Whether to record a transaction log |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The callback result

#### Remarks

`entity.save()` without an executor re-enqueues. Awaiting it inside a transaction callback waits on
itself, and the transaction cannot end. Inside a transaction use
[TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository); for the save entry of entity
instances see [EntityBase.save](../../rxdb/classes/EntityBase.md#save).

#### Examples

```ts
// ✅ Obtain the repository through the executor; every read and write belongs to this transaction.
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
// ❌ An entity instance holds no executor; save() re-enqueues and waits for the current transaction to end.
await adapter.transaction(async () => {
  await entity.save();
});
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`transaction`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#transaction)

***

### transactionalRepository() \{#transactionalrepository\}

```ts
protected transactionalRepository<T, R>(EntityType, repository): R;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:795

Wraps a public repository's whole operation in a transaction; not called when the executor creates repositories.

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`transactionalRepository`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#transactionalrepository)

***

### upsertMany() \{#upsertmany\}

```ts
upsertMany<T>(entityName, data): Observable<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:320

Bulk upsert data (QueryCache only)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`upsertMany`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#upsertmany)

***

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:140

Version number of the underlying database engine (e.g. SQLite's `3.45.0`), for diagnostics and capability checks.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Unrelated to the system-table watermark number (`RXDB_SYSTEM_SCHEMA_VERSION`), which is RxDB's own
number.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`version`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#version)

***

### worktreeTableSetMounted() \{#worktreetablesetmounted\}

```ts
worktreeTableSetMounted(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:268

**`Internal`**

Clears the row-id cache after this instance remounts a table set (US-314 B1.4): row ids are keyed by
physical table, and with a different table set the same row id refers to a different row.

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`worktreeTableSetMounted`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#worktreetablesetmounted)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`writeQuery`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#writequery)
