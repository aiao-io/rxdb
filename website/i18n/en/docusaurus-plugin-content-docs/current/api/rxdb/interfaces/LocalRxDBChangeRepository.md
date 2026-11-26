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

The adapter name, same value as the key used when registering with `RxDB.adapter()`; both error messages and `getAdapter()` recognize adapters by it

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

The set of business tables mounted on this instance (US-314 in-database shadow tables)

##### Remarks

Lives on the RxDB instance ([RxDB.worktreeTableSet](../classes/RxDB.md#worktreetableset-1)); this is just a pass-through read: an instance mounts only one table set at a time, and a second copy stored on the adapter would be a second source of truth. SQL that reads or writes business tables resolves physical names through it; entities without copies, such as system tables and QueryCache, always land in the primary table set regardless of which set is mounted.

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

The capture runtime; always `undefined` on databases without the commit capability enabled.

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

This adapter's current raw-write adjudication context (adapter-contract.md §2)

##### Remarks

`rawQuery?()` is an **optional method** on this interface (see `IRxDBAdapter` above), and core cannot wrap it on the adapter's behalf the way it does the four mount points — adjudication can only be done by each adapter's own `rawQuery` implementation calling `gateRawWrite(sql, ctx, …)`. The `ctx` that call needs is handed out here, so all six adapters have to get right is that single line of "pass it to the adjudicator"; the two genuinely easy-to-get-wrong questions — how the capability bit is computed and where the scope comes from — never land on them.

The capability bit is decided directly by **whether the capture runtime is installed**, with no separately stored boolean: the runtime is installed only when the capability bit is true (`RxDB.connect()` reads true, or `workingTree.enable()` just flipped it). A second stored copy would be a second source of truth, and the consequence of the two diverging is one-directional — the gate believing itself off would let every raw write through. The context object itself is created in `setWorkingTreeCaptureHook()` **in the same assignment statement** as the runtime, not recreated on every read: the getter is called on every raw statement, and it holds no per-call state. The two fields change together in that one place, so "a new runtime installed while a closure bound to the old runtime is handed out" is not a reachable state.

What is handed out is the **adjudication entry point itself**, not the things adjudication looks at (scope, column sets, trusted intents). Core therefore does not have to restate what capture recognizes, and there is no dual-list problem of the kind "a copy of the scope was made, and derived index columns registered later by a plugin land in only one of the two" — adjudication always runs over the copy the runtime holds.

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

Adopts the primary database adapter's keyring (read-only checkout, US-313).

#### Parameters

| Parameter | Type                                                      | Description                                                  |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| `source`  | [`LocalRxDBAdapter`](../type-aliases/LocalRxDBAdapter.md) | The primary database's adapter, same backend as this adapter |

#### Returns

`void`

#### Remarks

The envelope's AAD binds the database name; the snapshot database's ciphertext is a byte-for-byte copy of the primary database's envelopes, decryptable only with the primary database's keyring. Called before this adapter's first connection. What is shared is the same object: calling `lock()` on the snapshot instance also locks the primary database.

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

| Parameter         | Type      | Description                                                                                                            |
| ----------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `fun`             | `T`       | Transaction callback function                                                                                          |
| `transactionLog?` | `boolean` | Whether to write the transaction log. Defaults to `true`; pure DDL / metadata bootstrap should explicitly pass `false` |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

#### Remarks

The only difference from [transaction](../classes/RxDBAdapterLocalBase.md#transaction) is that it **skips the "bootstrap complete" readiness gate**. The adapter's readiness gate is waiting on exactly `RxDB.connect()`, and the bootstrap-phase caller is inside that promise — going through [transaction](../classes/RxDBAdapterLocalBase.md#transaction) would wait on itself and hang forever. Tables may not exist yet at this point; callers are responsible for ordering.

Callers are limited to two kinds: the bootstrap chain of `RxDB.connect()` itself (watermarks, table creation, migration), and **plugins installed inside `connect()`** (their `install()` runs on that same promise; see the FTS installation in `@aiao/rxdb-plugin-search`). Business code always uses [transaction](../classes/RxDBAdapterLocalBase.md#transaction).

`transactionLog` must be passable here: bootstrap-phase DDL is not a user change, and writing the log would needlessly trigger a branch-number read and a full trigger rebuild. The default implementation delegates directly to [transaction](../classes/RxDBAdapterLocalBase.md#transaction); only adapters with their own readiness gate need to override.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`bootstrapTransaction`](../classes/RxDBAdapterLocalBase.md#bootstraptransaction)

---

### canDropStorage()? \{#candropstorage\}

```ts
canDropStorage?(): boolean;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:811](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L811)

Whether, under the current configuration, [dropStorage](../classes/RxDBAdapterLocalBase.md#dropstorage) can delete this database (asked once before a read-only checkout creates the snapshot database, US-313).

#### Returns

`boolean`

When `false`, `dropStorage()` will definitely refuse

#### Remarks

Consults configuration only, never touches storage. Before creating the snapshot there is no other way to know: trying by deleting once would delete a database that has not yet been identified, and a misconfigured snapshot factory pointing at the primary database's storage would delete the primary database itself. A snapshot database that could be created but not deleted would throw on close, and every subsequent cleanup would report errors.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`canDropStorage`](../classes/RxDBAdapterLocalBase.md#candropstorage)

---

### checkEntityConstraints()? \{#checkentityconstraints\}

```ts
checkEntityConstraints ? EntityTypes : Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:734](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L734)

Read-only drift check: throws [RxDBConstraintDriftError](../classes/RxDBConstraintDriftError.md) when the storage constraints declared in the entity metadata disagree with the actual constraints in the database, listing missing and extra constraint names (US-030 AC#10).

#### Parameters

| Parameter     | Type                                            |
| ------------- | ----------------------------------------------- |
| `EntityTypes` | [`EntityType`](../type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Called at the same moment as [RxDBAdapterLocalBase.reconcileEntityIndexes](../classes/RxDBAdapterLocalBase.md#reconcileentityindexes) (after user migrations and missing-table backfills), but is **read-only and does not auto-backfill** — backfill is written by the user into `migrations`. The comparison covers only three kinds of objects: `ck_` CHECKs, `uq_` conditional unique indexes, and `ex_` exclusion ranges.

Absence is a contract-permitted shape (same as `reconcileEntityIndexes`); but when the entity declares `checks` / conditional-unique `where` / `exclusions` and the adapter lacks this method, `connect()` reports not-supported per US-030 AC#6 instead of silently degrading.

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

Adapters with their own readiness gate (SQLite family / PGlite) let `query()` / `rawQuery()` / `createTables()` skip the readiness gate during the bootstrap window — that gate is waiting on exactly the `RxDB.connect()` that has not settled yet. This method flips the state to `ready`, after which every entry point goes through the normal readiness wait. Adapters without a readiness gate keep the default no-op implementation.

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

Itself, for chaining

#### Remarks

Table creation and system migration both happen here (see `isCurrentRxDBSystemVersion`), so it can be slow, and it can throw `UnsupportedRxDBSystemVersionError` when the database is newer than this process.

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

Create an entity

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

Creates and seeds a set of tables for a writable checkout inside the caller's transaction (US-314 B1.5).

#### Parameters

| Parameter  | Type                                                 | Description                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](TransactionExecutor.md)      | The executor of a transaction on the primary database; table creation, copying, increments and trigger attachment all happen in this one transaction, and the open flow writes the held key in the same transaction |
| `tableSet` | [`WorktreeTableSet`](../classes/WorktreeTableSet.md) | The table set to create; must not be the primary table set; members must keep change logs                                                                                                                           |
| `seed`     | [`WorktreeTableSetSeed`](WorktreeTableSetSeed.md)    | The held branch and the increments to apply on top                                                                                                                                                                  |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Rows of the primary table set are copied as-is (storage form, not decrypted), auto-increment sequences aligned, and increments applied on top — none of it logged in the change log or dispatched as events; finally the change triggers of the member tables are attached to the held branch. Same optional capability slot as [RxDBAdapterLocalBase.readWorktreeSnapshotPage](../classes/RxDBAdapterLocalBase.md#readworktreesnapshotpage): when absent, the working tree plugin reports not-supported on opening a writable checkout.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`createWorktreeTableSet`](../classes/RxDBAdapterLocalBase.md#createworktreetableset)

---

### deleteByIds() \{#deletebyids\}

```ts
abstract deleteByIds(entityName, ids): Observable<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:928](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L928)

Deletes in bulk by a list of IDs (QueryCache only)

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

Unlike `RxDB.destroy()`, disconnecting is **reversible**: the same adapter instance can `connect()` again afterwards. Implementations must be idempotent — calling while not connected is a no-op, not an error.

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`disconnect`](IRxDBAdapter.md#disconnect)

---

### dropStorage()? \{#dropstorage\}

```ts
dropStorage?(): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:800](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L800)

Permanently deletes this adapter's persistent storage for this database (read-only checkout reclaims the snapshot database, US-313).

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

Throws when this adapter is still connected: disconnect first, then delete

#### Remarks

The storage location is derived with the same rules as at connection time (`rxdb.config.dbName` plus adapter options); does nothing when the database does not exist. An in-memory database is gone once disconnected, so this is also a no-op. What is deleted cannot be recovered: callers must first confirm that no other context is still using this database.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`dropStorage`](../classes/RxDBAdapterLocalBase.md#dropstorage)

---

### dropWorktreeTableSet()? \{#dropworktreetableset\}

```ts
dropWorktreeTableSet ? (executor, tableSet) : Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:840](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L840)

Drops a set of tables for a writable checkout inside the caller's transaction (US-314 B1.5).

#### Parameters

| Parameter  | Type                                                 | Description                                                                                                                                      |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `executor` | [`TransactionExecutor`](TransactionExecutor.md)      | The executor of a transaction on the primary database; the close flow releases the held key and deletes the registry row in the same transaction |
| `tableSet` | [`WorktreeTableSet`](../classes/WorktreeTableSet.md) | The table set to drop; must not be the primary table set                                                                                         |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Locates the table set by the database's catalog; half-built ones and ones whose members were removed from the configuration are also deleted, re-entrantly; cascading deletes caused by dropping the tables are not recorded in the change log.

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

Returns the array of query results

---

### getMetadataByIds() \{#getmetadatabyids\}

```ts
abstract getMetadataByIds(entityName, ids): Observable<Map<string, string>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:896](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L896)

Gets metadata for a list of IDs (QueryCache only)

Used for local cache freshness checks; returns an ID → updatedAt map.

#### Parameters

| Parameter    | Type       | Description        |
| ------------ | ---------- | ------------------ |
| `entityName` | `string`   | Entity name        |
| `ids`        | `string`[] | List of entity IDs |

#### Returns

`Observable`&lt;`Map`&lt;`string`, `string`&gt;&gt;

`Observable<Map<string, string>>` - ID → updatedAt map

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

Gets the repository instance of this entity **on this adapter**.

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

Returns the repository on the adapter axis (see [AdapterRepositoryConstructor](../type-aliases/AdapterRepositoryConstructor.md)), not the same object as the facade repository users usually get from `RxDB.getRepository()`.

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

Writes rows read from the primary database and the increments into this adapter's database (read-only checkout creates the snapshot, US-313).

#### Parameters

| Parameter  | Type                                                  | Description                                           |
| ---------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `snapshot` | [`WorktreeSnapshotImport`](WorktreeSnapshotImport.md) | The tables to copy and the increments to apply on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

One transaction: first insert each table's rows as-is, then apply the increments. Neither decrypts nor encrypts; encrypted column values must already be envelopes, and plaintext causes an immediate throw; dispatches no events and does not enter the entity cache. Refused on databases with the capture runtime installed: snapshots cannot be written into the trusted-write matrix.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`importWorktreeSnapshot`](../classes/RxDBAdapterLocalBase.md#importworktreesnapshot)

---

### isEncryptedAtRest()? \{#isencryptedatrest\}

```ts
isEncryptedAtRest ? value : boolean;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:535](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L535)

Determines whether a persisted value is already in the "encrypted at-rest form" (FR-038).

#### Parameters

| Parameter | Type      | Description                                                                                   |
| --------- | --------- | --------------------------------------------------------------------------------------------- |
| `value`   | `unknown` | The value in the persisted column; the caller guarantees it is neither `null` nor `undefined` |

#### Returns

`boolean`

`true` when it is in the encrypted persisted form

#### Remarks

**Absence is a contract-permitted shape**, same measure as [RxDBAdapterLocalBase.reconcileEntityIndexes](../classes/RxDBAdapterLocalBase.md#reconcileentityindexes): adapters without column encryption support do not implement it. Absence **does not mean letting it through** — when the caller (the commit write path) cannot get an adjudicator but genuinely has encrypted columns to adjudicate, it fails closed with an error rather than skipping the check.

Declared here and left for adapters to implement because the authoritative adjudicator is `isEnvelope` from `@aiao/rxdb-adapter-encrypted`, which `@aiao/rxdb` **cannot** depend on: the latter peer-depends on the former, and the dependency direction is reversed. For an encrypted `PropertyType.string` column, plaintext and ciphertext are both strings — core guessing the shape on its own would be installing a guard that misreads.

Same "optional capability slot" as [RxDBAdapterLocalBase.setWorkingTreeCaptureHook](../classes/RxDBAdapterLocalBase.md#setworkingtreecapturehook): core declares only the position and semantics, and does not decide for the six backends whether they have it.

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

Asks about the **physical table**, not whether the entity is registered in the metadata.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`isTableExisted`](../classes/RxDBAdapterLocalBase.md#istableexisted)

---

### listWorktreeTableSetSuffixes()? \{#listworktreetablesetsuffixes\}

```ts
listWorktreeTableSetSuffixes ? executor : Promise<readonly string[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:853](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L853)

Lists the existing writable-checkout table sets by the database's catalog (US-314 B2.6).

#### Parameters

| Parameter  | Type                                            | Description              |
| ---------- | ----------------------------------------------- | ------------------------ |
| `executor` | [`TransactionExecutor`](TransactionExecutor.md) | The caller's transaction |

#### Returns

`Promise`&lt;readonly `string`[]&gt;

Table set suffixes (shaped like [WorktreeTableSet.isSuffix](../classes/WorktreeTableSet.md#issuffix)), ordered and without duplicates

#### Remarks

Orphan reclamation needs to know which table sets still exist, including ones whose registry rows are already gone, so it looks by catalog rather than by the registry table. The shape of physical names belongs to the adapter (the SQLite family reads the end of the table name; PGlite reads the end of the schema name); when a configured entity's primary table happens to look like a suffix, it does not count — dropping it would be dropping the primary table. Same optional capability slot for writable checkouts as [RxDBAdapterLocalBase.createWorktreeTableSet](../classes/RxDBAdapterLocalBase.md#createworktreetableset).

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
2. In a transaction:
   a) Execute the SQL operations on the entity tables (INSERT/UPDATE/DELETE)
   b) Bulk-insert localChanges into the RxDBChange table (for history tracking)
3. Send local events to notify the UI to update

#### Parameters

| Parameter          | Type                                                             | Description                                                                               |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `actions`          | [`SwitchVersionActions`](SwitchVersionActions.md)                | The compacted set of change operations (pulled from the remote)                           |
| `localChanges?`    | `Omit`&lt;[`RxDBChange`](../classes/RxDBChange.md), `"id"`&gt;[] | Records to save to the local RxDBChange table (optional)                                  |
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

Upgrades the tables owned by RxDB before applying migrations or running repositories.
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

Bulk-modifies entities (create/update/delete)

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

All names an entity table can be written as in the SQL this adapter emits.

#### Parameters

| Parameter  | Type                                                  | Description                                                                   |
| ---------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | Entity metadata; the answer is decided by it alone, reading no instance state |

#### Returns

readonly `string`[]

Physical table names, unnormalized and without schema qualification; at least one

#### Remarks

**Naming rules belong to the side that writes the table.** Before this capability, `@aiao/rxdb-plugin-working-tree`'s versioned domain re-assembled the SQLite family's folding rules around `'$'` on its own. A copied rule does not error out when the original changes — it just starts computing wrong — and the consequence of computing wrong is one-directional: the raw-write gate fails to recognize a version-controlled table and **silently lets through** a write that bypasses capture.

The default implementation hands out the logical name and guesses nothing. Guessing a "common" shape on behalf of a backend (e.g. hardcoding the SQLite family's `namespace$table` as the default) merely moves the rule-copying from the plugin into core — and from then on, no backend would ever be caught for forgetting to override: it would keep computing its own table names with someone else's rules.

**Has a default implementation rather than being `abstract`**, same measure as [RxDBAdapterLocalBase.migrateSystemSchema](../classes/RxDBAdapterLocalBase.md#migratesystemschema): this is an extension to an existing base class, and `abstract` would break compilation outright for every self-built adapter outside the repo on upgrade — while the ones that **do not fold namespaces were already correct**. The cost is that "forgot to override" and "genuinely does not need to" are type-identical; backends that fold namespaces (the SQLite family) must override it themselves.

Without schema qualification: a shape like `"public"."post"` is already reduced back to the logical name by the qualifier-stripping step of raw adjudication, so registering it here again would just be a second spelling of the same name. What must be registered is the kind that **cannot be stripped**.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`physicalTableNames`](../classes/RxDBAdapterLocalBase.md#physicaltablenames)

---

### rawQuery()? \{#rawquery\}

```ts
rawQuery?(sql, params?): Promise<RawQueryResult>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:346](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L346)

Executes a raw SQL query (scenarios that bypass the ORM, such as conditional UPDATEs)

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `sql`     | `string`    |
| `params?` | `unknown`[] |

#### Returns

`Promise`&lt;[`RawQueryResult`](RawQueryResult.md)&gt;

#### Remarks

An **optional method**, and that has consequences: core cannot wrap it on the adapter's behalf the way it wraps the four write primitives, so on databases with the commit capability enabled, gating raw writes can only be done by each adapter's own implementation calling `gateRawWrite(sql, ctx, …)` (`ctx` from [RxDBAdapterLocalBase.workingTreeRawWriteContext](../classes/RxDBAdapterLocalBase.md#workingtreerawwritecontext)). Missing that call means all writes on this path bypass change capture.

Writes through here do not go through the entity Proxy, so they produce no entity events, and cached instances do not refresh automatically.

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`rawQuery`](IRxDBAdapter.md#rawquery)

---

### readWorktreeSnapshotPage()? \{#readworktreesnapshotpage\}

```ts
readWorktreeSnapshotPage ? (executor, EntityType, after, limit) : Promise<WorktreeSnapshotPage>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:750](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L750)

Reads one page of an entity table in storage form (read-only checkout creates the snapshot, US-313).

#### Parameters

| Parameter    | Type                                                                               | Description                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `executor`   | [`TransactionExecutor`](TransactionExecutor.md)                                    | The executor of a transaction on the primary database; all pages of one snapshot are read from the same transaction, consistent with each other |
| `EntityType` | [`EntityType`](../type-aliases/EntityType.md)                                      | The entity class on the primary instance                                                                                                        |
| `after`      | \| [`WorktreeSnapshotCursor`](../type-aliases/WorktreeSnapshotCursor.md) \| `null` | The previous page's [WorktreeSnapshotPage.next](WorktreeSnapshotPage.md#next); `null` reads from the start                                      |
| `limit`      | `number`                                                                           | Maximum rows in this page                                                                                                                       |

#### Returns

`Promise`&lt;[`WorktreeSnapshotPage`](WorktreeSnapshotPage.md)&gt;

One page of rows in storage form; encrypted columns stay envelopes, not decrypted

#### Remarks

Pairs with [RxDBAdapterLocalBase.importWorktreeSnapshot](../classes/RxDBAdapterLocalBase.md#importworktreesnapshot): the rows in a page are only recognizable by the same kind of adapter. Same optional capability slot as [RxDBAdapterLocalBase.isEncryptedAtRest](../classes/RxDBAdapterLocalBase.md#isencryptedatrest): absence is a contract-permitted shape, and the working tree plugin reports not-supported when opening a checkout on such a backend.

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

Delete an entity

#### Parameters

| Parameter | Type                                     | Description          |
| --------- | ---------------------------------------- | -------------------- |
| `entity`  | [`RxDBChange`](../classes/RxDBChange.md) | The entity to delete |

#### Returns

`Promise`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;

Returns the deleted entity

---

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:319](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L319)

Bulk-deletes entities.

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

The deleted entities

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

Opens a new transaction, **or** reuses the one the caller is already in.

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-4"></a> `T` _extends_ [`TransactionFun`](../type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      | Description                                                        |
| ----------------- | --------- | ------------------------------------------------------------------ |
| `fun`             | `T`       | The transaction work; the parameter is this transaction's executor |
| `transactionLog?` | `boolean` | Whether to write the transaction log                               |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The return value of `fun`

#### Remarks

The difference from [transaction](../classes/RxDBAdapterLocalBase.md#transaction) is not in this method body but in who `this` is: on a real adapter the two are synonymous, both opening a new queued transaction; but a caller inside a transaction holds the executor facade, and the facade special-cases this method into `executor.run()` — reusing the current transaction and **never re-queueing**. The SQLite family's and PGlite's respective overrides merely add disconnect / read-only assertions in front of that line, semantically identical to this one word for word.

The capture runtime must have an executor to write working tree rows, and only the calling host knows whether to open a new one or reuse. Calling `transaction()` directly would make the half of the calls inside the transaction queue up waiting for a slot they are occupying themselves — manifesting as a permanent hang rather than an error.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`runInTransaction`](../classes/RxDBAdapterLocalBase.md#runintransaction)

---

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:312](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L312)

Bulk-writes entities (inserts when absent, updates when present).

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

Seals this adapter's database read-only (read-only checkout, US-313): subsequent write statements are refused at the engine level.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Catches writes that bypass core's write entry points and hit the adapter directly. For the SQLite family it is `PRAGMA query_only`; for PGlite it is a read-only transaction.

The seal is a state on the connection (per transaction for PGlite); session settings that could change it on the raw entry point are refused by the read-only hook. Statements issued through the executor (`adapter.transaction(executor => executor.query(…))`) travel the adapter's own channel — the same one the seal itself is applied through, so it cannot block being lifted from there. The read-only checkout guards against accidental writes, not code that deliberately changes the connection configuration.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`sealWorktreeReadOnly`](../classes/RxDBAdapterLocalBase.md#sealworktreereadonly)

---

### settleRepositoryTransaction() \{#settlerepositorytransaction\}

```ts
protected settleRepositoryTransaction(executor, committed): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:931](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L931)

Commits or rolls back the public repositories' entity state; must be called before handing the transaction queue back.

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

| Parameter | Type                                                                 | Description                                                           |
| --------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `hook`    | [`WorkingTreeCaptureHook`](WorkingTreeCaptureHook.md) \| `undefined` | The runtime taking over the four mount points; `undefined` uninstalls |

#### Returns

`void`

#### Remarks

The mounting happens **here**, not as a line each of the six adapters inserts into its own `transaction()`: writing it once fewer or once later (validating the token only after the business write) would be discoverable by nothing — exactly the shape §2 "there is only one adjudication implementation" exists to exclude.

Callers are `RxDB.connect()` (after confirming the capability bit is true) and `workingTree.enable()` (after the bit is successfully flipped). On databases without the capability enabled it is never called, so the four write primitives have not even one layer of forwarding.

Idempotent: if already installed, it uninstalls first and then installs, never stacking into two layers.

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

Reads and writes within one transaction through the executor.

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

The callback's result

##### Remarks

An `entity.save()` without an executor re-queues. Waiting on it inside the transaction callback waits on itself, and the transaction cannot finish. Inside a transaction use [TransactionExecutor.getRepository](TransactionExecutor.md#getrepository); for the save entry point of entity instances see [EntityBase.save](../classes/EntityBase.md#save).

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
// ❌ Entity instances do not hold an executor; save() re-queues and waits for the current transaction to end.
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

Reads and writes within one transaction through the executor.

##### Parameters

| Parameter         | Type                                                  | Description                                      |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `fun`             | [`TransactionFun`](../type-aliases/TransactionFun.md) | The callback holding this transaction's executor |
| `transactionLog?` | `boolean`                                             | Whether to record the transaction log            |

##### Returns

`Promise`&lt;`unknown`&gt;

The callback's result

##### Remarks

An `entity.save()` without an executor re-queues. Waiting on it inside the transaction callback waits on itself, and the transaction cannot finish. Inside a transaction use [TransactionExecutor.getRepository](TransactionExecutor.md#getrepository); for the save entry point of entity instances see [EntityBase.save](../classes/EntityBase.md#save).

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
// ❌ Entity instances do not hold an executor; save() re-queues and waits for the current transaction to end.
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

Puts the public repository's whole operation into a transaction; not called when the executor creates the repository.

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

Update an entity

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

Bulk-upserts data (QueryCache only)

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

The version number of the underlying database engine (e.g. `3.45.0` for SQLite), used for diagnostics and capability checks.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Unrelated to the system table watermark number (`RXDB_SYSTEM_SCHEMA_VERSION`), which is RxDB's own number.

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`version`](IRxDBAdapter.md#version)

---

### worktreeTableSetMounted() \{#worktreetablesetmounted\}

```ts
worktreeTableSetMounted(): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:546](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L546)

**`Internal`**

Called after this instance mounts a different table set (US-314 B1.4): clears this adapter's caches keyed by physical table. Does nothing by default.

#### Returns

`void`

#### Remarks

Called by [RxDB.mountWorktreeTableSet](../classes/RxDB.md#mountworktreetableset) inside the mounting transaction. The SQLite family's row-number caches are keyed by physical table; once a different table set is mounted, the same row number points at a different row.

#### Inherited from

[`RxDBAdapterLocalBase`](../classes/RxDBAdapterLocalBase.md).[`worktreeTableSetMounted`](../classes/RxDBAdapterLocalBase.md#worktreetablesetmounted)
