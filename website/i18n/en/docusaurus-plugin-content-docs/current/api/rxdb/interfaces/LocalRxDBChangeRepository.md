# LocalRxDBChangeRepository

Defined in: [packages/rxdb/src/system/types.local.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.local.ts#L68)

Local repository interface for RxDBChange

## Extends

- [`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md)
- [`IRxDBAdapter`](IRxDBAdapter.md)

## Properties

### name \{#name\}

```ts
readonly name: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:268](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L268)

The adapter name, same as the key used when registering with `RxDB.adapter()`; error messages and `getAdapter()` both identify adapters by it

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`name`](IRxDBAdapter.md#name)

---

### repository\_cache \{#repository_cache\}

```ts
protected readonly repository_cache: Map<EntityType, RepositoryInstance<EntityType>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:378](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L378)

#### Inherited from

[`RemoteRxDBChangeRepository`](RemoteRxDBChangeRepository.md).[`repository_cache`](RemoteRxDBChangeRepository.md#repository_cache)

---

### repository\_map \{#repository_map\}

```ts
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<LocalRxDBChangeRepository, RepositoryInstance<EntityType>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:377](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L377)

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`repository_map`](../classes/RxDBAdapterLocalBase.md#repository_map)

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:380](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L380)

#### Inherited from

[`RemoteRxDBChangeRepository`](RemoteRxDBChangeRepository.md).[`rxdb`](RemoteRxDBChangeRepository.md#rxdb)

## Accessors

### tableSet \{#tableset\}

#### Get Signature

```ts
get tableSet(): WorktreeTableSet;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:480](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L480)

The business table set this instance is mounted on (US-314 in-database shadow tables)

##### Remarks

It lives on the RxDB instance ([RxDB.worktreeTableSet](../classes/RxDB.md#worktreetableset-1)); this is only a pass-through read: one instance mounts exactly one table set at a time,
and the adapter storing another copy would be a second source of truth. All SQL that reads or writes business tables resolves physical names through it; system tables, QueryCache and other entities without replicas
go to the main table set no matter which set is mounted.

##### Returns

[`WorktreeTableSet`](../classes/WorktreeTableSet.md)

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`tableSet`](../classes/RxDBAdapterLocalBase.md#tableset)

---

### workingTreeCaptureHook \{#workingtreecapturehook\}

#### Get Signature

```ts
get workingTreeCaptureHook(): WorkingTreeCaptureHook | undefined;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:442](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L442)

**`Internal`**

The capture runtime; always `undefined` on a database without the commit capability enabled.

##### Returns

[`WorkingTreeCaptureHook`](WorkingTreeCaptureHook.md) \| `undefined`

#### Inherited from

`LocalRxDBChangeRepository`.[`workingTreeCaptureHook`](#workingtreecapturehook)

---

### workingTreeRawWriteContext \{#workingtreerawwritecontext\}

#### Get Signature

```ts
get workingTreeRawWriteContext(): RawWriteContext;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:468](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L468)

**`Internal`**

The current raw write adjudication context of this adapter (adapter-contract.md §2)

##### Remarks

`rawQuery?()` is an **optional method** on this interface (see `IRxDBAdapter` above), so core cannot wrap it on the adapter's behalf the way it does for the four mount points —
adjudication can only be done by each adapter's own `rawQuery` implementation calling `gateRawWrite(sql, ctx, …)`.
The `ctx` that call needs is handed out here, so the only thing the six adapters have to get right is "passing it to the adjudication" —
the two questions that are genuinely easy to get wrong, "how the capability bit is computed" and "where the domain comes from", never land on them at all.

The capability bit is decided directly by **whether the capture runtime is installed**, with no separate boolean stored: the runtime is only installed when the bit is true
(read as true by `RxDB.connect()`, or just flipped on by `workingTree.enable()`). Storing another copy would be a second source of truth,
and the consequence of the two drifting is one-directional — the gate believes it is off, and every raw write is let through. The context object itself is created
in `setWorkingTreeCaptureHook()` with **the same assignment** as the runtime, not recreated on every read: the getter is called on every
raw statement, and it holds no per-call state. The two fields only change together in that one place, so "a new runtime installed but
handing out a closure bound to the old runtime" is not a reachable state.

What is handed out is **the adjudication entry itself**, not the things the adjudication looks at (domain, column set, trusted intents). Core therefore never has to
restate what capture recognizes, and there is no such thing as a double list where "a copy of the domain was made and the derived index columns a plugin registers later only land in one of the copies" —
the adjudication always runs on the copy the runtime itself holds.

##### Returns

[`RawWriteContext`](../type-aliases/RawWriteContext.md)

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`workingTreeRawWriteContext`](../classes/RxDBAdapterLocalBase.md#workingtreerawwritecontext)

## Methods

### adoptWorktreeEncryption()? \{#adoptworktreeencryption\}

```ts
adoptWorktreeEncryption?(source): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:777](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L777)

Adopts the keyring of the main database's adapter (read-only checkouts, US-313).

#### Parameters

| Parameter | Type                                                      | Description                                                      |
| --------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| `source`  | [`LocalRxDBAdapter`](../type-aliases/LocalRxDBAdapter.md) | The main database's adapter, of the same backend as this adapter |

#### Returns

`void`

#### Remarks

The envelope's AAD binds the database name, and the snapshot database's ciphertext is a byte-for-byte copy of the main database's envelopes, which only the main database's keyring can open.
Call before this adapter connects for the first time. What is shared is the same object: `lock()` on the snapshot instance also locks the main database.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`adoptWorktreeEncryption`](../classes/RxDBAdapterLocalBase.md#adoptworktreeencryption)

---

### bootstrapTransaction() \{#bootstraptransaction\}

```ts
bootstrapTransaction<T>(fun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:676](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L676)

**`Internal`**

Executes a transaction in the **bootstrap phase** (table structure not yet ready).

#### Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`TransactionFun`](../type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Description                                                                                                        |
| ----------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| `fun`             | `T`       | The transaction callback                                                                                           |
| `transactionLog?` | `boolean` | Whether to write the transaction log. Default `true`; pure DDL / metadata bootstrap should pass `false` explicitly |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

#### Remarks

The only difference from [transaction](../classes/RxDBAdapterLocalBase.md#transaction) is **skipping the "bootstrap complete" readiness gate**. What the adapter's readiness gate waits for is exactly
`RxDB.connect()`, and the bootstrap-phase caller is inside that promise — going through [transaction](../classes/RxDBAdapterLocalBase.md#transaction) would wait on itself,
hanging forever. Tables may not exist yet at this point; the caller is responsible for ordering.

Callers are limited to two kinds: the bootstrap chain of `RxDB.connect()` itself (watermarks, table creation, migration), and
**plugins installed inside `connect()`** (their `install()` also runs inside that promise,
see the FTS installation of `@aiao/rxdb-plugin-search`). Business code always uses [transaction](../classes/RxDBAdapterLocalBase.md#transaction).

`transactionLog` must be passable here: bootstrap-phase DDL belongs to no user change, and writing a log would needlessly trigger
a branch number read and a full trigger rebuild. The default implementation simply delegates to [transaction](../classes/RxDBAdapterLocalBase.md#transaction);
only adapters with their own readiness gate need to override.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`bootstrapTransaction`](../classes/RxDBAdapterLocalBase.md#bootstraptransaction)

---

### canDropStorage()? \{#candropstorage\}

```ts
canDropStorage?(): boolean;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:811](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L811)

Under the current configuration, whether [dropStorage](../classes/RxDBAdapterLocalBase.md#dropstorage) can delete this database (asked once before a read-only checkout builds its snapshot database, US-313).

#### Returns

`boolean`

When `false`, `dropStorage()` will certainly refuse

#### Remarks

Looks only at configuration, never touches storage. There is no other way to know before building the snapshot: trying a delete first would delete a database whose identity is not yet verified —
if the snapshot factory is misconfigured and points at the main database's storage, that delete hits the main database. And a snapshot database that could be built but not deleted throws on close, and errors on every later reclamation.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`canDropStorage`](../classes/RxDBAdapterLocalBase.md#candropstorage)

---

### checkEntityConstraints()? \{#checkentityconstraints\}

```ts
checkEntityConstraints ? EntityTypes : Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:734](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L734)

Read-only drift check: when the storage constraints declared by entity metadata do not match the actual constraints in the database, throws
[RxDBConstraintDriftError](../classes/RxDBConstraintDriftError.md), listing the missing and superfluous constraint names (US-030 AC#10).

#### Parameters

| Parameter     | Type                                            |
| ------------- | ----------------------------------------------- |
| `EntityTypes` | [`EntityType`](../type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Called at the same moment as [RxDBAdapterLocalBase.reconcileEntityIndexes](../classes/RxDBAdapterLocalBase.md#reconcileentityindexes) (after user migrations and
missing-table backfills), but **read-only, no automatic backfill** — backfill is written by users into `migrations`.
The comparison only covers three kinds of objects: `ck_` CHECKs, `uq_` conditional unique indexes, and `ex_` range exclusions.

Absence is a contract-permitted shape (consistent with `reconcileEntityIndexes`); but when the entity declares
`checks` / conditional unique `where` / `exclusions` and the adapter lacks this method, `connect()` reports
unsupported per US-030 AC#6 — no silent degradation.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`checkEntityConstraints`](../classes/RxDBAdapterLocalBase.md#checkentityconstraints)

---

### completeBootstrap() \{#completebootstrap\}

```ts
completeBootstrap(): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:712](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L712)

**`Internal`**

Closes the **bootstrap window**: called once after `RxDB.connect()` finishes creating tables.

#### Returns

`void`

#### Remarks

Adapters with their own readiness gate (SQLite family / PGlite) let `query()` / `rawQuery()` /
`createTables()` skip the readiness gate inside the bootstrap window — that gate waits for the not-yet-settled `RxDB.connect()`.
This method flips the state to `ready`, after which every entry goes through the normal readiness wait.
Adapters without a readiness gate keep the default no-op implementation.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`completeBootstrap`](../classes/RxDBAdapterLocalBase.md#completebootstrap)

---

### connect() \{#connect\}

```ts
connect(): Promise<IRxDBAdapter>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:279](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L279)

Establishes the connection and brings the system tables up to the current watermark.

#### Returns

`Promise`&lt;[`IRxDBAdapter`](IRxDBAdapter.md)&gt;

Itself, for convenient chaining

#### Remarks

Table creation and system migration both happen here (see `isCurrentRxDBSystemVersion`), so it can be slow,
and it may throw `UnsupportedRxDBSystemVersionError` because the database is newer than this process.

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`connect`](IRxDBAdapter.md#connect)

---

### count() \{#count\}

```ts
count(options): Promise<number>;
```

Defined in: [packages/rxdb/src/system/types.local.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.local.ts#L83)

count query

#### Parameters

| Parameter | Type                                                                                                                                                        | Description   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `options` | [`CountOptions`](CountOptions.md)&lt;_typeof_ [`RxDBChange`](../classes/RxDBChange.md), [`RxDBChangeRuleGroup`](../type-aliases/RxDBChangeRuleGroup.md)&gt; | Query options |

#### Returns

`Promise`&lt;`number`&gt;

Returns the number of query results

---

### create() \{#create\}

```ts
create(entity): Promise<RxDBChange>;
```

Defined in: [packages/rxdb/src/system/types.local.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.local.ts#L90)

Creates an entity

#### Parameters

| Parameter | Type                                     | Description          |
| --------- | ---------------------------------------- | -------------------- |
| `entity`  | [`RxDBChange`](../classes/RxDBChange.md) | The entity to create |

#### Returns

`Promise`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;

Returns the created entity

---

### createTables() \{#createtables\}

```ts
abstract createTables(EntityTypes, entities?): Promise<boolean>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:716](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L716)

#### Parameters

| Parameter     | Type                                            |
| ------------- | ----------------------------------------------- |
| `EntityTypes` | [`EntityType`](../type-aliases/EntityType.md)[] |
| `entities?`   | `any`[]                                         |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`createTables`](../classes/RxDBAdapterLocalBase.md#createtables)

---

### createWorktreeTableSet()? \{#createworktreetableset\}

```ts
createWorktreeTableSet ? (executor, tableSet, seed) : Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:825](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L825)

Creates the tables of a writable checkout inside the caller's transaction and seeds them (US-314 B1.5).

#### Parameters

| Parameter  | Type                                                 | Description                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](TransactionExecutor.md)      | An executor of a transaction on the main database; table creation, copying, increments and trigger mounting all happen in this one transaction, and the open flow writes the held key in the same transaction |
| `tableSet` | [`WorktreeTableSet`](../classes/WorktreeTableSet.md) | The table set to create; must not be the main table set; members must keep change logs                                                                                                                        |
| `seed`     | [`WorktreeTableSetSeed`](WorktreeTableSetSeed.md)    | The held branch and the increments to apply                                                                                                                                                                   |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

The rows of the main table set are copied as-is (storage form, not decrypted), auto-increment sequences are aligned, and increments are applied — none of it writes change logs or dispatches events;
finally the change triggers of the member tables are mounted onto the held branch. Same optional capability slot as [RxDBAdapterLocalBase.readWorktreeSnapshotPage](../classes/RxDBAdapterLocalBase.md#readworktreesnapshotpage):
when absent, the working tree plugin reports unsupported when opening a writable checkout.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`createWorktreeTableSet`](../classes/RxDBAdapterLocalBase.md#createworktreetableset)

---

### deleteByIds() \{#deletebyids\}

```ts
abstract deleteByIds(entityName, ids): Observable<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:928](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L928)

Deletes in bulk by ID list (QueryCache only)

Used to clean up data already removed remotely from the local cache.

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

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`deleteByIds`](../classes/RxDBAdapterLocalBase.md#deletebyids)

---

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:288](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L288)

Disconnects and releases the underlying handle.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Unlike `RxDB.destroy()`, disconnecting is **reversible**: the same adapter instance can `connect()` again afterwards.
Implementations must be idempotent — calling it while not connected is a no-op, not an error.

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`disconnect`](IRxDBAdapter.md#disconnect)

---

### dropStorage()? \{#dropstorage\}

```ts
dropStorage?(): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:800](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L800)

Permanently deletes the persistent storage of this adapter's database (read-only checkout reclamation of snapshot databases, US-313).

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

Throws while this adapter is still connected: disconnect first, then delete

#### Remarks

The storage location is derived by the same rules as at connect time (`rxdb.config.dbName` plus adapter options); does nothing when the database does not exist.
An in-memory database is gone once disconnected, so this is a no-op there too. Deleted data cannot be recovered: the caller must first make sure no other context is still using this database.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`dropStorage`](../classes/RxDBAdapterLocalBase.md#dropstorage)

---

### dropWorktreeTableSet()? \{#dropworktreetableset\}

```ts
dropWorktreeTableSet ? (executor, tableSet) : Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:840](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L840)

Deletes the tables of a writable checkout inside the caller's transaction (US-314 B1.5).

#### Parameters

| Parameter  | Type                                                 | Description                                                                                                                                      |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `executor` | [`TransactionExecutor`](TransactionExecutor.md)      | An executor of a transaction on the main database; the close flow releases the held key and deletes the registration row in the same transaction |
| `tableSet` | [`WorktreeTableSet`](../classes/WorktreeTableSet.md) | The table set to delete; must not be the main table set                                                                                          |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Finds this table set by the catalog in the database, and also deletes half-built ones and those whose members have been removed from the configuration — reentrant; cascade deletes caused by dropping tables are not written to the change log.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`dropWorktreeTableSet`](../classes/RxDBAdapterLocalBase.md#dropworktreetableset)

---

### find() \{#find\}

```ts
find(options): Promise<RxDBChange[]>;
```

Defined in: [packages/rxdb/src/system/types.local.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.local.ts#L74)

find query

#### Parameters

| Parameter | Type                                                                                                                                                                                                                             | Description   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `options` | [`FindOptions`](FindOptions.md)&lt;_typeof_ [`RxDBChange`](../classes/RxDBChange.md), [`RxDBChangeRuleGroup`](../type-aliases/RxDBChangeRuleGroup.md), [`RxDBChangeOrderByField`](../type-aliases/RxDBChangeOrderByField.md)&gt; | Query options |

#### Returns

`Promise`&lt;[`RxDBChange`](../classes/RxDBChange.md)[]&gt;

Returns the query result array

---

### getMetadataByIds() \{#getmetadatabyids\}

```ts
abstract getMetadataByIds(entityName, ids): Observable<Map<string, string>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:896](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L896)

Gets metadata for a given ID list (QueryCache only)

Used for local cache freshness checks, returning an ID → updatedAt mapping.

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

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`getMetadataByIds`](../classes/RxDBAdapterLocalBase.md#getmetadatabyids)

---

### getRepository() \{#getrepository\}

```ts
abstract getRepository<T, RT>(EntityType): RT;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:382](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L382)

Gets the repository instance of this entity on **this adapter**.

#### Type Parameters

| Type Parameter                                                                              | Default type                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| <a id="type-parameter-t-1"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | -                                          |
| <a id="type-parameter-rt"></a> `RT` _extends_ [`IRepository`](IRepository.md)&lt;`T`&gt;    | [`IRepository`](IRepository.md)&lt;`T`&gt; |

#### Parameters

| Parameter    | Type |
| ------------ | ---- |
| `EntityType` | `T`  |

#### Returns

`RT`

#### Remarks

Returns the repository on the adapter axis (see [AdapterRepositoryConstructor](../type-aliases/AdapterRepositoryConstructor.md)),
not the same object as the facade repository `RxDB.getRepository()` that users normally get.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`getRepository`](../classes/RxDBAdapterLocalBase.md#getrepository)

---

### getRxDBChangeSequence() \{#getrxdbchangesequence\}

```ts
abstract getRxDBChangeSequence(): Promise<number>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:857](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L857)

#### Returns

`Promise`&lt;`number`&gt;

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`getRxDBChangeSequence`](../classes/RxDBAdapterLocalBase.md#getrxdbchangesequence)

---

### importWorktreeSnapshot()? \{#importworktreesnapshot\}

```ts
importWorktreeSnapshot ? snapshot : Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:766](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L766)

Writes rows and increments read from the main database into this adapter's database (read-only checkout snapshot building, US-313).

#### Parameters

| Parameter  | Type                                                  | Description                                           |
| ---------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `snapshot` | [`WorktreeSnapshotImport`](WorktreeSnapshotImport.md) | The tables to copy and the increments to apply on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

One transaction: first insert the rows of each table as-is, then apply the increments. No decryption and no encryption — the values of encrypted columns must already be envelopes,
and plaintext throws immediately; no events dispatched, nothing enters the entity cache. Refused on a database with the capture runtime installed: snapshot writes do not fit the trusted write matrix.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`importWorktreeSnapshot`](../classes/RxDBAdapterLocalBase.md#importworktreesnapshot)

---

### isEncryptedAtRest()? \{#isencryptedatrest\}

```ts
isEncryptedAtRest ? value : boolean;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:535](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L535)

Judges whether a persisted value is already in the "encrypted at-rest form" (FR-038).

#### Parameters

| Parameter | Type      | Description                                                                                   |
| --------- | --------- | --------------------------------------------------------------------------------------------- |
| `value`   | `unknown` | The value in the persisted column; the caller guarantees it is neither `null` nor `undefined` |

#### Returns

`boolean`

`true` when it is the encrypted persisted form

#### Remarks

**Absence is a contract-permitted shape**, same convention as [RxDBAdapterLocalBase.reconcileEntityIndexes](../classes/RxDBAdapterLocalBase.md#reconcileentityindexes):
adapters that do not support column encryption do not implement it. Absence does **not** mean allow-through — when the caller (the commit write path) cannot get
a judge but does have encrypted columns to judge, it throws fail-closed instead of skipping the check.

It is declared here and implemented by adapters because the authoritative judge is `isEnvelope` of `@aiao/rxdb-adapter-encrypted`,
and `@aiao/rxdb` **cannot** depend on it: the former peer-depends on the latter, so the dependency direction is reversed.
For an encrypted `PropertyType.string` column, plaintext and ciphertext are both strings — core guessing the shape on its own is installing
a gatekeeper that will misread.

Same "optional capability slot" as [RxDBAdapterLocalBase.setWorkingTreeCaptureHook](../classes/RxDBAdapterLocalBase.md#setworkingtreecapturehook): core
only declares the position and the semantics, and does not decide existence for the six backends.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`isEncryptedAtRest`](../classes/RxDBAdapterLocalBase.md#isencryptedatrest)

---

### isTableExisted() \{#istableexisted\}

```ts
abstract isTableExisted(EntityType): Promise<boolean>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:586](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L586)

Whether the table for this entity already exists in the database.

#### Parameters

| Parameter    | Type                                          |
| ------------ | --------------------------------------------- |
| `EntityType` | [`EntityType`](../type-aliases/EntityType.md) |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Remarks

It asks about the **physical table**, not whether the entity is registered in the metadata.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`isTableExisted`](../classes/RxDBAdapterLocalBase.md#istableexisted)

---

### listWorktreeTableSetSuffixes()? \{#listworktreetablesetsuffixes\}

```ts
listWorktreeTableSetSuffixes ? executor : Promise<readonly string[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:853](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L853)

Lists the existing writable checkout table sets by the catalog in the database (US-314 B2.6).

#### Parameters

| Parameter  | Type                                            | Description              |
| ---------- | ----------------------------------------------- | ------------------------ |
| `executor` | [`TransactionExecutor`](TransactionExecutor.md) | The caller's transaction |

#### Returns

`Promise`&lt;readonly `string`[]&gt;

Table set suffixes (the shape of [WorktreeTableSet.isSuffix](../classes/WorktreeTableSet.md#issuffix)), sorted, without duplicates

#### Remarks

Orphan reclamation must know which table sets still exist, including those whose registration rows are already gone, so it looks by catalog, not by the registration table. The shape of physical names belongs to the adapter (the SQLite family reads the end of table names,
PGlite reads the end of schema names); a configured entity whose main table happens to look like a suffix does not count — deleting it would delete the main table.
Same optional capability slot for writable checkouts as [RxDBAdapterLocalBase.createWorktreeTableSet](../classes/RxDBAdapterLocalBase.md#createworktreetableset).

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`listWorktreeTableSetSuffixes`](../classes/RxDBAdapterLocalBase.md#listworktreetablesetsuffixes)

---

### mergeChanges() \{#mergechanges\}

```ts
abstract mergeChanges(
   actions,
   localChanges?,
   disableTriggers?
): Promise<number | void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:873](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L873)

Applies compacted changes to the local entity tables

Implementation strategy (SQLite):

1. Convert actions into SQL operations
2. Within a transaction:
   a) Execute the SQL operations on the entity tables (INSERT/UPDATE/DELETE)
   b) Bulk-insert localChanges into the RxDBChange table (for history tracking)
3. Send local events to notify the UI of updates

#### Parameters

| Parameter          | Type                                                             | Description                                                                               |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `actions`          | [`SwitchVersionActions`](SwitchVersionActions.md)                | The compacted change operation set (pulled from the remote)                               |
| `localChanges?`    | `Omit`&lt;[`RxDBChange`](../classes/RxDBChange.md), `"id"`&gt;[] | Records to save into the local RxDBChange table (optional)                                |
| `disableTriggers?` | `boolean`                                                        | Whether to disable triggers (used for operations like pull, to avoid creating RxDBChange) |

#### Returns

`Promise`&lt;`number` \| `void`&gt;

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`mergeChanges`](../classes/RxDBAdapterLocalBase.md#mergechanges)

---

### migrateSystemSchema() \{#migratesystemschema\}

```ts
migrateSystemSchema(): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:582](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L582)

Upgrades the tables owned by RxDB before app migrations or repository operations run.
Adapters that do not need to persist system schema state keep the default no-op implementation.

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`migrateSystemSchema`](../classes/RxDBAdapterLocalBase.md#migratesystemschema)

---

### mutations() \{#mutations\}

```ts
mutations<T>(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:324](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L324)

Mutates entities in bulk (create/update/remove)

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-2"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type                                                 |
| --------- | ---------------------------------------------------- |
| `options` | [`RxDBMutationsMap`](RxDBMutationsMap.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`mutations`](IRxDBAdapter.md#mutations)

---

### physicalTableNames() \{#physicaltablenames\}

```ts
physicalTableNames(metadata): readonly string[];
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:574](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L574)

All the names an entity table may be written as in SQL emitted by this adapter.

#### Parameters

| Parameter  | Type                                                  | Description                                                                   |
| ---------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | Entity metadata; the answer is decided by it alone, no instance state is read |

#### Returns

readonly `string`[]

Un-normalized physical table names without schema qualification; at least one

#### Remarks

**The naming rules belong to the side that writes the tables.** Before this capability,
the versioned domain of `@aiao/rxdb-plugin-working-tree` re-assembled the sqlite family's folding rules itself by `'$'`.
Copied rules do not error when the original changes — they just start computing wrong — and the consequence of computing wrong is one-directional:
the raw write gate fails to recognize a versioned table, and thus **silently allows through** a write that bypasses capture.

The default implementation hands out the logical name and guesses nothing. Guessing a "common" shape for a backend (for example writing the sqlite family's
`namespace$table` as the default) only moves the rule-copying from the plugin into core, and from then on no
backend would ever be discovered for forgetting to override — it would keep computing its table names with someone else's rules.

**Has a default implementation instead of being `abstract`**, same convention as [RxDBAdapterLocalBase.migrateSystemSchema](../classes/RxDBAdapterLocalBase.md#migratesystemschema):
this is an extension of an existing base class, and `abstract` would make every out-of-repo self-built adapter fail to compile on upgrade,
while the ones among them that **do not fold namespaces were right all along**. The cost is that "forgot to override" and
"genuinely not needed" are type-identical; backends that fold namespaces (sqlite family) must override themselves.

No schema qualification: forms like `"public"."post"` have already been reduced to the
logical name in the qualification-stripping step of raw adjudication, and registering them again here would be a second spelling of the same name. What must be registered is the kind that **cannot be stripped**.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`physicalTableNames`](../classes/RxDBAdapterLocalBase.md#physicaltablenames)

---

### rawQuery()? \{#rawquery\}

```ts
rawQuery?(sql, params?): Promise<RawQueryResult>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:346](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L346)

Executes a raw SQL query (for scenarios like conditional UPDATE that bypass the ORM)

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `sql`     | `string`    |
| `params?` | `unknown`[] |

#### Returns

`Promise`&lt;[`RawQueryResult`](RawQueryResult.md)&gt;

#### Remarks

**An optional method**, and that has consequences: core cannot wrap it on the adapter's behalf the way it does for the four write primitives,
so on a database with the commit capability enabled, the raw write gate can only be done by each adapter's own implementation calling
`gateRawWrite(sql, ctx, …)` (`ctx` taken from
[RxDBAdapterLocalBase.workingTreeRawWriteContext](../classes/RxDBAdapterLocalBase.md#workingtreerawwritecontext)). Missing that one line
means every write on this path bypasses change capture.

Writes going through here do not pass the entity Proxy, so they produce no entity events and cached instances do not refresh automatically.

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`rawQuery`](IRxDBAdapter.md#rawquery)

---

### readWorktreeSnapshotPage()? \{#readworktreesnapshotpage\}

```ts
readWorktreeSnapshotPage ? (executor, EntityType, after, limit) : Promise<WorktreeSnapshotPage>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:750](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L750)

Reads one page of an entity table in storage form (read-only checkout snapshot building, US-313).

#### Parameters

| Parameter    | Type                                                                               | Description                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `executor`   | [`TransactionExecutor`](TransactionExecutor.md)                                    | An executor of a transaction on the main database; all pages of one snapshot are read from the same transaction, consistent with each other |
| `EntityType` | [`EntityType`](../type-aliases/EntityType.md)                                      | The entity class on the main instance                                                                                                       |
| `after`      | \| [`WorktreeSnapshotCursor`](../type-aliases/WorktreeSnapshotCursor.md) \| `null` | The [WorktreeSnapshotPage.next](WorktreeSnapshotPage.md#next) of the previous page; `null` reads from the start                             |
| `limit`      | `number`                                                                           | Maximum rows in this page                                                                                                                   |

#### Returns

`Promise`&lt;[`WorktreeSnapshotPage`](WorktreeSnapshotPage.md)&gt;

One page of rows in storage form; encrypted columns stay envelopes, not decrypted

#### Remarks

Pairs with [RxDBAdapterLocalBase.importWorktreeSnapshot](../classes/RxDBAdapterLocalBase.md#importworktreesnapshot): the rows in a page are only recognized by the same kind of adapter.
Same optional capability slot as [RxDBAdapterLocalBase.isEncryptedAtRest](../classes/RxDBAdapterLocalBase.md#isencryptedatrest): absence is a contract-permitted shape,
and the working tree plugin reports unsupported when opening a checkout on such a backend.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`readWorktreeSnapshotPage`](../classes/RxDBAdapterLocalBase.md#readworktreesnapshotpage)

---

### reconcileEntityIndexes()? \{#reconcileentityindexes\}

```ts
reconcileEntityIndexes ? EntityTypes : Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:719](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L719)

Idempotently reconciles entity indexes after user migrations and missing-table backfills.

#### Parameters

| Parameter     | Type                                            |
| ------------- | ----------------------------------------------- |
| `EntityTypes` | [`EntityType`](../type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`reconcileEntityIndexes`](../classes/RxDBAdapterLocalBase.md#reconcileentityindexes)

---

### remove() \{#remove\}

```ts
remove(entity): Promise<RxDBChange>;
```

Defined in: [packages/rxdb/src/system/types.local.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.local.ts#L108)

Removes an entity

#### Parameters

| Parameter | Type                                     | Description          |
| --------- | ---------------------------------------- | -------------------- |
| `entity`  | [`RxDBChange`](../classes/RxDBChange.md) | The entity to remove |

#### Returns

`Promise`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;

Returns the removed entity

---

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:319](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L319)

Removes entities in bulk.

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-3"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        |
| ---------- | --------------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The removed entities

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`removeMany`](IRxDBAdapter.md#removemany)

---

### repository() \{#repository\}

```ts
protected repository<RT>(repositoryName, RepositoryClass): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:384](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L384)

#### Type Parameters

| Type Parameter                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-rt-1"></a> `RT` _extends_ [`RepositoryInstance`](RepositoryInstance.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt; |

#### Parameters

| Parameter         | Type                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `repositoryName`  | `string`                                                                                                                   |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../type-aliases/AdapterRepositoryConstructor.md)&lt;`LocalRxDBChangeRepository`, `RT`&gt; |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`repository`](../classes/RxDBAdapterLocalBase.md#repository)

---

### runInTransaction() \{#runintransaction\}

```ts
runInTransaction<T>(fun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:697](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L697)

Starts a new transaction, **or** reuses the one the caller is already in.

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-4"></a> `T` _extends_ [`TransactionFun`](../type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Description                                                       |
| ----------------- | --------- | ----------------------------------------------------------------- |
| `fun`             | `T`       | The transaction work; its argument is this transaction's executor |
| `transactionLog?` | `boolean` | Whether to write the transaction log                              |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The return value of `fun`

#### Remarks

The difference from [transaction](../classes/RxDBAdapterLocalBase.md#transaction) is not in this method body, but in who `this` is: on a real adapter the two are synonymous,
both starting a new queued transaction; while a caller inside a transaction gets the executor facade, which special-cases this method into
`executor.run()` — reusing the current transaction and **never re-enqueueing**. The SQLite family's and PGlite's overrides only
add disconnect / read-only assertions before that line; their semantics are verbatim the same.

The capture runtime must have an executor to write working tree rows, and "new or reuse" is only known by the calling host.
Calling `transaction()` directly would make the inside-transaction half of the calls queue up waiting for a slot it is itself occupying — manifesting as
a permanent hang rather than an error.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`runInTransaction`](../classes/RxDBAdapterLocalBase.md#runintransaction)

---

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:312](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L312)

Writes entities in bulk (insert if absent, update if present).

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-5"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        |
| ---------- | --------------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The entities after persistence; fields backfilled by the database, such as primary keys and database-side defaults, only have values here

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`saveMany`](IRxDBAdapter.md#savemany)

---

### sealWorktreeReadOnly()? \{#sealworktreereadonly\}

```ts
sealWorktreeReadOnly?(): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:789](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L789)

Seals this adapter's database read-only (read-only checkouts, US-313): write statements are refused at the engine level from then on.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Catches writes that bypass core's write entries and go straight at the adapter. The SQLite family uses `PRAGMA query_only`, PGlite uses read-only transactions.

The seal is state on the connection (on every transaction for PGlite), and session settings on the raw entry that could change it are refused by the read-only hook;
statements issued through the executor (`adapter.transaction(executor => executor.query(…))`) are the adapter's own channel —
the seal itself is laid down from here, so it cannot stop itself from being lifted from here — read-only checkouts guard against accidental writes, not code deliberately changing connection settings.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`sealWorktreeReadOnly`](../classes/RxDBAdapterLocalBase.md#sealworktreereadonly)

---

### settleRepositoryTransaction() \{#settlerepositorytransaction\}

```ts
protected settleRepositoryTransaction(executor, committed): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:931](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L931)

Commits or rolls back the entity state of the public repository; must be called before handing the transaction queue back.

#### Parameters

| Parameter   | Type                                            |
| ----------- | ----------------------------------------------- |
| `executor`  | [`TransactionExecutor`](TransactionExecutor.md) |
| `committed` | `boolean`                                       |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`settleRepositoryTransaction`](../classes/RxDBAdapterLocalBase.md#settlerepositorytransaction)

---

### setWorkingTreeCaptureHook() \{#setworkingtreecapturehook\}

```ts
setWorkingTreeCaptureHook(hook): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:501](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L501)

**`Internal`**

Installs or uninstalls the capture runtime (the four mount points of adapter-contract.md §1).

#### Parameters

| Parameter | Type                                                                 | Description                                                               |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `hook`    | [`WorkingTreeCaptureHook`](WorkingTreeCaptureHook.md) \| `undefined` | The runtime that takes over the four mount points; `undefined` uninstalls |

#### Returns

`void`

#### Remarks

The mount is installed **here** rather than each of the six adapters inserting a line in its own `transaction()`: writing it one fewer time,
or writing it one step late (validating the token only after the business write), would be discoverable by nothing — and that is exactly the shape "the adjudication implementation
exists only once" in §2 is meant to rule out.

The callers are `RxDB.connect()` (after the capability bit is confirmed true) and `workingTree.enable()` (after the bit flip succeeds).
On a database that is not enabled it is never called even once, so the four write primitives do not even have one layer of forwarding.

Idempotent: if already installed, uninstall first and then install — never stacked two layers deep.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`setWorkingTreeCaptureHook`](../classes/RxDBAdapterLocalBase.md#setworkingtreecapturehook)

---

### switchBranch() \{#switchbranch\}

```ts
abstract switchBranch(options): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:855](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L855)

#### Parameters

| Parameter | Type                                            |
| --------- | ----------------------------------------------- |
| `options` | [`SwitchBranchOptions`](SwitchBranchOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`switchBranch`](../classes/RxDBAdapterLocalBase.md#switchbranch)

---

### transaction() \{#transaction\}

#### Call Signature

```ts
abstract transaction<T>(fun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:620](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L620)

Reads and writes within the same transaction through the executor.

##### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-6"></a> `T` _extends_ [`TransactionFun`](../type-aliases/TransactionFun.md) |

##### Parameters

| Parameter         | Type      | Description                                      |
| ----------------- | --------- | ------------------------------------------------ |
| `fun`             | `T`       | The callback holding this transaction's executor |
| `transactionLog?` | `boolean` | Whether to record the transaction log            |

##### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The callback result

##### Remarks

`entity.save()` without an executor re-enqueues. Awaiting it inside the transaction callback waits on itself, and the transaction cannot finish.
Inside a transaction use [TransactionExecutor.getRepository](TransactionExecutor.md#getrepository); for saving entity instances see [EntityBase.save](../classes/EntityBase.md#save).

##### Examples

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
// ❌ The entity instance holds no executor; save() re-enqueues and waits for the current transaction to finish.
await adapter.transaction(async () => {
  await entity.save();
});
```

##### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`transaction`](../classes/RxDBAdapterLocalBase.md#transaction)

#### Call Signature

```ts
abstract transaction(fun, transactionLog?): Promise<unknown>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:653](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L653)

Reads and writes within the same transaction through the executor.

##### Parameters

| Parameter         | Type                                                  | Description                                      |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `fun`             | [`TransactionFun`](../type-aliases/TransactionFun.md) | The callback holding this transaction's executor |
| `transactionLog?` | `boolean`                                             | Whether to record the transaction log            |

##### Returns

`Promise`&lt;`unknown`&gt;

The callback result

##### Remarks

`entity.save()` without an executor re-enqueues. Awaiting it inside the transaction callback waits on itself, and the transaction cannot finish.
Inside a transaction use [TransactionExecutor.getRepository](TransactionExecutor.md#getrepository); for saving entity instances see [EntityBase.save](../classes/EntityBase.md#save).

##### Examples

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
// ❌ The entity instance holds no executor; save() re-enqueues and waits for the current transaction to finish.
await adapter.transaction(async () => {
  await entity.save();
});
```

##### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`transaction`](../classes/RxDBAdapterLocalBase.md#transaction)

---

### transactionalRepository() \{#transactionalrepository\}

```ts
protected transactionalRepository<T, R>(EntityType, repository): R;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:936](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L936)

Puts the entire operation of a public repository into a transaction; not called when the executor creates the repository.

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-7"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |
| <a id="type-parameter-r"></a> `R` _extends_ `object`                                        |

#### Parameters

| Parameter    | Type |
| ------------ | ---- |
| `EntityType` | `T`  |
| `repository` | `R`  |

#### Returns

`R`

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`transactionalRepository`](../classes/RxDBAdapterLocalBase.md#transactionalrepository)

---

### update() \{#update\}

```ts
update(entity, patch): Promise<RxDBChange>;
```

Defined in: [packages/rxdb/src/system/types.local.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.local.ts#L98)

Updates an entity

#### Parameters

| Parameter | Type                                                                                     | Description          |
| --------- | ---------------------------------------------------------------------------------------- | -------------------- |
| `entity`  | [`RxDBChange`](../classes/RxDBChange.md)                                                 | The entity to update |
| `patch`   | `Partial`&lt;`InstanceType`&lt;_typeof_ [`RxDBChange`](../classes/RxDBChange.md)&gt;&gt; | Update data          |

#### Returns

`Promise`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;

Returns the updated entity

---

### upsertMany() \{#upsertmany\}

```ts
abstract upsertMany<T>(entityName, data): Observable<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:912](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L912)

Upserts data in bulk (QueryCache only)

Executes INSERT OR REPLACE semantics, used to cache remotely pulled data.

#### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-t-8"></a> `T` |

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

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`upsertMany`](../classes/RxDBAdapterLocalBase.md#upsertmany)

---

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:296](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L296)

The version number of the underlying database engine (such as SQLite's `3.45.0`), used for diagnostics and capability judgment.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Unrelated to the system table watermark number (`RXDB_SYSTEM_SCHEMA_VERSION`) — that is RxDB's own number.

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`version`](IRxDBAdapter.md#version)

---

### worktreeTableSetMounted() \{#worktreetablesetmounted\}

```ts
worktreeTableSetMounted(): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:546](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L546)

**`Internal`**

Called after this instance remounts a table set (US-314 B1.4): clears the caches this adapter keeps by physical table. Nothing to do by default.

#### Returns

`void`

#### Remarks

Called by [RxDB.mountWorktreeTableSet](../classes/RxDB.md#mountworktreetableset) inside the remounting transaction. The SQLite family's row number caches are kept by physical table; after remounting a set,
the same row number points at a different row.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`worktreeTableSetMounted`](../classes/RxDBAdapterLocalBase.md#worktreetablesetmounted)
