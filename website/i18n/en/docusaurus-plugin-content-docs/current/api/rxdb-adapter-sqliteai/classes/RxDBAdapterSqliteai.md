# RxDBAdapterSqliteai

Defined in: [packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts#L19)

The RxDB local storage adapter based on `@sqliteai/sqlite-wasm`.

API-aligned with `rxdb-adapter-sqlite` (the official sqlite-wasm binding), with these differences:

- The WASM binary comes from SqliteAI's distribution (OPFS / Worker configuration identical)
- The client implementation extends `Oo1ClientBase`, reusing sqlite-core's queue and event batching

## Extends

- [`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md)

## Constructors

### Constructor

```ts
new RxDBAdapterSqliteai(rxdb, options): RxDBAdapterSqliteai;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts#L23)

#### Parameters

| Parameter | Type                                                  |
| --------- | ----------------------------------------------------- |
| `rxdb`    | [`RxDB`](../../rxdb/classes/RxDB.md)                  |
| `options` | [`SqliteaiOptions`](../interfaces/SqliteaiOptions.md) |

#### Returns

`RxDBAdapterSqliteai`

#### Overrides

`RxDBAdapterSqliteBase.constructor`

## Properties

### clientOwner \{#clientowner\}

```ts
protected readonly clientOwner: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:33

This adapter's owner key on the client: handed to the client at `init` inside
`createClient()`, and carried when registering listeners and returning on
disconnect (US-314 B2.3b).

#### Remarks

In a SharedWorker there is only one client, to which every tab's adapter is
connected; on disconnect this key returns only its own share and detaches only
its own listeners ([SqliteClientLike.release](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#release)).
Backends that don't share a client can ignore it.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`clientOwner`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#clientowner)

---

### name \{#name\}

```ts
readonly name: string = ADAPTER_NAME;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts#L21)

The adapter name, equal to the key used when registering with `RxDB.adapter()`; error messages and `getAdapter()` identify it by this value

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`name`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#name)

---

### options \{#options\}

```ts
readonly options: SqliteaiOptions;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts#L25)

---

### repository\_cache \{#repository_cache\}

```ts
protected readonly repository_cache: Map<EntityType, RepositoryInstance<EntityType>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:349

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`repository_cache`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#repository_cache)

---

### repository\_map \{#repository_map\}

```ts
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterSqliteai, RepositoryInstance<EntityType>>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:348

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`repository_map`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#repository_map)

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:347

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`rxdb`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#rxdb)

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`encryption`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#encryption)

---

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

---

### tableSet \{#tableset\}

#### Get Signature

```ts
get tableSet(): WorktreeTableSet;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:411

The set of business tables this instance is mounted on (US-314 in-database shadow tables)

##### Remarks

Lives on the RxDB instance ([RxDB.worktreeTableSet](../../rxdb/classes/RxDB.md#worktreetableset-1));
this is just a read-through: one instance mounts only one table set at a time,
and the adapter keeping another copy would be a second source of truth. All SQL
that reads/writes business tables resolves physical names against it; system
tables, QueryCache, and other entities without replicas always land in the main
table set regardless of which set is mounted.

##### Returns

[`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`tableSet`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#tableset)

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

The capture runtime; always `undefined` on databases without commit capability enabled.

##### Returns

\| [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md)
\| `undefined`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`workingTreeCaptureHook`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#workingtreecapturehook)

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

`rawQuery?()` is an **optional method** on this interface (see `IRxDBAdapter`
above), so the core package cannot wrap it for the adapters the way it does the
four capture mount points — the judgment can only be invoked by each adapter's
own `rawQuery` implementation calling `gateRawWrite(sql, ctx, …)`. The `ctx`
that call needs is handed out here, so the only thing the six adapters must get
right is "pass it to the judgment"; the two things that are actually easy to
get wrong — "how the capability bit is computed" and "where the domain comes
from" — never fall on any of them.

The capability bit is decided directly by **whether the capture runtime is
installed**, with no separate boolean: the runtime is only installed when the
capability bit is true (`RxDB.connect()` reads true, or `workingTree.enable()`
has just flipped it). Keeping another copy would be a second source of truth,
and the consequence of the two falling out of sync is one-directional — the
gate thinks it's off, and all raw writes are let through. The context object
itself is built in `setWorkingTreeCaptureHook()` in the **same assignment** as
the runtime, not created fresh on every read: the getter is called on every raw
statement while it holds no per-call state. The two fields only change together
in that one place, so "a new runtime installed while handing out a closure bound
to the old runtime" is not a reachable state.

What is handed out is the **judgment entry itself**, not the things the judgment
looks at (domain, column sets, trusted intents). The core therefore never
restates what capture recognizes, and there is no "the domain was copied out,
and derived index columns registered later by a plugin only land in one of the
copies" dual-list problem — the judgment always runs on the copy held by the runtime.

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

Subscribes to change-processing failures.

#### Parameters

| Parameter  | Type                                                                                                    | Description                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `listener` | [`SqliteChangeErrorListener`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteChangeErrorListener.md) | The callback receiving [SqliteChangeErrorEvent](../../rxdb-adapter-sqlite-core/interfaces/SqliteChangeErrorEvent.md); exceptions are isolated |

#### Returns

`void`

#### Remarks

As soon as a listener is registered, the default `console.error` fallback is
taken over by the listener (SQLC-012).

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`addChangeErrorListener`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#addchangeerrorlistener)

---

### adoptWorktreeEncryption() \{#adoptworktreeencryption\}

```ts
adoptWorktreeEncryption(source): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:83

Adopts the keyring of the main-database adapter (read-only checkout, US-313).

#### Parameters

| Parameter | Type                                                              | Description                               |
| --------- | ----------------------------------------------------------------- | ----------------------------------------- |
| `source`  | [`LocalRxDBAdapter`](../../rxdb/type-aliases/LocalRxDBAdapter.md) | The main database's SQLite-family adapter |

#### Returns

`void`

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when `source` is not a SQLite-family adapter

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`adoptWorktreeEncryption`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#adoptworktreeencryption)

---

### assertDisconnectedForDrop() \{#assertdisconnectedfordrop\}

```ts
protected assertDisconnectedForDrop(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:331

The pre-guard of `dropStorage()`: refuses while still connected (read-only checkout reclaims the snapshot database, US-313).

#### Returns

`void`

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when the adapter is still connected

#### Remarks

`dropStorage()` lives on each concrete adapter rather than here: where the
database lives (the IndexedDB database name, the OPFS file name, the file on the
host) is known only to them, and a base implementation would be inherited
verbatim by subclasses like Tauri and mini-programs that don't know how to delete it.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`assertDisconnectedForDrop`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#assertdisconnectedfordrop)

---

### backup() \{#backup\}

```ts
backup(sink, options?): Promise<RxDBBackupResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:164

Writes the entire database as a restorable archive.

#### Parameters

| Parameter  | Type                                                              | Description                                              |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| `sink`     | `WritableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;     | The output stream; closed on success, aborted on failure |
| `options?` | [`RxDBBackupOptions`](../../rxdb/interfaces/RxDBBackupOptions.md) | Cancellation signal and queue waiting limit              |

#### Returns

`Promise`&lt;[`RxDBBackupResult`](../../rxdb/interfaces/RxDBBackupResult.md)&gt;

The end marker (entry count, byte count, SHA-256) and manifest; the output stream close has completed

#### Remarks

The archive is a logical dump: all structure statements and row literals,
obtained inside the adapter's serial queue and within the same read
transaction, so it is consistent with some transaction commit boundary and all
data committed in the WAL is included. **The whole write-out holds the
database**: while the output stream has backpressure, reads and writes during
this period queue up. Calling inside this adapter's transaction callback waits
on itself, then reports `lock_timeout` after `lockTimeoutMs`.

The archive contains business tables, system tables, change history, and the
keyring's ciphertext; encrypted columns stay ciphertext and need no unlock;
external files are not in it (`scope.externalFiles === 'excluded'`). See each
adapter's README for the supported storage.

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

---

### backupStorage() \{#backupstorage\}

```ts
protected backupStorage(): SqliteBackupStorage;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts#L61)

An in-memory database without OPFS; a persistent database with OPFS.
`opfsFallback: 'memory'` silently falls back to memory when OPFS cannot be
opened, leaving the restore target indeterminate, and reports `unsupported_combination`.

#### Returns

[`SqliteBackupStorage`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteBackupStorage.md)

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`backupStorage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#backupstorage)

---

### bootstrapTransaction() \{#bootstraptransaction\}

```ts
bootstrapTransaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:304

**`Internal`**

Bootstrap-phase transaction: same as [transaction](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#transaction),
but **skips the readiness gate**.

#### Type Parameters

| Type Parameter                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Description                                                                   |
| ----------------- | --------- | ----------------------------------------------------------------------------- |
| `transactionFun`  | `T`       | The transaction work, taking the current transaction executor as its argument |
| `transactionLog?` | `boolean` | Whether to write a transaction log                                            |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

#### Remarks

Only for the bootstrap chain of `RxDB.connect()` (waterline, table creation,
migration) and the bootstrap steps inside this class — they already run within
the `RxDB.connect()` promise, and waiting on the readiness gate would be
waiting on themselves.

Tables may not exist yet at this moment; ordering is guaranteed by the
bootstrap chain itself. Do **not** call it inside a transaction body: the
facade does not rewrite this method, it lands on the real adapter and re-enters
the queue, and a second enqueue while holding the slot hangs forever.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`bootstrapTransaction`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#bootstraptransaction)

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`cacheRowIdEntity`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#cacherowidentity)

---

### canDropStorage() \{#candropstorage\}

```ts
canDropStorage(): boolean;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts#L36)

Whether `dropStorage()` can delete this database (asked once before a read-only checkout builds its snapshot database, US-313).

#### Returns

`boolean`

Always `true`: without OPFS it is an in-memory database, gone once
disconnected; with OPFS it deletes the database file under the root directory

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`canDropStorage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#candropstorage)

---

### checkEntityConstraints() \{#checkentityconstraints\}

```ts
checkEntityConstraints(EntityTypes): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:138

Read-only drift check: compares the storage constraints declared in metadata with the actual objects in `sqlite_master` (US-030 AC#10).

#### Parameters

| Parameter     | Type                                                    |
| ------------- | ------------------------------------------------------- |
| `EntityTypes` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Called by the core inside `RxDB.connect()` at the same moment as
`reconcileEntityIndexes` (after user migrations and missing-table creation).
Compares `ck_` CHECKs, `uq_` conditional unique indexes, and `ex_`
range-exclusion triggers; throws RxDBConstraintDriftError on mismatch.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`checkEntityConstraints`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#checkentityconstraints)

---

### cleanAllCache() \{#cleanallcache\}

```ts
cleanAllCache(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:262

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`cleanAllCache`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#cleanallcache)

---

### cleanupIncompleteRestore() \{#cleanupincompleterestore\}

```ts
cleanupIncompleteRestore(): Promise<boolean>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:203

Cleans up a restore that never finished (the page closed mid-restore, or the cleanup itself failed after a failed restore).

#### Returns

`Promise`&lt;`boolean`&gt;

`true` when residue was actually cleaned up

#### Remarks

Must be called before connecting. Failing to take the exclusive lock means the
target is being connected or restored, reporting `target_busy`; with no
incomplete marker it does nothing. In-memory storage has no residue, so it is always `false`.

#### Throws

RxDBBackupError `target_busy` / `unsupported_combination` / `cleanup_pending`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`cleanupIncompleteRestore`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#cleanupincompleterestore)

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

Adapters with a built-in readiness gate (SQLite family / PGlite) let `query()` /
`rawQuery()` / `createTables()` skip the readiness gate inside the bootstrap
window — that gate waits precisely on the not-yet-settled `RxDB.connect()`.
This method flips the state to `ready`; from then on every entry goes through
normal readiness waiting. Adapters without a readiness gate keep the default
no-op implementation.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`completeBootstrap`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#completebootstrap)

---

### connect() \{#connect\}

```ts
connect(): Promise<IRxDBAdapter>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:128

Establishes the connection and brings the system tables up to the current waterline.

#### Returns

`Promise`&lt;[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)&gt;

Itself, for chaining

#### Remarks

Table creation and system migration both happen here (see
`isCurrentRxDBSystemVersion`), so it can be slow, and it can throw
`UnsupportedRxDBSystemVersionError` when the database is newer than this process.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`connect`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#connect)

---

### createClient() \{#createclient\}

```ts
protected createClient(): Promise<SqliteClientLike>;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts#L67)

Creates or obtains the SQLite client.
Concrete adapters implement this method with their own backend logic.

#### Returns

`Promise`&lt;[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)&gt;

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createClient`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createclient)

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

Defaults to [createClient](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createclient):
a browser backend's database can only be opened in same-origin contexts, and
the exclusive Web Lock taken before restore already blocks all other
connections. Backends whose database file may be opened by another process
(desktop host) override it, making this connection hold the underlying storage
exclusively from before returning until disconnect, so nobody else can connect
from the empty-state check through the end of restore.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createRestoreTargetClient`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createrestoretargetclient)

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createTables`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createtables)

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

| Parameter    | Type                                                                                        | Description                                                                            |
| ------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `EntityType` | `T`                                                                                         | The entity type                                                                        |
| `host`       | [`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md) | The adapter the repository binds to (in a transaction scenario, the executor's facade) |

#### Returns

[`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

#### Remarks

For [SqliteTransactionExecutor.getRepository](../../rxdb-adapter-sqlite-core/classes/SqliteTransactionExecutor.md#getrepository).
The cache must be bypassed because a repository in the cache lives as long as
the adapter; writing a transaction-scoped repository in there would leave it in
the cache after the transaction ends, pointing at a committed/rolled-back
transaction context, and subsequent **external** writes would land on it.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createUncachedRepository`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createuncachedrepository)

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

Creates a set of writable-checkout tables inside the caller's transaction and seeds it (US-314 B1.5); see `worktree/worktree-table-set.ts` for the approach.

#### Parameters

| Parameter  | Type                                                                    | Description                                                                                     |
| ---------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)   | The executor of a transaction on this adapter                                                   |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)            | The table set to create; membership is decided by the caller (entities in the versioned domain) |
| `seed`     | [`WorktreeTableSetSeed`](../../rxdb/interfaces/WorktreeTableSetSeed.md) | Holds the branches and the increments to layer on                                               |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md)
when given the main table set, when a member is an entity that logs no changes,
when an increment falls outside the table set, or when the main table is missing columns

#### Remarks

Does not write the hold key: the open-checkout flow writes it itself within the
same transaction. The main table set is created with the database at
[RxDBAdapterSqliteBase.createTables](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createtables),
not through here.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createWorktreeTableSet`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createworktreetableset)

---

### deleteByIds() \{#deletebyids\}

```ts
deleteByIds(entityName, ids): Observable<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:321

Batch deletes by an ID list (QueryCache only)

Used to clean up data in the local cache that has been deleted remotely.

#### Parameters

| Parameter    | Type       | Description               |
| ------------ | ---------- | ------------------------- |
| `entityName` | `string`   | The entity name           |
| `ids`        | `string`[] | The list of IDs to delete |

#### Returns

`Observable`&lt;`void`&gt;

`Observable<void>`

#### Example

```typescript
adapter.deleteByIds('Product', ['p1', 'p2']).subscribe();
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`deleteByIds`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#deletebyids)

---

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:139

Disconnects and releases the underlying handle.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Unlike `RxDB.destroy()`, disconnecting is **reversible**: the same adapter
instance can `connect()` again afterwards. Implementations must be idempotent —
calling while not connected is a no-op rather than an error.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`disconnect`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#disconnect)

---

### dropStorage() \{#dropstorage\}

```ts
dropStorage(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts#L50)

Deletes this database's persistent storage (read-only checkout reclaims the snapshot database, US-313).

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) when still connected; when the OPFS file remains occupied after the retry budget is exhausted

#### Remarks

Without OPFS it is an in-memory database, gone once disconnected. With OPFS it
deletes the database file `<db name>.sqlite3` and `-journal` / `-wal` / `-shm`
under the root directory (the file names derived the same way as on connect);
when `opfsFallback: 'memory'` had fallen back to memory the file never existed,
and deleting a nonexistent file does nothing. On disconnect, `db.close()` has
already made the OPFS proxy release the synchronous access handle; the release
has latency, so deletion retries with backoff.

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`dropStorage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#dropstorage)

---

### dropWorktreeTableSet() \{#dropworktreetableset\}

```ts
dropWorktreeTableSet(executor, tableSet): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:231

Drops a set of writable-checkout tables inside the caller's transaction (US-314
B1.5): finds them by directory, detaches triggers first, then drops tables.

#### Parameters

| Parameter  | Type                                                                  | Description                                   |
| ---------- | --------------------------------------------------------------------- | --------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of a transaction on this adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)          | The table set to drop                         |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when given the main table set

#### Remarks

The hold keys on branch tables are not released here; the close-checkout flow
releases them itself within the same transaction.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`dropWorktreeTableSet`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#dropworktreetableset)

---

### emitChangeError() \{#emitchangeerror\}

```ts
emitChangeError(event): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:112

Reports a change-processing failure.

#### Parameters

| Parameter | Type                                                                                            | Description         |
| --------- | ----------------------------------------------------------------------------------------------- | ------------------- |
| `event`   | [`SqliteChangeErrorEvent`](../../rxdb-adapter-sqlite-core/interfaces/SqliteChangeErrorEvent.md) | The failure details |

#### Returns

`void`

#### Remarks

Called by the change-processing pipeline (`handle_rxdb_change`), not for
application code. This method **never throws**: no caller on its path can catch
an exception, and throwing would only become an unhandled rejection.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`emitChangeError`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#emitchangeerror)

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`getEntityByRowId`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#getentitybyrowid)

---

### getMetadataByIds() \{#getmetadatabyids\}

```ts
getMetadataByIds(entityName, ids): Observable<Map<string, string>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:319

Gets the metadata of a given ID list (QueryCache only)

Used for local cache freshness checks, returning an ID → updatedAt map.

#### Parameters

| Parameter    | Type       | Description        |
| ------------ | ---------- | ------------------ |
| `entityName` | `string`   | The entity name    |
| `ids`        | `string`[] | The entity ID list |

#### Returns

`Observable`&lt;`Map`&lt;`string`, `string`&gt;&gt;

`Observable<Map<string, string>>` - an ID → updatedAt map

#### Example

```typescript
adapter.getMetadataByIds('Product', ['p1', 'p2']).subscribe(map => {
  // map: Map `{ 'p1' => '2026-01-12T10:00:00Z', 'p2' => '2026-01-12T09:30:00Z' }`
});
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`getMetadataByIds`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#getmetadatabyids)

---

### getRepository() \{#getrepository\}

```ts
getRepository<T, RT>(EntityType): RT;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:113

#### Type Parameters

| Type Parameter                                                                                      | Default type                                         |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| <a id="type-parameter-t-3"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) | -                                                    |
| <a id="type-parameter-rt"></a> `RT`                                                                 | [`SqliteRepository`](SqliteRepository.md)&lt;`T`&gt; |

#### Parameters

| Parameter    | Type |
| ------------ | ---- |
| `EntityType` | `T`  |

#### Returns

`RT`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`getRepository`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#getrepository)

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`getRowIdByEntity`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#getrowidbyentity)

---

### getRxDBChangeSequence() \{#getrxdbchangesequence\}

```ts
getRxDBChangeSequence(): Promise<number>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:317

#### Returns

`Promise`&lt;`number`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`getRxDBChangeSequence`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#getrxdbchangesequence)

---

### importWorktreeSnapshot() \{#importworktreesnapshot\}

```ts
importWorktreeSnapshot(snapshot): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:76

Writes the rows and increments read from the main database into this database (read-only checkout builds a snapshot, US-313).

#### Parameters

| Parameter  | Type                                                                        | Description                                          |
| ---------- | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| `snapshot` | [`WorktreeSnapshotImport`](../../rxdb/interfaces/WorktreeSnapshotImport.md) | The tables to copy and the increments layered on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when this database has a capture runtime installed

#### Remarks

One transaction, dispatching no events: the snapshot instance's entities are
all `log: false`, so no change log can derive events. Increments share the same
SQL generation as branch switching, except encrypted columns pass through by envelope.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`importWorktreeSnapshot`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#importworktreesnapshot)

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`internalQuery`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#internalquery)

---

### isEncryptedAtRest() \{#isencryptedatrest\}

```ts
isEncryptedAtRest(value): boolean;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:55

Determines whether a stored value is already in the encrypted at-rest form (FR-038).

#### Parameters

| Parameter | Type      | Description                  |
| --------- | --------- | ---------------------------- |
| `value`   | `unknown` | The value in a stored column |

#### Returns

`boolean`

`true` when it is an envelope string

#### Remarks

There is only one authoritative judgment, `isEnvelope` of
`@aiao/rxdb-adapter-encrypted` — this method is one line of forwarding from the
core's optional slot ([RxDBAdapterLocalBase.isEncryptedAtRest](../../rxdb/classes/RxDBAdapterLocalBase.md#isencryptedatrest))
to it, and recognizes no other shape here. `@aiao/rxdb` cannot depend on the
encryption package (the dependency direction is reversed), so this line can
only live on the adapter side.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`isEncryptedAtRest`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#isencryptedatrest)

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`isTableExisted`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#istableexisted)

---

### listWorktreeTableSetSuffixes() \{#listworktreetablesetsuffixes\}

```ts
listWorktreeTableSetSuffixes(executor): Promise<readonly string[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:238

Lists the existing writable-checkout table sets by directory (US-314 B2.6): which set each table whose name ends in `$<suffix>` belongs to.

#### Parameters

| Parameter  | Type                                                                  | Description                                   |
| ---------- | --------------------------------------------------------------------- | --------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of a transaction on this adapter |

#### Returns

`Promise`&lt;readonly `string`[]&gt;

The table set suffixes, sorted and de-duplicated; a main table of a configured
entity that happens to be shaped this way does not count

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`listWorktreeTableSetSuffixes`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#listworktreetablesetsuffixes)

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

Applies compressed changes to the local entity tables

Implementation strategy (SQLite):

1. Convert actions into SQL operations
2. In a transaction:
   a) Execute SQL operations against the entity tables (INSERT/UPDATE/DELETE)
   b) Batch-insert localChanges into the RxDBChange table (for history tracking)
3. Send local events to notify UI updates

#### Parameters

| Parameter          | Type                                                                     | Description                                                                                      |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `actions`          | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md)  | The compressed change operation set (pulled from remote)                                         |
| `localChanges?`    | `Omit`&lt;[`RxDBChange`](../../rxdb/classes/RxDBChange.md), `"id"`&gt;[] | The records to save into the local RxDBChange table (optional)                                   |
| `disableTriggers?` | `boolean`                                                                | Whether to disable triggers (used for pull-like operations to avoid creating RxDBChange records) |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`mergeChanges`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#mergechanges)

---

### migrateSystemSchema() \{#migratesystemschema\}

```ts
migrateSystemSchema(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:239

Upgrades the RxDB-owned tables before app migrations or repository operations run.
Adapters that don't need to persist system schema state keep the default no-op implementation.

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`migrateSystemSchema`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#migratesystemschema)

---

### mutations() \{#mutations\}

```ts
mutations<T>(options): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:206

Batch-modifies entities (create/update/delete)

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`mutations`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#mutations)

---

### persistentBackupStorage() \{#persistentbackupstorage\}

```ts
protected persistentBackupStorage(label): SqliteBackupStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:348

Produces the description of a persistent storage backend.

#### Parameters

| Parameter | Type     | Description                                                     |
| --------- | -------- | --------------------------------------------------------------- |
| `label`   | `string` | The storage name written into the manifest, e.g. `idb` / `opfs` |

#### Returns

[`SqliteBackupStorage`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteBackupStorage.md)

The persistent backend with `storageKey` equal to `<adapter>:<label>:<dbName>`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`persistentBackupStorage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#persistentbackupstorage)

---

### physicalTableNames() \{#physicaltablenames\}

```ts
physicalTableNames(metadata): readonly string[];
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:255

The SQLite family folds the namespace into the table name: `public$todos`.

#### Parameters

| Parameter  | Type                                                          | Description         |
| ---------- | ------------------------------------------------------------- | ------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | The entity metadata |

#### Returns

readonly `string`[]

The logical name (the base class's entry) plus the name this family actually creates

#### Remarks

The whole point of the override is **keeping the rules to one copy**: the name
comes from get\_table\_name\_by\_metadata, the same function used by table
creation, queries, and triggers. Before this, `@aiao/rxdb-plugin-working-tree`'s
versioned domain composed its own copy by `'$'`; when the composition changed,
that copy did not error — it just stopped recognizing the table, and the raw
write gate silently let it through.

The base class's logical name is kept rather than returning only the folded
name: the raw judgment would rather **recognize an extra name** — recognizing
more only blocks one more statement that wouldn't run on this backend anyway;
the one name missed is exactly the one a capture-bypassing write would use.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`physicalTableNames`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#physicaltablenames)

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`query`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#query)

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

**The judgment comes from the core package; this only wires it up**
(adapter-contract.md §2). `rawQuery?()` is an optional method on `IRxDBAdapter`,
so the core package cannot wrap it for the adapters the way it does the four
capture mount points — this one `gateRawWrite` call is the only place in this
class that must be right. Not a single word of the judgment itself is rewritten
here — if one of the six implementations writes the lexical normalization
loosely, the whole line of defense has a hole, and that hole will never show up
in any single backend's own tests.

This one call covers **the 5 v1 adapters** (wa-sqlite / sqlite-wasm / sqlite /
sqliteai / electron): they all extend this class and none overrides `rawQuery`.
Writing it once in each of the five subclasses is the form T064 "don't write
one copy each" explicitly excludes; if some subclass ever really overrides
`rawQuery`, it must wire itself up, and that is held in place by T068's 6
consistency call sites.

Registered business tables are rejected before the transaction opens; calls
that would have been let through re-read the physical directory inside the
executing transaction and pass through the same gate again, preventing missed
shadow tables newly created by another instance. Both judgments run before the
business statement is issued. Inside the bootstrap window, without capture
installed, the original behavior is kept.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`rawQuery`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#rawquery)

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

| Parameter    | Type                                                                                       | Description                                                  |
| ------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `executor`   | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)                      | The executor of a transaction on the main database           |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)                                      | The entity class on the main instance                        |
| `after`      | \| [`WorktreeSnapshotCursor`](../../rxdb/type-aliases/WorktreeSnapshotCursor.md) \| `null` | The cursor of the previous page; `null` reads from the start |
| `limit`      | `number`                                                                                   | The maximum rows in this page                                |

#### Returns

`Promise`&lt;[`WorktreeSnapshotPage`](../../rxdb/interfaces/WorktreeSnapshotPage.md)&gt;

Rows of raw SQLite values, paginated by rowid

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`readWorktreeSnapshotPage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#readworktreesnapshotpage)

---

### ready() \{#ready\}

```ts
protected ready(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:385

The readiness gate: **must be called before taking a queue slot, never inside a queue task**.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

The queue concurrency is 1. Waiting on `RxDB.connect()` inside the critical
section forms a cycle: `RxDB.connect()`'s first-install path depends on the
waterline transaction behind the queue, and that transaction can never get the
occupied slot (the measured trace is in the design document §1.2).

The gate waits on the **whole `RxDB.connect()`**, not "whether this adapter's
client has connected". Between the two lie table creation, system migration,
and the waterline; it once let through based on client state, so external
writes arriving inside this window hit tables that don't exist yet (`no such
table`). `RxDB.connect()` caches its promise by name, so when it has completed
this is just one extra microtask hop.

The bootstrap chain itself must **not** go through this gate (that would be
waiting on itself); it always uses [bootstrapTransaction](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#bootstraptransaction).

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`ready`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#ready)

---

### reconcileEntityIndexes()? \{#reconcileentityindexes\}

```ts
reconcileEntityIndexes ? EntityTypes : Promise<void>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:611

Idempotently reconciles entity indexes after user migrations and missing-table creation.

#### Parameters

| Parameter     | Type                                                    |
| ------------- | ------------------------------------------------------- |
| `EntityTypes` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`reconcileEntityIndexes`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#reconcileentityindexes)

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`removeCacheEntity`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#removecacheentity)

---

### removeChangeErrorListener() \{#removechangeerrorlistener\}

```ts
removeChangeErrorListener(listener): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:102

Cancels the subscription of [addChangeErrorListener](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#addchangeerrorlistener).

#### Parameters

| Parameter  | Type                                                                                                    | Description                                        |
| ---------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `listener` | [`SqliteChangeErrorListener`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteChangeErrorListener.md) | The same function reference passed at registration |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`removeChangeErrorListener`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#removechangeerrorlistener)

---

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:205

Batch-removes entities.

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

The removed entities

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`removeMany`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#removemany)

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

| Parameter         | Type                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `repositoryName`  | `string`                                                                                                                     |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterSqliteai`, `RT`&gt; |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`repository`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#repository)

---

### restore() \{#restore\}

```ts
restore(source, options?): Promise<RxDBRestoreResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:192

Restores the archive produced by [backup](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#backup)
into this adapter's configured empty storage.

#### Parameters

| Parameter  | Type                                                                                        | Description                             |
| ---------- | ------------------------------------------------------------------------------------------- | --------------------------------------- |
| `source`   | `ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;                               | The archive byte stream                 |
| `options?` | [`SqliteRestoreOptions`](../../rxdb-adapter-sqlite-core/interfaces/SqliteRestoreOptions.md) | Cancellation signal and phase callbacks |

#### Returns

`Promise`&lt;[`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md)&gt;

The end marker and manifest

#### Remarks

Must be called before `rxdb.connect()` (via `rxdb.getAdapter(name)` to obtain
the not-yet-connected instance): connected or currently restoring reports
`target_busy`. Only writes into an **empty** target; compatibility (adapter,
engine major version, virtual table module, system table / change encoding
version, entity structure fingerprint, encryption authentication domain) is
judged before the first statement is written, and commits only after every
check passes.

- Persistent storage: after restore completes, `rxdb.connect()` works normally;
  if the page closes mid-restore, a later connect reports `restore_incomplete`
  and needs [cleanupIncompleteRestore](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#cleanupincompleterestore) first.
- In-memory storage: the restored database lives only in this instance and is
  taken over by the next `rxdb.connect()`; when not connecting,
  [disconnect](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#disconnect) releases it.

Restored rows produce no change history; encrypted databases stay locked. The
input stream is cancelled on failure, and on success only the read lock is released.

#### Throws

RxDBBackupError; see RxDBBackupErrorCode. `cleanup_pending` means even the post-failure cleanup did not finish

#### Example

```typescript
rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS' }));
const adapter = await rxdb.getAdapter('wa-sqlite');
await adapter.restore(file.stream());
await rxdb.connect('wa-sqlite');
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`restore`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#restore)

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

| Parameter         | Type      | Description                                                                   |
| ----------------- | --------- | ----------------------------------------------------------------------------- |
| `transactionFun`  | `T`       | The transaction work, taking the current transaction executor as its argument |
| `transactionLog?` | `boolean` | -                                                                             |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The transaction work's return value

#### Remarks

The real adapter entry always opens a new transaction; the executor facade maps
`runInTransaction()` inside a transaction to `executor.run()`, reusing the
current transaction without re-enqueueing.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`runInTransaction`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#runintransaction)

---

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:204

Batch-writes entities (inserts when absent, updates when present).

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

The entities after landing in the database; fields backfilled by the database —
primary keys, database-side defaults — only have values here

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`saveMany`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#savemany)

---

### sealWorktreeReadOnly() \{#sealworktreereadonly\}

```ts
sealWorktreeReadOnly(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:87

Seals this database read-only (read-only checkout, US-313): from now on write statements on this connection are rejected by SQLite.

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`sealWorktreeReadOnly`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#sealworktreereadonly)

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`setRxDBChangeSequence`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#setrxdbchangesequence)

---

### settleRepositoryTransaction() \{#settlerepositorytransaction\}

```ts
protected settleRepositoryTransaction(executor, committed): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:793

Commits or rolls back the public repository's entity state; must be called before returning the transaction queue.

#### Parameters

| Parameter   | Type                                                                  |
| ----------- | --------------------------------------------------------------------- |
| `executor`  | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) |
| `committed` | `boolean`                                                             |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`settleRepositoryTransaction`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#settlerepositorytransaction)

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
| `hook`    | \| [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md) \| `undefined` | The runtime taking over the four mount points; `undefined` uninstalls |

#### Returns

`void`

#### Remarks

The mounting lives **here** rather than letting the six adapters each insert a
line in their own `transaction()`: one write missing, or one write late
(validating the token only after the business write), is discoverable by
nothing — and that is exactly the form §2 "the judgment implementation has only
one copy" exists to rule out.

Callers are `RxDB.connect()` (after confirming the capability bit is true) and
`workingTree.enable()` (after the flip succeeds). On databases where it is
never enabled, this is never called, so the four write primitives have not even
one layer of forwarding.

Idempotent: an already-installed hook is uninstalled before installing, never stacking two layers.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`setWorkingTreeCaptureHook`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#setworkingtreecapturehook)

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

The archive preserves shadow tables row-by-row, and restore must rewrite them
whole. The default is yes; backends running SQLite in defensive mode cannot
modify shadow tables and override to `false`: backup and restore of a database
containing shadow tables then both report `unsupported_combination`, rather
than producing an archive it cannot restore itself, or failing halfway through a write.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`shadowTablesWritable`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#shadowtableswritable)

---

### sharedClientLockName() \{#sharedclientlockname\}

```ts
protected sharedClientLockName(): string | undefined;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:396

The Web Lock name for cross-tab serialized transactions when the client is shared by multiple tabs; returns `undefined` (default) when not shared.

#### Returns

`string` \| `undefined`

The lock name; adapters on the same shared connection must return the same name

#### Remarks

Under a SharedWorker transport, each tab's adapter only serializes its own
queue: while one tab's transaction is open, another tab's statements fall into
that transaction (US-314 B2.3b, fixed main). With a lock name, every queued
task runs inside this lock; upon taking the lock it first rolls back the
transaction left by a dead tab ([SqliteClientLike.rollbackOrphanTransaction](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#rollbackorphantransaction)),
and disconnect changes to returning only its own share ([SqliteClientLike.release](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#release)).

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`sharedClientLockName`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#sharedclientlockname)

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`switchBranch`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#switchbranch)

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

| Parameter         | Type      | Description                                      |
| ----------------- | --------- | ------------------------------------------------ |
| `transactionFun`  | `T`       | The callback holding this transaction's executor |
| `transactionLog?` | `boolean` | Whether to record a transaction log              |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The callback's result

#### Remarks

`entity.save()` without an executor re-enqueues. Awaiting it inside a
transaction callback waits on itself and the transaction cannot finish. Inside
a transaction use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository);
for the save entry of entity instances see [EntityBase.save](../../rxdb/classes/EntityBase.md#save).

#### Examples

```ts
// ✅ Get the repository via the executor; every read and write belongs to this transaction.
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
// ❌ The entity instance holds no executor; save() re-enqueues and then waits for the current transaction to finish.
await adapter.transaction(async () => {
  await entity.save();
});
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`transaction`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#transaction)

---

### transactionalRepository() \{#transactionalrepository\}

```ts
protected transactionalRepository<T, R>(EntityType, repository): R;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:795

Puts the public repository's whole operation into a transaction; not called when the executor creates a repository.

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

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`transactionalRepository`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#transactionalrepository)

---

### upsertMany() \{#upsertmany\}

```ts
upsertMany<T>(entityName, data): Observable<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:320

Batch upserts data (QueryCache only)

Executes INSERT OR REPLACE semantics, used to cache remotely pulled data.

#### Type Parameters

| Type Parameter                       |
| ------------------------------------ |
| <a id="type-parameter-t-11"></a> `T` |

#### Parameters

| Parameter    | Type     | Description               |
| ------------ | -------- | ------------------------- |
| `entityName` | `string` | The entity name           |
| `data`       | `T`[]    | The list of data to write |

#### Returns

`Observable`&lt;`void`&gt;

`Observable<void>`

#### Example

```typescript
adapter.upsertMany('Product', [product1, product2]).subscribe();
```

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`upsertMany`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#upsertmany)

---

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:140

The version number of the underlying database engine (e.g. SQLite's `3.45.0`), for diagnostics and capability judgments.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Unrelated to the system table waterline (`RXDB_SYSTEM_SCHEMA_VERSION`), which is RxDB's own number.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`version`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#version)

---

### worktreeTableSetMounted() \{#worktreetablesetmounted\}

```ts
worktreeTableSetMounted(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:268

**`Internal`**

Clears the row-id cache after this instance switches its mounted table set (US-314
B1.4): row ids are recorded per physical table, and with a different table set
mounted the same row id refers to a different row.

#### Returns

`void`

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`worktreeTableSetMounted`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#worktreetablesetmounted)

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

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`writeQuery`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#writequery)
