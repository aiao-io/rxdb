# RxDBAdapterWaSqliteMiniProgram

Defined in: [packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts#L7)

WeChat mini program single-connection wa-sqlite adapter.

## Extends

- [`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md)

## Constructors

### Constructor

```ts
new RxDBAdapterWaSqliteMiniProgram(rxdb, options): RxDBAdapterWaSqliteMiniProgram;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts#L11)

#### Parameters

| Parameter | Type                                                                                        |
| --------- | ------------------------------------------------------------------------------------------- |
| `rxdb`    | [`RxDB`](../../rxdb/classes/RxDB.md)                                                        |
| `options` | [`WaSqliteMiniProgramAdapterOptions`](../type-aliases/WaSqliteMiniProgramAdapterOptions.md) |

#### Returns

`RxDBAdapterWaSqliteMiniProgram`

#### Overrides

`RxDBAdapterSqliteBase.constructor`

## Properties

### clientOwner \{#clientowner\}

```ts
protected readonly clientOwner: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:33

The key under which this adapter holds the client: handed to the client at `init` inside `createClient()`, and carried both when registering listeners and when handing the hold back at disconnect (US-314 B2.3b).

#### Remarks

In a SharedWorker there is only one client, and every tab's adapter connects to it; on disconnect this key hands back only its own share and removes only its own listeners
([SqliteClientLike.release](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#release)). Backends that do not share a client can ignore it.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`clientOwner`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#clientowner)

---

### name \{#name\}

```ts
readonly name: string = ADAPTER_NAME;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts#L9)

The adapter name, the same value as the key used to register it with `RxDB.adapter()`; both error messages and `getAdapter()` identify it by this name

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`name`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#name)

---

### options \{#options\}

```ts
readonly options: WaSqliteMiniProgramAdapterOptions;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts#L13)

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
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterWaSqliteMiniProgram, RepositoryInstance<EntityType>>>;
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

It lives on the RxDB instance ([RxDB.worktreeTableSet](../../rxdb/classes/RxDB.md#worktreetableset-1)); this is only a forwarding read: an instance mounts exactly one table set at a time,
and if the adapter stored another copy that would be a second source of truth. SQL that reads or writes business tables resolves physical names through it; entities without copies, like system tables and QueryCache,
always land in the main table set regardless of which set is mounted.

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

The capture runtime; always `undefined` on databases without the commit capability enabled.

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

`rawQuery?()` is an **optional method** on this interface (see `IRxDBAdapter` above), so the core package cannot wrap it for the adapter the way it does the four mount points —
the judgment can only be invoked by each adapter's own `rawQuery` implementation calling `gateRawWrite(sql, ctx, …)`.
The `ctx` that call needs is handed out here, so the only thing the six adapters have to get right is that single hand-off;
the two questions that are actually easy to get wrong — how capability bits are computed and where the domain comes from — never fall on them.

The capability bit is decided directly by **whether the capture runtime is installed**, with no separate boolean: the runtime is only installed when the bit is true
(when `RxDB.connect()` reads true, or when `workingTree.enable()` has just flipped it). Storing another copy would be a second source of truth,
and the consequence of the two copies diverging is one-directional — the gate believes it is off, and all raw writes pass. The context object itself is created in
`setWorkingTreeCaptureHook()` **in the same assignment** as the runtime, not on every access: the getter runs on every raw statement, and it holds no per-call state. The two fields only change together in that one place, so "a new runtime installed while a closure bound to the old runtime is handed out" is not a reachable state.

What is handed out is the **judgment entry itself**, not the things the judgment looks at (domain, column set, trusted intent). The core therefore does not
have to repeat what capture recognizes, and the "a domain was copied out, and derived index columns a plugin registers later only land in one of the copies"
kind of double-list cannot exist — the judgment always runs against the one copy held by the runtime.

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

| Parameter  | Type                                                                                                    | Description                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listener` | [`SqliteChangeErrorListener`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteChangeErrorListener.md) | Callback that receives [SqliteChangeErrorEvent](../../rxdb-adapter-sqlite-core/interfaces/SqliteChangeErrorEvent.md); its exceptions are isolated |

#### Returns

`void`

#### Remarks

As soon as any listener is registered, the default `console.error` fallback is handed over to the listener (SQLC-012).

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`addChangeErrorListener`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#addchangeerrorlistener)

---

### adoptWorktreeEncryption() \{#adoptworktreeencryption\}

```ts
adoptWorktreeEncryption(source): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:83

Adopts the keyring of the main database's adapter (read-only checkout, US-313).

#### Parameters

| Parameter | Type                                                              | Description                                    |
| --------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| `source`  | [`LocalRxDBAdapter`](../../rxdb/type-aliases/LocalRxDBAdapter.md) | The SQLite-family adapter of the main database |

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

The guard in front of `dropStorage()`: refuses while still connected (read-only checkout recycles the snapshot database, US-313).

#### Returns

`void`

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when the adapter is still connected

#### Remarks

`dropStorage()` lives on each concrete adapter rather than here: only they know where the database lives (the IndexedDB database name, the OPFS file name, the file on the host),
and a base implementation would be inherited verbatim by subclasses like Tauri and mini programs that do not know how to delete.

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
| `options?` | [`RxDBBackupOptions`](../../rxdb/interfaces/RxDBBackupOptions.md) | Cancellation signal and queue deadline                   |

#### Returns

`Promise`&lt;[`RxDBBackupResult`](../../rxdb/interfaces/RxDBBackupResult.md)&gt;

The end marker (entry count, byte count, SHA-256) and the manifest; the output stream close has completed

#### Remarks

The archive is a logical dump: all structure statements and row literals, obtained inside the adapter's serial queue within a single read transaction, so it is consistent with some transaction commit boundary, and everything committed in the WAL is included. **The whole write holds the database**: while the output stream applies backpressure,
all reads and writes during that period are queued. Calling it inside this adapter's transaction callback waits on itself, failing with `lock_timeout` after `lockTimeoutMs`.

The archive contains business tables, system tables, the change history and the keyring's ciphertext; encrypted columns stay ciphertext and do not need unlocking;
external files are not included (`scope.externalFiles === 'excluded'`). See each adapter's README for supported storages.

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

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:341

The backup storage backend for the current config, which decides whether [backup](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#backup) / [restore](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#restore) can be used and which path a restore takes.

#### Returns

[`SqliteBackupStorage`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteBackupStorage.md)

The storage backend

#### Remarks

The base class does not support it by default; shipped adapters override it according to their own storage options. The `storageKey` of persistent backends is generated with
[persistentBackupStorage](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#persistentbackupstorage), guaranteeing the same database uses the same lock on both the connect and restore sides.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`backupStorage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#backupstorage)

---

### bootstrapTransaction() \{#bootstraptransaction\}

```ts
bootstrapTransaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:304

**`Internal`**

Bootstrap-phase transaction: same as [transaction](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#transaction), but **skips the readiness gate**.

#### Type Parameters

| Type Parameter                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Description                                                             |
| ----------------- | --------- | ----------------------------------------------------------------------- |
| `transactionFun`  | `T`       | The transaction work; its parameter is the current transaction executor |
| `transactionLog?` | `boolean` | Whether to write the transaction log                                    |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

#### Remarks

Only for the bootstrap chain of `RxDB.connect()` (watermark, table creation, migration) and this class's own bootstrap steps —
they already run inside `RxDB.connect()`'s promise, so waiting for the readiness gate would be waiting on themselves.

Tables may not exist yet at this point; the bootstrap chain guarantees the order itself. **Do not** call it from inside a transaction body: the facade does not rewrite this method,
so it would fall through to the real adapter and enqueue again — enqueueing twice while holding the slot hangs forever.

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

### canDropStorage()? \{#candropstorage\}

```ts
canDropStorage?(): boolean;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:691

Whether, under the current config, [dropStorage](../../rxdb/classes/RxDBAdapterLocalBase.md#dropstorage) can delete this database (asked once before a read-only checkout builds its snapshot database, US-313).

#### Returns

`boolean`

`false` means `dropStorage()` will definitely refuse

#### Remarks

Looks only at the config and never touches storage. Before the snapshot is built there is no other way to know: trying by deleting once would delete a database whose identity has not been verified,
and a misconfigured snapshot factory pointing at the main database's storage would delete the main database itself. A snapshot database that can be built but not deleted throws on close, and then errors on every later recycle.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`canDropStorage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#candropstorage)

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
missing-table backfill). Compares `ck_` CHECKs, `uq_` conditional unique indexes, and `ex_` range-exclusion triggers;
throws RxDBConstraintDriftError on mismatch.

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

Must be called before connecting. Failing to take the exclusive lock means the target is being connected to or restored, and reports `target_busy`;
with no incomplete marker it does nothing. In-memory storage has no residue to speak of, so it is always `false`.

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

Adapters with a built-in readiness gate (the SQLite family / PGlite) let `query()` / `rawQuery()` /
`createTables()` skip the gate inside the bootstrap window — the gate itself waits for the not-yet-settled `RxDB.connect()`.
This method flips the state to `ready`, after which every entry goes through the normal readiness wait.
Adapters without a readiness gate keep the default no-op implementation.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`completeBootstrap`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#completebootstrap)

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

Table creation and system migrations all happen here (see `isCurrentRxDBSystemVersion`), so it can be slow,
and can throw `UnsupportedRxDBSystemVersionError` when the database is newer than this process.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`connect`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#connect)

---

### createClient() \{#createclient\}

```ts
protected createClient(): Promise<SqliteClientLike>;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts#L19)

Creates or obtains the SQLite client.
Concrete adapters implement this method with their own backend's logic.

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

The default is just [createClient](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createclient): browser-backed databases are only opened in same-origin contexts, and the exclusive Web Lock taken before restore
already blocks every other connection. Backends whose database file can be opened by other processes (the desktop host) override it to make this connection
hold the underlying storage exclusively until disconnect, guaranteeing nobody else can connect from the empty-state check through the end of the restore.

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

Creates a repository bound to `host` **without writing** it into `repository_cache`.

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-2"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter    | Type                                                                                        | Description                                                                           |
| ------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `EntityType` | `T`                                                                                         | The entity type                                                                       |
| `host`       | [`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md) | The adapter the repository binds to (in transaction scenarios, the executor's facade) |

#### Returns

[`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

#### Remarks

Used by [SqliteTransactionExecutor.getRepository](../../rxdb-adapter-sqlite-core/classes/SqliteTransactionExecutor.md#getrepository). The reason the cache must be bypassed: a repository in the cache
lives as long as the adapter; if a transaction-scoped repository were written there, it would remain after the transaction ends, pointing at a
committed/rolled-back transaction context, and later **external** writes would hit it.

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

Creates a set of tables for a writable checkout inside the caller's transaction and seeds it (US-314 B1.5); see `worktree/worktree-table-set.ts`.

#### Parameters

| Parameter  | Type                                                                    | Description                                                                                 |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)   | The executor of a transaction on this adapter                                               |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)            | The table set to create; members are decided by the caller (entities in a versioned domain) |
| `seed`     | [`WorktreeTableSetSeed`](../../rxdb/interfaces/WorktreeTableSetSeed.md) | Holds the branch and the increments to apply                                                |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when given the main table set, when a member does not log change history, when an increment falls outside the table set, or when the main table is missing columns

#### Remarks

The hold key is not written here: the checkout-opening flow writes it itself within the same transaction. The main table set is created along with the database ([RxDBAdapterSqliteBase.createTables](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createtables)), not through this.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createWorktreeTableSet`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createworktreetableset)

---

### deleteByIds() \{#deletebyids\}

```ts
deleteByIds(entityName, ids): Observable<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:321

Batch delete by a list of IDs (QueryCache only)

Used to clean up data already deleted remotely from the local cache.

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

Unlike `RxDB.destroy()`, disconnecting is **reversible**: the same adapter instance can `connect()` again later.
The implementation must be idempotent — calling it while disconnected is a no-op, not an error.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`disconnect`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#disconnect)

---

### dropStorage()? \{#dropstorage\}

```ts
dropStorage?(): Promise<void>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:681

Permanently deletes this adapter's persistent storage for the database (read-only checkout recycles the snapshot database, US-313).

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

Throws while this adapter is still connected: disconnect first, then delete

#### Remarks

The storage location is derived with the same logic as at connect time (`rxdb.config.dbName` plus adapter options); when the database does not exist it does nothing.
An in-memory database is gone on disconnect, so this is a no-op here too. What is deleted cannot be recovered: callers must first confirm no other context is still using this database.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`dropStorage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#dropstorage)

---

### dropWorktreeTableSet() \{#dropworktreetableset\}

```ts
dropWorktreeTableSet(executor, tableSet): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:231

Drops a set of tables of a writable checkout inside the caller's transaction (US-314 B1.5): finds them by catalog, removes triggers first, then drops the tables.

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

The hold key on branch tables is not released here; the checkout-closing flow releases it itself within the same transaction.

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

Called by the change-processing pipeline (`handle_rxdb_change`), not for application code. This method **never throws**:
the path it lives on has no caller that can catch an exception — throwing would only become an unhandled rejection.

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

Gets metadata for a given list of IDs (QueryCache only)

Used for local cache freshness checks; returns an ID → updatedAt map.

#### Parameters

| Parameter    | Type       | Description            |
| ------------ | ---------- | ---------------------- |
| `entityName` | `string`   | The entity name        |
| `ids`        | `string`[] | The list of entity IDs |

#### Returns

`Observable`&lt;`Map`&lt;`string`, `string`&gt;&gt;

`Observable<Map<string, string>>` - the ID → updatedAt map

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

| Type Parameter                                                                                      | Default type                                                                              |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-3"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) | -                                                                                         |
| <a id="type-parameter-rt"></a> `RT`                                                                 | [`SqliteRepository`](../../rxdb-adapter-wa-sqlite/classes/SqliteRepository.md)&lt;`T`&gt; |

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

Writes rows and increments read from the main database into this database (read-only checkout builds the snapshot, US-313).

#### Parameters

| Parameter  | Type                                                                        | Description                                          |
| ---------- | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| `snapshot` | [`WorktreeSnapshotImport`](../../rxdb/interfaces/WorktreeSnapshotImport.md) | The tables to copy and the increments layered on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when this database has a capture runtime installed

#### Remarks

One transaction, no events dispatched: the snapshot instance's entities are all `log: false`, so there is no change log to derive events from.
Increments and branch switching share the same SQL generation, except encrypted columns pass through the envelope directly.

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

Judges whether a stored value is already in the encrypted at-rest form (FR-038).

#### Parameters

| Parameter | Type      | Description                  |
| --------- | --------- | ---------------------------- |
| `value`   | `unknown` | The value in a stored column |

#### Returns

`boolean`

`true` when it is an envelope string

#### Remarks

There is only one authoritative judge: `isEnvelope` from `@aiao/rxdb-adapter-encrypted` — this method is
a one-line forward from the core's optional slot ([RxDBAdapterLocalBase.isEncryptedAtRest](../../rxdb/classes/RxDBAdapterLocalBase.md#isencryptedatrest)) to it,
and does not recognize another shape here. `@aiao/rxdb` cannot depend on the encryption package (the dependency direction is reversed), so this one line
can only live on the adapter side.

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

Lists the existing writable checkout table sets by catalog (US-314 B2.6): which set each table whose name ends in `$<suffix>` belongs to.

#### Parameters

| Parameter  | Type                                                                  | Description                                   |
| ---------- | --------------------------------------------------------------------- | --------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of a transaction on this adapter |

#### Returns

`Promise`&lt;readonly `string`[]&gt;

The table set suffixes, sorted and deduplicated; a configured entity's main table that happens to have exactly this shape does not count

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

1. Convert actions to SQL operations
2. In a transaction:
   a) Execute the SQL operations on the entity tables (INSERT/UPDATE/DELETE)
   b) Batch-insert localChanges into the RxDBChange table (for history tracking)
3. Send local events to notify the UI of updates

#### Parameters

| Parameter          | Type                                                                     | Description                                                                                             |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `actions`          | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md)  | The compressed set of change operations (pulled from the remote)                                        |
| `localChanges?`    | `Omit`&lt;[`RxDBChange`](../../rxdb/classes/RxDBChange.md), `"id"`&gt;[] | Records to save to the local RxDBChange table (optional)                                                |
| `disableTriggers?` | `boolean`                                                                | Whether to disable triggers (used for pull and similar operations to avoid creating RxDBChange records) |

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

Upgrades the tables owned by RxDB before application migrations or repository operation.
Adapters that do not need to persist system schema state keep the default no-op implementation.

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

Bulk-mutates entities (create/update/delete)

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

Generates the description of a persistent storage backend.

#### Parameters

| Parameter | Type     | Description                                                     |
| --------- | -------- | --------------------------------------------------------------- |
| `label`   | `string` | The storage name written into the manifest, e.g. `idb` / `opfs` |

#### Returns

[`SqliteBackupStorage`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteBackupStorage.md)

A persistent backend whose `storageKey` is `<adapter>:<label>:<dbName>`

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

The logical name (the base class's one) plus the name this family actually creates

#### Remarks

The entire point of the override is **to keep the rule in one place**: the name is given by get\_table\_name\_by\_metadata,
the same function used by table creation, queries and triggers. Before this, `@aiao/rxdb-plugin-working-tree`'s
versioned domain assembled its own copy by splitting on `'$'`; when the naming changed, that copy did not error — it just stopped recognizing the table, and so
the raw-write gate silently let it through.

The base class's logical name is kept rather than only returning the folded name: raw judgment would rather **over-recognize** a name — over-recognizing only blocks
one more statement that would not have worked on this backend anyway; the one missed name is exactly the name a capture-bypassing write would use.

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

**The judgment comes from the core package; this only wires it up** (adapter-contract.md §2). `rawQuery?()` is
an optional method on `IRxDBAdapter`, so the core package cannot wrap it for the adapter the way it does the four capture mount points, and therefore this one
`gateRawWrite` call is the only thing this class has to get right. The judgment itself is not rewritten here in any way — if any one of the six implementations
wrote the lexical normalization loosely, the whole line of defense would have a hole, and that hole would never show up in any single backend's own tests.

This one call covers the **5 v1 adapters** (wa-sqlite / sqlite-wasm / sqlite / sqliteai / electron):
they all extend this class and none of them overrides `rawQuery`. Writing it once in each of the five subclasses is the shape T064 "do not write one per adapter" explicitly rules out;
should some subclass ever override `rawQuery`, it would have to wire it up itself, which T068's 6 consistency call sites cover.

Registered business tables are rejected before the transaction starts; calls that would have been allowed re-read the physical catalog inside the executing transaction and pass the same gate again,
to avoid missing shadow tables newly created by another instance. Both judgments happen before the business statement is issued. Behavior is unchanged inside the bootstrap window when no capture is installed.

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

Reads one page of rows in storage form (read-only checkout builds the snapshot, US-313).

#### Parameters

| Parameter    | Type                                                                                       | Description                                                      |
| ------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `executor`   | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)                      | The executor of a transaction on the main database               |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)                                      | The entity class on the main instance                            |
| `after`      | \| [`WorktreeSnapshotCursor`](../../rxdb/type-aliases/WorktreeSnapshotCursor.md) \| `null` | The cursor of the previous page; `null` reads from the beginning |
| `limit`      | `number`                                                                                   | At most how many rows per page                                   |

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

The readiness gate: **must be called before taking a queue slot, never inside a queued task**.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

The queue concurrency is 1. Waiting for `RxDB.connect()` inside the critical section would deadlock: `RxDB.connect()`'s first-install path relies on
the watermark transaction behind the queue to finish, and that transaction can never get the held slot (measured trace in design doc §1.2).

The gate waits for **the whole of `RxDB.connect()`**, not for "this adapter's client has connected". Between the two lie table creation,
system migration and the watermark; when it once gated on client state, external writes arriving in that window hit tables that did not exist yet
(`no such table`). `RxDB.connect()` caches its promise by name, so once complete this is just one more microtask hop.

The bootstrap chain itself **must not** pass this gate (that would be waiting on itself); it always goes through [bootstrapTransaction](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#bootstraptransaction).

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`ready`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#ready)

---

### reconcileEntityIndexes()? \{#reconcileentityindexes\}

```ts
reconcileEntityIndexes ? EntityTypes : Promise<void>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:611

Idempotently converges entity indexes after user migrations and missing-table backfill.

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

Batch-deletes entities.

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

| Parameter         | Type                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `repositoryName`  | `string`                                                                                                                                |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterWaSqliteMiniProgram`, `RT`&gt; |

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

Restores the archive produced by [backup](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#backup) into this adapter config's empty storage.

#### Parameters

| Parameter  | Type                                                                                        | Description                             |
| ---------- | ------------------------------------------------------------------------------------------- | --------------------------------------- |
| `source`   | `ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;                               | The archive byte stream                 |
| `options?` | [`SqliteRestoreOptions`](../../rxdb-adapter-sqlite-core/interfaces/SqliteRestoreOptions.md) | Cancellation signal and phase callbacks |

#### Returns

`Promise`&lt;[`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md)&gt;

The end marker and the manifest

#### Remarks

Must be called before `rxdb.connect()` (obtain the not-yet-connected instance via `rxdb.getAdapter(name)`): reports
`target_busy` when connected or mid-restore. Only writes into an **empty** target; compatibility (adapter, engine major version, virtual table modules, system table / change encoding versions,
entity structure fingerprint, encryption authentication domain) is judged before the first statement is written, and commits only after every check passes.

- Persistent storage: after a successful restore a normal `rxdb.connect()` suffices; if the page was closed mid-restore, later connections report `restore_incomplete`,
  requiring [cleanupIncompleteRestore](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#cleanupincompleterestore) first.
- In-memory storage: the restored database only lives in this instance and is taken over by the next `rxdb.connect()`; without connecting, [disconnect](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#disconnect) releases it.

Restored rows produce no change history; encrypted databases stay locked. The input stream is cancelled on failure; on success only the read lock is released.

#### Throws

RxDBBackupError, see RxDBBackupErrorCode; `cleanup_pending` means even the cleanup did not finish after a failure

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

Executes the transaction work.

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-7"></a> `T` _extends_ [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Description                                                             |
| ----------------- | --------- | ----------------------------------------------------------------------- |
| `transactionFun`  | `T`       | The transaction work; its parameter is the current transaction executor |
| `transactionLog?` | `boolean` | -                                                                       |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The transaction work's return value

#### Remarks

The real adapter entry always opens a new transaction; the executor facade maps `runInTransaction()` inside a transaction to
`executor.run()`, reusing the current transaction without re-enqueueing.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`runInTransaction`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#runintransaction)

---

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:204

Batch-writes entities (inserts if absent, updates if present).

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

The entities after being stored; fields backfilled by the database — primary key, database-side defaults — only have values here

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`saveMany`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#savemany)

---

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

Commits or rolls back the entity state of public repositories; must be called before handing the transaction queue back.

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

| Parameter | Type                                                                                          | Description                                                               |
| --------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `hook`    | \| [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md) \| `undefined` | The runtime that takes over the four mount points; `undefined` uninstalls |

#### Returns

`void`

#### Remarks

The mount is installed **here** rather than having each of the six adapters insert a line in its own `transaction()`: writing it once less,
or once too late (validating the token only after the business write), would be discoverable by nothing — exactly the shape §2 "the judgment implementation
exists in one place" rules out.

The callers are `RxDB.connect()` (after confirming the capability bit is true) and `workingTree.enable()` (after the bit flips successfully).
On a database without the capability enabled it is never called, so the four write primitives do not even carry a forwarding layer.

Idempotent: if already installed, it uninstalls first and then installs, never stacking two layers.

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

The archive saves shadow tables row by row as-is, and restore must rewrite them wholesale. Allowed by default; backends running SQLite in defensive mode cannot change shadow tables,
and override this to `false`: databases containing shadow tables then report `unsupported_combination` for both backup and restore, instead of producing an archive that cannot be restored,
or failing halfway through a write.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`shadowTablesWritable`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#shadowtableswritable)

---

### sharedClientLockName() \{#sharedclientlockname\}

```ts
protected sharedClientLockName(): string | undefined;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:396

The Web Lock name used for cross-tab serialized transactions when the client is shared by multiple tabs; returns `undefined` (the default) when not shared.

#### Returns

`string` \| `undefined`

The lock name; adapters on the same shared connection must give the same name

#### Remarks

Under SharedWorker transport, each tab's adapter only serializes its own queue: while one tab's transaction is open, another tab's statements would land inside
that transaction (US-314 B2.3b, main fix). With a lock name, every queued task runs inside this lock, and taking the lock first rolls back the transaction left behind by a dead tab
([SqliteClientLike.rollbackOrphanTransaction](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#rollbackorphantransaction)); disconnect becomes handing back its own share ([SqliteClientLike.release](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#release)).

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

Reads and writes within one transaction through the executor.

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

`entity.save()` without an executor re-enqueues. Awaiting it inside the transaction callback waits on itself, and the transaction cannot finish.
Inside a transaction use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository); for saving entity instances see [EntityBase.save](../../rxdb/classes/EntityBase.md#save).

#### Examples

```ts
// ✅ Get the repository through the executor; all reads and writes belong to this transaction.
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
// ❌ The entity instance does not hold an executor; save() re-enqueues and waits for the current transaction to end.
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

Wraps a public repository's whole operation in a transaction; not called when the executor creates the repository.

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

Batch upsert of data (QueryCache only)

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

The version of the underlying database engine (e.g. SQLite's `3.45.0`), used for diagnostics and capability judgment.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Unrelated to the system table watermark (`RXDB_SYSTEM_SCHEMA_VERSION`), which is RxDB's own number.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`version`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#version)

---

### worktreeTableSetMounted() \{#worktreetablesetmounted\}

```ts
worktreeTableSetMounted(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:268

**`Internal`**

Clears the row-id cache after this instance switches to a different table set (US-314 B1.4): row ids are recorded per physical table, so after switching sets the same row id points at a different row.

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
