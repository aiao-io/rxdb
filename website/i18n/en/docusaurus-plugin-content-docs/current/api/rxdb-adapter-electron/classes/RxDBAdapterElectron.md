# RxDBAdapterElectron

Defined in: [packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts#L30)

Connects RxDB to real SQLite files in the Electron app's private directory.

## Remarks

Data lives in the main process's `node:sqlite` connection; the renderer only sends requests over a narrow transport, so it gets neither filesystem handles nor physical paths (AC#3).

The adapter has no query implementation of its own: it reuses the full set of SQL, transaction, and branch-switching logic from [RxDBAdapterSqliteBase](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md), only swapping "where the client comes from" for the desktop host. The Tauri side is an isomorphic class (`RxDBAdapterTauri` from `@aiao/rxdb-adapter-tauri`); the two share the same wire protocol and renderer client.

## Extends

- [`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md)

## Constructors

### Constructor

```ts
new RxDBAdapterElectron(rxdb, options?): RxDBAdapterElectron;
```

Defined in: [packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts#L46)

#### Parameters

| Parameter  | Type                                                | Description                         |
| ---------- | --------------------------------------------------- | ----------------------------------- |
| `rxdb`     | [`RxDB`](../../rxdb/classes/RxDB.md)                | The bound RxDB instance             |
| `options?` | [`DesktopOptions`](../interfaces/DesktopOptions.md) | Transport and logical database name |

#### Returns

`RxDBAdapterElectron`

#### Throws

[RxDBAdapterDesktopError](RxDBAdapterDesktopError.md) throws `invalid_database_name` when the logical database name escapes the app's scope

#### Overrides

`RxDBAdapterSqliteBase.constructor`

## Properties

### clientOwner \{#clientowner\}

```ts
protected readonly clientOwner: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:33

This adapter's owner key on the client: handed to the client at `init` inside `createClient()`, and carried when registering listeners and when handing back on disconnect (US-314 B2.3b).

#### Remarks

There is only one client inside a SharedWorker, and every tab's adapter connects to it; on disconnect, this key is used to hand back only one's own share and to remove only one's own listeners ([SqliteClientLike.release](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#release)). Backends that do not share a client can ignore it.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`clientOwner`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#clientowner)

---

### name \{#name\}

```ts
readonly name: string = ADAPTER_NAME;
```

Defined in: [packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts#L34)

The adapter name, same value as the key used when registering with `RxDB.adapter()`; error messages and `getAdapter()` both identify by it

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`name`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#name)

---

### options \{#options\}

```ts
readonly options: DesktopOptions = {};
```

Defined in: [packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts#L48)

Transport and logical database name

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
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterElectron, RepositoryInstance<EntityType>>>;
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

### databaseName \{#databasename\}

#### Get Signature

```ts
get databaseName(): string;
```

Defined in: [packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts#L37)

The resolved logical database name, one-to-one with the physical file on the host side.

##### Returns

`string`

---

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

#### Remarks

Stored on the RxDB instance ([RxDB.worktreeTableSet](../../rxdb/classes/RxDB.md#worktreetableset-1)); this just reads it through: an instance is mounted on only one table set at a time, and the adapter storing another copy would be a second source of truth. SQL that reads and writes business tables resolves physical names through it; entities without replicas such as system tables and the QueryCache land in the main table set no matter which set is mounted.

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

The capture runtime; always `undefined` on databases where commit capability is not enabled.

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

#### Remarks

`rawQuery?()` is an **optional method** on this interface (see `IRxDBAdapter` above), so the core package cannot wrap it for the adapters the way it does the four capture mount points — judgment can only be invoked by each adapter's own `rawQuery` implementation calling `gateRawWrite(sql, ctx, …)`. The `ctx` that call needs is handed out here, so the only thing the six adapters must get right is "passing it to the judgment"; the two questions that are actually easy to get wrong — "how the capability bit is computed" and "where the domain comes from" — never land on them at all.

The capability bit is decided directly by **whether the capture runtime is installed**, with no separate boolean stored: the runtime is installed only when the bit is true (`RxDB.connect()` read true, or `workingTree.enable()` just flipped it). Storing another copy would be a second source of truth, and the consequence of the two going out of sync is one-directional — the gate thinks it is off and all raw writes pass. The context object itself is built in the **same assignment** as the runtime inside `setWorkingTreeCaptureHook()`, not created fresh on every access: the getter is called on every raw statement, and it holds no per-call state. The two fields only change together in that one place, so "a new runtime installed while a closure bound to the old runtime is handed out" is not a reachable state.

What is handed out is the **judgment entry itself**, not the things the judgment looks at (domain, column set, trusted intent). The core therefore does not have to restate what the capture recognizes, and there is no dual-list hazard like "a domain was copied out and the plugin's later-registered derived index columns only land in one of the copies" — judgment always runs on the copy in the runtime's hands.

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

Subscribes to change handling failures.

#### Parameters

| Parameter  | Type                                                                                                    | Description                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `listener` | [`SqliteChangeErrorListener`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteChangeErrorListener.md) | Callback receiving [SqliteChangeErrorEvent](../../rxdb-adapter-sqlite-core/interfaces/SqliteChangeErrorEvent.md); exceptions are isolated |

#### Returns

`void`

#### Remarks

Once a listener is registered, the default `console.error` fallback is taken over by the listener (SQLC-012).

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`addChangeErrorListener`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#addchangeerrorlistener)

---

### adoptWorktreeEncryption() \{#adoptworktreeencryption\}

```ts
adoptWorktreeEncryption(source): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:83

Adopts the main database adapter's keyring (read-only checkout, US-313).

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

Precondition guard for `dropStorage()`: refuses while still connected (read-only checkout reclaiming snapshot databases, US-313).

#### Returns

`void`

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when the adapter is still connected

#### Remarks

`dropStorage()` lives on each concrete adapter rather than here: only they know where the database lives (an IndexedDB database name, an OPFS file name, a file on the host) — a base-class implementation would be inherited as-is by subclasses like Tauri and mini-program that do not know how to delete.

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

| Parameter  | Type                                                              | Description                                          |
| ---------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| `sink`     | `WritableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;     | Output stream; closed on success, aborted on failure |
| `options?` | [`RxDBBackupOptions`](../../rxdb/interfaces/RxDBBackupOptions.md) | Cancellation signal and queue time limit             |

#### Returns

`Promise`&lt;[`RxDBBackupResult`](../../rxdb/interfaces/RxDBBackupResult.md)&gt;

The end marker (entry count, byte count, SHA-256) and the manifest; the output stream's close has completed

#### Remarks

The archive is a logical dump: all structure statements and row literals, taken inside the adapter's serial queue within one read transaction, so it is consistent with a single transaction commit boundary and includes data already committed in the WAL. **The entire write-out holds the database**: while the output stream exerts backpressure, reads and writes during that time queue up. Calling it inside this adapter's transaction callback waits on itself until `lockTimeoutMs` and then reports `lock_timeout`.

The archive contains business tables, system tables, change history, and the keyring's ciphertext; encrypted columns stay ciphertext and need no unlocking. External files are not included (`scope.externalFiles === 'excluded'`). See each adapter's README for supported storages.

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

Defined in: [packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts#L101)

The desktop database is a database file in the app data directory; backup and restore are supported on that basis.

#### Returns

[`SqliteBackupStorage`](../../rxdb-adapter-sqlite-core/type-aliases/SqliteBackupStorage.md)

Persistent storage backend with `label` `file`

#### Remarks

`storageKey` uses the database file name rather than `dbName`: two instances configured with the same `databaseName` open the same file and must contend for the same lock; an instance with the same name restored to a different `databaseName` (a new data location) is unrelated to the original database.

#### Overrides

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

| Parameter         | Type      | Description                                                            |
| ----------------- | --------- | ---------------------------------------------------------------------- |
| `transactionFun`  | `T`       | The transaction work; its argument is the current transaction executor |
| `transactionLog?` | `boolean` | Whether to write a transaction log                                     |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

#### Remarks

Only for the bootstrap chain of `RxDB.connect()` (watermark, table creation, migration) and this class's internal bootstrap steps — they themselves run inside the `RxDB.connect()` promise, so waiting on the readiness gate is waiting on themselves.

Tables may not exist yet at this point; the bootstrap chain guarantees the order itself. Do **not** call it inside a transaction body: the facade does not override this method, so the call lands on the real adapter and enqueues again — enqueueing a second time while holding the slot hangs forever.

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

Defined in: [packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts#L62)

Whether `dropStorage()` can delete this database (asked once before a read-only checkout creates its snapshot database, US-313).

#### Returns

`boolean`

Always `true`: the database file is deleted by the host; when a session still has a same-named database open, the host refuses at the moment of deletion

#### Overrides

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

Called by the core inside `RxDB.connect()` at the same point as `reconcileEntityIndexes` (after user migrations and missing-table creation). Compares `ck_` CHECKs, `uq_` conditional unique indexes, and `ex_` range-exclusion triggers; throws RxDBConstraintDriftError on mismatch.

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

Cleans up an unfinished restore (the page closed mid-restore, or the cleanup itself failed after a failed restore).

#### Returns

`Promise`&lt;`boolean`&gt;

`true` when residue was actually cleaned up

#### Remarks

Must be called before connecting. Failing to get the exclusive lock means the target is being connected to or restored, and reports `target_busy`; with no incomplete marker it does nothing. In-memory storage has no residue to speak of and is always `false`.

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

Adapters with their own readiness gate (SQLite family / PGlite) let `query()` / `rawQuery()` / `createTables()` skip the gate inside the bootstrap window — that gate is waiting for the not-yet-settled `RxDB.connect()`. This method flips the state to `ready`, after which every entry goes through normal readiness waiting. Adapters without a readiness gate keep the default no-op implementation.

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

Table creation and system migration both happen here (see `isCurrentRxDBSystemVersion`), so it can be slow, and it can throw `UnsupportedRxDBSystemVersionError` when the database is newer than this process.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`connect`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#connect)

---

### createClient() \{#createclient\}

```ts
protected createClient(): Promise<DesktopSqliteClient>;
```

Defined in: [packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts#L84)

Creates or obtains the SQLite client.
Each concrete adapter implements this method with its own backend's logic.

#### Returns

`Promise`&lt;[`DesktopSqliteClient`](DesktopSqliteClient.md)&gt;

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createClient`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createclient)

---

### createRestoreTargetClient() \{#createrestoretargetclient\}

```ts
protected createRestoreTargetClient(): Promise<SqliteClientLike>;
```

Defined in: [packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts#L123)

Other windows and other processes may have the same database file open, and Web Locks cannot stop them: before restoring or cleaning up, make this connection take exclusive possession of the database file.

#### Returns

`Promise`&lt;[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)&gt;

The connection exclusively holding the database file

#### Overrides

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

Creates a repository bound to `host` **without writing** to `repository_cache`.

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

Used by [SqliteTransactionExecutor.getRepository](../../rxdb-adapter-sqlite-core/classes/SqliteTransactionExecutor.md#getrepository). The cache must be bypassed because: repositories in the cache live as long as the adapter; if a transaction-scoped repository were written into it, it would stay in the cache after the transaction ends, pointing at a committed/rolled-back transaction context, and later **external** writes would hit it.

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

Creates and seeds a set of writable-checkout tables inside the caller's transaction (US-314 B1.5); see `worktree/worktree-table-set.ts` for the approach.

#### Parameters

| Parameter  | Type                                                                    | Description                                                                                     |
| ---------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)   | An executor of a transaction on this adapter                                                    |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)            | The table set to create; its members are decided by the caller (entities in a versioned domain) |
| `seed`     | [`WorktreeTableSetSeed`](../../rxdb/interfaces/WorktreeTableSetSeed.md) | The branch held and the increments to layer on top                                              |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when given the main table set, when a member entity does not record change logs, when increments fall outside the table set, or when the main table is missing columns

#### Remarks

Does not write the hold key: the flow that opens the checkout writes it itself in the same transaction. The main table set is created with database and table creation ([RxDBAdapterSqliteBase.createTables](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createtables)), not through here.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`createWorktreeTableSet`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#createworktreetableset)

---

### deleteByIds() \{#deletebyids\}

```ts
deleteByIds(entityName, ids): Observable<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:321

Batch delete by ID list (QueryCache only)

Used to clean up data already deleted remotely from the local cache.

#### Parameters

| Parameter    | Type       | Description               |
| ------------ | ---------- | ------------------------- |
| `entityName` | `string`   | Entity name               |
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

Unlike `RxDB.destroy()`, disconnecting is **reversible**: the same adapter instance can `connect()` again later. Implementations must be idempotent — calling while unconnected is a no-op, not an error.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`disconnect`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#disconnect)

---

### dropStorage() \{#dropstorage\}

```ts
dropStorage(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts#L76)

Deletes this database's database file and its journal sidecar files on the host (read-only checkout reclaiming snapshot databases, US-313).

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

RxDBAdapterSqliteError when still connected

#### Throws

[RxDBAdapterDesktopError](RxDBAdapterDesktopError.md) throws `database_busy` when a session on the host still has this database open; when no transport is injected, or deletion fails

#### Remarks

The deletion happens on the host: the renderer cannot touch the filesystem and does not know the database file's physical location (AC#3). Does nothing when the database file does not exist.

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`dropStorage`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#dropstorage)

---

### dropWorktreeTableSet() \{#dropworktreetableset\}

```ts
dropWorktreeTableSet(executor, tableSet): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:231

Drops a set of writable-checkout tables inside the caller's transaction (US-314 B1.5): found by directory, triggers detached before tables are dropped.

#### Parameters

| Parameter  | Type                                                                  | Description                                  |
| ---------- | --------------------------------------------------------------------- | -------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | An executor of a transaction on this adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)          | The table set to drop                        |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when given the main table set

#### Remarks

The hold keys on the branch tables are not released here; the flow that closes the checkout releases them itself in the same transaction.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`dropWorktreeTableSet`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#dropworktreetableset)

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

Called by the change handling pipeline (`handle_rxdb_change`), not for application code. This method **never throws**: no caller on its path can catch an exception, and throwing would just become an unhandled rejection.

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

Fetches metadata for a list of IDs (QueryCache only)

Used for local cache freshness checks; returns an ID → updatedAt mapping.

#### Parameters

| Parameter    | Type       | Description    |
| ------------ | ---------- | -------------- |
| `entityName` | `string`   | Entity name    |
| `ids`        | `string`[] | Entity ID list |

#### Returns

`Observable`&lt;`Map`&lt;`string`, `string`&gt;&gt;

`Observable<Map<string, string>>` - ID → updatedAt mapping

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

Writes rows and increments read from the main database into this database (read-only checkout building a snapshot, US-313).

#### Parameters

| Parameter  | Type                                                                        | Description                                          |
| ---------- | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| `snapshot` | [`WorktreeSnapshotImport`](../../rxdb/interfaces/WorktreeSnapshotImport.md) | The tables to copy and the increments layered on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBAdapterSqliteError](../../rxdb-adapter-wa-sqlite/classes/RxDBAdapterSqliteError.md) when this database has a capture runtime installed

#### Remarks

One transaction, no events dispatched: snapshot instance entities are all `log: false`, so no change log exists to derive events from. Increments are generated by the same SQL as branch switching, except encrypted columns pass through as envelopes.

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

Decides whether a stored value is already in encrypted at-rest form (FR-038).

#### Parameters

| Parameter | Type      | Description                    |
| --------- | --------- | ------------------------------ |
| `value`   | `unknown` | The value in the stored column |

#### Returns

`boolean`

`true` when it is an envelope string

#### Remarks

There is only one authoritative decider — `isEnvelope` from `@aiao/rxdb-adapter-encrypted`. This method is a one-line forward from the core's optional slot ([RxDBAdapterLocalBase.isEncryptedAtRest](../../rxdb/classes/RxDBAdapterLocalBase.md#isencryptedatrest)) to it; it does not recognize a second shape here. `@aiao/rxdb` cannot depend on the encryption package (the dependency direction is reversed), so this one line can only live on the adapter side.

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

Lists existing writable-checkout table sets by directory (US-314 B2.6): which set each table whose name ends in `$<suffix>` belongs to.

#### Parameters

| Parameter  | Type                                                                  | Description                                  |
| ---------- | --------------------------------------------------------------------- | -------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | An executor of a transaction on this adapter |

#### Returns

`Promise`&lt;readonly `string`[]&gt;

Table set suffixes, sorted and deduplicated; main tables of configured entities that happen to take this shape are not counted

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

Applies compressed changes to local entity tables

Implementation strategy (SQLite):

1. Convert actions to SQL operations
2. Inside a transaction:
   a) Execute SQL operations on entity tables (INSERT/UPDATE/DELETE)
   b) Batch-insert localChanges into the RxDBChange table (for history tracking)
3. Send local events to notify the UI to update

#### Parameters

| Parameter          | Type                                                                     | Description                                                                                       |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `actions`          | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md)  | The compressed set of change operations (pulled from the remote)                                  |
| `localChanges?`    | `Omit`&lt;[`RxDBChange`](../../rxdb/classes/RxDBChange.md), `"id"`&gt;[] | Records to save to the local RxDBChange table (optional)                                          |
| `disableTriggers?` | `boolean`                                                                | Whether to disable triggers (used for operations like pull, to avoid creating RxDBChange entries) |

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

Upgrades RxDB-owned tables before application migrations or repositories run.
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

The persistent backend whose `storageKey` is `<adapter>:<label>:<dbName>`

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

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |

#### Returns

readonly `string`[]

The logical names (the base class's copy) plus the name this family actually creates

#### Remarks

The whole point of the override is **to keep the rule in one place**: names come from get\_table\_name\_by\_metadata, the same function used by table creation, queries, and triggers. Before this, `@aiao/rxdb-plugin-working-tree`'s versioned domain assembled its own copy by `'$'`; change the assembly, and that copy does not error — it just starts failing to recognize this table, and the raw-write gate silently lets it through.

The base class's logical names are kept rather than returning only the folded name: raw judgment prefers to **recognize one name too many** — an extra recognition only blocks a statement that would not run on this backend anyway; the one missed is exactly the name a capture-bypassing write would use.

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

**The judgment comes from the core package; here it only needs to be connected** (adapter-contract.md §2). `rawQuery?()` is an optional method on `IRxDBAdapter`, so the core package cannot wrap it for the adapters the way it does the four capture mount points — this one `gateRawWrite` call is the only place this class must get right. The judgment itself is not restated here by a single word — if any one of the six implementations loosens lexical normalization, the whole line of defense has a hole, and that hole will not surface in any single backend's own tests.

This one call covers **5 v1 adapters** (wa-sqlite / sqlite-wasm / sqlite / sqliteai / electron): they all inherit this class and none overrides `rawQuery`. Writing it in each of the five subclasses is the shape T064 "do not write one per implementation" explicitly rules out; should a subclass ever actually override `rawQuery`, it must connect the gate itself — backed by T068's 6 consistency call sites.

Registered business tables are rejected before a transaction opens; calls that would have passed re-read the physical directory inside the execution transaction and go through the same gate again, so shadow tables newly created by other instances are not missed. Both judgments happen before business statements are dispatched. Inside the bootstrap window, with no capture installed, the original behavior is kept.

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

Reads one page of storage-form rows (read-only checkout building a snapshot, US-313).

#### Parameters

| Parameter    | Type                                                                                       | Description                                             |
| ------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `executor`   | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)                      | An executor of a transaction on the main database       |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)                                      | The entity class on the main instance                   |
| `after`      | \| [`WorktreeSnapshotCursor`](../../rxdb/type-aliases/WorktreeSnapshotCursor.md) \| `null` | The previous page's cursor; `null` reads from the start |
| `limit`      | `number`                                                                                   | Maximum rows in this page                               |

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

Readiness gate: **must be called before acquiring the queue slot, never inside a queue task**.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

The queue concurrency is 1. Waiting for `RxDB.connect()` inside the critical section would form a cycle: `RxDB.connect()`'s first-install path can only complete through the watermark transaction at the back of the queue, and that transaction can never get the occupied slot (see the design doc §1.2 for the measured trace).

The gate waits for **the whole `RxDB.connect()`**, not "whether this adapter's client is connected". Between the two lie table creation, system migration, and the watermark; it used to admit by client state, so external writes arriving inside that window hit tables that did not exist yet (`no such table`). `RxDB.connect()` itself caches its promise by name; when complete, this is just one extra microtask hop.

The bootstrap chain itself must **not** go through this gate (that would be waiting on itself); it always goes via [bootstrapTransaction](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#bootstraptransaction).

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

Cancels a subscription made with [addChangeErrorListener](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#addchangeerrorlistener).

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

| Parameter         | Type                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `repositoryName`  | `string`                                                                                                                     |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterElectron`, `RT`&gt; |

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

Restores the archive produced by [backup](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#backup) into this adapter's configured empty storage.

#### Parameters

| Parameter  | Type                                                                                        | Description                             |
| ---------- | ------------------------------------------------------------------------------------------- | --------------------------------------- |
| `source`   | `ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;                               | The archive byte stream                 |
| `options?` | [`SqliteRestoreOptions`](../../rxdb-adapter-sqlite-core/interfaces/SqliteRestoreOptions.md) | Cancellation signal and phase callbacks |

#### Returns

`Promise`&lt;[`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md)&gt;

The end marker and the manifest

#### Remarks

Must be called before `rxdb.connect()` (obtain the not-yet-connected instance via `rxdb.getAdapter(name)`): reports `target_busy` when connected or mid-restore. Writes only into an **empty** target; compatibility (adapter, engine major version, virtual table modules, system table / change encoding versions, entity structure fingerprint, encryption auth domain) is decided before the first statement is written, and the commit happens only after every check passes.

- Persistent storage: after the restore completes, a normal `rxdb.connect()` suffices; if the page closes mid-restore, later connections report `restore_incomplete` and require [cleanupIncompleteRestore](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#cleanupincompleterestore) first.
- In-memory storage: the restored database lives only in this instance and is taken over by the next `rxdb.connect()`; when not connecting, [disconnect](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#disconnect) releases it.

Restored rows produce no change history; encrypted databases stay locked. The input stream is cancelled on failure and only releases its read lock on success.

#### Throws

RxDBBackupError, see RxDBBackupErrorCode; `cleanup_pending` means even the cleanup after the failure was not finished

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

Runs transaction work.

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-7"></a> `T` _extends_ [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Description                                                            |
| ----------------- | --------- | ---------------------------------------------------------------------- |
| `transactionFun`  | `T`       | The transaction work; its argument is the current transaction executor |
| `transactionLog?` | `boolean` | -                                                                      |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The transaction work's return value

#### Remarks

The real adapter entry always opens a new transaction; the executor facade maps an in-transaction `runInTransaction()` to `executor.run()`, reusing the current transaction without re-enqueueing.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`runInTransaction`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#runintransaction)

---

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:204

Batch-writes entities (insert if absent, update if present).

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

The entities after persistence; fields backfilled by the database, such as primary keys and database-side defaults, only have values here

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`saveMany`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#savemany)

---

### sealWorktreeReadOnly() \{#sealworktreereadonly\}

```ts
sealWorktreeReadOnly(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:87

Seals this database read-only (read-only checkout, US-313): from then on, write statements on this connection are rejected by SQLite.

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

Commits or rolls back the public repository's entity state; must be called before handing the transaction queue back.

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

The mount lives **here** rather than having each of the six adapters insert a line in its own `transaction()`: a missed write or a late write (validating the token only after the business write) is undetectable by anything, and that is exactly the shape §2 "only one judgment implementation" rules out.

The callers are `RxDB.connect()` (after confirming the capability bit is true) and `workingTree.enable()` (after the bit flip succeeds). On databases where it is not enabled, neither is ever called, so the four write primitives do not even have a forwarding layer.

Idempotent: if already installed, it is uninstalled first and then installed again, never stacking into two layers.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`setWorkingTreeCaptureHook`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#setworkingtreecapturehook)

---

### shadowTablesWritable() \{#shadowtableswritable\}

```ts
protected shadowTablesWritable(): boolean;
```

Defined in: [packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts#L114)

The Electron host runs SQLite in defensive mode and cannot modify shadow tables.

#### Returns

`boolean`

Always `false`

#### Remarks

The host executes renderer-relayed SQL in the privileged main process; defensive mode blocks direct shadow-table rewrites and `writable_schema`-class operations that can corrupt the database file, and it must not be turned off for restore. Databases containing virtual tables such as FTS5 are therefore outside Electron's backup matrix.

#### Overrides

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`shadowTablesWritable`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#shadowtableswritable)

---

### sharedClientLockName() \{#sharedclientlockname\}

```ts
protected sharedClientLockName(): string | undefined;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:396

When the client is shared across tabs, the Web Lock name used to serialize transactions across tabs; returns `undefined` (default) when not shared.

#### Returns

`string` \| `undefined`

The lock name; adapters on the same shared connection must give the same name

#### Remarks

Under SharedWorker transport, each tab's adapter only serializes its own queue: while one tab's transaction is open, another tab's statements land inside that transaction (US-314 B2.3b, fixing main). With a lock name, every queued task runs inside this lock; upon acquiring the lock it first rolls back transactions left by dead tabs ([SqliteClientLike.rollbackOrphanTransaction](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#rollbackorphantransaction)), and disconnecting becomes handing back one's own share ([SqliteClientLike.release](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#release)).

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

Reads and writes in the same transaction through an executor.

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-9"></a> `T` _extends_ [`TransactionFun`](../../rxdb-adapter-sqlite-core/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Description                                  |
| ----------------- | --------- | -------------------------------------------- |
| `transactionFun`  | `T`       | Callback holding this transaction's executor |
| `transactionLog?` | `boolean` | Whether to record a transaction log          |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The callback result

#### Remarks

An `entity.save()` that does not hold an executor re-enqueues. Waiting for it inside the transaction callback waits on itself, and the transaction cannot end. Inside a transaction, use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository); for saving entity instances, see [EntityBase.save](../../rxdb/classes/EntityBase.md#save).

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
// ❌ The entity instance does not hold an executor; save() re-enqueues and then waits for the current transaction to end.
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

Wraps the public repository's whole operation in a transaction; not called when the executor creates the repository.

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

Batch-upserts data (QueryCache only)

Executes INSERT OR REPLACE semantics, used to cache remotely fetched data.

#### Type Parameters

| Type Parameter                       |
| ------------------------------------ |
| <a id="type-parameter-t-11"></a> `T` |

#### Parameters

| Parameter    | Type     | Description               |
| ------------ | -------- | ------------------------- |
| `entityName` | `string` | Entity name               |
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

The underlying database engine's version number (e.g. SQLite's `3.45.0`), used for diagnostics and capability decisions.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Unrelated to the system table watermark number (`RXDB_SYSTEM_SCHEMA_VERSION`), which is RxDB's own number.

#### Inherited from

[`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md).[`version`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md#version)

---

### worktreeTableSetMounted() \{#worktreetablesetmounted\}

```ts
worktreeTableSetMounted(): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/RxDBAdapterSqliteBase.d.ts:268

**`Internal`**

Clears the row number cache after this instance mounts a different table set (US-314 B1.4): row numbers are recorded per physical table, and with a different table set, the same row number points at a different row.

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
