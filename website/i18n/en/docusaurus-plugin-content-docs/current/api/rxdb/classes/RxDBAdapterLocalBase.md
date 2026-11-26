# RxDBAdapterLocalBase

Defined in: [packages/rxdb/src/rxdb-adapter.ts:424](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L424)

Database adapter base class (local)

## Extends

- [`RxDBAdapterBase`](RxDBAdapterBase.md)

## Extended by

- [`LocalRxDBChangeRepository`](../interfaces/LocalRxDBChangeRepository.md)
- [`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md)
- [`RxDBAdapterPGlite`](../../rxdb-adapter-pglite/classes/RxDBAdapterPGlite.md)
- [`RxDBAdapterSqliteBase`](../../rxdb-adapter-sqlite/interfaces/RxDBAdapterSqliteBase.md)
- [`RxDBAdapterSqliteBase`](../../rxdb-adapter-sqlite-core/classes/RxDBAdapterSqliteBase.md)
- [`RxDBAdapterSqliteBase`](../../rxdb-adapter-sqlite-wasm/interfaces/RxDBAdapterSqliteBase.md)

## Constructors

### Constructor

```ts
new RxDBAdapterLocalBase(rxdb): RxDBAdapterLocalBase;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:380](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L380)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](RxDB.md) |

#### Returns

`RxDBAdapterLocalBase`

#### Inherited from

[`RxDBAdapterBase`](RxDBAdapterBase.md).[`constructor`](RxDBAdapterBase.md#constructor)

## Properties

### repository\_cache \{#repository_cache\}

```ts
protected readonly repository_cache: Map<EntityType, RepositoryInstance<EntityType>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:378](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L378)

#### Inherited from

[`RxDBAdapterBase`](RxDBAdapterBase.md).[`repository_cache`](RxDBAdapterBase.md#repository_cache)

***

### repository\_map \{#repository_map\}

```ts
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterLocalBase, RepositoryInstance<EntityType>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:377](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L377)

#### Inherited from

[`RxDBAdapterBase`](RxDBAdapterBase.md).[`repository_map`](RxDBAdapterBase.md#repository_map)

***

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:380](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L380)

#### Inherited from

[`RxDBAdapterBase`](RxDBAdapterBase.md).[`rxdb`](RxDBAdapterBase.md#rxdb)

## Accessors

### tableSet \{#tableset\}

#### Get Signature

```ts
get tableSet(): WorktreeTableSet;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:480](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L480)

The set of business tables this instance mounts (US-314 in-database shadow tables)

##### Remarks

Stored on the RxDB instance ([RxDB.worktreeTableSet](RxDB.md#worktreetableset-1)), this is only a re-read: one instance mounts only one table set at a time,
and the adapter storing another copy would be a second truth. All SQL that reads or writes business tables resolves physical names through it; entities without copies
such as system tables and QueryCache land on the main table set regardless of which set is mounted.

##### Returns

[`WorktreeTableSet`](WorktreeTableSet.md)

***

### workingTreeCaptureHook \{#workingtreecapturehook\}

#### Get Signature

```ts
get workingTreeCaptureHook(): 
  | WorkingTreeCaptureHook
  | undefined;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:442](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L442)

**`Internal`**

The capture runtime; always `undefined` on databases without the commit capability enabled.

##### Returns

  \| [`WorkingTreeCaptureHook`](../interfaces/WorkingTreeCaptureHook.md)
  \| `undefined`

***

### workingTreeRawWriteContext \{#workingtreerawwritecontext\}

#### Get Signature

```ts
get workingTreeRawWriteContext(): RawWriteContext;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:468](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L468)

**`Internal`**

This adapter's current raw write judgment context (adapter-contract.md §2)

##### Remarks

`rawQuery?()` is an **optional method** on this interface (see `IRxDBAdapter` above), so the core package cannot wrap it for adapters the way it does the four mount points —
the judgment can only be made by each adapter's own `rawQuery` implementation calling `gateRawWrite(sql, ctx, …)`.
The `ctx` that call needs is handed out here, so the only thing the six adapters need to get right is "pass it to the judgment";
the two truly error-prone questions, "how the capability bit is computed" and "where the domain comes from", never land on them.

The capability bit is decided directly by **whether the capture runtime is installed**, without storing a separate boolean: the runtime is only installed when the capability bit is true
(`RxDB.connect()` reads true, or `workingTree.enable()` has just flipped it). Storing another copy would be a second truth,
and the consequence of the two falling out of sync is one-directional — the gate thinks it is off and lets all raw writes through. The context object itself is built in the
**same assignment** as the runtime inside `setWorkingTreeCaptureHook()`, not created anew on each access: the accessor is called on every raw
statement, and it carries no per-call state. The two fields only change together at that one place, so "a new runtime installed while
a closure bound to the old runtime is handed out" is not a reachable state.

What is handed out is the **judgment entry itself**, not the things the judgment looks at (the domain, the column set, the trusted intent). The core therefore does not need
to restate what capture recognizes, and there is no double-list problem like "a copy of the domain was made and derived index columns registered later by plugins only land in one of them" —
the judgment always runs on the runtime's own copy.

##### Returns

[`RawWriteContext`](../type-aliases/RawWriteContext.md)

## Methods

### adoptWorktreeEncryption()? \{#adoptworktreeencryption\}

```ts
adoptWorktreeEncryption?(source): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:777](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L777)

Adopts the main database adapter's keyring (read-only checkout, US-313).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | [`LocalRxDBAdapter`](../type-aliases/LocalRxDBAdapter.md) | The main database's adapter, of the same backend as this adapter |

#### Returns

`void`

#### Remarks

The envelope's AAD binds the database name; the snapshot database's ciphertext is a byte-for-byte copy of the main database's envelopes, only decryptable by the main database's keyring.
Called before this adapter's first connection. The same object is shared: calling `lock()` on the snapshot instance also locks the main database.

***

### bootstrapTransaction() \{#bootstraptransaction\}

```ts
bootstrapTransaction<T>(fun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:676](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L676)

**`Internal`**

Executes a transaction in the **bootstrap phase** (table structure not yet ready).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`TransactionFun`](../type-aliases/TransactionFun.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fun` | `T` | Transaction callback function |
| `transactionLog?` | `boolean` | Whether to write the transaction log. Default `true`; pure DDL / metadata bootstrap should explicitly pass `false` |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

#### Remarks

The only difference from [transaction](#transaction) is **skipping the "bootstrap complete" readiness gate**. The adapter's readiness gate waits on
`RxDB.connect()`, and bootstrap-phase callers are inside that promise — going through [transaction](#transaction) would wait on itself,
and hang forever. Tables may not exist yet at this point; the caller is responsible for the ordering.

Callers are limited to two kinds: `RxDB.connect()`'s own bootstrap pipeline (watermarks, table creation, migrations), and
**plugins installed inside `connect()`** (their `install()` runs in the same promise,
see the FTS installation of `@aiao/rxdb-plugin-search`). Business code always uses [transaction](#transaction).

`transactionLog` must be passable here: bootstrap-phase DDL belongs to no user change, and writing the log would needlessly trigger
a branch-number read and a full trigger rebuild. The default implementation delegates directly to [transaction](#transaction),
only adapters with their own readiness gate need to override.

***

### canDropStorage()? \{#candropstorage\}

```ts
canDropStorage?(): boolean;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:811](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L811)

Whether, under the current configuration, [dropStorage](#dropstorage) can drop this database (asked once before the read-only checkout creates the snapshot database, US-313).

#### Returns

`boolean`

When `false`, `dropStorage()` is guaranteed to refuse

#### Remarks

Only looks at the configuration, never touches storage. Before creating the snapshot there is no other way to know: trying by deleting first would delete
a database whose identity has not been verified — when the snapshot factory is misconfigured and points at the main database's storage, that would be the main database.
And a snapshot database that can be created but not dropped throws on close, and errors on every subsequent reclamation.

***

### checkEntityConstraints()? \{#checkentityconstraints\}

```ts
checkEntityConstraints?(EntityTypes): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:734](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L734)

Read-only drift check: throws
[RxDBConstraintDriftError](RxDBConstraintDriftError.md) when the storage constraints declared by entity metadata do not match the actual constraints in the database, listing the missing and extra constraint names (US-030 AC#10).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityTypes` | [`EntityType`](../type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Called at the same point as [RxDBAdapterLocalBase.reconcileEntityIndexes](#reconcileentityindexes) (after user migrations and
missing-table backfill), but **read-only, no automatic backfill** — backfill is written by the user into `migrations`.
The comparison only includes the three kinds: `ck_` CHECK, `uq_` conditional unique indexes, `ex_` range exclusions.

Absence is a contract-permitted form (consistent with `reconcileEntityIndexes`); but when an entity declares
`checks` / conditional unique `where` / `exclusions` and the adapter lacks this method, `connect()` reports
unsupported per US-030 AC#6, with no silent degradation.

***

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
`createTables()` skip the gate inside the bootstrap window — that gate waits on the not-yet-settled `RxDB.connect()`.
This method flips the state to `ready`, after which all entrances go through the normal readiness wait.
Adapters without a readiness gate keep the default no-op implementation.

***

### createTables() \{#createtables\}

```ts
abstract createTables(EntityTypes, entities?): Promise<boolean>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:716](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L716)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityTypes` | [`EntityType`](../type-aliases/EntityType.md)[] |
| `entities?` | `any`[] |

#### Returns

`Promise`&lt;`boolean`&gt;

***

### createWorktreeTableSet()? \{#createworktreetableset\}

```ts
createWorktreeTableSet?(
   executor, 
   tableSet, 
   seed
): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:825](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L825)

Creates and seeds a writable checkout's table set inside the caller's transaction (US-314 B1.5).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../interfaces/TransactionExecutor.md) | The executor of one transaction on the main database; table creation, copying, increments and trigger mounting all happen in this transaction, and the opening flow writes the hold key in the same one |
| `tableSet` | [`WorktreeTableSet`](WorktreeTableSet.md) | The table set to create, must not be the main table set; its members must keep change logs |
| `seed` | [`WorktreeTableSetSeed`](../interfaces/WorktreeTableSetSeed.md) | The held branch and the increments to apply on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Rows of the main table set are copied as-is (storage form, not decrypted), auto-increment sequences are aligned, increments are applied —
none of it writes the change log or dispatches events; finally the member tables' change triggers are mounted onto the held branch.
An optional capability slot like [RxDBAdapterLocalBase.readWorktreeSnapshotPage](#readworktreesnapshotpage):
when absent, the working tree plugin reports unsupported when opening a writable checkout.

***

### deleteByIds() \{#deletebyids\}

```ts
abstract deleteByIds(entityName, ids): Observable<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:928](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L928)

Bulk deletion by ID list (QueryCache only)

Used to clean up data already deleted remotely from the local cache.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | Entity name |
| `ids` | `string`[] | The ID list to delete |

#### Returns

`Observable`&lt;`void`&gt;

`Observable<void>`

#### Example

```typescript
adapter.deleteByIds('Product', ['p1', 'p2']).subscribe();
```

***

### dropStorage()? \{#dropstorage\}

```ts
dropStorage?(): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:800](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L800)

Permanently deletes this adapter's persistent storage for the database (the read-only checkout recycles the snapshot database, US-313).

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

Throws while this adapter is still connected: disconnect first, then delete

#### Remarks

The storage location is derived the same way as at connect time (`rxdb.config.dbName` plus adapter options); nothing happens when the database does not exist.
In-memory databases are gone once disconnected, so this is also a no-op here. What is deleted cannot be recovered: the caller must first confirm no other context is still using this database.

***

### dropWorktreeTableSet()? \{#dropworktreetableset\}

```ts
dropWorktreeTableSet?(executor, tableSet): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:840](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L840)

Deletes a writable checkout's table set inside the caller's transaction (US-314 B1.5).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../interfaces/TransactionExecutor.md) | The executor of one transaction on the main database; the closing flow releases the hold key and deletes the registration row in the same one |
| `tableSet` | [`WorktreeTableSet`](WorktreeTableSet.md) | The table set to delete, must not be the main table set |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Finds this table set by the database's catalog; half-built ones and those whose members were already removed from the configuration are deleted too, re-entrantly;
cascading deletes caused by dropping tables are not recorded in the change log.

***

### getMetadataByIds() \{#getmetadatabyids\}

```ts
abstract getMetadataByIds(entityName, ids): Observable<Map<string, string>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:896](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L896)

Gets the metadata of a given ID list (QueryCache only)

Used for local cache freshness checks, returns an ID → updatedAt map.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | Entity name |
| `ids` | `string`[] | The entity ID list |

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

***

### getRepository() \{#getrepository\}

```ts
abstract getRepository<T, RT>(EntityType): RT;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:382](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L382)

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | - |
| <a id="type-parameter-rt"></a> `RT` *extends* [`IRepository`](../interfaces/IRepository.md)&lt;`T`&gt; | [`IRepository`](../interfaces/IRepository.md)&lt;`T`&gt; |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityType` | `T` |

#### Returns

`RT`

#### Inherited from

[`RxDBAdapterBase`](RxDBAdapterBase.md).[`getRepository`](RxDBAdapterBase.md#getrepository)

***

### getRxDBChangeSequence() \{#getrxdbchangesequence\}

```ts
abstract getRxDBChangeSequence(): Promise<number>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:857](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L857)

#### Returns

`Promise`&lt;`number`&gt;

***

### importWorktreeSnapshot()? \{#importworktreesnapshot\}

```ts
importWorktreeSnapshot?(snapshot): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:766](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L766)

Writes the rows read from the main database and the increments into this adapter's database (the read-only checkout creates the snapshot, US-313).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `snapshot` | [`WorktreeSnapshotImport`](../interfaces/WorktreeSnapshotImport.md) | The tables to copy and the increments applied on top |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

One transaction: first insert each table's rows as-is, then apply the increments. Neither decrypted nor encrypted; values of encrypted columns must already be envelopes,
plaintext throws outright; no events dispatched, nothing enters the entity cache. Rejected on databases with the capture runtime installed: snapshot writes cannot enter the trusted write matrix.

***

### isEncryptedAtRest()? \{#isencryptedatrest\}

```ts
isEncryptedAtRest?(value): boolean;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:535](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L535)

Determines whether a stored value is already in the "encrypted at-rest form" (FR-038).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value in the stored column; the caller guarantees it is neither `null` nor `undefined` |

#### Returns

`boolean`

`true` when it is the encrypted stored form

#### Remarks

**Absence is a contract-permitted form**, the same convention as [RxDBAdapterLocalBase.reconcileEntityIndexes](#reconcileentityindexes):
adapters without column encryption support do not implement it. Absence does **not mean allow-through** — when the caller (the commit write path) cannot get
a judger but does have encrypted columns to judge, it fails closed and throws instead of skipping the check.

Declared here with the implementation left to adapters because the authoritative judger is `isEnvelope` of `@aiao/rxdb-adapter-encrypted`,
and `@aiao/rxdb` **cannot** depend on it: the latter peer-depends on the former, the dependency direction is reversed.
For an encrypted `PropertyType.string` column both plaintext and ciphertext are strings; the core guessing the shape itself means installing
a guard that can be fooled.

An "optional capability slot" like [RxDBAdapterLocalBase.setWorkingTreeCaptureHook](#setworkingtreecapturehook): the core
only declares the position and the semantics, and does not decide for the six backends whether they have it.

***

### isTableExisted() \{#istableexisted\}

```ts
abstract isTableExisted(EntityType): Promise<boolean>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:586](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L586)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityType` | [`EntityType`](../type-aliases/EntityType.md) |

#### Returns

`Promise`&lt;`boolean`&gt;

***

### listWorktreeTableSetSuffixes()? \{#listworktreetablesetsuffixes\}

```ts
listWorktreeTableSetSuffixes?(executor): Promise<readonly string[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:853](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L853)

Lists the existing writable checkout table sets by the database's catalog (US-314 B2.6).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../interfaces/TransactionExecutor.md) | The caller's transaction |

#### Returns

`Promise`&lt;readonly `string`[]&gt;

Table set suffixes (the [WorktreeTableSet.isSuffix](WorktreeTableSet.md#issuffix) shape), sorted and deduplicated

#### Remarks

Orphan reclamation must know which table sets still exist, including those whose registration rows are already gone, so it looks by catalog rather than by the registration table.
The physical name shape belongs to the adapter (the SQLite family recognizes the table name ending,
PGlite recognizes the schema name ending); when a configured entity's main table happens to look like a suffix, it does not count — deleting it would delete the main table.
An optional capability slot of the writable checkout like [RxDBAdapterLocalBase.createWorktreeTableSet](#createworktreetableset).

***

### mergeChanges() \{#mergechanges\}

```ts
abstract mergeChanges(
   actions, 
   localChanges?, 
   disableTriggers?
): Promise<number | void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:873](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L873)

Applies the compacted changes to the local entity tables

Implementation strategy (SQLite):
1. Convert actions to SQL operations
2. Inside a transaction:
   a) Execute the SQL operations on entity tables (INSERT/UPDATE/DELETE)
   b) Bulk-insert localChanges into the RxDBChange table (for history tracking)
3. Send local events to notify the UI to update

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `actions` | [`SwitchVersionActions`](../interfaces/SwitchVersionActions.md) | The compacted change operation set (pulled from the remote) |
| `localChanges?` | `Omit`&lt;[`RxDBChange`](RxDBChange.md), `"id"`&gt;[] | The records to save into the local RxDBChange table (optional) |
| `disableTriggers?` | `boolean` | Whether to disable triggers (used for pull and similar operations, to avoid creating RxDBChange) |

#### Returns

`Promise`&lt;`number` \| `void`&gt;

***

### migrateSystemSchema() \{#migratesystemschema\}

```ts
migrateSystemSchema(): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:582](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L582)

Upgrades the tables owned by RxDB before applying migrations or running repositories.
Adapters that do not need to persist system schema state keep the default no-op implementation.

#### Returns

`Promise`&lt;`void`&gt;

***

### physicalTableNames() \{#physicaltablenames\}

```ts
physicalTableNames(metadata): readonly string[];
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:574](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L574)

All names an entity table can be written as in the SQL this adapter emits.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | Entity metadata; the answer is decided by it alone, no instance state is read |

#### Returns

readonly `string`[]

Unnormalized physical table names without schema qualification; at least one

#### Remarks

**The naming rule belongs to the side that writes the table.** Before this capability,
`@aiao/rxdb-plugin-working-tree`'s versioned domain re-assembled the sqlite family's folding rule by `'$'` itself.
A copied rule does not error when the original changes, it just starts computing wrong — and the consequence of computing wrong is one-directional:
the raw write gate fails to recognize a version-controlled table and **silently lets through** a write that bypasses capture.

The default implementation hands out the logical name and guesses nothing. Guessing a "common" form for a backend (e.g. making the sqlite family's
`namespace$table` the default) just moves the rule-copying from the plugin to the core, and no backend would ever be caught forgetting
to override — it would keep computing its table names with someone else's rule.

**Has a default implementation rather than being `abstract`**, the same convention as [RxDBAdapterLocalBase.migrateSystemSchema](#migratesystemschema):
this is an extension to an existing base class, and `abstract` would make every self-built adapter outside the repo fail to compile on upgrade,
while **the ones that do not fold namespaces are already correct**. The cost is that "forgot to override" and
"truly does not need it" are identical in type; backends that fold namespaces (the sqlite family) must override themselves.

Carries no schema qualification: a form like `"public"."post"` has already been reduced back to
the logical name during the qualification-stripping step of the raw judgment, and registering it again here would just be a second spelling of the same name.
What must be registered is the kind that **cannot be stripped**.

***

### readWorktreeSnapshotPage()? \{#readworktreesnapshotpage\}

```ts
readWorktreeSnapshotPage?(
   executor, 
   EntityType, 
   after, 
   limit
): Promise<WorktreeSnapshotPage>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:750](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L750)

Reads one page of an entity table in storage form (the read-only checkout creates the snapshot, US-313).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../interfaces/TransactionExecutor.md) | The executor of one transaction on the main database; all pages of one snapshot are read from the same transaction and are mutually consistent |
| `EntityType` | [`EntityType`](../type-aliases/EntityType.md) | The entity class on the main instance |
| `after` | \| [`WorktreeSnapshotCursor`](../type-aliases/WorktreeSnapshotCursor.md) \| `null` | The previous page's [WorktreeSnapshotPage.next](../interfaces/WorktreeSnapshotPage.md#next); `null` reads from the beginning |
| `limit` | `number` | The maximum number of rows on this page |

#### Returns

`Promise`&lt;[`WorktreeSnapshotPage`](../interfaces/WorktreeSnapshotPage.md)&gt;

A page of rows in storage form; encrypted columns stay as envelopes, not decrypted

#### Remarks

Paired with [RxDBAdapterLocalBase.importWorktreeSnapshot](#importworktreesnapshot): rows in a page are only recognized by the same kind of adapter.
An optional capability slot like [RxDBAdapterLocalBase.isEncryptedAtRest](#isencryptedatrest): absence is a contract-permitted form,
and the working tree plugin reports unsupported when opening a checkout on such a backend.

***

### reconcileEntityIndexes()? \{#reconcileentityindexes\}

```ts
reconcileEntityIndexes?(EntityTypes): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:719](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L719)

Idempotently converges entity indexes after user migrations and missing-table backfill.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityTypes` | [`EntityType`](../type-aliases/EntityType.md)[] |

#### Returns

`Promise`&lt;`void`&gt;

***

### repository() \{#repository\}

```ts
protected repository<RT>(repositoryName, RepositoryClass): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:384](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L384)

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-rt-1"></a> `RT` *extends* [`RepositoryInstance`](../interfaces/RepositoryInstance.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt; |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `repositoryName` | `string` |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterLocalBase`, `RT`&gt; |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterBase`](RxDBAdapterBase.md).[`repository`](RxDBAdapterBase.md#repository)

***

### runInTransaction() \{#runintransaction\}

```ts
runInTransaction<T>(fun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:697](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L697)

Opens a new transaction, **or** reuses the one the caller is already in.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` *extends* [`TransactionFun`](../type-aliases/TransactionFun.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fun` | `T` | The transaction work, parameterized by this transaction's executor |
| `transactionLog?` | `boolean` | Whether to write the transaction log |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

`fun`'s return value

#### Remarks

The difference from [transaction](#transaction) is not in this method body but in who `this` is: on a real adapter the two are synonymous,
both opening a new queued transaction; while a caller inside a transaction holds the executor facade, and the facade special-cases this method into
`executor.run()` — reusing the current transaction and **never re-queueing**. The SQLite family's and PGlite's respective overrides only
add disconnect / read-only assertions before this line, semantically identical to here.

The capture runtime needs an executor to write working tree rows, and only the calling host knows whether to open or reuse.
Calling `transaction()` directly would make the in-transaction half of calls queue for a slot occupied by themselves — manifesting as
a permanent hang rather than an error.

***

### sealWorktreeReadOnly()? \{#sealworktreereadonly\}

```ts
sealWorktreeReadOnly?(): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:789](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L789)

Seals this adapter's database read-only (read-only checkout, US-313): subsequent write statements are rejected at the engine level.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Catches writes that bypass the core write entrances and hit the adapter directly. The SQLite family uses `PRAGMA query_only`, PGlite uses read-only transactions.

The seal is state on the connection (per transaction on PGlite); session settings that could change it on the raw entrance are rejected by the read-only hook;
statements issued through the executor (`adapter.transaction(executor => executor.query(…))`) are the adapter's own channel,
the seal itself is applied from here, so it cannot stop itself from being lifted here — the read-only checkout guards against accidental writes, not code that deliberately changes connection settings.

***

### settleRepositoryTransaction() \{#settlerepositorytransaction\}

```ts
protected settleRepositoryTransaction(executor, committed): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:931](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L931)

Commits or rolls back the entity state of public repositories; must be called before handing the transaction queue back.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `executor` | [`TransactionExecutor`](../interfaces/TransactionExecutor.md) |
| `committed` | `boolean` |

#### Returns

`void`

***

### setWorkingTreeCaptureHook() \{#setworkingtreecapturehook\}

```ts
setWorkingTreeCaptureHook(hook): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:501](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L501)

**`Internal`**

Installs or uninstalls the capture runtime (the four mount points of adapter-contract.md §1).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `hook` | \| [`WorkingTreeCaptureHook`](../interfaces/WorkingTreeCaptureHook.md) \| `undefined` | The runtime that takes over the four mount points; `undefined` uninstalls |

#### Returns

`void`

#### Remarks

The mounting lives **here** instead of each of the six adapters inserting a line into its own `transaction()`: a missed write
or a late write (validating the token only after the business write) would be discoverable by nothing — and that is exactly
the form §2 "only one copy of the judgment implementation" exists to rule out.

The callers are `RxDB.connect()` (after confirming the capability bit is true) and `workingTree.enable()` (after the flip succeeds).
Databases without the capability enabled are never called once, so the four write primitives have not even one layer of forwarding.

Idempotent: if already installed, it uninstalls first and then installs, never stacking two layers.

***

### switchBranch() \{#switchbranch\}

```ts
abstract switchBranch(options): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:855](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L855)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`SwitchBranchOptions`](../interfaces/SwitchBranchOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;

***

### transaction() \{#transaction\}

#### Call Signature

```ts
abstract transaction<T>(fun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:620](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L620)

Reads and writes in the same transaction through the executor.

##### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-3"></a> `T` *extends* [`TransactionFun`](../type-aliases/TransactionFun.md) |

##### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fun` | `T` | The callback holding this transaction's executor |
| `transactionLog?` | `boolean` | Whether to record the transaction log |

##### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;

The callback result

##### Remarks

`entity.save()` without holding the executor re-queues. Awaiting it inside the transaction callback waits on itself and the transaction cannot end.
Use [TransactionExecutor.getRepository](../interfaces/TransactionExecutor.md#getrepository) inside transactions; see [EntityBase.save](EntityBase.md#save) for the entity instance save entrance.

##### Examples

```ts
// ✅ get the repository through the executor; all reads and writes belong to this transaction.
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
// ❌ the entity instance holds no executor; save() re-queues and then waits for the current transaction to end.
await adapter.transaction(async () => {
  await entity.save();
});
```

#### Call Signature

```ts
abstract transaction(fun, transactionLog?): Promise<unknown>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:653](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L653)

Reads and writes in the same transaction through the executor.

##### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fun` | [`TransactionFun`](../type-aliases/TransactionFun.md) | The callback holding this transaction's executor |
| `transactionLog?` | `boolean` | Whether to record the transaction log |

##### Returns

`Promise`&lt;`unknown`&gt;

The callback result

##### Remarks

`entity.save()` without holding the executor re-queues. Awaiting it inside the transaction callback waits on itself and the transaction cannot end.
Use [TransactionExecutor.getRepository](../interfaces/TransactionExecutor.md#getrepository) inside transactions; see [EntityBase.save](EntityBase.md#save) for the entity instance save entrance.

##### Examples

```ts
// ✅ get the repository through the executor; all reads and writes belong to this transaction.
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
// ❌ the entity instance holds no executor; save() re-queues and then waits for the current transaction to end.
await adapter.transaction(async () => {
  await entity.save();
});
```

***

### transactionalRepository() \{#transactionalrepository\}

```ts
protected transactionalRepository<T, R>(EntityType, repository): R;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:936](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L936)

Puts the whole operation of a public repository into a transaction; not called when the executor creates a repository.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-4"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |
| <a id="type-parameter-r"></a> `R` *extends* `object` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityType` | `T` |
| `repository` | `R` |

#### Returns

`R`

***

### upsertMany() \{#upsertmany\}

```ts
abstract upsertMany<T>(entityName, data): Observable<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:912](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L912)

Bulk upsert of data (QueryCache only)

Executes INSERT OR REPLACE semantics, used to cache remotely pulled data.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-5"></a> `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | Entity name |
| `data` | `T`[] | The data list to write |

#### Returns

`Observable`&lt;`void`&gt;

`Observable<void>`

#### Example

```typescript
adapter.upsertMany('Product', [product1, product2]).subscribe();
```

***

### worktreeTableSetMounted() \{#worktreetablesetmounted\}

```ts
worktreeTableSetMounted(): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:546](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L546)

**`Internal`**

Called after this instance re-mounts its table set (US-314 B1.4): clears this adapter's caches keyed by physical tables. Nothing to do by default.

#### Returns

`void`

#### Remarks

Called by [RxDB.mountWorktreeTableSet](RxDB.md#mountworktreetableset) inside the re-mount transaction. The SQLite family's row-number caches are keyed by physical tables; after swapping table sets,
the same row number points at a different row.
