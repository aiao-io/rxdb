# RxDBAdapterPGlite

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L173)

RxDB PGlite adapter

Local storage adapter based on PGlite (WebAssembly PostgreSQL)
Provides full relational database features, including:

- entity persistence and queries
- transaction management
- branch management (for multi-version data management)
- change history tracking

## Extends

- [`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md)

## Implements

- [`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)

## Constructors

### Constructor

```ts
new RxDBAdapterPGlite(rxdb, options): RxDBAdapterPGlite;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:262](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L262)

#### Parameters

| Parameter | Type                                                          |
| --------- | ------------------------------------------------------------- |
| `rxdb`    | [`RxDB`](../../rxdb/classes/RxDB.md)                          |
| `options` | [`PGliteClientOptions`](../interfaces/PGliteClientOptions.md) |

#### Returns

`RxDBAdapterPGlite`

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`constructor`](../../rxdb/classes/RxDBAdapterLocalBase.md#constructor)

## Properties

### changeErrors$ \{#changeerrors\}

```ts
readonly changeErrors$: Observable<Error>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L232)

Error stream of PGlite NOTIFY change processing.

#### Remarks

Lives as long as the adapter instance: disconnecting does not complete it, and pipeline failures after a reconnect of the same instance are emitted here too, so subscribers do not need to resubscribe after a reconnect.

---

### name \{#name\}

```ts
name: string = ADAPTER_NAME;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:223](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L223)

Adapter name

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`name`](../../rxdb/interfaces/IRxDBAdapter.md#name)

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
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterPGlite, RepositoryInstance<EntityType>>>;
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

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:242](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L242)

##### Returns

[`AdapterEncryptionFacade`](../interfaces/AdapterEncryptionFacade.md)

---

### encryptionContext \{#encryptioncontext\}

#### Get Signature

```ts
get encryptionContext(): EncryptionContext;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L234)

##### Returns

[`EncryptionContext`](../interfaces/EncryptionContext.md)

---

### tableSet \{#tableset\}

#### Get Signature

```ts
get tableSet(): WorktreeTableSet;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:411

The business table set mounted on this instance (US-314 in-database shadow tables)

##### Remarks

Lives on the RxDB instance ([RxDB.worktreeTableSet](../../rxdb/classes/RxDB.md#worktreetableset-1)); this is only a pass-through read: one instance mounts one table set at a time, and a second copy stored on the adapter would be a second source of truth. All SQL that reads/writes business tables resolves physical names through it; entities without replicas, such as system tables and QueryCache, always land in the primary table set regardless of what is mounted.

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

The capture runtime; always `undefined` on databases without commit capability enabled.

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

`rawQuery?()` is an **optional method** on this interface (see `IRxDBAdapter` above), so the core package cannot wrap it for adapters the way it does for the four capture mount points — judgment can only be performed by each adapter's own `rawQuery` implementation calling `gateRawWrite(sql, ctx, …)`. The `ctx` that call needs is handed out here, so across the six adapters the only thing that must be written correctly is the single line "pass it to the judgment"; the two places that are actually easy to get wrong — "how capability bits are computed" and "where the domain comes from" — never fall on them.

The capability bit is decided directly by **whether the capture runtime is installed**, with no separately stored boolean: the runtime is only installed when the bit is true (`RxDB.connect()` reads true, or `workingTree.enable()` just flipped it). A second stored copy would be a second source of truth, and the consequence of the two drifting is one-directional — the gate thinks it is off, and all raw writes are let through. The context object itself is created in `setWorkingTreeCaptureHook()` in the **same assignment** as the runtime, not rebuilt on every read: the getter is called on every raw statement and holds no per-call state. The two fields only change together in that one place, so "a new runtime installed but a closure bound to the old runtime handed out" is not a reachable state.

What is handed out is the **judgment entry point itself**, not the things the judgment reads (domain, column set, trusted intent). The core therefore does not need to restate what capture accepts, and there is no duplicated list of the kind "a domain was copied out and derived index columns registered later by a plugin only land in one copy" — judgment always runs over the copy held by the runtime.

##### Returns

[`RawWriteContext`](../../rxdb/type-aliases/RawWriteContext.md)

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`workingTreeRawWriteContext`](../../rxdb/classes/RxDBAdapterLocalBase.md#workingtreerawwritecontext)

## Methods

### adoptWorktreeEncryption() \{#adoptworktreeencryption\}

```ts
adoptWorktreeEncryption(source): void;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:331](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L331)

Adopts the main database adapter's keyring (read-only checkout, US-313).

#### Parameters

| Parameter | Type                                                              | Description                        |
| --------- | ----------------------------------------------------------------- | ---------------------------------- |
| `source`  | [`LocalRxDBAdapter`](../../rxdb/type-aliases/LocalRxDBAdapter.md) | The main database's PGlite adapter |

#### Returns

`void`

#### Throws

[RxdbAdapterPGliteError](RxdbAdapterPGliteError.md) when `source` is not a PGlite adapter

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`adoptWorktreeEncryption`](../../rxdb/classes/RxDBAdapterLocalBase.md#adoptworktreeencryption)

---

### backup() \{#backup\}

```ts
backup(sink, options?): Promise<RxDBBackupResult>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:948](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L948)

Writes the entire database as a restorable archive.

#### Parameters

| Parameter  | Type                                                              | Description                                          |
| ---------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| `sink`     | `WritableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;     | Output stream; closed on success, aborted on failure |
| `options?` | [`RxDBBackupOptions`](../../rxdb/interfaces/RxDBBackupOptions.md) | Cancellation signal and queueing time limit          |

#### Returns

`Promise`&lt;[`RxDBBackupResult`](../../rxdb/interfaces/RxDBBackupResult.md)&gt;

End marker (entry count, byte count, SHA-256) and manifest; the output stream close has completed

#### Remarks

The snapshot is taken inside the adapter's serial queue, under the PGlite exclusive lock plus `CHECKPOINT`, so the archive is consistent with a transaction commit boundary. **The whole write holds the database**: when the output stream applies backpressure (slow disk, network upload), reads and writes queue during that period; callers should connect the output to a fast enough target. Calling it inside this adapter's transaction callback waits on itself and reports `lock_timeout` after `lockTimeoutMs`.

The archive contains the entire data directory (business tables, system tables, keyring ciphertext); encrypted columns stay ciphertext, no unlock needed. Currently supports `memory` and `idb://` storage, plus desktop proxy subclasses that override [backupStorage](#backupstorage); OPFS-AHP (Worker) reports `unsupported_combination`. When `idb://` storage is also open in other connections (another instance in the same page, other tabs or Workers), it reports `target_busy`: each connection has its own in-memory view, and this connection's snapshot cannot see their commits.

#### Throws

RxDBBackupError `unsupported_combination` / `target_busy` / `lock_timeout` / `aborted` / `io_error` / `storage_full`

#### Example

```typescript
const handle = await showSaveFilePicker({ suggestedName: 'notes.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());
console.log(result.sha256);
```

---

### backupExtensions() \{#backupextensions\}

```ts
protected backupExtensions(): Promise<readonly string[]>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:1066](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L1066)

Extension names recorded in the backup manifest (sorted).

#### Returns

`Promise`&lt;readonly `string`[]&gt;

Extension names

#### Remarks

By default takes the extensions registered in the adapter options; desktop proxy subclasses override it with the extensions the host runtime actually loaded.

---

### backupStorage() \{#backupstorage\}

```ts
protected backupStorage(): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:1053](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L1053)

Storage backend recorded in the backup manifest.

#### Returns

`string`

Storage backend identifier

#### Remarks

By default resolved from `dataDir`, accepting only `memory` and `idb://`; desktop proxy subclasses override it with directory storage on the host. Called before queueing and connecting, so unsupported storage never occupies the database.

#### Throws

RxDBBackupError `unsupported_combination` when the current storage does not support backup

---

### bootstrapTransaction() \{#bootstraptransaction\}

```ts
bootstrapTransaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:903](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L903)

**`Internal`**

Bootstrap-phase transaction: skips the readiness gate. Restricted to the `RxDB.connect()` path.

#### Type Parameters

| Type Parameter                                                                                            |
| --------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`TransactionFun`](../../rxdb/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Default value |
| ----------------- | --------- | ------------- |
| `transactionFun`  | `T`       | `undefined`   |
| `transactionLog?` | `boolean` | `true`        |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`bootstrapTransaction`](../../rxdb/classes/RxDBAdapterLocalBase.md#bootstraptransaction)

---

### canDropStorage() \{#candropstorage\}

```ts
canDropStorage(): boolean;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:343](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L343)

Given the current data directory, whether `dropStorage()` can delete this database (asked once before a read-only checkout creates its snapshot database, US-313).

#### Returns

`boolean`

`true` for memory and `idb://`; `false` for other data directories

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`canDropStorage`](../../rxdb/classes/RxDBAdapterLocalBase.md#candropstorage)

---

### checkEntityConstraints() \{#checkentityconstraints\}

```ts
checkEntityConstraints(EntityTypes): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:832](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L832)

Read-only drift check: compares the storage constraints declared by metadata with the actual objects in the catalog (US-030 AC#10).

#### Parameters

| Parameter     | Type                                                    |
| ------------- | ------------------------------------------------------- |
| `EntityTypes` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Called by the core inside `RxDB.connect()`, at the same point as `reconcileEntityIndexes` (after user migrations and creating missing tables). Compares `ck_` CHECK constraints, `uq_` conditional unique indexes, and `ex_` range exclusions; throws RxDBConstraintDriftError on mismatch.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`checkEntityConstraints`](../../rxdb/classes/RxDBAdapterLocalBase.md#checkentityconstraints)

---

### completeBootstrap() \{#completebootstrap\}

```ts
completeBootstrap(): void;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:637](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L637)

**`Internal`**

Closes the **bootstrap window**: called once after `RxDB.connect()` finishes creating tables.

#### Returns

`void`

#### Remarks

Adapters with their own readiness gate (SQLite family / PGlite) let `query()` / `rawQuery()` / `createTables()` skip the gate inside the bootstrap window — that gate is exactly what waits on the not-yet-settled `RxDB.connect()`. This method flips the state to `ready`; afterwards all entries take the normal readiness wait. Adapters without a readiness gate keep the default no-op implementation.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`completeBootstrap`](../../rxdb/classes/RxDBAdapterLocalBase.md#completebootstrap)

---

### connect() \{#connect\}

```ts
connect(): Promise<IRxDBAdapter>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:613](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L613)

Connects to the database

#### Returns

`Promise`&lt;[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)&gt;

The adapter instance

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`connect`](../../rxdb/interfaces/IRxDBAdapter.md#connect)

---

### createClient() \{#createclient\}

```ts
protected createClient(): IPGliteClient;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:1030](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L1030)

Creates the underlying client. Subclasses can override it to swap out the whole data path.

#### Returns

[`IPGliteClient`](../interfaces/IPGliteClient.md)

A client instance that has not been `init()`ed yet

#### Remarks

This is the only seam the US-208 desktop adapter needs: the Electron client forwards query/exec/transaction to the single-instance PGlite in the main process, while the rest of the lifecycle and change pipeline is fully reused from this class. The returned object only needs to satisfy [IPGliteClient](../interfaces/IPGliteClient.md); if it is also a change event source (see [asPGliteChangeEventSource](../functions/asPGliteChangeEventSource.md)), `connect()` attaches the NOTIFY listener automatically and `disconnect()` detaches it.

---

### createTables() \{#createtables\}

```ts
createTables<T>(EntityTypes, entities?): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:743](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L743)

Creates database tables. Table creation goes through the bootstrap path and cannot wait on the readiness gate.

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-1"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter     | Type                        | Description                    |
| ------------- | --------------------------- | ------------------------------ |
| `EntityTypes` | `T`[]                       | Array of entity types          |
| `entities?`   | `InstanceType`&lt;`T`&gt;[] | Initialization data (optional) |

#### Returns

`Promise`&lt;`boolean`&gt;

Whether creation succeeded

#### Remarks

Change triggers happen in two steps: `create_tables_statements` first generates them for the root branch (a pure generator with no connection, unable to read the current branch), and after it finishes, this method re-attaches them for the branch the database is currently on. Both steps run in the **same** transaction, so no intermediate state is visible from outside. Merging into one step would either make the pure generator grow a database read or force the caller to read first — and the moment the answer becomes readable is exactly after the table-creation statements (see readBranchIdForNewTables).

The re-attach scope is narrowed to `EntityTypes`; see generateBranchTriggerSqlFor for the rationale.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`createTables`](../../rxdb/classes/RxDBAdapterLocalBase.md#createtables)

---

### createUncachedRepository() \{#createuncachedrepository\}

```ts
createUncachedRepository<T>(entity, host): IRepository<T>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:707](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L707)

**`Internal`**

Creates a repository bound to `host` without writing it into the cache. Transaction-scoped repositories must not enter `#repository_cache`.

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-2"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type                |
| --------- | ------------------- |
| `entity`  | `T`                 |
| `host`    | `RxDBAdapterPGlite` |

#### Returns

[`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

---

### createWorktreeTableSet() \{#createworktreetableset\}

```ts
createWorktreeTableSet(
   executor,
   tableSet,
   seed
): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:778](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L778)

Creates and seeds a writable checkout's tables inside the caller's transaction (US-314 B1.5); see `worktree/worktree-table-set.ts` for the approach.

#### Parameters

| Parameter  | Type                                                                    | Description                                                                                  |
| ---------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)   | Executor of a transaction on this adapter                                                    |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)            | The table set to create; members are chosen by the caller (entities in the versioned domain) |
| `seed`     | [`WorktreeTableSetSeed`](../../rxdb/interfaces/WorktreeTableSetSeed.md) | Holds the branch and the increments to apply on top                                          |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxdbAdapterPGliteError](RxdbAdapterPGliteError.md) when given the primary table set, when a member has no change log, when an increment falls outside the table set, or when the primary table is missing columns

#### Remarks

Same behavior as the sqlite-core method of the same name. Shadow table sets live in the `<namespace>$<suffix>` schema (see `getSchemaName`). It does not write holding keys: the checkout-open flow writes them itself in the same transaction.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`createWorktreeTableSet`](../../rxdb/classes/RxDBAdapterLocalBase.md#createworktreetableset)

---

### deleteByIds() \{#deletebyids\}

```ts
deleteByIds(entityName, ids): Observable<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:452](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L452)

QueryCache bulk delete by id; the reasons for detaching triggers and re-emitting events are the same as [upsertMany](#upsertmany).

#### Parameters

| Parameter    | Type       |
| ------------ | ---------- |
| `entityName` | `string`   |
| `ids`        | `string`[] |

#### Returns

`Observable`&lt;`void`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`deleteByIds`](../../rxdb/classes/RxDBAdapterLocalBase.md#deletebyids)

---

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:646](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L646)

Disconnects from the database

Cleans up resources and sends a destroy signal. `changeErrors$` is not completed here; it lives with the instance, see its description.

#### Returns

`Promise`&lt;`void`&gt;

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`disconnect`](../../rxdb/interfaces/IRxDBAdapter.md#disconnect)

---

### dispatchAfterCommit() \{#dispatchaftercommit\}

```ts
dispatchAfterCommit(event): void;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:557](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L557)

**`Internal`**

Dispatches an event that fires with a committed write.

#### Parameters

| Parameter | Type                                                | Description |
| --------- | --------------------------------------------------- | ----------- |
| `event`   | [`RxDBEvent`](../../rxdb/type-aliases/RxDBEvent.md) | The event   |

#### Returns

`void`

#### Remarks

When called on the adapter itself, the caller's write has already committed in its own transaction, so it dispatches immediately. The transaction facade (PGliteTransactionExecutor.adapter) swaps it to hang on the owning transaction instead: dispatched after commit, discarded on rollback — PGlite does not emit the core's transaction events, and the core will not queue events dispatched inside a transaction for it (INC-002).

---

### dropStorage() \{#dropstorage\}

```ts
dropStorage(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:358](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L358)

Deletes this database's persistent storage (read-only checkouts reclaim their snapshot database, US-313).

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxdbAdapterPGliteError](RxdbAdapterPGliteError.md) when still connected, when the storage is held by another context, or when the storage is not `memory` / `idb://`

#### Remarks

A memory database is gone the moment it disconnects; nothing to do. For `idb://`, deletes the IndexedDB database `/pglite/<dbName>`, then deletes this storage's restore marker and generation counter in the marker database — the database is gone but the bookkeeping stays, so a recreated database with the same name would be mistaken for "someone restored halfway". On disconnect the client has already closed the IdbFs connection itself (see `idbConnectionOf`), which is why the `deleteDatabase` here does not get stuck in `blocked`. Storages whose location is not derived from the database name (`opfs-ahp://`, file directories) do not know where to delete, so they report unsupported.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`dropStorage`](../../rxdb/classes/RxDBAdapterLocalBase.md#dropstorage)

---

### dropWorktreeTableSet() \{#dropworktreetableset\}

```ts
dropWorktreeTableSet(executor, tableSet): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:796](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L796)

Drops a writable checkout's tables inside the caller's transaction (US-314 B1.5): finds this table set's schema in the catalog and drops it entirely.

#### Parameters

| Parameter  | Type                                                                  | Description                               |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | Executor of a transaction on this adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)          | The table set to drop                     |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxdbAdapterPGliteError](RxdbAdapterPGliteError.md) when given the primary table set

#### Remarks

Holding keys on the branch tables are not released here; the checkout-close flow releases them itself in the same transaction.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`dropWorktreeTableSet`](../../rxdb/classes/RxDBAdapterLocalBase.md#dropworktreetableset)

---

### getMetadataByIds() \{#getmetadatabyids\}

```ts
getMetadataByIds(entityName, ids): Observable<Map<string, string>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:388](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L388)

QueryCache: id → updatedAt. Physical targeting goes through `resolveQueryCacheTarget` (PGL-012).

#### Parameters

| Parameter    | Type       |
| ------------ | ---------- |
| `entityName` | `string`   |
| `ids`        | `string`[] |

#### Returns

`Observable`&lt;`Map`&lt;`string`, `string`&gt;&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`getMetadataByIds`](../../rxdb/classes/RxDBAdapterLocalBase.md#getmetadatabyids)

---

### getRepository() \{#getrepository\}

```ts
getRepository<T, RT>(entity): RT;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:719](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L719)

Gets the repository instance for this entity on **this adapter**.

#### Type Parameters

| Type Parameter                                                                                      | Default type                                                     |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| <a id="type-parameter-t-3"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) | -                                                                |
| <a id="type-parameter-rt"></a> `RT`                                                                 | [`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt; |

#### Parameters

| Parameter | Type |
| --------- | ---- |
| `entity`  | `T`  |

#### Returns

`RT`

#### Remarks

Returns the repository on the adapter axis (see [AdapterRepositoryConstructor](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)), which is not the same object as the facade repository users normally get from `RxDB.getRepository()`.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`getRepository`](../../rxdb/interfaces/IRxDBAdapter.md#getrepository)

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`getRepository`](../../rxdb/classes/RxDBAdapterLocalBase.md#getrepository)

---

### getRxDBChangeSequence() \{#getrxdbchangesequence\}

```ts
getRxDBChangeSequence(): Promise<number>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:492](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L492)

Current value of the RxDBChange sequence. Contract aligned with sqlite_sequence: returns the last used id; subtracts 1 when `is_called=false`.

#### Returns

`Promise`&lt;`number`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`getRxDBChangeSequence`](../../rxdb/classes/RxDBAdapterLocalBase.md#getrxdbchangesequence)

---

### getTableColumns() \{#gettablecolumns\}

```ts
getTableColumns<T>(EntityType): Promise<PgliteTableColumn[]>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:875](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L875)

Gets the column info of a table

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-4"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter    | Type | Description     |
| ------------ | ---- | --------------- |
| `EntityType` | `T`  | The entity type |

#### Returns

`Promise`&lt;[`PgliteTableColumn`](../interfaces/PgliteTableColumn.md)[]&gt;

Array of column info

---

### importWorktreeSnapshot() \{#importworktreesnapshot\}

```ts
importWorktreeSnapshot(snapshot): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:314](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L314)

Writes rows and increments read from the main database into this database (read-only checkout builds its snapshot, US-313).

#### Parameters

| Parameter  | Type                                                                        | Description                                           |
| ---------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| `snapshot` | [`WorktreeSnapshotImport`](../../rxdb/interfaces/WorktreeSnapshotImport.md) | The tables to copy and the increments to apply on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxdbAdapterPGliteError](RxdbAdapterPGliteError.md) when this database has the capture runtime installed

#### Remarks

One transaction, no events dispatched: the snapshot instance's entities are all `log: false`, so there is no change log from which to derive events. Increments and branch switching share the same SQL generation, except encrypted columns pass through as envelopes.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`importWorktreeSnapshot`](../../rxdb/classes/RxDBAdapterLocalBase.md#importworktreesnapshot)

---

### internalQuery() \{#internalquery\}

```ts
internalQuery<T>(sql, params?): Promise<Results<T>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:983](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L983)

Internal query method (Public Alias)
Used by the core sync logic to query directly, bypassing the queue.

#### Type Parameters

| Type Parameter                      | Default type                        |
| ----------------------------------- | ----------------------------------- |
| <a id="type-parameter-t-5"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `sql`     | `string`    |
| `params?` | `unknown`[] |

#### Returns

`Promise`&lt;`Results`&lt;`T`&gt;&gt;

---

### isEncryptedAtRest() \{#isencryptedatrest\}

```ts
isEncryptedAtRest(value): boolean;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:282](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L282)

Determines whether a persisted value is already in the encrypted at-rest form (FR-038).

#### Parameters

| Parameter | Type      | Description                   |
| --------- | --------- | ----------------------------- |
| `value`   | `unknown` | A value in a persisted column |

#### Returns

`boolean`

`true` when it is an envelope string

#### Remarks

There is only one authoritative predicate, `isEnvelope` from `@aiao/rxdb-adapter-encrypted` — this method is a one-line forward from the core's optional slot ([RxDBAdapterLocalBase.isEncryptedAtRest](../../rxdb/classes/RxDBAdapterLocalBase.md#isencryptedatrest)) to it; no second shape is recognized here. `@aiao/rxdb` cannot depend on the encryption package (the dependency direction is reversed), so this line can only live on the adapter side.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`isEncryptedAtRest`](../../rxdb/classes/RxDBAdapterLocalBase.md#isencryptedatrest)

---

### isTableExisted() \{#istableexisted\}

```ts
isTableExisted(EntityType): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:856](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L856)

Checks whether a table exists

#### Parameters

| Parameter    | Type                                                  | Description     |
| ------------ | ----------------------------------------------------- | --------------- |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md) | The entity type |

#### Returns

`Promise`&lt;`boolean`&gt;

Whether the table exists

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`isTableExisted`](../../rxdb/interfaces/IRxDBAdapter.md#istableexisted)

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`isTableExisted`](../../rxdb/classes/RxDBAdapterLocalBase.md#istableexisted)

---

### listWorktreeTableSetSuffixes() \{#listworktreetablesetsuffixes\}

```ts
listWorktreeTableSetSuffixes(executor): Promise<readonly string[]>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:807](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L807)

Lists existing writable checkout table sets from the catalog (US-314 B2.6): which table set each schema whose name ends in `$<suffix>` belongs to.

#### Parameters

| Parameter  | Type                                                                  | Description                               |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | Executor of a transaction on this adapter |

#### Returns

`Promise`&lt;readonly `string`[]&gt;

Table set suffixes, sorted and deduplicated; excluded when a configured entity's namespace happens to have exactly this shape

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`listWorktreeTableSetSuffixes`](../../rxdb/classes/RxDBAdapterLocalBase.md#listworktreetablesetsuffixes)

---

### liveQuery() \{#livequery\}

```ts
liveQuery<T>(
   sql,
   params?,
   callback?
): Promise<LiveQuery<T>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:1006](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L1006)

PGlite live query. The caller is responsible for unsubscribing.

#### Type Parameters

| Type Parameter                      | Default type                        |
| ----------------------------------- | ----------------------------------- |
| <a id="type-parameter-t-6"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

#### Parameters

| Parameter   | Type                  |
| ----------- | --------------------- |
| `sql`       | `string`              |
| `params?`   | `unknown`[]           |
| `callback?` | (`results`) => `void` |

#### Returns

`Promise`&lt;`LiveQuery`&lt;`T`&gt;&gt;

---

### mergeChanges() \{#mergechanges\}

```ts
mergeChanges(
   actions,
   localChanges?,
   disableTriggers?
): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:479](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L479)

Merges remote changes. `disableTriggers` is used for pull, to avoid writing RxDBChange again.

#### Parameters

| Parameter          | Type                                                                     | Default value |
| ------------------ | ------------------------------------------------------------------------ | ------------- |
| `actions`          | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md)  | `undefined`   |
| `localChanges?`    | `Omit`&lt;[`RxDBChange`](../../rxdb/classes/RxDBChange.md), `"id"`&gt;[] | `undefined`   |
| `disableTriggers?` | `boolean`                                                                | `false`       |

#### Returns

`Promise`&lt;`void`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`mergeChanges`](../../rxdb/classes/RxDBAdapterLocalBase.md#mergechanges)

---

### migrateSystemSchema() \{#migratesystemschema\}

```ts
migrateSystemSchema(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:840](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L840)

Upgrades tables owned by RxDB before app migrations or repository operation. Adapters that do not need to persist system schema state keep the default no-op implementation.

#### Returns

`Promise`&lt;`void`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`migrateSystemSchema`](../../rxdb/classes/RxDBAdapterLocalBase.md#migratesystemschema)

---

### mutations() \{#mutations\}

```ts
mutations<T>(mutations): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:471](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L471)

Bulk-modifies entities (create/update/delete)

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-7"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter   | Type                                                                       |
| ----------- | -------------------------------------------------------------------------- |
| `mutations` | [`RxDBMutationsMap`](../../rxdb/interfaces/RxDBMutationsMap.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`mutations`](../../rxdb/interfaces/IRxDBAdapter.md#mutations)

---

### physicalTableNames() \{#physicaltablenames\}

```ts
physicalTableNames(metadata): readonly string[];
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:484

All names an entity table may be written as in SQL emitted by this adapter.

#### Parameters

| Parameter  | Type                                                          | Description                                                                      |
| ---------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata; the answer is determined by it alone, no instance state is read |

#### Returns

readonly `string`[]

Unnormalized physical table names without schema qualification; at least one

#### Remarks

**The naming rule belongs to whoever writes the tables.** Before this capability, `@aiao/rxdb-plugin-working-tree`'s versioned domain re-assembled the sqlite family's folding rule itself by `'$'`. A copied rule never errors when the original changes — it just starts computing wrong — and the consequence of computing wrong is one-directional: the raw-write gate fails to recognize a version-controlled table and **silently lets through** a write that bypasses capture.

The default implementation returns the logical name and guesses nothing. Guessing a "common" shape for a backend (such as making the sqlite family's `namespace$table` the default) only moves the rule-copying from the plugin to the core, and from then on no backend that forgets to override would ever be discovered — it would keep computing its own table names with someone else's rule.

**Having a default implementation instead of `abstract`** follows the same rationale as [RxDBAdapterLocalBase.migrateSystemSchema](../../rxdb/classes/RxDBAdapterLocalBase.md#migratesystemschema): this is an extension of an existing base class, and `abstract` would break compilation of every out-of-repo custom adapter on upgrade, while **the ones that do not fold namespaces were already correct**. The cost is that "forgot to override" and "genuinely does not need it" look identical in the types; backends that fold namespaces (the sqlite family) must override it themselves.

Without schema qualification: a shape like `"public"."post"` has already been reduced back to the logical name by the qualification-stripping step of raw judgment, so registering it again here would just be a second spelling of the same name. What must be registered is the one that **cannot be stripped**.

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`physicalTableNames`](../../rxdb/classes/RxDBAdapterLocalBase.md#physicaltablenames)

---

### query() \{#query\}

```ts
query<T>(sql, bindings?): Promise<Results<T>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:965](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L965)

Query entry point. Outside the bootstrap window it goes through writeQuery; it enters the queue only after the bootstrap window is ready.

#### Type Parameters

| Type Parameter                      | Default type                        |
| ----------------------------------- | ----------------------------------- |
| <a id="type-parameter-t-8"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

#### Parameters

| Parameter   | Type        |
| ----------- | ----------- |
| `sql`       | `string`    |
| `bindings?` | `unknown`[] |

#### Returns

`Promise`&lt;`Results`&lt;`T`&gt;&gt;

---

### rawQuery() \{#rawquery\}

```ts
rawQuery(sql, params?): Promise<RawQueryResult>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:999](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L999)

Raw SQL.

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `sql`     | `string`    |
| `params?` | `unknown`[] |

#### Returns

`Promise`&lt;[`RawQueryResult`](../../rxdb/interfaces/RawQueryResult.md)&gt;

#### Remarks

**The judgment comes from the core package; here we only wire it up** (adapter-contract.md §2). `rawQuery?()` is an optional method on `IRxDBAdapter`, so the core package cannot wrap it for adapters the way it does for the four capture mount points — this single `gateRawWrite` line is the only place this class must get right. Not a single character of the judgment itself is rewritten here — the Postgres vs SQLite dialect differences live only in the core package's lexical normalization layer; adding a "PG version of the judgment" here would be the second implementation §2 forbids.

Rejection happens before the statement is issued, no transaction is even opened, business tables change nothing — it is not a write-then-rollback; the raw channel has no transaction to roll back, and that is exactly why it exists. On databases without commit capability enabled, step 1 of the judgment lets it through; behavior is character-for-character identical to before this integration.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`rawQuery`](../../rxdb/interfaces/IRxDBAdapter.md#rawquery)

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

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:295](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L295)

Reads one page of rows in storage form (read-only checkout builds its snapshot, US-313).

#### Parameters

| Parameter    | Type                                                                                       | Description                                              |
| ------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `executor`   | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)                      | Executor of a main-database transaction                  |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)                                      | The entity class on the main instance                    |
| `after`      | \| [`WorktreeSnapshotCursor`](../../rxdb/type-aliases/WorktreeSnapshotCursor.md) \| `null` | Cursor of the previous page; `null` reads from the start |
| `limit`      | `number`                                                                                   | Maximum rows in this page                                |

#### Returns

`Promise`&lt;[`WorktreeSnapshotPage`](../../rxdb/interfaces/WorktreeSnapshotPage.md)&gt;

Rows as `to_jsonb` text, paginated by primary key

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`readWorktreeSnapshotPage`](../../rxdb/classes/RxDBAdapterLocalBase.md#readworktreesnapshotpage)

---

### ready() \{#ready\}

```ts
protected ready(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:1039](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L1039)

The readiness gate. Must be called before acquiring a queue slot. It waits on the whole `RxDB.connect()`; the bootstrap path goes through [bootstrapTransaction](#bootstraptransaction).

#### Returns

`Promise`&lt;`void`&gt;

---

### reconcileEntityIndexes() \{#reconcileentityindexes\}

```ts
reconcileEntityIndexes(EntityTypes): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:811](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L811)

Idempotently reconciles entity indexes after user migrations and creating missing tables.

#### Parameters

| Parameter     | Type                                                    |
| ------------- | ------------------------------------------------------- |
| `EntityTypes` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`reconcileEntityIndexes`](../../rxdb/classes/RxDBAdapterLocalBase.md#reconcileentityindexes)

---

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:520](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L520)

Bulk-deletes entities

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-9"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        | Description                 |
| ---------- | --------------------------- | --------------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] | Array of entities to delete |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

Array of deleted entities

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`removeMany`](../../rxdb/interfaces/IRxDBAdapter.md#removemany)

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

| Parameter         | Type                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `repositoryName`  | `string`                                                                                                                   |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterPGlite`, `RT`&gt; |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`repository`](../../rxdb/classes/RxDBAdapterLocalBase.md#repository)

---

### restoreEntity() \{#restoreentity\}

```ts
restoreEntity<T>(entity, options): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:682](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L682)

Not implemented yet.

#### Type Parameters

| Type Parameter                                                                                       |
| ---------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-10"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type                                                                    |
| --------- | ----------------------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt;                                               |
| `options` | [`RestoreEntityOptions`](../../rxdb/interfaces/RestoreEntityOptions.md) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

---

### runInTransaction() \{#runintransaction\}

```ts
runInTransaction<T>(transactionFun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:914](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L914)

Real adapters always open a new transaction. "Reuse when already in a transaction" is handled by the executor facade.

#### Type Parameters

| Type Parameter                                                                                               |
| ------------------------------------------------------------------------------------------------------------ |
| <a id="type-parameter-t-11"></a> `T` _extends_ [`TransactionFun`](../../rxdb/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Default value |
| ----------------- | --------- | ------------- |
| `transactionFun`  | `T`       | `undefined`   |
| `transactionLog?` | `boolean` | `true`        |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`runInTransaction`](../../rxdb/classes/RxDBAdapterLocalBase.md#runintransaction)

---

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:562](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L562)

UPSERTs grouped by type, then updates entity state.

#### Type Parameters

| Type Parameter                                                                                       |
| ---------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-12"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        |
| ---------- | --------------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`saveMany`](../../rxdb/interfaces/IRxDBAdapter.md#savemany)

---

### sealWorktreeReadOnly() \{#sealworktreereadonly\}

```ts
sealWorktreeReadOnly(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:382](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L382)

Seals this database read-only (read-only checkout, US-313): from now on every transaction is a read-only transaction, and write statements are rejected by Postgres.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Session defaults cannot govern the transactions this adapter opens: `SELECT set_config('default_transaction_read_only', 'off', false)` looks like a read statement, and the read-only hook's raw gate recognizes it today, but a path that does not go through that gate could still change the session default, and transactions opened afterwards would be writable. So after sealing, every transaction begins with
`SET TRANSACTION READ ONLY`: once a transaction has executed a query it can no longer be switched back to writable, so `set_config('transaction_read_only', …)` written inside a `SELECT` errors immediately. The session default stays, governing internal queries that do not go through transactions.

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`sealWorktreeReadOnly`](../../rxdb/classes/RxDBAdapterLocalBase.md#sealworktreereadonly)

---

### setRxDBChangeSequence() \{#setrxdbchangesequence\}

```ts
setRxDBChangeSequence(sequence): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:509](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L509)

Sets the RxDBChange sequence. `sequence` is the last used id; `< 1` uses `setval(1, false)`.

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

Installs or removes the capture runtime (the four mount points of adapter-contract.md §1).

#### Parameters

| Parameter | Type                                                                                          | Description                                                               |
| --------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `hook`    | \| [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md) \| `undefined` | The runtime that takes over the four mount points; `undefined` uninstalls |

#### Returns

`void`

#### Remarks

The mount lives **here** rather than having each of the six adapters insert a line in its own `transaction()`: writing it once less, or once too late (validating the token only after the business write) would be detectable by nothing, and that is exactly the shape §2 "only one judgment implementation" exists to rule out.

Callers are `RxDB.connect()` (after confirming the capability bit is true) and `workingTree.enable()` (after the bit flip succeeds). On databases that never enabled it, neither is ever called, so the four write primitives do not even have a forwarding layer.

Idempotent: if already installed, it uninstalls first and then installs, so it never stacks two layers.

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`setWorkingTreeCaptureHook`](../../rxdb/classes/RxDBAdapterLocalBase.md#setworkingtreecapturehook)

---

### switchBranch() \{#switchbranch\}

```ts
switchBranch(options): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:669](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L669)

Suppresses `rxdb_branch` NOTIFY during a branch switch.

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

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:889](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L889)

Reads and writes within the same transaction through the executor.

#### Type Parameters

| Type Parameter                                                                                               |
| ------------------------------------------------------------------------------------------------------------ |
| <a id="type-parameter-t-13"></a> `T` _extends_ [`TransactionFun`](../../rxdb/type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Default value | Description                                  |
| ----------------- | --------- | ------------- | -------------------------------------------- |
| `transactionFun`  | `T`       | `undefined`   | Callback holding this transaction's executor |
| `transactionLog?` | `boolean` | `true`        | Whether to record a transaction log          |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The callback result

#### Remarks

An `entity.save()` that holds no executor re-queues. Waiting on it inside a transaction callback waits on itself, and the transaction cannot finish. Inside a transaction, use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository); for saving entity instances see [EntityBase.save](../../rxdb/classes/EntityBase.md#save).

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
// ❌ The entity instance holds no executor; save() re-queues and then waits for the current transaction to finish.
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

Puts a public repository's entire operation into a transaction; not called when the executor creates a repository.

#### Type Parameters

| Type Parameter                                                                                       |
| ---------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-14"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |
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

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:423](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L423)

QueryCache upsert. Unknown keys and missing required columns always fail fast.

#### Type Parameters

| Type Parameter                       |
| ------------------------------------ |
| <a id="type-parameter-t-15"></a> `T` |

#### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `entityName` | `string` |
| `data`       | `T`[]    |

#### Returns

`Observable`&lt;`void`&gt;

#### Remarks

Parsing and statement building happen **outside** `this.transaction(...)` (US-024): those two steps only read metadata, and putting them in a transaction would only open a transaction for a batch that is doomed to roll back, while the column-contract diagnostics should be given before "any write has started" — when the reader sees the error, the database has not even issued `BEGIN`, so "not a single row landed" is a self-evident statement.

Triggers on the primary table set are detached while writing: these are copied remote replicas, not local changes — recording them into `rxdb_change` would push them back to the remote as offline writes through the outbound queue. QueryCache-synced entities only live in the primary table set; detaching on a writable checkout also detaches the primary table set (US-314 B2.1). After detaching the triggers, live queries receive no notifications for the changed rows; the rows before and after the write are read back in the same transaction, and after commit the cache is refreshed and events re-emitted (`query_cache_events.ts`).

#### Overrides

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`upsertMany`](../../rxdb/classes/RxDBAdapterLocalBase.md#upsertmany)

---

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:696](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L696)

Gets the PostgreSQL version

#### Returns

`Promise`&lt;`string`&gt;

PostgreSQL version string

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`version`](../../rxdb/interfaces/IRxDBAdapter.md#version)

---

### worktreeTableSetMounted() \{#worktreetablesetmounted\}

```ts
worktreeTableSetMounted(): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:459

**`Internal`**

Called after this instance mounts a different table set (US-314 B1.4): clears this adapter's caches keyed by physical table. Nothing to do by default.

#### Returns

`void`

#### Remarks

Called by [RxDB.mountWorktreeTableSet](../../rxdb/classes/RxDB.md#mountworktreetableset) inside the mount transaction. The SQLite family's row-number caches are keyed by physical table; after mounting a different table set, the same row number points to a different row.

#### Inherited from

[`RxDBAdapterLocalBase`](../../rxdb/classes/RxDBAdapterLocalBase.md).[`worktreeTableSetMounted`](../../rxdb/classes/RxDBAdapterLocalBase.md#worktreetablesetmounted)

---

### writeQuery() \{#writequery\}

```ts
writeQuery<T>(sql, bindings?): Promise<Results<T>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:975](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L975)

#### Type Parameters

| Type Parameter                       | Default type                        |
| ------------------------------------ | ----------------------------------- |
| <a id="type-parameter-t-16"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

#### Parameters

| Parameter   | Type        |
| ----------- | ----------- |
| `sql`       | `string`    |
| `bindings?` | `unknown`[] |

#### Returns

`Promise`&lt;`Results`&lt;`T`&gt;&gt;
